// CASHBET — Calendario, Inicio, ficha de partido y Perfil (estilo de las capturas de referencia).
// Usa app.js y pick.js.

I.star = '<path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1L3.2 9.4l6.1-.8z"/>';
I.bolt = '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>';
I.right = '<path d="M9 18l6-6-6-6"/>';
I.chev = '<path d="m6 9 6 6 6-6"/>';
I.bellR = '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 21a2 2 0 0 0 4 0"/>';
I.money = '<path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>';
I.moon = '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>';
I.sun = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
I.screen = '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>';
I.globe = '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>';
I.shield = '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>';
I.help = '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/>';
I.chart = '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>';
I.heartP = '<path d="M12 20.5s-7.5-4.6-9.3-9.4C1.4 7.6 3.8 4 7.4 4c2 0 3.5 1.1 4.6 2.6C13.1 5.1 14.6 4 16.6 4c3.6 0 6 3.6 4.7 7.1-1.8 4.8-9.3 9.4-9.3 9.4z"/>';
I.pen = '<path d="M4 20h4L19 9l-4-4L4 16z"/>';
I.pin = '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>';

const ORDEN = ["eng.1", "esp.1", "ita.1", "ger.1", "fra.1", "uefa.champions", "col.1", "mex.1", "nba"];
ui.calLg = ui.calLg || "todas"; ui.calOpen = ui.calOpen || {}; ui.gtab = "previa";
const lgLogo = (k, s = 26) => { const L = (D.ligas || {})[k]; return L && L.logo ? `<img class="lglogo" src="${esc(L.logo)}" alt="" width="${s}" height="${s}">` : `<span class="lglogo crest-f" style="width:${s}px;height:${s}px">${esc(((L && L.n) || k).slice(0, 2))}</span>`; };
const dotsF = (f) => (f || []).slice(0, 3).map((r) => `<span class="wl ${r.r}">${r.r}</span>`).join("");
const pmOf = (g) => Object.fromEntries(g.mercados.map((s) => [s.m, s]));

// ------------------------------------------------------------ CALENDARIO
function gCard(g) {
  const pm = pmOf(g), od = g.odds || {}, f = g.forma || {};
  const o1 = od.h || (pm["1"] && pm["1"].justa), oX = g.dep === "futbol" ? (od.d || (pm["X"] && pm["X"].justa)) : null, o2 = od.a || (pm["2"] && pm["2"].justa);
  const up = isUp(g.pick.m);
  const t = (s) => `<div class="tm">${crest(g[s], 48)}<b>${esc(abT(g[s]))}</b><span>${esc(g[s].rec || "")}</span></div>`;
  return `<button class="gc" data-g="${g.id}"><div class="gt">${t("h")}
      <div class="mid"><b>${hora(g.at)}</b><span class="lg">${esc(g.liga)}</span><div class="fm">${dotsF(f.h)}<i>FORMA</i>${dotsF(f.a)}</div><span class="det">Detalles</span></div>${t("a")}</div>
    <div class="godds"><span><em>${esc(abT(g.h))}</em><b>${odd(o1)}</b></span>${oX ? `<span><em>X</em><b>${odd(oX)}</b></span>` : ""}<span><em>${esc(abT(g.a))}</em><b>${odd(o2)}</b></span></div>
    ${g.pick.bajo ? `<div class="gpk low"><span>Sin pick: ${g.pick.p > 0.75 ? `favorito muy claro (${esc(g.pick.txt)})` : "la casa ya paga lo justo"}</span></div>` : `<div class="gpk ${up ? "" : "bad"}">${ic(up ? "up" : "down")}<span>${esc(g.pick.txt)}</span><b>${pct(g.pick.p)}</b></div>`}</button>`;
}
function calendario() {
  if (typeof cargarRes === "function") { if (!RES) cargarRes(); else vivo(); }
  const dia = new Date(); dia.setDate(dia.getDate() + ui.cal);
  const sel = dkey(dia), R = (typeof RES !== "undefined" && RES) || {};
  const jugado = (id) => R[id] && (R[id].st === "in" || R[id].st === "post");
  // por jugarse (del modelo) + en vivo / terminados (ESPN)
  let gs = D.partidos.filter((g) => dkey(new Date(g.at)) === sel && !jugado(g.id)).map((g) => ({ g, lg: g.lg, dep: g.dep }));
  Object.entries(R).forEach(([id, r]) => { if (dkey(new Date(r.at)) === sel && (r.st === "in" || r.st === "post")) gs.push({ r, id, lg: r.lg, dep: r.dep }); });
  if (ui.calDep !== "todos") gs = gs.filter((x) => x.dep === ui.calDep);
  if (ui.calLg !== "todas") gs = gs.filter((x) => x.lg === ui.calLg);
  const grupos = {};
  gs.forEach((x) => (grupos[x.lg] = grupos[x.lg] || []).push(x));
  const keys = ORDEN.filter((k) => grupos[k]);
  const dias = { [ui.cal]: dia };
  const lab = ui.cal === 0 ? "Hoy" : ui.cal === 1 ? "Mañana" : ui.cal === -1 ? "Ayer" : cap(fmtS.format(dia));
  const depTxt = ui.calDep === "futbol" ? "Fútbol" : ui.calDep === "nba" ? "Baloncesto" : "";
  const fil = ui.calDep !== "todos" || ui.calLg !== "todas";
  const solo = keys.length === 1;
  return header("Calendario", `${gs.length} juegos · ${fmtD.format(dias[ui.cal])}`) + `
    <div class="cbar"><div class="cday"><button data-act="cal" data-i="${Math.max(ui.cal - 1, -2)}" ${ui.cal > -2 ? "" : "disabled"} aria-label="Día anterior">${ic("left")}</button><b>${lab}</b><button data-act="cal" data-i="${Math.min(ui.cal + 1, 7)}" ${ui.cal < 7 ? "" : "disabled"} aria-label="Día siguiente">${ic("right")}</button></div>
      <button class="cfil ${fil ? "on" : ""}" data-act="cfil">${ic("filtro")}${fil ? `<span>${esc(ui.calLg !== "todas" ? D.ligas[ui.calLg].n : depTxt)}</span>` : ""}</button></div>
    ${keys.map((k) => {
      // en vivo primero, luego por jugarse (por confianza) y al final los terminados
      const ord = (x) => (x.r ? (x.r.st === "in" ? 0 : 2) : 1);
      const xs = grupos[k].sort((a, b) => ord(a) - ord(b) || (b.g && a.g ? b.g.pick.p - a.g.pick.p : 0)), open = solo || ui.calOpen[k];
      return `<div class="lgg ${open ? "open" : ""}">${solo ? "" : `<button class="lgh" data-act="lgt" data-k="${k}">${lgLogo(k)}<b>${esc(D.ligas[k] ? D.ligas[k].n : (xs[0].g || xs[0].r).liga)}</b><span>${xs.length} ${xs.length === 1 ? "juego" : "juegos"}</span>${ic("chev")}</button>`}
        ${open ? `<div class="lgb">${xs.map((x) => (x.g ? gCard(x.g) : gCardRes(x.r, x.id))).join("")}</div>` : ""}</div>`;
    }).join("") || `<div class="empty">No hay partidos este día en las ligas que seguimos.</div>`}
    ${keys.length ? `<div class="small" style="text-align:center;margin:12px 0">En vivo primero; los por jugarse, por confianza del pick</div>` : ""}`;
}
function openCalFiltros() {
  const dep = [["todos", "Todos"], ["futbol", "Fútbol"], ["nba", "Baloncesto"]];
  const lgs = ORDEN.filter((k) => ui.calDep === "todos" || (ui.calDep === "nba") === (k === "nba"));
  openSheet(`<h2 class="pkh2" style="margin-top:4px">Filtros</h2>
    <div class="fl">DEPORTE</div><div class="flist">${dep.map(([k, l]) => `<button class="${ui.calDep === k ? "on" : ""}" data-act="cdep" data-k="${k}"><span class="fli">${k === "nba" ? lgLogo("nba", 22) : ic("ball")}${l}</span>${ui.calDep === k ? ic("check") : ""}</button>`).join("")}</div>
    <div class="fl">LIGA</div><div class="flist">${[["todas", "Todas las ligas"], ...lgs.map((k) => [k, D.ligas[k].n])].map(([k, l]) => `<button class="${ui.calLg === k ? "on" : ""}" data-act="clg" data-k="${k}"><span class="fli">${k === "todas" ? "" : lgLogo(k, 22)}${esc(l)}</span>${ui.calLg === k ? ic("check") : ""}</button>`).join("")}</div>
    <button class="bigbtn" data-act="cfreset" style="margin-top:16px">Quitar filtros</button>`);
  $(".sheet").classList.add("pk");
}

