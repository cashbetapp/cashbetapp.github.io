// CASHBET: guarda la app para abrir rápido; los pronósticos siempre se piden nuevos.
const V = "cashbet-v48";
const SHELL = ["./", "index.html", "styles.css?v=48", "app.js?v=48", "pick.js?v=48", "vistas.js?v=48", "historial.js?v=48", "privacidad.js?v=48", "cuenta.js?v=48", "seguidos.js?v=48", "matchpick.js?v=48", "inicio2.js?v=48", "resultados.js?v=48", "bankroll.js?v=48", "previa.js?v=48", "proppick.js?v=48", "manifest.webmanifest", "icon-192.png"];
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
