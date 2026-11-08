// CASHBET · pestañas Equipos y Plantel de la ficha del partido, como IABET: récord, clasificación,
// estadísticas de temporada, líderes, serie de la temporada y rotación por posición (NBA).
let PREV = null, PREV_CARGANDO = false;
ui.rotT = null; ui.stTodo = false;
const LID_ES = { Points: "Puntos", Assists: "Asistencias", Rebounds: "Rebotes", Steals: "Robos", Blocks: "Tapones" };

async function cargarPrev() {
  if (PREV || PREV_CARGANDO) return;
  PREV_CARGANDO = true;
  try { PREV = await (await fetch("data/previa.json?t=" + Date.now(), { cache: "no-store" })).json(); } catch (e) { PREV = {}; }
  PREV_CARGANDO = false;
  if ($(".sheet.on") && sheetState && sheetState.id) openGame(sheetState.id, sheetState.tab);
}
const ordSides = (g) => (g.dep === "nba" ? ["a", "h"] : ["h", "a"]);
const fila3 = (a, lab, b, ga, gb) => `<div class="pv3"><b class="${ga ? "g" : ""}">${esc(a ?? "—")}</b><span>${esc(lab)}</span><b class="${gb ? "g" : ""}">${esc(b ?? "—")}</b></div>`;
// solo se comparan valores numéricos ("P7", "G3" o "7-3" no se pintan como mejor/peor)
const num = (v) => (/^\s*[-+]?[\d.,]+\s*%?\s*$/.test(String(v ?? "")) ? parseFloat(String(v).replace(",", ".")) : NaN);
// "Partidos: 14, Goles: 6" -> "6" y "goles"
function lidVal(v) { const m = String(v || "").match(/([A-Za-zÁÉÍÓÚáéíóúñ ]+):\s*([\d.,]+)\s*$/); return m ? [m[2], m[1].trim().toLowerCase()] : [v, ""]; }

