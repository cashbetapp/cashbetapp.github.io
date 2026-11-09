// CASHBET · ficha del pick de JUGADOR NBA igual que IABET: foto, píldora, barra, Seguir y
// Resumen / Contexto / Análisis IA (gráfico 5/10/20G, splits, rival, descanso, minutos, Monte Carlo).
const ppId = (x) => `pr|${x.ev}_${x.pl}_${x.t}_${x.linea}`;
function ppSerie(x) {
  return (x.hist || []).map(([v, vs, l, at, mn]) => ({ v, vs, l: !!l, at, mn }));
}
const ppHit = (x, v) => (x.lado === "mas" ? v > x.linea : v < x.linea);
// ¿el jugador juega de local? (el equipo del jugador se compara por sigla o nombre)
const ppCasa = (x, g) => (g && x.eq ? g.h.ab === x.eq.ab || g.h.n === x.eq.n : null);

function openProp(i, keep) {
  const x = D.props[i]; if (!x) return;
  if (!keep || sheetState.pp !== i) sheetState = { pp: i, n: 10, tab: "resumen" };
  const g = D.byId[x.ev], up = x.lado === "mas", tab = sheetState.tab, seg = store.get("seg", {}), sid = ppId(x);
  const eq = x.eq || { n: x.equipo }, rival = g ? (ppCasa(x, g) ? g.a : g.h) : null;
  const pill = `${up ? "Más" : "Menos"} de ${x.linea} ${x.tipo.toLowerCase()}`;
  const big = x.foto ? `<img class="pkbig foto" src="${esc(x.foto)}" alt="">` : sinFoto(x.jugador, eq, 130, "pkbig");
  const html = `<div class="pkh"><div class="pkl">
      <div class="pkt"><span class="pkmini">${crest(eq, 30)}</span><h3>${esc(x.jugador)}</h3></div>
      <div class="pkm">${esc(x.partido || "")} · ${cuando(x.at)}${g && g.ven ? `<br>${ic("pin")}${esc(g.ven)}${g.city ? `, ${esc(g.city)}` : ""}` : ""}</div>
      <span class="pkpill ${up ? "" : "bad"}">${ic(up ? "up" : "down")}<span>${esc(pill)}</span></span>
      <div class="pkprog ${x.p >= 0.7 ? "hi" : ""}"><span><i style="width:${x.p * 100}%"></i></span><b>${pct(x.p)}</b></div></div>${big}</div>
    <button class="pkseg ${seg[sid] ? "on" : ""}" data-act="ppfollow">${ic(seg[sid] ? "check" : "heart")}${seg[sid] ? "Siguiendo" : "Seguir Predicción"}</button>
    <div class="pktabs">${[["resumen", "Resumen"], ["contexto", "Contexto"], ["analisis", "Análisis IA"]].map(([k, l]) => `<button class="${tab === k ? "on" : ""}" data-act="pptab" data-k="${k}">${l}</button>`).join("")}</div>
    ${tab === "resumen" ? ppResumen(x, g) : tab === "contexto" ? ppContexto(x, g, rival) : ppAnalisis(x, g, rival)}`;
  const cur = $(".sheet.on");
  if (keep && cur) { const y = cur.scrollTop; cur.innerHTML = `<div class="grab"></div><button class="x" data-act="close" aria-label="Cerrar">${ic("x")}</button>` + html; cur.scrollTop = y; }
  else { openSheet(html); $(".sheet").classList.add("pk"); }
}

function ppChart(x, vals) {
  const H = 150, mx = Math.max(x.linea * 1.25, ...vals.map((e) => e.v), 1) * 1.08;
  return `<div class="pkchart"><div class="pkleg"><span><i class="ok"></i>Acierto</span><span><i class="no"></i>Fallo</span><span class="ln"><u></u>Línea</span></div>
    <div class="pkmu">Muestra: ${vals.length} partidos</div>
    <div class="pkbars" style="height:${H}px">${vals.map((e) => { const h = Math.max((e.v / mx) * H, 5), ok = ppHit(x, e.v);
      return `<div class="c"><em class="${ok ? "ok" : "no"}" style="bottom:${h + 4}px">${n1(e.v)}</em><i class="${ok ? "ok" : "no"}" style="height:${h}px"></i></div>`; }).join("")}
      <div class="lnl" style="bottom:${(x.linea / mx) * H}px"><span>Línea ${x.linea}</span></div></div>
    <div class="pkvs">${vals.map((e) => `<div><span>${e.l ? "" : "@"}${esc(e.vs || "")}</span></div>`).join("")}</div>
    <div class="pkfoot"><span>Reciente ${ic("left")}</span><span>Antiguo</span></div></div>`;
}

