/* CASHBET — app. Lee data/picks.json (lo genera el robot) y guarda en el
   celular solo lo personal: tema, nombre, seguidos y bankroll. */
"use strict";

// ------------------------------------------------------------ íconos (SVG propios)
const I = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  homeF: '<path fill="currentColor" stroke="none" d="M12 2.6 2.4 10.6a1 1 0 0 0-.4.8V20a2 2 0 0 0 2 2h5v-7h6v7h5a2 2 0 0 0 2-2v-8.6a1 1 0 0 0-.4-.8z"/>',
  cal: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  heart: '<path d="M12 20.5s-7.5-4.6-9.3-9.4C1.4 7.6 3.8 4 7.4 4c2 0 3.5 1.1 4.6 2.6C13.1 5.1 14.6 4 16.6 4c3.6 0 6 3.6 4.7 7.1-1.8 4.8-9.3 9.4-9.3 9.4z"/>',
  heartF: '<path fill="currentColor" d="M12 20.5s-7.5-4.6-9.3-9.4C1.4 7.6 3.8 4 7.4 4c2 0 3.5 1.1 4.6 2.6C13.1 5.1 14.6 4 16.6 4c3.6 0 6 3.6 4.7 7.1-1.8 4.8-9.3 9.4-9.3 9.4z"/>',
  wallet: '<rect x="2.5" y="5" width="19" height="15" rx="3"/><path d="M2.5 10h19M16.5 15h1.5"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.2-4 4.3-6 8-6s6.8 2 8 6"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  warn: '<path d="M12 3 2 20h20z"/><path d="M12 10v4.5M12 17.5v.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="m15 5-7 7 7 7"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
};
const ic = (n, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${I[n]}</svg>`;

// ------------------------------------------------------------ utilidades
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (p, d = 0) => (p * 100).toFixed(d) + "%";
// cuotas en el formato elegido en Perfil (decimal, americano o fraccional)
function frac(v) { let best = [1, 1], err = 9; for (let d = 1; d <= 20; d++) { const n = Math.round(v * d), e = Math.abs(n / d - v); if (n > 0 && e < err - 1e-9) { err = e; best = [n, d]; } } return `${best[0]}/${best[1]}`; }
const odd = (x) => {
  if (!x) return "—";
  x = Number(x);
  const f = (typeof store !== "undefined" && store.get("fmt", "dec")) || "dec";
  if (f === "us") return x >= 2 ? "+" + Math.round((x - 1) * 100) : "-" + Math.round(100 / (x - 1));
  if (f === "fr") return frac(x - 1);
  return x.toFixed(2);
};
const store = {
  get(k, d) { try { const v = localStorage.getItem("cb_" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("cb_" + k, JSON.stringify(v)); } catch {} },
};
const fmtT = new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit", hour12: true });
const fmtD = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long" });
const fmtS = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short" });
const dkey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hora = (at) => fmtT.format(new Date(at)).replace(/\s?a\.\s?m\./i, " AM").replace(/\s?p\.\s?m\./i, " PM");
function cuando(at) {
  const d = new Date(at), hoy = new Date(), man = new Date(); man.setDate(hoy.getDate() + 1);
  const k = dkey(d);
  const dia = k === dkey(hoy) ? "Hoy" : k === dkey(man) ? "Mañana" : cap(fmtS.format(d));
  return `${dia} · ${hora(at)}`;
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function toast(t) {
  const el = $("#toast"); el.textContent = t; el.classList.add("on");
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("on"), 1800);
}
const sigla = (t) => ((t && (t.ab || t.n)) || "?").replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9 ]/g, "").split(" ").filter(Boolean).map((w, i, a) => a.length > 1 ? w[0] : w.slice(0, 3)).join("").slice(0, 3).toUpperCase();
const NBA_LOGOS = new Set("atl bos bkn cha chi cle dal den det gs hou ind lac lal mem mia mil min no ny okc orl phi phx por sac sa tor utah wsh".split(" "));
function crest(team, size = 40) {
  const f = `<span class="crest-f" style="width:${size}px;height:${size}px;font-size:${Math.max(9, size / 3.6)}px">${esc(sigla(team))}</span>`;
  // fútbol: si el robot tiene el escudo real de FotMob para ese equipo de ESPN, se usa ese
  const fmId = team && /\/soccer\/500(?:-dark)?\/(?:scoreboard\/)?(\d+)\.png/.exec(team.logo || "");
  const fmLogo = fmId && typeof D !== "undefined" && D && D.escudos && D.escudos[fmId[1]];
  if (fmLogo) team = Object.assign({}, team, { logo: fmLogo, ld: null });
  // NBA: escudo oficial principal de la liga (vectorial, guardado en img/nba) en vez del de ESPN
  const nbaAb = team && /\/teamlogos\/nba\/500(?:-dark)?\/(?:scoreboard\/)?([a-z]+)\.png/i.exec(team.logo || "");
  if (nbaAb && NBA_LOGOS.has(nbaAb[1].toLowerCase())) team = Object.assign({}, team, { logo: `img/nba/${nbaAb[1].toLowerCase()}.svg`, ld: null });
  const src = team && (team.ld && !document.documentElement.classList.contains("light") ? team.ld : team.logo);
  if (src) return `<img class="crest nb${nbaAb ? " nba" : ""}" src="${esc(src)}"${team.ld ? ` data-ll="${esc(team.logo)}" data-ld="${esc(team.ld)}"` : ""} alt="" width="${size}" height="${size}" loading="lazy" data-fb="${esc(f)}">`;
  return f;
}
// si una imagen no carga, se reemplaza por la sigla (escudos) o se oculta (fotos)
document.addEventListener("error", (e) => {
  const t = e.target;
  if (t.tagName !== "IMG") return;
  if (t.dataset.fb) t.outerHTML = t.dataset.fb; else t.style.visibility = "hidden";
}, true);
const isUp = (m) => !/^menos|btts_no/.test(m);

// ------------------------------------------------------------ tema
function applyTheme() {
  const t = store.get("tema", "auto");
  const light = t === "claro" || (t === "auto" && matchMedia("(prefers-color-scheme: light)").matches);
  document.documentElement.classList.toggle("light", light);
  document.querySelectorAll("img[data-ld]").forEach((i) => (i.src = light ? i.dataset.ll : i.dataset.ld));
  $('meta[name="theme-color"]').setAttribute("content", light ? "#f2f4f2" : "#060807");
}
matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", applyTheme);
applyTheme();

// ------------------------------------------------------------ datos
let D = null;
async function load() {
  try {
    const r = await fetch("data/picks.json?t=" + Date.now(), { cache: "no-store" });
    D = await r.json();
    store.set("cache", D);
  } catch {
    D = store.get("cache", null);
  }
  if (!D) { $("#app").innerHTML = `<div class="empty">No se pudieron cargar los pronósticos. Revisa tu conexión.</div>`; return; }
  const ahora = Date.now() - 2.5 * 3600e3;
  D.partidos = D.partidos.filter((g) => new Date(g.at).getTime() > ahora);
  D.byId = Object.fromEntries(D.partidos.map((g) => [g.id, g]));
  // props NBA: solo las que tienen valor real contra la casa (probabilidad ya mezclada
  // con la de la casa según lo que el modelo ha demostrado)
  // jugadores NBA: primero los que tienen valor real (+5 %); el resto se muestra EN PRUEBA
  // (probabilidad ya mezclada con la casa >= 55 %), con la cuota real de la casa
  D.propsOk = (D.props || []).filter((x) => new Date(x.at).getTime() > Date.now() && (x.valor >= (D.valor_min || 0.05) || x.p >= 0.55))
    .sort((a, b) => b.valor - a.valor || b.p - a.p);
  D.propsOk.forEach((x) => (x.prueba = !(x.valor >= (D.valor_min || 0.05))));
  // regla del usuario (opción 2): solo tipos de pick validados o "en prueba" (70 %+ real); los demás
  // el robot los marca "oculto" (se registran para ganarse la validación, pero no se muestran)
  D.partidos.forEach((g) => {
    if (g.pick && g.pick.oculto) g.pick.bajo = true;
    if (g.extra) { g.extra.picks = g.extra.picks.filter((x) => !x.oculto); g.extra.jug = g.extra.jug.filter((x) => !x.oculto); }
  });
  D.propsOk = D.propsOk.filter((x) => !x.oculto);
  route();
  if (typeof avisoPriv === "function") setTimeout(avisoPriv, 600);
}

// ------------------------------------------------------------ navegación
const TABS = [["inicio", "Inicio", "home"], ["calendario", "Calendario", "cal"], ["picks", "Picks", "trend"], ["seguidos", "Seguidos", "heart"], ["bankroll", "Bankroll", "wallet"]];
let ui = { cal: 0, calDep: "todos", pf: "todos", calOrd: store.get("calOrd", "conf") };
function nav(cur) {
  $("#nav").innerHTML = `<div class="in">${TABS.map(([k, t, i]) =>
    `<button class="${k === cur ? "on" : ""}" data-go="${k}">${ic(k === cur && k === "inicio" ? "homeF" : i)}${t}</button>`).join("")}</div>`;
}
function route() {
  if (!D) return;
  let [tab, arg] = (location.hash.slice(1) || "inicio").split("/");
  // puerta: sin cuenta solo se ve la pantalla de cuenta y la de privacidad
  const libre = tab === "cuenta" || (tab === "ajustes" && arg === "privacidad");
  const dentro = typeof cuentaActiva !== "function" || cuentaActiva();
  document.body.classList.toggle("sincuenta", !dentro);
  if (!dentro && !libre) { tab = "cuenta"; arg = typeof cuentaPendiente === "function" && cuentaPendiente() ? "verificar" : ""; }
  if (tab === "historial" && !(typeof esAdmin === "function" && esAdmin())) { tab = "inicio"; arg = ""; }
  const views = { inicio: (a) => inicio(a), calendario: (a) => calendario(a), picks: (a) => picks(a), seguidos, bankroll, ajustes: (a) => ajustes(a), historial: (a) => historial(a), cuenta: (a) => cuentaVista(a), notificaciones: () => notificaciones(), odds: () => (typeof oddsVista === "function" ? oddsVista() : inicio()) };
  const v = views[tab] || inicio;
  const clave = tab + "/" + (arg || "");
  if ($("#app").dataset.tab !== clave) {
    $("#app").innerHTML = v(arg);
    $("#app").dataset.tab = clave;
    window.scrollTo(0, 0);
    after(tab);
  }
  nav(views[tab] ? tab : "inicio");
  if (arg && tab === "p") return;
}
function after(tab) {
  if (tab === "inicio" || !tab) {
    const car = $(".car"); if (!car) return;
    car.addEventListener("scroll", () => {
      const paso = car.children[1] ? car.children[1].offsetLeft - car.children[0].offsetLeft : car.clientWidth;
      const i = Math.round(car.scrollLeft / paso);
      document.querySelectorAll(".dots i").forEach((d, j) => d.classList.toggle("on", i === j));
    }, { passive: true });
    // picks destacados: se deslizan solos; si la persona toca, se pausa un rato
    clearInterval(window._carT); let quieto = 0;
    const pausa = () => (quieto = Date.now() + 9000);
    ["touchstart", "pointerdown", "wheel"].forEach((ev) => car.addEventListener(ev, pausa, { passive: true }));
    window._carT = setInterval(() => {
      if (!document.body.contains(car)) return clearInterval(window._carT);
      if (Date.now() < quieto || document.hidden || car.children.length < 2) return;
      const n = car.children.length, paso = car.children[1].offsetLeft - car.children[0].offsetLeft;
      const i = Math.round(car.scrollLeft / paso);
      car.scrollTo({ left: ((i + 1) % n) * paso, behavior: "smooth" });
    }, 4000);
  }
}
window.addEventListener("hashchange", route);
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-go],[data-g],[data-mp],[data-res],[data-pr],[data-pk],[data-act]");
  if (!t) return;
  if (t.dataset.go) { location.hash = t.dataset.go; }
  else if (t.dataset.mp && typeof openMatchPick === "function") openMatchPick(t.dataset.mp);
  else if (t.dataset.res && typeof openResultado === "function") openResultado(t.dataset.res);
  else if (t.dataset.g) openGame(t.dataset.g, t.dataset.t || "resumen");
  else if (t.dataset.pk) openPick(t.dataset.pk, t.dataset.m);
  else if (t.dataset.pr) openProp(+t.dataset.pr);
  else act(t.dataset.act, t);
});

// ------------------------------------------------------------ cabecera
function header(title, sub) {
  return `<div class="top"><div class="logo"><img class="lgc" src="img/logo-cara.png" alt="">CASH<b>BET</b></div><div class="ic">
    <button class="icb" data-go="notificaciones" aria-label="Notificaciones">${ic("bell")}${typeof campana === "function" ? campana() : ""}</button>
    <button class="icb" data-go="ajustes" aria-label="Ajustes">${ic("user")}</button></div></div>
    <h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ""}`;
}
function saludo() {
  const h = new Date().getHours();
  const s = h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
  const n = store.get("nombre", "");
  return n ? `${s}, ${esc(n)}` : s;
}
// solo los partidos que se juegan HOY (fecha del celular); los de días siguientes
// aparecen cuando llegue su día (mientras tanto se ven en el Calendario)
const esHoy = (at) => dkey(new Date(at)) === dkey(new Date());
const delDia = () => D.partidos.filter((g) => esHoy(g.at) && new Date(g.at) > Date.now() - 2 * 3600e3);

// ------------------------------------------------------------ INICIO
function inicioViejo() {
  const hoy = delDia();
  const rec = (D.registro && D.registro.partidos) || { n: 0 };
  const a = D.acierto;
  const nPrueba = a.futbol_partidos + a.nba_partidos;
  const efPrueba = (a.futbol_1x2 * a.futbol_partidos + a.nba_ganador * a.nba_partidos) / nPrueba;
  const real = rec.n >= 20;
  const cuotas = hoy.map((g) => g.pick.cuota || g.pick.justa);
  const cprom = cuotas.length ? cuotas.reduce((s, x) => s + x, 0) / cuotas.length : 0;
  const top = [...hoy].filter((g) => ["1", "2"].includes(g.pick.m)).sort((x, y) => y.pick.p - x.pick.p).slice(0, 3);
  const lista = [...hoy].sort((x, y) => y.pick.p - x.pick.p).slice(0, 12);
  return header(saludo(), `${cap(fmtD.format(new Date()))} · ${hoy.length} picks listos`) + `
  <div class="tiles">
    <div class="tile"><div class="k">Efectividad</div><div class="v g">${real ? Math.round(rec.ef) : Math.round(efPrueba)}%</div><div class="n">${real ? `${rec.n} picks reales` : `prueba · ${nPrueba.toLocaleString("es-CO")} partidos`}</div></div>
    <div class="tile"><div class="k">Racha</div><div class="v">${rec.n ? rec.racha : "—"}</div><div class="n">${rec.n ? "picks calificados" : "empieza hoy"}</div></div>
    <div class="tile"><div class="k">Cuota prom.</div><div class="v">${cprom ? cprom.toFixed(2) : "—"}</div><div class="n">picks de hoy</div></div>
  </div>
  ${top.length ? `<div class="sec"><h2>Picks destacados</h2><button class="pill" data-go="picks">Ver todos</button></div>
  <div class="car">${top.map(heroCard).join("")}</div>
  <div class="dots">${top.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("")}</div>` : ""}
  <div class="sec"><h2>Picks principales</h2><button class="pill" data-go="calendario">Ver todos</button></div>
  ${lista.map(rowCard).join("") || `<div class="empty">Hoy ya no quedan partidos. Los de mañana aparecen aquí desde mañana; puedes verlos antes en el Calendario.</div>`}`;
}
function heroCard(g) {
  const c = g.pick.cuota;
  return `<div class="hero">
    <span class="lg">${esc(g.liga)}</span>
    <div class="pct"><b>${pct(g.pick.p)}</b><span>confianza</span></div>
    <div class="vs">${crest(g.h, 54)} vs ${crest(g.a, 54)}</div>
    <h3>${esc(g.pick.txt)}</h3>
    <div class="meta">${esc(g.h.n)} vs ${esc(g.a.n)} · ${cuando(g.at)}</div>
    <div class="bot"><b>${c ? `Cuota ${odd(c)}` : `Cuota justa ${odd(g.pick.justa)}`}</b><button class="btn-g" data-g="${g.id}">Ver análisis</button></div>
  </div>`;
}
function rowCard(g) {
  const up = isUp(g.pick.m);
  return `<button class="row" data-g="${g.id}">
    <span class="pair">${crest(g.h, 40)}${crest(g.a, 40)}</span>
    <span class="mid"><div class="lgn">${esc(g.liga)}</div><div class="tt">${esc(g.h.n)} vs ${esc(g.a.n)}</div>
      <div class="tm">${cuando(g.at)}</div><span class="tag ${up ? "" : "bad"}">${ic(up ? "up" : "down")}<span>${esc(g.pick.txt)}</span></span></span>
    <span class="rt"><b>${pct(g.pick.p)}</b><span>${odd(g.pick.cuota || g.pick.justa)}</span></span></button>`;
}

// ------------------------------------------------------------ CALENDARIO
function calendarioViejo() {
  const dias = [];
  for (let i = 0; i < 8; i++) { const d = new Date(); d.setDate(d.getDate() + i); dias.push(d); }
  const sel = dkey(dias[ui.cal]);
  let gs = D.partidos.filter((g) => dkey(new Date(g.at)) === sel);
  if (ui.calDep !== "todos") gs = gs.filter((g) => g.dep === ui.calDep);
  const porLiga = ui.calOrd === "liga";
  const ligas = {};
  if (porLiga) gs.sort((a, b) => new Date(a.at) - new Date(b.at)).forEach((g) => (ligas[g.liga] = ligas[g.liga] || []).push(g));
  else gs.sort((a, b) => b.pick.p - a.pick.p);
  return header("Calendario", `${gs.length} partidos · ${cap(fmtD.format(dias[ui.cal]))}`) + `
  <div class="chips" style="margin-top:14px">${dias.map((d, i) => `<button class="chip ${i === ui.cal ? "on" : ""}" data-act="cal" data-i="${i}">${i === 0 ? "Hoy" : i === 1 ? "Mañana" : cap(fmtS.format(d))}</button>`).join("")}</div>
  <div class="chips">${[["todos", "Todos"], ["futbol", "Fútbol"], ["nba", "NBA"]].map(([k, t]) => `<button class="chip ${ui.calDep === k ? "on" : ""}" data-act="caldep" data-k="${k}">${t}</button>`).join("")}</div>
  <div class="chips">${[["conf", "Mayor confianza"], ["liga", "Por liga"]].map(([k, t]) => `<button class="chip ${ui.calOrd === k ? "on" : ""}" data-act="calord" data-k="${k}">${t}</button>`).join("")}</div>
  ${!porLiga ? gs.map(rowCard).join("") || `<div class="empty">No hay partidos este día en las ligas que seguimos.</div>` : Object.entries(ligas).map(([l, xs]) => `<div class="day">${esc(l)}</div>${xs.map(rowCard).join("")}`).join("") || `<div class="empty">No hay partidos este día en las ligas que seguimos.</div>`}`;
}

// ------------------------------------------------------------ PICKS
function picksViejo() {
  const f = ui.pf;
  let body = "";
  const STAT = { cor: "Córners", sot: "Tiros a puerta", tir: "Tiros", fal: "Faltas", tar: "Tarjetas" };
  const hoyF = D.partidos.filter((g) => g.dep === "futbol" && g.extra && esHoy(g.at) && new Date(g.at) > Date.now());
  if (STAT[f]) {
    const xs = hoyF.flatMap((g) => g.extra.picks.filter((x) => x.s === f).map((x) => ({ g, x }))).sort((a, b) => b.x.p - a.x.p).slice(0, 60);
    body = xs.map(({ g, x }, i) => xCard(g, x, i)).join("") || `<div class="empty">Hoy no quedan partidos de fútbol con este mercado.</div>`;
  } else if (f === "jugfut") {
    const xs = hoyF.flatMap((g) => g.extra.jug.map((x) => ({ g, x }))).sort((a, b) => b.x.p - a.x.p).slice(0, 80);
    body = `<div class="note">${ic("warn")}<div><b>Titulares probables.</b> Se calculan con quienes fueron titulares en sus últimos partidos. Si el jugador no juega, la apuesta normalmente se anula.</div></div>` +
      (xs.map(({ g, x }, i) => xCard(g, x, i)).join("") || `<div class="empty">Hoy no quedan partidos de fútbol con jugadores.</div>`);
  } else if (f === "jugadores") {
    body = `<div class="note">${ic("warn")}<div><b>En prueba.</b> Las ventajas contra la casa en jugadores todavía no se han comprobado con resultados reales. El robot las está calificando todos los días; cuando haya suficientes, verás aquí su acierto.</div></div>` +
      (D.propsOk.filter((x) => esHoy(x.at)).slice(0, 40).map(propCard).join("") || `<div class="empty">Todavía no hay líneas de jugadores para los partidos de hoy.</div>`);
  } else {
    let gs = D.partidos.filter((g) => new Date(g.at) > Date.now());
    if (f !== "todos") gs = gs.filter((g) => g.dep === f);
    gs = gs.filter((g) => esHoy(g.at)).sort((a, b) => b.pick.p - a.pick.p);
    body = gs.map((g, i) => vCard(g, i)).join("") || `<div class="empty">Hoy ya no quedan picks. Los de mañana aparecen aquí desde mañana; puedes verlos antes en el Calendario.</div>`;
  }
  return header("Picks", f === "jugadores" ? `Jugadores NBA de hoy donde el modelo ve ventaja · ${D.propsOk.filter((x) => esHoy(x.at)).length}` : `Hoy · ordenados por confianza · cuota ${odd(D.cuota_min || 1.3)} o más`) + `
  <div class="chips" style="margin-top:14px">${[["todos", "Todos"], ["futbol", "Fútbol"], ["nba", "NBA"], ["cor", "Córners"], ["sot", "Tiros a puerta"], ["tir", "Tiros"], ["fal", "Faltas"], ["tar", "Tarjetas"], ["jugfut", "Jugadores fútbol"], ["jugadores", "Jugadores NBA"]].map(([k, t]) => `<button class="chip ${f === k ? "on" : ""}" data-act="pf" data-k="${k}">${t}</button>`).join("")}</div>${body}`;
}
function vCard(g, i) {
  const up = isUp(g.pick.m), c = g.pick.cuota, casa = c ? 1 / c : null;
  return `<button class="vrow" data-g="${g.id}"><div class="r1"><span class="rank">${i + 1}</span><span class="pair">${crest(g.h, 38)}${crest(g.a, 38)}</span>
    <div style="min-width:0;flex:1"><div class="nm">${esc(g.h.n)} vs ${esc(g.a.n)}</div><div class="pk ${up ? "" : "bad"}">${ic(up ? "up" : "down")}${esc(g.pick.txt)}</div></div>
    <div class="ed"><b>${pct(g.pick.p)}</b><span>${esc(g.liga.split(" ")[0])} · ${odd(c || g.pick.justa)}</span></div></div>
    <div class="bar2">${casa ? `Casa <b>${pct(casa)}</b>` : `<span>${cuando(g.at)}</span>`}<span class="tr"><i style="width:${g.pick.p * 100}%"></i>${casa ? `<u style="left:${casa * 100}%"></u>` : ""}</span>Modelo <b>${pct(g.pick.p)}</b></div></button>`;
}
function xCard(g, x, i) {
  const t = x.txt.toLowerCase(), up = t.includes("más de") || (t.endsWith("recibe tarjeta") && !t.endsWith("no recibe tarjeta"));
  const quien = x.sc === "j" ? `<span class="head crest-f">${esc(sigla({ n: x.jugador }))}</span>` : `<span class="pair">${crest(g.h, 38)}${crest(g.a, 38)}</span>`;
  const sub = x.sc === "j" ? `${esc(g[x.side].n)} · ${esc(g.h.n)} vs ${esc(g.a.n)}` : `${esc(g.h.n)} vs ${esc(g.a.n)}`;
  return `<button class="vrow" data-g="${g.id}" data-t="${x.sc === "j" ? "jugadores" : "mercados"}"><div class="r1"><span class="rank">${i + 1}</span>${quien}
    <div style="min-width:0;flex:1"><div class="nm">${x.sc === "j" ? esc(x.jugador) : sub}</div><div class="pk ${up ? "" : "bad"}">${ic(up ? "up" : "down")}<span>${esc(x.sc === "j" ? x.txt.split(": ")[1] : x.txt)}</span></div></div>
    <div class="ed"><b>${pct(x.p)}</b><span>${esc(g.liga.split(" ")[0])} · ${odd(x.justa)}</span></div></div>
    <div class="bar2"><span class="el">${x.sc === "j" ? `${esc(g[x.side].n)} · ${cuando(g.at)}` : cuando(g.at)}</span>${x.prueba ? `<span class="nw">Acertó en prueba <b>${Math.round(x.prueba)}%</b></span>` : ""}</div></button>`;
}
function propCard(x, n) {
  const i = D.props.indexOf(x), up = x.lado === "mas", ed = x.p - x.casa;
  return `<button class="vrow" data-pr="${i}"><div class="r1"><span class="rank">${n + 1}</span>${x.foto ? `<img class="head" src="${esc(x.foto)}" alt="" loading="lazy">` : `<span class="head crest-f">${esc(sigla({ n: x.jugador }))}</span>`}
    <div style="min-width:0;flex:1"><div class="nm">${esc(x.jugador)}</div><div class="pk ${up ? "" : "bad"}">${ic(up ? "up" : "down")}${up ? "Más" : "Menos"} de ${x.linea} ${esc(x.tipo.toLowerCase())}</div></div>
    <div class="ed"><b>+${(ed * 100).toFixed(1)}%</b><span>ventaja · ${odd(x.cuota)}</span></div></div>
    <div class="bar2">Casa <b>${pct(x.casa)}</b><span class="tr"><i style="width:${x.p * 100}%"></i><u style="left:${x.casa * 100}%"></u></span>Modelo <b>${pct(x.p)}</b></div></button>`;
}

// ------------------------------------------------------------ SEGUIDOS
function seguidos() {
  const seg = store.get("seg", {});
  const ids = Object.keys(seg);
  const rec = D.registro || {};
  const ult = rec.ultimos || [];
  const byRes = Object.fromEntries(ult.map((e) => [e.id, e]));
  const mine = ids.map((id) => D.byId[id] ? { g: D.byId[id] } : { s: seg[id], r: byRes[id] }).sort((a, b) => new Date((b.g || b.s).at) - new Date((a.g || a.s).at));
  const rp = rec.partidos || { n: 0 };
  return header("Seguidos", `${ids.length} picks que sigues`) + `
  ${mine.length ? mine.map((m) => m.g ? rowCard(m.g) : histRow(m.s, m.r)).join("") : `<div class="box small" style="margin-top:14px">Toca el corazón en cualquier pick para seguirlo. Aquí verás si acertó cuando termine el partido.</div>`}
  <div class="sec"><h2>Resultados del robot</h2>${typeof esAdmin === "function" && esAdmin() ? `<button class="pill dk" data-go="historial">Historial ${ic("right")}</button>` : ""}</div>
  <div class="tiles" style="margin-top:0">
    <div class="tile"><div class="k">Acierto real</div><div class="v g">${rp.n ? Math.round(rp.ef) + "%" : "—"}</div><div class="n">${rp.n || 0} calificados</div></div>
    <div class="tile"><div class="k">Racha</div><div class="v">${rp.racha || "—"}</div></div>
    <div class="tile"><div class="k">Unidades</div><div class="v ${!rp.n ? "" : rp.unidades >= 0 ? "pos" : "neg"}">${rp.n ? (rp.unidades > 0 ? "+" : "") + rp.unidades : "—"}</div><div class="n">1 u por pick</div></div>
  </div>
  <div class="small" style="margin:6px 2px 10px">Cada pick queda anotado antes de empezar el partido y se califica solo cuando termina. Nada se borra.</div>
  ${ult.length ? ult.slice(0, 30).map((e) => histRow(e, e)).join("") : `<div class="box small">Todavía no hay picks calificados. Los primeros resultados aparecen cuando terminen los partidos de hoy.</div>`}`;
}
function histRow(s, r) {
  const ok = r && r.ok;
  return `<div class="row"><span class="pair">${crest({ logo: s.hl, n: s.h }, 36)}${crest({ logo: s.al, n: s.a }, 36)}</span>
    <span class="mid"><div class="lgn">${esc(s.liga)}</div><div class="tt">${esc(s.h)} vs ${esc(s.a)}</div><div class="tm">${esc(s.txt)} · ${pct(s.p)}${r && r.res ? ` · terminó ${esc(r.res)}` : ""}</div></span>
    <span class="rt">${r && r.ok != null ? `<span class="wl ${ok ? "G" : "P"}" style="width:30px;height:30px">${ok ? "G" : "P"}</span>` : `<span>pendiente</span>`}</span></div>`;
}

// ------------------------------------------------------------ BANKROLL
function bankroll() {
  const B = store.get("bank", { ini: 0, bets: [] });
  if (!B.ini) return header("Bankroll", "Lleva la cuenta de tu dinero para apostar") + `
    <div class="box"><h4>Empieza aquí</h4><div class="small">Escribe con cuánto dinero empiezas. Todo se guarda solo en tu celular.</div>
    <label class="lbl">Bankroll inicial</label><input class="inp" id="bini" inputmode="numeric" placeholder="Ej: 100000">
    <button class="bigbtn" data-act="bini">Guardar</button></div>
    <div class="box small">Consejo: apuesta siempre una parte pequeña (1 a 3 %) de tu bankroll en cada pick. Así una mala racha no te deja en cero.</div>`;
  let bal = B.ini, won = 0, stake = 0;
  const pts = [B.ini];
  B.bets.forEach((b) => {
    if (b.st === "g") { bal += b.m * (b.c - 1); won += b.m * (b.c - 1); stake += b.m; }
    else if (b.st === "p") { bal -= b.m; won -= b.m; stake += b.m; }
    if (b.st) pts.push(bal);
  });
  const roi = stake ? (won / stake) * 100 : 0;
  const money = (v) => "$" + Math.round(v).toLocaleString("es-CO");
  return header("Bankroll", `Empezaste con ${money(B.ini)}`) + `
  <div class="tiles"><div class="tile"><div class="k">Saldo</div><div class="v" style="font-size:20px">${money(bal)}</div></div>
    <div class="tile"><div class="k">Ganancia</div><div class="v ${won >= 0 ? "pos" : "neg"}" style="font-size:20px">${won >= 0 ? "+" : "-"}${money(Math.abs(won))}</div></div>
    <div class="tile"><div class="k">ROI</div><div class="v ${roi >= 0 ? "pos" : "neg"}" style="font-size:20px">${roi.toFixed(1)}%</div></div></div>
  ${pts.length > 1 ? `<div class="box"><h4>Evolución</h4>${spark(pts)}</div>` : ""}
  <div class="box"><h4>Nueva apuesta</h4>
    <label class="lbl">Qué apostaste</label><input class="inp" id="bq" placeholder="Ej: Gana Atlanta Hawks" value="${esc(ui.prefill?.q || "")}">
    <div class="grid2"><div><label class="lbl">Cuota</label><input class="inp" id="bc" inputmode="decimal" placeholder="1.85" value="${esc(ui.prefill?.c || "")}"></div>
    <div><label class="lbl">Monto</label><input class="inp" id="bm" inputmode="numeric" placeholder="${Math.round(bal * 0.02)}"></div></div>
    <div class="small" style="margin-top:6px">Sugerido (2 % del saldo): ${money(bal * 0.02)}</div>
    <button class="bigbtn" data-act="badd">Agregar</button></div>
  <div class="box"><h4>Mis apuestas <small>${B.bets.length}</small></h4>
    ${B.bets.slice().reverse().map((b) => { const i = B.bets.indexOf(b); return `<div class="bet"><div class="l"><b>${esc(b.q)}</b><span>${money(b.m)} a cuota ${odd(b.c)} · ${new Date(b.t).toLocaleDateString("es-CO")}</span></div>
      <button class="mini ${b.st === "g" ? "g" : ""}" data-act="bst" data-i="${i}" data-s="g">G</button><button class="mini ${b.st === "p" ? "p" : ""}" data-act="bst" data-i="${i}" data-s="p">P</button>
      <button class="mini" data-act="bdel" data-i="${i}" aria-label="Borrar">${ic("trash")}</button></div>`; }).join("") || `<div class="small">Aún no tienes apuestas anotadas.</div>`}</div>
  <button class="pill" style="margin-top:14px" data-act="breset">Empezar de nuevo</button>`;
}
function spark(pts) {
  const w = 300, h = 90, mn = Math.min(...pts), mx = Math.max(...pts), r = mx - mn || 1;
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * w, h - 6 - ((v - mn) / r) * (h - 12)]);
  const d = xy.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${d} L${w} ${h} L0 ${h}Z" fill="var(--gsoft)"/><path d="${d}" fill="none" stroke="var(--g)" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>`;
}

