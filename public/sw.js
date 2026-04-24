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
