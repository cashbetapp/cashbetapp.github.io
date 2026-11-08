// CASHBET · Historial público: registro inalterable de todos los picks (aciertos y fallos)
let HIST = null, HIST_CARGANDO = false;
ui.hst = "todos"; ui.hdep = "todos"; ui.hn = 60; ui.hmk = "todos"; ui.hdia = "todos";

async function cargarHist() {
  if (HIST || HIST_CARGANDO) return;
  HIST_CARGANDO = true;
  try {
    const r = await fetch("data/historial.json?t=" + Date.now(), { cache: "no-store" });
    HIST = await r.json();
  } catch (e) { HIST = { error: true }; }
  HIST_CARGANDO = false;
  if (location.hash.startsWith("#historial")) { $("#app").dataset.tab = ""; route(); }
}

const ESTADO = { acierto: ["Acierto", "ok"], fallo: ["Fallo", "no"], push: ["Push", "nu"], nulo: ["Nulo", "nu"], retirado: ["Retirado", "nu"] };
const n0 = (x) => (x == null ? "—" : Number(x).toLocaleString("es-CO"));
const hora2 = (iso) => iso ? new Date(iso).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" }) : "";
const diaLargo = (iso) => new Date(iso).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });

function kpis(m) {
  const roi = m.roi;
  return `<div class="hk">
    <div><span>Acierto</span><b>${m.acierto != null ? m.acierto + "%" : "—"}</b><small>${n0(m.aciertos)} de ${n0(m.calificados)} calificados</small></div>
    <div><span>Total de picks</span><b>${n0(m.total)}</b><small>${n0(m.pendientes)} por jugarse</small></div>
    <div><span>Aciertos / Fallos</span><b><em class="g">${n0(m.aciertos)}</em> / <em class="r">${n0(m.fallos)}</em></b><small>${n0(m.push)} push · ${n0(m.nulos)} nulos</small></div>
    <div><span>ROI real</span><b class="${roi ? (roi.pct >= 0 ? "g" : "r") : ""}">${roi ? (roi.pct > 0 ? "+" : "") + roi.pct + "%" : "—"}</b><small>${roi ? `${n0(roi.n)} picks con cuota de casa · ${roi.unidades > 0 ? "+" : ""}${roi.unidades} u` : "sin cuotas de casa aún"}</small></div>
    <div><span>Brier Score</span><b>${m.brier ?? "—"}</b><small>0 = perfecto · 0,25 = moneda al aire</small></div>
    <div><span>Log Loss</span><b>${m.logloss ?? "—"}</b><small>más bajo es mejor · 0,693 = moneda</small></div>
  </div>`;
}

function calibracion(c) {
  const rows = Object.entries(c).filter(([, m]) => m.calificados);
  return `<div class="pkcard hcal"><div class="hcl"><span><i class="d"></i>Lo que dijimos</span><span><i class="p"></i>Lo que pasó</span></div>
    ${rows.map(([k, m]) => `<div class="hcr"><span class="b">${k.replace(/^0/, "")}</span>
      <div class="t"><s style="width:${m.acierto}%"></s><u style="left:${m.prob_media}%"></u></div>
      <span class="v"><b>${m.acierto}%</b><small>${n0(m.calificados)}</small></span></div>`).join("")}
    <div class="small" style="margin-top:10px">Si el modelo está bien calibrado, la barra verde llega a la raya: cuando dice 70 %, pasa cerca del 70 % de las veces.</div></div>`;
}

function tablaM(obj, max = 14) {
  const rows = Object.entries(obj).filter(([, m]) => m.total).slice(0, max);
  return `<div class="pkcard"><table class="tbl htb"><tr><th>Mercado</th><th>Picks</th><th>Acierto</th><th>ROI</th></tr>
    ${rows.map(([k, m]) => `<tr><td>${esc(k)}</td><td>${n0(m.calificados)}</td><td><b>${m.acierto != null ? m.acierto + "%" : "—"}</b></td><td>${m.roi ? `<span class="${m.roi.pct >= 0 ? "g" : "r"}">${m.roi.pct > 0 ? "+" : ""}${m.roi.pct}%</span>` : "—"}</td></tr>`).join("")}</table></div>`;
}