// ------------------------------------------------------------ INICIO
function inicio() {
  const its = mejores(pickItems().filter((e) => e.k !== "pr"), 3);   // el mejor de cada partido (+ fuertes)
  const rec = (D.registro && D.registro.partidos) || { n: 0 }, sem = (D.registro && D.registro.semana) || { n: 0 };
  const a = D.acierto, nPrueba = a.futbol_partidos + a.nba_partidos;
  const efPrueba = (a.futbol_1x2 * a.futbol_partidos + a.nba_ganador * a.nba_partidos) / nPrueba;
  const real = rec.n >= 20;
  const hoyG = D.partidos.filter((g) => esHoy(g.at) && new Date(g.at) > Date.now() - 2 * 3600e3);
  const cuotas = its.slice(0, 30).map((e) => e.k === "g" ? (e.g.pick.cuota || e.g.pick.justa) : e.k === "x" ? e.x.justa : e.x.cuota);
  const cprom = cuotas.length ? cuotas.reduce((s, x) => s + x, 0) / cuotas.length : 0;
  // destacados: el mejor de partido, el mejor de equipo (estadística) y el mejor jugador
  const top = its.filter((e, i, a) => a.findIndex((y) => y.gid === e.gid) === i).slice(0, 3);   // destacados de partidos distintos
  const resto = its.filter((e) => !top.includes(e)).slice(0, 10);
  const dia = new Date().toLocaleDateString("es-CO", { weekday: "long" });
  const nom = store.get("nombre", "");
  return `<div class="top"><div class="logo">CASH<b>BET</b></div><div class="ic">
      <button class="icb" data-go="notificaciones" aria-label="Notificaciones">${ic("bell")}${typeof campana === "function" ? campana() : ""}</button><button class="icb" data-go="ajustes" aria-label="Perfil">${ic("user")}</button></div></div>
    <h1>Buen ${esc(dia)}${nom ? `, ${esc(nom)}` : ""}</h1><div class="sub2">${fmtD.format(new Date())} · ${its.length} mejores picks</div>
    <div class="ban">${ic("star")}<div>${sem.n ? `<b>CASHBET acertó ${sem.g}/${sem.n}</b><span>Últimos 7 días · picks reales</span>` : `<b>Registro real en marcha</b><span>Cada pick se califica al terminar el partido</span>`}</div><button data-go="historial">Historial ${ic("right")}</button></div>
    <div class="tiles t2">
      <div class="tile"><div class="k">Efectividad</div><div class="v">${real ? Math.round(rec.ef) : Math.round(efPrueba)}%<small>${real ? "real" : "prueba"}</small></div></div>
      <div class="tile"><div class="k">Racha</div><div class="v">${rec.n ? rec.racha.replace(" ", "") : "—"}</div></div>
      <div class="tile"><div class="k">Errores de cuota</div><div class="v">${its.filter((e) => e.val != null).length}<small>hoy</small></div></div></div>
    ${top.length ? `<div class="sec"><h2 class="ih">${ic("bolt")}Picks destacados (${top.length})</h2><button class="pill dk" data-go="picks">Top picks</button></div>
      <div class="car">${top.map(heroPick).join("")}</div><div class="dots">${top.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("")}</div>` : ""}
    <div class="sec"><h2 class="ih">${ic("trend")}Picks principales</h2><button class="pill dk" data-go="picks">Ver todo ${ic("right")}</button></div>
    <div class="pclist">${resto.map(pcCard).join("") || `<div class="empty">Hoy ya no quedan partidos. Los de mañana aparecen aquí desde mañana; puedes verlos antes en el Calendario.</div>`}</div>
    ${typeof noticiasSec === "function" ? noticiasSec() : ""}`;
}
function heroPick(e) {
  let chip, small, big, sub, pick, cuota, img, attr, up, lk;
  if (e.k === "g") {
    const g = e.g; up = isUp(g.pick.m);
    chip = g.liga; lk = g.lg; small = "Pick del partido"; big = `${g.h.n} vs ${g.a.n}`; sub = `${abT(g.h)} vs ${abT(g.a)} · ${hora(g.at)}`;
    pick = g.pick.txt; cuota = g.pick.cuota || g.pick.justa; img = `<div class="hpimg dos">${crest(g.h, 84)}${crest(g.a, 84)}</div>`; attr = `data-mp="${g.id}"`;
  } else if (e.k === "x") {
    const g = e.g, x = e.x, P = pkFind(g.id, x.m), tm = pkTeam(P); up = P.lado === "mas";
    chip = g.liga; lk = g.lg; small = P.sc === "j" ? tm.n : P.sc === "t" ? "Total del partido" : "Total equipo";
    big = P.sc === "j" ? x.jugador : P.sc === "t" ? `${g.h.n} vs ${g.a.n}` : tm.n; sub = `${abT(g.h)} vs ${abT(g.a)} · ${hora(g.at)}`;
    pick = pkPill(P); cuota = x.justa; attr = `data-pk="${g.id}" data-m="${esc(x.m)}"`;
    img = P.sc === "j" ? (x.foto ? `<img class="hpimg foto" src="${esc(x.foto)}" alt="">` : sinFoto(x.jugador, tm, 120, "hpimg")) : P.sc === "t" ? `<div class="hpimg dos">${crest(g.h, 84)}${crest(g.a, 84)}</div>` : `<div class="hpimg">${crest(tm, 130)}</div>`;
  } else {
    const x = e.x; up = x.lado === "mas";
    chip = "NBA"; lk = "nba"; small = x.eq ? x.eq.n : "NBA"; big = x.jugador; sub = `${x.partido || ""} · ${hora(x.at)}`;
    pick = `${up ? "Más" : "Menos"} de ${x.linea} ${x.tipo.toLowerCase()}`; cuota = x.cuota; attr = `data-pr="${D.props.indexOf(x)}"`;
    img = x.foto ? `<img class="hpimg foto" src="${esc(x.foto)}" alt="">` : "";
  }
  const pk = esc(pick).replace(/(\d+(?:\.\d+)?)/, "<em>$1</em>");
  return `<button class="hp" ${attr}><span class="hpchip">${lk ? lgLogo(lk, 16) : ""}${esc(chip)}</span><div class="hpt"><small>${esc(small)}</small><h3>${esc(big)}</h3><span>${esc(sub)}</span>
      <div class="hpk">${pk}</div><div class="hpb"><span class="hc">${e.val != null ? `casa ${odd(e.casa)} · <b>valor ${valTxt(e.val)}</b>` : `vale desde ${odd(e.min || cuota)}`}</span><span class="ha">${pct(e.p)} · Análisis ${ic("right")}</span></div></div>${img}</button>`;
}

