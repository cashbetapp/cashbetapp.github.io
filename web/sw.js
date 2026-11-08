// CASHBET: guarda la app para abrir rápido; los pronósticos siempre se piden nuevos.
const V = "cashbet-v44";
const SHELL = ["./", "index.html", "styles.css?v=44", "app.js?v=44", "pick.js?v=44", "vistas.js?v=44", "historial.js?v=44", "privacidad.js?v=44", "cuenta.js?v=44", "seguidos.js?v=44", "matchpick.js?v=44", "inicio2.js?v=44", "resultados.js?v=44", "bankroll.js?v=44", "manifest.webmanifest", "icon-192.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  if (u.pathname.includes("/data/")) return; // datos: siempre de la red
  // red primero, copia guardada si no hay internet
  e.respondWith(fetch(e.request, { cache: "no-cache" }).then((r) => {
    const c = r.clone(); caches.open(V).then((ca) => ca.put(e.request, c)); return r;
  }).catch(() => caches.match(e.request)));
});
