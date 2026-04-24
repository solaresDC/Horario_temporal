# Build Instructions for Claude Code

You are autonomously building a PWA from `weekly_schedule_v9.html`. Follow this document end-to-end without asking questions unless explicitly told to PAUSE.

## What you're building

A single-user weekly schedule PWA. Frontend hosted on Cloudflare Pages. Backend is a Cloudflare Worker that writes to a Cloudflare D1 database. Three tables, no auth, no users — the Worker URL stays private.

## Rules of engagement

- **Do every step in order.** One commit per numbered step.
- **Don't add features that aren't listed.** No auth, no user accounts, no multi-device sync, no drag-to-edit blocks, no notifications, no exports. These are out of scope.
- **PAUSE markers are mandatory.** When you hit a step labeled `⏸ PAUSE`, do nothing further until the user has completed the action and pasted the requested output back.
- **Verify after every step.** Each step has a verification block. Run it. If it fails, fix it before moving on.
- **Don't ask for permission to write files.** Just write them.
- **Don't re-explain Wrangler, Workers, D1, or PWA basics.** The user knows what they are.

## Source material

`weekly_schedule_v9.html` is in the project root. It's the working app — split it apart, don't rewrite it. Preserve all existing behavior: the GCal-clean theme, dark mode, click-to-expand, Notes panel, Topics modal with grouped categories, Versions modal with v7/v7b/v8.

The current persistence layer uses `window.storage.get/set('schedule:*')` — an Anthropic-environment shim. Your job in Step 6 is to replace those calls with `window.api.*` calls that hit the real Worker.

---

# STEP 0 — Initialize repo

Create at the project root:

**`.gitignore`**
```
node_modules/
.wrangler/
.DS_Store
*.log
.env
.env.local
dist/
```

**`README.md`** — short project overview pointing to this instructions file.

**`package.json`** at root (just metadata, no deps):
```json
{
  "name": "weekly-schedule-pwa",
  "version": "0.1.0",
  "private": true,
  "description": "Personal weekly schedule PWA"
}
```

`git init`, `git add .`, `git commit -m "init"`.

⏸ **PAUSE 0** — Tell the user: "Repo initialized. Please create a GitHub repo, push this to it, and confirm. Once confirmed I'll proceed to Step 1."

---

# STEP 1 — Split the monolith

Take `weekly_schedule_v9.html` and produce three files in `public/`:

- `public/index.html` — the HTML body, with `<link rel="stylesheet" href="/styles.css">` in head and `<script defer src="/app.js"></script>` before `</body>`. Strip the inline `<style>` and `<script>` tags' contents into the files below.
- `public/styles.css` — everything that was inside `<style>...</style>`
- `public/app.js` — everything that was inside `<script>...</script>`

**Do not change behavior.** No logic edits, no refactoring. Pure extraction.

