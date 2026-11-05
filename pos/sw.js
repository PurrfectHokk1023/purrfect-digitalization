// Purrfect POS offline helper (make_pos_app.py): network first so updates arrive, the saved copy when there is no internet.
// cache: 'no-cache' makes every load ask the server (a quick "not modified" when nothing changed), so the browser's 10-minute copy
// can't hold an update back. A request that can't be copied that way (very old browsers) goes as it is.
const CACHE = 'ppos-4';
const SHELL = ['./', './?app=1', 'index.html', 'app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys()
  .then(ks => Promise.all(ks.filter(k => k.startsWith('ppos-') && k !== CACHE).map(k => caches.delete(k))))
  .then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  let fresh = r;
  try { fresh = new Request(r, {cache: 'no-cache'}); } catch (err) {}
  e.respondWith(fetch(fresh).then(res => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then(k => k.put(r, c)); } return res; })
    .catch(() => caches.match(r, {ignoreSearch: true}).then(m => m || caches.match('./'))));
});
