const CACHE = 'phclock-2';
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', 'icons/icon-192.png', 'img/cat-mark.webp'])).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then(k => k.put(r, c)); } return res; })
    .catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || caches.match('./'))));
});
