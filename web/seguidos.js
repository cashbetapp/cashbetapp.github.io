// CASHBET · Seguidos (como IABET): solo los picks que TÚ sigues, con rango de fechas y filtros.
// El resultado de cada uno sale del registro sellado (data/estados.json, resumen público del historial privado).
ui.sgR = "7"; ui.sgDep = "todos"; ui.sgEst = "todos";
I.bookX = '<path d="M6 3h12v18l-6-4-6 4z"/><path d="m10 8 4 4m0-4-4 4"/>';
I.calR = '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>';
I.sliders = '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>';

const RANGOS = [["7", "Últimos 7 días"], ["30", "Últimos 30 días"], ["mes", "Este mes"], ["todo", "Todo"]];
function rangoFechas() {
  const hoy = new Date(), fin = new Date(hoy); fin.setDate(fin.getDate() + 8);
  let ini = new Date(hoy);
  if (ui.sgR === "7") ini.setDate(ini.getDate() - 7);
  else if (ui.sgR === "30") ini.setDate(ini.getDate() - 30);
  else if (ui.sgR === "mes") ini = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  else ini = new Date(2000, 0, 1);
  ini.setHours(0, 0, 0, 0);
  return [ini, fin];
}
const fCorta = (d) => { const m = d.toLocaleDateString("es-CO", { month: "short" }).replace(".", ""); return `${m.charAt(0).toUpperCase() + m.slice(1)} ${d.getDate()}`; };

// fila de partido (formato nuevo "g"; en el viejo "p" se confundía con jugadores NBA)
const esPartido = (r) => r.c === "g" || (r.c === "p" && (/^\d+$/.test(r.k) || r.k.includes("|")));
// resultado de un pick seguido según el registro sellado
function estadoSeguido(id, v) {
  const filas = (HIST && HIST.filas) || [];
  let f = null;
  if (id.startsWith("pk|") || id.startsWith("pr|")) { const k = id.slice(3); f = filas.find((r) => r.k === k); }   // k = "partido|mercado|lado|línea"
  else f = filas.find((r) => esPartido(r) && (r.k === id || r.k.startsWith(id + "|")) && (!v.m || r.k === id || r.k.endsWith("|" + v.m)));
  if (f && f.st && f.st !== "retirado") return { st: f.st, r: f.r, cu: f.cu };
  if (new Date(v.at) < Date.now() - 3 * 3600e3 && !f) return { st: null, r: null };
  return { st: f ? f.st : null, r: f ? f.r : null, cu: f ? f.cu : null };
}