function ppResumen(x, g) {
  const all = ppSerie(x), n = sheetState.n, vals = all.slice(0, n), hits = vals.filter((e) => ppHit(x, e.v)).length, vs = vals.map((e) => e.v);
  let racha = 0; for (const e of all) { if (!ppHit(x, e.v)) break; racha++; }
  const v10 = all.slice(0, 10), h10 = v10.filter((e) => ppHit(x, e.v)).length, lc = [];
  if (racha >= 2) lc.push(["ok", `Cumplió la línea en sus últimos ${racha} partidos seguidos`]);
  else if (all.length && !ppHit(x, all[0].v)) lc.push(["warn", `No cumplió en su último partido (${all[0].v} contra ${all[0].vs})`]);
  if (v10.length) lc.push([h10 / v10.length >= 0.6 ? "ok" : "warn", `Cumplió en ${h10} de los últimos ${v10.length} · promedia ${n1(media(v10.map((e) => e.v)))} (línea ${x.linea})`]);
  const casa = ppCasa(x, g);
  if (casa != null) { const lv = all.filter((e) => e.l === casa); if (lv.length >= 3) { const hl = lv.filter((e) => ppHit(x, e.v)).length; lc.push([hl / lv.length >= 0.5 ? "ok" : "warn", `De ${casa ? "local" : "visitante"}: ${Math.round((100 * hl) / lv.length)}% de acierto en ${lv.length} partidos (promedio ${n1(media(lv.map((e) => e.v)))})`]); } }
  return `<div class="pk3">
      <div class="pkbox dir ${x.lado === "mas" ? "" : "bad"}"><div class="k">Dirección</div><b>${x.lado === "mas" ? "MÁS DE" : "MENOS DE"}</b></div>
      <div class="pkbox"><div class="k">Línea</div><b>${x.linea}</b></div>
      <div class="pkbox"><div class="k">Cuota casa</div><b>${odd(x.cuota)}</b></div></div>
    <div class="pkvale ${x.valor >= (D.valor_min || 0.05) ? "v" : ""}">${ic(x.valor >= (D.valor_min || 0.05) ? "bolt" : "info")}<span>${x.valor >= (D.valor_min || 0.05) ? `<b>Error de la casa:</b> paga ${odd(x.cuota)} y le damos ${pct(x.p)}: valor +${Math.round(x.valor * 100)}%.` : `<b>En prueba:</b> la casa paga ${odd(x.cuota)}; el modelo de jugadores NBA todavía no le gana a la casa en el registro real, por eso su probabilidad se mezcla con la de la casa.`}</span></div>
    <hr class="pkhr">
    ${lc.length ? `<div class="pkcard ol"><h4>Lo clave</h4><div class="small">Lo que dicen sus últimos partidos sobre el de hoy</div>${clvList(lc)}</div>` : ""}
    <div class="pkhist" style="margin-top:18px"><h4>Historial de rendimiento</h4><div class="pk5">${[5, 10, 20].map((k) => `<button class="${n === k ? "on" : ""}" data-act="ppn" data-k="${k}">${k}G</button>`).join("")}</div></div>
    ${vals.length ? ppChart(x, vals) : `<div class="empty">Sin partidos anteriores.</div>`}
    <div class="pk2">
      <div class="pkbox l ol"><div class="k">Tasa de acierto</div><b class="g">${hits}/${vals.length}</b><span>${vals.length ? Math.round((100 * hits) / vals.length) : 0}%</span></div>
      <div class="pkbox l ol"><div class="k">Promedio · últimos ${vals.length}</div><b>${vs.length ? n1(media(vs)) : "—"}</b><span>${esc(x.tipo.toUpperCase())}</span></div>
      <div class="pkbox l ol"><div class="k">Máximo</div><b class="g">${vs.length ? Math.max(...vs) : "—"}</b><span></span></div>
      <div class="pkbox l ol"><div class="k">Mínimo</div><b>${vs.length ? Math.min(...vs) : "—"}</b><span></span></div></div>`;
}