After splitting, you can move/delete the original `weekly_schedule_v9.html` from the root (it's preserved in git history).

**Verify:**
```bash
# Open public/index.html in a browser (or use a local server)
npx serve public -p 8080
# Visit http://localhost:8080
```
The app must look and behave identically to the original. Click a block — it expands. Open Notes, Topics, Versions. Toggle theme. If anything is broken, fix it before continuing.

Commit: `step 1: split monolith into public/{index.html, styles.css, app.js}`

---

# STEP 2 — D1 schema file

Create `worker/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS weeks (
  week_id TEXT PRIMARY KEY,
  active_version TEXT NOT NULL DEFAULT 'v7',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  week_id TEXT NOT NULL,
  text TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_week ON notes(week_id);

CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  category_key TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_topics_cat ON topics(category_key);
```

Commit: `step 2: D1 schema`.

⏸ **PAUSE 1** — Output exactly this for the user:

> Run these two commands and paste the output of the second one back to me:
>
> ```
> wrangler d1 create weekly-schedule-db
> wrangler d1 execute weekly-schedule-db --file=./worker/schema.sql --remote
> ```
>
> The first command prints a `database_id` — paste that too.

When the user confirms with the database_id, save it; you'll use it in Step 3.

---

# STEP 3 — Worker scaffolding

In `worker/`:

```bash
cd worker
npm init -y
npm install hono
npm install -D typescript @cloudflare/workers-types wrangler
```

Create `worker/wrangler.toml`:
```toml
name = "weekly-schedule-api"
main = "src/index.ts"
compatibility_date = "2025-01-01"

[[d1_databases]]
binding = "DB"
database_name = "weekly-schedule-db"
database_id = "PASTE_THE_DATABASE_ID_FROM_PAUSE_1"

[vars]
ALLOWED_ORIGIN = "http://localhost:8080"
# Update ALLOWED_ORIGIN to the *.pages.dev URL after Pages deploys (Step 9).
```

Create `worker/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  }
}
```

Create `worker/src/index.ts`:

```ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Env = { DB: D1Database; ALLOWED_ORIGIN: string };

const app = new Hono<{ Bindings: Env }>();

// CORS — only allow the configured origin
app.use('*', async (c, next) => {
  const middleware = cors({ origin: c.env.ALLOWED_ORIGIN, allowMethods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'] });
  return middleware(c, next);
});

const MAX_TEXT = 5000;
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
const now = () => Date.now();

// ---- WEEKS ----
app.get('/api/week/:weekId', async (c) => {
  const weekId = c.req.param('weekId');
  const week = await c.env.DB.prepare('SELECT active_version FROM weeks WHERE week_id = ?').bind(weekId).first<{ active_version: string }>();
  const notes = await c.env.DB.prepare('SELECT id, text, pinned, created_at, updated_at FROM notes WHERE week_id = ? ORDER BY pinned DESC, created_at DESC').bind(weekId).all();
  return c.json({
    activeVersion: week?.active_version ?? 'v7',
    notes: (notes.results ?? []).map((n: any) => ({ ...n, pinned: !!n.pinned }))
  });
});

app.put('/api/week/:weekId/version', async (c) => {
  const weekId = c.req.param('weekId');
  const { version } = await c.req.json<{ version: string }>();
  if (!['v7','v7b','v8'].includes(version)) return c.json({ error: 'bad version' }, 400);
  await c.env.DB.prepare(
    'INSERT INTO weeks (week_id, active_version, updated_at) VALUES (?, ?, ?) ON CONFLICT(week_id) DO UPDATE SET active_version=excluded.active_version, updated_at=excluded.updated_at'
  ).bind(weekId, version, now()).run();
  return c.json({ ok: true });
});

// ---- NOTES ----
app.post('/api/week/:weekId/notes', async (c) => {
  const weekId = c.req.param('weekId');
  const { text } = await c.req.json<{ text: string }>();
  if (!text || text.length > MAX_TEXT) return c.json({ error: 'bad text' }, 400);
  const id = newId('n'), t = now();
  await c.env.DB.prepare('INSERT INTO notes (id, week_id, text, pinned, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)')
    .bind(id, weekId, text, t, t).run();
  return c.json({ id, week_id: weekId, text, pinned: false, created_at: t, updated_at: t });
});

app.patch('/api/notes/:id', async (c) => {
  const id = c.req.param('id');
  const patch = await c.req.json<{ text?: string; pinned?: boolean }>();
  const sets: string[] = []; const vals: any[] = [];
  if (typeof patch.text === 'string') {
    if (patch.text.length > MAX_TEXT) return c.json({ error: 'bad text' }, 400);
    sets.push('text = ?'); vals.push(patch.text);
  }
  if (typeof patch.pinned === 'boolean') { sets.push('pinned = ?'); vals.push(patch.pinned ? 1 : 0); }
  if (!sets.length) return c.json({ error: 'nothing to update' }, 400);
  sets.push('updated_at = ?'); vals.push(now());
  vals.push(id);
  await c.env.DB.prepare(`UPDATE notes SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

app.delete('/api/notes/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(c.req.param('id')).run();
  return c.body(null, 204);
});