// ------------------------------------------------------------ FICHA DE PARTIDO
function cuenta(at) {
  const ms = new Date(at) - Date.now();
  if (ms <= 0) return ms > -2.5 * 3600e3 ? ["", "En juego"] : ["", "Terminado"];
  const m = Math.round(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60;
  return ["Empieza en", d ? `${d} d ${h} h` : h ? `${h} h ${mi} min` : `${mi} min`];
}
function openGame(id, tab) {
  const g = D.byId[id]; if (!g) return;
  const keep = sheetState.id === id && $(".sheet.on") && tab;
  sheetState = { id, tab: tab && ["previa", "cuotas", "equipos", "jugadores"].includes(tab) ? tab : (tab === "mercados" ? "cuotas" : "previa") };
  const t = sheetState.tab, seg = store.get("seg", {}), [c1, c2] = cuenta(g.at);
  const tm = (s, lab) => `<div class="gtm">${crest(g[s], 86)}<b>${esc(g[s].n)}</b><span>${esc(g[s].rec || "")}</span><em>${lab}</em></div>`;
  const tieneJ = (g.extra && g.extra.jug.length) || (g.dep === "nba");
  const tabs = [["previa", "Previa"], ["cuotas", "Cuotas"], ["equipos", "Equipos"], ...(tieneJ ? [["jugadores", g.dep === "nba" ? "Plantel" : "Jugadores"]] : [])];
  const up = isUp(g.pick.m);
  const html = `<div class="gh"><div class="ghtop"><span class="ghp"><i></i>${hora(g.at)}</span><small>${lgLogo(g.lg, 16)}${esc(g.liga)} · ${esc(cap(fmtS.format(new Date(g.at))))}</small></div>
      <div class="ghteams">${tm("h", "LOCAL")}<div class="vs">VS</div>${tm("a", "VISITANTE")}</div>
      ${g.ven ? `<div class="ghven">${ic("pin")}<span><b>${esc(g.ven)}</b>${g.city ? `<br>${esc(g.city)}` : ""}</span></div>` : ""}
      <div class="ghc">${c1 ? `<span>${c1}</span>` : ""}<b>${c2}</b></div></div>
    ${g.pick.bajo ? `<div class="ajnote">${g.pick.p > 0.75 ? `Favorito muy claro (${esc(g.pick.txt)}, ${pct(g.pick.p)}): paga demasiado poco para valer la pena.` : "La casa ya paga lo justo en este partido: no encontramos un error de cuota."} Mira Jugadores y Cuotas para otros mercados.</div>` : ""}
    <div class="gpick" ${g.pick.bajo ? 'style="display:none"' : ""}><div><small>PICK DEL MODELO</small><span class="pcpill ${up ? "" : "bad"}">${ic(up ? "up" : "down")}<span>${esc(g.pick.txt)}</span></span></div><div class="r"><b>${pct(g.pick.tipo === "valor" ? g.pick.pv : g.pick.p)}</b><span>${g.pick.tipo === "valor" ? `casa ${odd(g.pick.cuota)} · valor ${valTxt(g.pick.valor)}` : `vale desde ${odd(g.pick.minima || vale(g.pick.justa))}`}</span></div></div>
    ${g.pick.tipo === "valor" ? `<div class="pkvale v">${ic("bolt")}<span><b>Error de la casa:</b> paga ${odd(g.pick.cuota)} y según el modelo (mezclado con la propia casa) pasa ${pct(g.pick.pv)} de las veces. La cuota justa sería ${odd(1 / g.pick.pv)}.</span></div>` : ""}
    <div class="gacts"><button class="pkseg ${seg[id] ? "on" : ""}" data-act="seg">${ic(seg[id] ? "check" : "heart")}${seg[id] ? "Siguiendo" : "Seguir pick"}</button><button class="pkseg" data-act="tobank">${ic("plus")}Al bankroll</button></div>
    <div class="pktabs dark gtabs">${tabs.map(([k, l]) => `<button class="${t === k ? "on" : ""}" data-act="gtab" data-k="${k}">${l}</button>`).join("")}</div>
    ${t === "previa" ? gPrevia(g) : t === "cuotas" ? gCuotas(g) : t === "equipos" ? gEquipos(g) : gJugadores(g)}`;
  const cur = $(".sheet.on");
  if (keep && cur) { const y = cur.scrollTop; cur.innerHTML = `<div class="grab"></div><button class="x" data-act="close" aria-label="Cerrar">${ic("x")}</button>` + html; cur.scrollTop = y; }
  else { openSheet(html); const s = $(".sheet"); s.classList.add("pk"); s.dataset.id = id; }
}
function probBox(g) {
  const pm = pmOf(g), h = pm["1"] ? pm["1"].p : 0, a = pm["2"] ? pm["2"].p : 0, x = pm["X"] ? pm["X"].p : 0;
  return `<h4 class="pksub">Probabilidad de victoria <small>Modelo</small></h4>
    <div class="pkcard"><div class="pv"><span>${crest(g.h, 22)}${esc(abT(g.h))}</span>${x ? `<span class="em">Empate</span>` : ""}<span>${esc(abT(g.a))}${crest(g.a, 22)}</span></div>
      <div class="pv big"><b class="${h >= a ? "g" : ""}">${pct(h, 1)}</b>${x ? `<b class="em">${pct(x, 1)}</b>` : ""}<b class="${a > h ? "g" : ""}">${pct(a, 1)}</b></div>
      <div class="pvb"><i class="${h >= a ? "on" : ""}" style="flex:${h}"></i>${x ? `<i style="flex:${x}"></i>` : ""}<u class="${a > h ? "on" : ""}" style="flex:${a}"></u></div></div>`;
}
function iaPartido(g) {
  const f = g.forma || {}, X = g.extra, T = X && X.tabla, pm = pmOf(g);
  const c = (xs) => { const o = { G: 0, E: 0, P: 0 }; (xs || []).forEach((r) => o[r.r]++); return o; };
  const fh = c(f.h), fa = c(f.a), t = [];
  if (g.dep === "futbol") {
    t.push(`${g.h.n} llega con ${fh.G} victorias, ${fh.E} empates y ${fh.P} derrotas en sus últimos ${(f.h || []).length}; ${g.a.n} con ${fa.G}, ${fa.E} y ${fa.P}.`);
    if (T && T.h && T.a) t.push(`En la tabla, ${g.h.n} va ${T.h.pos}º con ${T.h.pts} puntos y ${g.a.n} ${T.a.pos}º con ${T.a.pts}.`);
    t.push(`El modelo calcula ${n1(g.goles_esperados[0])} goles esperados para ${g.h.n} y ${n1(g.goles_esperados[1])} para ${g.a.n}, con base en goles y remates al arco de toda la temporada, dando más peso a lo reciente.`);
    t.push(`Así le da ${pct(pm["1"].p)} al local, ${pct(pm["X"].p)} al empate y ${pct(pm["2"].p)} al visitante.`);
    if (X) { const gr = X.grupos.find((q) => q.s === "cor"); if (gr) t.push(`Se esperan unos ${n1(gr.esp[0] + gr.esp[1])} córners en total.`); }
  } else {
    t.push(`${g.h.n} va ${fh.G}-${fh.P} y ${g.a.n} ${fa.G}-${fa.P} en sus últimos 5 partidos.`);
    t.push(`El modelo espera un marcador cercano a ${Math.round(g.puntos_esperados[0])}-${Math.round(g.puntos_esperados[1])} (total ${g.total}), y descuenta los puntos de los jugadores que no juegan.`);
    const bh = (g.bajas?.h || []).filter((b) => b.s === "Out").length, ba = (g.bajas?.a || []).filter((b) => b.s === "Out").length;
    if (bh || ba) t.push(`Bajas confirmadas: ${bh} de ${g.h.n} y ${ba} de ${g.a.n}.`);
    t.push(`Probabilidad de ganar: ${pct(pm["1"].p)} para ${g.h.n} y ${pct(pm["2"].p)} para ${g.a.n}.`);
  }
  t.push(`El pick es "${g.pick.txt}" (${pct(g.pick.p)}), con cuota ${g.pick.cuota ? "de la casa " + odd(g.pick.cuota) : "justa " + odd(g.pick.justa)}.`);
  return t.map(esc).join(" ");
}
function elPartido(g) {
  const fecha = new Date(g.at).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" }).replace(".", "");
  return `<h4 class="pksub">El partido</h4><div class="pkcard elp">${g.vimg ? `<img class="vimg" src="${esc(g.vimg)}" alt="" loading="lazy">` : ""}<div class="in">${g.ven ? `<b class="v">${esc(g.ven)}</b><span>${esc([g.city, g.cap ? `Capacidad ${Number(g.cap).toLocaleString("es-CO")}` : ""].filter(Boolean).join(" · "))}</span>` : `<span>Estadio por confirmar</span>`}<hr>
    <div class="erow">${ic("cal")}<b>${esc(fecha)} · ${hora(g.at)}</b><em>${cuenta(g.at)[0] ? "en " : ""}${esc(cuenta(g.at)[1])}</em></div>
    <div class="erow">${ic("star")}<span>${esc(g.liga)}</span></div>${g.tv ? `<div class="erow">${ic("screen")}<span>${esc(g.tv)}</span></div>` : ""}
    <span class="alin">${ic("user")}Alineaciones ~1 h antes</span></div></div>`;
}
function gPrevia(g) {
  const lesion = g.dep === "nba" ? `<h4 class="pksub">Reporte de lesiones</h4><div class="pkcard">${["h", "a"].map((s) => `<div class="fo">${crest(g[s], 22)}<b>${esc(abT(g[s]))}</b><span class="cnt">${(g.bajas?.[s] || []).length}</span></div>
      ${(g.bajas?.[s] || []).map((b) => `<div class="les"><b>${esc(b.n)}</b><em class="${b.s === "Out" ? "out" : "dd"}">${b.s === "Out" ? "Fuera" : esc(b.s)}</em></div>`).join("") || `<div class="small">Sin lesionados reportados.</div>`}`).join("")}</div>` : "";
  const f = g.forma || {};
  const forma = `<h4 class="pksub">Forma reciente <small>Últimos 5 juegos</small></h4><div class="pkcard">${["h", "a"].map((s) => `<div class="fo">${crest(g[s], 24)}<b>${esc(abT(g[s]))}</b><span class="wls">${(f[s] || []).map((r) => `<span class="wl ${r.r}">${r.r}</span>`).join("")}</span></div>
      ${(f[s] || []).map((r) => `<div class="fr"><span class="wl ${r.r}">${r.r}</span>${r.loc ? "vs" : "@"} ${crest({ logo: r.logo, n: r.vs }, 20)} ${esc(r.vs)}<span class="s">${esc(r.m)}</span><span class="d">${new Date(r.at).toLocaleDateString("es-CO", { day: "numeric", month: "short" }).replace(".", "").replace(" de ", " ")}</span></div>`).join("")}`).join("")}</div>`;
  const h2h = `<h4 class="pksub">Últimos enfrentamientos</h4><div class="pkcard">${(g.h2h || []).map((m) => `<div class="fr"><span class="d" style="margin:0 10px 0 0;text-align:left">${new Date(m.at).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "2-digit" }).replace(".", "")}</span>${esc(m.h)} vs ${esc(m.a)}<span class="s">${esc(m.m)}</span></div>`).join("") || `<div class="small">No se han enfrentado desde agosto de 2025.</div>`}</div>`;
  const T = g.extra && g.extra.tabla;
  const pos = T && T.h && T.a ? `<h4 class="pksub">Posiciones</h4><div class="pkcard pos">${["h", "a"].map((s) => `<div class="pcol">${crest(g[s], 34)}<b>${esc(abT(g[s]))}</b><div class="big">${T[s].g}-${T[s].e}-${T[s].p}</div><span>${T[s].pts} pts · goles ${T[s].gf}-${T[s].gc}</span><span>${T[s].pos}º de ${T.n}</span></div>`).join("")}</div>` : "";
  const elp = elPartido(g);
  return elp + probBox(g) + `<div class="pkcard"><h4 class="ia">${ic("spark")}Análisis IA del enfrentamiento</h4><div class="small">Escrito automáticamente con los números de la temporada y del modelo.</div><p class="iat">${iaPartido(g)}</p></div>` +
    lesion + pos + forma + h2h;
}
function tilesMk(titulo, sels, g) {
  const best = Math.max(...sels.map((s) => s.p));
  return `<h4 class="pksub">${esc(titulo)}</h4><div class="otiles n${sels.length}">${sels.map((s) => `<div class="ot ${s.p === best ? "sel" : ""}"><span>${esc(s.lab)}</span><b>${odd(s.cuota || s.justa)}</b><small>${s.cuota ? "casa" : "justa"} · modelo ${pct(s.p)}</small></div>`).join("")}</div>`;
}
function gCuotas(g) {
  const pm = pmOf(g), L = (m, lab) => pm[m] ? { ...pm[m], lab } : null, A = (xs) => xs.filter(Boolean);
  let h = tilesMk("Ganador", A([L("1", abT(g.h)), g.dep === "futbol" ? L("X", "Empate") : null, L("2", abT(g.a))]), g);
  if (g.dep === "futbol") {
    h += tilesMk("Doble oportunidad", A([L("1X", `${abT(g.h)} o empate`), L("12", "Sin empate"), L("X2", `${abT(g.a)} o empate`)]), g);
    for (const ln of ["1.5", "2.5", "3.5"]) h += tilesMk(`Total de goles ${ln}`, A([L(`mas_${ln}`, `Más de ${ln}`), L(`menos_${ln}`, `Menos de ${ln}`)]), g);
    h += tilesMk("Ambos marcan", A([L("btts_si", "Sí"), L("btts_no", "No")]), g);
    h += statsHtml(g);
  } else {
    const hc = g.mercados.filter((s) => s.m.startsWith("hcp_")), to = g.mercados.filter((s) => /^(mas|menos)_/.test(s.m));
    if (hc.length) h += tilesMk("Hándicap", hc.map((s) => ({ ...s, lab: s.txt })), g);
    if (to.length) h += tilesMk("Total de puntos", to.map((s) => ({ ...s, lab: s.txt })), g);
  }
  return h + `<div class="small" style="margin:12px 2px">"Casa" es la cuota real de la casa de apuestas; "justa" es la que debería pagar según el modelo. Si te pagan más que la justa, el pick tiene valor (siempre con riesgo).</div>`;
}
function gEquipos(g) {
  const rows = [];
  const add = (lab, a, b, mayorMejor = true, fmt = n1) => { if (a == null || b == null) return; rows.push({ lab, a, b, mm: mayorMejor, fmt }); };
  const T = g.extra && g.extra.tabla;
  if (g.dep === "futbol" && g.extra) {
    const H = g.extra.hist, m = (s, k, n = 10) => { const xs = (H[s] || []).slice(0, n); return xs.length ? media(xs.map((e) => e[k])) : null; };
    if (T && T.h && T.a) { add("Puntos en la tabla", T.h.pts, T.a.pts, true, (v) => v); add("Posición", T.h.pos, T.a.pos, false, (v) => v + "º"); }
    add("Goles a favor", m("h", "gf"), m("a", "gf")); add("Goles en contra", m("h", "gc"), m("a", "gc"), false);
    add("Córners", m("h", "cor"), m("a", "cor")); add("Tiros", m("h", "tir"), m("a", "tir")); add("Tiros a puerta", m("h", "sot"), m("a", "sot"));
    add("Tiros a puerta recibidos", m("h", "osot"), m("a", "osot"), false); add("Faltas", m("h", "fal"), m("a", "fal"), false); add("Tarjetas", m("h", "tar"), m("a", "tar"), false);
  } else {
    const f = g.forma || {}, pts = (s, i) => { const xs = (f[s] || []).map((r) => +String(r.m).split("-")[i]).filter((v) => !isNaN(v)); return xs.length ? media(xs) : null; };
    const rec = (s) => String(g[s].rec || "").split("-").map(Number);
    const [hw, hl] = rec("h"), [aw, al] = rec("a");
    if (!isNaN(hw) && !isNaN(aw)) add("% de victorias", hw / Math.max(hw + hl, 1) * 100, aw / Math.max(aw + al, 1) * 100, true, (v) => Math.round(v) + "%");
    add("Puntos por partido (últ. 5)", pts("h", 0), pts("a", 0)); add("Puntos recibidos (últ. 5)", pts("h", 1), pts("a", 1), false);
  }
  return `<h4 class="pksub">Comparación de equipos <small>${g.dep === "futbol" ? "Promedio últimos 10" : "Temporada"}</small></h4>
    <div class="pkcard cmpc"><div class="rr hd">${crest(g.h, 24)}<b>${esc(abT(g.h))}</b><span></span><b>${esc(abT(g.a))}</b>${crest(g.a, 24)}</div>
    ${rows.map((r) => { const hb = r.mm ? r.a >= r.b : r.a <= r.b, tot = Math.abs(r.a) + Math.abs(r.b) || 1;
      return `<div class="cmp"><b class="${hb ? "g" : ""}">${r.fmt(r.a)}</b><span>${esc(r.lab)}</span><b class="${!hb ? "g" : ""}">${r.fmt(r.b)}</b></div><div class="cmpb"><i class="${hb ? "on" : ""}" style="width:${50 * Math.abs(r.a) / tot}%"></i><u class="${!hb ? "on" : ""}" style="width:${50 * Math.abs(r.b) / tot}%"></u></div>`; }).join("") || `<div class="small">Sin datos suficientes.</div>`}</div>`;
}
function gJugadores(g) {
  if (g.dep === "nba") {
    const pr = D.props.filter((x) => x.ev === g.id);
    const ok = pr.filter((x) => D.propsOk.includes(x));
    return `<h4 class="pksub">Picks de jugadores</h4>${ok.length ? `<div class="pkcard">${ok.map((x) => `<div class="mk" data-pr="${D.props.indexOf(x)}"><div class="l">${esc(x.jugador)}<span>${x.lado === "mas" ? "Más" : "Menos"} de ${x.linea} ${esc(x.tipo.toLowerCase())} · casa ${odd(x.cuota)} · ${x.prueba ? "en prueba" : `valor ${valTxt(x.valor)}`}</span></div><div class="pb"><b>${pct(x.p)}</b><div class="tr"><i style="width:${x.p * 100}%"></i></div></div></div>`).join("")}</div>` : `<div class="pkcard"><div class="small">Todavía no hay líneas de jugadores para este partido.</div></div>`}
      <h4 class="pksub">Bajas</h4><div class="pkcard">${["h", "a"].map((s) => `<div class="fo">${crest(g[s], 22)}<b>${esc(g[s].n)}</b></div>${(g.bajas?.[s] || []).map((b) => `<div class="les"><b>${esc(b.n)}</b><em class="${b.s === "Out" ? "out" : "dd"}">${b.s === "Out" ? "Fuera" : esc(b.s)}</em></div>`).join("") || `<div class="small">Sin lesionados reportados.</div>`}`).join("")}</div>`;
  }
  const J = (g.extra && g.extra.jug) || [];
  return `<div class="note" style="margin-top:14px">${ic("warn")}<div><b>Titulares probables.</b> Según sus últimos partidos. Si no juega, la apuesta normalmente se anula.</div></div>` +
    ["h", "a"].map((sd) => { const xs = J.filter((x) => x.side === sd); return xs.length ? `<div class="pkcard"><div class="fo">${crest(g[sd], 24)}<b>${esc(g[sd].n)}</b></div>${xs.map((x) => `<div class="mk" data-pk="${g.id}" data-m="${esc(x.m)}"><div class="l">${esc(x.jugador)}<span>${esc(x.txt.split(": ")[1])} · cuota ${odd(x.justa)}</span></div><div class="pb"><b>${pct(x.p)}</b><div class="tr"><i style="width:${x.p * 100}%"></i></div></div></div>`).join("")}</div>` : ""; }).join("");
}