function ppContexto(x, g, rival) {
  const all = ppSerie(x), out = [];
  if (g && typeof elPartido === "function") out.push(elPartido(g));
  const split = (lab, xs) => xs.length ? `<div class="sp"><span>${esc(lab)}</span><strong>${n1(media(xs.map((e) => e.v)))}</strong><em class="${xs.filter((e) => ppHit(x, e.v)).length / xs.length >= 0.5 ? "g" : ""}">${Math.round((100 * xs.filter((e) => ppHit(x, e.v)).length) / xs.length)}%</em><small>${xs.length} p</small></div>` : "";
  // descanso: días entre partidos
  const dia = (s) => new Date(s + "T12:00:00Z").getTime();
  const conDesc = all.map((e, i) => ({ ...e, desc: all[i + 1] ? Math.round((dia(e.at) - dia(all[i + 1].at)) / 864e5) - 1 : null }));
  const vsR = rival ? all.filter((e) => e.vs === rival.ab) : [];
  // acierto por temporada (la temporada NBA empieza en octubre)
  const temp = {}; all.forEach((e) => { const y = +e.at.slice(0, 4), m = +e.at.slice(5, 7), t = m >= 9 ? y + 1 : y; (temp[t] = temp[t] || []).push(e); });
  out.push(`<h4 class="pksub">El jugador</h4><div class="pkcard"><div class="small">ACIERTO POR TEMPORADA</div>${Object.keys(temp).sort().reverse().map((t) => { const xs = temp[t], h = xs.filter((e) => ppHit(x, e.v)).length;
    return `<div class="tmp"><div><span>${x.lado === "mas" ? "Superó" : "Quedó bajo"} ${x.linea} en ${h} de ${xs.length} partidos en ${t - 1}-${String(t).slice(2)} (prom. ${n1(media(xs.map((e) => e.v)))})</span><b class="${h / xs.length >= 0.5 ? "g" : "r"}">${Math.round((100 * h) / xs.length)}%</b></div><i><s class="${h / xs.length >= 0.5 ? "g" : "r"}" style="width:${(100 * h) / xs.length}%"></s></i></div>`; }).join("")}</div>`);
  const v10 = all.slice(0, 10);
  out.push(`<h4 class="pksub">Desglose estadístico</h4><div class="pkcard m3b"><div><b>${n1(desv(v10.map((e) => e.v)))}</b><span>DESV. EST.</span></div><div><b class="g">${v10.length ? Math.round((100 * v10.filter((e) => ppHit(x, e.v)).length) / v10.length) : 0}%</b><span>ACIERTO</span></div><div><b>${v10.length}</b><span>JUEGOS</span></div></div>`);
  out.push(`<h4 class="pksub">Splits situacionales</h4><div class="pkcard spl">${split("Local", all.filter((e) => e.l))}${split("Visitante", all.filter((e) => !e.l))}${rival ? split(`vs ${rival.ab}`, vsR) : ""}${split("Partidos consecutivos", conDesc.filter((e) => e.desc === 0))}${split("2+ días de descanso", conDesc.filter((e) => e.desc != null && e.desc >= 2))}</div>`);
  if (vsR.length) out.push(`<h4 class="pksub">Contra ${esc(rival.ab)}</h4><div class="pkcard">${vsR.slice(0, 5).map((e) => `<div class="h2r"><span>${new Date(e.at + "T12:00:00Z").toLocaleDateString("es-CO", { day: "numeric", month: "short" }).replace(".", "")}</span><b>${e.v}</b><em class="${ppHit(x, e.v) ? "g" : "r"}">${ppHit(x, e.v) ? "Acierto" : "Fallo"}</em></div>`).join("")}</div>`);
  const L = (k) => all.slice(0, k);
  out.push(`<h4 class="pksub">Tendencia reciente</h4><div class="pkcard m3b">${[7, 15, 30].map((k) => { const xs = L(k); return `<div><b>${xs.length ? n1(media(xs.map((e) => e.v))) : "—"}</b><span>L${k} · ${xs.length ? Math.round((100 * xs.filter((e) => ppHit(x, e.v)).length) / xs.length) : 0}%</span></div>`; }).join("")}</div>`);
  if (all[0]) out.push(`<h4 class="pksub">Último juego</h4><div class="pkcard"><div class="fr">${all[0].l ? "vs" : "@"} ${esc(all[0].vs || "")}<span class="d">${new Date(all[0].at + "T12:00:00Z").toLocaleDateString("es-CO", { day: "numeric", month: "short" }).replace(".", "")}</span><span class="s">${all[0].v} · ${ppHit(x, all[0].v) ? "Cumplió" : "No cumplió"}</span></div></div>`);
  const mn = (k) => { const xs = all.slice(0, k).map((e) => e.mn).filter((m) => m != null); return xs.length ? media(xs) : null; };
  const m5 = mn(5), m10 = mn(10), mt = mn(40);
  if (m5 != null) out.push(`<h4 class="pksub">Minutos</h4><div class="pkcard m3b"><div><b>${n1(m5)}</b><span>Últimos 5</span></div><div><b>${n1(m10)}</b><span>Últimos 10</span></div><div><b>${n1(mt)}</b><span>Muestra (${Math.min(all.length, 40)} p)</span></div></div>
    <div class="small" style="margin:6px 2px 0">${m5 < mt - 2 ? "Su rol baja: juega menos minutos que su promedio." : m5 > mt + 2 ? "Su rol sube: juega más minutos que su promedio." : "Juega sus minutos habituales."}</div>`);
  if (g) { const sd = ppCasa(x, g) ? "h" : "a", bj = (g.bajas?.[sd] || []);
    out.push(`<h4 class="pksub">Bajas de su equipo</h4><div class="pkcard">${bj.map((b) => `<div class="les"><b>${esc(b.n)}</b><em class="${b.s === "Out" ? "out" : "dd"}">${b.s === "Out" ? "Fuera" : esc(b.s)}</em></div>`).join("") || `<div class="small">Sin lesionados reportados.</div>`}</div>`); }
  return out.join("");
}

