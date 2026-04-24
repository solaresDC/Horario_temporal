const API_BASE = 'https://weekly-schedule-api.daniel-chavez200326.workers.dev';

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
