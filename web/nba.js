// CASHBET — secciones NBA de la ficha (como la referencia): posiciones, forma, el rival,
// defensa del rival, enfrentamientos, líderes, contexto del equipo, bajas, impacto de
// lesiones, línea del mercado y pronóstico del partido. Datos: g.extra (robot nbaextra.py),
// g.ctx (defensa, líderes, bajas), g.mov (primera y última cuota vista).

const LES_ES = { knee: "Rodilla", ankle: "Tobillo", foot: "Pie", hamstring: "Isquiotibial", back: "Espalda", hip: "Cadera", shoulder: "Hombro",
  groin: "Ingle", calf: "Pantorrilla", wrist: "Muñeca", hand: "Mano", toe: "Dedo del pie", illness: "Enfermedad", rest: "Descanso", thigh: "Muslo",
  achilles: "Aquiles", concussion: "Conmoción", elbow: "Codo", finger: "Dedo", quadriceps: "Cuádriceps", quad: "Cuádriceps", personal: "Motivos personales",
  abdomen: "Abdomen", neck: "Cuello", chest: "Pecho", leg: "Pierna", "lower leg": "Pierna", shin: "Espinilla", rib: "Costilla", oblique: "Oblicuo",
  heel: "Talón", face: "Cara", eye: "Ojo", nose: "Nariz", jaw: "Mandíbula", thumb: "Pulgar", lumbar: "Lumbar", forearm: "Antebrazo", "not injury related": "Sin lesión" };
const EST_ES = { Out: ["FUERA", "r"], Doubtful: ["DUDOSO", "r"], Questionable: ["EN DUDA", "o"], "Day-To-Day": ["DÍA A DÍA", "o"], Probable: ["PROBABLE", "g"] };
const lesTipo = (b) => [b.tipo ? LES_ES[String(b.tipo).toLowerCase()] || b.tipo : null, b.lado ? (b.lado === "Left" ? "izquierda" : b.lado === "Right" ? "derecha" : "") : null].filter(Boolean).join(" ");

function nbaFoto(url, n, px) {
  return url ? `<img class="nbf" src="${esc(url)}" alt="" width="${px}" height="${px}" loading="lazy">` : `<span class="nbf sin" style="width:${px}px;height:${px}px">${esc(sigla({ n }))}</span>`;
}
// impacto de lesiones: pestañas por equipo sin volver a dibujar la ficha
function nbaLes(btn, s) {
  const box = btn.closest(".nles");
  box.querySelectorAll(".nlt button").forEach((b) => b.classList.toggle("on", b === btn));
  box.querySelectorAll(".nlp").forEach((p) => p.classList.toggle("on", p.dataset.s === s));
}