// ------------------------------------------------------------ PERFIL Y AJUSTES
const FMT = { dec: "Decimal", us: "Americano", fr: "Fraccional" };
const TEMA = { auto: "Sistema", claro: "Claro", oscuro: "Oscuro" };
function subTop(t) { return `<div class="subtop"><button class="back" data-go="ajustes">${ic("left")}Atrás</button><b>${esc(t)}</b></div>`; }
function heroAj(icon, t, s) { return `<div class="ajhero"><span>${ic(icon)}</span><div><b>${esc(t)}</b><small>${esc(s)}</small></div></div>`; }
function opt(act, k, on, icon, t, s, extra = "") { return `<button class="ajopt ${on ? "on" : ""}" data-act="${act}" data-k="${k}"><span class="oi">${icon}</span><div><b>${t}</b>${extra}<small>${s}</small></div><i class="rad">${on ? ic("check") : ""}</i></button>`; }
function ajustes(arg) {
  const tema = store.get("tema", "auto"), fmt = store.get("fmt", "dec"), nom = store.get("nombre", ""), a = D.acierto;
  const row = (go, icon, t, s) => `<button class="ajrow" data-go="ajustes/${go}"><span class="oi">${ic(icon)}</span><div><b>${t}</b><small>${s}</small></div>${ic("right")}</button>`;
  if (!arg) return `${subTop("Perfil").replace('data-go="ajustes"', 'data-go="inicio"')}
    ${typeof USER !== "undefined" && USER ? "" : `<div class="ajcard"><span class="av">${esc((nom || "C")[0].toUpperCase())}</span><div><b>${esc(nom || "Tu perfil")}</b><small>Todo gratis · sin cuenta, tus datos se quedan en este celular</small></div></div>`}
    ${typeof tarjetaCuenta === "function" ? tarjetaCuenta() : ""}
    <div class="ajsec">AJUSTES</div><div class="ajlist">
      ${row("nombre", "pen", "Tu nombre", nom ? esc(nom) : "Para el saludo de Inicio")}
      ${row("notificaciones", "bellR", "Notificaciones", "Alertas de picks")}
      ${row("cuotas", "money", "Formato de cuotas", `${FMT[fmt]} · Americano · Fraccional`)}
      ${row("tema", "moon", "Tema", TEMA[tema])}
      ${row("idioma", "globe", "Idioma", "Español")}
      ${row("acierto", "chart", "Cómo medimos el acierto", "Prueba honesta y registro real")}
      <button class="ajrow" data-go="historial"><span class="oi">${ic("shield")}</span><div><b>Historial público</b><small>Todos los picks, sellados y verificables</small></div>${ic("right")}</button>
      ${row("responsable", "heartP", "Juego responsable", "Apuesta solo lo que puedas perder")}
      ${row("privacidad", "shield", "Privacidad", "Qué datos usamos")}
      ${row("ayuda", "help", "Ayuda y soporte", "Preguntas frecuentes")}</div>
    ${typeof cuentaAcciones === "function" ? cuentaAcciones() : ""}
    <div class="small" style="text-align:center;margin:16px 0">Datos actualizados: ${new Date(D.generado.replace("Z", ":00Z")).toLocaleString("es-CO")}</div>`;
  if (arg === "tema") return subTop("Tema") + heroAj("moon", "Tema", "Elige cómo se ve CASHBET") +
    `<div class="ajsec">SELECCIONAR TEMA <em>${TEMA[tema].toUpperCase()}</em></div>
    ${opt("tema", "claro", tema === "claro", ic("sun"), "Claro", "Siempre usar modo claro")}${opt("tema", "oscuro", tema === "oscuro", ic("moon"), "Oscuro", "Siempre usar modo oscuro")}${opt("tema", "auto", tema === "auto", ic("screen"), "Sistema", "Seguir ajustes del dispositivo")}
    <div class="ajsec">VISTA PREVIA</div><div class="prev"><div class="pv1"><i></i><u></u><s></s><span>Claro</span></div><div class="pv2"><i></i><u></u><s></s><span>Oscuro</span></div></div>
    <div class="ajnote"><b>Nota:</b> el modo sistema cambia automáticamente entre claro y oscuro según la apariencia de tu celular.</div>`;
  if (arg === "cuotas") return subTop("Formato de cuotas") + heroAj("chart", "Formato de cuotas", "Elige cómo se muestran las cuotas") +
    `<div class="ajsec">SELECCIONAR FORMATO <em>${fmt.toUpperCase()}</em></div>
    ${opt("fmt", "dec", fmt === "dec", "%", "Decimal", "Tu retorno total por cada $1 apostado. 2.50 significa que un acierto te devuelve $2.50 por cada $1, incluyendo el $1 original.", ` <span class="tagx">2.50</span>`)}
    ${opt("fmt", "us", fmt === "us", "$", "Americano", "+150 = ganas $150 apostando $100. -200 = debes apostar $200 para ganar $100.", ` <span class="tagx">+150 / -200</span>`)}
    ${opt("fmt", "fr", fmt === "fr", "#", "Fraccional", "Ganancia sobre lo apostado. 3/2 significa $3 de ganancia por cada $2.", ` <span class="tagx">3/2</span>`)}`;
  if (arg === "idioma") return subTop("Idioma") + heroAj("globe", "Idioma", "Elige tu idioma preferido") +
    `<div class="ajsec">SELECCIONAR IDIOMA <em>ES</em></div>
    ${opt("noop", "es", true, "ES", "Español", "España / Latinoamérica")}${opt("noop", "en", false, "EN", "Inglés", "Próximamente")}${opt("noop", "pt", false, "PT", "Portugués", "Próximamente")}
    <div class="ajnote" style="text-align:center">Más idiomas próximamente.</div>`;
  if (arg === "notificaciones") return subTop("Notificaciones") + heroAj("bellR", "Notificaciones", "Administra tus alertas") +
    `<div class="ajnote"><b>Próximamente.</b> Para avisarte con la app cerrada hace falta un servicio de envío de notificaciones; lo activaremos en una próxima versión. Mientras tanto, los picks se actualizan solos cada 2 horas.</div>
    <div class="ajsec">ALERTAS DE PICKS</div><div class="ajlist">${[["Nuevos picks", "Cuando haya nuevos picks del día"], ["Picks de alta confianza", "Solo picks de 75 % o más"], ["Resultados de picks", "Cuando tus picks seguidos ganen o pierdan"], ["Alertas de rachas", "Rachas ganadoras y perdedoras"]].map(([t, s]) => `<div class="ajrow dis"><div><b>${t}</b><small>${s}</small></div><span class="tog"></span></div>`).join("")}</div>`;
  if (arg === "nombre") return subTop("Tu nombre") + heroAj("pen", "Tu nombre", "Para el saludo de Inicio") + `<div class="pkcard"><input class="inp" id="nom" placeholder="Tu nombre" value="${esc(nom)}"><button class="bigbtn" data-act="nom">Guardar</button></div>`;
  if (arg === "acierto") {
    const cal = (rows) => `<table class="tbl"><tr><th>Cuando dice</th><th>Picks</th><th>Acertó</th></tr>${rows.map((r) => `<tr><td>${r.rango}</td><td>${r.n.toLocaleString("es-CO")}</td><td><b>${r.paso}%</b></td></tr>`).join("")}</table>`;
    return subTop("Cómo medimos el acierto") + heroAj("chart", "Acierto", "Prueba honesta con partidos que el modelo no había visto") +
      `<div class="pkcard"><div class="small">Para cada partido, el modelo solo podía usar los partidos jugados antes de esa fecha.<br><br><b>Fútbol</b> (${a.futbol_partidos.toLocaleString("es-CO")} partidos): acertó el resultado el <b>${a.futbol_1x2}%</b>.<br><b>NBA</b> (${a.nba_partidos.toLocaleString("es-CO")} partidos): acertó el ganador el <b>${a.nba_ganador}%</b>.</div></div>
      <h4 class="pksub">Fútbol: ¿se cumplen los porcentajes?</h4><div class="pkcard">${cal(a.calibracion_futbol)}</div>
      ${a.calibracion_nba ? `<h4 class="pksub">NBA: ¿se cumplen los porcentajes?</h4><div class="pkcard">${cal(a.calibracion_nba)}</div>` : ""}
      ${a.extra ? `<h4 class="pksub">Estadísticas de fútbol</h4><div class="pkcard"><table class="tbl"><tr><th>Mercado</th><th>Dijo</th><th>Acertó</th></tr>${Object.values(a.extra).filter((m) => m.publicar).map((m) => `<tr><td>${esc(m.titulo)}<br><span class="small">${m.picks.toLocaleString("es-CO")} picks</span></td><td>${m.dijo}%</td><td><b>${m.acierto}%</b></td></tr>`).join("")}</table></div>` : ""}`;
  }
  if (arg === "responsable") return subTop("Juego responsable") + heroAj("heartP", "Juego responsable", "Solo para mayores de 18 años") + `<div class="pkcard"><div class="small">${esc(D.aviso)}<br><br>Ningún modelo acierta siempre: incluso un pick de 75 % falla 1 de cada 4 veces. Apuesta solo lo que puedas perder, pon un límite a tu bankroll y nunca persigas pérdidas.</div></div>`;
  if (arg === "privacidad" && typeof privPagina === "function") return privPagina();
  if (arg === "privacidad") return subTop("Privacidad") + heroAj("shield", "Privacidad", "Qué datos usamos") + `<div class="pkcard"><div class="small"><b>Sin cuenta ni registro.</b> CASHBET no te pide correo ni contraseña.<br><br><b>Tus datos se quedan en tu celular.</b> Tu nombre, tus picks seguidos y tu bankroll se guardan solo en este dispositivo. No se envían a ningún servidor.<br><br><b>Sin anuncios ni rastreo.</b> No usamos publicidad ni herramientas de seguimiento.<br><br><b>De dónde salen los datos.</b> Resultados, estadísticas y cuotas públicas de partidos; el robot los procesa cada 2 horas.</div></div>`;
  if (arg === "ayuda") return subTop("Ayuda y soporte") + heroAj("help", "Ayuda", "Preguntas frecuentes") + `<div class="pkcard"><div class="small"><b>¿Qué es la cuota justa?</b><br>Lo que debería pagar un pick según el modelo. Si tu casa paga más, el pick tiene valor.<br><br><b>¿Por qué no hay picks de cuota menor a ${odd(D.cuota_min || 1.5)}?</b><br>Porque pagan muy poco para el riesgo que tienen.<br><br><b>¿Cada cuánto se actualiza?</b><br>Cada 2 horas, automáticamente.<br><br><b>¿Cómo instalo la app?</b><br>En el navegador del celular, elige "Agregar a pantalla de inicio".</div></div>`;
  return ajustes();
}

function actVistas(a, el) {
  const k = el.dataset.k;
  if (a === "lgt") { ui.calOpen[k] = !ui.calOpen[k]; rerender(); return true; }
  if (a === "cfil") { openCalFiltros(); return true; }
  if (a === "cdep") { ui.calDep = k; ui.calLg = "todas"; closeSheet(true); rerender(); return true; }
  if (a === "clg") { ui.calLg = k; if (k !== "todas") ui.calDep = k === "nba" ? "nba" : "futbol"; closeSheet(true); rerender(); return true; }
  if (a === "cfreset") { ui.calDep = "todos"; ui.calLg = "todas"; closeSheet(true); rerender(); return true; }
  if (a === "fmt") { store.set("fmt", k); rerender(); return true; }
  if (a === "noop") return true;
  if (a === "gtab") { const s = $(".sheet.on"), y = s ? s.scrollTop : 0; openGame(sheetState.id, k); const s2 = $(".sheet.on"); if (s2) s2.scrollTop = y; alTab(); return true; }
  return false;
}
