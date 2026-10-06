// sw.js — Panel de acceso (F911). Guarda solo la «cáscara» del panel para que abra aunque no haya internet.
// El panel no usa Supabase ni pide nada a la nube: la cuenta se usa dentro de Tierra Buena.
const V = 'tb-panel-f912';
const CASCARA = ['./', './index.html', './panel.css', './panel.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-192.png', './icon-maskable-512.png', './accesos.html', './accesos.css', './accesos.js', './accesos.webmanifest', './vendor/supabase.js', './icon-acc-192.png', './icon-acc-512.png', './icon-acc-maskable-192.png', './icon-acc-maskable-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(CASCARA)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V && /^tb-panel-/.test(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // lo externo (Tierra Buena) va directo a internet
  // Internet primero (así siempre ves lo último); si tarda más de 2,5 s o no hay red, sale la copia guardada.
  e.respondWith(new Promise((res) => {
    let listo = false;
    const copia = () => caches.match(e.request, { ignoreSearch: true }).then((r) => { if (r && !listo) { listo = true; res(r); } return r; });
    const t = setTimeout(copia, 2500);
    fetch(e.request).then((r) => { clearTimeout(t); if (r && r.ok) { const k = r.clone(); caches.open(V).then((c) => c.put(e.request, k)); } if (!listo) { listo = true; res(r); } })
      .catch(() => { clearTimeout(t); copia().then((r) => { if (!r && !listo) { listo = true; res(Response.error()); } }); });
  }));
});
