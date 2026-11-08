// CASHBET — ficha de pick (equipo, partido o jugador) y lista de Predicciones.
// Usa las funciones y datos de app.js (D, esc, pct, odd, crest, ic, store...).

I.filtro = '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>';
I.ball = '<circle cx="12" cy="12" r="9"/><path d="m12 7 4 3-1.5 4.5h-5L8 10z"/><path d="M12 3v4M21 10.5 16 10M18 19l-3-4.5M6 19l3-4.5M3 10.5 8 10"/>';
I.spark = '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>';
I.left = '<path d="M15 18l-6-6 6-6"/>';

const UN = { cor: "córners", sot: "tiros a puerta", tir: "tiros", fal: "faltas", tar: "tarjetas" };
const MK = [["todos", "Todos los mercados"], ["res", "Ganador y goles"], ["cor", "Córners"], ["sot", "Tiros a puerta"], ["tir", "Tiros"], ["fal", "Faltas"], ["tar", "Tarjetas"]];
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
function bigImg(P) {
  if (P.sc === "j" && P.x.foto) return `<img class="pkbig foto" src="${esc(P.x.foto)}" alt="">`;
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
        <div class="pkm">${esc(abT(g.h))} vs ${esc(abT(g.a))} · ${cuando(g.at)}</div>
        <span class="pkpill ${up ? "" : "bad"}">${ic(up ? "up" : "down")}<span>${esc(pkPill(P))}</span></span>
        <div class="pkprog"><span><i style="width:${x.p * 100}%"></i></span><b>${pct(x.p)}</b></div>
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

function pkResumen(P) {
  const { x } = P, up = P.lado === "mas", all = pkSerie(P), n = sheetState.n, vals = all.slice(0, n);
  const hits = vals.filter((e) => pkHit(P, e.v)).length, vs = vals.map((e) => e.v);
  const U = UN[P.s].toUpperCase();
  const quien = P.sc === "j" ? "del jugador" : P.sc === "t" ? "del partido" : "del equipo";
  const loc = all.slice(0, 20).filter((e) => e.l), vis = all.slice(0, 20).filter((e) => !e.l);
  const half = (xs, t) => `<div><div class="k">${t}</div><b>${xs.length ? n1(media(xs.map((e) => e.v))) : "—"}</b><span>${xs.length ? `cumplió ${xs.filter((e) => pkHit(P, e.v)).length}/${xs.length}` : "sin partidos"}</span></div>`;
  const l5 = media(all.slice(0, 5).map((e) => e.v)), l10 = media(all.slice(0, 10).map((e) => e.v));
  const sideSw = P.sc === "t" ? `<div class="pk5 wide">${["h", "a"].map((sd) => `<button class="${pkSide(P) === sd ? "on" : ""}" data-act="pkside" data-k="${sd}">${esc(abT(P.g[sd]))}</button>`).join("")}</div>` : "";
  return `<div class="pk3">
      <div class="pkbox dir ${up ? "" : "bad"}"><div class="k">Dirección</div><b>${up ? "MÁS DE" : "MENOS DE"}</b></div>
      <div class="pkbox"><div class="k">Línea</div><b>${P.ln}</b></div>
      <div class="pkbox"><div class="k">Cuota justa</div><b>${odd(x.justa)}</b></div></div>
    <hr class="pkhr">
    <div class="pkhist"><h4>Historial de puntuación ${quien}</h4><div class="pk5">${[5, 10, 20].map((k) => `<button class="${n === k ? "on" : ""}" data-act="pkn" data-k="${k}">${k}G</button>`).join("")}</div></div>
    ${P.sc === "t" ? `<div class="pkhint">Partidos de</div>${sideSw}` : ""}
    ${vals.length ? pkChart(P, vals) : `<div class="empty">Sin partidos anteriores.</div>`}
    <div class="pk2">
      <div class="pkbox l"><div class="k">Tasa de acierto</div><b class="g">${hits}/${vals.length}</b><span>${vals.length ? Math.round(100 * hits / vals.length) : 0}%</span></div>
      <div class="pkbox l"><div class="k">Promedio · últimos ${vals.length}</div><b>${n1(media(vs))}</b><span>${U}</span></div>
      <div class="pkbox l"><div class="k">Máximo</div><b class="g">${vs.length ? n1(Math.max(...vs)) : "—"}</b><span>${U}</span></div>
      <div class="pkbox l"><div class="k">Mínimo</div><b>${vs.length ? n1(Math.min(...vs)) : "—"}</b><span>${U}</span></div></div>
    <div class="pkcard"><h4>Local / Visitante</h4><div class="small">Cómo cambia el rendimiento según dónde se juegue el partido (últimos 20).</div>
      <div class="pkhalf">${half(loc, "Local")}${half(vis, "Visitante")}</div></div>
    <div class="pkcard"><h4>Métricas clave</h4><div class="small">Los números que sostienen la línea: promedio, desviación y tendencia.</div>
      <div class="pkhalf three"><div><div class="k">Esperado (modelo)</div><b>${pkEsp(P) != null ? n1(pkEsp(P)) : "—"}</b></div>
        <div><div class="k">Desviación</div><b>${n1(desv(all.slice(0, 10).map((e) => e.v)))}</b></div>
        <div><div class="k">Tendencia</div><b class="${l5 >= l10 ? "g" : "o"}">${l5 >= l10 ? "Sube" : "Baja"}</b><span>L5 ${n1(l5)} · L10 ${n1(l10)}</span></div></div></div>`;
}

function pkRacha(hist) {
  if (!hist || !hist.length) return "";
  const r = hist[0].r; let n = 0;
  for (const e of hist) { if (e.r !== r) break; n++; }
  return `<span class="rb ${r}">${r}${n}</span>`;
}
const dots = (xs) => xs.map((e) => `<span class="wl ${e.r}">${e.r}</span>`).join("");

function pkContexto(P) {
  const { g, x } = P, X = g.extra, all = pkSerie(P), sd = pkSide(P), rsd = sd === "h" ? "a" : "h", rival = g[rsd];
  const v10 = all.slice(0, 10), vv = v10.map((e) => e.v), hits10 = v10.filter((e) => pkHit(P, e.v)).length;
  // contra el rival
  let vr = [];
  if (P.sc === "j") vr = (x.vr || []).map(([v, d]) => ({ v, d }));
  else vr = (X.vr[P.sc === "t" ? "h" : sd] || []).map((e) => ({ v: P.sc === "t" ? e[P.s] + e["o" + P.s] : e[P.s], d: e.d }));
  if (P.sc === "t") { }
  const vrHits = vr.filter((e) => pkHit(P, e.v)).length;
  const trend = (k) => { const xs = all.slice(0, k); return xs.length ? `<div class="pkbox c"><div class="k">L${k}</div><b>${n1(media(xs.map((e) => e.v)))}</b><span class="${xs.filter((e) => pkHit(P, e.v)).length / xs.length >= 0.6 ? "g" : ""}">${Math.round(100 * xs.filter((e) => pkHit(P, e.v)).length / xs.length)}%</span></div>` : ""; };
  const ult = all[0];
  const lg = X.lg || {};
  const T = X.tabla || {};
  const posCol = (s) => { const t = T[s]; return `<div class="pcol">${crest(g[s], 34)}<b>${esc(abT(g[s]))}</b>${t ? `<div class="big">${t.g}-${t.e}-${t.p}</div><span>${t.pts} pts · goles ${t.gf}-${t.gc}</span><span>${t.pos}º de ${T.n}</span>` : `<span>Sin datos de la temporada</span>`}${pkRacha(X.hist[s])}</div>`; };
  const H5 = (s) => (X.hist[s] || []).slice(0, 5);
  const cnt = (s, f) => H5(s).filter(f).length;
  const resRow = (t, f) => { const a = cnt("h", f), b = cnt("a", f), na = H5("h").length || 1, nb = H5("a").length || 1;
    return `<div class="rr"><b>${a}/${H5("h").length}</b><span>${t}</span><b>${b}/${H5("a").length}</b></div><div class="rb2"><i style="width:${50 * a / na}%"></i><u style="width:${50 * b / nb}%"></u></div>`; };
  const h2h = (X.vr.h || []).slice(0, 5);
  const pm = Object.fromEntries(g.mercados.map((s) => [s.m, s]));
  const tres = [[`${abT(g.h)} prob. victoria`, pm["1"]], ["Empate", pm["X"]], [`${abT(g.a)} prob. victoria`, pm["2"]]];
  const best = Math.max(...tres.map(([, s]) => (s ? s.p : 0)));
  const dias = (s) => { const e = (X.hist[s] || [])[0]; if (!e) return null; return Math.round((new Date(g.at) - new Date(e.d + "T20:00:00Z")) / 86400e3); };
  const cal = (s) => { const d = dias(s), e = (X.hist[s] || [])[0], n7 = (X.hist[s] || []).filter((q) => (new Date(g.at) - new Date(q.d + "T20:00:00Z")) / 86400e3 <= 7).length;
    return `<div class="cal">${crest(g[s], 30)}<div><b>${d != null ? `${d} días de descanso` : "Sin datos"}</b><span>Último partido ${e ? fDia(e.d) : ""}</span></div><div class="r"><b>${n7}</b><span>partidos en 7 días</span></div></div>`; };
  const who = P.sc === "j" ? x.jugador : P.sc === "t" ? "El partido" : g[sd].n;
  return `<h2 class="pkh2">Los equipos</h2><h4 class="pksub">Desglose estadístico</h4>
    <div class="pk3"><div class="pkbox c"><div class="k">DESV. EST.</div><b>${n1(desv(vv))}</b></div><div class="pkbox c"><div class="k">ACIERTO</div><b>${v10.length ? Math.round(100 * hits10 / v10.length) : 0}%</b></div><div class="pkbox c"><div class="k">JUEGOS</div><b>${v10.length}</b></div></div>
    <div class="pkcard"><h4>Contra ${esc(abT(rival))}</h4>${vr.length ? vr.map((e) => `<div class="vr"><span>${fDia(e.d)}</span><b>${n1(e.v)}</b><em class="${pkHit(P, e.v) ? "ok" : "no"}">${pkHit(P, e.v) ? "Acierto" : "Fallo"}</em></div>`).join("") +
      `<div class="small">Acertó en ${vrHits} de sus últimos ${vr.length} partidos contra ellos.</div>` : `<div class="small">No hay partidos contra ${esc(rival.n)} desde agosto de 2025.</div>`}</div>
    <h4 class="pksub">Tendencia reciente</h4><div class="pk3">${trend(7)}${trend(15)}${trend(30)}</div>
    ${ult ? `<div class="pkcard"><h4>Último juego</h4><div class="uj">${crest({ logo: lg[ult.vs], n: ult.vs, ab: ult.vs }, 34)}<div><b>${ult.l ? "vs" : "@"} ${esc(ult.vs)}</b>${ult.d ? `<span>${fDia(ult.d)}</span>` : ""}</div><div class="r"><b>${n1(ult.v)}</b><span class="${pkHit(P, ult.v) ? "g" : "o"}">${pkHit(P, ult.v) ? "Cumplió" : "Falló"}</span></div></div></div>` : ""}
    <h4 class="pksub">Posiciones</h4><div class="pkcard pos">${posCol("h")}${posCol("a")}</div>
    <h4 class="pksub">Forma del equipo (Ú10)</h4><div class="pkcard">${["h", "a"].map((s) => `<div class="fo">${crest(g[s], 24)}<b>${esc(abT(g[s]))}</b><span class="wls">${dots((X.hist[s] || []).slice(0, 10))}</span></div>`).join("")}</div>
    <h4 class="pksub">Forma reciente <small>Últimos 5 juegos</small></h4><div class="pkcard">${["h", "a"].map((s) => `<div class="fo">${crest(g[s], 24)}<b>${esc(abT(g[s]))}</b><span class="wls">${dots(H5(s))}</span></div>
      ${H5(s).map((e) => `<div class="fr"><span class="wl ${e.r}">${e.r}</span>${e.l ? "vs" : "@"} ${crest({ logo: lg[e.vs], n: e.vs, ab: e.vs }, 20)} ${esc(e.vs)}<span class="s">${e.gf}-${e.gc}</span><span class="d">${fDia(e.d)}</span></div>`).join("")}`).join("")}</div>
    <h4 class="pksub">Resultados <small>Últimos 5</small></h4><div class="pkcard res"><div class="rr hd">${crest(g.h, 22)}<span></span>${crest(g.a, 22)}</div>
      ${resRow("Ambos marcaron", (e) => e.gf > 0 && e.gc > 0)}${resRow("Más de 2.5 goles", (e) => e.gf + e.gc > 2.5)}${resRow("Porterías a cero", (e) => e.gc === 0)}</div>
    <h4 class="pksub">Últimos 5 enfrentamientos</h4><div class="pkcard">${h2h.length ? h2h.map((e) => { const hs = e.l ? e.gf : e.gc, as = e.l ? e.gc : e.gf, loc = e.l ? abT(g.h) : abT(g.a), vis = e.l ? abT(g.a) : abT(g.h), w = hs === as ? "Empate" : (hs > as ? loc : vis);
      return `<div class="fr"><span class="d" style="margin:0 10px 0 0">${fDia(e.d)}</span>${esc(loc)} ${hs} vs ${esc(vis)} ${as}<span class="s"><em class="tg">${esc(w)}</em></span></div>`; }).join("") : `<div class="small">No se han enfrentado desde agosto de 2025.</div>`}</div>
    <h2 class="pkh2">Mercado</h2><h4 class="pksub">Predicción del partido</h4>
    <div class="pk3">${tres.map(([t, s]) => s ? `<div class="pkbox c ${s.p === best ? "sel" : ""}"><div class="k">${esc(t.toUpperCase())}</div><b>${pct(s.p, 1)}</b></div>` : "").join("")}</div>
    <h4 class="pksub">Calendario</h4><div class="pkcard">${cal("h")}${cal("a")}<div class="small">Cuenta solo partidos de esta liga.</div></div>
    <h4 class="pksub">Claves de la predicción <small>Lo que dicen los datos de esta apuesta</small></h4><div class="pkcard"><ul class="why">
      <li>${ic("check")}<span>Cumplió en ${hits10} de los últimos ${v10.length} · promedia ${n1(media(vv))} (línea ${P.ln}).</span></li>
      ${pkEsp(P) != null ? `<li>${ic("check")}<span>El modelo espera ${n1(pkEsp(P))} ${UN[P.s]} en este partido.</span></li>` : ""}
      ${vr.length ? `<li>${ic("check")}<span>Contra ${esc(rival.n)}: cumplió ${vrHits} de ${vr.length}.</span></li>` : ""}
      ${x.prueba ? `<li>${ic("check")}<span>En la prueba con partidos que el modelo no había visto, este tipo de pick acertó el ${x.prueba}%.</span></li>` : ""}</ul></div>`;
}

function pkAnalisis(P) {
  const { g, x } = P, all = pkSerie(P), sd = pkSide(P), rival = g[sd === "h" ? "a" : "h"];
  const v10 = all.slice(0, 10), hits = v10.filter((e) => pkHit(P, e.v)).length, m10 = media(v10.map((e) => e.v));
  const loc = all.slice(0, 20).filter((e) => e.l), vis = all.slice(0, 20).filter((e) => !e.l);
  const casa = (P.sc === "j" ? x.side : sd) === "h";
  const lv = casa ? loc : vis;
  const esp = pkEsp(P);
  const who = P.sc === "j" ? x.jugador : P.sc === "t" ? `El partido entre ${g.h.n} y ${g.a.n}` : g[sd].n;
  const pm = Object.fromEntries(g.mercados.map((s) => [s.m, s]));
  const t = [];
  t.push(`${who} ${P.sc === "t" ? "llega con" : "promedia"} ${n1(m10)} ${UN[P.s]} ${P.sc === "t" ? `por partido en los últimos 10 de ${g[sd].n}` : "en sus últimos 10 partidos"}, y ${P.lado === "mas" ? "superó" : "quedó por debajo de"} la línea de ${P.ln} en ${hits} de ellos.`);
  if (lv.length >= 3 && P.sc !== "t") t.push(`Como ${casa ? "local" : "visitante"}, que es como juega este partido, promedia ${n1(media(lv.map((e) => e.v)))}.`);
  if (esp != null) t.push(`El modelo, que mide la fuerza de cada equipo y la del rival con toda la temporada (dando más peso a lo reciente), espera ${n1(esp)} ${UN[P.s]} frente a ${rival.n}.`);
  t.push(`Por eso le da ${pct(x.p)} a "${pkPill(P).toLowerCase()}", con una cuota justa de ${odd(x.justa)}: si tu casa paga más que eso, el pick tiene valor según el modelo.`);
  if (x.prueba) t.push(`En la prueba con partidos que el modelo no había visto, este tipo de pick acertó el ${x.prueba}% de las veces.`);
  if (P.sc === "j") t.push(`Es titular probable según sus últimos partidos; si no juega, la apuesta normalmente se anula.`);
  const ganH = pm["1"] ? pm["1"].p : 0, ganA = pm["2"] ? pm["2"].p : 0;
  return `<div class="pkcard"><h4 class="ia">${ic("spark")}Análisis IA del pick</h4><div class="small">Escrito automáticamente con los números del modelo y de la temporada.</div>
    <p class="iat">${t.map(esc).join(" ")}</p></div>
    <h4 class="pksub">Probabilidad de victoria <small>Modelo</small></h4>
    <div class="pkcard"><div class="pv"><span>${crest(g.h, 22)}${esc(abT(g.h))}</span><span>${esc(abT(g.a))}${crest(g.a, 22)}</span></div>
      <div class="pv big"><b class="${ganH >= ganA ? "g" : ""}">${pct(ganH, 1)}</b><b class="${ganA > ganH ? "g" : ""}">${pct(ganA, 1)}</b></div>
      <div class="pvb"><i class="${ganH >= ganA ? "on" : ""}" style="width:${ganH * 100}%"></i><u class="${ganA > ganH ? "on" : ""}" style="width:${ganA * 100}%"></u></div></div>`;
}

// ------------------------------------------------------------ lista de Predicciones
function pickItems() {
  const hoy = D.partidos.filter((g) => esHoy(g.at) && new Date(g.at) > Date.now());
  const it = [];
  for (const g of hoy) {
    it.push({ k: "g", g, p: g.pick.p, mk: "res", dep: g.dep, eq: 1 });
    if (g.extra) {
      g.extra.picks.forEach((x) => it.push({ k: "x", g, x, p: x.p, mk: x.s, dep: "futbol", eq: 1 }));
      g.extra.jug.forEach((x) => it.push({ k: "x", g, x, p: x.p, mk: x.s, dep: "futbol", eq: 0 }));
    }
  }
  D.propsOk.filter((x) => esHoy(x.at)).forEach((x) => it.push({ k: "pr", x, p: x.p, mk: "nbaj", dep: "nba", eq: 0 }));
  return it;
}
function picks() {
  let it = pickItems();
  if (ui.pseg === "jugadores") it = it.filter((e) => !e.eq);
  if (ui.pseg === "equipos") it = it.filter((e) => e.eq);
  if (ui.pdep !== "todos") it = it.filter((e) => e.dep === ui.pdep);
  if (ui.pmk !== "todos") it = it.filter((e) => e.mk === ui.pmk);
  it.sort((a, b) => b.p - a.p || (b.x && b.x.prueba || 0) - (a.x && a.x.prueba || 0));
  const total = it.length;
  it = it.slice(0, 120);
  const fil = ui.pdep !== "todos" || ui.pmk !== "todos";
  return header("Predicciones", `${total} picks · ${fmtD.format(new Date())}`) + `
    <div class="pkbar"><div class="pktabs dark">${[["todos", "Todos"], ["jugadores", "Jugadores"], ["equipos", "Equipos"]].map(([k, l]) => `<button class="${ui.pseg === k ? "on" : ""}" data-act="pseg" data-k="${k}">${l}</button>`).join("")}</div>
      <button class="pkfil ${fil ? "on" : ""}" data-act="pfil" aria-label="Filtros">${ic(fil ? "filtro" : "ball")}</button></div>
    ${fil ? `<div class="small" style="margin:-2px 2px 10px">Filtro: ${ui.pdep === "todos" ? "todos los deportes" : ui.pdep === "nba" ? "NBA" : "Fútbol"} · ${esc(MK.find(([k]) => k === ui.pmk)?.[1] || "")}</div>` : ""}
    <div class="pclist">${it.map(pcCard).join("") || `<div class="empty">Hoy ya no quedan picks con este filtro. Los de mañana aparecen aquí desde mañana; puedes verlos antes en el Calendario.</div>`}</div>
    <div class="small" style="text-align:center;margin:14px 0">Solo picks con cuota de ${odd(D.cuota_min || 1.3)} o más · ordenados por confianza</div>`;
}
function pcCard(e) {
  let img, lab, tit, sub, pill, up, attr, cuota, liga;
  if (e.k === "g") {
    const g = e.g; up = isUp(g.pick.m);
    img = `<div class="pcimg dos">${crest(g.h, 46)}${crest(g.a, 46)}</div>`;
    lab = g.dep === "nba" ? "PARTIDO · NBA" : "PARTIDO"; tit = `${g.h.n} vs ${g.a.n}`; sub = `${abT(g.h)} vs ${abT(g.a)} · ${hora(g.at)}`;
    pill = g.pick.txt; attr = `data-g="${g.id}"`; cuota = g.pick.cuota || g.pick.justa; liga = g.liga;
  } else if (e.k === "x") {
    const g = e.g, x = e.x, P = pkFind(g.id, x.m); up = P.lado === "mas" || pkPill(P) === "Recibe tarjeta";
    const tm = pkTeam(P);
    img = P.sc === "j" ? (x.foto ? `<img class="pcimg foto" src="${esc(x.foto)}" alt="" loading="lazy">` : `<div class="pcimg">${crest(tm, 74)}</div>`)
      : P.sc === "t" ? `<div class="pcimg dos">${crest(g.h, 46)}${crest(g.a, 46)}</div>` : `<div class="pcimg">${crest(tm, 74)}</div>`;
    lab = P.sc === "j" ? `JUGADOR · ${abT(tm)}` : P.sc === "t" ? "TOTAL DEL PARTIDO" : "TOTAL EQUIPO";
    tit = P.sc === "j" ? x.jugador : P.sc === "t" ? `Total de ${UN[P.s]}` : tm.n;
    sub = `${abT(g.h)} vs ${abT(g.a)} · ${hora(g.at)}`; pill = pkPill(P); attr = `data-pk="${g.id}" data-m="${esc(x.m)}"`; cuota = x.justa; liga = g.liga;
  } else {
    const x = e.x; up = x.lado === "mas";
    img = x.foto ? `<img class="pcimg foto" src="${esc(x.foto)}" alt="" loading="lazy">` : `<div class="pcimg"><span class="head crest-f" style="width:64px;height:64px">${esc(sigla({ n: x.jugador }))}</span></div>`;
    lab = `JUGADOR · NBA`; tit = x.jugador; sub = `${esc(x.partido || "")} · ${hora(x.at)}`;
    pill = `${up ? "Más" : "Menos"} de ${x.linea} ${x.tipo.toLowerCase()}`; attr = `data-pr="${D.props.indexOf(x)}"`; cuota = x.cuota; liga = "NBA";
  }
  return `<button class="pcard" ${attr}>${img}<div class="pcm"><div class="pcl">${esc(lab)}</div><div class="pct">${esc(tit)}</div><div class="pcs">${esc(sub)}</div>
    <span class="pcpill ${up ? "" : "bad"}">${ic(up ? "up" : "down")}<span>${esc(pill)}</span></span></div>
    <div class="pcr"><span class="pcp"><i></i>${pct(e.p)}</span><span class="pcc">cuota ${odd(cuota)}</span></div></button>`;
}
function openFiltros() {
  openSheet(`<h2 class="pkh2" style="margin-top:4px">Filtros</h2>
    <div class="fl">DEPORTE</div><div class="flist">${[["todos", "Todos"], ["futbol", "Fútbol"], ["nba", "Baloncesto (NBA)"]].map(([k, l]) => `<button class="${ui.pdep === k ? "on" : ""}" data-act="pdep" data-k="${k}"><span>${l}</span>${ui.pdep === k ? ic("check") : ""}</button>`).join("")}</div>
    <div class="fl">MERCADO</div><div class="flist">${MK.map(([k, l]) => `<button class="${ui.pmk === k ? "on" : ""}" data-act="pmk" data-k="${k}"><span>${l}</span>${ui.pmk === k ? ic("check") : ""}</button>`).join("")}</div>
    <button class="bigbtn" data-act="pfreset" style="margin-top:16px">Quitar filtros</button>`);
  $(".sheet").classList.add("pk");
}

// acciones de esta parte (las llama act() de app.js)
function actPick(a, el) {
  const k = el.dataset.k;
  if (a === "pktab") { sheetState.tab = k; openPick(sheetState.pk.gid, sheetState.pk.m, true); return true; }
  if (a === "pkn") { sheetState.n = +k; openPick(sheetState.pk.gid, sheetState.pk.m, true); return true; }
  if (a === "pkside") { sheetState.side = k; openPick(sheetState.pk.gid, sheetState.pk.m, true); return true; }
  if (a === "pkfollow") {
    const P = pkFind(sheetState.pk.gid, sheetState.pk.m), s = store.get("seg", {}), id = `pk|${P.g.id}|${P.x.m}`;
    if (s[id]) delete s[id];
    else s[id] = { at: P.g.at, liga: P.g.liga, h: P.g.h.n, a: P.g.a.n, hl: P.g.h.logo, al: P.g.a.logo, txt: P.x.txt, p: P.x.p };
    store.set("seg", s); toast(s[id] ? "Siguiendo esta predicción" : "Dejaste de seguirla");
    openPick(P.g.id, P.x.m, true); return true;
  }
  if (a === "pseg") { ui.pseg = k; rerender(); return true; }
  if (a === "pfil") { openFiltros(); return true; }
  if (a === "pdep" || a === "pmk") { ui[a] = k; closeSheet(true); rerender(); return true; }
  if (a === "pfreset") { ui.pdep = "todos"; ui.pmk = "todos"; closeSheet(true); rerender(); return true; }
  return false;
}
