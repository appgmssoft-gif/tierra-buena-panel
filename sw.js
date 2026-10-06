// sw.js — Panel de accesos (F913). Solo guarda la «cáscara» de la página; nada de Supabase ni de tus datos (eso va directo a internet).
const V = 'tb-panel-f913';
const CASCARA = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-192.png', './icon-maskable-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(CASCARA)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V && /^tb-panel-/.test(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { if (r && r.ok) { const k = r.clone(); caches.open(V).then((c) => c.put(e.request, k)); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
