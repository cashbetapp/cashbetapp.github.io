// CASHBET · Seguidos (como IABET): solo los picks que TÚ sigues, con rango de fechas y filtros.
// El resultado de cada uno sale del registro sellado (data/historial.json).
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
  if (id.startsWith("pk|")) { const k = id.slice(3); f = filas.find((r) => r.k === k); }   // k = "partido|mercado|lado|línea"
  else f = filas.find((r) => esPartido(r) && (r.k === id || r.k.startsWith(id + "|")) && (!v.m || r.k === id || r.k.endsWith("|" + v.m)));
  if (f && f.st && f.st !== "retirado") return { st: f.st, r: f.r, cu: f.cu };
  if (new Date(v.at) < Date.now() - 3 * 3600e3 && !f) return { st: null, r: null };
  return { st: f ? f.st : null, r: f ? f.r : null, cu: f ? f.cu : null };
}

function seguidos() {
  if (!HIST && typeof cargarHist === "function") cargarHist();
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
    if (v.nom) return v;
    const pk = id.startsWith("pk|") ? id.slice(3) : null;
    if (pk) {
      const gid = pk.slice(0, pk.indexOf("|")), P = D.byId[gid] && pkFind(gid, pk.slice(pk.indexOf("|") + 1));
      if (P) { const tm = pkTeam(P); return Object.assign({}, v, { lg: P.g.lg, hab: abT(P.g.h), aab: abT(P.g.a), pill: pkPill(P), up: P.lado === "mas",
        tipo: P.sc === "j" ? "Jugador" : P.sc === "t" ? "Total del partido" : "Total del equipo", nom: P.sc === "j" ? P.x.jugador : P.sc === "t" ? `${P.g.h.n} vs ${P.g.a.n}` : tm.n,
        foto: P.sc === "j" ? P.x.foto || null : null, tl: tm ? tm.logo : null }); }
      return Object.assign({}, v, { tipo: "Pick", nom: v.txt });
    }
    return Object.assign({}, v, { tipo: "Partido", nom: `${v.h} vs ${v.a}`, pill: v.txt });
  };
  const fila = ({ id, v: v0, e }) => {
    const v = completar(id, v0);
    const [lab, cls] = e.st ? ESTADO[e.st] : ["Pendiente", "pe"];
    const pk = id.startsWith("pk|") ? id.slice(3) : null, gid = pk ? pk.slice(0, pk.indexOf("|")) : id;
    const at = pk ? (D.byId[gid] ? `data-pk="${gid}" data-m="${esc(pk.slice(pk.indexOf("|") + 1))}"` : "") : (D.byId[id] ? `data-g="${id}"` : "");
    const img = v.foto ? `<img class="sgf" src="${esc(v.foto)}" alt="" loading="lazy">`
      : v.tl ? `<div class="sgx1">${crest({ logo: v.tl, n: v.nom }, 92)}</div>`
      : `<div class="sgx2">${crest({ logo: v.hl, n: v.h }, 64)}${crest({ logo: v.al, n: v.a }, 64)}</div>`;
    const icono = e.st === "acierto" ? ic("check") : e.st === "fallo" ? ic("x") : e.st ? "" : "–";
    const lg = lgDe(v);
    const up = v.up != null ? v.up : !/^menos/i.test(v.txt || "");
    const bar = e.st === "acierto" ? 100 : e.st === "fallo" ? 100 : Math.round((v.p || 0) * 100);
    return `<div class="sgt ${cls}" ${at} role="button">
      <div class="sgtop">${img}<button class="sgq" data-act="sgx" data-k="${esc(id)}" aria-label="Dejar de seguir">${ic("x")}</button><span class="sgs ${cls}">${icono}</span></div>
      <div class="sgbody"><div class="sgty"><span>${esc(v.tipo || "Pick")}</span>${lg ? lgLogo(lg, 26) : ""}</div>
        <b class="sgn">${esc(v.nom || v.txt || "")}</b>
        <small>${esc(v.hab || (v.h || "").slice(0, 3).toUpperCase())} @ ${esc(v.aab || (v.a || "").slice(0, 3).toUpperCase())}</small>
        <small>${new Date(v.at).toLocaleDateString("es-CO", { month: "short", day: "numeric" }).replace(".", "")} · ${hora(v.at)}</small>
        <span class="sgp ${up ? "" : "bad"}">${ic(up ? "up" : "down")}<span>${esc((v.pill || v.txt || "").toUpperCase())}</span></span>
        <i class="sgbar ${cls}"><s style="width:${bar}%"></s></i>
        <div class="sgv"><span>${e.r != null ? `Final ${esc(String(e.r))}` : lab}</span><em>${pct(v.p)}</em></div></div></div>`;
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
  if (a === "sgx") { const s = store.get("seg", {}); delete s[k]; store.set("seg", s); toast("Dejaste de seguirlo"); rerender(); return true; }
  if (a === "sgrango") { openSgRango(); return true; }
  if (a === "sgDep" || a === "sgEst" || a === "sgR") { ui[a] = k; closeSheet(true); rerender(); return true; }
  return false;
}