// ---- TOPICS ----
app.get('/api/topics', async (c) => {
  const rows = await c.env.DB.prepare('SELECT id, category_key, text, created_at FROM topics ORDER BY created_at ASC').all();
  const grouped: Record<string, any[]> = {};
  for (const r of (rows.results ?? []) as any[]) {
    (grouped[r.category_key] ||= []).push({ id: r.id, text: r.text, created_at: r.created_at });
  }
  return c.json(grouped);
});

app.post('/api/topics', async (c) => {
  const { category_key, text } = await c.req.json<{ category_key: string; text: string }>();
  if (!category_key || !text || text.length > MAX_TEXT) return c.json({ error: 'bad input' }, 400);
  const id = newId('tp'), t = now();
  await c.env.DB.prepare('INSERT INTO topics (id, category_key, text, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, category_key, text, t).run();
  return c.json({ id, category_key, text, created_at: t });
});

app.delete('/api/topics/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM topics WHERE id = ?').bind(c.req.param('id')).run();
  return c.body(null, 204);
});

export default app;
```

Update `worker/package.json` scripts block:
```json
"scripts": {
  "dev": "wrangler dev",
  "deploy": "wrangler deploy"
}
```

**Verify locally:**
```bash
cd worker && npm run dev
# In another terminal:
curl http://localhost:8787/api/week/2026-04-13
# Expected: {"activeVersion":"v7","notes":[]}
```

If you get that JSON, the Worker is working against your real D1 database (Wrangler runs the local dev server with `--remote` D1 by default in modern versions; if not, append `--remote` to the dev command).

Commit: `step 3: worker API with hono + d1`.

⏸ **PAUSE 2** — Tell the user:

> Run `cd worker && npm run deploy` and paste the deployed Worker URL back to me. It will look like `https://weekly-schedule-api.<your-account>.workers.dev`.

Save that URL for Step 4.

---

# STEP 4 — Frontend API client

Create `public/api-client.js`:

```js
const API_BASE = 'PASTE_THE_WORKER_URL_FROM_PAUSE_2';

async function api(path, opts = {}) {
  const res = await fetch(API_BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  if (res.status === 204) return null;
  return res.json();
}

window.api = {
  getWeek:     (weekId)            => api(`/api/week/${weekId}`),
  setVersion:  (weekId, version)   => api(`/api/week/${weekId}/version`, { method:'PUT',    body: JSON.stringify({ version }) }),
  addNote:     (weekId, text)      => api(`/api/week/${weekId}/notes`,    { method:'POST',   body: JSON.stringify({ text }) }),
  updateNote:  (id, patch)         => api(`/api/notes/${id}`,             { method:'PATCH',  body: JSON.stringify(patch) }),
  deleteNote:  (id)                => api(`/api/notes/${id}`,             { method:'DELETE' }),
  getTopics:   ()                  => api('/api/topics'),
  addTopic:    (categoryKey, text) => api('/api/topics',                  { method:'POST',   body: JSON.stringify({ category_key: categoryKey, text }) }),
  deleteTopic: (id)                => api(`/api/topics/${id}`,            { method:'DELETE' })
};
```

Wire it into `public/index.html` head — load **before** `app.js`:
```html
<script defer src="/api-client.js"></script>
<script defer src="/app.js"></script>
```

Commit: `step 4: api-client.js wrapper`.

---

# STEP 5 — Wire `app.js` to the API

Find every `window.storage` call in `public/app.js` and replace per this table:

| Old call | New behavior |
|---|---|
| `window.storage.get('schedule:notes')` | Notes now come from `(await window.api.getWeek(currentWeekId)).notes` |
| `window.storage.set('schedule:notes', JSON.stringify(...))` | Replace with individual `window.api.addNote / updateNote / deleteNote` calls at the right mutation sites |
| `window.storage.get('schedule:topics')` | `await window.api.getTopics()` (returns `{ category_key: [...] }`) |
| `window.storage.set('schedule:topics', JSON.stringify(...))` | Replace with `window.api.addTopic` / `deleteTopic` at the right mutation sites |
| `window.storage.get('schedule:activeVersion')` | `(await window.api.getWeek(currentWeekId)).activeVersion` |
| `window.storage.set('schedule:activeVersion', key)` | `await window.api.setVersion(currentWeekId, key)` |
| `window.storage.get('schedule:theme')` | `localStorage.getItem('schedule:theme')` |
| `window.storage.set('schedule:theme', t)` | `localStorage.setItem('schedule:theme', t)` |

