// CASHBET · ficha de FÚTBOL en vivo / terminada (como IABET), con el resumen de ESPN que carga envivo.js.
// Previa: estadio, probabilidad 1X2 con empate, cuotas apertura → ahora, forma reciente, más mercados,
//   clasificación, comparativa de temporada y cara a cara.
// Estadísticas: jugadores de campo y porteros (tabla ordenable) + comparación de equipos.
// Resumen: crónica, resultado de apuestas, alineaciones, líderes y cara a cara.
// Eventos: goles, tarjetas y cambios con filtros y marcador tras cada gol + comentarios.

// datos de antes del partido: los del modelo (si el partido aún está en picks.json) o la copia que guardó el robot
const fPre = (r, gid) => (D.byId && D.byId[gid]) || r.pre || null;

// lado (h/a) de cada jugador según las alineaciones, para eventos sin equipo
function fLadoJug(d) {
  const S = vvLados(d), m = {};
  (d.rosters || []).forEach((ro) => { const s = S.h && ro.team && ro.team.id === S.h.team.id ? "h" : "a"; (ro.roster || []).forEach((p) => { if (p.athlete) m[p.athlete.id] = s; }); });
  return m;
}
// eventos del partido con equipo, tipo y marcador después de cada gol
function fEventosLista(r, d) {
  const S = vvLados(d), mj = fLadoJug(d);
  const nom = { h: ((S.h || {}).team || {}).displayName || "", a: ((S.a || {}).team || {}).displayName || "" };
  let gh = 0, ga = 0;
  return (d.keyEvents || []).map((k) => {
    const tx = ((k.type || {}).text || "").trim(), low = tx.toLowerCase();
    const t = /propia/.test(low) ? "autogol" : /penal/.test(low) && /(fall|atajad|errad|desperdic)/.test(low) ? "penalfallo" : /penal/.test(low) && /(gol|anotad)/.test(low) ? "penal" : /^gol/.test(low) ? "gol"
      : /segunda amarilla|roja/.test(low) ? "roja" : /amarilla/.test(low) ? "amarilla" : /sustituci/.test(low) ? "cambio"
      : /medio tiempo|descanso/.test(low) ? "mt" : /^final|fin del partido|tiempo reglamentario/.test(low) ? "fin" : null;
    if (!t) return null;
    const ps = (k.participants || []).map((p) => p.athlete || {});
    let s = k.team && k.team.id ? (S.h && S.h.team.id === k.team.id ? "h" : "a") : ps[0] && mj[ps[0].id];
    if (!s && k.text) s = nom.h && k.text.includes(`(${nom.h})`) ? "h" : nom.a && k.text.includes(`(${nom.a})`) ? "a" : null;
    if (t === "autogol" && s) s = s === "h" ? "a" : "h";   // el autogol cuenta para el rival
    if (["gol", "penal", "autogol"].includes(t)) { if (s === "h") gh++; else if (s === "a") ga++; }
    return { t, tx, min: (k.clock || {}).displayValue || "", s, j: ps[0] && ps[0].displayName, j2: ps[1] && ps[1].displayName, idj: ps[0] && ps[0].id, idj2: ps[1] && ps[1].id, gh, ga };
  }).filter(Boolean);
}
const fMin = (m) => parseInt(String(m || "").replace(/'.*/, ""), 10) || 0;

// ---------------------------------------------------------------- PREVIA
function fPrevia(r, gid, d) {
  const c = vvComp(d), gi = d.gameInfo || {}, ven = gi.venue || {}, g = fPre(r, gid), S = vvLados(d);
  const foto = ((ven.images || [])[0] || {}).href, ciudad = [((ven.address || {}).city), ((ven.address || {}).country)].filter(Boolean).join(", ");
  const tv = [...new Set((c.broadcasts || []).map((b) => (b.media || {}).shortName).filter(Boolean))];
  const arb = (gi.officials || []).map((o) => o.displayName || o.fullName).filter(Boolean);
  let h = `<div class="pkcard vvinfo">${foto ? `<div class="vvfoto"><img src="${esc(foto)}" alt="" loading="lazy"></div>` : ""}
    ${ven.fullName ? `<b class="vvven">${esc(ven.fullName)}</b><span class="small">${esc(ciudad)}${ven.capacity ? ` · Capacidad ${Number(ven.capacity).toLocaleString("es-CO")}` : ""}</span>` : ""}
    <div class="vvkv"><span>Inicio</span><b>${esc(new Date(c.date || r.at).toLocaleString("es-CO", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }))}</b></div>
    <div class="vvkv"><span>Competición</span><b>${esc(r.liga)}</b></div>
    ${tv.length ? `<div class="vvkv"><span>Se emite en</span><b>${esc(tv.join(", "))}</b></div>` : ""}
    ${gi.attendance ? `<div class="vvkv"><span>Asistencia</span><b>${Number(gi.attendance).toLocaleString("es-CO")}</b></div>` : ""}
    ${arb.length ? `<div class="vvkv"><span>Árbitro</span><b>${esc(arb[0])}</b></div>` : ""}</div>`;
  // cuotas 1X2: las de la casa que guardó el robot (apertura → última) o las de ESPN
  const o = (g && g.odds) || {}, ini = (g && g.mov && g.mov.ini) || {}, eo = (d.odds || [])[0];
  const q = { h: o.h || (eo && amDec((eo.homeTeamOdds || {}).moneyLine)), d: o.d || (eo && amDec((eo.drawOdds || {}).moneyLine)), a: o.a || (eo && amDec((eo.awayTeamOdds || {}).moneyLine)) };
  const ms = (g && g.mercados) || [], mm = (k) => ms.find((x) => x.m === k);
  if (q.h && q.d && q.a) {
    const tot = 1 / q.h + 1 / q.d + 1 / q.a, pr = { h: 1 / q.h / tot, d: 1 / q.d / tot, a: 1 / q.a / tot };
    h += `<div class="pkcard"><div class="vvt">${ic("pulse")}Probabilidad de victoria<small>Mercado · antes del partido</small></div>
      <div class="vvp3"><div><span>${crest(r.h, 22)}${esc(abT(r.h))}</span><b>${pct(pr.h, 1)}</b></div><div><span>Empate</span><b>${pct(pr.d, 1)}</b></div><div><span>${crest(r.a, 22)}${esc(abT(r.a))}</span><b>${pct(pr.a, 1)}</b></div></div>
      <div class="vvpbar"><i style="width:${pr.h * 100}%;background:${vvCol(S.h)}"></i><i style="width:${pr.d * 100}%;background:var(--tx3)"></i><i style="width:${pr.a * 100}%;background:${vvCol(S.a)}"></i></div>
      ${mm("1") ? `<div class="small" style="margin-top:8px;text-align:center">Nuestro modelo: ${esc(abT(r.h))} ${pct(mm("1").p)} · Empate ${pct(mm("X").p)} · ${esc(abT(r.a))} ${pct(mm("2").p)}</div>` : ""}</div>`;
    const fl = (a, b) => (a && b ? (b > a + 0.005 ? "↑" : b < a - 0.005 ? "↓" : "→") : "");
    const cel = (lab, k) => `<div class="vvod"><span>${lab}</span><b>${odd(q[k])}</b><small>${ini[k] ? `${odd(ini[k])} → ${odd(q[k])} ${fl(ini[k], q[k])}` : "&nbsp;"}</small><em>${Math.round(pr[k] * 100)}% probabilidad</em></div>`;
    h += `<div class="pkcard"><div class="vvt">${ic("bars2")}Cuotas · 1X2<small>${esc(o.prov || (eo && eo.provider && eo.provider.name) || "")}</small></div>
      <div class="vvod3">${cel(esc(abT(r.h)), "h")}${cel("Empate", "d")}${cel(esc(abT(r.a)), "a")}</div>
      <div class="small" style="text-align:center;margin-top:8px">Margen de la casa ${((tot - 1) * 100).toFixed(1)}%</div></div>`;
  }
  // más mercados del modelo: doble oportunidad y total de goles
  const dob = ["1X", "X2", "12"].map(mm).filter(Boolean), tg = ms.filter((x) => /^[ou]\d/i.test(x.m || "") || /más de|menos de/i.test(x.txt || "")).slice(0, 4);
  if (dob.length || tg.length) h += `<div class="pkcard"><div class="vvt">${ic("list")}Más mercados<small>Modelo · cuota justa</small></div>
    ${dob.length ? `<div class="vvsec">Doble oportunidad</div><div class="vvod3">${dob.map((x) => `<div class="vvod"><span>${esc(x.txt)}</span><b>${odd(x.justa)}</b><small>${pct(x.p)}</small></div>`).join("")}</div>` : ""}
    ${tg.length ? `<div class="vvsec">Total de goles</div><div class="vvod2">${tg.map((x) => `<div class="vvod"><span>${esc(x.txt)}</span><b>${odd(x.cuota || x.justa)}</b><small>${pct(x.p)}</small></div>`).join("")}</div>` : ""}</div>`;
  h += fForma(r, d, g);
  h += fTabla(r, d, g);
  h += fComp(r, g);
  h += fH2H(r, d, 5);
  return h;
}
// forma: últimos 5 de ESPN (con competición) o los del robot; resumen G-E-P y goles
function fForma(r, d, g) {
  const S = vvLados(d), lf = d.lastFiveGames || [];
  const lado = (s) => {
    const t = lf.find((x) => S[s] && x.team && x.team.id === S[s].team.id);
    if (t && (t.events || []).length) return t.events.slice(0, 5).map((e) => { const [x, y] = String(e.score || "").split("-").map(Number);
      const loc = e.atVs === "vs"; return { r: e.gameResult, m: e.score, vs: (e.opponent || {}).abbreviation, loc, at: e.gameDate, lg: e.leagueName, gf: e.gameResult === "G" ? Math.max(x, y) : e.gameResult === "P" ? Math.min(x, y) : x, gc: e.gameResult === "G" ? Math.min(x, y) : e.gameResult === "P" ? Math.max(x, y) : y }; });
    return ((g && g.forma && g.forma[s]) || []).slice(0, 5).map((x) => { const [a, b] = String(x.m || "").split("-").map(Number); return Object.assign({}, x, { gf: a, gc: b }); });
  };
  const bloque = (s) => { const xs = lado(s); if (!xs.length) return "";
    const n = (k) => xs.filter((x) => x.r === k).length, gf = xs.reduce((t, x) => t + (x.gf || 0), 0), gc = xs.reduce((t, x) => t + (x.gc || 0), 0);
    let racha = 0; for (const x of xs) { if (x.r === xs[0].r) racha++; else break; }
    return `<div class="vvfh">${crest(r[s], 22)}<b>${esc(abT(r[s]))}</b><em>${n("G")}G ${n("E")}E ${n("P")}P</em><span class="vvwl">${xs.map((x) => `<i class="${x.r}">${x.r}</i>`).join("")}</span></div>
      <div class="small" style="margin:0 0 4px">Goles ${gf} a favor · ${gc} en contra${racha >= 2 ? ` · ${racha} ${xs[0].r === "G" ? "victorias" : xs[0].r === "E" ? "empates" : "derrotas"} seguidas` : ""}</div>
      ${xs.map((x) => `<div class="vvfr"><i class="${x.r}">${x.r}</i><span>${x.loc ? "vs" : "@"}</span><b>${esc(x.vs || "")}${x.lg ? `<small class="vvlg">${esc(x.lg)}</small>` : ""}</b><em>${esc(x.m || "")}</em><small>${x.at ? esc(new Date(x.at).toLocaleDateString("es-CO", { day: "numeric", month: "short" })) : ""}</small></div>`).join("")}`; };
  const a = bloque("h"), b = bloque("a");
  return a || b ? `<div class="pkcard"><div class="vvt">${ic("list")}Forma reciente<small>Últimos 5 · todas las competiciones</small></div>${a}<div style="height:10px"></div>${b}</div>` : "";
}
// clasificación: los dos equipos y la tabla completa desplegable
function fTabla(r, d, g) {
  const grp = ((d.standings || {}).groups || [])[0], ents = ((grp || {}).standings || {}).entries || [];
  const S = vvLados(d), ids = [S.h, S.a].map((x) => x && x.team.id);
  if (!ents.length) {
    const T = g && g.tabla; if (!T || !T.h) return "";
    return `<div class="pkcard"><div class="vvt">${ic("chart")}Clasificación<small>Tabla de ${T.n} equipos</small></div>${["h", "a"].map((s) => `<div class="vvcl">${crest(r[s], 30)}<div><b>${esc(r[s].n)}</b><small>${T[s].pj} PJ · ${T[s].g}-${T[s].e}-${T[s].p} · DG ${T[s].gf - T[s].gc > 0 ? "+" : ""}${T[s].gf - T[s].gc}</small></div><em>${T[s].pos}°</em><b class="pts">${T[s].pts}<small>PTS</small></b></div>`).join("")}</div>`;
  }
  const st = (e, k) => ((e.stats || []).find((x) => x.name === k) || {}).displayValue;
  const tid = (e) => String(e.id || (e.team && e.team.id) || ""), tnom = (e) => (typeof e.team === "string" ? e.team : (e.team || {}).shortDisplayName || (e.team || {}).displayName) || "";
  const fila = (e, i) => { const yo = ids.includes(tid(e));
    return `<tr class="${yo ? "yo" : ""}"><td>${st(e, "rank") || i + 1}</td><td>${esc(tnom(e))}</td><td>${st(e, "gamesPlayed") || ""}</td><td>${st(e, "wins") || ""}-${st(e, "ties") || ""}-${st(e, "losses") || ""}</td><td>${st(e, "pointDifferential") || ""}</td><td><b>${st(e, "points") || ""}</b></td></tr>`; };
  const mios = ents.filter((e) => ids.includes(tid(e))).sort((x, y) => ids.indexOf(tid(x)) - ids.indexOf(tid(y)));
  const abierta = sheetState.tabla;
  return `<div class="pkcard"><div class="vvt">${ic("chart")}Clasificación<small>Tabla de ${ents.length} equipos</small></div>
    ${mios.map((e) => { const s = tid(e) === ids[0] ? "h" : "a";
      return `<div class="vvcl">${crest(r[s], 30)}<div><b>${esc(tnom(e) || r[s].n)}</b><small>${st(e, "gamesPlayed")} PJ · ${st(e, "wins")}-${st(e, "ties")}-${st(e, "losses")} · DG ${st(e, "pointDifferential")}</small></div><em>${st(e, "rank")}°</em><b class="pts">${st(e, "points")}<small>PTS</small></b></div>`; }).join("")}
    <button class="vvbtn" data-act="vvtabla" data-k="${abierta ? "" : "1"}">${abierta ? "Ocultar la tabla" : `Ver la tabla completa de ${esc(grp.header || r.liga)}`}</button>
    ${abierta ? `<div class="vvtbl vvtab"><table><thead><tr><th>#</th><th>Equipo</th><th>PJ</th><th>G-E-P</th><th>DG</th><th>PTS</th></tr></thead><tbody>${ents.map(fila).join("")}</tbody></table></div>` : ""}</div>`;
}
// comparativa de temporada (promedios de los últimos 10 partidos que guardó el robot)
function fComp(r, g) {
  let C = g && g.comp;
  if (!C && g && g.extra && g.extra.hist) {   // partido aún en picks.json: se calcula aquí
    C = {}; ["h", "a"].forEach((s) => { const hs = (g.extra.hist[s] || []).slice(0, 10); if (!hs.length || hs[0].gf == null) return;
      const m = (k) => hs.reduce((t, x) => t + (x[k] || 0), 0) / hs.length;
      C[s] = { n: hs.length, gf: m("gf"), gc: m("gc"), tir: m("tir"), sot: m("sot"), cor: m("cor"), tar: m("tar"), cero: hs.filter((x) => x.gc === 0).length }; });
  }
  if (!C || !C.h || !C.a) return "";
  const f2 = (v) => (v == null ? "—" : (Math.round(v * 100) / 100).toFixed(2));
  return `<div class="pkcard rst2"><div class="vvt">${ic("bars2")}Comparativa de temporada<small>${Math.min(C.h.n, C.a.n)} partidos</small></div>${vvCab(r, "h", "a", "")}
    ${[["Goles / partido", "gf"], ["Encajados / partido", "gc", 1], ["Tiros / partido", "tir"], ["A puerta / partido", "sot"], ["Córners / partido", "cor"], ["Amarillas / partido", "tar", 1]]
      .map(([l, k, menos]) => vvFila(l, f2(C.h[k]), f2(C.a[k]), { menos: !!menos })).join("")}
    ${vvFila("Porterías a cero", C.h.cero, C.a.cero)}</div>`;
}
// cara a cara: últimos N con resumen de quién domina
function fH2H(r, d, n) {
  const ser = (d.seasonseries || []).find((x) => x.type === "head-to-head") || (d.seasonseries || [])[0];
  const evs = ((ser && ser.events) || []).filter((e) => e.status === "post" || (e.statusType || {}).completed).slice(0, n);
  if (!evs.length) return "";
  const S = vvLados(d), idH = S.h && S.h.team.id;
  let gh = 0, ga = 0, em = 0;
  const filas = evs.map((e) => { const cs = e.competitors || [], ho = cs.find((x) => x.homeAway === "home") || {}, aw = cs.find((x) => x.homeAway === "away") || {};
    const sh = +ho.score, sa = +aw.score, ganLoc = sh > sa ? ho : sa > sh ? aw : null;
    if (!ganLoc) em++; else if ((ganLoc.team || {}).id === idH) gh++; else ga++;
    return `<div class="vvh2"><small>${esc(new Date(e.date).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }))}</small><b>${esc((ho.team || {}).abbreviation || "")}</b><em>${esc(ho.score ?? "")} – ${esc(aw.score ?? "")}</em><b>${esc((aw.team || {}).abbreviation || "")}</b></div>`; }).join("");
  const dom = gh > ga ? `${abT(r.h)} domina ${gh}-${em}-${ga}` : ga > gh ? `${abT(r.a)} domina ${ga}-${em}-${gh}` : `Parejos ${gh}-${em}-${ga}`;
  return `<div class="pkcard"><div class="vvt">${ic("swap")}Cara a cara<small>Últimos ${evs.length}</small></div>
    <div class="vvh2r"><div><b>${gh}</b><span>Gana ${esc(abT(r.h))}</span></div><div><b>${em}</b><span>Empates</span></div><div><b>${ga}</b><span>Gana ${esc(abT(r.a))}</span></div></div>
    <div class="small" style="text-align:center;margin:6px 0">${esc(dom)}</div>${filas}</div>`;
}

// ---------------------------------------------------------------- ESTADÍSTICAS
function fStats(r, gid, d) {
  const sub = sheetState.sub || "jug";
  return vvSub("vvsub", [["jug", "Jugadores"], ["eq", "Equipos"]], sub) + (sub === "jug" ? fJugadores(r, d) : vvEquipos(r, d, "h", "a"));
}
function fJugadores(r, d) {
  const S = vvLados(d), lado = sheetState.eq === "a" ? "a" : "h";
  const ro = (d.rosters || []).find((x) => S[lado] && x.team && x.team.id === S[lado].team.id);
  const head = `<div class="pkcard"><div class="vvt">Jugadores<small>Toca una columna para ordenar</small></div>${vvSub("vveq", [["h", esc(abT(r.h))], ["a", esc(abT(r.a))]], lado)}`;
  if (!ro || !(ro.roster || []).length) return head + `<div class="empty">ESPN todavía no publica las estadísticas de los jugadores.</div></div>`;
  const ev = fEventosLista(r, d), entra = {}, sale = {};
  ev.filter((e) => e.t === "cambio").forEach((e) => { if (e.idj) entra[e.idj] = e.min; if (e.idj2) sale[e.idj2] = e.min; });
  const st = (p, k) => { const x = (p.stats || []).find((s) => s.name === k); return x ? +x.displayValue || 0 : 0; };
  const jugo = (p) => p.starter || p.subbedIn || entra[(p.athlete || {}).id];
  const esPortero = (p) => (p.position || {}).name === "Goalkeeper" || /portero|arquero/i.test((p.position || {}).displayName || "") || (st(p, "saves") > 0 || st(p, "goalsConceded") > 0) && !st(p, "totalShots");
  const tabla = (xs, cols, ordK) => {
    const ord = sheetState["ord_" + ordK] || cols[0][0];
    xs = [...xs].sort((a, b) => st(b, ord) - st(a, ord) || (b.starter ? 1 : 0) - (a.starter ? 1 : 0));
    return `<div class="vvtbl"><table><thead><tr><th>Jugador</th>${cols.map(([k, l]) => `<th class="${k === ord ? "on" : ""}" data-act="vvordf" data-k="${ordK}|${k}">${l}${k === ord ? " ▾" : ""}</th>`).join("")}</tr></thead>
      <tbody>${xs.map((p) => { const id = (p.athlete || {}).id;
        return `<tr><td class="${p.starter ? "tit" : ""}">${esc((p.athlete || {}).displayName || "")}${sale[id] ? `<small class="vvout">↓${esc(sale[id])}</small>` : ""}${entra[id] ? `<small class="vvin">↑${esc(entra[id])}</small>` : ""}</td>${cols.map(([k]) => `<td class="${k === ord ? "on" : ""}">${st(p, k)}</td>`).join("")}</tr>`; }).join("")}</tbody></table></div>`;
  };
  const js = ro.roster.filter(jugo), por = js.filter(esPortero), cam = js.filter((p) => !esPortero(p));
  return head + `<div class="vvsec">Jugadores de campo</div>${tabla(cam, [["totalGoals", "G"], ["goalAssists", "A"], ["totalShots", "TIR"], ["shotsOnTarget", "A PUE"], ["foulsCommitted", "FAL"], ["yellowCards", "TA"]], "c")}
    ${por.length ? `<div class="vvsec">Porteros</div>${tabla(por, [["saves", "ATJ"], ["goalsConceded", "GC"], ["shotsFaced", "TIR REC"], ["yellowCards", "TA"]], "p")}` : ""}
    <div class="small" style="margin-top:8px"><b class="vvtit">Naranja</b> = titular · ↑ entró · ↓ salió</div></div>`;
}

// ---------------------------------------------------------------- RESUMEN
function fResumen(r, gid, d) {
  const S = vvLados(d), g = fPre(r, gid);
  let h = "";
  if (r.recap && [r.h, r.a].every((t) => t && t.n && (r.recap.tit + " " + (r.recap.txt || "")).toLowerCase().includes(String(t.n).toLowerCase().split(" ").pop()))) h += rResumen(r);
  // marcador por tiempo
  const ls = (s) => (S[s] && S[s].linescores) || [];
  if (ls("h").length) h += `<div class="pkcard"><div class="vvt">Marcador por tiempo<small>${esc(r.det || "")}</small></div><div class="vvls"><table><tr><th></th>${ls("h").map((_, i) => `<th>${vvPer(i + 1, "futbol")}</th>`).join("")}<th>T</th></tr>
    ${["h", "a"].map((s) => `<tr><td>${crest(r[s], 18)}<b>${esc(abT(r[s]))}</b></td>${ls("h").map((_, i) => `<td>${esc((ls(s)[i] || {}).displayValue ?? "")}</td>`).join("")}<td class="t">${esc(S[s].score ?? "")}</td></tr>`).join("")}</table></div></div>`;
  // resultado de apuestas (al terminar, a los 90 minutos)
  if (r.st === "post") {
    const gh = +S.h.score || 0, ga = +S.a.score || 0, tot = gh + ga, o = (g && g.odds) || {}, ln = o.ou || 2.5;
    const gan = gh > ga ? "h" : ga > gh ? "a" : "d", cu = o[gan];
    h += `<div class="pkcard"><div class="vvt">${ic("check")}Resultado de apuestas<small>A los 90 minutos · líneas de cierre</small></div>
      <div class="vvra"><span>Resultado (1X2)</span><b>${gan === "d" ? "Empate" : `Ganó ${esc(abT(r[gan]))}`}</b><small>${cu ? `cuota ${odd(cu)} · ` : ""}${esc(abT(r.h))} ${gh} – ${ga} ${esc(abT(r.a))}</small></div>
      <div class="vvra"><span>Total Más/Menos ${ln}</span><b>${tot > ln ? "Más de" : tot < ln ? "Menos de" : "Push"}</b><small>${tot} ${tot === 1 ? "gol" : "goles"}</small></div>
      <div class="vvra"><span>Ambos marcan</span><b>${gh > 0 && ga > 0 ? "Sí" : "No"}</b><small>Se liquida a los 90 minutos</small></div></div>`;
  }
  // alineaciones
  const lado = sheetState.al === "a" ? "a" : "h", ro = (d.rosters || []).find((x) => S[lado] && x.team && x.team.id === S[lado].team.id);
  if (ro && (ro.roster || []).length) {
    const ev = fEventosLista(r, d), cnt = (id, t) => ev.filter((e) => e.idj === id && (Array.isArray(t) ? t.includes(e.t) : e.t === t)).length;
    const entra = {}, sale = {}; ev.filter((e) => e.t === "cambio").forEach((e) => { if (e.idj) entra[e.idj] = e.min; if (e.idj2) sale[e.idj2] = e.min; });
    const fila = (p) => { const id = (p.athlete || {}).id, gl = cnt(id, ["gol", "penal"]), am = cnt(id, "amarilla"), ro2 = cnt(id, "roja");
      return `<div class="vvpl"><em>${esc(p.jersey || "")}</em><b class="${p.starter ? "tit" : ""}">${esc((p.athlete || {}).displayName || "")}</b><small>${esc((p.position || {}).abbreviation || "")}</small>
        <span>${gl ? `<i class="gl">${ic("ball")}${gl > 1 ? gl : ""}</i>` : ""}${am ? `<i class="ta"></i>` : ""}${ro2 ? `<i class="tr"></i>` : ""}${entra[id] ? `<i class="in">↑${esc(entra[id])}</i>` : ""}${sale[id] ? `<i class="out">↓${esc(sale[id])}</i>` : ""}</span></div>`; };
    h += `<div class="pkcard"><div class="vvt">${ic("list")}Alineaciones</div>${vvSub("vval", [["h", `${esc(abT(r.h))}${(d.rosters.find((x) => x.team && S.h && x.team.id === S.h.team.id) || {}).formation ? ` · ${esc(d.rosters.find((x) => x.team && x.team.id === S.h.team.id).formation)}` : ""}`], ["a", `${esc(abT(r.a))}${(d.rosters.find((x) => x.team && S.a && x.team.id === S.a.team.id) || {}).formation ? ` · ${esc(d.rosters.find((x) => x.team && x.team.id === S.a.team.id).formation)}` : ""}`]], lado)}
      <div class="vvsec">Once inicial</div>${ro.roster.filter((p) => p.starter).map(fila).join("")}
      <div class="vvsec">Suplentes</div>${ro.roster.filter((p) => !p.starter).map(fila).join("")}</div>`;
  }
  // líderes del juego
  const blq = { h: [], a: [] };
  (d.leaders || []).forEach((b) => { const s = vvLado(d, (b.team || {}).id); (b.leaders || []).forEach((ct) => blq[s].push(ct)); });
  const cats = [...new Set([...blq.h, ...blq.a].map((x) => x.name))].slice(0, 4);
  if (cats.length) h += `<div class="pkcard"><div class="vvt">${ic("star")}Líderes del juego</div>${cats.map((k) => {
    const lab = ([...blq.h, ...blq.a].find((x) => x.name === k) || {}).displayName || k;
    const uno = (s) => { const ct = blq[s].find((x) => x.name === k), x = ct && (ct.leaders || [])[0]; if (!x) return "";
      const a = x.athlete || {};
      return `<div class="vvld" style="--tc:${vvCol(S[s])}"><span class="crest-f" style="width:44px;height:44px">${esc(a.jersey || sigla({ n: a.displayName }))}</span><div><b>${esc(a.displayName || "")}</b><small>${esc(abT(r[s]))}${x.summary ? ` · ${esc(x.summary)}` : ""}</small></div><em>${esc(x.displayValue ?? "")}</em></div>`; };
    return `<div class="vvsec">${esc(lab)}</div>${uno("h")}${uno("a")}`; }).join("")}</div>`;
  h += fH2H(r, d, 5);
  return h || `<div class="empty">Todavía no hay resumen de este partido.</div>`;
}

// ---------------------------------------------------------------- EVENTOS
function fEventos(r, d) {
  const f = sheetState.evf || "todos", ev = fEventosLista(r, d);
  const cat = { goles: ["gol", "penal", "autogol", "penalfallo"], tarjetas: ["amarilla", "roja"], cambios: ["cambio"] };
  const n = (k) => ev.filter((e) => (k === "goles" ? ["gol", "penal", "autogol"] : cat[k]).includes(e.t)).length, total = ev.filter((e) => !["mt", "fin"].includes(e.t)).length;
  const xs = ev.filter((e) => f === "todos" || (cat[f] || []).includes(e.t));
  const com = (d.commentary || []).filter((c) => c.text);
  const abierto = sheetState.com;
  return `<div class="pkcard rev"><div class="vvt">${ic("bolt2")}Eventos del partido<small>${total} eventos</small></div>
    ${vvSub("vvevf", [["todos", "Todos"], ["goles", `Goles <i>${n("goles")}</i>`], ["tarjetas", `Tarjetas <i>${n("tarjetas")}</i>`], ["cambios", `Cambios <i>${n("cambios")}</i>`]], f)}
    ${xs.map((e) => { if (e.t === "mt" || e.t === "fin") return `<div class="vvmf">${e.t === "mt" ? "Descanso" : "Final"} · <b>${esc(abT(r.h))} ${e.gh} – ${e.ga} ${esc(abT(r.a))}</b></div>`;
      const [i, l, c] = EVI[e.t] || ["dot", e.tx, "n"];
      return `<div class="rer ${e.s === "a" ? "der" : ""}"><span class="rem">${esc(e.min)}</span><span class="rei ${c}">${ic(i)}</span><div><b>${esc(e.j || l)}${e.t === "penal" ? " (P)" : ""}</b><small>${esc(l)}${e.s ? ` · ${esc(abT(r[e.s]))}` : ""}</small>
        ${e.t === "cambio" && e.j2 ? `<small>Sale: ${esc(e.j2)}</small>` : ""}${["gol", "penal", "autogol"].includes(e.t) ? `<em class="vvsc">${esc(abT(r.h))} ${e.gh} – ${e.ga} ${esc(abT(r.a))}</em>` : ""}</div></div>`; }).join("") || `<div class="empty">Sin eventos todavía.</div>`}</div>
    ${com.length ? `<div class="pkcard"><button class="vvt vvtb" data-act="vvcom" data-k="${abierto ? "" : "1"}">${ic("list")}Comentarios<small>${com.length} entradas ${abierto ? "▴" : "▾"}</small></button>
      ${abierto ? [...com].reverse().map((c) => `<div class="vvcm"><b>${esc((c.time || {}).displayValue || "")}</b><span>${esc(c.text)}</span></div>`).join("") : ""}</div>` : ""}`;
}

// encabezado: resumen del cara a cara bajo el marcador (como IABET)
function fHeroExtra(r, gid) {
  const v = typeof VS !== "undefined" && VS[gid]; if (!v || r.dep === "nba") return "";
  const ser = (v.d.seasonseries || []).find((x) => x.type === "head-to-head");
  const at = (v.d.gameInfo || {}).attendance;
  return ser && ser.summary || at ? `<div class="rven">${ser && ser.summary ? esc(ser.summary.replace("lidera", "domina")) : ""}${ser && ser.summary && at ? " · " : ""}${at ? `${Number(at).toLocaleString("es-CO")} espectadores` : ""}</div>` : "";
}
function actFut(a, el) {
  const k = el.dataset.k;
  if (a === "vvordf") { const [t, c] = k.split("|"); sheetState["ord_" + t] = c; }
  else if (a === "vvtabla") sheetState.tabla = !!k;
  else if (a === "vvcom") sheetState.com = !!k;
  else if (a === "vval") sheetState.al = k;
  else return false;
  openResultado(sheetState.res, true); return true;
}