function ppAnalisis(x, g, rival) {
  const all = ppSerie(x), v10 = all.slice(0, 10), w = v10.map((e) => e.v), h10 = v10.filter((e) => ppHit(x, e.v)).length, avg = media(w);
  const sup = (v) => (x.lado === "mas" ? v > x.linea : v < x.linea);
  const tr = sup(media(all.slice(0, 5).map((e) => e.v))) && h10 / Math.max(v10.length, 1) >= 0.6 ? "Fuerte" : sup(avg) ? "Media" : "Débil";
  const casa = ppCasa(x, g);
  const fact = [["trend", `Tendencia: ${tr}`], ["bars2", `10J prom: ${n1(avg)}`], ...(casa != null ? [["home2", casa ? "Juega de local" : "Juega de visitante"]] : []), ["clock", `${n1(media(all.slice(0, 5).map((e) => e.mn || 0)))} min (últ. 5)`]];
  // Monte Carlo: binomial negativa con la media del modelo y la dispersión real del jugador
  const N = 100000, mu = Math.max(x.esperado || avg || 0.1, 0.1), va = Math.max(desv(all.slice(0, 15).map((e) => e.v)) ** 2, mu * 1.05);
  let seed = 0; for (const ch of x.ev + x.pl + x.t) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  const r = rngDe(seed), k = va > mu * 1.001 ? (mu * mu) / (va - mu) : 0, out = new Array(N); let ok = 0;
  for (let i = 0; i < N; i++) { const v = poisson(r, k ? (mu * gamma(r, k)) / k : mu); out[i] = v; if (ppHit(x, v)) ok++; }
  out.sort((a, b) => a - b); const q = (f) => out[Math.min(N - 1, Math.floor(f * N))];
  const mx = Math.max(q(0.95), x.linea * 1.6, 1);
  const fila = (lab, v, cls) => `<div class="mcr ${cls || ""}"><span>${lab}</span><i><s style="width:${Math.max(3, (100 * v) / mx)}%"></s><u style="left:${(100 * x.linea) / mx}%"></u></i><b>${n1(v)}</b></div>`;
  const txt = `${x.jugador} ${x.lado === "mas" ? "superó" : "se quedó por debajo de"} ${x.linea} ${x.tipo.toLowerCase()} en ${h10} de sus últimos ${v10.length} partidos, promediando ${n1(avg)}. El modelo espera ${n1(x.esperado)} hoy${rival ? ` frente a ${rival.n}` : ""}. La casa paga ${odd(x.cuota)}.`;
  return `<div class="iac"><div class="iah"><span class="iaic">${ic("bolt2")}</span><div><b>Análisis IA</b><small>Modelo CASHBET v2</small></div><em><i></i>MODELO EN VIVO</em></div>
      <div class="iaconf"><span>CONFIANZA DEL MODELO</span><b>${pct(x.p)}</b></div><div class="iabar"><s style="width:${x.p * 100}%"></s></div>
      <div class="iapk">${esc(`${x.lado === "mas" ? "MÁS" : "MENOS"} DE ${x.linea} ${x.tipo}`.toUpperCase())}</div>
      <div class="iaf"><div class="fl">FACTORES CLAVE</div><div class="chips2">${fact.map(([i, s]) => `<span>${ic(i)}${esc(s)}</span>`).join("")}</div></div>
      <p class="iatx">${esc(txt)}</p>
      <div class="ia3"><div><span>SEÑAL</span><b>${tr}</b></div><div><span>CONFIANZA</span><b>${x.p >= 0.7 ? "Alta" : x.p >= 0.58 ? "Media" : "Baja"}</b></div><div><span>MUESTRA</span><b>${v10.length} juegos</b></div></div></div>
    <div class="mcc"><div class="iah"><span class="iaic mc">${ic("pulse")}</span><div><b>Simulaciones Monte Carlo</b><small>100.000 simulaciones</small></div><em class="mc">${ic("sparkle")}CASHBET</em></div>
      <div class="mcp"><div class="fl">PROBABILIDAD DE ACERTAR</div><div class="mcpp"><span>${ic("target")}${esc(`${x.lado === "mas" ? "Más" : "Menos"} de ${x.linea}`)}</span><b>${((100 * ok) / N).toFixed(1)}%</b></div><div class="mcbar"><s style="width:${(100 * ok) / N}%"></s></div>
        <div class="mcrc">Sin mezclar con la casa (solo el modelo del jugador).</div></div>
      <div class="mcz"><div class="mch"><div><div class="fl" style="margin:0">RANGO PROYECTADO</div></div><span><u></u>OBJETIVO ${x.linea}</span></div>
        ${fila("Peor caso", q(0.05), "lo")}${fila("Rango bajo", q(0.25), "lo")}${fila("MÁS PROBABLE", q(0.5), "mp")}${fila("Rango alto", q(0.75))}${fila("Mejor caso", q(0.95))}</div></div>`;
}

