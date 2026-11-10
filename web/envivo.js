// CASHBET · ficha del partido EN VIVO (como IABET): al abrir un partido empezado o terminado se pide
// el resumen de ESPN directo desde el celular y se actualiza cada 30 s mientras está en vivo.
// Previa: estadio, TV, probabilidad antes del partido, líneas de cierre, forma, cuotas y movimiento.
// Estadísticas: jugadores (tabla ordenable) y equipos (comparación + mapa de tiros).
// Resumen: situación en vivo, marcador por periodo, líderes, probabilidad de victoria y cara a cara.
// Eventos: momentos clave (cambios de líder y rachas en NBA; goles, tarjetas y cambios en fútbol).
const VS = {};                 // gid -> {t, d}
let VV_TIMER = null;
I.court = I.court || '<path d="M4 20V6a8 8 0 0 1 16 0v14M4 20h16M9 20v-5h6v5"/>';
I.pulse = I.pulse || '<path d="M3 12h4l3-8 4 16 3-8h4"/>';
I.list = I.list || '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>';

const amDec = (a) => { a = parseFloat(String(a ?? "").replace(/[^\d.+-]/g, "")); return !a ? null : a > 0 ? 1 + a / 100 : 1 + 100 / -a; };
const lineaN = (s) => (s == null ? null : String(s).replace(/^[ou]/i, ""));

