const CACHE = 'ph-d07e3f20b2c8';
const PRECACHE = [
 "./",
 "clock/index.html",
 "clock.html",
 "icons/apple-touch-icon.png",
 "icons/icon-192.png",
 "icons/icon-512.png",
 "icons/maskable-512.png",
 "img/bar-cart.webp",
 "img/bar-cone.webp",
 "img/bar-karamitsu.webp",
 "img/bar-two-cups.webp",
 "img/be-chocolate.webp",
 "img/be-dark-caramel.webp",
 "img/be-matcha.webp",
 "img/be-strawberry.webp",
 "img/cat-mark.webp",
 "img/deal-hokkaido-belgian-cone.webp",
 "img/deal-hokkaido-waffle-crisp.webp",
 "img/deal-matcha-belgian-cone.webp",
 "img/deal-matcha-waffle-crisp.webp",
 "img/gcash-qr.png",
 "img/hk-caramel.webp",
 "img/hk-chocolate.webp",
 "img/hk-matcha.webp",
 "img/hk-strawberry.webp",
 "img/primo-logo.webp",
 "img/shake-blueberry-cheesecake.webp",
 "img/shake-chocolate-brownie.webp",
 "img/shake-classic-strawberry.webp",
 "img/shake-coffee-caramel.webp",
 "img/shake-dark-mocha.webp",
 "img/shake-hokkaido-boba.webp",
 "img/shake-matcha.webp",
 "img/shake-oreo-and-cream.webp",
 "img/sundae-biscoff-supreme.webp",
 "img/sundae-caramel.webp",
 "img/sundae-chocolate-crumble-bites.webp",
 "img/sundae-chocolate.webp",
 "img/sundae-honey-comb-crumble.webp",
 "img/sundae-karamitsu-boba.webp",
 "img/sundae-matcha.webp",
 "img/sundae-milo-overload.webp",
 "img/sundae-oreo-flow.webp",
 "img/sundae-strawberry.webp",
 "index.html",
 "install.html",
 "manifest.webmanifest",
 "order.html",
 "print.html"
];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys()
  .then(ks => Promise.all(ks.filter(k => k.startsWith('ph-') && k !== CACHE).map(k => caches.delete(k))))
  .then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  const font = u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com';
  if (u.origin !== location.origin && !font) return;
  if (r.mode === 'navigate' || /(\/|\.html|\.webmanifest)$/.test(u.pathname)) {
    e.respondWith(fetch(r).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); }
      return res;
    }).catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || caches.match('./'))));
    return;
  }
  e.respondWith(caches.open(CACHE).then(c => c.match(r).then(m => {
    const net = fetch(r).then(res => { if (res.ok || res.type === 'opaque') c.put(r, res.clone()); return res; }).catch(() => m);
    return m || net;
  })));
});
