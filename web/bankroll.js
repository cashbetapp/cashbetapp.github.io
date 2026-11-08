// CASHBET · Bankroll con criterio de Kelly (como CamiloRey), AUTOMÁTICO sobre los picks que sigues.
// f* = (b·p − q) / b, con p = acierto REAL del modelo en esa franja de probabilidad (registro sellado)
// y b = cuota − 1; se multiplica por el nivel de riesgo y se limita al 10 % de la banca por apuesta.
const RISK = { seguro: ["Seguro", "¼ Kelly", 0.25], equilibrado: ["Equilibrado", "½ Kelly", 0.5], agresivo: ["Agresivo", "Kelly completo", 1] };
const KELLY_CAP = 0.1;
const MONEDAS = { COP: ["Peso colombiano", 100, "$"], USD: ["Dólar", 0.5, "US$"], MXN: ["Peso mexicano", 1, "MX$"], EUR: ["Euro", 0.5, "€"],
  PEN: ["Sol peruano", 0.5, "S/ "], CLP: ["Peso chileno", 100, "CLP$"], ARS: ["Peso argentino", 10, "AR$"], VES: ["Bolívar", 1, "Bs "] };
const kSet = () => store.get("kelly", null);
const kCur = () => (MONEDAS[(kSet() || {}).cur] ? kSet().cur : "COP");
const kRound = (n) => { const st = MONEDAS[kCur()][1]; return Math.round(Math.round(n / st) * st * 100) / 100; };
function plata(n) {
  const [, st, sym] = MONEDAS[kCur()], dec = st < 1 ? 2 : 0;
  return sym + new Intl.NumberFormat("es-CO", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(dec ? n || 0 : Math.round(n || 0));
}
const plataS = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + plata(Math.abs(n));
// un pick seguido ya no se puede quitar cuando empezó el partido (queda en Seguidos y en el Bankroll)
const puedeQuitar = (v) => !v || new Date(v.at).getTime() > Date.now();

// acierto real del modelo en la franja de esa probabilidad (si hay suficientes picks calificados)
function probReal(p) {
  const C = (HIST && HIST.confianza) || {};
  for (const [k, m] of Object.entries(C)) {
    const [lo, hi] = k.replace("%", "").split("-").map(Number);
    if (p * 100 >= lo && p * 100 < (hi === 100 ? 101 : hi) && m.calificados >= 30 && m.acierto != null) return m.acierto / 100;
  }
  return p;
}
// cuota con la que se calcula: la de la casa si la hay; si no, la mínima que vale la pena ("vale desde")
const cuotaKelly = (v) => v.oc || (v.cuota ? Math.round(v.cuota * 1.05 * 100) / 100 : 0);
function kellyF(p, o, m) {
  if (!o || o <= 1) return 0;
  const b = o - 1, pr = probReal(p), f = (b * pr - (1 - pr)) / b;
  return Math.max(0, Math.min(KELLY_CAP, f * m));
}

function simBanca() {
  const s = kSet(); if (!s || !s.start) return null;
  const m = (RISK[s.risk] || RISK.equilibrado)[2];
  const seg = store.get("seg", {});
  const items = Object.entries(seg).map(([id, v]) => ({ id, v, e: typeof estadoSeguido === "function" ? estadoSeguido(id, v) : {} }))
    .sort((a, b) => new Date(a.v.at) - new Date(b.v.at));
  let bal = s.start, peak = bal, dd = 0, staked = 0, bets = 0, hits = 0;
  const rows = [], pend = [], serie = [{ t: s.desde || null, b: bal }];
  for (const it of items) {
    const o = cuotaKelly(it.v), f = kellyF(it.v.p || 0, o, m);
    const st = it.e.st;
    if (st === "acierto" || st === "fallo" || st === "push" || st === "nulo") {
      const stake = kRound(bal * f);
      if (!stake) { rows.push({ it, o, stake: 0, profit: 0, bal, skip: true }); continue; }
      const profit = st === "acierto" ? kRound(stake * (o - 1)) : st === "fallo" ? -stake : 0;
      bal += profit;
      if (st === "acierto" || st === "fallo") { staked += stake; bets++; if (st === "acierto") hits++; }
      peak = Math.max(peak, bal); dd = Math.max(dd, peak - bal);
      rows.push({ it, o, stake, profit, bal, f });
      serie.push({ t: it.v.at, b: bal });
    } else pend.push({ it, o, f, stake: kRound(bal * f) });
  }
  return { s, m, bal, profit: bal - s.start, staked, roi: staked ? Math.round(((bal - s.start) / staked) * 1000) / 10 : null, bets, hits, dd, rows: rows.reverse(), pend, serie };
}

function grafBanca(serie, ini) {
  if (serie.length < 2) return "";
  const W = 320, H = 110, vs = serie.map((x) => x.b), lo = Math.min(...vs, ini), hi = Math.max(...vs, ini), sp = hi - lo || 1;
  const pt = (i, v) => `${(i / (serie.length - 1)) * W},${H - ((v - lo) / sp) * (H - 10) - 5}`;
  const line = serie.map((x, i) => pt(i, x.b)).join(" "), up = vs[vs.length - 1] >= ini;
  return `<svg class="kchart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><line x1="0" x2="${W}" y1="${H - ((ini - lo) / sp) * (H - 10) - 5}" y2="${H - ((ini - lo) / sp) * (H - 10) - 5}" class="kbase"/>
    <polyline points="${line}" class="${up ? "kup" : "kdn"}"/></svg>`;
}

function kAjustes() {
  const s = kSet() || { start: "", risk: "equilibrado", cur: "COP" };
  return `<div class="pkcard kset"><label class="lbl">Moneda con la que apuestas</label>
    <select class="inp" id="kcur">${Object.entries(MONEDAS).map(([k, [n]]) => `<option value="${k}" ${kCur() === k ? "selected" : ""}>${n} (${k})</option>`).join("")}</select>
    <label class="lbl">Banca inicial</label><input class="inp" id="kstart" inputmode="decimal" placeholder="${kCur() === "COP" ? "Ej: 500000" : "Ej: 100"}" value="${s.start || ""}">
    <label class="lbl">Nivel de riesgo</label>
    <div class="kriesgo">${Object.entries(RISK).map(([k, [l, sub]]) => `<button class="${(s.risk || "equilibrado") === k ? "on" : ""}" data-act="krisk" data-k="${k}"><b>${l}</b><small>${sub}</small></button>`).join("")}</div>
    <button class="bigbtn" data-act="ksave" style="margin-top:12px">Guardar</button></div>`;
}

function bankroll() {
  if (!HIST && typeof cargarHist === "function") cargarHist().then(() => { if (location.hash.startsWith("#bankroll")) { $("#app").dataset.tab = ""; route(); } });
  const u = simBanca();
  const top = header("Bankroll", "Kelly sobre los picks que sigues");
  if (!u) return top + `<div class="pkvale">${ic("info")}<span>Escribe tu banca inicial para empezar. Después sigue picks con el corazón: el Bankroll calcula solo cuánto apostar en cada uno y se ajusta con cada resultado.</span></div>` + kAjustes();
  const R = RISK[u.s.risk] || RISK.equilibrado;
  const pend = u.pend.filter((x) => new Date(x.it.v.at).getTime() > Date.now() - 3 * 3600e3);
  const fila = (x, hist) => {
    const v = x.it.v, cls = hist ? (x.profit > 0 ? "ok" : x.profit < 0 ? "no" : "nu") : "pe";
    const der = hist ? `<span class="kamt ${cls}">${x.skip ? "—" : plataS(x.profit)}<small>${plata(x.bal)}</small></span>`
      : x.f ? `<span class="kamt">${plata(x.stake)}<small>${(x.f * 100).toFixed(1).replace(".", ",")}% · gana ${plata(x.stake * (x.o - 1))}</small></span>`
      : `<span class="kamt nu">No apostar<small>la cuota no paga el riesgo</small></span>`;
    const est = hist ? (x.it.e.st === "acierto" ? ic("check") : x.it.e.st === "fallo" ? ic("x") : "") : "";
    return `<div class="krow ${cls}"><span class="kic ${cls}">${est || ic("clock")}</span><div class="kwho"><b>${esc(v.pill || v.txt || "")}</b><small>${esc(v.nom || `${v.h} vs ${v.a}`)} · ${pct(v.p)} · cuota ${odd(x.o)}${hist && x.skip ? " · no se apostó" : hist ? ` · ${plata(x.stake)}` : ""}</small></div>${der}</div>`;
  };
  return top + `
    <div class="khero"><small>MI BANCA ACTUAL</small><b>${plata(u.bal)}</b><span class="${u.profit >= 0 ? "g" : "r"}">${plataS(u.profit)} · ROI ${u.roi != null ? (u.roi > 0 ? "+" : "") + u.roi + "%" : "—"}</span>
      <em>Inició con ${plata(u.s.start)} · ${R[0]} (${R[1]})</em>${grafBanca(u.serie, u.s.start)}</div>
    <div class="tiles t2"><div class="tile"><div class="k">Apuestas</div><div class="v">${u.bets}<small>${u.hits} ganadas</small></div></div>
      <div class="tile"><div class="k">Efectividad</div><div class="v">${u.bets ? Math.round((100 * u.hits) / u.bets) + "%" : "—"}</div></div>
      <div class="tile"><div class="k">Máx. caída</div><div class="v">${u.dd ? "−" + plata(u.dd) : "—"}</div></div></div>
    <div class="sec"><h2 class="ih">${ic("clock")}Por apostar</h2><span class="cntb">${pend.length}</span></div>
    ${pend.length ? pend.map((x) => fila(x, false)).join("") : `<div class="pkcard"><div class="small">No tienes picks seguidos por jugar. Toca <b>Seguir Predicción</b> en cualquier pick y aquí sale cuánto apostar.</div></div>`}
    <div class="sec"><h2 class="ih">${ic("chart")}Mi historial</h2><span class="cntb">${u.rows.length}</span></div>
    ${u.rows.length ? u.rows.slice(0, 60).map((x) => fila(x, true)).join("") : `<div class="pkcard"><div class="small">Cuando terminen los partidos que sigues, aquí ves cuánto ganaste o perdiste en cada uno.</div></div>`}
    <details class="kdet"><summary>${ic("pen")}Cambiar banca, moneda o riesgo</summary>${kAjustes()}</details>
    <div class="pkvale">${ic("info")}<span><b>Criterio de Kelly:</b> calcula qué parte de tu banca apostar según la probabilidad y la cuota. Usa el <b>acierto real</b> del modelo en picks con esa probabilidad (del Historial). Si no tenemos la cuota de la casa, calcula con la cuota mínima que vale la pena ("vale desde"): apuesta solo si tu casa paga eso o más. Si la cuota no paga el riesgo, sale <b>No apostar</b>. Tope: 10% de la banca por apuesta. Cuando un partido empieza, ese pick ya no se puede quitar de Seguidos. Es una simulación; apuesta con responsabilidad.</span></div>`;
}

function actBank(a, el) {
  if (a === "krisk") { document.querySelectorAll(".kriesgo button").forEach((b) => b.classList.toggle("on", b === el)); return true; }
  if (a === "ksave") {
    const cur = $("#kcur").value, step = MONEDAS[cur][1];
    const raw = String($("#kstart").value || "");
    const start = step >= 1 ? Number(raw.replace(/\D/g, "")) : Number(raw.replace(/[^\d.,]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
    if (!(start > 0)) { toast("Escribe tu banca inicial"); return true; }
    const risk = (document.querySelector(".kriesgo button.on") || {}).dataset?.k || "equilibrado";
    const prev = kSet() || {};
    store.set("kelly", { start, risk, cur, desde: prev.desde || new Date().toISOString() });
    toast("Bankroll guardado"); rerender(); return true;
  }
  return false;
}