Important shape changes:
- Notes used to be one JSON blob in storage. Now they're individual rows. `notesData` should still be an in-memory array, but every mutation triggers a single API call.
- Topics: `topicsData` stays as `{ category_key: [...] }` in memory; same — individual API calls per mutation.
- Drop the seed-data block that pre-fills "biz_action" with Onigiri/Santiago/Freelance/Water topics. Real data goes through the real API. (Or keep it but make it a one-time `POST` if no topics exist after first load.)
- Add a `currentWeekId` variable (Step 6 will compute it). For Step 5, just hardcode `currentWeekId = '2026-04-13'` so you can verify wiring before adding navigation.

**Verify after wiring:**
1. Run the local Pages preview: `npx serve public -p 8080`
2. Open `http://localhost:8080` (or whatever your CORS allows)
3. In DevTools console, no errors.
4. Add a note → reload → still there.
5. Add a topic → reload → still there.
6. Switch versions → reload → still on the chosen one.
7. Verify in D1 directly:
   ```bash
   wrangler d1 execute weekly-schedule-db --remote --command="SELECT * FROM notes"
   ```

If any of those fail, fix before moving on.

Commit: `step 5: app.js uses window.api instead of window.storage`.

---

# STEP 6 — Week navigation

Add helpers to top of `app.js`:
```js
function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function isoDate(d) { return d.toISOString().slice(0, 10); }
function shiftWeek(weekId, deltaWeeks) {
  const d = new Date(weekId + 'T00:00:00');
  d.setDate(d.getDate() + deltaWeeks * 7);
  return isoDate(d);
}
function formatWeekLabel(weekId) {
  const monday = new Date(weekId + 'T00:00:00');
  const friday = new Date(monday); friday.setDate(monday.getDate() + 4);
  const opts = { month: 'short', day: 'numeric' };
  const year = friday.getFullYear();
  return `Week of ${monday.toLocaleDateString('en-US', opts)} – ${friday.toLocaleDateString('en-US', opts)}, ${year}`;
}
```

Replace the hardcoded date logic:
- `currentWeekId` — initialize to `isoDate(mondayOf(new Date()))`
- `DAY_DATES` — compute from `currentWeekId` (date strings for Mon..Fri of that week)
- `TODAY_INDEX` — compute as: index of today's date within the visible week, **only if** `currentWeekId === isoDate(mondayOf(new Date()))`. Otherwise set to `-1` so no day pill highlights.
- `.week-label` — set with `formatWeekLabel(currentWeekId)` on every render

Add three buttons to the topbar, **left of** the existing Versions button. Use chevron-left, "Today", and chevron-right. Style them with the existing `.btn` class. Wire:
- Prev → `currentWeekId = shiftWeek(currentWeekId, -1); await loadWeekAndRender()`
- Today → `currentWeekId = isoDate(mondayOf(new Date())); await loadWeekAndRender()`
- Next → `currentWeekId = shiftWeek(currentWeekId, +1); await loadWeekAndRender()`

Create a `loadWeekAndRender()` function that:
1. Calls `await window.api.getWeek(currentWeekId)`
2. Sets `activeVersion = result.activeVersion`
3. Sets `notesData = result.notes`
4. Re-renders calendar, stats, day headers, week label, notes panel (if open)

Call `loadWeekAndRender()` once at startup instead of the existing static init.

