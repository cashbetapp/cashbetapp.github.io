// CASHBET · Notificaciones push reales (llegan con la app cerrada).
// El celular se suscribe con la llave pública VAPID; la suscripción se guarda en tu cuenta (usuarios/{uid}.push)
// y el robot (cada 2 h) envía: resumen de picks del día, errores de cuota nuevos y resultados de tus seguidos.
const VAPID_PUB = "BKrTLfpmyS-tz7TVP1JhQwDOAVE07qSGOrHDZQn08ynpOO68zz-o_jg2J0gxN22eXeoUaf-MwV-oCMK8j5EzCkk";
const PUSH_PREF = [["dia", "Picks del día", "Un resumen por la mañana con los picks de hoy"], ["alta", "Picks de alta confianza", "Solo picks con 70 % o más de probabilidad"],
  ["err", "Errores de cuota", "Cuando el robot encuentra una casa pagando de más"], ["res", "Resultados de tus picks", "Cuando un pick que sigues gana o pierde"],
  ["racha", "Alertas de rachas", "Cuando tus picks llevan 3 o más aciertos o fallos seguidos"]];
const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const instalada = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const pushSoportado = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const pushPref = () => Object.assign({ dia: true, err: true, res: true, alta: true, racha: true }, store.get("pushpref", {}));
const pushOn = () => !!store.get("pushon", 0) && typeof Notification !== "undefined" && Notification.permission === "granted";

function b64u(s) {
  const p = "=".repeat((4 - (s.length % 4)) % 4), b = atob((s + p).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
async function pushGuardar(sub) {
  if (!USER || !FB) throw new Error("sin cuenta");
  await FB.db.collection("usuarios").doc(USER.uid).set({ push: sub ? { sub: JSON.stringify(sub), pref: pushPref(), at: new Date().toISOString() } : firebase.firestore.FieldValue.delete() }, { merge: true });
}
async function pushActivar() {
  if (!pushSoportado()) { toast(esIOS() ? "Primero instala la app en tu pantalla de inicio" : "Este navegador no permite notificaciones"); return; }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") { toast("No diste permiso para notificaciones"); rerender(); return; }
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(VAPID_PUB) });
  await pushGuardar(sub);
  store.set("pushon", 1); toast("Notificaciones activadas"); rerender();
}
async function pushDesactivar() {
  try { const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); } catch (e) {}
  try { await pushGuardar(null); } catch (e) {}
  store.set("pushon", 0); toast("Notificaciones desactivadas"); rerender();
}

function notifAjustes() {
  const on = pushOn(), pf = pushPref();
  let aviso = "";
  if (!pushSoportado() && esIOS() && !instalada()) aviso = `<div class="ajnote"><b>En iPhone:</b> toca <b>Compartir</b> y luego <b>Agregar a pantalla de inicio</b>. Abre CASHBET desde ese ícono y vuelve aquí para activar las notificaciones (iOS 16.4 o más nuevo).</div>`;
  else if (!pushSoportado()) aviso = `<div class="ajnote">Este navegador no permite notificaciones. Prueba con Chrome en Android o instala la app en tu pantalla de inicio.</div>`;
  else if (Notification.permission === "denied") aviso = `<div class="ajnote">Bloqueaste las notificaciones de CASHBET. Actívalas en los ajustes del navegador (candado junto a la dirección → Notificaciones → Permitir) y vuelve aquí.</div>`;
  return subTop("Notificaciones") + heroAj("bellR", "Notificaciones", "Avisos aunque tengas la app cerrada") + aviso + `
    <div class="ajlist"><button class="ajrow" data-act="pushtog"><div><b>Notificaciones en este celular</b><small>${on ? "Activadas" : "Desactivadas"}</small></div><span class="tog ${on ? "on" : ""}"></span></button></div>
    <div class="ajsec">QUÉ QUIERES RECIBIR</div>
    <div class="ajlist">${PUSH_PREF.map(([k, t, s]) => `<button class="ajrow ${on ? "" : "dis"}" data-act="pushpref" data-k="${k}"><div><b>${t}</b><small>${s}</small></div><span class="tog ${pf[k] ? "on" : ""}"></span></button>`).join("")}</div>
    <div class="ajnote">El robot revisa cada 2 horas, así que un aviso puede llegar hasta 2 horas después. Puedes desactivarlas cuando quieras.</div>`;
}
function actPush(a, el) {
  if (a === "pushtog") { (pushOn() ? pushDesactivar() : pushActivar()).catch((e) => { toast(/permission|denied/i.test(e.message || "") ? "El navegador no dio permiso. Revisa que las notificaciones de CASHBET estén permitidas" : /cuenta/.test(e.message || "") ? "Inicia sesión para activar las notificaciones" : "No se pudo activar. Intenta de nuevo"); }); return true; }
  if (a === "pushpref") {
    if (!pushOn()) { toast("Primero activa las notificaciones"); return true; }
    const pf = pushPref(); pf[el.dataset.k] = !pf[el.dataset.k]; store.set("pushpref", pf); rerender();
    navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then((s) => s && pushGuardar(s)).catch(() => {});
    return true;
  }
  return false;
}