function prevEquipos(g) {
  if (!PREV) { cargarPrev(); return `<div class="small" style="margin:14px 2px">Cargando récord y estadísticas…</div>`; }
  const P = PREV[g.id]; if (!P) return "";
  const [L, R] = ordSides(g), cab = `<div class="pvh">${crest(g[L], 24)}<b>${esc(abT(g[L]))}</b><span></span><b>${esc(abT(g[R]))}</b>${crest(g[R], 24)}</div>`;
  const rec = P.rec || {}, cl = P.clas || {}, out = [];
  // récord
  const rf = [];
  rf.push(fila3(rec[L]?.total, "General", rec[R]?.total));
  if (g.dep === "nba") {
    rf.push(fila3(rec[L]?.home || "—", "Local", rec[R]?.home || "—"));
    rf.push(fila3(rec[L]?.road || "—", "Visitante", rec[R]?.road || "—"));
    if (rec[L]?.vsconf || rec[R]?.vsconf) rf.push(fila3(rec[L]?.vsconf, "Conferencia", rec[R]?.vsconf));
  } else if (rec[L]?.points || rec[R]?.points) rf.push(fila3(rec[L]?.points, "Puntos", rec[R]?.points, num(rec[L]?.points) > num(rec[R]?.points), num(rec[R]?.points) > num(rec[L]?.points)));
  out.push(`<h4 class="pksub">Récord</h4><div class="pkcard">${cab}${rf.join("")}</div>`);
  // clasificación
  const cf = [];
  if (cl[L]?.pct || cl[R]?.pct) cf.push(fila3(cl[L]?.pct, "% victorias", cl[R]?.pct, num(cl[L]?.pct) > num(cl[R]?.pct), num(cl[R]?.pct) > num(cl[L]?.pct)));
  if (cl[L]?.racha || cl[R]?.racha) cf.push(fila3(cl[L]?.racha, "Racha", cl[R]?.racha));
  if (cl[L]?.pos || cl[R]?.pos) cf.push(fila3(cl[L]?.pos ? cl[L].pos + "º" : null, "Posición", cl[R]?.pos ? cl[R].pos + "º" : null, num(cl[L]?.pos) < num(cl[R]?.pos), num(cl[R]?.pos) < num(cl[L]?.pos)));
  if (cl[L]?.gb || cl[R]?.gb) cf.push(fila3(cl[L]?.gb, "Juegos detrás", cl[R]?.gb));
  if (cf.length) out.push(`<h4 class="pksub">Clasificación</h4><div class="pkcard">${cab}${cf.join("")}</div>`);
  // estadísticas de temporada
  if ((P.stats || []).length) {
    const idx = (s) => (s === "h" ? 1 : 2), xs = ui.stTodo ? P.stats : P.stats.slice(0, 8);
    const peor = /contra|concedid|recibid|pérdid|turnover/i;
    out.push(`<h4 class="pksub">Estadísticas de temporada</h4><div class="pkcard">${cab}${xs.map((r) => {
      const a = r[idx(L)], b = r[idx(R)], x = num(a), y = num(b), inv = peor.test(r[0]), okA = !isNaN(x) && !isNaN(y) && (inv ? x < y : x > y), okB = !isNaN(x) && !isNaN(y) && (inv ? y < x : y > x);
      return fila3(a, r[0], b, okA, okB); }).join("")}
      ${P.stats.length > 8 ? `<button class="pvmas" data-act="sttodo">${ui.stTodo ? "Ver menos" : `Ver todo (${P.stats.length})`}</button>` : ""}</div>`);
  }
  // líderes
  if ((P.lid || []).length) {
    const cats = [...new Set(P.lid.map((l) => l.cat))].slice(0, 4);
    out.push(`<h4 class="pksub">Líderes del equipo</h4><div class="pkcard">${cats.map((c) => {
      const a = P.lid.find((l) => l.cat === c && l.s === L), b = P.lid.find((l) => l.cat === c && l.s === R);
      const va = a ? lidVal(a.v) : ["—", ""], vb = b ? lidVal(b.v) : ["—", ""];
      return `<div class="pvl"><div><b>${esc(va[0])}${va[1] ? ` <small>${esc(va[1])}</small>` : ""}</b><small>${esc(a ? a.j : "")}</small></div><span>${esc(LID_ES[c] || c)}</span><div class="r"><b>${esc(vb[0])}${vb[1] ? ` <small>${esc(vb[1])}</small>` : ""}</b><small>${esc(b ? b.j : "")}</small></div></div>`; }).join("")}</div>`);
  }
  // serie de la temporada / últimos cruces
  if (P.serie && (P.serie.ev || []).length) {
    out.push(`<h4 class="pksub">${g.dep === "nba" ? "Serie de temporada" : "Enfrentamientos"}</h4><div class="pkcard">${P.serie.txt ? `<div class="small" style="margin-bottom:6px">${esc(P.serie.txt)}</div>` : ""}${P.serie.ev.map((e) =>
      `<div class="fr"><span class="d" style="margin:0 10px 0 0;text-align:left">${new Date(e.at).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }).replace(/\./g, "")}</span>${e.st === "post" ? "Final" : "Programado"}<span class="s">${e.st === "post" ? esc(e.m) : "—"}</span></div>`).join("")}</div>`);
  }
  return out.join("");
}

function prevRot(g) {
  if (g.dep !== "nba") return "";
  if (!PREV) { cargarPrev(); return ""; }
  const P = PREV[g.id]; if (!P || !P.rot) return "";
  const [L, R] = ordSides(g), t = ui.rotT && P.rot[ui.rotT] ? ui.rotT : L, rot = P.rot[t] || [];
  if (!rot.length) return "";
  return `<h4 class="pksub">Plantilla</h4><div class="pk5 wide">${[L, R].map((s) => `<button class="${t === s ? "on" : ""}" data-act="rott" data-k="${s}">${esc(abT(g[s]))}</button>`).join("")}</div>
    <div class="small" style="margin:8px 2px">Rotación proyectada por posición. El quinteto titular no está confirmado hasta poco antes del partido.</div>
    <div class="pkcard">${rot.map((r) => { const [t1, ...rest] = r.js;
      return `<div class="pvr2"><span class="pvp">${r.pos}</span><div><b>${esc(t1.n)}</b>${t1.num ? `<small>#${esc(t1.num)}</small>` : ""}${t1.st ? `<em class="${/out|fuera/i.test(t1.st) ? "out" : "dd"}">${esc(/out/i.test(t1.st) ? "Fuera" : t1.st)}</em>` : ""}
        <p>${rest.map((j, i) => `${i + 2} ${esc(j.n)}${j.st ? ` (${esc(/out/i.test(j.st) ? "fuera" : j.st)})` : ""}`).join(" · ")}</p></div></div>`; }).join("")}</div>`;
}
function actPrev(a, el) {
  if (a === "sttodo") { ui.stTodo = !ui.stTodo; openGame(sheetState.id, sheetState.tab); return true; }
  if (a === "rott") { ui.rotT = el.dataset.k; openGame(sheetState.id, sheetState.tab); return true; }
  return false;
}
