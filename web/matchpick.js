// CASHBET · ficha del PICK DE PARTIDO (ganador, hándicap, totales…) igual que la de IABET:
// escudo del equipo apostado, píldora, barra %, Seguir, Resumen / Contexto / Análisis IA y el
// historial de los últimos 5/10/20 partidos del equipo contra la línea.

function mpInfo(g) {
  const m = g.pick.m, txt = g.pick.txt;
  let side = /^(1|1X)$|^hcp_local/.test(m) ? "h" : /^(2|X2)$|^hcp_visita/.test(m) ? "a" : null;
  const num = parseFloat(m.split("_").pop());
  const I = { side, m, txt, up: isUp(m) };
  if (/^hcp/.test(m)) Object.assign(I, { kind: "hcp", ln: -num, hit: (v) => v + num > 0, dir: "HÁNDICAP", lin: (num > 0 ? "+" : "") + num, U: "dif.", tit: "Hándicap" });
  else if (/^(mas|menos)_/.test(m)) Object.assign(I, { kind: "tot", ln: num, hit: (v) => (I.up ? v > num : v < num), dir: I.up ? "MÁS DE" : "MENOS DE", lin: String(num), U: g.dep === "nba" ? "PTS" : "GOLES", tit: "Total del partido" });
  else if (/^btts/.test(m)) Object.assign(I, { kind: "btts", ln: 0.5, hit: (v) => (m === "btts_si" ? v > 0.5 : v < 0.5), dir: m === "btts_si" ? "AMBOS ANOTAN" : "NO ANOTAN AMBOS", lin: "—", U: "goles del que menos hizo", tit: "Ambos anotan" });
  else if (m === "X") Object.assign(I, { kind: "x", ln: 0, hit: (v) => v === 0, dir: "EMPATE", lin: "—", U: "dif.", tit: "Empate" });
  else if (m === "12") Object.assign(I, { kind: "12", ln: 0.5, hit: (v) => v > 0.5, dir: "NO EMPATE", lin: "—", U: "dif.", tit: "Sin empate" });
  else if (/^(1X|X2)$/.test(m)) Object.assign(I, { kind: "dob", ln: -0.5, hit: (v) => v >= 0, dir: "GANA O EMPATA", lin: "—", U: "dif.", tit: "Doble oportunidad" });
  else Object.assign(I, { kind: "gan", ln: 0, hit: (v) => v > 0, dir: "GANA", lin: "—", U: "dif.", tit: "Ganador" });
  return I;
}

// partidos anteriores del equipo con el valor que decide el pick
function mpSerie(g, I, sd) {
  return ((g.ult || g.forma || {})[sd] || []).map((r) => {
    const [pf, pa] = String(r.m || "").split("-").map(Number);
    if (!Number.isFinite(pf) || !Number.isFinite(pa)) return null;
    const v = I.kind === "tot" ? pf + pa : I.kind === "btts" ? Math.min(pf, pa) : I.kind === "12" ? Math.abs(pf - pa) : pf - pa;
    return { v, vs: r.vs, logo: r.logo, l: r.loc, at: r.at, m: r.m, r: r.r };
  }).filter(Boolean);
}