function filaH(r) {
  const [lab, cls] = r.st ? ESTADO[r.st] : r.rt ? ["Retirado", "nu"] : ["Pendiente", "pe"];
  const cuota = r.cu ? `${odd(r.cu)} ${r.cr ? "casa" : "justa"}` : "—";
  return `<div class="hr ${cls}"><div class="h1"><span class="st ${cls}">${lab}</span><span class="lg">${esc(r.lg || "")}</span><span class="tm">${hora2(r.at)}</span></div>
    <div class="h2">${esc(r.pt || "")}</div>
    <div class="h3"><b>${esc(r.sel || "")}</b><span>${esc(r.mk)}</span></div>
    <div class="h4"><span>Prob. <b>${Math.round(r.p * 100)}%</b></span><span>Cuota <b>${cuota}</b></span>${r.r != null ? `<span>Final <b>${esc(String(r.r))}</b></span>` : ""}</div>
    <div class="h5">${r.pub ? `Publicado ${new Date(r.pub).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : "Anotado antes del sello"}${r.md ? ` · ${esc(r.md)}${r.v ? " @" + esc(r.v) : ""}` : ""}${r.mo ? ` · ${esc(r.mo)}` : ""} · huella ${esc(r.h)}</div></div>`;
}

function historial() {
  if (!HIST) { cargarHist(); return header("Historial", "Cargando el registro…") + `<div class="empty">Cargando…</div>`; }
  if (HIST.error) return header("Historial", "") + `<div class="empty">No se pudo cargar el historial. Revisa tu conexión.</div>`;
  const H = HIST, s = H.sello;
  let f = H.filas;
  if (ui.hdep !== "todos") f = f.filter((r) => r.d === ui.hdep);
  if (ui.hmk !== "todos") f = f.filter((r) => r.mk === ui.hmk);
  if (ui.hdia !== "todos") {
    const loc = (iso) => new Date(iso).toLocaleDateString("en-CA"), hoy = new Date();
    const dd = (n) => { const x = new Date(hoy); x.setDate(x.getDate() - n); return x.toLocaleDateString("en-CA"); };
    if (ui.hdia === "hoy") f = f.filter((r) => loc(r.at) === dd(0));
    else if (ui.hdia === "ayer") f = f.filter((r) => loc(r.at) === dd(1));
    else if (ui.hdia === "7") f = f.filter((r) => loc(r.at) >= dd(7) && loc(r.at) <= dd(0));
    else if (ui.hdia === "prox") f = f.filter((r) => loc(r.at) > dd(0));
  }
  if (ui.hst === "pend") f = f.filter((r) => !r.st && !r.rt);
  else if (ui.hst === "ret") f = f.filter((r) => r.st === "retirado" || (!r.st && r.rt));
  else if (ui.hst !== "todos") f = f.filter((r) => r.st === ui.hst);
  else f = f.filter((r) => r.st || !r.rt);
  const total = f.length;
  f = f.slice(0, ui.hn);
  let dia = "", lista = "";
  for (const r of f) {
    const d = new Date(r.at).toLocaleDateString("en-CA");   // día local, no UTC
    if (d !== dia) { dia = d; lista += `<div class="hd">${esc(diaLargo(r.at))}</div>`; }
    lista += filaH(r);
  }
  const chip = (grp, k, l) => `<button class="${ui[grp] === k ? "on" : ""}" data-act="${grp}" data-k="${k}">${l}</button>`;
  return header("Historial", `Registro inalterable · ${n0(H.global.total)} picks`) + `
    <div class="hsello">${ic("shield")}<div><b>Registro sellado</b><span>${n0(s.n)} anotaciones encadenadas · huella ${esc(s.h.slice(0, 16))}…</span>
      <span>Último sello ${new Date(s.t).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · anclado en Bitcoin con OpenTimestamps</span>
      <a href="https://github.com/cashbetapp/cashbetapp.github.io/tree/sellos" target="_blank" rel="noopener">Cómo verificarlo ${ic("right")}</a></div></div>
    <div class="small" style="margin:10px 2px 0">Cada pick se anota con fecha y hora <b>antes</b> de empezar el partido y nunca se edita ni se borra. Los fallos se quedan. El ROI solo se calcula con cuotas reales de casas de apuestas.</div>
    <div class="sec"><h2>Rendimiento real</h2></div>${kpis(H.global)}
    <div class="sec"><h2>Dijimos vs. pasó</h2></div>${calibracion(H.confianza)}
    <div class="sec"><h2>Por deporte</h2></div>${tablaM(Object.fromEntries(Object.entries(H.deporte).map(([k, v]) => [k === "nba" ? "NBA" : "Fútbol", v])))}
    <div class="sec"><h2>Por mercado</h2></div>${tablaM(H.mercado)}
    <div class="sec"><h2>Todos los picks</h2></div>
    <div class="hchips">${chip("hst", "todos", "Todos")}${chip("hst", "acierto", "Aciertos")}${chip("hst", "fallo", "Fallos")}${chip("hst", "pend", "Pendientes")}${chip("hst", "nulo", "Nulos")}${chip("hst", "push", "Push")}${chip("hst", "ret", "Retirados")}</div>
    <div class="hchips">${chip("hdia", "todos", "Todas las fechas")}${chip("hdia", "hoy", "Hoy")}${chip("hdia", "ayer", "Ayer")}${chip("hdia", "7", "Últimos 7 días")}${chip("hdia", "prox", "Próximos")}</div>
    <div class="hchips">${chip("hdep", "todos", "Todos los deportes")}${chip("hdep", "futbol", "Fútbol")}${chip("hdep", "nba", "NBA")}</div>
    <div class="hchips">${chip("hmk", "todos", "Todos los mercados")}${Object.keys(H.mercado).map((k) => chip("hmk", k, esc(k))).join("")}</div>
    <div class="small" style="margin:4px 2px 8px">${n0(total)} picks de los últimos 14 días${ui.hst === "todos" ? " (sin retirados)" : ""}. El registro completo está en <a href="data/ledger.json" target="_blank">ledger.json</a>.</div>
    ${lista || `<div class="empty">No hay picks con este filtro.</div>`}
    ${total > ui.hn ? `<button class="bigbtn" data-act="hmore" style="margin-top:12px">Ver más (${n0(total - ui.hn)})</button>` : ""}`;
}

function actHist(a, el) {
  const k = el.dataset.k;
  if (a === "hst" || a === "hdep" || a === "hmk" || a === "hdia") { ui[a] = k; ui.hn = 60; rerender(); return true; }
  if (a === "hmore") { ui.hn += 100; rerender(); return true; }
  return false;
}