// ------------------------------------------------------------ AJUSTES
function ajustesViejo() {
  const t = store.get("tema", "auto"), a = D.acierto;
  const cal = (rows) => `<table class="tbl"><tr><th>Cuando dice</th><th>Picks</th><th>Acertó</th></tr>${rows.map((r) => `<tr><td>${r.rango}</td><td>${r.n.toLocaleString("es-CO")}</td><td><b>${r.paso}%</b></td></tr>`).join("")}</table>`;
  return header("Ajustes", "") + `
  <div class="box"><h4>Tema</h4><div class="seg" style="margin-top:0">${[["auto", "Automático"], ["oscuro", "Oscuro"], ["claro", "Claro"]].map(([k, l]) => `<button class="${t === k ? "on" : ""}" data-act="tema" data-k="${k}">${l}</button>`).join("")}</div>
    <div class="small" style="margin-top:8px">Automático usa el mismo tema de tu celular.</div></div>
  <div class="box"><h4>Tu nombre</h4><input class="inp" id="nom" placeholder="Para el saludo de Inicio" value="${esc(store.get("nombre", ""))}"><button class="bigbtn" data-act="nom">Guardar</button></div>
  <div class="box"><h4>Cómo medimos el acierto</h4><div class="small">El modelo se probó con partidos que no había visto: solo podía usar los partidos jugados antes de cada fecha.<br><br>
    <b>Fútbol</b> (${a.futbol_partidos.toLocaleString("es-CO")} partidos): acertó el resultado (local, empate o visitante) el <b>${a.futbol_1x2}%</b> de las veces.<br>
    <b>NBA</b> (${a.nba_partidos.toLocaleString("es-CO")} partidos): acertó el ganador el <b>${a.nba_ganador}%</b>.</div>
    <h4 style="margin-top:14px">Fútbol: ¿se cumplen los porcentajes?</h4>${cal(a.calibracion_futbol)}
    ${a.calibracion_nba ? `<h4 style="margin-top:14px">NBA: ¿se cumplen los porcentajes?</h4>${cal(a.calibracion_nba)}` : ""}
    ${a.extra ? `<h4 style="margin-top:14px">Estadísticas de fútbol (picks de ${odd(D.cuota_min || 1.3)} o más)</h4><table class="tbl"><tr><th>Mercado</th><th>Dijo</th><th>Acertó</th></tr>${Object.values(a.extra).filter((m) => m.publicar).map((m) => `<tr><td>${esc(m.titulo)}<br><span class="small">${m.picks.toLocaleString("es-CO")} picks</span></td><td>${m.dijo}%</td><td><b>${m.acierto}%</b></td></tr>`).join("")}</table>` : ""}</div>
  <div class="box"><h4>Juego responsable</h4><div class="small">${esc(D.aviso)} Ningún modelo acierta siempre: incluso un pick de 75 % falla 1 de cada 4 veces. Apuesta solo lo que puedas perder y nunca persigas pérdidas. Solo para mayores de 18 años.</div></div>
  <div class="small" style="text-align:center;margin-top:16px">Datos actualizados: ${new Date(D.generado.replace("Z", ":00Z")).toLocaleString("es-CO")}</div>`;
}

