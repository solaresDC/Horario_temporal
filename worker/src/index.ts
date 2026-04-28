import { Hono } from 'hono';

type Env = { DB: D1Database };

const app = new Hono<{ Bindings: Env }>();

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