function nbaContexto(g, sd, op) {
  const X = g.extra || { hist: {}, vr: {}, lg: {} }, C = g.ctx || {}, lg = X.lg || {};
  const rsd = sd === "h" ? "a" : "h", H = (s, n) => (X.hist[s] || []).slice(0, n);
  const ab = (s) => abT(g[s]);
  const wl = (r) => (r === "G" ? "G" : "P");
  const racha = (s) => { const xs = X.hist[s] || []; if (!xs.length) return ""; let k = 0; while (k < xs.length && xs[k].r === xs[0].r) k++; return `<span class="nch ${xs[0].r === "G" ? "g" : "r"}">${wl(xs[0].r)}${k}</span>`; };
  const D_ = C.def || {}, B = C.bajas || {};
  const out = [];

  if (!op.solo) {
    // ---- el rival (como "El rival: HOU")
    const dr = D_[rsd];
    if (op.rival && dr) out.push(`<div class="pkcard ol"><h4>El rival: ${esc(ab(rsd))}</h4><div class="pk3" style="margin-top:10px">
      <div class="pkbox c ol"><b>${dr.ritmo != null ? n1(dr.ritmo) : "—"}</b><div class="k">Ritmo (posesiones)</div></div>
      <div class="pkbox c ol"><b>${dr.rank ? `${dr.rank}.º / ${dr.n}` : "—"}</b><div class="k">Ranking defensivo</div></div>
      <div class="pkbox c ol"><b>${dr.perm10 != null ? n1(dr.perm10) : "—"}</b><div class="k">Permite, últimos 10</div></div></div>
      ${dr.rank ? `<div class="small" style="margin-top:10px">${esc(ab(rsd))} ${dr.rank <= 10 ? "defiende mejor que la mayoría" : dr.rank <= 20 ? "tiene una defensa promedio" : "es de las defensas más flojas"}.</div>` : ""}</div>`);
    // ---- posiciones y forma
    const pos = (s) => { const rec = (g[s].rec || "").split("-").map(Number), pj = rec.length === 2 ? rec[0] + rec[1] : 0;
      return `<div class="pcol">${crest(g[s], 34)}<span class="ab">${esc(ab(s))}</span>${pj ? `<div class="big">${rec[0]}-${rec[1]}</div><span>${n1((100 * rec[0]) / pj)}%</span>` : `<span>Sin datos de la temporada</span>`}${racha(s)}</div>`; };
    const u10 = (s) => { const xs = H(s, 10), w = xs.filter((e) => e.r === "G").length, pf = xs.reduce((a, e) => a + e.pts, 0), pc = xs.reduce((a, e) => a + e.opts, 0), d = pf - pc, n = Math.max(xs.length, 1);
      return `<div class="pcol">${crest(g[s], 34)}<span class="ab">${esc(ab(s))}</span><div class="big">${w}-${xs.length - w}</div><span class="cap">ÚLTIMOS ${xs.length}</span><div class="bd">${racha(s)}<b class="${d > 0 ? "g" : d < 0 ? "r" : ""}">${d > 0 ? "+" : ""}${d}</b></div><span>${n1(pf / n)} PF/J · ${n1(pc / n)} PC/J</span></div>`; };
    out.push(`<h2 class="pkh2">Los equipos</h2><h4 class="pksub">Posiciones</h4><div class="pkcard ol pos">${pos("h")}${pos("a")}</div>
      <h4 class="pksub">Forma del equipo (Ú10)</h4><div class="pkcard ol pos">${u10("h")}${u10("a")}</div>
      <h4 class="pksub">Forma reciente <small>Últimos 5 juegos</small></h4><div class="pkcard ol">${["h", "a"].map((s) => { const xs = H(s, 5), w = xs.filter((e) => e.r === "G").length;
        return `<div class="fo">${crest(g[s], 24)}<b>${esc(ab(s))}</b><span class="rc">${w}-${xs.length - w}</span><span class="wls">${xs.map((e) => `<span class="wl ${e.r}">${wl(e.r)}</span>`).join("")}</span></div>
        ${xs.map((e) => `<div class="fr"><span class="wl ${e.r}">${wl(e.r)}</span>${e.l ? "vs" : "@"} ${crest({ logo: lg[e.vs], n: e.vs, ab: e.vs }, 20)} ${esc(e.vs)}<span class="s">${e.pts}-${e.opts}</span><span class="d">${fDia(e.d)}</span></div>`).join("")}`; }).join("")}</div>`);
  }
  // ---- defensa del rival
  const dr = D_[rsd], nOut = (B[rsd] || []).filter((b) => b.s === "Out").length;
  if (dr) {
    const cal = dr.rank ? (dr.rank <= 10 ? ["BUENA", "g"] : dr.rank <= 20 ? ["MEDIA", "o"] : ["FLOJA", "r"]) : null;
    out.push(`<div class="nsec"><h4 class="pksub">Defensa del rival</h4>${cal ? `<span class="nch ${cal[1]}">${esc(ab(rsd))} — ${cal[0]}</span>` : ""}</div>
      <div class="pk4"><div class="pkbox c ol"><div class="k">PERMITIDO L10</div><b>${dr.perm10 != null ? n1(dr.perm10) : "—"}</b></div>
      <div class="pkbox c ol"><div class="k">PROM. LIGA</div><b>${C.liga != null ? n1(C.liga) : "—"}</b></div>
      <div class="pkbox c ol"><div class="k">MULTIPLI&shy;CADOR</div><b>${dr.mult != null ? dr.mult.toFixed(2) + "x" : "—"}</b></div>
      <div class="pkbox c ol ${nOut ? "rojo" : ""}"><div class="k">BAJAS</div><b>${nOut}</b></div></div>`);
  }
  // ---- últimos 5 enfrentamientos
  if (!op.solo) {
    const h2h = (X.vr.h || []).slice(0, 5);
    if (h2h.length) {
      const wH = h2h.filter((e) => e.r === "G").length, tot = media(h2h.map((e) => e.pts + e.opts));
      out.push(`<h4 class="pksub">Últimos ${h2h.length} enfrentamientos</h4><div class="pkcard ol"><div class="h2hh">${crest(g.h, 26)}<b>${wH}–${h2h.length - wH}</b>${crest(g.a, 26)}<span>Total promedio: ${n1(tot)}</span></div>
        ${h2h.map((e) => { const loc = e.l ? ab("h") : ab("a"), vis = e.l ? ab("a") : ab("h"), pl = e.l ? e.pts : e.opts, pv = e.l ? e.opts : e.pts, w = pl > pv ? loc : vis;
          return `<div class="h2r"><span>${fDia(e.d)}</span><b>${esc(vis)} ${pv} @ ${esc(loc)} ${pl}</b><em class="${w === ab(sd) ? "g" : "r"}">${esc(w)}</em></div>`; }).join("")}</div>`);
    }
  }
  // ---- líderes del equipo
  const L = C.lid || {};
  if ((L.h || []).length || (L.a || []).length) {
    const col = (s) => `<div class="nlc"><div class="fl" style="margin:0 0 6px">${esc(ab(s))}</div>${(L[s] || []).map((j) => `<div class="nlr">${nbaFoto(j.foto, j.n, 34)}<div><b>${esc(j.n)}</b><span>${esc(j.cat.toUpperCase())}</span></div><strong>${n1(j.v)}</strong></div>`).join("")}</div>`;
    out.push(`<h4 class="pksub">Líderes del equipo <small>promedio esta temporada</small></h4><div class="pkcard ol nld">${col("h")}${col("a")}</div>`);
  }
  // ---- contexto del equipo
  if (!op.solo) {
    const xs = H(sd, 10).map((e) => e.pts), dr2 = D_[rsd];
    if (xs.length) out.push(`<h4 class="pksub">Contexto del equipo</h4><div class="pk3"><div class="pkbox c ol"><div class="k">PROM. L10</div><b>${n1(media(xs))}</b></div>
      <div class="pkbox c ol"><div class="k">VARIACIÓN</div><b>±${n1(desv(xs))}</b></div>
      <div class="pkbox c ol"><div class="k">DEF. RIVAL</div><b>${dr2 && dr2.rank ? (dr2.rank <= 10 ? "BUENA" : dr2.rank <= 20 ? "MEDIA" : "FLOJA") : "—"}</b></div></div>`);
  }
  // ---- bajas e impacto de lesiones
  const lb = B[sd + "_lib"] || 0, nb = (B[sd] || []).filter((b) => b.s === "Out").length;
  out.push(`<h2 class="pkh2">Bajas</h2><div class="pk2n"><div class="pkbox c ol ${lb ? "rojo" : ""}"><div class="k">PUNTOS LIBERADOS ${esc(ab(sd))}</div><b>${n1(lb)}</b></div>
    <div class="pkbox c ol"><div class="k">FUERA ${esc(ab(sd))}</div><b>${nb}</b></div></div>`);
  if ((B.h || []).length || (B.a || []).length) {
    const panel = (s) => { const xs = B[s] || [], outs = xs.filter((b) => b.s === "Out");
      return `<div class="nlp ${s === sd ? "on" : ""}" data-s="${s}">${outs.length ? `<div class="nlx">${outs.length} FUERA (${n1(B[s + "_lib"] || 0)} pts/partido perdidos): ${esc(outs.map((b) => b.n).join(", "))}</div>` : ""}
        ${xs.length ? xs.map((b) => { const [et, ec] = EST_ES[b.s] || [String(b.s || "").toUpperCase(), "o"];
          return `<div class="nli">${nbaFoto(b.foto, b.n, 38)}<div><b>${esc(b.n)} <small>${esc(b.pos || "")}</small></b>
            <span><i class="${ec}">● ${et}</i>${lesTipo(b) ? ` ${esc(lesTipo(b))}` : ""}${b.ppg != null ? ` — ${n1(b.ppg)} pts/partido` : ""}${b.ret ? ` · vuelve ~${fDia(b.ret)}` : ""}</span></div></div>`; }).join("") : `<div class="small">Sin bajas reportadas.</div>`}</div>`; };
    out.push(`<div class="pkcard ol nles"><h4>Impacto de lesiones</h4><div class="nlt">${["h", "a"].map((s) => `<button class="${s === sd ? "on" : ""}" onclick="nbaLes(this,'${s}')">${esc(ab(s))} <em>${(B[s] || []).length}</em></button>`).join("")}</div>${panel("h")}${panel("a")}</div>`);
  }
  // ---- mercado
  const M = g.mov, pm = Object.fromEntries((g.mercados || []).map((s) => [s.m, s]));
  out.push(`<h2 class="pkh2">Mercado</h2>`);
  if (M && M.ini && M.ult) {
    const impl = (o, s) => (o.ou != null && o.sp != null ? (s === "h" ? o.ou / 2 - o.sp / 2 : o.ou / 2 + o.sp / 2) : null);
    const team = !!op.pick, li = team ? impl(M.ini, sd) : M.ini.ou, lu = team ? impl(M.ult, sd) : M.ult.ou;
    const ci = M.ini[sd], cu = M.ult[sd];
    const cambio = li != null && lu != null && lu !== li ? (lu > li ? ["Subió", "g"] : ["Bajó", "r"]) : ["Sin cambio", ""];
    const sv = (o) => (o.h && o.a ? (1 / o[sd]) / (1 / o.h + 1 / o.a) : null), pv = sv(M.ult);
    out.push(`<h4 class="pksub">Línea del mercado</h4><div class="pkcard ol nmk"><div class="nsec"><b>${team ? `Puntos de ${esc(ab(sd))} (según la casa)` : "Total del partido"}: ${li != null ? n1(li) : "—"} → ${lu != null ? n1(lu) : "—"}</b><span class="nch ${cambio[1]}">${cambio[0]}</span></div>
      ${ci && cu ? `<div class="small">Cuota de ${esc(ab(sd))} para ganar: ${odd(ci)} → ${odd(cu)}</div>` : ""}
      <div class="small">Referencia inicial: primera cuota que vio el robot (${new Date(M.ini.t).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}); la apertura oficial de la casa puede ser anterior.</div>
      ${pv ? `<div class="small">El mercado le da a ${esc(ab(sd))} un ${pct(pv, 1)} de ganar.</div>` : ""}</div>`);
  } else out.push(`<div class="pkcard ol"><div class="small">La casa todavía no publica la línea de este partido. El robot guarda la primera y la última cuota que ve para mostrar cómo se mueve.</div></div>`);
  const pe = g.puntos_esperados || [];
  out.push(`<h4 class="pksub">Pronóstico del partido</h4><div class="pk2n">
    <div class="pkbox c ol"><div class="k">${esc(ab("h"))} PROB. VICTORIA</div><b>${pm["1"] ? pct(pm["1"].p, 1) : "—"}</b></div>
    <div class="pkbox c ol"><div class="k">${esc(ab("a"))} PROB. VICTORIA</div><b>${pm["2"] ? pct(pm["2"].p, 1) : "—"}</b></div>
    <div class="pkbox c ol"><div class="k">${esc(ab("h"))} PROY.</div><b>${pe[0] != null ? n1(pe[0]) + " PTS" : "—"}</b></div>
    <div class="pkbox c ol"><div class="k">${esc(ab("a"))} PROY.</div><b>${pe[1] != null ? n1(pe[1]) + " PTS" : "—"}</b></div></div>`);
  return out.join("\n");
}
