// CASHBET · Errores de cuota: picks con buena probabilidad donde la casa paga MÁS de lo que debería.
// Ejemplo: el modelo dice 70 % (cuota justa 1.43) y la casa paga 1.60 -> error de +12 %.
// Para no engañarnos, la probabilidad se corrige con lo que el modelo ACERTÓ de verdad en ese mercado
// (registro sellado). Si en el historial acertó menos de lo que decía, se baja; nunca se sube.
const ERR_PMIN = 0.70,   // pedido del usuario 2026-11-11: solo picks de 70 %+
      ERR_MIN = 0.05;
ui.errDep = "todos";

const mkGrupo = (g, m) => g.dep === "nba"
  ? "NBA · " + (/^(mas|menos)_/.test(m) ? "Total de puntos" : /^hcp/.test(m) ? "Hándicap" : "Ganador")
  : /^(mas|menos)_|^btts/.test(m) ? "Goles" : "Resultado";

function bandaReal(p) {
  const C = (HIST && HIST.confianza) || {};
  for (const [k, m] of Object.entries(C)) {
    const [lo, hi] = k.replace("%", "").split("-").map(Number);
    if (p * 100 >= lo && p * 100 < (hi === 100 ? 101 : hi) && m.calificados >= 30 && m.acierto != null) return m.acierto / 100;
  }
  return null;
}
// probabilidad corregida con el historial real + de dónde sale la corrección
// sin historial a ese nivel de probabilidad, no creemos más de 75 %
const P_TOPE = 0.75;
function pReal(p0, grupo) {
  const b = bandaReal(p0), notas = [];
  let p = p0;
  if (b == null) p = Math.min(p0, P_TOPE);
  else if (b < p) p = b;
  const m = HIST && HIST.mercado && HIST.mercado[grupo];
  if (m && m.calificados >= 20 && m.acierto != null && m.prob_media) {
    if (m.acierto < m.prob_media) p *= m.acierto / m.prob_media;
    notas.push(`Historial de ${grupo.replace(/^Jugadores NBA · /, "").toLowerCase()}: ${Math.round(m.acierto)}% en ${m.calificados} picks`);
  }
  return { p, h: notas.join(" · ") || "Mercado sin historial suficiente todavía" };
}

// probabilidad de los picks de jugadores NBA corregida con su acierto real (se baja, nunca se sube);
// se aplica una vez a cada prop cuando ya está el historial (x.p0 guarda la del modelo)
function corregirProps() {
  if (!HIST || HIST.error || !HIST.mercado || !D.props) return;
  for (const x of D.props) {
    if (x.p0 != null || x.mil || x.dia) continue;   // reglas nuevas (líneas reales): su % ya es el medido en la prueba
    x.p0 = x.p;
    const g = "Jugadores NBA · " + x.tipo, m = HIST.mercado[g];
    // una sola corrección: el acierto real de su mercado frente a lo que decía (prob_media)
    if (m && m.calificados >= 20 && m.acierto != null && m.prob_media && m.acierto < m.prob_media) {
      x.p = Math.round(x.p * (m.acierto / m.prob_media) * 1000) / 1000;
      x.preal = `historial de ${x.tipo.toLowerCase()}: ${Math.round(m.acierto)}% en ${m.calificados} picks`;
    }
    if (x.cuota) x.valor = Math.round((x.p * x.cuota - 1) * 1000) / 1000;
  }
  // con menos de 50 % real no es pick: fuera de las listas
  if (D.propsOk) D.propsOk = D.propsOk.filter((x) => x.p >= 0.5);
}
function erroresCuota() {
  if (!HIST && typeof cargarHist === "function") cargarHist();
  const out = [], ahora = Date.now(), lim = ahora + 36 * 3600e3;
  const vigente = (at) => { const t = new Date(at).getTime(); return t > ahora && t < lim; };
  for (const g of D.partidos || []) {
    if (!vigente(g.at) || (g.dep === "nba" && D.nba_ok === false)) continue;
    for (const x of g.mercados || []) {
      if (!x.cuota || !x.p || x.oculto) continue;
      if (x.cuota < (D.cuota_min || 1.40)) continue;   // pedido del usuario: nada con cuota menor a 1.40   // tipo de pick sin 70 % demostrado: no se muestra
      const r = pReal(x.p, mkGrupo(g, x.m)), err = r.p * x.cuota - 1;
      if (r.p >= ERR_PMIN && err >= ERR_MIN) out.push({ k: "g", g, x, p: r.p, pm: x.p, cuota: x.cuota, err, h: r.h, dep: g.dep });
    }
  }
  // Jugadores NBA: NO entran. En el registro real, 80 de 81 "errores" eran de jugadores y acertaron 37 %:
  // cuando el modelo de jugadores no está de acuerdo con la casa, la que tiene razón es la casa
  // (además ESPN no dice si la cuota es de "más" o de "menos").
  // un error por jugador (el más grande) y primero los más probables
  const visto = new Set();
  return out.sort((a, b) => b.err - a.err).filter((e) => { const k = e.k === "pr" ? "j" + e.x.pl : "g" + e.g.id + e.x.m; if (visto.has(k)) return false; visto.add(k); return true; })
    .sort((a, b) => b.p - a.p || b.err - a.err);
}

