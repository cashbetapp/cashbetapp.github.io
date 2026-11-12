// CASHBET — ficha de pick (equipo, partido o jugador) y lista de Predicciones.
// Usa las funciones y datos de app.js (D, esc, pct, odd, crest, ic, store...).

I.filtro = '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>';
I.ball = '<circle cx="12" cy="12" r="9"/><path d="m12 7 4 3-1.5 4.5h-5L8 10z"/><path d="M12 3v4M21 10.5 16 10M18 19l-3-4.5M6 19l3-4.5M3 10.5 8 10"/>';
I.spark = '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>';
I.left = '<path d="M15 18l-6-6 6-6"/>';

const UN = { cor: "córners", sot: "tiros a puerta", tir: "tiros", fal: "faltas", tar: "tarjetas", pts: "puntos" };
const MK = [["todos", "Todos los mercados"], ["res", "Ganador y goles"], ["cor", "Córners"], ["sot", "Tiros a puerta"], ["tir", "Tiros"], ["fal", "Faltas"], ["tar", "Tarjetas"], ["pts", "Puntos de equipo (NBA)"]];
ui.pseg = ui.pseg || "todos"; ui.pdep = ui.pdep || "todos"; ui.pmk = ui.pmk || "todos";

const abT = (t) => (t && (t.ab || (t.n || "").slice(0, 3).toUpperCase())) || "?";
const fDia = (d) => new Date(d + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" }).replace(".", "").replace(" de ", " ");
const media = (xs) => xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0;
const desv = (xs) => { const m = media(xs); return Math.sqrt(media(xs.map((v) => (v - m) ** 2))); };
const n1 = (v) => (Math.round(v * 10) / 10).toLocaleString("es-CO");

function pkFind(gid, m) {
  const g = D.byId[gid];
  if (!g || !g.extra) return null;
  const x = g.extra.picks.find((y) => y.m === m) || g.extra.jug.find((y) => y.m === m);
  if (!x) return null;
  const [s, sc0, lado, ln] = m.split("|");
  const sc = sc0.startsWith("j:") ? "j" : sc0;
  return { g, x, s, sc, lado, ln: +ln };
}
function pkPill(P) {
  if (P.s === "tar" && P.sc === "j" && P.ln === 0.5) return P.lado === "mas" ? "Recibe tarjeta" : "No recibe tarjeta";
  return `${P.lado === "mas" ? "Más" : "Menos"} de ${P.ln} ${UN[P.s]}`;
}
function pkTeam(P) { return P.sc === "j" ? P.g[P.x.side] : P.sc === "t" ? null : P.g[P.sc]; }
function pkSide(P) { return P.sc === "j" ? P.x.side : P.sc === "t" ? (sheetState.side || "h") : P.sc; }
function pkSerie(P) {
  const X = P.g.extra;
  if (P.sc === "j") return (P.x.ult || []).map(([v, vs, l]) => ({ v, vs, l }));
  const sd = pkSide(P);
  return (X.hist[sd] || []).map((e) => ({ v: P.sc === "t" ? e[P.s] + e["o" + P.s] : e[P.s], vs: e.vs, l: e.l, d: e.d, r: e.r }));
}
const pkHit = (P, v) => (P.lado === "mas" ? v > P.ln : v < P.ln);
function pkEsp(P) {
  if (P.sc === "j") return P.x.esp;
  const gr = P.g.extra.grupos.find((q) => q.s === P.s);
  if (!gr) return null;
  return P.sc === "t" ? gr.esp[0] + gr.esp[1] : P.sc === "h" ? gr.esp[0] : gr.esp[1];
}
// jugador sin foto en ninguna fuente: silueta con sus iniciales y el escudo pequeño
function sinFoto(nombre, tm, px, cls) {
  return `<div class="${cls} sfj" style="--s:${px}px"><span class="sfi"><b>${esc(sigla({ n: nombre }))}</b></span><span class="sfe">${crest(tm, Math.round(px * 0.34))}</span></div>`;
}
function bigImg(P) {
  if (P.sc === "j" && P.x.foto) return `<img class="pkbig foto" src="${esc(P.x.foto)}" alt="">`;
  if (P.sc === "j") return sinFoto(P.x.jugador, pkTeam(P), 130, "pkbig");
  if (P.sc === "t") return `<div class="pkbig dos">${crest(P.g.h, 96)}${crest(P.g.a, 96)}</div>`;
  return `<div class="pkbig">${crest(pkTeam(P), 150)}</div>`;
}

// ------------------------------------------------------------ ficha
function openPick(gid, m, keep) {
  const P = pkFind(gid, m); if (!P) return;
  if (!keep) sheetState = { pk: { gid, m }, n: 10, tab: "resumen", side: "h" };
  const { g, x } = P, up = P.lado === "mas", seg = store.get("seg", {}), sid = `pk|${gid}|${m}`;
  const tm = pkTeam(P);
  const titulo = P.sc === "j" ? x.jugador : P.sc === "t" ? `Total de ${UN[P.s]}` : tm.n;
  const mini = P.sc === "t" ? `<span class="pkmini dos">${crest(g.h, 26)}${crest(g.a, 26)}</span>` : `<span class="pkmini">${crest(tm, 30)}</span>`;
  const tab = sheetState.tab;
  const html = `<div class="pkh">
      <div class="pkl">
        <div class="pkt">${mini}<h3>${esc(titulo)}</h3></div>
        <div class="pkm">${esc(abT(g.h))} vs ${esc(abT(g.a))} · ${cuando(g.at)}${g.ven ? `<br>${ic("pin")}${esc(g.ven)}${g.city ? `, ${esc(g.city)}` : ""}` : ""}</div>
        <span class="pkpill ${up ? "" : "bad"}">${ic(up ? "up" : "down")}<span>${esc(pkPill(P))}</span></span>
        <div class="pkprog ${x.p >= 0.7 ? "hi" : ""}"><span><i style="width:${x.p * 100}%"></i></span><b>${pct(x.p)}</b></div>
      </div>${bigImg(P)}</div>
    <button class="pkseg ${seg[sid] ? "on" : ""}" data-act="pkfollow">${ic(seg[sid] ? "check" : "heart")}${seg[sid] ? "Siguiendo" : "Seguir Predicción"}</button>
    <div class="pktabs">${[["resumen", "Resumen"], ["contexto", "Contexto"], ["analisis", "Análisis IA"]].map(([k, l]) => `<button class="${tab === k ? "on" : ""}" data-act="pktab" data-k="${k}">${l}</button>`).join("")}</div>
    ${tab === "resumen" ? pkResumen(P) : tab === "contexto" ? pkContexto(P) : pkAnalisis(P)}`;
  const cur = $(".sheet.on");
  if (keep && cur) { const y = cur.scrollTop; cur.innerHTML = `<div class="grab"></div><button class="x" data-act="close" aria-label="Cerrar">${ic("x")}</button>` + html; cur.scrollTop = y; }
  else { openSheet(html); $(".sheet").classList.add("pk"); }
}

function pkChart(P, vals) {
  const H = 150, mx = Math.max(P.ln * 1.25, ...vals.map((e) => e.v), 1) * 1.08;
  const lg = P.g.extra.lg || {};
  return `<div class="pkchart">
    <div class="pkleg"><span><i class="ok"></i>Acierto</span><span><i class="no"></i>Fallo</span><span class="ln"><u></u>Línea</span></div>
    <div class="pkmu">Muestra: ${vals.length} partidos</div>
    <div class="pkbars" style="height:${H}px">${vals.map((e) => {
      const h = Math.max((e.v / mx) * H, 5), ok = pkHit(P, e.v);
      return `<div class="c"><em class="${ok ? "ok" : "no"}" style="bottom:${h + 4}px">${n1(e.v)}</em><i class="${ok ? "ok" : "no"}" style="height:${h}px"></i></div>`;
    }).join("")}<div class="lnl" style="bottom:${(P.ln / mx) * H}px"><span>Línea ${P.ln}</span></div></div>
    <div class="pkvs">${vals.map((e) => `<div>${crest({ logo: lg[e.vs], n: e.vs, ab: e.vs }, 18)}<span>${e.l ? "" : "@"}${esc(e.vs)}</span></div>`).join("")}</div>
    <div class="pkfoot"><span>Reciente ${ic("left")}</span><span>Antiguo</span></div></div>`;
}

function pkRacha(hist) {
  if (!hist || !hist.length) return "";
  const r = hist[0].r; let n = 0;
  for (const e of hist) { if (e.r !== r) break; n++; }
  return `<span class="rb ${r}">${r}${n}</span>`;
}
const dots = (xs) => xs.map((e) => `<span class="wl ${e.r}">${e.r}</span>`).join("");

I.ne = '<path d="M7 17 17 7M9 7h8v8"/>';
I.se = '<path d="M7 7l10 10M17 9v8H9"/>';
I.pulse = '<path d="M3 12h4l2-6 4 12 2-6h6"/>';
I.minus = '<path d="M6 12h12"/>';
const mediana = (xs) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sg = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + n1(Math.abs(v));
function pkRival(P) { const sd = pkSide(P); return P.g[sd === "h" ? "a" : "h"]; }
function pkVr(P) {
  const X = P.g.extra;
  if (P.sc === "j") return (P.x.vr || []).map(([v, d, l]) => ({ v, d, l }));
  const sd = pkSide(P);
  return (X.vr[P.sc === "t" ? "h" : sd] || []).map((e) => ({ v: P.sc === "t" ? e[P.s] + e["o" + P.s] : e[P.s], d: e.d, l: e.l }));
}
const clvIc = { ok: "check", warn: "warn", neu: "minus" };
const clvList = (xs) => `<ul class="clv">${xs.map(([k, t]) => `<li><span class="ci ${k}">${ic(clvIc[k])}</span><span>${esc(t)}</span></li>`).join("")}</ul>`;

function pkResumen(P) {
  const { g, x } = P, up = P.lado === "mas", all = pkSerie(P), n = sheetState.n, vals = all.slice(0, n);
  const hit = (v) => pkHit(P, v), U = UN[P.s].toUpperCase();
  const hits = vals.filter((e) => hit(e.v)).length, vs = vals.map((e) => e.v);
  const rival = pkRival(P), vr = pkVr(P);
  // ---- Lo clave
  let racha = 0; for (const e of all) { if (!hit(e.v)) break; racha++; }
  const v10 = all.slice(0, 10), h10 = v10.filter((e) => hit(e.v)).length;
  const lc = [];
  if (racha >= 2) lc.push(["ok", `Cumplió la línea en sus últimos ${racha} partidos seguidos`]);
  else if (all.length && !hit(all[0].v)) lc.push(["warn", `No cumplió la línea en su último partido (${n1(all[0].v)})`]);
  if (vr.length) { const hv = vr.filter((e) => hit(e.v)).length; lc.push([hv / vr.length >= 0.5 ? "ok" : "warn", `Contra ${abT(rival)}: cumplió ${hv} de ${vr.length} (promedio ${n1(media(vr.map((e) => e.v)))})`]); }
  lc.push([h10 / Math.max(v10.length, 1) >= 0.6 ? "ok" : "warn", `Cumplió en ${h10} de sus últimos ${v10.length} (promedio ${n1(media(v10.map((e) => e.v)))})`]);
  // ---- Local y visitante
  const casaHoy = (P.sc === "j" ? x.side : pkSide(P)) === "h";
  const loc = all.filter((e) => e.l).slice(0, 5), vis = all.filter((e) => !e.l).slice(0, 5);
  const ml = media(loc.map((e) => e.v)), mv = media(vis.map((e) => e.v));
  const dif = mv - ml;
  const lvTxt = !loc.length || !vis.length ? "Sin datos suficientes de local o visitante" : Math.abs(dif) < 0.05 ? "Igual de local que de visitante" : `${n1(Math.abs(dif))} ${U} más de ${dif > 0 ? "visitante" : "local"}`;
  const lvAll = [...loc, ...vis].map((e) => e.v).concat([P.ln]);
  const lo = Math.min(...lvAll), hi = Math.max(...lvAll, lo + 1);
  const pos = (v) => `${(100 * (v - lo)) / (hi - lo)}%`;
  const dotRow = (t, xs, m) => `<div class="dr"><span>${t}</span><div class="tr">${xs.map((e) => `<i class="${hit(e.v) ? "ok" : ""}" style="left:${pos(e.v)}"></i>`).join("")}<u style="left:${pos(P.ln)}"></u>${xs.length ? `<b style="left:${pos(m)}"></b>` : ""}</div></div>`;
  const lvCard = (t, xs, m, hoy) => `<div class="lvc ${hoy ? "hoy" : ""}"><span>${t}${hoy ? "<em>Hoy</em>" : ""}</span><b>${xs.length ? n1(m) : "—"}<small>${U}</small></b><span>Cumplió ${xs.filter((e) => hit(e.v)).length} de ${xs.length}</span></div>`;
  // ---- Métricas clave
  const w = v10.map((e) => e.v), avg = media(w), med = mediana(w), l3 = all.slice(0, 3), a3 = media(l3.map((e) => e.v)), sd = desv(w);
  const sup = (v) => (up ? v > P.ln : v < P.ln);
  const cv = avg ? sd / avg : 0;
  const cons = cv < 0.35 ? ["Muy consistente", "g"] : cv < 0.6 ? ["Consistente", "g"] : ["Muy variable", "o"];
  const senal = [sup(avg), sup(med), sup(a3), cv < 0.6];
  const ns = senal.filter(Boolean).length;
  const mx = Math.max(...w, P.ln, 1);
  const old = [...v10].reverse();
  const wlo = Math.min(...w, P.ln), whi = Math.max(...w, P.ln, wlo + 1), wp = (v) => `${(100 * (v - wlo)) / (whi - wlo)}%`;
  const quien = P.sc === "j" ? "Historial de rendimiento" : `Historial de puntuación ${P.sc === "t" ? "del partido" : "del equipo"}`;
  const sideSw = P.sc === "t" ? `<div class="pkhint">Partidos de</div><div class="pk5 wide">${["h", "a"].map((sd) => `<button class="${pkSide(P) === sd ? "on" : ""}" data-act="pkside" data-k="${sd}">${esc(abT(P.g[sd]))}</button>`).join("")}</div>` : "";
  return `<div class="pk3">
      <div class="pkbox dir ${up ? "" : "bad"}"><div class="k">Dirección</div><b>${up ? "MÁS DE" : "MENOS DE"}</b></div>
      <div class="pkbox"><div class="k">Línea</div><b>${P.ln}</b></div>
      <div class="pkbox"><div class="k">Vale desde</div><b>${odd(vale(x.justa))}</b></div></div>
    <div class="pkvale">${ic("info")}<span>Probabilidad ${pct(x.p)} → cuota justa ${odd(x.justa)}. No tenemos la cuota de la casa para este mercado: <b>si tu casa paga ${odd(vale(x.justa))} o más, es un error de la casa</b> a tu favor.</span></div>
    <hr class="pkhr">
    <div class="pkcard ol"><h4>Lo clave</h4><div class="small">Lo que dicen sus últimos partidos sobre el de hoy</div>${clvList(lc)}</div>
    <div class="pkhist" style="margin-top:18px"><h4>${quien}</h4><div class="pk5">${[5, 10, 20].map((k) => `<button class="${n === k ? "on" : ""}" data-act="pkn" data-k="${k}">${k}G</button>`).join("")}</div></div>
    ${sideSw}
    ${vals.length ? pkChart(P, vals) : `<div class="empty">Sin partidos anteriores.</div>`}
    <div class="pk2">
      <div class="pkbox l ol"><div class="k">Tasa de acierto</div><b class="g">${hits}/${vals.length}</b><span>${vals.length ? Math.round(100 * hits / vals.length) : 0}%</span></div>
      <div class="pkbox l ol"><div class="k">Promedio · últimos ${vals.length}</div><b>${n1(media(vs))}</b><span>${U}</span></div>
      <div class="pkbox l ol"><div class="k">Máximo</div><b class="g">${vs.length ? n1(Math.max(...vs)) : "—"}</b><span>${U}</span></div>
      <div class="pkbox l ol"><div class="k">Mínimo</div><b>${vs.length ? n1(Math.min(...vs)) : "—"}</b><span>${U}</span></div></div>
    <div class="lvz"><h3>Local y visitante</h3><div class="lvs">${esc(lvTxt)}</div>
      <div class="lvg">${lvCard("En casa", loc, ml, casaHoy)}${lvCard("Visitante", vis, mv, !casaHoy)}</div>
      <div class="dleg"><span><b></b>Promedio</span><span><u></u>Línea ${P.ln}</span></div>
      ${dotRow("En casa", loc, ml)}${dotRow("Visitante", vis, mv)}
      <div class="dax"><span>${n1(lo)}</span><span>Cada punto es un partido</span><span>${n1(hi)}</span></div></div>
    <div class="mtz"><div class="mth"><span>${ic("pulse")}</span>Métricas clave</div>
      <h3>${ns} de 4 señales respaldan el pick</h3><div class="seg4">${senal.slice().sort((a, b) => b - a).map((s) => `<i class="${s ? "ok" : "no"}"></i>`).join("")}</div>
      <div class="small">Lo que dicen sus últimos ${v10.length} partidos</div>
      <div class="m3"><div class="l"><span>Últimos 3 juegos</span><b>${l3.filter((e) => hit(e.v)).length}</b><em class="${sup(a3) ? "ok" : "no"}">${ic(a3 >= P.ln ? "ne" : "se")}${sg(a3 - P.ln)}</em></div>
        <div class="mb"><div class="bars">${old.map((e) => `<i class="${hit(e.v) ? "ok" : ""}"><s style="height:${Math.max(6, (100 * e.v) / mx)}%"></s></i>`).join("")}<u style="bottom:${(100 * P.ln) / mx}%"></u></div>
          <div class="lb">${old.map((e) => `<span>${esc(String(e.vs || "").slice(0, 3))}</span>`).join("")}</div></div></div>
      <div class="m3b"><div><b class="${sup(avg) ? "g" : "o"}">${ic(avg >= P.ln ? "ne" : "se")}${sg(avg - P.ln)}</b><span>Promedio vs línea</span></div><div><b class="g">${n1(med)}</b><span>Mediana</span></div><div><b class="${cons[1]}">${cons[0]}</b><span>Consistencia</span></div></div>
      <div class="rng"><div class="tr">${w.map((v) => `<i style="left:${wp(v)}"></i>`).join("")}<u style="left:${wp(P.ln)}"></u><b style="left:${wp(avg)}"></b></div>
        <div class="dax"><span>${n1(wlo)}</span><span>Línea ${P.ln}</span><span>${n1(whi)}</span></div><div class="small" style="text-align:center">De ${n1(Math.min(...w))} a ${n1(Math.max(...w))}, oscila ±${n1(sd)}</div></div></div>`;
}

function pkContexto(P) {
  const { g, x } = P, X = g.extra, all = pkSerie(P), sd = pkSide(P), rsd = sd === "h" ? "a" : "h", rival = g[rsd];
  const hit = (v) => pkHit(P, v), U = UN[P.s];
  const v10 = all.slice(0, 10), vv = v10.map((e) => e.v), hits10 = v10.filter((e) => hit(e.v)).length;
  const vr = pkVr(P), vrHits = vr.filter((e) => hit(e.v)).length;
  const lg = X.lg || {}, T = X.tabla || {};
  const casaHoy = (P.sc === "j" ? x.side : sd) === "h";
  const pc = (xs) => (xs.length ? Math.round((100 * xs.filter((e) => hit(e.v)).length) / xs.length) : 0);
  // ---- calendario (descanso)
  const dias = (s) => { const e = (X.hist[s] || [])[0]; return e ? Math.round((new Date(g.at) - new Date(e.d + "T20:00:00Z")) / 86400e3) : null; };
  const cal = (s) => { const d = dias(s), e = (X.hist[s] || [])[0], n7 = (X.hist[s] || []).filter((q) => (new Date(g.at) - new Date(q.d + "T20:00:00Z")) / 86400e3 <= 7).length;
    return `<div class="cal"><div class="cc">${crest(g[s], 30)}<b>${esc(abT(g[s]))}</b></div><div><b>${d != null ? `${d} días de descanso` : "Sin datos"}</b><span>Último partido de liga ${e ? fDia(e.d) : ""}</span></div><div class="r"><b>${n7}</b><span>partidos en 7 días</span></div></div>`; };
  const dh = dias("h"), da = dias("a");
  const desc = dh != null && da != null && dh !== da ? `<div class="calt">${esc(abT(g[dh > da ? "h" : "a"]))} llega más descansado que ${esc(abT(g[dh > da ? "a" : "h"]))}.</div>` : "";
  // ---- claves
  const t0 = (x.temp || [])[0];
  const lv = all.filter((e) => (casaHoy ? e.l : !e.l));
  const cl = [];
  if (t0) cl.push([t0.ok / t0.n >= 0.5 ? "ok" : "warn", `Cumplió en ${t0.ok} de ${t0.n} partidos esta temporada (${t0.y})`]);
  cl.push([hits10 / Math.max(v10.length, 1) >= 0.6 ? "ok" : "warn", `Cumplió en ${hits10} de los últimos ${v10.length} · promedia ${n1(media(vv))} (línea ${P.ln})`]);
  if (P.sc === "j" && x.est) cl.push(["neu", `Titular en ${x.est.tit} de los últimos ${x.est.n} partidos de su equipo · jugó ${x.est.pj}`]);
  if (lv.length) cl.push([pc(lv) >= 50 ? "ok" : "warn", `De ${casaHoy ? "local" : "visitante"}: ${pc(lv)}% de acierto en ${lv.length} partidos (promedio ${n1(media(lv.map((e) => e.v)))})`]);
  if (pkEsp(P) != null) cl.push(["ok", `El modelo espera ${n1(pkEsp(P))} ${U} en este partido`]);
  // ---- acierto por temporada
  const temp = (x.temp || []).map((t) => { const q = Math.round((100 * t.ok) / t.n); return `<div class="tmp"><div><span>${P.lado === "mas" ? "Superó" : "Quedó por debajo de"} ${P.ln} en ${t.ok} de ${t.n} partidos en ${t.y} (prom. ${n1(t.prom)})</span><b class="${q >= 50 ? "g" : "r"}">${q}%</b></div><i><s class="${q >= 50 ? "g" : "r"}" style="width:${q}%"></s></i></div>`; }).join("");
  const est = P.sc === "j" && x.est ? `<h2 class="pkh2">El jugador</h2><h4 class="pksub">Estado del jugador</h4><div class="pkcard ol"><div class="fl" style="margin:0 0 8px">ÚLTIMOS ${x.est.n} PARTIDOS</div><div class="pk3" style="margin:0">
      <div class="pkbox c ol"><div class="k">TITULAR</div><b>${x.est.tit}</b></div><div class="pkbox c ol"><div class="k">PARTIDOS</div><b>${x.est.pj}</b></div><div class="pkbox c ol"><div class="k">SUPLENTE</div><b>${x.est.pj - x.est.tit}</b></div></div></div>` : "";
  // ---- splits
  const loc = all.filter((e) => e.l), vis = all.filter((e) => !e.l);
  const spl = [["Local", loc], ["Visitante", vis], ...(P.sc === "j" ? [["Como titular", all.slice(0, 10)]] : []), [`vs ${abT(rival)}`, vr]].filter(([, xs]) => xs.length)
    .map(([t, xs]) => `<div class="sp"><b>${esc(t)}</b><span>${xs.length} partidos</span><strong>${n1(media(xs.map((e) => e.v)))}</strong><em class="${pc(xs) >= 60 ? "g" : ""}">${pc(xs)}%</em></div>`).join("");
  const trend = (k) => { const xs = all.slice(0, k); return xs.length ? `<div class="pkbox c ol"><div class="k">L${k}</div><b>${n1(media(xs.map((e) => e.v)))}</b><span class="${pc(xs) >= 60 ? "g" : ""}">${pc(xs)}%</span></div>` : ""; };
  const ult = all[0];
  // ---- equipos
  const H = (s, n) => (X.hist[s] || []).slice(0, n);
  const rec = (xs) => { const o = { G: 0, E: 0, P: 0 }; xs.forEach((e) => o[e.r]++); return o; };
  const posCol = (s) => { const t = T[s]; return `<div class="pcol">${crest(g[s], 34)}<span class="ab">${esc(abT(g[s]))}</span>${t ? `<div class="big">${t.g}-${t.e}-${t.p}</div><span>${t.pj ? (Math.round((1000 * t.g) / t.pj) / 10) : 0}%</span><span>${t.pos}º de ${T.n} · ${t.pts} pts</span>` : `<span>Sin datos de la temporada</span>`}${pkRacha(X.hist[s])}</div>`; };
  const u10 = (s) => { const xs = H(s, 10), r = rec(xs), gf = xs.reduce((a, e) => a + e.gf, 0), gc = xs.reduce((a, e) => a + e.gc, 0), d = gf - gc;
    return `<div class="pcol">${crest(g[s], 34)}<span class="ab">${esc(abT(g[s]))}</span><div class="big">${r.G}-${r.E}-${r.P}</div><span class="cap">ÚLTIMOS ${xs.length}</span><div class="bd">${pkRacha(X.hist[s])}<b class="${d > 0 ? "g" : d < 0 ? "r" : ""}">${d > 0 ? "+" : ""}${d}</b></div><span>${n1(gf / Math.max(xs.length, 1))} GF/J · ${n1(gc / Math.max(xs.length, 1))} GC/J</span></div>`; };
  const ini = (() => { const y = +g.at.slice(0, 4), m = +g.at.slice(5, 7); return `${m < 7 ? y - 1 : y}-07-01`; })();
  const tdRow = (lab, k, menosMejor) => {
    const a = H("h", 5).map((e) => e[k]), b = H("a", 5).map((e) => e[k]);
    if (!a.length || !b.length) return "";
    const ma = media(a), mb = media(b), ta = media((X.hist.h || []).filter((e) => e.d >= ini).map((e) => e[k])), tb = media((X.hist.a || []).filter((e) => e.d >= ini).map((e) => e[k]));
    const ga = menosMejor ? ma < mb : ma > mb, gb = menosMejor ? mb < ma : mb > ma, mx = Math.max(ma, mb, 0.1);
    return `<div class="tdr"><div><b class="${ga ? "g" : ""}">${n1(ma)}</b><span>Temp. ${n1(ta)}</span></div><em>${lab}</em><div class="r"><b class="${gb ? "g" : ""}">${n1(mb)}</b><span>Temp. ${n1(tb)}</span></div></div>
      <div class="tdb"><i><s class="${ga ? "on" : ""}" style="width:${(100 * ma) / mx}%"></s></i><i><s class="${gb ? "on" : ""}" style="width:${(100 * mb) / mx}%"></s></i></div>
      <div class="tdv"><div>${[...a].reverse().map((v, i, arr) => `<span class="${i === arr.length - 1 ? "on" : ""}">${n1(v)}</span>`).join("")}</div><div>${b.map((v, i) => `<span class="${i === 0 ? "on" : ""}">${n1(v)}</span>`).join("")}</div></div>`;
  };
  const H5 = (s) => H(s, 5);
  const cnt = (s, f) => H5(s).filter(f).length;
  const resRow = (t, f) => { const a = cnt("h", f), b = cnt("a", f), na = H5("h").length || 1, nb = H5("a").length || 1, ga = a / na > b / nb, gb = b / nb > a / na;
    return `<div class="tdr"><div><b class="${ga ? "g" : ""}">${a}/${H5("h").length}</b></div><em>${t}</em><div class="r"><b class="${gb ? "g" : ""}">${b}/${H5("a").length}</b></div></div><div class="tdb"><i><s class="${ga ? "on" : ""}" style="width:${(100 * a) / na}%"></s></i><i><s class="${gb ? "on" : ""}" style="width:${(100 * b) / nb}%"></s></i></div>`; };
  const h2h = (X.vr.h || []).slice(0, 5);
  const wH = h2h.filter((e) => e.gf > e.gc).length, wA = h2h.filter((e) => e.gf < e.gc).length;
  const totP = h2h.length ? media(h2h.map((e) => e.gf + e.gc)) : 0;
  const pm = Object.fromEntries(g.mercados.map((s) => [s.m, s]));
  const tres = [[`${abT(g.h)} prob. victoria`, pm["1"]], ["Empate", pm["X"]], [`${abT(g.a)} prob. victoria`, pm["2"]]];
  const best = Math.max(...tres.map(([, s]) => (s ? s.p : 0)));
  const dots = (xs) => xs.map((e) => `<span class="wl ${e.r}">${e.r}</span>`).join("");
  const head = `${elPartido(g)}
    <div class="pkcard ol" style="margin-top:14px"><h4>Calendario</h4>${cal("h")}${cal("a")}${desc}<div class="small">Cuenta solo partidos de esta liga.</div></div>
    <div class="pkcard ol"><h4>Claves de la predicción</h4><div class="small">Lo que dicen los datos de esta apuesta</div>${clvList(cl)}</div>
    ${est}
    ${temp ? `<h4 class="pksub">Acierto por temporada</h4><div class="pkcard ol">${temp}</div>` : ""}
    <h4 class="pksub">Desglose estadístico</h4>
    <div class="pk3"><div class="pkbox c ol"><div class="k">DESV. EST.</div><b>${n1(desv(vv))}</b></div><div class="pkbox c ol"><div class="k">ACIERTO</div><b>${v10.length ? Math.round((100 * hits10) / v10.length) : 0}%</b></div><div class="pkbox c ol"><div class="k">JUEGOS</div><b>${v10.length}</b></div></div>
    ${spl ? `<h4 class="pksub">Splits situacionales</h4><div class="pkcard ol spl">${spl}</div>` : ""}
    <div class="pkcard ol"><h4>Contra ${esc(abT(rival))}</h4>${vr.length ? vr.map((e) => `<div class="vr"><span>${fDia(e.d)}</span><b>${n1(e.v)}</b><em class="${hit(e.v) ? "ok" : "no"}">${hit(e.v) ? "Acierto" : "Fallo"}</em></div>`).join("") +
      `<div class="small">Acertó en ${vrHits} de sus últimos ${vr.length} partidos contra ellos.</div>` : `<div class="small">No hay partidos contra ${esc(rival.n)} desde agosto de 2025.</div>`}</div>
    <h4 class="pksub">Tendencia reciente</h4><div class="pk3">${trend(7)}${trend(15)}${trend(30)}</div>
    ${ult ? `<div class="pkcard ol"><h4>Último juego</h4><div class="uj">${crest({ logo: lg[ult.vs], n: ult.vs, ab: ult.vs }, 34)}<div><b>${ult.l ? "vs" : "@"} ${esc(ult.vs)}</b>${ult.d ? `<span>${fDia(ult.d)}</span>` : ""}</div><div class="r"><b>${n1(ult.v)}</b><span class="${hit(ult.v) ? "g" : "o"}">${hit(ult.v) ? "Cumplió" : "Falló"}</span></div></div></div>` : ""}`;
  if (g.dep === "nba" && typeof nbaContexto === "function") return head + nbaContexto(g, sd, { rival: true, linea: P.ln, pick: P });
  return head + `
    <h2 class="pkh2">Los equipos</h2><h4 class="pksub">Posiciones</h4><div class="pkcard ol pos">${posCol("h")}${posCol("a")}</div>
    <h4 class="pksub">Forma del equipo (Ú10)</h4><div class="pkcard ol pos">${u10("h")}${u10("a")}</div>
    <h4 class="pksub">Forma reciente <small>Últimos 5 juegos</small></h4><div class="pkcard ol">${["h", "a"].map((s) => { const r = rec(H5(s)); return `<div class="fo">${crest(g[s], 24)}<b>${esc(abT(g[s]))}</b><span class="rc">${r.G}-${r.E}-${r.P}</span><span class="wls">${dots(H5(s))}</span></div>
      ${H5(s).map((e) => `<div class="fr"><span class="wl ${e.r}">${e.r}</span>${e.l ? "vs" : "@"} ${crest({ logo: lg[e.vs], n: e.vs, ab: e.vs }, 20)} ${esc(e.vs)}<span class="s">${e.gf}-${e.gc}</span><span class="d">${fDia(e.d)}</span></div>`).join("")}`; }).join("")}</div>
    <h4 class="pksub">Tendencias del equipo</h4><div class="pkcard ol tdz"><div class="tdh"><span>${crest(g.h, 22)}<b>${esc(abT(g.h))}</b></span><span><b>${esc(abT(g.a))}</b>${crest(g.a, 22)}</span></div>
      <div class="fl" style="margin:12px 0 4px">ÚLTIMOS 5</div><div class="tdd"><span>Antiguo ${ic("right")} Reciente</span><span>Reciente ${ic("left")} Antiguo</span></div>
      ${tdRow("Goles", "gf")}${tdRow("Córners", "cor")}${tdRow("Tarjetas", "tar", true)}${tdRow("Tiros a puerta", "sot")}${tdRow("Tiros", "tir")}
      <div class="fl" style="margin:18px 0 4px">RESULTADOS</div>${resRow("Ambos marcaron", (e) => e.gf > 0 && e.gc > 0)}${resRow("Más de 2.5 goles", (e) => e.gf + e.gc > 2.5)}${resRow("Porterías a cero", (e) => e.gc === 0)}</div>
    <h4 class="pksub">Últimos 5 enfrentamientos</h4><div class="pkcard ol">${h2h.length ? `<div class="h2hh">${crest(g.h, 26)}<b>${wH}–${wA}</b>${crest(g.a, 26)}<span>Total promedio: ${n1(totP)}</span></div>` +
      h2h.map((e) => { const hs = e.l ? e.gf : e.gc, as = e.l ? e.gc : e.gf, loc = e.l ? abT(g.h) : abT(g.a), vis = e.l ? abT(g.a) : abT(g.h), w = hs === as ? "Empate" : hs > as ? loc : vis, mio = w === abT(g[sd]);
        return `<div class="h2r"><span>${fDia(e.d)}</span><b>${esc(loc)} ${hs} vs ${esc(vis)} ${as}</b><em class="${w === "Empate" ? "" : mio ? "g" : "r"}">${esc(w)}</em></div>`; }).join("") : `<div class="small">No se han enfrentado desde agosto de 2025.</div>`}</div>
    <h2 class="pkh2">Mercado</h2><h4 class="pksub">Predicción del partido</h4>
    <div class="pk3">${tres.map(([t, s]) => s ? `<div class="pkbox c ol ${s.p === best ? "sel" : ""}"><div class="k">${esc(t.toUpperCase())}</div><b>${pct(s.p, 1)}</b></div>` : "").join("")}</div>`;
}

I.bolt2 = '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>';
I.home2 = '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>';
I.bars2 = '<path d="M6 20V10M12 20V4M18 20v-7"/>';
I.info = '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>';
I.target = '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>';
I.sparkle = '<path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>';

// ---------- Monte Carlo (en el celular): el partido se simula N veces
function rngDe(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function gamma(r, k) {   // Marsaglia-Tsang, media k
  if (k < 1) return gamma(r, k + 1) * Math.pow(r(), 1 / k);
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) { let x, v; do { x = gauss(r); v = 1 + c * x; } while (v <= 0); v = v * v * v; const u = r();
    if (u < 1 - 0.0331 * x * x * x * x || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v; }
}
function poisson(r, l) { if (l > 30) return Math.max(0, Math.round(l + Math.sqrt(l) * gauss(r))); const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; }
function montecarlo(P, N = 100000) {
  const m = Math.max(pkEsp(P) || 0.05, 0.05), disp = P.x.disp || 1, nObs = P.s === "pts" ? 5000 : Math.max(pkSerie(P).length, 5);   // puntos NBA: la desviación del robot ya trae la incertidumbre del modelo
  let seed = 0; for (const ch of P.g.id + P.x.m) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  const r = rngDe(seed);
  const rr = disp > 1.001 ? m / (disp - 1) : 0;          // binomial negativa = Poisson con media gamma
  const draw = (mm) => poisson(r, rr ? mm * gamma(r, rr) / rr : mm);
  const out = new Array(N); let ok = 0;
  const muSamp = new Array(400);
  for (let i = 0; i < N; i++) {
    const mm = m * gamma(r, nObs) / nObs;               // incertidumbre del promedio (según partidos observados)
    const v = draw(mm); out[i] = v; if (pkHit(P, v)) ok++;
    if (i < 400) muSamp[i] = mm;
  }
  out.sort((a, b) => a - b);
  const q = (f) => out[Math.min(N - 1, Math.floor(f * N))];
  const cnt = {}; out.forEach((v) => (cnt[v] = (cnt[v] || 0) + 1));
  const moda = +Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
  const mean = out.reduce((s, v) => s + v, 0) / N, sd = Math.sqrt(out.reduce((s, v) => s + (v - mean) ** 2, 0) / N);
  // rango de confianza: probabilidad con el promedio en su 10 % bajo y 10 % alto
  muSamp.sort((a, b) => a - b);
  const pAt = (mm) => { let h = 0; for (let i = 0; i < 8000; i++) if (pkHit(P, draw(mm))) h++; return h / 8000; };
  const pa = pAt(muSamp[40]), pb = pAt(muSamp[359]);
  return { N, p: ok / N, lo: Math.min(pa, pb), hi: Math.max(pa, pb), q05: q(0.05), q25: q(0.25), q50: q(0.5), q75: q(0.75), q95: q(0.95), moda, mean, sd };
}

function pkAnalisis(P) {
  const { g, x } = P, all = pkSerie(P), sd = pkSide(P), rival = pkRival(P), up = P.lado === "mas";
  const hit = (v) => pkHit(P, v), U = UN[P.s];
  const v10 = all.slice(0, 10), w = v10.map((e) => e.v), hits = v10.filter((e) => hit(e.v)).length, avg = media(w);
  const loc = all.filter((e) => e.l).slice(0, 10), vis = all.filter((e) => !e.l).slice(0, 10);
  const ml = media(loc.map((e) => e.v)), mv = media(vis.map((e) => e.v));
  const l5 = media(all.slice(0, 5).map((e) => e.v)), l10 = avg;
  const sup = (v) => (up ? v > P.ln : v < P.ln);
  // tendencia: lo reciente a favor del pick
  const tr = sup(l5) && hits / Math.max(v10.length, 1) >= 0.6 ? "Fuerte" : sup(l10) ? "Media" : "Débil";
  const casaHoy = (P.sc === "j" ? x.side : sd) === "h";
  const fuerteLV = !loc.length || !vis.length ? null : (up ? ml >= mv : ml <= mv) ? "Local más fuerte" : "Visitante más fuerte";
  const senal = [sup(avg), sup(mediana(w)), sup(media(all.slice(0, 3).map((e) => e.v))), avg ? desv(w) / avg < 0.6 : false].filter(Boolean).length;
  const sTxt = senal >= 3 ? "Fuerte" : senal === 2 ? "Media" : "Débil";
  const cTxt = x.p >= 0.7 ? "Alta" : x.p >= 0.58 ? "Media" : "Baja";
  const pick = pkPill(P);
  const who = P.sc === "j" ? x.jugador : P.sc === "t" ? `El partido ${abT(g.h)} vs ${abT(g.a)}` : g[sd].n;
  const verbo = up ? "ha superado" : "se ha quedado por debajo de";
  const t = [`${who} ${verbo} ${P.ln} ${U} en ${hits} de los últimos ${v10.length} juegos (${v10.length ? Math.round((100 * hits) / v10.length) : 0}%).`];
  t.push(`Promediando ${n1(avg)} ${U.toUpperCase()} en este período — ${n1(Math.abs(avg - P.ln))} ${avg >= P.ln ? "por encima" : "por debajo"} de la línea.`);
  const lv = casaHoy ? loc : vis, mlv = casaHoy ? ml : mv;
  if (lv.length) t.push(`Los números de ${casaHoy ? "local" : "visitante"} (${n1(mlv)}) ${sup(mlv) ? "respaldan" : "no respaldan"} el pick en el partido de hoy.`);
  if (pkEsp(P) != null) t.push(`El modelo espera ${n1(pkEsp(P))} ${U} frente a ${rival.n}.`);
  const fact = [
    ["trend", `Tendencia: ${tr}`],
    ["bars2", `10J prom: ${n1(avg)}`],
    ...(fuerteLV ? [["home2", fuerteLV]] : []),
    ...(P.sc === "j" && x.est ? [["shield", `Titular ${x.est.tit} de ${x.est.n}`]] : [["shield", `${pkVr(P).length ? `Vs ${abT(rival)}: ${pkVr(P).filter((e) => hit(e.v)).length}/${pkVr(P).length}` : "Sin cruces recientes"}`]]),
  ];
  const mc = montecarlo(P);
  const mx = Math.max(mc.q95, P.ln * 1.6, 1);
  const fila = (lab, v, cls) => `<div class="mcr ${cls || ""}"><span>${lab}</span><i><s style="width:${Math.max(3, (100 * v) / mx)}%"></s><u style="left:${(100 * P.ln) / mx}%"></u></i><b>${n1(v)}</b></div>`;
  return `<div class="iac"><div class="iatop">
      <div class="iah"><span class="iaic">${ic("bolt2")}</span><div><b>Análisis IA</b><small>CASHBET v2</small></div><em><i></i>MODELO EN VIVO</em></div>
      <div class="iaconf"><span>CONFIANZA DEL MODELO</span><b>${pct(x.p)}</b></div>
      <div class="iabar"><s style="width:${x.p * 100}%"></s></div><div class="iapk">${esc(pick.toUpperCase())}</div></div>
      <div class="iaf"><div class="fl">FACTORES CLAVE</div><div class="chips2">${fact.map(([i, s]) => `<span>${ic(i)}${esc(s)}</span>`).join("")}</div></div>
      <p class="iatx">${t.map(esc).join(" ")}</p>
      <div class="ia3"><div><span>SEÑAL</span><b>${sTxt}</b></div><div><span>CONFIANZA</span><b>${cTxt}</b></div><div><span>MUESTRA</span><b>${v10.length} juegos</b></div></div></div>
    <div class="mcc"><div class="mctop">
      <div class="iah"><span class="iaic mc">${ic("pulse")}</span><div><b>Simulaciones Monte Carlo</b><small>${mc.N.toLocaleString("es-CO")} simulaciones</small></div><em class="mc">${ic("sparkle")}CASHBET</em></div>
      <div class="mci">${ic("info")}<span>Nuestra IA simuló este juego ${mc.N.toLocaleString("es-CO")} veces para predecir el resultado más probable</span></div>
      <div class="mcp"><div class="fl">PROBABILIDAD DE ACERTAR</div><div class="mcpp"><span>${ic("target")}${esc(pick.toUpperCase())}</span><b>${(mc.p * 100).toFixed(1)}%</b></div>
        <div class="mcbar"><s style="width:${mc.p * 100}%"></s></div><div class="mcrc">Rango de confianza: ${Math.round(mc.lo * 100)}% — ${Math.round(mc.hi * 100)}%</div></div></div>
      <div class="mcz"><div class="mch"><div><div class="fl" style="margin:0">RANGO PROYECTADO</div><small>Lo que nuestra IA predice que podría pasar</small></div><span><u></u>OBJETIVO ${P.ln}</span></div>
        ${fila("Peor caso", mc.q05, "lo")}${fila("Rango bajo", mc.q25, "lo")}${fila("MÁS PROBABLE", mc.q50, "mp")}${fila("Rango alto", mc.q75)}${fila("Mejor caso", mc.q95)}</div>
      ${mcAnalisis(mc.p, mc.q25, mc.q75, mc.mean, P.ln, up, x.valor, mc.N)}
      <div class="mc4"><div><span>RESULTADO ESPERADO</span><b>${n1(mc.mean)}</b></div><div><span>RESULTADO MÁS TÍPICO</span><b>${n1(mc.moda)}</b></div><div><span>CUÁNTO VARÍA</span><b>±${n1(mc.sd)}</b></div><div><span>MÉTODO DE CÁLCULO</span><b>IA Sim</b></div></div></div>`;
}

// pastilla de ventaja + texto "ANÁLISIS IA" dentro de la tarjeta Monte Carlo (como la referencia)
function mcAnalisis(p, q25, q75, media, ln, up, valor, N) {
  const sup = Math.round(p * 100), lado = up ? "superan" : "quedan por debajo de";
  const tx = `En ${N.toLocaleString("es-CO")} simulaciones, el ${sup}% ${lado} la línea de ${ln}. El resultado esperado es ${n1(media)} y la mitad central de las simulaciones va de ${n1(q25)} a ${n1(q75)}. `
    + (ln >= q25 && ln <= q75 ? "La línea cae dentro de esa franja central: el riesgo real es la dispersión, un partido raro la puede tumbar. " : `La línea queda ${ln < q25 ? "por debajo" : "por encima"} de esa franja central, lo que ${(ln < q25) === up ? "respalda" : "va en contra de"} el pick. `)
    + (valor > 0 ? `La cuota de la casa paga más de lo que vale según el modelo (+${(valor * 100).toFixed(1)}%).` : "Sin cuota de la casa para este mercado: vale la pena solo si tu casa paga al menos lo que dice “vale desde”.");
  return `${valor > 0 ? `<div class="mcven"><span>${ic("trend")}+${(valor * 100).toFixed(1)}% Ventaja</span></div>` : ""}<div class="mcia"><div class="fl">${ic("bars2")}ANÁLISIS IA</div><p>${esc(tx)}</p></div>`;
}

// ------------------------------------------------------------ lista de Predicciones
function pickItems() {
  if (!HIST && typeof cargarHist === "function") cargarHist();
  if (typeof corregirProps === "function") corregirProps();   // % real de los jugadores NBA
  const hoy = D.partidos.filter((g) => esHoy(g.at) && new Date(g.at) > Date.now());
  const it = [];
  for (const g of hoy) {
    if (!g.pick.bajo) it.push({ k: "g", g, p: g.pick.tipo === "valor" ? g.pick.pv : g.pick.p, mk: "res", dep: g.dep, eq: 1,
      val: g.pick.tipo === "valor" ? g.pick.valor : null, casa: g.pick.tipo === "valor" ? g.pick.cuota : null, min: g.pick.minima || vale(g.pick.justa) });
    if (g.extra) {
      g.extra.picks.forEach((x) => it.push({ k: "x", g, x, p: x.p, mk: x.s, dep: g.dep, eq: 1, min: vale(x.justa) }));
      g.extra.jug.forEach((x) => it.push({ k: "x", g, x, p: x.p, mk: x.s, dep: "futbol", eq: 0, min: vale(x.justa) }));
    }
  }
  // jugadores NBA: solo con valor real contra la casa; 1 por jugador y 3 por partido
  const vistoJ = new Set(), porEv = {};
  D.propsOk.filter((x) => esHoy(x.at) && new Date(x.at) > Date.now() && x.cuota >= 1.4).forEach((x) => {
    if (vistoJ.has(x.pl) || (porEv[x.ev] || 0) >= 3) return;
    vistoJ.add(x.pl); porEv[x.ev] = (porEv[x.ev] || 0) + 1;
    it.push({ k: "pr", x, p: x.p, mk: "nbaj", dep: "nba", eq: 0, val: x.prueba ? null : x.valor, casa: x.cuota, prueba: x.prueba });
  });
  it.forEach((e) => { e.gid = e.g ? e.g.id : e.x.ev; e.pr = pruebaDe(e); e.vl = e.k === "g" ? e.g.pick.val : e.x.val; });
  return it;
}
// acierto en la prueba del tipo de pick (para desempatar picks con el mismo %)
function pruebaDe(e) {
  if (e.k === "x") return e.x.prueba || 0;
  if (e.k === "pr") return 0;   // en prueba: sin acierto comprobado
  const cal = e.g.dep === "nba" ? D.acierto.calibracion_nba : D.acierto.calibracion_futbol;
  const q = e.p >= 0.5 ? e.p : 1 - e.p;
  const b = (cal || []).find((r) => { const [lo, hi] = r.rango.replace("%", "").split("-").map(Number); return q * 100 >= lo && q * 100 < (hi === 100 ? 101 : hi); });
  return b ? b.paso : 0;
}
// primero los ERRORES DE CUOTA (más valor primero); después los de mayor probabilidad
// pedido del usuario 2026-11-11: los de 74 %+ (máxima confianza) van primero
// respaldo del historial: "cumplió 9 de sus últimos 10 · H2H 3 de 4"
const respTxt = (r) => (r ? ` · cumplió ${r.u} de sus últimos ${r.un}${r.hn >= 2 ? ` · H2H ${r.h} de ${r.hn}` : ""}` : "");
const ordenar = (xs) => xs.sort((a, b) => (b.p >= 0.74) - (a.p >= 0.74) || (b.val != null) - (a.val != null) || (b.val || 0) - (a.val || 0) || b.p - a.p || b.pr - a.pr);
// cuota mínima para que valga la pena cuando no tenemos la cuota de la casa
const vale = (justa) => Math.round(justa * (D.margen || 1.05) * 100) / 100;
const valorCasa = (e) => e.val || 0;
const valTxt = (v) => `+${Math.round(v * 100)}%`;
// nivel de confianza: Alta >= 70 %, Media 60-70 %, Baja < 60 % (los de valor llevan además su etiqueta)
const nivel = (e) => { const r = Math.round(e.p * 100); return r >= 70 ? "ALTA" : r >= 60 ? "MEDIA" : "BAJA"; };
// pick "fuerte": puede acompañar al mejor del mismo partido
const fuerte = (e) => valorCasa(e) >= (D.valor_min || 0.05) || (e.k !== "pr" && e.p >= 0.65 && e.pr >= 61);
const tipoMk = (e) => (e.k === "x" ? e.x.s + "|" + (e.x.sc === "j" ? "j" : "e") : e.mk);
// los mejores: el mejor de cada partido siempre; hasta 'n' por partido si los
// siguientes son fuertes y de otro mercado (el resto se ve en la ficha)
function mejores(xs, n) {
  const c = {}, mk = {};
  return ordenar(xs).filter((e) => {
    const k = e.gid, t = tipoMk(e);
    if (!c[k]) { c[k] = 1; mk[k] = new Set([t]); return true; }
    if (c[k] >= n || mk[k].has(t) || !fuerte(e)) return false;
    c[k]++; mk[k].add(t); return true;
  });
}
// Todos: los mejores (regla de arriba) y, si no llegan a 15, los siguientes de más confianza (máx. 3 por partido)
function top15(xs, lim = 15) {
  const base = mejores(xs, 3).slice(0, lim), c = {};
  base.forEach((e) => (c[e.gid] = (c[e.gid] || 0) + 1));
  for (const e of ordenar(xs)) {
    if (base.length >= lim) break;
    if (base.includes(e) || (c[e.gid] || 0) >= 3) continue;
    base.push(e); c[e.gid] = (c[e.gid] || 0) + 1;
  }
  return ordenar(base);
}
// NBA: solo 20 picks al día en toda la app: hasta 15 de jugadores (los de mayor probabilidad, 1 por jugador,
// máx. 3 por partido) y el resto de equipos (mínimo 5 si hay); si faltan jugadores, se completa con equipos
const NBA_TOTAL = 20, NBA_JUG_MAX = 15, NBA_EQ_MIN = 5;
function nba20(it) {
  const ord = ordenar(it.filter((e) => e.dep === "nba"));
  const jug = ord.filter((e) => e.k === "pr"), eq = top15(ord.filter((e) => e.k !== "pr"), Infinity);
  const nJ = Math.min(jug.length, NBA_JUG_MAX, NBA_TOTAL - Math.min(NBA_EQ_MIN, eq.length));
  return [...jug.slice(0, nJ), ...eq.slice(0, NBA_TOTAL - nJ)];
}
// deja solo los 20 de NBA elegidos (el fútbol no cambia)
function soloNba20(it) { const sel = new Set(nba20(it)); return it.filter((e) => e.dep !== "nba" || sel.has(e)); }
// Todos: los 20 de NBA + los mejores de fútbol (máx. 15), de mayor a menor
function mezclaTodos(it, lim = 15) {
  return ordenar([...nba20(it), ...top15(it.filter((e) => e.dep !== "nba"), lim)]);
}
function picks() {
  let it = soloNba20(pickItems());
  if (ui.pseg === "jugadores") it = it.filter((e) => !e.eq);
  if (ui.pseg === "equipos") it = it.filter((e) => e.eq);
  if (ui.pdep !== "todos") it = it.filter((e) => e.dep === ui.pdep);
  if (ui.pmk !== "todos") it = it.filter((e) => e.mk === ui.pmk);
  if (ui.pgame && ui.pgame !== "todos") it = it.filter((e) => e.gid === ui.pgame);
  // NBA: solo los 20 del día (soloNba20); Todos = esos 20 + lo mejor de fútbol; Jugadores / Equipos = su parte
  if (ui.pseg === "todos" && ui.pmk === "todos") it = mezclaTodos(it);
  else it = [...top15(it.filter((e) => e.k !== "pr"), Infinity), ...it.filter((e) => e.k === "pr")];
  // como IABET: la lista va de mayor a menor confianza (%); los errores de cuota llevan su etiqueta +X%
  it = ui.pord && ui.pord !== "conf" ? ordenPor(it, ui.pord) : porConfianza(it);
  const total = it.length;
  it = it.slice(0, 80);
  const fil = ui.pdep !== "todos" || ui.pmk !== "todos" || (ui.pgame && ui.pgame !== "todos") || (ui.pord && ui.pord !== "conf");
  return header("Predicciones", `${total} picks · ${fmtD.format(new Date())}`) + `
    <div class="pkbar"><div class="pktabs dark">${[["todos", "Todos"], ["jugadores", "Jugadores"], ["equipos", "Equipos"]].map(([k, l]) => `<button class="${ui.pseg === k ? "on" : ""}" data-act="pseg" data-k="${k}">${l}</button>`).join("")}</div>
      <button class="pkfil ${fil ? "on" : ""}" data-act="pfil" aria-label="Filtros">${ic(fil ? "filtro" : "ball")}</button></div>
    ${fil ? `<div class="small" style="margin:-2px 2px 10px">Filtro: ${ui.pdep === "todos" ? "todos los deportes" : ui.pdep === "nba" ? "NBA" : "Fútbol"} · ${esc(MK.find(([k]) => k === ui.pmk)?.[1] || "")}${ui.pgame && ui.pgame !== "todos" && D.byId[ui.pgame] ? ` · ${esc(abT(D.byId[ui.pgame].h))} vs ${esc(abT(D.byId[ui.pgame].a))}` : ""} · orden: ${esc((ORDS.find(([k]) => k === (ui.pord || "conf")) || [])[1] || "")}</div>` : ""}
    <div class="pclist">${it.map(pcCard).join("") || `<div class="empty">Hoy ya no quedan picks con este filtro. Los de mañana aparecen aquí desde mañana; puedes verlos antes en el Calendario.</div>`}</div>`;
}
// foto del jugador recortada, pegada al borde izquierdo de la ficha, con el logo de la liga
function fotoJug(foto, nombre, tm, liga) {
  const f = foto ? `<img src="${esc(foto)}" alt="" loading="lazy">` : `<span class="pjs">${esc(sigla({ n: nombre }))}</span>`;
  return `<div class="pjf ${foto ? "" : "sin"}">${f}<span class="pjl">${liga}</span></div>`;
}
// escudo(s) grandes en el mismo espacio que la foto del jugador, con el logo de la liga
function escPanel(teams, liga) {
  return `<div class="pjf esc ${teams.length > 1 ? "dos" : ""}">${teams.map((t) => crest(t, 92)).join("")}<span class="pjl">${liga}</span></div>`;
}
function pcCard(e) {
  let img, lab, tit, sub, pill, up, attr, cuota, liga, jug = false, pan = false;
  if (e.k === "g") {
    const g = e.g; up = isUp(g.pick.m);
    img = escPanel([g.h, g.a], lgLogo(g.lg, 22)); pan = true;
    lab = g.dep === "nba" ? "PARTIDO · NBA" : "PARTIDO"; tit = `${g.h.n} vs ${g.a.n}`; sub = `${abT(g.h)} vs ${abT(g.a)} · ${hora(g.at)}`;
    pill = g.pick.txt; attr = `data-mp="${g.id}"`; cuota = g.pick.cuota || g.pick.justa; liga = g.liga;
  } else if (e.k === "x") {
    const g = e.g, x = e.x, P = pkFind(g.id, x.m); up = P.lado === "mas" || pkPill(P) === "Recibe tarjeta";
    const tm = pkTeam(P);
    if (P.sc === "j") { jug = true; img = fotoJug(x.foto, x.jugador, tm, lgLogo(g.lg, 22)); }
    else { img = escPanel(P.sc === "t" ? [g.h, g.a] : [tm], lgLogo(g.lg, 22)); pan = true; }
    lab = P.sc === "j" ? `${crest(tm, 16)}${esc(abT(tm))}` : P.sc === "t" ? "TOTAL DEL PARTIDO" : "TOTAL EQUIPO";
    tit = P.sc === "j" ? x.jugador : P.sc === "t" ? `Total de ${UN[P.s]}` : tm.n;
    sub = `${abT(g.h)} vs ${abT(g.a)} · ${hora(g.at)}`; pill = pkPill(P); attr = `data-pk="${g.id}" data-m="${esc(x.m)}"`; cuota = x.justa; liga = g.liga;
  } else {
    const x = e.x; up = x.lado === "mas";
    const eq = x.eq || { n: x.equipo };
    jug = true; img = fotoJug(x.foto, x.jugador, eq, lgLogo("nba", 22));
    lab = `${crest(eq, 16)}${esc(abT(eq))}`; tit = x.jugador; sub = `${esc(x.partido || "")} · ${hora(x.at)}`;
    pill = `${up ? "Más" : "Menos"} de ${x.linea} ${x.tipo.toLowerCase()}`; attr = `data-pr="${D.props.indexOf(x)}"`; cuota = x.cuota; liga = "NBA";
  }
  return `<button class="pcard ${jug || pan ? "jg" : ""}" ${attr}>${img}<div class="pcm"><div class="pcl">${jug ? lab : esc(lab)}</div><div class="pct">${esc(tit)}</div><div class="pcs">${esc(sub)}</div>
    <span class="pcpill ${up ? "" : "bad"}">${ic(up ? "up" : "down")}<span>${esc(pill)}</span></span>${e.vl && e.vl.e === "validado" ? `<div class="pcv validado">Validado · ${String(e.vl.ac).replace(".", ",")} % en ${e.vl.n} picks</div>` : ""}</div>
    <div class="pcr"><span class="pcp"><i></i>${pct(e.p)}</span></div>
    <div class="pcb">${e.val != null ? `<span class="pcval">+${Math.round(e.val * 100)}%</span><span class="pcc">${odd(e.casa)}</span>` : e.prueba ? `<span class="pcc" title="Cuota de la casa (en prueba)">${odd(e.casa)}</span>` : `<span class="pcc" title="Vale la pena desde esta cuota">${odd(e.min || cuota)}</span>`}</div></button>`;
}
// ---- orden de la lista (como IABET; aquí todas las opciones son gratis)
const ORDS = [["conf", "Confianza"], ["tasa", "Tasa de acierto (últimos 10)"], ["cuota", "Cuota"], ["edge", "Edge (ventaja sobre la cuota)"], ["mc", "Monte Carlo"]];
const _tasaC = {};
function tasaPick(e) {
  const k = e.k + "|" + (e.gid || "") + "|" + (e.x ? e.x.m || e.x.pl + e.x.t + e.x.linea : "");
  if (k in _tasaC) return _tasaC[k];
  let v = null;
  try {
    if (e.k === "x") { const P = pkFind(e.g.id, e.x.m); const s = pkSerie(P).slice(0, 10); if (s.length) v = s.filter((q) => pkHit(P, q.v)).length / s.length; }
    else if (e.k === "g" && typeof mpSerie === "function") { const I = mpInfo(e.g), s = mpSerie(e.g, I, I.side || "h").slice(0, 10); if (s.length) v = s.filter((q) => I.hit(q.v)).length / s.length; }
    else if (e.k === "pr" && e.x.ult) { const s = e.x.ult.slice(-10); if (s.length) v = s.filter((t) => (e.x.lado === "mas" ? t > e.x.linea : t < e.x.linea)).length / s.length; }
  } catch (err) {}
  return (_tasaC[k] = v);
}
const cuotaDe = (e) => e.casa || (e.k === "g" ? e.g.pick.cuota || e.g.pick.justa : e.k === "x" ? e.x.justa : e.x.cuota) || 0;
const edgeDe = (e) => (e.val != null ? e.val : e.casa ? e.p * e.casa - 1 : e.p * (e.min || cuotaDe(e)) - 1);
const porConfianza = (xs) => [...xs].sort((a, b) => Math.round(b.p * 100) - Math.round(a.p * 100) || (b.val || 0) - (a.val || 0) || b.pr - a.pr);
function ordenPor(xs, o) {
  const f = o === "tasa" ? (e) => tasaPick(e) ?? -1 : o === "cuota" ? cuotaDe : o === "edge" ? edgeDe : (e) => e.p;   // Monte Carlo = la simulación reproduce la probabilidad del modelo
  return [...xs].sort((a, b) => f(b) - f(a) || b.p - a.p);
}
function openFiltros() {
  const juegos = D.partidos.filter((g) => esHoy(g.at) && new Date(g.at) > Date.now() && (ui.pdep === "todos" || g.dep === ui.pdep));
  const op = (grp, k, l, cur) => `<button class="${cur === k ? "on" : ""}" data-act="${grp}" data-k="${k}"><span>${l}</span>${cur === k ? ic("check") : ""}</button>`;
  openSheet(`<h2 class="pkh2" style="margin-top:4px">Filtros</h2>
    <div class="fl">DEPORTE</div><div class="flist">${[["todos", "Todos"], ["futbol", "Fútbol"], ["nba", "Baloncesto (NBA)"]].map(([k, l]) => `<button class="${ui.pdep === k ? "on" : ""}" data-act="pdep" data-k="${k}"><span>${l}</span>${ui.pdep === k ? ic("check") : ""}</button>`).join("")}</div>
    <div class="fl">ORDENAR POR</div><div class="flist">${ORDS.map(([k, l]) => op("pord", k, l, ui.pord || "conf")).join("")}</div>
    <div class="fl">JUEGO</div><div class="flist fscroll">${op("pgame", "todos", "Todos los juegos", ui.pgame || "todos")}${juegos.map((g) => op("pgame", g.id, `${esc(g.dep === "nba" ? `${abT(g.a)} @ ${abT(g.h)}` : `${abT(g.h)} vs ${abT(g.a)}`)} · ${hora(g.at)}`, ui.pgame || "todos")).join("")}</div>
    <div class="fl">MERCADO</div><div class="flist">${MK.map(([k, l]) => `<button class="${ui.pmk === k ? "on" : ""}" data-act="pmk" data-k="${k}"><span>${l}</span>${ui.pmk === k ? ic("check") : ""}</button>`).join("")}</div>
    <button class="bigbtn" data-act="pfreset" style="margin-top:16px">Quitar filtros</button>`);
  $(".sheet").classList.add("pk");
}

// al cambiar de pestaña, la ficha sube hasta las pestañas: lo primero de la
// pestaña (por ejemplo "El partido" en Contexto) queda justo debajo
function alTab() {
  const sh = $(".sheet.on"), t = sh && sh.querySelector(".pktabs");
  if (sh && t && sh.scrollTop > t.offsetTop - 12) sh.scrollTo({ top: Math.max(t.offsetTop - 12, 0), behavior: "smooth" });
}
// acciones de esta parte (las llama act() de app.js)
function actPick(a, el) {
  const k = el.dataset.k;
  if (a === "pktab") { sheetState.tab = k; openPick(sheetState.pk.gid, sheetState.pk.m, true); alTab(); return true; }
  if (a === "pkn") { sheetState.n = +k; openPick(sheetState.pk.gid, sheetState.pk.m, true); return true; }
  if (a === "pkside") { sheetState.side = k; openPick(sheetState.pk.gid, sheetState.pk.m, true); return true; }
  if (a === "pkfollow") {
    const P = pkFind(sheetState.pk.gid, sheetState.pk.m), s = store.get("seg", {}), id = `pk|${P.g.id}|${P.x.m}`;
    if (s[id] && !puedeQuitar(s[id])) { toast("El partido ya empezó: este pick queda en tus Seguidos y en tu Bankroll"); return true; }
    if (s[id]) delete s[id];
    else { const tm = pkTeam(P);
      s[id] = { at: P.g.at, liga: P.g.liga, lg: P.g.lg, dep: P.g.dep, h: P.g.h.n, a: P.g.a.n, hl: P.g.h.logo, al: P.g.a.logo, hab: abT(P.g.h), aab: abT(P.g.a),
        txt: P.x.txt, pill: pkPill(P), up: P.lado === "mas", p: P.x.p, cuota: P.x.justa, oc: vale(P.x.justa), ln: P.ln,
        tipo: P.sc === "j" ? "Jugador" : P.sc === "t" ? "Total del partido" : "Total del equipo",
        nom: P.sc === "j" ? P.x.jugador : P.sc === "t" ? `${P.g.h.n} vs ${P.g.a.n}` : tm.n, foto: P.sc === "j" ? P.x.foto || null : null,
        tl: tm ? tm.logo : null }; }
    store.set("seg", s); toast(s[id] ? "Siguiendo esta predicción" : "Dejaste de seguirla");
    openPick(P.g.id, P.x.m, true); return true;
  }
  if (a === "pseg") { ui.pseg = k; rerender(); return true; }
  if (a === "pfil") { openFiltros(); return true; }
  if (a === "pdep" || a === "pmk" || a === "pord" || a === "pgame") { ui[a] = k; closeSheet(true); rerender(); return true; }
  if (a === "pfreset") { ui.pdep = "todos"; ui.pmk = "todos"; ui.pord = "conf"; ui.pgame = "todos"; closeSheet(true); rerender(); return true; }
  return false;
}
