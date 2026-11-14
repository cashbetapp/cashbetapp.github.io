// CASHBET · Historial (solo admin): registro inalterable de todos los picks (aciertos y fallos)
let HIST = null, HIST_CARGANDO = false, HIST_ERR = null;
ui.hst = "todos"; ui.hdep = "todos"; ui.hn = 60; ui.hmk = "todos"; ui.hdia = "todos";

// historial completo: PRIVADO en Firebase (privado/historial), solo lo puede leer la cuenta admin.
// Los demás reciben data/estados.json: el resultado de cada pick (para Seguidos y avisos) y las métricas agregadas.
async function leerPrivado(n) {
  await fb();
  const col = FB.db.collection("privado"), meta = (await col.doc(n).get()).data();
  if (!meta) throw new Error("vacío");
  const partes = await Promise.all(Array.from({ length: meta.n }, (_, i) => col.doc(`${n}-${meta.ver}-${i}`).get()));
  const bin = Uint8Array.from(atob(partes.map((p) => p.data().z).join("")), (c) => c.charCodeAt(0));
  const txt = await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  return { txt, t: meta.t };
}
async function cargarHist() {
  if (HIST || HIST_CARGANDO) return;
  HIST_CARGANDO = true;
  try {
    if (typeof esAdmin === "function" && esAdmin()) {
      try { HIST = JSON.parse((await leerPrivado("historial")).txt); HIST.priv = true; }
      catch (e) { console.warn("historial privado", e); HIST = null; HIST_ERR = /permission|insufficient/i.test(String(e && (e.code || e.message))) ? "reglas" : "red"; }
    }
    if (!HIST) HIST = await (await fetch("data/estados.json?t=" + Date.now(), { cache: "no-store" })).json();
  } catch (e) { HIST = { error: true }; }
  HIST_CARGANDO = false;
  if (/^#(historial|seguidos|notificaciones|errores|inicio|picks)?$|^#(historial|seguidos|notificaciones|errores|picks)/.test(location.hash)) { $("#app").dataset.tab = ""; route(); }
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

// Resumen del día (como el panel de CamiloRey): chips de día, cifras del día elegido,
// gráfica de los últimos 14 días y la lista. "Salieron en la app" = picks que la app mostró
// (los ocultos por validación se anotan en el registro pero no se ven).
ui.hrv = "app"; ui.hrd = null; ui.hrall = false;
const diaLoc = (x) => new Date(x).toLocaleDateString("en-CA");
const diaN = (k, o) => new Date(k + "T12:00:00").toLocaleDateString("es-CO", o).replace(/\.$/, "");
function sumaDia(l) {
  const done = l.filter((r) => r.st === "acierto" || r.st === "fallo"), hit = done.filter((r) => r.st === "acierto").length;
  const casa = done.filter((r) => r.cr && r.cu), u = casa.reduce((t, r) => t + (r.st === "acierto" ? r.cu - 1 : -1), 0);
  return { n: done.length, hit, miss: done.length - hit, pend: l.filter((r) => !r.st).length, nul: l.filter((r) => r.st === "push" || r.st === "nulo").length,
    pct: done.length ? Math.round((1000 * hit) / done.length) / 10 : null, u: Math.round(u * 100) / 100, nc: casa.length };
}
function resumenDia(H) {
  let base = H.filas.filter((r) => !r.rt && r.st !== "retirado");
  if (ui.hrv === "app") base = base.filter((r) => r.vs);
  const hoy = diaLoc(Date.now()), by = new Map();
  for (const r of base) { const k = diaLoc(r.at); if (k > hoy) continue; if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
  const keys = [...by.keys()].sort().reverse();
  if (!ui.hrd || (!by.has(ui.hrd) && ui.hrd !== hoy)) ui.hrd = by.has(hoy) || !keys.length ? hoy : keys[0];
  const sel = ui.hrd, list = (by.get(sel) || []).slice().sort((a, b) => (a.at < b.at ? -1 : 1)), s = sumaDia(list);
  const cls = (p) => (p == null ? "" : p >= 70 ? "g" : p < 55 ? "r" : "");
  const ut = (u) => (u > 0 ? "+" : "") + String(u).replace(".", ",");
  const banda = (lo, hi) => sumaDia(list.filter((r) => r.p >= lo && r.p < hi));
  const b74 = banda(0.74, 2), b70 = banda(0.70, 0.74), bm = banda(0, 0.70);
  const chips = [hoy, ...keys.filter((k) => k !== hoy)].slice(0, 7)
    .map((k) => `<button class="${k === sel ? "on" : ""}" data-act="hrd" data-k="${k}">${k === hoy ? "Hoy" : esc(diaN(k, { weekday: "short", day: "numeric", month: "short" }))}</button>`).join("");
  const dias = keys.slice(0, 14).reverse(), max = Math.max(1, ...dias.map((k) => sumaDia(by.get(k)).n));
  const graf = dias.length ? `<div class="pkcard hdc"><div class="hdch"><span>Últimos días</span><span><i class="g"></i>Aciertos <i class="r"></i>Fallos</span></div>
    <div class="hdcs"><div class="hdcg" style="min-width:${dias.length * 46}px">${dias.map((k) => { const d = sumaDia(by.get(k));
      return `<button class="hdcc ${k === sel ? "on" : ""}" data-act="hrd" data-k="${k}"><span class="p ${cls(d.pct)}">${d.pct == null ? "—" : Math.round(d.pct) + "%"}</span>
        <span class="b"><i class="h" style="height:${(d.hit / max) * 110}px"></i><i class="m" style="height:${(d.miss / max) * 110}px"></i></span>
        <span class="d">${esc(diaN(k, { weekday: "short" }))}</span><span class="f">${esc(diaN(k, { day: "2-digit", month: "2-digit" }))}</span></button>`; }).join("")}</div></div></div>` : "";
  const ESTR = { acierto: ["Acierto", "g"], fallo: ["Fallo", "r"], push: ["Push", ""], nulo: ["Nulo", ""] };
  const CORTO = 10, vis = ui.hrall ? list : list.slice(0, CORTO);
  const tabla = list.length ? `<div class="pkcard hdt"><table class="tbl"><tr><th>Hora</th><th>Partido · pick</th><th>Cuota</th><th>Resultado</th></tr>
    ${vis.map((r) => { const [t, c] = ESTR[r.st] || ["Pendiente", ""];
      return `<tr><td>${hora2(r.at)}</td><td><b>${esc(r.sel || "")}</b> <span class="hpc">${Math.round(r.p * 100)}%</span><small>${esc(r.pt || "")} · ${esc(r.lg || "")} · ${esc(r.mk || "")}</small></td>
        <td>${r.cu ? odd(r.cu) : "—"}<small>${r.cu ? (r.cr ? "casa" : "justa") : ""}</small></td><td class="${c}"><b>${t}</b>${r.r != null ? `<small>${esc(String(r.r))}</small>` : ""}</td></tr>`; }).join("")}</table></div>
    ${list.length > CORTO ? `<button class="bigbtn" data-act="hrall" style="margin-top:8px">${ui.hrall ? "Ocultar" : `Mostrar más (${list.length - CORTO})`}</button>` : ""}`
    : `<div class="empty" style="padding:24px 10px">Todavía no hay picks ${ui.hrv === "app" ? "que hayan salido en la app " : ""}este día.</div>`;
  const vd = H.vis_desde;
  const aviso = ui.hrv !== "app" ? "" : !vd ? `<div class="small" style="margin:8px 2px 0">La marca "salió en la app" empieza a guardarse desde la próxima corrida del robot. Para días anteriores toca <b>Todos los anotados</b>.</div>`
    : sel < diaLoc(vd) ? `<div class="small" style="margin:8px 2px 0">Antes del ${esc(diaN(diaLoc(vd), { day: "numeric", month: "long" }))} no se guardaba qué picks salían en la app. Para ese día toca <b>Todos los anotados</b>.</div>` : "";
  const chip = (k, l) => `<button class="${ui.hrv === k ? "on" : ""}" data-act="hrv" data-k="${k}">${l}</button>`;
  return `<div class="sec"><h2>Resumen del día</h2></div>
    <div class="hchips">${chip("app", "Salieron en la app")}${chip("todos", "Todos los anotados")}</div>
    <div class="hchips">${chips}</div>${aviso}
    <div class="pkcard hdr"><div class="hdt1">${esc(diaN(sel, { weekday: "long", day: "numeric", month: "long", year: "numeric" }))}</div>
      <div class="hk h3c"><div><span>Efectividad</span><b class="${cls(s.pct)}">${s.pct != null ? s.pct + "%" : "—"}</b><small>${s.n} jugados${s.pend ? ` · ${s.pend} pendientes` : ""}</small></div>
        <div><span>Aciertos</span><b class="g">${s.hit}</b><small>ganados</small></div>
        <div><span>Fallos</span><b class="r">${s.miss}</b><small>perdidos${s.nul ? ` · ${s.nul} push/nulos` : ""}</small></div></div>
      <div class="hk h3c" style="margin-top:8px"><div><span>Unidades</span><b class="${s.u > 0 ? "g" : s.u < 0 ? "r" : ""}">${s.nc ? ut(s.u) : "—"}</b><small>1 u a cada pick con cuota de casa (${s.nc})</small></div>
        <div><span>74 % o más</span><b>${b74.pct != null ? b74.pct + "%" : "—"}</b><small>${b74.hit} de ${b74.n}</small></div>
        <div><span>70–73 %</span><b>${b70.pct != null ? b70.pct + "%" : "—"}</b><small>${b70.hit} de ${b70.n}</small></div></div>
      ${bm.n ? `<div class="small" style="margin-top:8px">Menos de 70 %: ${bm.hit} de ${bm.n} (${bm.pct}%).</div>` : ""}</div>
    ${graf}${tabla}`;
}

function historial() {
  if (HIST && !HIST.priv && !HIST_CARGANDO && !HIST_ERR) HIST = null;   // se cargó el resumen público antes de iniciar sesión
  if (!HIST) { cargarHist(); return header("Historial", "Cargando el registro…") + `<div class="empty">Cargando…</div>`; }
  if (HIST.error) return header("Historial", "") + `<div class="empty">No se pudo cargar el historial. Revisa tu conexión.</div>`;
  if (!HIST.priv) return header("Historial", "Solo admin") + `<div class="empty">${HIST_ERR === "reglas" ? "Firebase todavía no deja leer el historial privado: falta pegar las reglas nuevas en Firestore (Reglas)." : "No se pudo leer el historial privado. Revisa tu conexión y vuelve a intentar."}</div><button class="bigbtn" data-act="hreint">Reintentar</button>`;
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
    ${resumenDia(H)}
    <div class="sec"><h2>Rendimiento real</h2></div>${kpis(H.global)}
    ${H.respaldados && H.respaldados.total ? `<div class="sec"><h2>Respaldados (estadística + mercado)</h2></div>${kpis(H.respaldados)}` : ""}
    <div class="sec"><h2>Dijimos vs. pasó</h2></div>${calibracion(H.confianza)}
    <div class="sec"><h2>Por deporte</h2></div>${tablaM(Object.fromEntries(Object.entries(H.deporte).map(([k, v]) => [k === "nba" ? "NBA" : "Fútbol", v])))}
    <div class="sec"><h2>Por mercado</h2></div>${tablaM(H.mercado)}
    <div class="sec"><h2>Todos los picks</h2></div>
    <div class="hchips">${chip("hst", "todos", "Todos")}${chip("hst", "acierto", "Aciertos")}${chip("hst", "fallo", "Fallos")}${chip("hst", "pend", "Pendientes")}${chip("hst", "nulo", "Nulos")}${chip("hst", "push", "Push")}${chip("hst", "ret", "Retirados")}</div>
    <div class="hchips">${chip("hdia", "todos", "Todas las fechas")}${chip("hdia", "hoy", "Hoy")}${chip("hdia", "ayer", "Ayer")}${chip("hdia", "7", "Últimos 7 días")}${chip("hdia", "prox", "Próximos")}</div>
    <div class="hchips">${chip("hdep", "todos", "Todos los deportes")}${chip("hdep", "futbol", "Fútbol")}${chip("hdep", "nba", "NBA")}</div>
    <div class="hchips">${chip("hmk", "todos", "Todos los mercados")}${Object.keys(H.mercado).map((k) => chip("hmk", k, esc(k))).join("")}</div>
    <div class="small" style="margin:4px 2px 8px">${n0(total)} picks de los últimos 14 días${ui.hst === "todos" ? " (sin retirados)" : ""}. Historial privado: solo lo ve esta cuenta. <button class="hlink" data-act="hledger">Descargar el registro completo (ledger.json)</button></div>
    ${lista || `<div class="empty">No hay picks con este filtro.</div>`}
    ${total > ui.hn ? `<button class="bigbtn" data-act="hmore" style="margin-top:12px">Ver más (${n0(total - ui.hn)})</button>` : ""}`;
}

function actHist(a, el) {
  const k = el.dataset.k;
  if (a === "hst" || a === "hdep" || a === "hmk" || a === "hdia") { ui[a] = k; ui.hn = 60; rerender(); return true; }
  if (a === "hrv" || a === "hrd") { ui[a] = k; ui.hrall = false; rerender(); setTimeout(centrarDia, 0); return true; }
  if (a === "hrall") { ui.hrall = !ui.hrall; rerender(); return true; }
  if (a === "hmore") { ui.hn += 100; rerender(); return true; }
  if (a === "hreint") { HIST = null; HIST_ERR = null; rerender(); return true; }
  if (a === "hledger") {
    toast("Preparando el registro…");
    leerPrivado("ledger").then(({ txt }) => { const u = URL.createObjectURL(new Blob([txt], { type: "application/json" })), l = document.createElement("a");
      l.href = u; l.download = "ledger.json"; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 5000); })
      .catch(() => toast("No se pudo descargar el registro"));
    return true;
  }
  return false;
}

// la gráfica se centra en el día elegido
function centrarDia() {
  const sc = document.querySelector(".hdcs"), on = sc && sc.querySelector(".hdcc.on");
  if (sc) sc.scrollLeft = on ? on.offsetLeft - sc.clientWidth / 2 + on.clientWidth / 2 : sc.scrollWidth;
}