// gráfico de barras que acepta valores negativos (diferencias de marcador)
function mpChart(vals, I) {
  const H = 160, vs = vals.map((e) => e.v);
  const hi = Math.max(...vs, I.ln, 1), lo = Math.min(...vs, I.ln, 0), span = (hi - lo) * 1.12 || 1;
  const y = (v) => ((v - lo) / span) * H + 6, z = y(0);
  return `<div class="pkchart">
    <div class="pkleg"><span><i class="ok"></i>Acierto</span><span><i class="no"></i>Fallo</span><span class="ln"><u></u>Línea</span></div>
    <div class="pkmu">Muestra: ${vals.length} partidos</div>
    <div class="pkbars mpb" style="height:${H + 18}px">${vals.map((e) => {
      const ok = I.hit(e.v), top = y(Math.max(e.v, 0)), bot = y(Math.min(e.v, 0)), h = Math.max(top - bot, 4);
      return `<div class="c"><em class="${ok ? "ok" : "no"}" style="bottom:${(e.v >= 0 ? top : bot - 16) + 2}px">${e.v > 0 && I.kind !== "tot" && I.kind !== "btts" && I.kind !== "12" ? "+" : ""}${e.v}</em><i class="${ok ? "ok" : "no"}" style="height:${h}px;bottom:${bot}px;position:absolute;left:0;right:0"></i></div>`;
    }).join("")}${lo < 0 ? `<div class="mp0" style="bottom:${z}px"></div>` : ""}<div class="lnl" style="bottom:${y(I.ln)}px"><span>Línea ${I.kind === "tot" ? I.ln : (I.ln > 0 ? "+" : "") + I.ln}</span></div></div>
    <div class="pkvs">${vals.map((e) => `<div>${crest({ logo: e.logo, n: e.vs, ab: e.vs }, 18)}<span>${e.l ? "" : "@"}${esc(e.vs)}</span></div>`).join("")}</div>
    <div class="pkfoot"><span>Reciente ${ic("left")}</span><span>Antiguo</span></div></div>`;
}

function openMatchPick(gid, keep) {
  const g = D.byId[gid]; if (!g || !g.pick || g.pick.bajo) return openGame(gid);
  if (!keep || !sheetState.mp) sheetState = { mp: gid, n: 10, tab: "resumen", side: null };
  const I = mpInfo(g), tab = sheetState.tab, seg = store.get("seg", {});
  const sd = I.side || sheetState.side || "h";
  const p = g.pick.tipo === "valor" ? g.pick.pv : g.pick.p;
  const tm = I.side ? g[I.side] : null;
  const titulo = tm ? tm.n : `${abT(g.h)} vs ${abT(g.a)}`;
  const mini = tm ? `<span class="pkmini">${crest(tm, 30)}</span>` : `<span class="pkmini dos">${crest(g.h, 26)}${crest(g.a, 26)}</span>`;
  const big = tm ? `<div class="pkbig">${crest(tm, 150)}</div>` : `<div class="pkbig dos">${crest(g.h, 96)}${crest(g.a, 96)}</div>`;
  const html = `<div class="pkh">
      <div class="pkl">
        <div class="pkt">${mini}<h3>${esc(titulo)}</h3></div>
        <div class="pkm">${esc(abT(g.h))} vs ${esc(abT(g.a))} · ${cuando(g.at)}${g.ven ? `<br>${ic("pin")}${esc(g.ven)}${g.city ? `, ${esc(g.city)}` : ""}` : ""}</div>
        <span class="pkpill ${I.up ? "" : "bad"}">${ic(I.up ? "up" : "down")}<span>${esc(I.txt)}</span></span>
        <div class="pkprog ${p >= 0.7 ? "hi" : ""}"><span><i style="width:${p * 100}%"></i></span><b>${pct(p)}</b></div>
      </div>${big}</div>
    <button class="pkseg ${seg[gid] ? "on" : ""}" data-act="mpfollow">${ic(seg[gid] ? "check" : "heart")}${seg[gid] ? "Siguiendo" : "Seguir Predicción"}</button>
    <div class="pktabs">${[["resumen", "Resumen"], ["contexto", "Contexto"], ["analisis", "Análisis IA"]].map(([k, l]) => `<button class="${tab === k ? "on" : ""}" data-act="mptab" data-k="${k}">${l}</button>`).join("")}</div>
    ${tab === "resumen" ? mpResumen(g, I, sd, p) : tab === "contexto" ? gPrevia(g) : mpAnalisis(g, I, sd, p)}
    <button class="cbtn2 mpfull" data-g="${gid}">${ic("cal")}Ver ficha completa del partido</button>`;
  const cur = $(".sheet.on");
  if (keep && cur) { const yy = cur.scrollTop; cur.innerHTML = `<div class="grab"></div><button class="x" data-act="close" aria-label="Cerrar">${ic("x")}</button>` + html; cur.scrollTop = yy; }
  else { openSheet(html); $(".sheet").classList.add("pk"); }
}