function actProp(a, el) {
  if (sheetState.pp == null) return false;
  const x = D.props[sheetState.pp];
  if (a === "pptab") { sheetState.tab = el.dataset.k; openProp(sheetState.pp, true); if (typeof alTab === "function") alTab(); return true; }
  if (a === "ppn") { sheetState.n = +el.dataset.k; openProp(sheetState.pp, true); return true; }
  if (a === "ppfollow") {
    const s = store.get("seg", {}), id = ppId(x), g = D.byId[x.ev];
    if (s[id] && !puedeQuitar(s[id])) { toast("El partido ya empezó: este pick queda en tus Seguidos y en tu Bankroll"); return true; }
    if (s[id]) delete s[id];
    else s[id] = { at: x.at, liga: "NBA", lg: "nba", dep: "nba", h: g ? g.h.n : "", a: g ? g.a.n : "", hl: g ? g.h.logo : null, al: g ? g.a.logo : null, hab: g ? g.h.ab : "", aab: g ? g.a.ab : "",
      txt: `${x.jugador}: ${x.lado === "mas" ? "más" : "menos"} de ${x.linea} ${x.tipo.toLowerCase()}`, pill: `${x.lado === "mas" ? "Más" : "Menos"} de ${x.linea} ${x.tipo.toLowerCase()}`, up: x.lado === "mas",
      p: x.p, cuota: x.cuota, oc: x.cuota, tipo: "Jugador", nom: x.jugador, foto: x.foto || null, tl: x.eq ? x.eq.logo : null };
    store.set("seg", s); toast(s[id] ? "Siguiendo esta predicción" : "Dejaste de seguirla");
    openProp(sheetState.pp, true); return true;
  }
  return false;
}
