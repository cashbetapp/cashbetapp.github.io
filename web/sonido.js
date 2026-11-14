// Sonido suave (y vibración corta en Android) al tocar pestañas o abrir ventanas, igual que CamiloRey.
// Se hace con Web Audio: no hay archivo de sonido que descargar. Se apaga en Perfil > Sonido al tocar.
I.vol = '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>';
I.volX = '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 6 6"/><path d="m22 9-6 6"/>';
const sonidoOn = () => store.get("sonido", true);
const vibraOn = () => store.get("vibra", true);
let _actx = null, _ultimo = 0;
// Igual que CamiloRey (site/js/feedback.js): tono de 880 Hz que cae al 70 % en 0,05 s, volumen 0,06,
// vibración de 12 ms; si llegan dos en el mismo toque suena una sola vez (90 ms).
function _audio() {
  if (!_actx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; _actx = new AC(); }
  if (_actx.state === "suspended") _actx.resume().catch(() => {});
  return _actx;
}
// el audio del navegador arranca dormido: se despierta en el primer toque para que el primer tic ya suene
addEventListener("pointerdown", () => { if (sonidoOn()) _audio(); }, { capture: true, passive: true });
function _blip(freq, start, dur = 0.05, vol = 0.06) {
  const a = _audio(); if (!a) return;
  const t = a.currentTime + start, o = a.createOscillator(), g = a.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(freq * 0.7, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
function tic() {
  if (performance.now() - _ultimo < 90) return;
  _ultimo = performance.now();
  if (vibraOn()) { try { navigator.vibrate && navigator.vibrate(12); } catch (e) {} }
  if (sonidoOn()) { try { _blip(880, 0, 0.05, 0.06); } catch (e) {} }
}
// SOLO al tocar una pestaña o abrir una ventana (pedido del usuario: "tal cual como CamiloRey")
const PESTANA = "#nav button, [data-act=\"cal\"], [data-act=\"gtab\"], [data-act=\"mptab\"], [data-act=\"oitab\"], [data-act=\"pktab\"], [data-act=\"pseg\"], [data-act=\"pptab\"], [data-act=\"rtab\"], [data-act=\"vvtabla\"]";
const VENTANA = "[data-go], [data-mp], [data-pk], [data-pr], [data-g], [data-res], [data-open]";
document.addEventListener("click", (e) => {
  const el = e.target.closest && e.target.closest(PESTANA + ", " + VENTANA);
  if (el && !el.disabled) tic();
}, { capture: true, passive: true });

function sonidoAjustes() {
  const s = sonidoOn(), v = vibraOn();
  return subTop("Sonido al tocar") + heroAj("vol", "Sonido al tocar", "Un tic suave al cambiar de pestaña o abrir una ventana") +
    `<div class="ajsec">SONIDO <em>${s ? "ACTIVADO" : "APAGADO"}</em></div>
    ${opt("sonido", "1", s, ic("vol"), "Activado", "Suena un tic suave al tocar una pestaña o abrir una ventana")}${opt("sonido", "0", !s, ic("volX"), "Apagado", "La app no hace ningún sonido al tocar")}
    <div class="ajsec">VIBRACIÓN <em>${v ? "ACTIVADA" : "APAGADA"}</em></div>
    ${opt("vibra", "1", v, ic("vol"), "Activada", "Una vibración muy corta al tocar (solo Android)")}${opt("vibra", "0", !v, ic("volX"), "Apagada", "Sin vibración al tocar")}
    <div class="ajnote"><b>Nota:</b> si el celular está en silencio o con el volumen multimedia en cero, no se oye. En iPhone tampoco suena con el interruptor de silencio activado.</div>`;
}

// Enganche en Perfil: fila nueva y subpágina "ajustes/sonido".
(function () {
  const base = ajustes;
  ajustes = function (arg) {
    if (arg === "sonido") return sonidoAjustes();
    const html = base(arg);
    if (arg) return html;
    const fila = `<button class="ajrow" data-go="ajustes/sonido"><span class="oi">${ic(sonidoOn() ? "vol" : "volX")}</span><div><b>Sonido al tocar</b><small>${sonidoOn() ? "Activado" : "Apagado"}${vibraOn() ? " · con vibración" : ""}</small></div>${ic("right")}</button>`;
    return html.replace('<button class="ajrow" data-go="ajustes/cuotas"', fila + '<button class="ajrow" data-go="ajustes/cuotas"');
  };
})();