function mpResumen(g, I, sd, p) {
  const all = mpSerie(g, I, sd), n = sheetState.n, vals = all.slice(0, n), hits = vals.filter((e) => I.hit(e.v)).length;
  const vs = vals.map((e) => e.v), quien = I.side ? g[I.side].n : g[sd].n;
  let racha = 0; for (const e of all) { if (!I.hit(e.v)) break; racha++; }
  const v10 = all.slice(0, 10), h10 = v10.filter((e) => I.hit(e.v)).length;
  const lc = [];
  if (racha >= 2) lc.push(["ok", `Cumplió en sus últimos ${racha} partidos seguidos`]);
  else if (all.length && !I.hit(all[0].v)) lc.push(["warn", `No cumplió en su último partido (${all[0].m} contra ${all[0].vs})`]);
  if (v10.length) lc.push([h10 / v10.length >= 0.6 ? "ok" : "warn", `Cumplió en ${h10} de sus últimos ${v10.length} (promedio ${n1(media(v10.map((e) => e.v)))} ${I.U})`]);
  const casa = sd === "h", lv = all.filter((e) => e.l === casa).slice(0, 10);
  if (lv.length >= 3) lc.push([lv.filter((e) => I.hit(e.v)).length / lv.length >= 0.5 ? "ok" : "warn", `De ${casa ? "local" : "visitante"}, como hoy: cumplió ${lv.filter((e) => I.hit(e.v)).length} de ${lv.length}`]);
  const cuotaBox = g.pick.tipo === "valor" ? `<div class="pkbox"><div class="k">Cuota</div><b>${odd(g.pick.cuota)}</b></div><div class="pkbox ven"><div class="k">Ventaja ${ic("info")}</div><b>+${((g.pick.valor) * 100).toFixed(1)}%</b></div>` : `<div class="pkbox"><div class="k">Vale desde</div><b>${odd(g.pick.minima || vale(g.pick.justa))}</b></div>`;
  const sideSw = !I.side ? `<div class="pkhint">Partidos de</div><div class="pk5 wide">${["h", "a"].map((s) => `<button class="${sd === s ? "on" : ""}" data-act="mpside" data-k="${s}">${esc(abT(g[s]))}</button>`).join("")}</div>` : "";
  return `<div class="pk3 ${g.pick.tipo === "valor" ? "cuatro" : ""}">
      <div class="pkbox dir ${I.up ? "" : "bad"}"><div class="k">Dirección</div><b>${I.dir}</b></div>
      <div class="pkbox"><div class="k">Línea</div><b>${esc(I.lin)}</b></div>${cuotaBox}</div>
    ${g.pick.tipo === "valor" ? `<div class="pkvale v">${ic("bolt")}<span><b>Error de la casa:</b> paga ${odd(g.pick.cuota)} y según el modelo (mezclado con la propia casa) pasa ${pct(p)} de las veces. La cuota justa sería ${odd(1 / p)}.</span></div>`
      : `<div class="pkvale">${ic("info")}<span>Probabilidad ${pct(p)} → cuota justa ${odd(g.pick.justa)}. <b>Si tu casa paga ${odd(g.pick.minima || vale(g.pick.justa))} o más, es un error de la casa</b> a tu favor.</span></div>`}
    <hr class="pkhr">
    ${lc.length ? `<div class="pkcard ol"><h4>Lo clave</h4><div class="small">Lo que dicen sus últimos partidos sobre el de hoy</div>${clvList(lc)}</div>` : ""}
    <div class="pkhist" style="margin-top:18px"><h4>Historial de ${esc(quien)}</h4><div class="pk5">${[5, 10, 20].map((k) => `<button class="${n === k ? "on" : ""}" data-act="mpn" data-k="${k}">${k}G</button>`).join("")}</div></div>
    ${sideSw}
    ${vals.length ? mpChart(vals, I) : `<div class="empty">Sin partidos anteriores.</div>`}
    <div class="pk2">
      <div class="pkbox l ol"><div class="k">Tasa de acierto</div><b class="g">${hits}/${vals.length}</b><span>${vals.length ? Math.round((100 * hits) / vals.length) : 0}%</span></div>
      <div class="pkbox l ol"><div class="k">Promedio · últimos ${vals.length}</div><b>${vs.length ? n1(media(vs)) : "—"}</b><span>${I.U}</span></div></div>`;
}