// ---------------------------------------------------------------- EN VIVO (como IABET)
// Mientras se juega el partido de un pick seguido, la tarjeta muestra "EN VIVO" parpadeando y la barra
// avanza con el valor real (puntos que lleva el jugador, córners, goles…) contra la línea. Datos: ESPN, cada 45 s.
const SGV = {};          // gid -> { t, d }
let SGV_T = null;
const sgUrl = (lg) => (lg === "nba" ? "basketball/nba" : `soccer/${lg}`);
function sgGid(id) { return id.startsWith("pr|") ? id.slice(3).split("_")[0] : id.startsWith("pk|") ? id.slice(3).split("|")[0] : id; }
async function sgCargar(seg) {
  const ahora = Date.now(), pend = {};
  for (const [id, v] of Object.entries(seg)) {
    const t = new Date(v.at).getTime(), gid = sgGid(id), c = SGV[gid];
    if (t > ahora || t < ahora - 8 * 3600e3) continue;                 // solo empezados en las últimas 8 h
    const st = c && c.d && ((((c.d.header || {}).competitions || [{}])[0].status || {}).type || {}).state;
    if (c && (st === "post" || ahora - c.t < 40e3)) continue;          // terminado ya guardado o pedido hace poco
    pend[gid] = v.lg || (v.dep === "nba" ? "nba" : null);
  }
  const ids = Object.keys(pend).filter((g) => pend[g]);
  if (!ids.length) return false;
  await Promise.all(ids.map(async (gid) => {
    try { const d = await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sgUrl(pend[gid])}/summary?event=${gid}`)).json(); if (d && d.header) SGV[gid] = { t: Date.now(), d }; } catch (e) {}
  }));
  return true;
}
function sgTick() {
  clearInterval(SGV_T); SGV_T = 1;
  const seg = store.get("seg", {});
  const run = () => sgCargar(store.get("seg", {})).then((ok) => { if (ok && location.hash.startsWith("#seguidos") && !$(".sheet.on")) { const y = window.scrollY; $("#app").dataset.tab = ""; route(); window.scrollTo(0, y); } });
  if (Object.values(seg).some((v) => { const t = new Date(v.at).getTime(); return t <= Date.now() && t > Date.now() - 8 * 3600e3; })) {
    run(); SGV_T = setInterval(() => { if (!location.hash.startsWith("#seguidos")) { clearInterval(SGV_T); SGV_T = null; return; } if (!document.hidden) run(); }, 45e3);
  } else SGV_T = null;
}
const NBA_T = { "Total Points": ["PTS"], "Total Rebounds": ["REB"], "Total Assists": ["AST"], "Total 3-Point Field Goals": ["3PT"], "Total Points and Rebounds": ["PTS", "REB"],
  "Total Points and Assists": ["PTS", "AST"], "Total Assists and Rebounds": ["AST", "REB"], "Total Points, Rebounds, and Assists": ["PTS", "REB", "AST"] };
const FUT_S = { cor: ["wonCorners"], sot: ["shotsOnTarget"], tir: ["totalShots"], fal: ["foulsCommitted"], tar: ["yellowCards", "redCards"] };
// valor actual del pick seguido: { val, ln, mas, st: "in"|"post", det, marcador } o null
function sgVivo(id, v) {
  const S = SGV[sgGid(id)]; if (!S) return null;
  const d = S.d, c = (d.header.competitions || [])[0] || {}, ty = (c.status || {}).type || {};
  if (!["in", "post"].includes(ty.state)) return null;
  const L = {}; (c.competitors || []).forEach((x) => (L[x.homeAway === "home" ? "h" : "a"] = x));
  const sc = { h: +((L.h || {}).score || 0), a: +((L.a || {}).score || 0) };
  const dep = v.dep || (v.lg === "nba" ? "nba" : "futbol");
  const det = typeof detEs === "function" ? detEs(ty, dep) : ty.shortDetail;
  const marcador = dep === "nba" ? `${v.aab || ""} ${sc.a} – ${sc.h} ${v.hab || ""}` : `${v.hab || ""} ${sc.h} – ${sc.a} ${v.aab || ""}`;
  const base = { st: ty.state, det, marcador: marcador.trim() };
  const num = (x) => { const m = /^(\d+)-\d+$/.exec(String(x)); return m ? +m[1] : parseFloat(x) || 0; };
  if (id.startsWith("pr|")) {               // jugador NBA: pr|evento_jugador_tipo_línea
    const [, pl, t, ln] = id.slice(3).split("_"), keys = NBA_T[t] || [];
    for (const tm of (d.boxscore || {}).players || []) for (const gr of tm.statistics || []) {
      const names = gr.names || gr.labels || [], a = (gr.athletes || []).find((x) => x.athlete && x.athlete.id === pl);
      if (a) return Object.assign(base, { val: (a.stats || []).length ? keys.reduce((s, k) => s + num(a.stats[names.indexOf(k)]), 0) : 0, ln: +ln, mas: v.up !== false });
    }
    return Object.assign(base, { val: 0, ln: +ln, mas: v.up !== false });
  }
  if (id.startsWith("pk|")) {               // estadística: pts|h|mas|103.5 · cor|t|menos|8.5 · tir|j:123|mas|1.5
    const [s, quien, lado, ln] = id.slice(3).split("|").slice(1);
    let val = null;
    if (s === "pts") val = sc[quien];
    else if (quien.startsWith("j:")) {
      const pid = quien.slice(2);
      for (const ro of d.rosters || []) { const p = (ro.roster || []).find((x) => x.athlete && x.athlete.id === pid);
        if (p) val = (FUT_S[s] || []).reduce((t, k) => t + (+(((p.stats || []).find((x) => x.name === k) || {}).displayValue) || 0), 0); }
    } else {
      const tms = (d.boxscore || {}).teams || [], by = {};
      tms.forEach((t) => { const sd = L.h && t.team && t.team.id === L.h.team.id ? "h" : "a"; by[sd] = {}; (t.statistics || []).forEach((x) => (by[sd][x.name] = +x.displayValue || 0)); });
      const vv = (sd) => (FUT_S[s] || []).reduce((t, k) => t + ((by[sd] || {})[k] || 0), 0);
      if (by.h || by.a) val = quien === "t" ? vv("h") + vv("a") : vv(quien);
    }
    return val == null ? base : Object.assign(base, { val, ln: +ln, mas: lado === "mas" });
  }
  // pick de partido: totales con el marcador; ganador / hándicap: solo marcador
  const x = /^(mas|menos)_([\d.]+)/.exec(v.m || "");
  if (x) return Object.assign(base, { val: sc.h + sc.a, ln: +x[2], mas: x[1] === "mas" });
  return base;
}
// ¿cómo va? ok = ya se cumple, no = ya no se puede, vivo = en juego
function sgVa(L) {
  if (L.val == null) return "vivo";
  if (L.mas) return L.val > L.ln ? "ok" : L.st === "post" ? "no" : "vivo";
  return L.val > L.ln ? "no" : L.st === "post" ? "ok" : "vivo";
}

function seguidos() {
  if (!HIST && typeof cargarHist === "function") cargarHist();
  if (!SGV_T) sgTick();
  const seg = store.get("seg", {});
  const [ini, fin] = rangoFechas();
  let xs = Object.entries(seg).map(([id, v]) => ({ id, v, e: estadoSeguido(id, v) }))
    .filter(({ v }) => { const t = new Date(v.at); return t >= ini && t <= fin; });
  if (ui.sgDep !== "todos") xs = xs.filter(({ v }) => (v.dep || (v.liga === "NBA" ? "nba" : "futbol")) === ui.sgDep);
  if (ui.sgEst === "pend") xs = xs.filter(({ e }) => !e.st);
  else if (ui.sgEst !== "todos") xs = xs.filter(({ e }) => e.st === ui.sgEst);
  xs.sort((a, b) => new Date(b.v.at) - new Date(a.v.at));
  const activos = Object.values(seg).filter((v) => new Date(v.at) > Date.now() - 3 * 3600e3).length;
  const cal = xs.filter(({ e }) => e.st === "acierto" || e.st === "fallo").sort((a, b) => new Date(a.v.at) - new Date(b.v.at));
  const g = cal.filter(({ e }) => e.st === "acierto").length;
  let racha = "—";
  if (cal.length) { const last = cal[cal.length - 1].e.st; let n = 0; for (let i = cal.length - 1; i >= 0 && cal[i].e.st === last; i--) n++; racha = `${n}${last === "acierto" ? "G" : "P"}`; }
  const cuotas = xs.map(({ v, e }) => e.cu || v.cuota).filter(Boolean);
  const cprom = cuotas.length ? odd(cuotas.reduce((s, c) => s + c, 0) / cuotas.length) : "—";
  const fil = ui.sgDep !== "todos" || ui.sgEst !== "todos";
  const lgDe = (v) => v.lg || (Object.entries(D.ligas || {}).find(([, L]) => L.n === v.liga) || [])[0] || (v.liga === "NBA" ? "nba" : null);
  // seguidos guardados antes de las tarjetas nuevas: se completan con los datos del partido si siguen disponibles
  const completar = (id, v) => {
    if (v.nom && (id.startsWith("pk|") || id.startsWith("pr|"))) return v;
    const pk = id.startsWith("pk|") ? id.slice(3) : null;
    if (pk && !v.nom) {
      const gid = pk.slice(0, pk.indexOf("|")), P = D.byId[gid] && pkFind(gid, pk.slice(pk.indexOf("|") + 1));
      if (P) { const tm = pkTeam(P); return Object.assign({}, v, { lg: P.g.lg, hab: abT(P.g.h), aab: abT(P.g.a), pill: pkPill(P), up: P.lado === "mas",
        tipo: P.sc === "j" ? "Jugador" : P.sc === "t" ? "Total del partido" : "Total del equipo", nom: P.sc === "j" ? P.x.jugador : P.sc === "t" ? `${P.g.h.n} vs ${P.g.a.n}` : tm.n,
        foto: P.sc === "j" ? P.x.foto || null : null, tl: tm ? tm.logo : null }); }
      return Object.assign({}, v, { tipo: "Pick", nom: v.txt });
    }
    // pick de partido: si es a favor de un equipo, se muestra ESE equipo (escudo y nombre)
    const G = D.byId[id];
    if (G) v = Object.assign({}, v, { hab: v.hab || G.h.ab, aab: v.aab || G.a.ab, lg: v.lg || G.lg, m: v.m || G.pick.m });
    const m = v.m || "", t = (v.txt || "").toLowerCase();
    let lado = /^(1|1X)$|^hcp_local/.test(m) ? "h" : /^(2|X2)$|^hcp_visita/.test(m) ? "a" : null;   // "12" (no hay empate) = los dos
    if (!lado && !m && v.h && t.includes(v.h.toLowerCase())) lado = "h";
    if (!lado && !m && v.a && t.includes(v.a.toLowerCase())) lado = "a";
    const total = /^(mas|menos)_|^btts/.test(m) || /^(más|menos) de/.test(t);
    if (lado) return Object.assign({}, v, { nom: v[lado], tl: lado === "h" ? v.hl : v.al, pill: v.pill || v.txt,
      tipo: /^hcp/.test(m) || /[+-]\d/.test(t) ? "Hándicap" : /^(1X|X2)$/.test(m) || / o empate/.test(t) ? "Doble oportunidad" : "Ganador" });
    return Object.assign({}, v, { tipo: total ? "Total del partido" : "Partido", nom: `${v.h} vs ${v.a}`, pill: v.pill || v.txt, tl: null });
  };
  const fila = ({ id, v: v0, e }) => {
    const v = completar(id, v0);
    const [lab, cls] = e.st ? ESTADO[e.st] : ["Pendiente", "pe"];
    const pk = id.startsWith("pk|") ? id.slice(3) : null, gid = pk ? pk.slice(0, pk.indexOf("|")) : id;
    const pri = id.startsWith("pr|") ? D.props.findIndex((x) => `pr|${x.ev}_${x.pl}_${x.t}_${x.linea}` === id) : -1;
    const at = id.startsWith("pr|") ? (pri >= 0 ? `data-pr="${pri}"` : "") : pk ? (D.byId[gid] ? `data-pk="${gid}" data-m="${esc(pk.slice(pk.indexOf("|") + 1))}"` : "") : (D.byId[id] ? `data-mp="${id}"` : "");
    const img = v.foto ? `<img class="sgf" src="${esc(v.foto)}" alt="" loading="lazy">`
      : v.tl ? `<div class="sgx1">${crest({ logo: v.tl, n: v.nom }, 92)}</div>`
      : `<div class="sgx2">${crest({ logo: v.hl, n: v.h }, 64)}${crest({ logo: v.al, n: v.a }, 64)}</div>`;
    const icono = e.st === "acierto" ? ic("check") : e.st === "fallo" ? ic("x") : e.st ? "" : "–";
    const lg = lgDe(v);
    const up = v.up != null ? v.up : !/^menos/i.test(v.txt || "");
    // en vivo (o terminado): barra con el valor real contra la línea, como IABET
    const L = sgVivo(id, v), va = L ? sgVa(L) : null;
    const lnF = L && L.ln != null ? L.ln : v.ln != null ? +v.ln : null;
    const real = L && L.val != null ? L.val : e.r != null && !isNaN(parseFloat(e.r)) && lnF != null ? parseFloat(e.r) : null;
    const bar = real != null && lnF ? Math.min(100, Math.round((real / (+lnF * 1.25)) * 100)) : e.st === "acierto" || e.st === "fallo" ? 100 : Math.round((v.p || 0) * 100);
    const vivo = L && L.st === "in";
    const bcls = e.st ? cls : va === "ok" ? "ok" : va === "no" ? "no" : vivo ? "vi" : cls;
    return `<div class="sgt ${cls}" ${at} role="button">
      <div class="sgtop">${img}${puedeQuitar(v0) ? `<button class="sgq" data-act="sgx" data-k="${esc(id)}" aria-label="Dejar de seguir">${ic("x")}</button>` : `<span class="sgq lock" title="Ya empezó: no se puede quitar">${ic("lock")}</span>`}<span class="sgs ${cls}">${icono}</span></div>
      <div class="sgbody"><div class="sgty"><span>${esc(v.tipo || "Pick")}</span>${lg ? lgLogo(lg, 26) : ""}</div>
        <b class="sgn">${esc(v.nom || v.txt || "")}</b>
        <small>${esc(v.hab || (v.h || "").slice(0, 3).toUpperCase())} @ ${esc(v.aab || (v.a || "").slice(0, 3).toUpperCase())}</small>
        <small>${new Date(v.at).toLocaleDateString("es-CO", { month: "short", day: "numeric" }).replace(".", "")} · ${hora(v.at)}</small>
        <span class="sgp ${up ? "" : "bad"}">${ic(up ? "up" : "down")}<span>${esc((v.pill || v.txt || "").toUpperCase())}</span></span>
        <i class="sgbar ${bcls}"><s style="width:${bar}%"></s>${real != null && lnF ? `<u style="left:80%" title="Línea ${esc(String(lnF))}"></u>` : ""}</i>
        ${real != null ? `<div class="sgnum ${bcls}" style="--x:${bar}%"><b>${esc(String(real))}</b>${lnF ? `<small>de ${esc(String(lnF))}</small>` : ""}</div>` : ""}
        ${vivo ? `<div class="sgvivo"><i></i>EN VIVO · ${esc(L.det || "")}</div><div class="sgmar">${esc(L.marcador || "")}</div>` : ""}
        <div class="sgv"><span>${e.st ? (e.r != null ? `Final ${esc(String(e.r))}` : lab) : vivo ? (va === "ok" ? "Va cumpliendo" : va === "no" ? "Ya no se cumple" : "En juego") : L && L.st === "post" ? "Terminado · calificando" : lab}</span><em>${pct(v.p)}</em></div></div></div>`;
  };
  return `<div class="top"><div class="logo">CASH<b>BET</b></div><div class="ic"><button class="icb" data-go="ajustes" aria-label="Perfil">${ic("user")}</button></div></div>
    <div class="sgh"><div><h1>Seguidos</h1><div class="sub2"><i class="sgdot"></i>${activos} ${activos === 1 ? "activo" : "activos"}</div></div>
      <div class="sgb"><button class="sgbt" data-act="sgrango">${ic("calR")}${ui.sgR === "todo" ? "Todo" : `${fCorta(ini)} – ${fCorta(new Date())}`}</button>
      <button class="sgbt ic ${fil ? "on" : ""}" data-act="sgfil" aria-label="Filtros">${ic("sliders")}</button></div></div>
    <div class="tiles t2"><div class="tile"><div class="k">Efectividad</div><div class="v">${cal.length ? Math.round((100 * g) / cal.length) + "%" : "—"}</div></div>
      <div class="tile"><div class="k">Racha</div><div class="v">${racha}</div></div>
      <div class="tile"><div class="k">Cuota prom.</div><div class="v">${cprom}</div></div></div>
    ${xs.length ? `<div class="sggrid">${xs.map(fila).join("")}</div>` : `<div class="sgvac"><span>${ic("bookX")}</span><b>Sin seguimientos en este rango</b><p>Sigue predicciones desde el panel o prueba un rango de fechas diferente.</p></div>`}`;
}

function openSgFiltros() {
  const op = (grp, k, l) => `<button class="${ui[grp] === k ? "on" : ""}" data-act="${grp}" data-k="${k}"><span>${l}</span>${ui[grp] === k ? ic("check") : ""}</button>`;
  openSheet(`<h2 class="pkh2" style="margin-top:4px">Filtros</h2>
    <div class="fl">DEPORTE</div><div class="flist">${op("sgDep", "todos", "Todos los deportes")}${op("sgDep", "futbol", "Fútbol")}${op("sgDep", "nba", "Baloncesto (NBA)")}</div>
    <div class="fl">ESTADO</div><div class="flist">${op("sgEst", "todos", "Todos")}${op("sgEst", "pend", "Pendientes")}${op("sgEst", "acierto", "Aciertos")}${op("sgEst", "fallo", "Fallos")}${op("sgEst", "nulo", "Nulos")}</div>`);
  $(".sheet").classList.add("pk");
}
function openSgRango() {
  openSheet(`<h2 class="pkh2" style="margin-top:4px">Rango de fechas</h2><div class="flist">${RANGOS.map(([k, l]) => `<button class="${ui.sgR === k ? "on" : ""}" data-act="sgR" data-k="${k}"><span>${l}</span>${ui.sgR === k ? ic("check") : ""}</button>`).join("")}</div>
    <div class="small" style="margin-top:10px">Incluye también los partidos de los próximos días que ya sigues.</div>`);
  $(".sheet").classList.add("pk");
}
function actSeguidos(a, el) {
  const k = el.dataset.k;
  if (a === "sgfil") { openSgFiltros(); return true; }
  if (a === "sgx") { const s = store.get("seg", {}); if (s[k] && !puedeQuitar(s[k])) { toast("El partido ya empezó: este pick queda en tus Seguidos y en tu Bankroll"); return true; } delete s[k]; store.set("seg", s); toast("Dejaste de seguirlo"); rerender(); return true; }
  if (a === "sgrango") { openSgRango(); return true; }
  if (a === "sgDep" || a === "sgEst" || a === "sgR") { ui[a] = k; closeSheet(true); rerender(); return true; }
  return false;
}