**Verify:**
- App loads on current week
- Click Next → calendar dates advance → notes panel is empty (week-scoped)
- Add a note → click Prev to return → original week's notes still there
- Click Today → returns to actual current week, today-pill reappears
- Topics persist across week navigation (they're global)

Commit: `step 6: week-by-week navigation`.

---

# STEP 7 — PWA shell

Create `public/manifest.json`:
```json
{
  "name": "Weekly Schedule",
  "short_name": "Schedule",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1a73e8",
  "orientation": "portrait",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Create `public/sw.js`:
```js
const CACHE = 'schedule-v1';
const APP_SHELL = ['/', '/index.html', '/app.js', '/styles.css', '/api-client.js', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP_SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // never cache cross-origin (the API)
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
```

In `public/index.html` head:
```html
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#1a73e8">
<link rel="apple-touch-icon" href="/icons/icon-192.png">
```

At end of body:
```html
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
  }
</script>
```

For icons: generate three placeholder PNGs procedurally if no source image is available. Use a 1024x1024 source with a calendar glyph and the project's accent color (#1a73e8). Output 192, 512, and a 512 maskable (10% padding inside a safe zone). Save to `public/icons/`.

If the user can't provide a source image, generate a simple solid-color square PNG with a white "S" centered in it. Don't block on icons — they can be replaced anytime.

Commit: `step 7: PWA manifest + service worker`.

---

# STEP 8 — Deploy and finalize

⏸ **PAUSE 3** — Tell the user:

> 1. Push the repo to GitHub.
> 2. In Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → pick this repo. Build output directory = `public/`. No build command. Save.
> 3. After it deploys, paste the assigned `*.pages.dev` URL back to me.

When the URL arrives:

1. Update `worker/wrangler.toml` `ALLOWED_ORIGIN` to the Pages URL.
2. Run `cd worker && npm run deploy` (instruct the user; they need to run it).

⏸ **PAUSE 4** — Confirm Worker redeployed with the new ALLOWED_ORIGIN.

Then:

3. Update `public/api-client.js` `API_BASE` to the deployed Worker URL (already done in Step 4, but double-check).
4. Commit + push: `step 8: production CORS + final API base`.
5. Pages auto-redeploys on push.

---

# STEP 9 — Verification checklist

Tell the user to run through this checklist on the live site (and once on phone):

1. App loads cold on the deployed URL. Schedule renders.
2. Click a block → smoothly expands.
3. Click Versions → switch to v8 → reload → still on v8.
4. Add a note → reload → still there.
5. Pin a note → reload → still pinned, still on top.
6. Delete a note → reload → still gone.
7. Add a topic to "Personal Biz — Action" → reload → still there.
8. Click Next Week → dates shift forward → notes panel empty (week-scoped) → topics still populated (global).
9. Click Prev Week back → original notes return.
10. Today pill only shows when viewing the actual current calendar week.
11. Toggle theme → reload → still in the toggled theme.
12. On phone: install to home screen, open from home → standalone (no browser chrome).
13. Toggle airplane mode → reload from home screen → app shell loads from cache.

Verify the database from CLI:
```bash
wrangler d1 execute weekly-schedule-db --remote --command="SELECT COUNT(*) AS notes FROM notes"
wrangler d1 execute weekly-schedule-db --remote --command="SELECT COUNT(*) AS topics FROM topics"
wrangler d1 execute weekly-schedule-db --remote --command="SELECT * FROM weeks"
```

If anything in the checklist fails, fix it before declaring done.

---

# STEP 10 — Optional polish (only if user requests)

Don't build these unless explicitly asked:

- Optimistic note adds (render immediately with temp id, retry on failure)
- `localStorage` cache of last-fetched week for instant cold-start render
- "Offline" banner when `navigator.onLine` is false
- Loading spinner during week switches

---

# Summary of explicit do-nots

- Don't add user accounts
- Don't add multi-device sync
- Don't add per-block editing (drag/resize/relabel)
- Don't add notifications, reminders, or push
- Don't add export/import
- Don't add sharing
- Don't restructure the existing UI — preserve the GCal-clean theme and all existing panels
- Don't ask the user to confirm steps that aren't `⏸ PAUSE` markers