function errFila(e) {
  let img, tit, sub, pick, attr;
  if (e.k === "g") {
    const g = e.g;
    img = `<div class="erimg dos">${crest(g.h, 34)}${crest(g.a, 34)}</div>`;
    tit = `${g.h.n} vs ${g.a.n}`; sub = `${g.liga} · ${hora(g.at)}`; pick = e.x.txt; attr = `data-g="${g.id}"`;
  } else {
    const x = e.x;
    img = x.foto ? `<div class="erimg"><img src="${esc(x.foto)}" alt="" loading="lazy"></div>` : `<div class="erimg">${crest(x.eq || {}, 40)}</div>`;
    tit = x.jugador; sub = `${x.partido} · ${hora(x.at)}`; pick = `${x.lado === "mas" ? "Más" : "Menos"} de ${x.linea} ${x.tipo.toLowerCase()}`; attr = `data-pr="${D.props.indexOf(x)}"`;
  }
  const justa = 1 / e.p;
  return `<button class="erow" ${attr}>${img}<div class="erc"><small>${esc(sub)}${e.prueba ? ` · <em>en prueba</em>` : ""}</small><b>${esc(tit)}</b>
    <span class="erpk">${esc(pick)}</span>
    <div class="ernum"><span><small>Probabilidad</small><b>${pct(e.p)}</b></span><span><small>Debería pagar</small><b>${odd(justa)}</b></span><span><small>La casa paga</small><b class="g">${odd(e.cuota)}</b></span></div>
    <p>${esc(e.h)}${e.pm - e.p > 0.005 ? ` · corregida (el modelo decía ${pct(e.pm)})` : ""}</p></div><span class="erbad">+${Math.round(e.err * 100)}%<small>error</small></span></button>`;
}

function errores() {
  if (!HIST && typeof cargarHist === "function") cargarHist().then(() => { if (location.hash.startsWith("#errores")) { $("#app").dataset.tab = ""; route(); } });
  const todos = erroresCuota(), xs = todos.filter((e) => ui.errDep === "todos" || e.dep === ui.errDep);
  const n = (d) => todos.filter((e) => d === "todos" || e.dep === d).length;
  return header("Errores de cuota", "La casa paga más que la cuota justa del modelo") + `
    <div class="pkvale v">${ic("bolt")}<span><b>¿Qué es un error de cuota?</b> Cuando un pick pasa ${Math.round(ERR_PMIN * 100)}% o más de las veces y la casa paga más que la cuota justa. Ejemplo: 70% de probabilidad debería pagar 1.43; si la casa paga 1.60, hay +12% de ventaja <b>si el modelo tiene razón</b>. Es una posible ventaja, no un error confirmado de la casa ni una ganancia segura.</span></div>
    <div class="pk5 wide" style="margin-top:12px">${[["todos", "Todos"], ["futbol", "Fútbol"], ["nba", "NBA"]].map(([k, l]) => `<button class="${ui.errDep === k ? "on" : ""}" data-act="errdep" data-k="${k}">${l} (${n(k)})</button>`).join("")}</div>
    ${xs.length ? xs.map(errFila).join("") : `<div class="sgvac"><span>${ic("bolt")}</span><b>Sin errores de cuota ahora</b><p>Ninguna cuota supera la cuota justa del modelo en los partidos de las próximas 36 horas. El robot revisa cada hora.</p></div>`}
    <div class="small" style="margin:14px 2px">La probabilidad ya viene corregida con lo que el modelo acertó de verdad en ese mercado (Historial). Si antes se equivocó más de lo que decía, aquí se baja. Los de jugadores NBA siguen <b>en prueba</b>: su historial todavía es corto. Las cuotas cambian: confirma en tu casa antes de apostar. Ningún pick es seguro.</div>`;
}
function actErr(a, el) {
  if (a === "errdep") { ui.errDep = el.dataset.k; rerender(); return true; }
  return false;
}
