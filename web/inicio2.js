// CASHBET · piezas del Inicio igual que IABET: Noticias (ESPN en español) y pantalla de Notificaciones.
let NOTI = null, NOTI_CARGANDO = false;
I.news = '<path d="M4 5h13v14H5a1 1 0 0 1-1-1z"/><path d="M17 8h3v10a1 1 0 0 1-1 1h-2"/><path d="M7 9h7M7 12h7M7 15h4"/>';
I.ext = '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>';
I.play = '<path d="M8 5v14l11-7z"/>';
I.ok2 = '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>';
I.no2 = '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/>';
I.clock = '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>';

function hace(iso) {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso)) / 60000));
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} ${h === 1 ? "hora" : "horas"}`;
  const d = Math.round(h / 24);
  return `hace ${d} ${d === 1 ? "día" : "días"}`;
}

// ---------------------------------------------------------------- Noticias
async function cargarNoti() {
  if (NOTI || NOTI_CARGANDO) return;
  NOTI_CARGANDO = true;
  try { NOTI = await (await fetch("data/noticias.json?t=" + Date.now(), { cache: "no-store" })).json(); } catch (e) { NOTI = { noticias: [] }; }
  NOTI_CARGANDO = false;
  const box = document.getElementById("noticias");
  if (box) box.outerHTML = noticiasSec();
}
function noticiasSec() {
  if (!NOTI) { cargarNoti(); return `<div id="noticias"></div>`; }
  const xs = (NOTI.noticias || []).slice(0, 12);
  if (!xs.length) return `<div id="noticias"></div>`;
  return `<div id="noticias"><div class="sec"><h2 class="ih">${ic("news")}Noticias</h2></div>
    ${xs.map((n) => `<a class="nwc" href="${esc(n.url)}" target="_blank" rel="noopener">
      ${n.img ? `<div class="nwi"><img src="${esc(n.img)}" alt="" loading="lazy">${n.tipo === "video" ? `<span class="nwp">${ic("play")}</span>` : ""}</div>` : ""}
      <div class="nwb"><div class="nwt"><span class="nwl">${lgLogo(n.lg, 16)}${esc(n.lg === "nba" ? "NBA" : n.liga)}</span><span class="nwk ${n.tipo}">${n.tipo === "video" ? "VIDEO" : "ARTÍCULO"}</span><em>${hace(n.at)}</em></div>
        <b>${esc(n.titulo)}</b>${n.resumen ? `<p>${esc(n.resumen)}</p>` : ""}
        <span class="nwr">${n.tipo === "video" ? "Ver video" : "Leer artículo"}${ic("ext")}</span></div></a>`).join("")}
    <div class="small" style="text-align:center;margin:6px 0 4px">Noticias de ESPN. Se abren en su sitio.</div></div>`;
}

// ---------------------------------------------------------------- Notificaciones
function avisos() {
  const L = [], hoy = (D.partidos || []).filter((g) => esHoy(g.at));
  const gen = D.generado.replace("Z", ":00Z");
  const its = typeof pickItems === "function" ? pickItems() : [];
  const nMej = typeof mejores === "function" ? mejores(its.filter((e) => e.k !== "pr"), 3).length : its.length;
  if (hoy.length) L.push({ t: gen, i: "bolt", c: "g", h: "¡Los picks de hoy ya están!", s: `Hoy tienes ${nMej} picks listos. Revísalos antes de los partidos.`, go: "picks" });
  (typeof erroresCuota === "function" ? erroresCuota() : []).slice(0, 3).forEach((e) => {
    const n = e.k === "g" ? `${e.g.h.n} vs ${e.g.a.n}` : e.x.jugador;
    L.push({ t: gen, i: "spark", c: "v", h: "Error de cuota detectado", s: `${n}: ${pct(e.p)} de probabilidad y la casa paga ${odd(e.cuota)} (debería pagar ${odd(1 / e.p)}).`, go: "inicio" });
  });
  const seg = store.get("seg", {});
  for (const [id, v] of Object.entries(seg)) {
    const ms = new Date(v.at) - Date.now();
    if (ms > 0 && ms < 3 * 3600e3) L.push({ t: new Date(new Date(v.at) - 3 * 3600e3).toISOString(), i: "clock", c: "a", h: "Tu pick empieza pronto", s: `${v.nom || v.txt}: ${v.pill || v.txt} · ${hora(v.at)}.`, go: "seguidos" });
    if (typeof estadoSeguido === "function" && HIST) {
      const e = estadoSeguido(id, v);
      if (e.st === "acierto" || e.st === "fallo") L.push({ t: new Date(new Date(v.at).getTime() + 2.5 * 3600e3).toISOString(), i: e.st === "acierto" ? "ok2" : "no2", c: e.st === "acierto" ? "g" : "r",
        h: e.st === "acierto" ? "Tu pick acertó" : "Tu pick falló", s: `${v.nom || v.txt}: ${v.pill || v.txt}${e.r != null ? ` (final ${e.r})` : ""}.`, go: "seguidos" });
    }
  }
  if (HIST && HIST.filas) {
    const ay = new Date(); ay.setDate(ay.getDate() - 1); const k = ay.toLocaleDateString("en-CA");
    const fs = HIST.filas.filter((r) => new Date(r.at).toLocaleDateString("en-CA") === k && (r.st === "acierto" || r.st === "fallo") && r.c !== "n");   // igual que el banner del Inicio: sin jugadores NBA en prueba
    if (fs.length) { const g = fs.filter((r) => r.st === "acierto").length; const t = new Date(); t.setHours(7, 0, 0, 0);
      L.push({ t: t.toISOString(), i: "chart", c: "g", h: "Resultados de ayer", s: `CASHBET acertó ${g} de ${fs.length} picks de partidos y equipos (${Math.round((100 * g) / fs.length)}%). ${esAdmin() ? " Míralos en el Historial." : ""}`, go: esAdmin() ? "historial" : "inicio" }); }
  }
  return L.filter((x) => new Date(x.t) <= Date.now()).sort((a, b) => new Date(b.t) - new Date(a.t));
}
const sinLeer = () => { const v = store.get("notiVisto", 0); return avisos().filter((x) => new Date(x.t).getTime() > v).length; };

function notificaciones() {
  if (!HIST && typeof cargarHist === "function") cargarHist();
  const v = store.get("notiVisto", 0), L = avisos();
  const grupo = (x) => { const d = new Date(x.t), h = new Date(); if (d.toDateString() === h.toDateString()) return "HOY"; h.setDate(h.getDate() - 1); return d.toDateString() === h.toDateString() ? "AYER" : "ANTES"; };
  let g0 = "", html = "";
  for (const x of L) {
    const g = grupo(x); if (g !== g0) { g0 = g; html += `<div class="nfg">${g}</div>`; }
    html += `<button class="nfi ${new Date(x.t).getTime() > v ? "nuevo" : ""}" data-go="${x.go}"><span class="nfic ${x.c}">${ic(x.i)}</span><div><b>${esc(x.h)}</b><p>${esc(x.s)}</p><small>${hace(x.t)}</small></div></button>`;
  }
  return `<div class="nftop"><button class="cback" data-go="inicio" aria-label="Atrás">${ic("left")}</button><h2>Notificaciones</h2><span></span></div>
    <div class="nfsub"><span>Mantente al día con tus picks y resultados</span><button data-act="notileido">Leído todo</button></div>
    ${html || `<div class="sgvac"><span>${ic("bell")}</span><b>Sin notificaciones</b><p>Aquí verás los picks del día, los errores de cuota y los resultados de tus picks seguidos.</p></div>`}`;
}
function actInicio2(a) {
  if (a === "notileido") { store.set("notiVisto", Date.now()); toast("Todo marcado como leído"); rerender(); return true; }
  return false;
}
// punto rojo en la campana si hay avisos nuevos
function campana() { try { return sinLeer() ? `<i class="bdot"></i>` : ""; } catch (e) { return ""; } }

// ---------------------------------------------------------------- Perfil: invitar y calificar (como IABET)
async function invitar() {
  const c = typeof codigoRef === "function" ? codigoRef() : "";
  const d = { title: "CASHBET", text: `Mira CASHBET: pronósticos de fútbol y NBA con IA, gratis.${c ? ` Mi código de referido: ${c}` : ""}`, url: "https://cashbetapp.github.io/" + (c ? `?ref=${c}` : "") };
  try { if (navigator.share) { await navigator.share(d); return; } } catch (e) { return; }
  try { await navigator.clipboard.writeText(d.text + " " + d.url); toast("Enlace copiado: pégalo donde quieras"); }
  catch (e) { toast("Comparte este enlace: " + d.url.replace("https://", "")); }
}
async function enviarOpinion() {
  const n = ui.estrellas || 0, t = (document.getElementById("cidea") || {}).value || "";
  if (!n) return toast("Elige de 1 a 5 estrellas");
  if (typeof USER === "undefined" || !USER || !FB) return toast("Entra a tu cuenta para enviar tu opinión");
  try {
    await FB.db.collection("opiniones").doc(USER.uid).set({ estrellas: n, idea: t.slice(0, 1000), email: USER.email || null, nombre: USER.displayName || store.get("nombre", "") || null, at: firebase.firestore.FieldValue.serverTimestamp() });
    toast("¡Gracias! Recibimos tu opinión"); location.hash = "#ajustes";
  } catch (e) { toast("No se pudo enviar. Intenta más tarde."); }
}
function actPerfil2(a, el) {
  if (a === "invitar") { invitar(); return true; }
  if (a === "estrella") { ui.estrellas = +el.dataset.k; document.querySelectorAll(".cstars button").forEach((b, i) => b.classList.toggle("on", i < ui.estrellas)); return true; }
  if (a === "enviarop") { enviarOpinion(); return true; }
  return false;
}
