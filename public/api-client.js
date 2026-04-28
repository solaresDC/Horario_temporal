async function request(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  if (res.status === 204) return null;
  return res.json();
}

window.api = {
  getWeek:     (weekId)            => request(`/api/week/${weekId}`),
  setVersion:  (weekId, version)   => request(`/api/week/${weekId}/version`, { method:'PUT',    body: JSON.stringify({ version }) }),
  addNote:     (weekId, text)      => request(`/api/week/${weekId}/notes`,    { method:'POST',   body: JSON.stringify({ text }) }),
  updateNote:  (id, patch)         => request(`/api/notes/${id}`,             { method:'PATCH',  body: JSON.stringify(patch) }),
  deleteNote:  (id)                => request(`/api/notes/${id}`,             { method:'DELETE' }),
  getTopics:   ()                  => request('/api/topics'),
  addTopic:    (categoryKey, text) => request('/api/topics',                  { method:'POST',   body: JSON.stringify({ category_key: categoryKey, text }) }),
  deleteTopic: (id)                => request(`/api/topics/${id}`,            { method:'DELETE' })
};
