// CASHBET: guarda la app para abrir rápido; los pronósticos siempre se piden nuevos.
const V = "cashbet-v72";
const SHELL = ["./", "index.html", "styles.css?v=72", "app.js?v=72", "pick.js?v=72", "nba.js?v=72", "vistas.js?v=72", "historial.js?v=72", "privacidad.js?v=72", "cuenta.js?v=72", "seguidos.js?v=72", "matchpick.js?v=72", "inicio2.js?v=72", "resultados.js?v=72", "envivo.js?v=72", "futvivo.js?v=72", "bankroll.js?v=72", "previa.js?v=72", "proppick.js?v=72", "errores.js?v=72", "push.js?v=72", "manifest.webmanifest", "icon-192.png"];
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

// notificaciones push del robot
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { b: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.t || "CASHBET", { body: d.b || "", icon: "icon-192.png", badge: "icon-192.png", tag: d.tag || undefined, data: { url: d.u || "./" } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data && e.notification.data.url || "./", self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    for (const c of cs) if ("focus" in c) { c.navigate(url).catch(() => {}); return c.focus(); }
    return clients.openWindow(url);
  }));
});