// ------------------------------------------------------------ fichas
let sheetState = {};
function openSheet(html) {
  closeSheet(true);
  const bg = document.createElement("div"); bg.className = "sheet-bg"; bg.onclick = () => closeSheet();
  const sh = document.createElement("div"); sh.className = "sheet"; sh.innerHTML = `<div class="grab"></div><button class="x" data-act="close" aria-label="Cerrar">${ic("x")}</button>` + html;
  document.body.append(bg, sh); document.body.style.overflow = "hidden";
  requestAnimationFrame(() => { bg.classList.add("on"); sh.classList.add("on"); });
  history.pushState({ sheet: 1 }, "");
  let y0 = null;
  sh.addEventListener("touchstart", (e) => { y0 = sh.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  sh.addEventListener("touchend", (e) => { if (y0 != null && e.changedTouches[0].clientY - y0 > 110) closeSheet(); y0 = null; });
}
function closeSheet(silent) {
  document.querySelectorAll(".sheet,.sheet-bg").forEach((n) => { n.classList.remove("on"); setTimeout(() => n.remove(), 250); });
  document.body.style.overflow = "";
  if (!silent && history.state && history.state.sheet) history.back();
}
window.addEventListener("popstate", () => { if (document.querySelector(".sheet.on")) closeSheet(true); });

function conf(p) {
  const n = p >= 0.75 ? 5 : p >= 0.68 ? 4 : p >= 0.6 ? 3 : p >= 0.54 ? 2 : 1;
  return [n, ["", "Baja", "Media-baja", "Media", "Alta", "Muy alta"][n]];
}
function openGameViejo(id, tab = "resumen") {
  const g = D.byId[id]; if (!g) return;
  sheetState = { id, tab };
  const seg = store.get("seg", {});
  const up = isUp(g.pick.m), c = g.pick.cuota, [cn, ct] = conf(g.pick.p);
  const forms = (t, f) => (f || []).map((r) => `<span class="wl ${r.r}">${r.r}</span>`).join("");
  let body = "";
  if (tab === "resumen") {
    const pm = Object.fromEntries(g.mercados.map((s) => [s.m, s]));
    const tres = g.dep === "futbol" ? [pm["1"], pm["X"], pm["2"]] : [pm["1"], null, pm["2"]];
    body = `
    <div class="tiles" style="margin-top:12px"><div class="tile" style="text-align:center"><div class="k">Modelo</div><div class="v g">${pct(g.pick.p)}</div></div>
      <div class="tile" style="text-align:center"><div class="k">${c ? "Casa" : "Cuota justa"}</div><div class="v">${c ? pct(1 / c) : odd(g.pick.justa)}</div></div>
      <div class="tile" style="text-align:center"><div class="k">${c ? "Diferencia" : "Confianza"}</div><div class="v ${c && g.pick.p - 1 / c < 0 ? "neg" : "g"}">${c ? ((g.pick.p - 1 / c) * 100 > 0 ? "+" : "") + ((g.pick.p - 1 / c) * 100).toFixed(1) + "%" : ct.split("-")[0]}</div></div></div>
    <div class="box"><h4>Confianza <small>${ct}</small></h4><div class="conf">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= cn ? "on" : ""}"></i>`).join("")}</div></div>
    <div class="box"><h4>Probabilidad de victoria</h4>
      <div class="prob3">${tres.map((s) => s ? `<i style="flex:${s.p}"></i>` : `<i style="flex:0"></i>`).join("")}</div>
      <div class="leg"><span>${esc(g.h.n)}<b>${pct(tres[0].p, 1)}</b></span>${tres[1] ? `<span style="text-align:center">Empate<b>${pct(tres[1].p, 1)}</b></span>` : ""}<span style="text-align:right">${esc(g.a.n)}<b>${pct(tres[2].p, 1)}</b></span></div></div>
    <div class="box"><h4>Por qué este pick</h4><ul class="why">${why(g).map((t) => `<li>${ic("check")}<span>${t}</span></li>`).join("")}</ul></div>
    ${c ? `<div class="small" style="margin:10px 2px">La diferencia con la casa todavía está en prueba: el robot empezó a guardar las cuotas el 7 de noviembre de 2026 para medirla.</div>` : ""}`;
  } else if (tab === "mercados") {
    body = `<div class="box">${g.mercados.map((s) => `<div class="mk"><div class="l">${esc(s.txt)}<span>cuota justa ${odd(s.justa)}${s.cuota ? ` · casa ${odd(s.cuota)}` : ""}</span></div>
      <div class="pb"><b>${pct(s.p)}</b><div class="tr"><i style="width:${s.p * 100}%"></i></div></div></div>`).join("")}</div>
      <div class="small" style="margin:10px 2px">Cuota justa = lo que debería pagar según el modelo. Si la casa paga más, hay valor (siempre con riesgo).</div>` + statsHtml(g);
  } else if (tab === "jugadores") {
    const J = (g.extra && g.extra.jug) || [];
    body = J.length ? ["h", "a"].map((sd) => {
      const xs = J.filter((x) => x.side === sd);
      return xs.length ? `<div class="box"><h4><span style="display:flex;gap:8px;align-items:center">${crest(g[sd], 24)}${esc(g[sd].n)}</span></h4>${xs.map((x) => `<div class="mk" data-pk="${g.id}" data-m="${esc(x.m)}"><div class="l">${esc(x.jugador)}<span>${esc(x.txt.split(": ")[1])} · cuota justa ${odd(x.justa)}</span></div>
        <div class="pb"><b>${pct(x.p)}</b><div class="tr"><i style="width:${x.p * 100}%"></i></div></div></div>`).join("")}</div>` : "";
    }).join("") + `<div class="small" style="margin:10px 2px">Titulares probables según sus últimos partidos. Solo picks con cuota justa de ${odd(D.cuota_min || 1.3)} o más.</div>`
      : `<div class="empty">No hay picks de jugadores para este partido.</div>`;
  } else {
    const fr = (t, f) => `<div class="box"><h4><span style="display:flex;gap:8px;align-items:center">${crest(t, 24)}${esc(t.n)}</span><span class="wls">${forms(t, f)}</span></h4>
      ${(f || []).map((r) => `<div class="fr"><span class="wl ${r.r}">${r.r}</span>${r.loc ? "vs" : "@"} ${crest({ logo: r.logo, n: r.vs }, 22)} ${esc(r.vs)}<span class="s">${esc(r.m)}</span><span class="d">${new Date(r.at).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}</span></div>`).join("") || `<div class="small">Sin partidos recientes.</div>`}</div>`;
    const baj = g.bajas ? ["h", "a"].map((s) => `<div class="box"><h4>Bajas · ${esc(g[s].n)}</h4>${(g.bajas[s] || []).map((b) => `<div class="fr">${esc(b.n)}<span class="s" style="color:${b.s === "Out" ? "var(--red)" : "var(--bad)"}">${b.s === "Out" ? "Fuera" : esc(b.s)}</span></div>`).join("") || `<div class="small">Sin lesionados reportados.</div>`}</div>`).join("") : "";
    body = fr(g.h, g.forma && g.forma.h) + fr(g.a, g.forma && g.forma.a) + baj +
      `<div class="box"><h4>Enfrentamientos recientes</h4>${(g.h2h || []).map((m) => `<div class="fr">${esc(m.h)} vs ${esc(m.a)}<span class="s">${esc(m.m)}</span><span class="d">${new Date(m.at).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "2-digit" })}</span></div>`).join("") || `<div class="small">No se han enfrentado desde agosto de 2025.</div>`}</div>`;
  }
  const html = `<div class="fh"><span class="lg" style="background:rgba(255,255,255,.1);font-weight:800;font-size:12px;padding:5px 9px;border-radius:8px">${esc(g.liga)}</span>
    <div class="teams"><div class="t">${crest(g.h, 58).replace("<img", '<img style="margin:0 auto"')}<b>${esc(g.h.n)}</b><span>${esc(g.h.rec || "Local")}</span></div>
      <div class="c">${g.dep === "futbol" ? `<b>${g.goles_esperados[0].toFixed(1)} - ${g.goles_esperados[1].toFixed(1)}</b>goles esperados` : `<b>${Math.round(g.puntos_esperados[0])} - ${Math.round(g.puntos_esperados[1])}</b>puntos esperados`}</div>
      <div class="t">${crest(g.a, 58).replace("<img", '<img style="margin:0 auto"')}<b>${esc(g.a.n)}</b><span>${esc(g.a.rec || "Visitante")}</span></div></div>
    <div class="meta">${cuando(g.at)}</div>
    <span class="bigtag ${up ? "" : "bad"}">${ic(up ? "up" : "down")}${esc(g.pick.txt)} · ${pct(g.pick.p)}</span></div>
    <div class="seg">${[["resumen", "Resumen"], ["mercados", "Mercados"], ...(g.extra && g.extra.jug.length ? [["jugadores", "Jugadores"]] : []), ["forma", "Forma"]].map(([k, l]) => `<button class="${tab === k ? "on" : ""}" data-act="gtab" data-k="${k}">${l}</button>`).join("")}</div>
    ${body}
    <div class="acts"><button class="${seg[id] ? "on" : ""}" data-act="seg">${ic(seg[id] ? "heartF" : "heart")}${seg[id] ? "Siguiendo" : "Seguir"}</button>
      <button data-act="tobank">${ic("plus")}Al bankroll</button></div>`;
  const cur = $(".sheet.on");
  if (cur && sheetState.id === id && cur.dataset.id === id) { cur.innerHTML = `<div class="grab"></div><button class="x" data-act="close" aria-label="Cerrar">${ic("x")}</button>` + html; }
  else { openSheet(html); $(".sheet").dataset.id = id; }
}
function statsHtml(g) {
  const X = g.extra;
  if (!X) return "";
  const mx = 1 / (D.cuota_min || 1.3);
  const celda = (p) => `<td class="${p >= 0.5 && p <= mx ? "ok" : p > mx ? "dim" : ""}">${pct(p)}</td>`;
  const tabla = (rows, nom) => rows ? `<div class="sub">${esc(nom)}</div><table class="tbl st"><tr><th>Línea</th><th>Más</th><th>Menos</th></tr>${rows.map(([ln, p]) => `<tr><td>${ln}</td>${celda(p)}${celda(1 - p)}</tr>`).join("")}</table>` : "";
  const top = X.picks.slice(0, 8);
  return (top.length ? `<div class="box"><h4>Mejores picks de estadísticas</h4>${top.map((x) => `<div class="mk" data-pk="${g.id}" data-m="${esc(x.m)}"><div class="l">${esc(x.txt)}<span>cuota justa ${odd(x.justa)}${x.prueba ? ` · en prueba acertó ${x.prueba}%` : ""}</span></div>
      <div class="pb"><b>${pct(x.p)}</b><div class="tr"><i style="width:${x.p * 100}%"></i></div></div></div>`).join("")}</div>` : "") +
    X.grupos.map((gr) => `<div class="box"><h4>${esc(gr.titulo)} <small>esperados ${gr.esp[0]} - ${gr.esp[1]}</small></h4>
      ${tabla(gr.t, "Total del partido")}${tabla(gr.h, g.h.n)}${tabla(gr.a, g.a.n)}</div>`).join("") +
    `<div class="small" style="margin:10px 2px">En verde, las opciones probables que pagan ${odd(D.cuota_min || 1.3)} o más. En gris, las que pagarían menos de ${odd(D.cuota_min || 1.3)}.</div>`;
}
function why(g) {
  const out = [], f = g.forma || {};
  const rs = (xs) => { const c = { G: 0, E: 0, P: 0 }; (xs || []).forEach((r) => c[r.r]++); return c; };
  const fh = rs(f.h), fa = rs(f.a);
  if (g.dep === "futbol") {
    out.push(`Goles esperados: ${esc(g.h.n)} ${g.goles_esperados[0].toFixed(2)} y ${esc(g.a.n)} ${g.goles_esperados[1].toFixed(2)}, calculados con goles y remates al arco de toda la temporada.`);
    out.push(`${esc(g.h.n)}: ${fh.G} ganados, ${fh.E} empates y ${fh.P} perdidos en sus últimos ${(f.h || []).length}.`);
    out.push(`${esc(g.a.n)}: ${fa.G} ganados, ${fa.E} empates y ${fa.P} perdidos en sus últimos ${(f.a || []).length}.`);
  } else {
    out.push(`Marcador esperado: ${esc(g.h.n)} ${Math.round(g.puntos_esperados[0])} - ${Math.round(g.puntos_esperados[1])} ${esc(g.a.n)} (total ${g.total}).`);
    out.push(`${esc(g.h.n)} ${fh.G}-${fh.P} y ${esc(g.a.n)} ${fa.G}-${fa.P} en sus últimos 5 partidos.`);
    const bh = (g.bajas?.h || []).filter((b) => b.s === "Out").length, ba = (g.bajas?.a || []).filter((b) => b.s === "Out").length;
    out.push(`Bajas confirmadas: ${bh} de ${esc(g.h.n)} y ${ba} de ${esc(g.a.n)} (el modelo descuenta los puntos que aportan).`);
  }
  out.push(`Cuota justa ${odd(g.pick.justa)}: si te pagan más que eso, el pick tiene valor según el modelo.`);
  return out;
}
function openProp(i) {
  const x = D.props[i]; if (!x) return;
  sheetState = { prop: i, n: sheetState.n || 10 };
  const n = sheetState.n, up = x.lado === "mas", vals = (x.ult || []).slice(-n);
  const mx = Math.max(x.linea * 1.4, ...vals, 1);
  const pasa = vals.filter((v) => (up ? v > x.linea : v < x.linea)).length;
  const prom5 = (x.ult || []).slice(-5); const p5 = prom5.length ? prom5.reduce((s, v) => s + v, 0) / prom5.length : 0;
  const ed = x.p - x.casa, [cn, ct] = conf(x.p);
  openSheet(`<div class="fh"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><div style="min-width:0"><h3>${esc(x.jugador)}</h3>
    <div class="meta">${esc(x.partido)} · ${cuando(x.at)}</div></div>${x.foto ? `<img class="head" style="width:70px;height:70px;background:rgba(255,255,255,.1)" src="${esc(x.foto)}" alt="">` : ""}</div>
    <span class="bigtag ${up ? "" : "bad"}">${ic(up ? "up" : "down")}${up ? "Más" : "Menos"} de ${x.linea} ${esc(x.tipo)} · ${odd(x.cuota)}</span></div>
    <div class="note" style="margin-top:12px">${ic("warn")}<div><b>En prueba.</b> Esta ventaja aún no está comprobada con resultados reales.</div></div>
    <div class="tiles" style="margin-top:0"><div class="tile" style="text-align:center"><div class="k">Modelo</div><div class="v g">${pct(x.p)}</div></div>
      <div class="tile" style="text-align:center"><div class="k">Casa</div><div class="v">${pct(x.casa)}</div></div>
      <div class="tile" style="text-align:center"><div class="k">Ventaja</div><div class="v g">+${(ed * 100).toFixed(1)}%</div></div></div>
    <div class="box"><h4>Confianza <small>${ct}</small></h4><div class="conf">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= cn ? "on" : ""}"></i>`).join("")}</div></div>
    <div class="box"><h4>Últimos partidos <span class="seg" style="margin:0;padding:3px">${[5, 10].map((k) => `<button style="padding:4px 10px;font-size:12px" class="${n === k ? "on" : ""}" data-act="pn" data-k="${k}">L${k}</button>`).join("")}</span></h4>
      <div class="bars" style="margin-top:24px">${vals.map((v) => `<i class="${(up ? v > x.linea : v < x.linea) ? "" : "no"}" style="height:${(v / mx) * 100}%"><em>${v}</em></i>`).join("")}
      <div class="ln" style="bottom:${(x.linea / mx) * 100}%"><span>Línea ${x.linea}</span></div></div>
      <div class="bfoot"><span>Cumplió ${pasa} de ${vals.length}</span><span>Promedio ${(vals.reduce((s, v) => s + v, 0) / (vals.length || 1)).toFixed(1)}</span></div></div>
    <div class="box"><h4>Por qué este pick</h4><ul class="why">
      <li>${ic("check")}<span>El modelo espera ${x.esperado} (${esc(x.tipo.toLowerCase())}), contra una línea de ${x.linea}.</span></li>
      <li>${ic("check")}<span>Promedia ${p5.toFixed(1)} en sus últimos 5 partidos.</span></li>
      <li>${ic("check")}<span>Cálculo: minutos esperados × lo que produce por minuto, dando más peso a lo reciente.</span></li></ul></div>`);
}

// ------------------------------------------------------------ acciones
function act(a, el) {
  const k = el.dataset.k;
  if (typeof actHist === "function" && actHist(a, el)) return;
  if (typeof actPriv === "function" && actPriv(a, el)) return;
  if (typeof actCuentaSync === "function" && actCuentaSync(a)) return;
  if (typeof actSeguidos === "function" && actSeguidos(a, el)) return;
  if (typeof actInicio2 === "function" && actInicio2(a)) return;
  if (typeof actVivo === "function" && a.startsWith("vv") && actVivo(a, el)) return;
  if (typeof actRes === "function" && actRes(a, el)) return;
  if (typeof actBank === "function" && actBank(a, el)) return;
  if (typeof actErr === "function" && actErr(a, el)) return;
  if (typeof actOdds === "function" && actOdds(a, el)) return;
  if (typeof actPush === "function" && actPush(a, el)) return;
  if (typeof actPrev === "function" && actPrev(a, el)) return;
  if (typeof actPerfil2 === "function" && actPerfil2(a, el)) return;
  if (typeof actFoto === "function" && actFoto(a, el)) return;
  if (typeof actProp === "function" && a.startsWith("pp") && actProp(a, el)) return;
  if (typeof actMatchPick === "function" && a.startsWith("mp") && actMatchPick(a, el)) return;
  if (typeof actVistas === "function" && actVistas(a, el)) return;
  if (typeof actPick === "function" && actPick(a, el)) return;
  if (a === "close") return closeSheet();
  if (a === "cal") { ui.cal = +el.dataset.i; return rerender(); }
  if (a === "caldep") { ui.calDep = k; return rerender(); }
  if (a === "calord") { ui.calOrd = k; store.set("calOrd", k); return rerender(); }
  if (a === "pf") { ui.pf = k; return rerender(); }
  if (a === "gtab") { sheetState.tab = k; const s = $(".sheet.on"); const y = s.scrollTop; openGame(sheetState.id, k); $(".sheet.on").scrollTop = y; return; }
  if (a === "pn") { sheetState.n = +k; const i = sheetState.prop; closeSheet(true); return openProp(i); }
  if (a === "seg") {
    const s = store.get("seg", {}), g = D.byId[sheetState.id];
    if (s[g.id] && !puedeQuitar(s[g.id])) { toast("El partido ya empezó: este pick queda en tus Seguidos y en tu Bankroll"); return; }
    if (s[g.id]) delete s[g.id];
    else s[g.id] = { at: g.at, liga: g.liga, lg: g.lg, dep: g.dep, h: g.h.n, a: g.a.n, hl: g.h.logo, al: g.a.logo, hab: g.h.ab, aab: g.a.ab, txt: g.pick.txt, pill: g.pick.txt, up: isUp(g.pick.m),
      p: g.pick.tipo === "valor" ? g.pick.pv : g.pick.p, m: g.pick.m, cuota: g.pick.cuota || g.pick.justa, oc: g.pick.tipo === "valor" ? g.pick.cuota : g.pick.minima || vale(g.pick.justa), tipo: "Partido", nom: `${g.h.n} vs ${g.a.n}` };
    store.set("seg", s); toast(s[g.id] ? "Siguiendo este pick" : "Dejaste de seguirlo");
    return openGame(g.id, sheetState.tab);
  }
  if (a === "tobank") {
    const g = D.byId[sheetState.id], s = store.get("seg", {});
    if (!s[g.id] && !g.pick.bajo) { s[g.id] = { at: g.at, liga: g.liga, lg: g.lg, dep: g.dep, h: g.h.n, a: g.a.n, hl: g.h.logo, al: g.a.logo, hab: g.h.ab, aab: g.a.ab, txt: g.pick.txt, pill: g.pick.txt, up: isUp(g.pick.m),
      p: g.pick.tipo === "valor" ? g.pick.pv : g.pick.p, m: g.pick.m, cuota: g.pick.cuota || g.pick.justa, oc: g.pick.tipo === "valor" ? g.pick.cuota : g.pick.minima || vale(g.pick.justa), tipo: "Partido", nom: `${g.h.n} vs ${g.a.n}` };
      store.set("seg", s); toast("Siguiendo: ya está en tu Bankroll"); }
    closeSheet(true); location.hash = "bankroll"; return;
  }
  if (a === "tema") { store.set("tema", k); applyTheme(); return rerender(); }
  if (a === "sonido" || a === "vibra") { store.set(a, k === "1"); if (k === "1" && typeof tic === "function") tic(); return rerender(); }
  if (a === "nom") { store.set("nombre", $("#nom").value.trim().slice(0, 24)); return toast("Guardado"); }
  if (a === "novedades") { return toast(`Pronósticos actualizados: ${new Date(D.generado.replace("Z", ":00Z")).toLocaleString("es-CO", { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" })}`); }
  const B = store.get("bank", { ini: 0, bets: [] });
  const num = (v) => parseFloat(String(v).replace(/[^\d.,]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  if (a === "bini") { const v = num($("#bini").value); if (!(v > 0)) return toast("Escribe un valor"); B.ini = v; store.set("bank", B); return rerender(); }
  if (a === "badd") {
    const q = $("#bq").value.trim(), c = num($("#bc").value), m = num($("#bm").value);
    if (!q || !(c > 1) || !(m > 0)) return toast("Completa qué, cuota y monto");
    B.bets.push({ q, c, m, t: Date.now(), st: null }); store.set("bank", B); ui.prefill = null; toast("Apuesta agregada"); return rerender();
  }
  if (a === "bst") { const b = B.bets[+el.dataset.i]; b.st = b.st === el.dataset.s ? null : el.dataset.s; store.set("bank", B); return rerender(); }
  if (a === "bdel") { B.bets.splice(+el.dataset.i, 1); store.set("bank", B); return rerender(); }
  if (a === "breset") { if (confirm("¿Borrar tu bankroll y todas tus apuestas?")) { store.set("bank", { ini: 0, bets: [] }); rerender(); } }
}
function rerender() { $("#app").dataset.tab = ""; route(); }

// ------------------------------------------------------------ arranque
load();
setInterval(() => { if (!document.hidden && !document.querySelector(".sheet.on")) load(); }, 15 * 60e3);
// actualización automática: si hay versión nueva de la app, se instala y la página se recarga sola
if ("serviceWorker" in navigator) {
  const habia = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => {
    const revisar = () => reg.update().catch(() => {});
    document.addEventListener("visibilitychange", () => { if (!document.hidden) revisar(); });
    setInterval(revisar, 30 * 60 * 1000);
  }).catch(() => {});
  let recargado = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (habia && !recargado) { recargado = true; location.reload(); }
  });
}
