// CASHBET · ODDS INTELLIGENCE: comparador de casas, oportunidades, historial y rendimiento.
// Todo sale de data/odds.json (robot/odds.py). Aquí no se calcula ningún indicador ni se inventa nada:
// si un dato no viene del robot, se muestra "—". Sin datos de demostración.
I.scale = I.scale || '<path d="M12 3v18M5 7h14M7 7l-3 7a3 3 0 0 0 6 0zM17 7l-3 7a3 3 0 0 0 6 0z"/>';
let ODDS = null, oddsCargando = false;
ui.oiTab = "op";

async function cargarOdds() {
  if (oddsCargando) return;
  oddsCargando = true;
  try {
    const r = await fetch("data/odds.json?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    ODDS = await r.json();
  } catch (e) {
    ODDS = { error: String(e.message || e) };
  }
  oddsCargando = false;
  if (location.hash.startsWith("#odds")) rerender();
}

// "hace 25 min" / "hace 3 h" desde una hora ISO del robot
function hace(iso) {
  if (!iso) return "—";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `hace ${m} min` : m < 48 * 60 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} días`;
}
const pctS = (x, d = 1) => (x == null ? "—" : `${x > 0 ? "+" : ""}${(x * 100).toFixed(d)}%`);
const pctP = (x) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);

// estados del robot -> etiquetas del panel
function etiqueta(m, e) {
  if (m.estado === "suspendido") return ["susp", "Mercado suspendido"];
  if (e && e.antiguo && m.estado !== "normal") return ["desc", "Descartada · datos antiguos"];
  if (m.estado === "valor") return ["ok", "Oportunidad detectada"];
  if (m.estado === "arbitraje") return ["obs", "En observación · arbitraje"];
  if (m.estado === "desajustada") return ["obs", "En observación"];
  if (m.estado === "descartada") return ["desc", "Datos insuficientes"];
  return ["norm", "Cuota normal"];
}

function oddsVista() {
  if (!ODDS) { cargarOdds(); return header("Odds Intelligence", "Cargando…") + `<div class="empty">Cargando el comparador de cuotas…</div>`; }
  if (ODDS.error) {
    return header("Odds Intelligence", "") + `<div class="sgvac"><span>${ic("warn")}</span><b>No se pudo cargar</b><p>${esc(ODDS.error)}. Revisa tu conexión e inténtalo de nuevo.</p></div>`;
  }
  const O = ODDS, s = O.salud || {};
  const tabs = [["op", "Oportunidades"], ["cmp", "Comparador"], ["his", "Historial"], ["ren", "Rendimiento"]];
  const cuerpo = { op: oiOportunidades, cmp: oiComparador, his: oiHistorial, ren: oiRendimiento }[ui.oiTab] || oiOportunidades;
  return header("Odds Intelligence", `Actualizado ${hace(O.generado)} · ${esc(O.fuente || "")}`) + `
    <div class="oisalud ${s.api === "ok" ? "" : "mal"}">
      <span><i></i>${s.api === "ok" ? "Fuente de cuotas funcionando" : "La fuente de cuotas falla"}</span>
      <span>Última consulta buena: ${hace(s.ultima_consulta_ok)}</span>
      ${O.creditos_restantes != null ? `<span>Consultas del mes: ${O.creditos_restantes}</span>` : ""}
    </div>
    ${(O.errores || []).length ? `<div class="oiaviso">${ic("warn")}<span>${esc(O.errores.slice(0, 3).join(" · "))}</span></div>` : ""}
    <div class="oinota">No son cuotas en vivo: se revisan ${esc(s.frecuencia || "varias veces al día")}. Cada dato muestra su hora.</div>
    <div class="pk5 wide oitabs">${tabs.map(([k, l]) => `<button class="${ui.oiTab === k ? "on" : ""}" data-act="oitab" data-k="${k}">${l}</button>`).join("")}</div>
    ${cuerpo(O)}`;
}

// 1-5 · oportunidades: probabilidad, cuota de mercado, EV, confianza y estado
function oiOportunidades(O) {
  const evs = O.eventos || [], items = [];
  let normales = 0, insuf = 0;
  for (const e of evs) for (const m of e.mercados || []) {
    if (m.estado === "normal") normales++;
    else if (m.estado === "descartada") insuf++;
    else items.push({ e, m });
  }
  items.sort((a, b) => (b.m.ev || -9) - (a.m.ev || -9));
  const V = O.valor || {};
  const regla = `<div class="small oiregla">Regla de CASHBET: solo se marca <b>Oportunidad detectada</b> cuando el registro demuestra que estas cuotas le ganan al cierre del mercado (CLV positivo en ${V.minimo || 100}+ casos). Hoy: ${V.n || 0} casos${V.clv_medio != null ? `, CLV medio ${V.clv_medio > 0 ? "+" : ""}${(V.clv_medio * 100).toFixed(2)}%` : ""}. ${V.probado ? "Demostrado." : "Todavía no demostrado: todo queda <b>En observación</b>."} Una cuota distinta no es un error confirmado de la casa.</div>`;
  const cerr = (O.cerrados || []).length ? `<div class="sec"><h2>Partidos ya empezados</h2></div>${O.cerrados.map(oiCerrado).join("")}` : "";
  return `<div class="tiles">
      <div class="tile"><div class="k">Para revisar</div><div class="v">${items.length}</div></div>
      <div class="tile"><div class="k">Normales</div><div class="v">${normales}</div></div>
      <div class="tile"><div class="k">Datos insuf.</div><div class="v">${insuf}</div></div></div>
    ${regla}
    ${items.length ? items.map(oiCard).join("") : `<div class="sgvac"><span>${ic("scale")}</span><b>Sin oportunidades ahora</b><p>${evs.length ? "Todas las cuotas revisadas están en línea con el mercado." : "No hay partidos con cuotas revisadas en las próximas horas."} Si no hay nada demostrable, CASHBET no publica nada.</p></div>`}
    ${cerr}`;
}
function oiCard({ e, m }) {
  const [cl, lab] = etiqueta(m, e);
  const mj = m.mejor || {};
  return `<div class="oicard">
    <div class="oitop"><span>${esc(e.liga)} · ${hora(e.at)}</span><span class="oiest ${cl}">${lab}</span></div>
    <div class="oipt">${esc(e.local)} vs ${esc(e.visita)}</div>
    <div class="oimk">${esc(m.txt)}</div>
    <div class="oinum">
      <span><small>Modelo CASHBET${e.lg === "nba" && typeof D !== "undefined" && D && D.nba_ok === false ? " · sin validar" : ""}</small><b>${m.p_modelo != null ? pctP(m.p_modelo) : "—"}</b></span>
      <span><small>Mercado sin margen</small><b>${pctP(m.p_mercado)}</b></span>
      <span><small>Cuota · ${esc(mj.casa || "—")}</small><b class="g">${mj.cuota ? odd(mj.cuota) : "—"}</b><em>${mj.hora ? "act. " + hora(mj.hora) : ""}</em></span>
      <span><small>Valor esperado</small><b class="${(m.ev || 0) > 0 ? "g" : ""}">${pctS(m.ev)}</b></span>
    </div>
    <div class="oimeta">Precio justo ${m.justa ? odd(m.justa) : "—"} · ${esc(m.ref || "sin referencia")} · ${m.casas || 0} casas · confianza <b>${esc(m.confianza || "—")}</b></div>
    <p class="oimot">${esc(m.motivo || "")}${m.retiradas ? ` · Retiraron la cuota: ${esc(m.retiradas.join(", "))}` : ""}</p>
    ${(e.avisos || []).map((a) => `<div class="oiaviso chico">${ic("warn")}<span>${esc(a)}</span></div>`).join("")}
  </div>`;
}
function oiCerrado(c) {
  const ev = (c.eventos || []).map((x) => `${x.min || ""} ${x.t === "roja" ? "roja" : "gol"} ${esc(x.j || "")}`).join(" · ");
  return `<div class="oicard gris"><div class="oitop"><span>${esc(c.liga)} · ${hora(c.at)}</span><span class="oiest desc">Cerrado</span></div>
    <div class="oipt">${esc(c.local)} vs ${esc(c.visita)}${c.marcador && c.marcador[0] != null ? ` · ${esc(c.marcador.join("-"))}` : ""}</div>
    <p class="oimot">${esc(c.motivo)}${ev ? ` · ${ev}` : ""}</p></div>`;
}

// 6 · comparador: todas las casas para cada partido (ganador)
function oiComparador(O) {
  const evs = (O.eventos || []).filter((e) => (e.mercados || []).some((m) => ["1", "X", "2"].includes(m.mercado) && (m.cuotas || []).length));
  if (!evs.length) return `<div class="sgvac"><span>${ic("scale")}</span><b>Sin cuotas para comparar</b><p>No hay partidos revisados en las próximas horas.</p></div>`;
  return evs.map((e) => {
    const ms = ["1", "X", "2"].map((k) => e.mercados.find((m) => m.mercado === k && m.estado !== "suspendido")).filter(Boolean);
    const casas = {};
    ms.forEach((m, i) => (m.cuotas || []).forEach(([c, q]) => ((casas[c] = casas[c] || [])[i] = q)));
    const filas = Object.entries(casas).sort((a, b) => (b[1][0] || 0) - (a[1][0] || 0));
    const mejor = ms.map((_, i) => Math.max(...filas.filter(([c]) => !/\(bolsa\)/.test(c)).map(([, v]) => v[i] || 0)));
    const abierto = ui.oiAll === e.oid, vis = abierto ? filas : filas.slice(0, 8);
    return `<div class="oicard"><div class="oitop"><span>${esc(e.liga)} · ${hora(e.at)}</span><span>${hace(e.actualizado)}</span></div>
      <div class="oipt">${esc(e.local)} vs ${esc(e.visita)}</div>
      <table class="oitab"><thead><tr><th>Casa</th>${ms.map((m) => `<th>${esc(m.mercado === "X" ? "Empate" : m.mercado === "1" ? e.local : e.visita)}</th>`).join("")}</tr></thead><tbody>
      <tr class="justa"><td>Precio justo</td>${ms.map((m) => `<td>${m.justa ? odd(m.justa) : "—"}</td>`).join("")}</tr>
      ${vis.map(([c, v]) => `<tr><td>${esc(c)}</td>${ms.map((_, i) => `<td class="${v[i] && v[i] === mejor[i] && !/\(bolsa\)/.test(c) ? "best" : ""}">${v[i] ? odd(v[i]) : "—"}</td>`).join("")}</tr>`).join("")}
      </tbody></table>
      ${filas.length > 8 ? `<button class="pill dk oimas" data-act="oiall" data-k="${esc(e.oid)}">${abierto ? "Ver menos" : `Ver las ${filas.length} casas`}</button>` : ""}
      <div class="small">Verde = mejor cuota (las bolsas como Betfair cobran comisión y no cuentan como mejor).</div></div>`;
  }).join("");
}

// 7 · historial: ganadas, perdidas, nulas y pendientes (nada se borra)
function oiHistorial(O) {
  const H = O.historial || [];
  if (!H.length) return `<div class="sgvac"><span>${ic("list")}</span><b>Historial vacío</b><p>Aquí queda cada oportunidad desde que aparece: hora, casa, cuota, cuándo desapareció y su resultado. Las pérdidas no se borran.</p></div>`;
  const R = { ganada: ["ok", "Ganada"], perdida: ["mal", "Perdida"], nula: ["desc", "Nula"] };
  return H.map((r) => {
    const [cl, lab] = R[r.res] || ["norm", "Pendiente"];
    return `<div class="oihis"><div><b>${esc(r.partido)}</b><span>${esc(r.txt)} · ${esc(r.casa)} ${odd(r.cuota)} · EV ${pctS(r.ev)}</span>
      <span>Apareció ${fmtD.format(new Date(r.aparece))} ${hora(r.aparece)}${r.desaparece ? ` · desapareció ${hora(r.desaparece)}` : ""}${r.clv != null ? ` · CLV ${pctS(r.clv)}` : ""}${r.marcador ? ` · ${esc(r.marcador)}` : ""}</span></div>
      <span class="oiest ${cl}">${lab}</span></div>`;
  }).join("");
}

// 8 · rendimiento: precisión, ROI/yield, CLV y evolución (todo calculado por el robot)
function oiRendimiento(O) {
  const R = O.rendimiento || {};
  if (!R.n) return `<div class="sgvac"><span>${ic("trend")}</span><b>Aún sin oportunidades calificadas</b><p>Los indicadores aparecen cuando terminen los partidos de las oportunidades registradas (${R.pendientes || 0} pendientes). No mostramos porcentajes que no estén medidos.</p></div>`;
  const s = R.serie || [];
  let graf = "";
  if (s.length > 1) {
    const ys = s.map((x) => x[1]), lo = Math.min(0, ...ys), hi = Math.max(0, ...ys), W = 320, H = 120;
    const X = (i) => (i / (s.length - 1)) * W, Y = (v) => H - ((v - lo) / (hi - lo || 1)) * H;
    graf = `<svg class="oigraf" viewBox="-4 -6 ${W + 8} ${H + 12}" preserveAspectRatio="none"><line x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}" class="cero"/>
      <polyline points="${s.map((x, i) => `${X(i).toFixed(1)},${Y(x[1]).toFixed(1)}`).join(" ")}" class="${ys[ys.length - 1] >= 0 ? "pos" : "neg"}"/></svg>
      <div class="small oieje"><span>${esc(s[0][0])}</span><span>Unidades acumuladas</span><span>${esc(s[s.length - 1][0])}</span></div>`;
  }
  return `<div class="tiles">
      <div class="tile"><div class="k">Calificadas</div><div class="v">${R.n}</div><div class="n">${R.ganadas} G · ${R.perdidas} P</div></div>
      <div class="tile"><div class="k">Acierto</div><div class="v">${R.acierto}%</div><div class="n">mercado decía ${R.prob_media_mercado}%</div></div>
      <div class="tile"><div class="k">Yield</div><div class="v ${R.yield > 0 ? "g" : ""}">${R.yield > 0 ? "+" : ""}${R.yield}%</div><div class="n">${R.unidades > 0 ? "+" : ""}${R.unidades} u</div></div></div>
    <div class="tiles t2">
      <div class="tile"><div class="k">CLV medio</div><div class="v">${R.clv && R.clv.medio != null ? (R.clv.medio > 0 ? "+" : "") + R.clv.medio + "%" : "—"}</div><div class="n">${R.clv ? R.clv.n : 0} con cierre</div></div>
      <div class="tile"><div class="k">Pendientes</div><div class="v">${R.pendientes}</div></div></div>
    ${graf ? `<div class="oicard">${graf}</div>` : ""}
    <div class="small" style="margin:12px 2px">Yield = ganancia ÷ lo apostado, con 1 unidad por oportunidad a la cuota detectada. CLV = cuánto mejor era la cuota que el cierre del mercado; es la mejor señal de valor real a largo plazo. Resultados pasados no garantizan los futuros.</div>`;
}

function actOdds(a, el) {
  if (a === "oitab") { ui.oiTab = el.dataset.k; rerender(); return true; }
  if (a === "oiall") { ui.oiAll = ui.oiAll === el.dataset.k ? null : el.dataset.k; rerender(); return true; }
  return false;
}
