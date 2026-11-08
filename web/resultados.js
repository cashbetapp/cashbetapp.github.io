// CASHBET · Calendario con partidos EN VIVO y TERMINADOS (como IABET) + ficha del partido jugado:
// marcador, medio tiempo, goleadores, destacados en video y pestañas Previa / Estadísticas / Resumen / Eventos.
let RES = null, RES_CARGANDO = false, RES_VIVO_T = 0;
I.ball = I.ball || '<circle cx="12" cy="12" r="9"/>';
I.card = '<rect x="7" y="4" width="10" height="16" rx="2"/>';
I.tv = I.tv || '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 21h8"/>';
I.swap = '<path d="M7 7h11l-3-3M17 17H6l3 3"/>';

async function cargarRes() {
  if (RES || RES_CARGANDO) return;
  RES_CARGANDO = true;
  try { RES = await (await fetch("data/resultados.json?t=" + Date.now(), { cache: "no-store" })).json(); } catch (e) { RES = {}; }
  RES_CARGANDO = false;
  if (location.hash.startsWith("#calendario")) { $("#app").dataset.tab = ""; route(); }
  vivo();
}
const espnUrl = (lg) => (lg === "nba" ? "basketball/nba" : `soccer/${lg}`);

// marcadores en vivo: se piden directo a ESPN (una consulta por liga con partidos ya empezados hoy)
async function vivo(forzar) {
  if (!RES || (!forzar && Date.now() - RES_VIVO_T < 50e3)) return;
  RES_VIVO_T = Date.now();
  const hoy = dkey(new Date()), ligas = new Set();
  (D.partidos || []).forEach((g) => { if (dkey(new Date(g.at)) === hoy && new Date(g.at) <= Date.now()) ligas.add(g.lg); });
  Object.values(RES).forEach((r) => { if (r.st === "in") ligas.add(r.lg); });
  let cambio = false;
  await Promise.all([...ligas].map(async (lg) => {
    try {
      const d = await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/${espnUrl(lg)}/scoreboard`)).json();
      for (const e of d.events || []) {
        const c = (e.competitions || [{}])[0], st = (c.status || {}).type || {};
        if (!["in", "post"].includes(st.state)) continue;
        const cs = {}; (c.competitors || []).forEach((x) => (cs[x.homeAway === "home" ? "h" : "a"] = x));
        const g = D.byId[e.id], r = RES[e.id] || {};
        const eq = (s) => { const x = cs[s] || {}, t = x.team || {}, base = (r[s] || (g && g[s])) || {};
          return Object.assign({}, base, { id: t.id, n: base.n || t.shortDisplayName, ab: base.ab || t.abbreviation, logo: base.logo || t.logo, s: x.score }); };
        RES[e.id] = Object.assign({ ev: [], stats: [], lg, liga: (D.ligas[lg] || {}).n || lg, dep: lg === "nba" ? "nba" : "futbol", at: (e.date || "").slice(0, 16) + "Z" }, r,
          { st: st.state, det: st.shortDetail || st.detail, h: eq("h"), a: eq("a") });
        cambio = true;
      }
    } catch (e) {}
  }));
  if (cambio && location.hash.startsWith("#calendario")) { const y = window.scrollY; $("#app").dataset.tab = ""; route(); window.scrollTo(0, y); }
}
setInterval(() => { if (!document.hidden && location.hash.startsWith("#calendario")) vivo(); }, 60e3);

// resultado de nuestro pick para ese partido (registro sellado)
function pickRes(gid) {
  const f = ((HIST && HIST.filas) || []).find((r) => (r.c === "g" || r.c === "p") && (r.k === gid || r.k.startsWith(gid + "|")) && !r.rt && r.st !== "retirado");
  return f || null;
}
const estadoTxt = (r) => (r.st === "in" ? `EN VIVO · ${r.det || ""}` : "FINAL");

function gCardRes(r, gid) {
  const t = (s) => `<div class="tm">${crest(r[s], 48)}<b>${esc(r[s].ab || abT(r[s]))}</b><span>${esc(r[s].rec || "")}</span></div>`;
  const pr = pickRes(gid), [lab, cls] = pr && pr.st ? ESTADO[pr.st] : ["Pendiente", "pe"];
  const L = r.dep === "nba" ? "a" : "h", R = r.dep === "nba" ? "h" : "a";
  return `<button class="gc res ${r.st}" data-res="${gid}"><div class="gt">${t(L)}
      <div class="mid"><span class="rst ${r.st}">${r.st === "in" ? `<i></i>${esc(r.det || "En vivo")}` : "FINAL"}</span>
        <div class="rsc"><b>${esc(r[L].s ?? "-")}</b><em>-</em><b>${esc(r[R].s ?? "-")}</b></div><span class="det">Detalles</span></div>${t(R)}</div>
    ${pr ? `<div class="gpk rp ${cls}"><span>Pick: ${esc(pr.sel)}</span><b class="st ${cls}">${lab}</b></div>` : ""}</button>`;
}

function openResultado(gid, keep) {
  const r = RES && RES[gid]; if (!r) return;
  if (!keep || sheetState.res !== gid) sheetState = { res: gid, tab: "previa" };
  const tab = sheetState.tab;
  const goles = (s) => r.ev.filter((e) => ["gol", "penal", "autogol"].includes(e.t) && e.s === s)
    .map((e) => `<span>${esc((e.j || "").split(" ").slice(-1)[0])} ${esc(e.min || "")}${e.t === "penal" ? " (P)" : e.t === "autogol" ? " (AG)" : ""}</span>`).join("");
  const tm = (s, lab) => `<div class="rtm">${crest(r[s], 74)}<b>${esc(r[s].n || "")}</b><span>${esc(r[s].rec || "")}</span><em>${lab}</em></div>`;
  const ht = r.h.ht != null && r.a.ht != null && r.dep === "futbol" ? `<div class="rht">MT ${esc(r.h.ht)}-${esc(r.a.ht)}</div>` : "";
  const dur = (s) => s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "";
  const html = `<div class="rhero ${r.st}">
      <div class="rpill ${r.st}">${r.st === "in" ? `<i></i>EN VIVO · ${esc(r.det || "")}` : "FINAL DEL PARTIDO"}</div>
      <div class="rlg">${lgLogo(r.lg, 18)}${esc(r.liga)} · ${new Date(r.at).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "")}</div>
      <div class="rrow">${r.dep === "nba" ? `${tm("a", "VISITANTE")}<div class="rbig"><b>${esc(r.a.s ?? "-")}</b><em>-</em><b>${esc(r.h.s ?? "-")}</b></div>${tm("h", "LOCAL")}` : `${tm("h", "LOCAL")}<div class="rbig"><b>${esc(r.h.s ?? "-")}</b><em>-</em><b>${esc(r.a.s ?? "-")}</b>${ht}</div>${tm("a", "VISITANTE")}`}</div>
      ${r.dep === "futbol" ? `<div class="rgol"><div>${goles("h")}</div><div>${goles("a")}</div></div>` : ""}
      ${r.ven || (r.tv && r.tv.length) ? `<div class="rven">${r.tv && r.tv.length ? `${ic("tv")}${esc(r.tv.join(", "))} · ` : ""}${r.ven ? `${ic("pin")}${esc(r.ven)}` : ""}</div>` : ""}</div>
    ${r.video ? `<h4 class="pksub">Destacados</h4><a class="rvid" href="${esc(r.video.url)}" target="_blank" rel="noopener"><div class="rvi"><img src="${esc(r.video.img)}" alt="" loading="lazy"><span class="nwp">${ic("play")}</span>${r.video.dur ? `<em>${dur(r.video.dur)}</em>` : ""}</div><b>${esc(r.video.tit || "")}</b></a>` : ""}
    <div class="pktabs dark gtabs">${[["previa", "Previa"], ["stats", "Estadísticas"], ["resumen", "Resumen"], ["eventos", r.dep === "nba" ? "Líderes" : "Eventos"]].map(([k, l]) => `<button class="${tab === k ? "on" : ""}" data-act="rtab" data-k="${k}">${l}</button>`).join("")}</div>
    ${tab === "previa" ? rPrevia(r, gid) : tab === "stats" ? rStats(r) : tab === "resumen" ? rResumen(r) : r.dep === "nba" ? rLideres(r) : rEventos(r)}`;
  const cur = $(".sheet.on");
  if (keep && cur) { const y = cur.scrollTop; cur.innerHTML = `<div class="grab"></div><button class="x" data-act="close" aria-label="Cerrar">${ic("x")}</button>` + html; cur.scrollTop = y; }
  else { openSheet(html); $(".sheet").classList.add("pk"); }
  if (r.st === "in" && !keep) vivo(true).then(() => { if ($(".sheet.on") && sheetState.res === gid) openResultado(gid, true); });
}
function rPrevia(r, gid) {
  if (!HIST && typeof cargarHist === "function") cargarHist().then(() => { if (sheetState.res === gid) openResultado(gid, true); });
  const pr = pickRes(gid);
  if (!pr) return `<div class="pkcard"><div class="small">No publicamos pick de partido para este juego (el modelo no encontró una opción que valiera la pena). Mira las estadísticas del partido en la siguiente pestaña.</div></div>`;
  const [lab, cls] = pr.st ? ESTADO[pr.st] : ["Pendiente", "pe"];
  return `<div class="pkcard rpk"><div class="small">PICK DEL MODELO</div><b>${esc(pr.sel)}</b>
      <div class="rpkr"><span>Probabilidad <b>${Math.round(pr.p * 100)}%</b></span><span>Cuota <b>${pr.cu ? odd(pr.cu) : "—"}</b> ${pr.cr ? "casa" : "justa"}</span><span class="st ${cls}">${lab}</span></div>
      <div class="small" style="margin-top:8px">Publicado ${pr.pub ? new Date(pr.pub).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "antes del sello"} · huella ${esc(pr.h || "")}. Está en el Historial público.</div></div>`;
}
function rStats(r) {
  if (!r.stats || !r.stats.length) return `<div class="empty">ESPN todavía no publica las estadísticas de este partido.</div>`;
  return `<div class="pkcard rst2"><div class="rsh">${crest(r.h, 26)}<span>Estadísticas</span>${crest(r.a, 26)}</div>${r.stats.map(([l, h, a]) => {
    const x = parseFloat(String(h).replace(/[^\d.]/g, "")) || 0, y = parseFloat(String(a).replace(/[^\d.]/g, "")) || 0, t = x + y || 1;
    return `<div class="rsr"><div class="rsl"><b class="${x > y ? "w" : ""}">${esc(h)}</b><span>${esc(l)}</span><b class="${y > x ? "w" : ""}">${esc(a)}</b></div>
      <div class="rsb"><i style="width:${(100 * x) / t}%" class="${x >= y ? "w" : ""}"></i><i style="width:${(100 * y) / t}%" class="${y >= x ? "w" : ""}"></i></div></div>`;
  }).join("")}</div>`;
}
function rResumen(r) {
  const rc = r.recap;
  if (!rc && !r.video) return `<div class="empty">Todavía no hay crónica de este partido.</div>`;
  return `<div class="pkcard"><div class="small">RESUMEN DEL JUEGO</div>${rc ? `<h4 style="margin:8px 0 6px">${esc(rc.tit)}</h4><p class="iat">${esc(rc.txt || "")}</p>${rc.url ? `<a class="nwr" href="${esc(rc.url)}" target="_blank" rel="noopener">Leer en ESPN${ic("ext")}</a>` : ""}`
    : `<p class="iat">${esc(r.video.tit)}</p><a class="nwr" href="${esc(r.video.url)}" target="_blank" rel="noopener">Ver el video${ic("ext")}</a>`}</div>`;
}
const EVI = { gol: ["ball", "Gol", "g"], penal: ["ball", "Gol de penal", "g"], autogol: ["ball", "Autogol", "r"], amarilla: ["card", "Tarjeta amarilla", "y"], roja: ["card", "Tarjeta roja", "r"], cambio: ["swap", "Cambio", "n"], penalfallo: ["x", "Penal fallado", "r"] };
function rEventos(r) {
  if (!r.ev || !r.ev.length) return `<div class="empty">Sin eventos registrados.</div>`;
  return `<div class="pkcard rev">${r.ev.map((e) => { const [i, l, c] = EVI[e.t] || ["dot", e.t, "n"];
    return `<div class="rer ${e.s === "a" ? "der" : ""}"><span class="rem">${esc(e.min || "")}</span><span class="rei ${c}">${ic(i)}</span><div><b>${esc(e.j || l)}</b><small>${esc(l)}${e.t === "cambio" && e.j2 ? ` · sale ${esc(e.j2)}` : ""} · ${esc(e.s === "h" ? abT(r.h) : e.s === "a" ? abT(r.a) : "")}</small></div></div>`; }).join("")}</div>`;
}
function rLideres(r) {
  if (!r.lid || !r.lid.length) return `<div class="empty">Sin líderes publicados.</div>`;
  return `<div class="pkcard">${r.lid.map((l) => `<div class="fr">${crest(r[l.s] || {}, 22)}<b style="margin-left:8px">${esc(l.j)}</b><span class="s">${esc(l.cat)}: ${esc(l.v)}</span></div>`).join("")}</div>`;
}
function actRes(a, el) {
  if (a === "rtab") { sheetState.tab = el.dataset.k; openResultado(sheetState.res, true); return true; }
  return false;
}