function mpAnalisis(g, I, sd, p) {
  const all = mpSerie(g, I, sd), v10 = all.slice(0, 10), h10 = v10.filter((e) => I.hit(e.v)).length;
  const avg = media(v10.map((e) => e.v)), l5 = media(all.slice(0, 5).map((e) => e.v));
  const tr = v10.length && h10 / v10.length >= 0.6 && I.hit(l5) ? "Fuerte" : v10.length && I.hit(avg) ? "Media" : "Débil";
  const f = (g.forma || {})[sd] || [], gw = f.filter((r) => r.r === "G").length;
  const fact = [["trend", `Tendencia: ${tr}`], ["bars2", `10J prom: ${n1(avg)}`], ["home2", sd === "h" ? "Juega de local" : "Juega de visitante"], ["shield", `Forma ${gw}-${f.length - gw}`]];
  if (g.dep === "nba") { const b = (g.bajas?.[sd] || []).filter((x) => x.s === "Out").length; fact.push(["warn", b ? `${b} baja${b > 1 ? "s" : ""} confirmada${b > 1 ? "s" : ""}` : "Sin bajas confirmadas"]); }
  const cTxt = p >= 0.7 ? "Alta" : p >= 0.58 ? "Media" : "Baja";
  return `<div class="iac"><div class="iatop">
      <div class="iah"><span class="iaic">${ic("bolt2")}</span><div><b>Análisis IA</b><small>Modelo CASHBET v2</small></div><em><i></i>MODELO EN VIVO</em></div>
      <div class="iaconf"><span>CONFIANZA DEL MODELO</span><b>${pct(p)}</b></div>
      <div class="iabar"><s style="width:${p * 100}%"></s></div><div class="iapk">${esc(I.txt.toUpperCase())}</div></div>
      <div class="iaf"><div class="fl">FACTORES CLAVE</div><div class="chips2">${fact.map(([i, s]) => `<span>${ic(i)}${esc(s)}</span>`).join("")}</div></div>
      <p class="iatx">${iaPartido(g)}</p>
      <div class="ia3"><div><span>SEÑAL</span><b>${tr}</b></div><div><span>CONFIANZA</span><b>${cTxt}</b></div><div><span>MUESTRA</span><b>${v10.length} juegos</b></div></div></div>
    ${probBox(g)}`;
}

function actMatchPick(a, el) {
  const k = el.dataset.k, gid = sheetState && sheetState.mp;
  if (!gid) return false;
  if (a === "mptab") { sheetState.tab = k; openMatchPick(gid, true); if (typeof alTab === "function") alTab(); return true; }
  if (a === "mpn") { sheetState.n = +k; openMatchPick(gid, true); return true; }
  if (a === "mpside") { sheetState.side = k; openMatchPick(gid, true); return true; }
  if (a === "mpfollow") {
    const s = store.get("seg", {}), g = D.byId[gid];
    if (s[gid] && !puedeQuitar(s[gid])) { toast("El partido ya empezó: este pick queda en tus Seguidos y en tu Bankroll"); return true; }
    if (s[gid]) delete s[gid];
    else s[gid] = { at: g.at, liga: g.liga, lg: g.lg, dep: g.dep, h: g.h.n, a: g.a.n, hl: g.h.logo, al: g.a.logo, hab: g.h.ab, aab: g.a.ab, txt: g.pick.txt, pill: g.pick.txt, up: isUp(g.pick.m),
      p: g.pick.tipo === "valor" ? g.pick.pv : g.pick.p, m: g.pick.m, cuota: g.pick.cuota || g.pick.justa, oc: g.pick.tipo === "valor" ? g.pick.cuota : g.pick.minima || vale(g.pick.justa), tipo: "Partido", nom: `${g.h.n} vs ${g.a.n}` };
    store.set("seg", s); toast(s[gid] ? "Siguiendo esta predicción" : "Dejaste de seguirla");
    openMatchPick(gid, true); return true;
  }
  return false;
}
