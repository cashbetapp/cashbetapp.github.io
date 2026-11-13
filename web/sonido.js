// Sonido suave (y vibración corta en Android) al tocar botones de la app.
// Se hace con Web Audio: no hay archivo de sonido que descargar. Se apaga en Perfil > Sonido al tocar.
I.vol = '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>';
I.volX = '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 6 6"/><path d="m22 9-6 6"/>';
const sonidoOn = () => store.get("sonido", true);
const vibraOn = () => store.get("vibra", true);
let _actx = null, _ultimo = 0;
function tic() {
  const t = Date.now();
  if (t - _ultimo < 60) return;               // no repetir con un solo toque
  _ultimo = t;
  if (vibraOn() && navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} }
  if (!sonidoOn()) return;
  try {
    _actx = _actx || new (window.AudioContext || window.webkitAudioContext)();
    if (_actx.state === "suspended") _actx.resume();
    const o = _actx.createOscillator(), g = _actx.createGain(), n = _actx.currentTime;
    o.type = "sine";
    o.frequency.setValueAtTime(1150, n);
    o.frequency.exponentialRampToValueAtTime(620, n + 0.045);
    g.gain.setValueAtTime(0.0001, n);
    g.gain.exponentialRampToValueAtTime(0.16, n + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, n + 0.06);
    o.connect(g); g.connect(_actx.destination);
    o.start(n); o.stop(n + 0.07);
  } catch (e) {}
}
document.addEventListener("pointerdown", (e) => {
  if (e.button && e.button !== 0) return;
  const el = e.target.closest && e.target.closest("button, a, [data-go], [data-act], [data-id], label, select, .tab, .chip");
  if (el && !el.disabled) tic();
}, { passive: true, capture: true });

function sonidoAjustes() {
  const s = sonidoOn(), v = vibraOn();
  return subTop("Sonido al tocar") + heroAj("vol", "Sonido al tocar", "Un clic suave cada vez que tocas") +
    `<div class="ajsec">SONIDO <em>${s ? "ACTIVADO" : "APAGADO"}</em></div>
    ${opt("sonido", "1", s, ic("vol"), "Activado", "Suena un clic suave al tocar botones y tarjetas")}${opt("sonido", "0", !s, ic("volX"), "Apagado", "La app no hace ningún sonido al tocar")}
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