async function vvCargar(gid, r) {
  const v = VS[gid];
  if (v && Date.now() - v.t < (r.st === "in" ? 25e3 : 6e5)) return false;
  try {
    const d = await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/${espnUrl(r.lg)}/summary?event=${gid}${r.lg === "nba" ? "" : `&lang=es&region=${r.lg === "col.1" ? "co" : "mx"}`}`)).json();
    if (!d || !d.header) return false;
    VS[gid] = { t: Date.now(), d };
    // marcador y estado al día en la ficha y en el calendario
    const c = d.header.competitions[0], st = (c.status || {}).type || {};
    (c.competitors || []).forEach((x) => { const s = x.homeAway === "home" ? "h" : "a"; if (r[s]) { r[s].s = x.score; const rec = (x.record || [])[0]; if (rec && !r[s].rec) r[s].rec = rec.summary; } });
    if (st.state) { r.st = st.state === "pre" ? r.st : st.state; r.det = detEs(st, r.dep); }
    return true;
  } catch (e) { return false; }
}
// "1:18 - 2nd" -> "Q2 1:18"; "Halftime" -> "Medio tiempo"
function detEs(st, dep) {
  if (st.state === "post") return "Final";
  const s = st.shortDetail || st.detail || "";
  if (dep !== "nba") return s;
  if (/half/i.test(s)) return "Medio tiempo";
  let m = /^End of (\d)/i.exec(s) || /^End (\d)/i.exec(s);
  if (m) return `Fin Q${m[1]}`;
  m = /([\d:.]+)\s*-\s*(\d)(?:st|nd|rd|th)/i.exec(s);
  if (m) return `Q${m[2]} ${m[1]}`;
  m = /([\d:.]+)\s*-\s*OT/i.exec(s);
  return m ? `Prórroga ${m[1]}` : s;
}
// arranca la carga y el refresco automático (cada 30 s) mientras la ficha siga abierta y en vivo
function vvAbrir(gid, r) {
  clearInterval(VV_TIMER);
  const pinta = () => { if ($(".sheet.on") && sheetState.res === gid) openResultado(gid, true); };
  vvCargar(gid, r).then((ok) => ok && pinta());
  if (r.st === "in") VV_TIMER = setInterval(() => {
    if (!$(".sheet.on") || sheetState.res !== gid) return clearInterval(VV_TIMER);
    if (!document.hidden) vvCargar(gid, r).then((ok) => ok && pinta());
  }, 30e3);
}

// ---------------------------------------------------------------- ayudas
const vvComp = (d) => d.header.competitions[0];
function vvLados(d) {
  const o = {};
  (vvComp(d).competitors || []).forEach((x) => (o[x.homeAway === "home" ? "h" : "a"] = x));
  return o;
}
const vvLado = (d, teamId) => { const L = vvLados(d); return L.h && L.h.team.id === String(teamId) ? "h" : "a"; };
const vvCol = (x, alt) => "#" + ((x && x.team && (x.team.color || alt)) || "888");
const vvPer = (n, dep) => (dep === "nba" ? (n > 4 ? `OT${n > 5 ? n - 4 : ""}` : `Q${n}`) : n === 1 ? "1T" : n === 2 ? "2T" : `P${n}`);
// fila comparativa "valor izq · etiqueta · valor der" con barra
function vvFila(lab, a, b, opts = {}) {
  const x = parseFloat(String(a).replace(/[^\d.-]/g, "")) || 0, y = parseFloat(String(b).replace(/[^\d.-]/g, "")) || 0, t = x + y || 1;
  const mejor = opts.menos ? (x < y ? "L" : y < x ? "R" : "") : x > y ? "L" : y > x ? "R" : "";
  return `<div class="rsr"><div class="rsl"><b class="${mejor === "L" ? "w" : ""}">${esc(a)}</b><span>${esc(lab)}</span><b class="${mejor === "R" ? "w" : ""}">${esc(b)}</b></div>
    ${opts.sinBarra ? "" : `<div class="rsb"><i style="width:${(100 * x) / t}%" class="${mejor === "L" ? "w" : ""}"></i><i style="width:${(100 * y) / t}%" class="${mejor === "R" ? "w" : ""}"></i></div>`}</div>`;
}
const vvCab = (r, L, R, tit, icono) => `<div class="rsh">${crest(r[L], 26)}<span>${icono ? ic(icono) : ""}${esc(tit)}</span>${crest(r[R], 26)}</div>`;
const vvSub = (k, items, cur) => `<div class="vvseg">${items.map(([v, l]) => `<button class="${cur === v ? "on" : ""}" data-act="${k}" data-k="${v}">${l}</button>`).join("")}</div>`;

// ---------------------------------------------------------------- pestañas
// devuelve el HTML de la pestaña o null (entonces se usa la versión del robot)
function vvTab(r, gid, tab) {
  const v = VS[gid]; if (!v) return null;
  const d = v.d, L = r.dep === "nba" ? "a" : "h", R = r.dep === "nba" ? "h" : "a";
  try {
    if (r.dep !== "nba" && typeof fPrevia === "function") {   // fútbol: futvivo.js
      if (tab === "previa") return rPrevia(r, gid) + fPrevia(r, gid, d);
      if (tab === "stats") return fStats(r, gid, d);
      if (tab === "resumen") return fResumen(r, gid, d);
      return fEventos(r, d);
    }
    if (tab === "previa") return rPrevia(r, gid) + vvPrevia(r, gid, d, L, R);
    if (tab === "stats") return vvStats(r, d, L, R);
    if (tab === "resumen") return vvResumen(r, gid, d, L, R);
    return vvEventos(r, d, L, R);
  } catch (e) { console.warn("envivo", e); return null; }
}

// ---- PREVIA
function vvPrevia(r, gid, d, L, R) {
  const c = vvComp(d), gi = d.gameInfo || {}, ven = gi.venue || {}, g = D.byId && D.byId[gid];
  const foto = ((ven.images || [])[0] || {}).href, ciudad = [((ven.address || {}).city), ((ven.address || {}).state)].filter(Boolean).join(", ");
  const tv = [...new Set((c.broadcasts || []).map((b) => (b.media || {}).shortName).filter(Boolean))];
  const arb = (gi.officials || []).map((o) => o.displayName || o.fullName).filter(Boolean);
  const temp = d.header.season ? `${d.header.season.year - 1}–${String(d.header.season.year).slice(2)} · ${d.header.season.type === 3 ? "Playoffs" : "Temporada regular"}` : r.liga;
  let h = `<div class="pkcard vvinfo">${foto ? `<div class="vvfoto"><img src="${esc(foto)}" alt="" loading="lazy"></div>` : ""}
    ${ven.fullName ? `<b class="vvven">${esc(ven.fullName)}</b><span class="small">${esc(ciudad)}</span>` : ""}
    <div class="vvkv"><span>Inicio</span><b>${esc(new Date(c.date || r.at).toLocaleString("es-CO", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }))}</b></div>
    <div class="vvkv"><span>Competición</span><b>${esc(r.dep === "nba" ? temp : r.liga)}</b></div>
    ${tv.length ? `<div class="vvkv"><span>Se emite en</span><b>${esc(tv.join(", "))}</b></div>` : ""}
    ${arb.length ? `<div class="vvkv"><span>${r.dep === "nba" ? "Árbitros" : "Árbitro"}</span><b>${esc(arb.slice(0, 3).join(", "))}</b></div>` : ""}</div>`;
  // probabilidad antes del partido: la de ESPN (primera jugada) o la de nuestro modelo
  const wp = d.winprobability || [];
  const pre = wp.length ? wp[0].homeWinPercentage : g && g.mercados && g.mercados.ml ? g.mercados.ml.h : null;
  if (pre != null && r.dep === "nba") {
    const pa = { h: pre, a: 1 - pre };
    h += `<div class="pkcard"><div class="vvt">${ic("pulse")}Probabilidad de victoria<small>Antes del partido</small></div>
      <div class="vvpb2"><div><span><i style="background:${vvCol(vvLados(d)[L])}"></i>${esc(abT(r[L]))}</span></div><div><span><i style="background:${vvCol(vvLados(d)[R])}"></i>${esc(abT(r[R]))}</span></div></div>
      <div class="vvpb"><b>${pct(pa[L], 1)}</b><div class="vvpbar"><i style="width:${pa[L] * 100}%;background:${vvCol(vvLados(d)[L])}"></i><i style="width:${pa[R] * 100}%;background:${vvCol(vvLados(d)[R])}"></i></div><b>${pct(pa[R], 1)}</b></div></div>`;
  }
  h += vvCuotas(r, g, d, L, R);
  // forma reciente (últimos 5) de cada equipo, con lo que ya tiene el robot
  if (g && g.forma && (g.forma.h || g.forma.a)) {
    const fila = (s) => { const xs = (g.forma[s] || []).slice(0, 5), gan = xs.filter((x) => x.r === "G").length, emp = xs.filter((x) => x.r === "E").length;
      return `<div class="vvfh">${crest(r[s], 22)}<b>${esc(abT(r[s]))}</b><em>${gan}-${xs.length - gan - emp}${emp ? `-${emp}` : ""}</em><span class="vvwl">${xs.map((x) => `<i class="${x.r}">${x.r === "G" ? "G" : x.r === "E" ? "E" : "P"}</i>`).join("")}</span></div>
        ${xs.map((x) => `<div class="vvfr"><i class="${x.r}">${x.r}</i><span>${x.loc ? "vs" : "@"}</span><b>${esc(x.vs)}</b><em>${esc(x.m)}</em><small>${esc(new Date(x.at).toLocaleDateString("es-CO", { day: "numeric", month: "short" }))}</small></div>`).join("")}`; };
    h += `<div class="pkcard"><div class="vvt">${ic("list")}Forma reciente<small>Últimos 5</small></div>${fila(L)}<div style="height:10px"></div>${fila(R)}</div>`;
  }
  return h;
}
// cuotas: apertura → cierre (y en vivo) de ganador, hándicap y total. NBA: pickcenter de ESPN; fútbol: cuotas del robot
function vvCuotas(r, g, d, L, R) {
  const pc = (d.pickcenter || [])[0];
  const fl = (a, b) => (a && b ? (b > a + 0.005 ? "↑" : b < a - 0.005 ? "↓" : "→") : "");
  const celda = (lab, ab, ci, vi, nota) => `<div class="vvod"><span>${esc(lab)}</span><b>${ci ? odd(ci) : "—"}</b><small>${ab ? `${odd(ab)} → ${ci ? odd(ci) : "—"} ${fl(ab, ci)}` : ""}${vi ? ` · en vivo ${odd(vi)}` : ""}</small>${nota ? `<em>${esc(nota)}</em>` : ""}</div>`;
  if (pc && pc.moneyline) {
    const ml = pc.moneyline, ps = pc.pointSpread || {}, tt = pc.total || {};
    const sd = { h: "home", a: "away" }, q = (o, s, k) => amDec((((o || {})[s] || {})[k] || {}).odds), ln = (o, s, k) => lineaN((((o || {})[s] || {})[k] || {}).line);
    const ab = { h: q(ml, "home", "open"), a: q(ml, "away", "open") }, ci = { h: q(ml, "home", "close"), a: q(ml, "away", "close") }, vi = { h: q(ml, "home", "live"), a: q(ml, "away", "live") };
    const marg = ci.h && ci.a ? 1 / ci.h + 1 / ci.a - 1 : null;
    const favAb = ab.h && ab.a ? (ab.h < ab.a ? "h" : "a") : null, favCi = ci.h && ci.a ? (ci.h < ci.a ? "h" : "a") : null;
    let h = `<div class="pkcard"><div class="vvt">${ic("trend")}Líneas de cierre<small>${esc((pc.provider || {}).name || "")}</small></div>
      <div class="vvod2">${[L, R].map((s) => celda(abT(r[s]), ab[s], ci[s], r.st === "in" ? vi[s] : null, ci[s] ? `${Math.round(100 / ci[s] / (1 + (marg || 0)))}% probabilidad` : "")).join("")}</div>
      ${marg != null ? `<div class="small" style="text-align:center;margin-top:8px">Margen de la casa ${(marg * 100).toFixed(1)}%</div>` : ""}</div>`;
    h += `<div class="pkcard"><div class="vvt">${ic("bars2")}Cuotas</div>
      <div class="vvsec">Ganador</div><div class="vvod2">${[L, R].map((s) => celda(abT(r[s]), ab[s], ci[s], r.st === "in" ? vi[s] : null)).join("")}</div>
      ${favAb && favCi && favAb !== favCi ? `<div class="vvnota">Cambio de favorito: ${esc(abT(r[favAb]))} abrió como favorito</div>` : ""}
      <div class="vvsec">Hándicap</div><div class="vvod2">${[L, R].map((s) => celda(`${abT(r[s])} ${ln(ps, sd[s], "close") || ""}`, q(ps, sd[s], "open"), q(ps, sd[s], "close"), r.st === "in" ? q(ps, sd[s], "live") : null, r.st === "in" && ln(ps, sd[s], "live") ? `en vivo ${ln(ps, sd[s], "live")}` : "")).join("")}</div>
      ${ln(ps, "home", "open") && ln(ps, "home", "open") !== ln(ps, "home", "close") ? `<div class="vvnota">La línea de ${esc(abT(r.h))} pasó de ${esc(ln(ps, "home", "open"))} a ${esc(ln(ps, "home", "close"))}</div>` : ""}
      <div class="vvsec">Total de puntos</div><div class="vvod2">${[["over", "Más de"], ["under", "Menos de"]].map(([k, l]) => celda(`${l} ${ln(tt, k, "close") || ""}`, q(tt, k, "open"), q(tt, k, "close"), r.st === "in" ? q(tt, k, "live") : null, r.st === "in" && ln(tt, k, "live") ? `en vivo ${ln(tt, k, "live")}` : "")).join("")}</div>
      ${ln(tt, "over", "open") && ln(tt, "over", "open") !== ln(tt, "over", "close") ? `<div class="vvnota">La línea pasó de ${esc(ln(tt, "over", "open"))} a ${esc(ln(tt, "over", "close"))}</div>` : ""}
      <div class="vvsec">Movimiento de línea <small>apertura → cierre</small></div>
      <div class="vvmv">${[
        [`${abT(r.a)} · Hándicap`, ln(ps, "away", "open"), q(ps, "away", "open"), ln(ps, "away", "close"), q(ps, "away", "close")],
        [`${abT(r.h)} · Hándicap`, ln(ps, "home", "open"), q(ps, "home", "open"), ln(ps, "home", "close"), q(ps, "home", "close")],
        ["Total", ln(tt, "over", "open"), q(tt, "over", "open"), ln(tt, "over", "close"), q(tt, "over", "close")],
        [`${abT(r.a)} · Ganador`, "", ab.a, "", ci.a], [`${abT(r.h)} · Ganador`, "", ab.h, "", ci.h]]
        .filter((x) => x[2] || x[4]).map(([l, l1, o1, l2, o2]) => { const dl = l1 && l2 ? parseFloat(l2) - parseFloat(l1) : null;
          return `<div><span>${esc(l)}</span><b>${esc(l1 || "")} ${odd(o1)}</b><em>→</em><b>${esc(l2 || "")} ${odd(o2)}</b><small class="${dl > 0 ? "up" : dl < 0 ? "dn" : ""}">${dl ? (dl > 0 ? "+" : "") + n1(dl) : ""}</small></div>`; }).join("")}</div></div>`;
    return h;
  }
  // fútbol: cuotas que guardó el robot (apertura y última vista)
  const o = g && g.odds, mv = g && g.mov;
  if (!o || !(o.h || o.a)) return "";
  const ini = (mv && mv.ini) || {};
  const it = [["h", abT(r.h)], ["d", "Empate"], ["a", abT(r.a)]].filter(([k]) => o[k]);
  return `<div class="pkcard"><div class="vvt">${ic("bars2")}Cuotas<small>${esc(o.prov || "")}</small></div><div class="vvsec">Ganador (1X2)</div>
    <div class="vvod3">${it.map(([k, l]) => celda(l, ini[k], o[k], null)).join("")}</div>
    ${o.ou ? `<div class="vvsec">Total de goles</div><div class="vvod2">${celda(`Línea ${o.ou}`, null, null, null, ini.ou && ini.ou !== o.ou ? `abrió en ${ini.ou}` : "")}</div>` : ""}</div>`;
}

// ---- ESTADÍSTICAS
const NBA_EQ = [
  ["Tiro", [["fieldGoalsMade-fieldGoalsAttempted", "Tiros de campo"], ["fieldGoalPct", "TC %"], ["threePointFieldGoalsMade-threePointFieldGoalsAttempted", "Triples"], ["threePointFieldGoalPct", "Triples %"], ["freeThrowsMade-freeThrowsAttempted", "Tiros libres"], ["freeThrowPct", "TL %"]]],
  ["Producción", [["totalRebounds", "Rebotes"], ["offensiveRebounds", "Rebotes ofensivos"], ["defensiveRebounds", "Rebotes defensivos"], ["assists", "Asistencias"], ["steals", "Robos"], ["blocks", "Tapones"]]],
  ["Eficiencia", [["totalTurnovers", "Pérdidas", 1], ["turnoverPoints", "Puntos tras pérdida del rival"], ["fastBreakPoints", "Contraataque"], ["pointsInPaint", "Puntos en la pintura"]]],
  ["Disciplina", [["fouls", "Faltas", 1], ["technicalFouls", "Faltas técnicas", 1], ["flagrantFouls", "Faltas flagrantes", 1]]],
  ["Desarrollo del juego", [["largestLead", "Mayor ventaja"], ["leadChanges", "Cambios de líder", 2], ["leadPercentage", "Tiempo liderando %"]]],
];
const FUT_EQ = [
  ["Ataque", [["possessionPct", "Posesión %"], ["totalShots", "Tiros"], ["shotsOnTarget", "Tiros a puerta"], ["wonCorners", "Córners"], ["offsides", "Fueras de lugar", 1], ["penaltyKickGoals", "Goles de penal"]]],
  ["Pases", [["totalPasses", "Pases"], ["accuratePasses", "Pases acertados"], ["passPct", "Precisión de pase", 0, "%"], ["totalCrosses", "Centros"], ["accurateCrosses", "Centros acertados"], ["totalLongBalls", "Balones largos"]]],
  ["Defensa", [["totalTackles", "Entradas"], ["effectiveTackles", "Entradas ganadas"], ["interceptions", "Intercepciones"], ["blockedShots", "Tiros bloqueados"], ["totalClearance", "Despejes"], ["saves", "Atajadas"]]],
  ["Disciplina", [["foulsCommitted", "Faltas", 1], ["yellowCards", "Tarjetas amarillas", 1], ["redCards", "Tarjetas rojas", 1]]],
];
function vvStats(r, d, L, R) {
  const sub = sheetState.sub || "jug";
  return vvSub("vvsub", [["jug", "Jugadores"], ["eq", "Equipos"]], sub) + (sub === "jug" ? vvJugadores(r, d, L, R) : vvEquipos(r, d, L, R));
}
function vvJugadores(r, d, L, R) {
  const lado = sheetState.eq || L, side = vvLados(d)[lado];
  const head = `<div class="pkcard"><div class="vvt">${r.dep === "nba" ? "Jugadores<small>Toca una columna para ordenar</small>" : "Alineaciones"}</div>${vvSub("vveq", [[L, esc(abT(r[L]))], [R, esc(abT(r[R]))]], lado)}`;
  if (r.dep !== "nba") {
    // fútbol: alineación con formación, titulares y suplentes
    const ro = (d.rosters || []).find((x) => side && x.team && x.team.id === side.team.id);
    if (!ro || !(ro.roster || []).length) return head + `<div class="empty">ESPN todavía no publica la alineación.</div></div>`;
    const st = (p, k) => { const s = (p.stats || []).find((x) => x.abbreviation === k || x.name === k); return s ? s.displayValue : ""; };
    const fila = (p) => { const g = +st(p, "G") || +st(p, "totalGoals") || 0, a = +st(p, "A") || +st(p, "goalAssists") || 0, ta = +st(p, "TA") || +st(p, "yellowCards") || 0, tr = +st(p, "TR") || +st(p, "redCards") || 0;
      return `<div class="vvpl"><em>${esc(p.jersey || "")}</em><b class="${p.starter ? "tit" : ""}">${esc((p.athlete || {}).displayName || "")}</b><small>${esc((p.position || {}).abbreviation || "")}</small>
        <span>${g ? `<i class="gl">${ic("ball")}${g > 1 ? g : ""}</i>` : ""}${a ? `<i class="as">A${a > 1 ? a : ""}</i>` : ""}${ta ? `<i class="ta"></i>` : ""}${tr ? `<i class="tr"></i>` : ""}${p.subbedIn ? `<i class="in">↑</i>` : ""}${p.subbedOut ? `<i class="out">↓</i>` : ""}</span></div>`; };
    const tit = ro.roster.filter((p) => p.starter), sup = ro.roster.filter((p) => !p.starter);
    return head + `${ro.formation ? `<div class="vvsec">Formación ${esc(ro.formation)}</div>` : ""}<div class="vvsec">Titulares</div>${tit.map(fila).join("")}<div class="vvsec">Suplentes</div>${sup.map(fila).join("")}</div>`;
  }
  const bx = ((d.boxscore || {}).players || []).find((x) => side && x.team && x.team.id === side.team.id);
  const grp = bx && (bx.statistics || [])[0];
  if (!grp || !(grp.athletes || []).length) return head + `<div class="empty">ESPN todavía no publica las estadísticas de los jugadores.</div></div>`;
  const lab = grp.names || grp.labels || [], ord = sheetState.ord || "PTS";
  const cols = ["MIN", "PTS", "REB", "AST", "FG", "3PT", "FT", "STL", "BLK", "TO", "PF", "+/-"].filter((k) => lab.includes(k));
  const NOM = { MIN: "MIN", PTS: "PTS", REB: "REB", AST: "AST", FG: "TC", "3PT": "3P", FT: "TL", STL: "ROB", BLK: "TAP", TO: "PER", PF: "FAL", "+/-": "+/-" };
  const val = (a, k) => { const v = (a.stats || [])[lab.indexOf(k)]; if (v == null) return -999; const m = /^(\d+)-(\d+)$/.exec(v); return m ? +m[1] + m[2] / 1000 : parseFloat(v) || 0; };
  const jug = grp.athletes.filter((a) => (a.stats || []).length).sort((a, b) => val(b, ord) - val(a, ord));
  const fuera = grp.athletes.filter((a) => !(a.stats || []).length);
  return head + `<div class="vvtbl"><table><thead><tr><th>Jugador</th>${cols.map((k) => `<th class="${k === ord ? "on" : ""}" data-act="vvord" data-k="${k}">${NOM[k]}${k === ord ? " ▾" : ""}</th>`).join("")}</tr></thead>
    <tbody>${jug.map((a) => `<tr><td class="${a.starter ? "tit" : ""}">${esc((a.athlete || {}).shortName || (a.athlete || {}).displayName)}${a.active && r.st === "in" ? `<i class="vvon" title="En cancha"></i>` : ""}</td>${cols.map((k) => `<td class="${k === ord ? "on" : ""}">${esc(a.stats[lab.indexOf(k)] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
    <div class="small" style="margin-top:8px"><b class="vvtit">Naranja</b> = titular${r.st === "in" ? ' · <i class="vvon"></i> en cancha ahora' : ""}${fuera.length ? ` · No jugaron: ${esc(fuera.map((a) => (a.athlete || {}).shortName + (a.reason ? ` (${esc(motivoEs(a.reason))})` : "")).join(", "))}` : ""}</div></div>`;
}
const MOTIVO = { "coach's decision": "decisión del técnico", "dnp-coach's decision": "decisión del técnico", injury: "lesión", "not with team": "no está con el equipo", suspension: "suspensión", illness: "enfermedad", rest: "descanso" };
const motivoEs = (m) => { const k = String(m).toLowerCase().trim(); return MOTIVO[k] || Object.entries(MOTIVO).find(([x]) => k.includes(x))?.[1] || k; };
function vvEquipos(r, d, L, R) {
  const tms = (d.boxscore || {}).teams || [];
  if (tms.length < 2) return `<div class="empty">ESPN todavía no publica las estadísticas de los equipos.</div>`;
  const by = {}; tms.forEach((t) => { const s = vvLado(d, t.team.id); by[s] = {}; (t.statistics || []).forEach((x) => (by[s][x.name] = x.displayValue)); });
  const G = r.dep === "nba" ? NBA_EQ : FUT_EQ;
  let h = `<div class="pkcard rst2">${vvCab(r, L, R, "Comparación de equipos")}${G.map(([tit, xs]) => {
    const fs = xs.filter(([k]) => by[L][k] != null && by[R][k] != null);
    if (!fs.length) return "";
    return `<div class="vvsec">${tit}</div>${fs.map(([k, l, menos, suf]) => { let a = by[L][k], b = by[R][k];
      if (suf === "%" && +a <= 1 && +b <= 1) { a = Math.round(a * 100) + "%"; b = Math.round(b * 100) + "%"; }
      return vvFila(l, a, b, { menos: menos === 1, sinBarra: menos === 2 }); }).join("")}`;
  }).join("")}</div>`;
  if (r.dep === "nba") h += vvMapa(r, d, L, R);
  return h;
}
// mapa de tiros: media cancha, anotados (relleno) y fallados (x); filtro por equipo
function vvMapa(r, d, L, R) {
  const lado = sheetState.meq || L, side = vvLados(d)[lado]; if (!side) return "";
  const tiros = (d.plays || []).filter((p) => p.shootingPlay && p.team && p.team.id === side.team.id && p.coordinate && p.coordinate.x >= 0 && p.coordinate.x <= 50 && p.coordinate.y >= 0 && p.coordinate.y < 47 && !/free throw|tiro libre/i.test((p.type || {}).text || p.text || ""));
  const an = tiros.filter((p) => p.scoringPlay).length, col = vvCol(side);
  const X = (x) => x * 6, Y = (y) => (y + 4.5) * 6;   // 6 px por pie; el aro a 4.5 pies de la línea de fondo
  const marcas = tiros.map((p) => { const x = X(p.coordinate.x), y = Y(p.coordinate.y);
    return p.scoringPlay ? `<circle cx="${x}" cy="${y}" r="5" fill="${col}" stroke="#fff" stroke-width="1"/>` : `<path d="M${x - 4} ${y - 4}l8 8M${x + 4} ${y - 4}l-8 8" stroke="var(--tx3)" stroke-width="2"/>`; }).join("");
  return `<div class="pkcard"><div class="vvt">${ic("court")}Mapa de tiros<small>${tiros.length ? Math.round((100 * an) / tiros.length) : 0}% TC</small></div>
    ${vvSub("vvmeq", [[L, esc(abT(r[L]))], [R, esc(abT(r[R]))]], lado)}
    <div class="small" style="margin:6px 0"><b style="color:${col}">●</b> Anotados (${an}) · <b>✕</b> Fallados (${tiros.length - an}) · sin tiros libres</div>
    <svg class="vvcourt" viewBox="0 0 300 250"><g fill="none" stroke="var(--line)" stroke-width="2">
      <rect x="1" y="1" width="298" height="248"/><rect x="102" y="1" width="96" height="114"/><circle cx="150" cy="115" r="36"/>
      <path d="M18 1v84a142 142 0 0 0 264 0V1"/><circle cx="150" cy="${Y(0)}" r="4.5"/><path d="M132 ${Y(0) - 7}h36"/><path d="M114 249a36 36 0 0 1 72 0"/></g>${marcas}</svg></div>`;
}

// ---- RESUMEN
function vvResumen(r, gid, d, L, R) {
  const c = vvComp(d), S = vvLados(d);
  let h = "";
  // situación en vivo (NBA): tiempos muertos, faltas y bonus
  if (r.dep === "nba" && r.st === "in" && S.h && S.h.fouls) {
    const f = (s) => S[s].fouls || {}, BON = { DOUBLE: "Doble", SINGLE: "Bonus", NONE: "Sin bonus" };
    h += `<div class="pkcard vvsit"><div class="vvt">${ic("pulse")}Situación en vivo</div>${vvCab(r, L, R, "")}
      ${[["Tiempos muertos restantes", (s) => S[s].timeoutsRemaining], ["Faltas del equipo en el periodo", (s) => f(s).teamFoulsCurrent], ["Faltas totales del equipo", (s) => f(s).teamFouls], ["Faltas por dar", (s) => f(s).foulsToGive], ["Estado de bonus", (s) => BON[f(s).bonusState] || f(s).bonusState || "—"]]
        .map(([l, fn]) => `<div class="vvsr"><b class="${l === "Estado de bonus" && f(L).bonusState && f(L).bonusState !== "NONE" ? "bon" : ""}">${esc(fn(L) ?? "—")}</b><span>${l}</span><b class="${l === "Estado de bonus" && f(R).bonusState && f(R).bonusState !== "NONE" ? "bon" : ""}">${esc(fn(R) ?? "—")}</b></div>`).join("")}
      ${S.h.possession != null && (S.h.possession || S.a.possession) ? `<div class="small" style="text-align:center;margin-top:6px">Posesión: <b>${esc(abT(r[S.h.possession ? "h" : "a"]))}</b></div>` : ""}</div>`;
  }
  // marcador por periodo
  const ls = (s) => (S[s] && S[s].linescores) || [];
  if (ls(L).length) {
    const n = Math.max(ls(L).length, ls(R).length);
    h += `<div class="pkcard"><div class="vvt">Marcador por ${r.dep === "nba" ? "cuarto" : "tiempo"}<small>${esc(r.det || "")}</small></div><div class="vvls"><table><tr><th></th>${Array.from({ length: n }, (_, i) => `<th>${vvPer(i + 1, r.dep)}</th>`).join("")}<th>T</th></tr>
      ${[L, R].map((s) => `<tr><td>${crest(r[s], 18)}<b>${esc(abT(r[s]))}</b></td>${Array.from({ length: n }, (_, i) => `<td>${esc((ls(s)[i] || {}).displayValue ?? "")}</td>`).join("")}<td class="t">${esc(S[s].score ?? "")}</td></tr>`).join("")}</table></div></div>`;
  }
  // líderes del juego
  const lid = (d.leaders || []);
  if (lid.length) {
    const cats = r.dep === "nba" ? [["points", "Puntos"], ["assists", "Asistencias"], ["rebounds", "Rebotes"]] : null;
    const blq = { h: [], a: [] };
    lid.forEach((b) => { const s = vvLado(d, (b.team || {}).id); (b.leaders || []).forEach((ct) => blq[s].push(ct)); });
    const nombres = cats || [...new Set([...blq[L], ...blq[R]].map((x) => x.name))].slice(0, 3).map((k) => [k, ([...blq[L], ...blq[R]].find((x) => x.name === k) || {}).displayName || k]);
    h += `<div class="pkcard"><div class="vvt">${ic("star")}Líderes del juego</div>${nombres.map(([k, l]) => {
      const uno = (s) => { const ct = blq[s].find((x) => x.name === k), x = ct && (ct.leaders || [])[0]; if (!x) return "";
        const a = x.athlete || {}, ft = (a.headshot || {}).href;
        return `<div class="vvld" style="--tc:${vvCol(S[s])}">${ft ? `<img src="${esc(ft)}" alt="" loading="lazy">` : `<span class="crest-f" style="width:44px;height:44px">${esc(sigla({ n: a.displayName }))}</span>`}<div><b>${esc(a.displayName || "")}</b><small>${esc(abT(r[s]))}${x.displayValue && /,|\d+-\d+/.test(x.displayValue) && r.dep !== "nba" ? "" : ""}</small></div><em>${esc(x.value != null ? Math.round(x.value) : x.displayValue)}</em></div>`; };
      return `<div class="vvsec">${esc(l)}</div>${uno(L)}${uno(R)}`;
    }).join("")}</div>`;
  }
  h += vvProb(r, d, L, R);
  // cara a cara: serie de la temporada (ESPN) o los que ya tiene el robot
  const ser = ((d.seasonseries || [])[0] || {}).events || [], g = D.byId && D.byId[gid];
  const h2h = ser.length ? ser.map((e) => { const cs = e.competitors || [], ho = cs.find((x) => x.homeAway === "home") || {}, aw = cs.find((x) => x.homeAway === "away") || {};
    const t = (x) => (x.team || {}).abbreviation || "";
    return { f: e.date, a: t(aw), h: t(ho), m: e.status === "post" || (e.statusType || {}).completed ? `${aw.score ?? ""} – ${ho.score ?? ""}` : e.id === gid ? "hoy" : "–" }; })
    : g && g.h2h && g.h2h.length ? g.h2h.slice(0, 5).map((x) => ({ f: x.at || x.d, a: x.a || x.vs || "", h: x.h || "", m: x.m || "" })) : [];
  if (h2h.length) h += `<div class="pkcard"><div class="vvt">${ic("swap")}Cara a cara<small>${ser.length ? "temporada" : "últimos"} · ${h2h.length}</small></div>${h2h.map((x) => `<div class="vvh2"><small>${x.f ? esc(new Date(x.f).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })) : ""}</small><b>${esc(x.a)}</b><em>${esc(x.m)}</em><b>${esc(x.h)}</b></div>`).join("")}</div>`;
  // crónica del robot solo si habla de los dos equipos
  if (r.recap && [r.h, r.a].every((t) => t && t.n && (r.recap.tit + " " + (r.recap.txt || "")).toLowerCase().includes(String(t.n).toLowerCase().split(" ").pop()))) h += rResumen(r);
  return h || `<div class="empty">Todavía no hay resumen de este partido.</div>`;
}
// probabilidad de victoria jugada a jugada (ESPN), con cambios de favorito, mayor giro y máximo
function vvProb(r, d, L, R) {
  const wp = d.winprobability || []; if (wp.length < 3) return "";
  const per = {}; (d.plays || []).forEach((p) => (per[p.id] = p));
  const S = vvLados(d), cL = vvCol(S[L]), cR = vvCol(S[R]);
  const pts = wp.map((w) => { const p = per[w.playId] || {}; return { v: L === "h" ? w.homeWinPercentage : 1 - w.homeWinPercentage, q: (p.period || {}).number || 1 }; });
  const W = 320, H = 130, n = pts.length, X = (i) => (i / (n - 1)) * W, Y = (v) => H - v * H;
  const line = pts.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(p.v).toFixed(1)}`).join("");
  const area = `${line}L${W} ${H / 2}L0 ${H / 2}Z`;
  let cambios = 0, giro = { d: 0 }, max = { v: 0 };
  pts.forEach((p, i) => {
    if (i && (p.v - 0.5) * (pts[i - 1].v - 0.5) < 0) cambios++;
    if (i && Math.abs(p.v - pts[i - 1].v) > Math.abs(giro.d)) giro = { d: p.v - pts[i - 1].v, q: p.q };
    const m = Math.max(p.v, 1 - p.v); if (m > max.v) max = { v: m, s: p.v >= 0.5 ? L : R, q: p.q };
  });
  const qs = []; pts.forEach((p, i) => { if (!i || p.q !== pts[i - 1].q) qs.push([i, p.q]); });
  const ult = pts[n - 1].v, vivo = r.st === "in";
  return `<div class="pkcard"><div class="vvt">${ic("pulse")}Probabilidad de victoria${vivo ? `<em class="vvnow"><i></i>Ahora</em>` : `<small>Final</small>`}</div>
    <div class="vvpb2"><div><span><i style="background:${cL}"></i>${esc(abT(r[L]))}</span><b>${pct(ult, 1)}</b></div><div><span><i style="background:${cR}"></i>${esc(abT(r[R]))}</span><b>${pct(1 - ult, 1)}</b></div></div>
    <svg class="vvwp" viewBox="0 0 ${W} ${H + 18}" preserveAspectRatio="none">
      <defs><clipPath id="vvarr"><rect width="${W}" height="${H / 2}"/></clipPath><clipPath id="vvab"><rect y="${H / 2}" width="${W}" height="${H / 2}"/></clipPath></defs>
      <path d="${area}" fill="${cL}" opacity=".22" clip-path="url(#vvarr)"/><path d="${area}" fill="${cR}" opacity=".22" clip-path="url(#vvab)"/>
      <path d="M0 ${H / 2}H${W}" stroke="var(--tx3)" stroke-dasharray="3 4" stroke-width="1"/>
      ${qs.map(([i, q]) => `${i ? `<path d="M${X(i)} 0V${H}" stroke="var(--line)" stroke-width="1"/>` : ""}<text x="${X(i) + 2}" y="${H + 14}" font-size="10" fill="var(--tx3)">${vvPer(q, r.dep)}</text>`).join("")}
      <path d="${line}" fill="none" stroke="${ult >= 0.5 ? cL : cR}" stroke-width="2"/><circle cx="${X(n - 1)}" cy="${Y(ult)}" r="3.5" fill="${ult >= 0.5 ? cL : cR}"/></svg>
    <div class="vvkv"><span>Cambios de favorito</span><b>${cambios}</b></div>
    <div class="vvkv"><span>Mayor giro</span><b>${esc(abT(r[giro.d >= 0 ? L : R]))} +${(Math.abs(giro.d) * 100).toFixed(1)}% · ${vvPer(giro.q, r.dep)}</b></div>
    <div class="vvkv"><span>Máximo</span><b>${esc(abT(r[max.s]))} ${pct(max.v, 1)} · ${vvPer(max.q, r.dep)}</b></div>
    <div class="vvkv"><span>Al inicio</span><b>${esc(abT(r[pts[0].v >= 0.5 ? L : R]))} ${pct(Math.max(pts[0].v, 1 - pts[0].v), 1)}</b></div></div>`;
}

// ---- EVENTOS
function vvMomentos(r, d) {
  const P = d.plays || [], out = [];
  let pa = 0, ph = 0, lider = null, run = null;
  const ab = (s) => abT(r[s]);
  const cierraRacha = (p) => { if (run && run.n >= 8) out.push({ k: "racha", q: run.q, t: run.t, s: run.s, n: run.n, a: run.a, h: run.h }); };
  for (const p of P) {
    const a = +p.awayScore || 0, hh = +p.homeScore || 0, q = (p.period || {}).number || 1, t = (p.clock || {}).displayValue || "";
    if (/^End Period|^Fin del/i.test((p.type || {}).text || "") || /^End of the/i.test(p.text || "")) out.push({ k: "fin", q, a, h: hh });
    const da = a - pa, dh = hh - ph;
    if (da > 0 || dh > 0) {
      const s = da > 0 ? "a" : "h", pt = da > 0 ? da : dh;
      if (run && run.s === s) { run.n += pt; run.t = t; run.q = q; run.a = a; run.h = hh; }
      else { cierraRacha(); run = { s, n: pt, t, q, a, h: hh }; }
      const nl = a > hh ? "a" : hh > a ? "h" : null;
      if (nl && lider && nl !== lider) out.push({ k: "lider", q, t, s: nl, dif: Math.abs(a - hh), a, h: hh, txt: p.text });
      if (nl) lider = nl;
      pa = a; ph = hh;
    }
  }
  if (run && run.n >= 8) out.push({ k: "racha", q: run.q, t: run.t, s: run.s, n: run.n, a: run.a, h: run.h, curso: r.st === "in" });
  return out.reverse().map((e) => Object.assign(e, { ab: ab(e.s || "a") }));
}
function vvEventos(r, d, L, R) {
  const f = sheetState.evf || "todos";
  if (r.dep === "nba") {
    const ms = vvMomentos(r, d), nl = ms.filter((e) => e.k === "lider").length, nr = ms.filter((e) => e.k === "racha").length;
    const xs = ms.filter((e) => f === "todos" || (f === "lider" && e.k === "lider") || (f === "racha" && e.k === "racha"));
    const sc = (e) => `${abT(r.a)} ${e.a} – ${e.h} ${abT(r.h)}`;
    return `<div class="pkcard"><div class="vvt">${ic("bolt2")}Momentos clave<small>${ms.length} eventos</small></div>
      ${vvSub("vvevf", [["todos", "Todos"], ["lider", `Cambios de líder <i>${nl}</i>`], ["racha", `Rachas <i>${nr}</i>`]], f)}
      ${xs.map((e) => e.k === "fin" ? `<div class="vvmf">Fin del ${vvPer(e.q, "nba").replace("Q", "")}.º cuarto · <b>${esc(sc(e))}</b></div>`
        : `<div class="vvmo ${e.k}"><div class="vvmt"><b>${esc(e.t)}</b><small>${vvPer(e.q, "nba")}</small></div><span class="vvmb" style="background:${vvCol(vvLados(d)[e.s])}">${e.k === "racha" ? `${e.n}-0` : `+${e.dif}`}</span>
          <div class="vvmd"><b>${e.k === "racha" ? `Racha de ${esc(e.ab)}${e.curso ? " (en curso)" : ""}` : `${esc(e.ab)} toma la ventaja`}</b><small>${e.k === "racha" ? `${e.n}-0 sin respuesta` : esc(e.txt || "")}</small><em>${esc(sc(e))}</em></div></div>`).join("") || `<div class="empty">Sin momentos clave todavía.</div>`}</div>`;
  }
  // fútbol: eventos en vivo (goles, tarjetas, cambios) + minuto a minuto
  const S = vvLados(d), lado = (k) => { const id = (k.team || {}).id; return id ? (S.h && S.h.team.id === id ? "h" : "a") : null; };
  const evs = (d.keyEvents || []).map((k) => {
    const tx = ((k.type || {}).text || "").trim(), low = tx.toLowerCase();
    const t = /propia/.test(low) ? "autogol" : /penal.*(fall|atajad|errad)/.test(low) ? "penalfallo" : /penal/.test(low) && /gol|anotad/.test(low) ? "penal" : /^gol/.test(low) ? "gol" : /segunda amarilla|roja/.test(low) ? "roja" : /amarilla/.test(low) ? "amarilla" : /sustituci/.test(low) ? "cambio" : /medio tiempo|final|inicio del segundo/.test(low) ? "marca" : null;
    const who = (k.participants || []).map((p) => (p.athlete || {}).displayName);
    return t && { t, tx, min: (k.clock || {}).displayValue, s: lado(k), j: who[0], j2: who[1] };
  }).filter(Boolean);
  const cat = { goles: ["gol", "penal", "autogol", "penalfallo"], tarjetas: ["amarilla", "roja"], cambios: ["cambio"] };
  const xs = evs.filter((e) => f === "todos" || (cat[f] || []).includes(e.t)).reverse();
  const com = (d.commentary || []).filter((c) => c.text).slice(-25).reverse();
  return `<div class="pkcard rev"><div class="vvt">${ic("bolt2")}Eventos<small>${evs.filter((e) => e.t !== "marca").length} eventos</small></div>
    ${vvSub("vvevf", [["todos", "Todos"], ["goles", "Goles"], ["tarjetas", "Tarjetas"], ["cambios", "Cambios"]], f)}
    ${xs.map((e) => { if (e.t === "marca") return `<div class="vvmf">${esc(e.tx)}</div>`;
      const [i, l, c] = EVI[e.t] || ["dot", e.tx, "n"];
      return `<div class="rer ${e.s === "a" ? "der" : ""}"><span class="rem">${esc(e.min || "")}</span><span class="rei ${c}">${ic(i)}</span><div><b>${esc(e.j || l)}</b><small>${esc(l)}${e.t === "cambio" && e.j2 ? ` · sale ${esc(e.j2)}` : ""}${e.s ? ` · ${esc(abT(r[e.s]))}` : ""}</small></div></div>`; }).join("") || `<div class="empty">Sin eventos todavía.</div>`}</div>
    ${com.length ? `<div class="pkcard"><div class="vvt">${ic("list")}Minuto a minuto</div>${com.map((c) => `<div class="vvcm"><b>${esc((c.time || {}).displayValue || "")}</b><span>${esc(c.text)}</span></div>`).join("")}</div>` : ""}`;
}

function actVivo(a, el) {
  if (typeof actFut === "function" && actFut(a, el)) return true;
  const k = el.dataset.k, m = { vvsub: "sub", vveq: "eq", vvord: "ord", vvmeq: "meq", vvevf: "evf" }[a];
  if (!m) return false;
  sheetState[m] = k; openResultado(sheetState.res, true); return true;
}
