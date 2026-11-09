"""CASHBET - pronósticos de los próximos partidos -> data/picks.json

Usa los ajustes elegidos por model.py (data/model/report.json) y SOLO
partidos ya jugados. Fútbol: 1X2, doble oportunidad, goles, ambos marcan.
NBA: ganador, hándicap, total y props de jugadores contra la línea de la casa.

Uso:  python predict.py
"""
import json, os, math, datetime as dt
import numpy as np
from scipy.stats import norm
from sklearn.linear_model import LogisticRegression
from fetch import get, LEAGUES
from extra import predict as extra_predict, outcome as extra_outcome
from model import (DATA, SOCCER, Poi, load, soccer_markets, nba_teams, is_preseason,
                   nba_walk, STATS, stat_val)

DIAS = 8  # cuántos días hacia adelante
# Liga MX y Liga BetPlay: solo ganador, gana o empata, goles, ambos marcan, córners y tarjetas
LIGAS_SIMPLES = {"mex.1", "col.1"}
MERCADOS_SIMPLES = {"cor", "tar"}

# ---- la app busca ERRORES DE CUOTA de las casas de apuestas ----
# valor = probabilidad x cuota de la casa - 1   (ej. 70 % x 1.60 - 1 = +12 %)
VALOR_MIN = 0.05            # solo se marca "error de la casa" con +5 % o más
MARGEN = 1.05               # sin cuota de la casa: vale la pena si paga 5 % más que la justa
PMIN, PMAX = 0.55, 0.75     # picks por probabilidad (sin cuota de casa): ni dudosos ni regalados
CUOTA_MIN = round(1 / PMAX, 2)
# peso del modelo frente a la casa (se ajusta solo con los resultados reales, ver pesos())
PESO = {"futbol": 0.5, "nba": 0.5, "props": 0.3}


def sin_vig(odds):
    """Probabilidades que da la casa quitándole su comisión."""
    inv = {k: 1 / o for k, o in odds.items() if o}
    if len(inv) >= 2:
        t = sum(inv.values())
        if t > 1:
            return {k: v / t for k, v in inv.items()}
    return {k: v / 1.05 for k, v in inv.items()}


def con_casa(sels, peso):
    """Mezcla la probabilidad del modelo con la de la casa (el modelo solo pesa lo que
    ha demostrado) y calcula el valor real de cada opción con cuota de la casa."""
    q = sin_vig({s["m"]: s.get("cuota") for s in sels if s.get("cuota")})
    for s in sels:
        if s["m"] in q:
            s["casa"] = round(q[s["m"]], 4)
            s["pv"] = round(peso * s["p"] + (1 - peso) * q[s["m"]], 4)
            s["valor"] = round(s["pv"] * s["cuota"] - 1, 3)
    return sels


def elegir(sels, prefer=None):
    """1) Si la casa paga una cuota mal puesta (valor >= +5 %), ese es el pick.
    2) Si no, el más probable entre 55 % y 75 % que NO tenga cuota de casa (la casa
       que sí tenemos paga menos de lo que vale -> no se recomienda); se muestra la
       cuota mínima para que valga la pena en la casa de cada persona."""
    val = [s for s in sels if s.get("valor") is not None and s["valor"] >= VALOR_MIN
           and s["pv"] >= 0.40 and 1.40 <= s["cuota"] <= 4.0]
    if val:
        return dict(max(val, key=lambda s: s["valor"]), tipo="valor")
    apt = [s for s in sels if PMIN <= s["p"] <= PMAX and not s.get("cuota")]
    if prefer:
        pa = [s for s in prefer if s in apt]
        if pa:
            s = max(pa, key=lambda s: s["p"])
            return dict(s, tipo="prob", minima=round(s["justa"] * MARGEN, 2))
    if apt:
        s = max(apt, key=lambda s: s["p"])
        return dict(s, tipo="prob", minima=round(s["justa"] * MARGEN, 2))
    # nada sirve (favorito regalado, partido muy parejo o la casa ya paga lo justo):
    # se muestra el más probable marcado "bajo"; no entra a las listas ni a la libreta
    return dict(max(sels, key=lambda s: s["p"]), bajo=True)


def pesos():
    """Cuánto creerle al modelo frente a la casa, según los picks reales ya calificados
    (el que mejor habría acertado: menor log-loss). Con pocos datos, valores prudentes."""
    p = os.path.join(DATA, "ledger.json")
    if not os.path.exists(p):
        return
    L = json.load(open(p, encoding="utf-8"))
    grupos = {
        "props": [(e.get("pm", e["p"]), e["casa"] / 1.045, e["ok"]) for e in L.get("props", {}).values()
                  if e.get("ok") is not None and e.get("casa")],
        "futbol": [(e.get("pm", e["p"]), e.get("q") or 1 / e["cuota"] / 1.05, e["ok"]) for e in L.get("partidos", {}).values()
                   if e.get("ok") is not None and e.get("cuota_casa") and e.get("dep") == "futbol"],
        "nba": [(e.get("pm", e["p"]), e.get("q") or 1 / e["cuota"] / 1.03, e["ok"]) for e in L.get("partidos", {}).values()
                if e.get("ok") is not None and e.get("cuota_casa") and e.get("dep") == "nba"],
    }
    for k, xs in grupos.items():
        if len(xs) < 40:
            continue
        def ll(w):
            t = 0
            for pm, q, ok in xs:
                v = min(max(w * pm + (1 - w) * min(q, 0.97), 0.02), 0.98)
                t -= math.log(v if ok else 1 - v)
            return t
        PESO[k] = min(range(0, 101, 5), key=lambda w: ll(w / 100)) / 100
    print("peso del modelo frente a la casa:", PESO)


def now():
    return dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)


def rep():
    with open(os.path.join(DATA, "model", "report.json"), encoding="utf-8") as f:
        return json.load(f)


def soon(at):
    t = dt.datetime.fromisoformat(at.replace("Z", ""))
    return now() - dt.timedelta(hours=3) <= t <= now() + dt.timedelta(days=DIAS)


def sel(mk, p, odd=None):
    s = {"m": mk, "p": round(float(p), 4), "justa": round(1 / max(float(p), 1e-6), 2)}
    if odd:
        s["cuota"] = odd
    return s


# ---------------------------------------------------------------- fútbol
def soccer(par, report):
    out = []
    acc = report["futbol"]["mercados"]
    for key in SOCCER:
        games, det, pre = load(key)
        pre = [g for g in pre if g["h"] and g["a"] and soon(g["at"])]
        if not pre:
            continue
        teams, seen = {}, {}
        for g in games + pre:
            for s in ("h", "a"):
                teams.setdefault(g[s]["id"], len(teams))
        H, A, YH, YA, SH, SA, CH, CA, D, HC = [], [], [], [], [], [], [], [], [], []
        for g in games:
            tm = (det.get(g["id"]) or {}).get("tm") or {}
            th, ta = tm.get(g["h"]["id"]) or {}, tm.get(g["a"]["id"]) or {}
            H.append(teams[g["h"]["id"]]); A.append(teams[g["a"]["id"]])
            D.append(dt.date.fromisoformat(g["at"][:10]).toordinal())
            YH.append(g["h"]["s"]); YA.append(g["a"]["s"])
            SH.append(th.get("shotsOnTarget") if th.get("shotsOnTarget") is not None else g["h"]["s"] * 3)
            SA.append(ta.get("shotsOnTarget") if ta.get("shotsOnTarget") is not None else g["a"]["s"] * 3)
            HC.append(th.get("wonCorners") is not None and ta.get("wonCorners") is not None)
            CH.append(th.get("wonCorners") or 0); CA.append(ta.get("wonCorners") or 0)
            for s in ("h", "a"):
                seen[g[s]["id"]] = seen.get(g[s]["id"], 0) + 1
        n = len(teams)
        w = np.exp(-par["xi"] * (now().date().toordinal() - np.array(D)))
        hi, ai = np.array(H), np.array(A)
        mg, ms = Poi(n), Poi(n)
        mg.fit(hi, ai, np.array(YH, float), np.array(YA, float), w, par["ridge"])
        ms.fit(hi, ai, np.array(SH, float), np.array(SA, float), w, par["ridge"])
        conv = np.sum(w * (np.array(YH) + np.array(YA))) / max(np.sum(w * (np.array(SH) + np.array(SA))), 1)
        ws = par["wsot"]
        for g in pre:
            if seen.get(g["h"]["id"], 0) < 4 or seen.get(g["a"]["id"], 0) < 4:
                continue
            h, a = teams[g["h"]["id"]], teams[g["a"]["id"]]
            gh, ga = mg.lam(h, a)
            sh, sa = ms.lam(h, a)
            gh = math.exp((1 - ws) * math.log(gh) + ws * math.log(sh * conv))
            ga = math.exp((1 - ws) * math.log(ga) + ws * math.log(sa * conv))
            pm = soccer_markets(gh, ga, None, par["rho"], 1)
            od = g.get("odds") or {}
            sels = [sel("1", pm["1"], od.get("h")), sel("X", pm["X"], od.get("d")), sel("2", pm["2"], od.get("a")),
                    sel("1X", pm["1"] + pm["X"]), sel("X2", pm["X"] + pm["2"]), sel("12", pm["1"] + pm["2"]),
                    sel("btts_si", pm["btts"]), sel("btts_no", 1 - pm["btts"])]
            for ln in (1.5, 2.5, 3.5):
                sels += [sel(f"mas_{ln}", pm[f"o{ln}"]), sel(f"menos_{ln}", 1 - pm[f"o{ln}"])]
            # pick principal: el resultado si es claro (>=50%); si no, doble
            # oportunidad fuerte; si no, el mercado de goles más seguro
            # (siempre con cuota >= 1.30; si el favorito paga menos, se busca
            # el mercado más probable que sí pague eso)
            con_casa(sels, PESO["futbol"])
            by = {s["m"]: s for s in sels}
            if key in LIGAS_SIMPLES:   # solo ganador, gana o empata, goles y ambos marcan
                cand = [s for s in sels if s["m"] in ("1", "2", "1X", "X2", "btts_si", "btts_no") or s["m"].startswith(("mas_", "menos_"))]
                pick = elegir(cand, prefer=[by["1"], by["2"]])
            else:
                pick = elegir(sels, prefer=[by["1"], by["X"], by["2"]])
            # diferencia con la casa: AÚN SIN PROBAR (no hay cuotas históricas)
            val = [s for s in sels if s.get("valor", -1) > 0.05 and s["p"] >= 0.30]
            out.append({
                "id": g["id"], "dep": "futbol", "lg": key, "liga": LEAGUES[key][2], "at": g["at"],
                "ven": g.get("ven"), "city": g.get("city"), "tv": g.get("tv"),
                "h": {k: g["h"][k] for k in ("id", "n", "ab", "logo", "rec")},
                "a": {k: g["a"][k] for k in ("id", "n", "ab", "logo", "rec")},
                "goles_esperados": [round(gh, 2), round(ga, 2)],
                "mercados": sels, "pick": pick,
                "valor_sin_probar": max(val, key=lambda s: s["valor"]) if val else None,
                "odds": od or None,
            })
    return out


def _top_score(lh, la, rho):
    from model import score_matrix
    m = score_matrix(lh, la, rho)
    i, j = np.unravel_index(np.argmax(m), m.shape)
    return f"{i}-{j}"


# ---------------------------------------------------------------- NBA
def recent_boxes(games, det):
    hist = {}
    for g in games:
        pl = (det.get(g["id"]) or {}).get("pl") or {}
        for s in ("h", "a"):
            t = g[s]["id"]
            box = {pid: (v.get("MIN") or 0, v.get("PTS") or 0) for pid, v in pl.items() if v.get("t") == t}
            if box:
                hist.setdefault(t, []).append(box)
    return hist


def miss_share(prev, out_ids):
    prev = prev[-10:]
    if len(prev) < 3:
        return 0.0
    tot = sum(sum(v[1] for v in b.values()) for b in prev) or 1
    pts, gin = {}, {}
    for b in prev:
        for pid, (mn, pt) in b.items():
            pts[pid] = pts.get(pid, 0) + pt
            gin[pid] = gin.get(pid, 0) + (mn >= 15)
    return sum(v / tot for pid, v in pts.items() if pid in out_ids and gin[pid] >= len(prev) / 2)


def nba(par):
    games, det, pre = load("nba")
    keep = nba_teams(games)
    games = [g for g in games if g["h"]["id"] in keep and g["a"]["id"] in keep and not is_preseason(g["at"][:10])]
    pre = [g for g in pre if g["h"] and g["a"] and g["h"]["id"] in keep and g["a"]["id"] in keep and soon(g["at"])]
    if not pre:
        return [], []
    teams = {t: i for i, t in enumerate(sorted(keep))}
    n = len(teams)
    X, Y, D, last = [], [], [], {}
    for g in games:
        d = dt.date.fromisoformat(g["at"][:10]).toordinal()
        h, a = teams[g["h"]["id"]], teams[g["a"]["id"]]
        for s, o, home in ((h, a, 1), (a, h, 0)):
            x = np.zeros(2 + 2 * n); x[0] = 1; x[1] = home; x[2 + s] = 1; x[2 + n + o] = -1
            X.append(x); D.append(d)
        Y += [g["h"]["s"], g["a"]["s"]]
        last[g["h"]["id"]] = last[g["a"]["id"]] = (dt.datetime.fromisoformat(g["at"].replace("Z", "")) - dt.timedelta(hours=6)).date()
    Xa, Ya = np.array(X), np.array(Y)
    w = np.exp(-par["xi"] * (now().date().toordinal() - np.array(D)))
    Wx = Xa * w[:, None]
    R = np.eye(Xa.shape[1]) * par["ridge"]; R[0, 0] = R[1, 1] = 0
    beta = np.linalg.solve(Xa.T @ Wx + R, Wx.T @ Ya)

    # 2a etapa con todo lo ya jugado (sin inicios de temporada)
    rows, _, _ = nba_walk(par["xi"], par["ridge"])
    rows = [r for r in rows if not (r["d"][5:7] == "10" or "11-01" <= r["d"][5:] <= "11-19")]
    F = np.array([[r["ph"] - r["pa"], r["mh"] - r["ma"], float(r["b2b_h"]) - float(r["b2b_a"])] for r in rows])
    ym = np.array([r["g"]["h"]["s"] - r["g"]["a"]["s"] for r in rows])
    yt = np.array([r["g"]["h"]["s"] + r["g"]["a"]["s"] for r in rows])
    tp = np.array([r["ph"] + r["pa"] for r in rows])
    c = np.linalg.lstsq(np.c_[F, np.ones(len(F))], ym, rcond=None)[0]
    sd_m = float(np.std(ym - np.c_[F, np.ones(len(F))] @ c))
    ct = np.polyfit(tp, yt, 1)
    sd_t = float(np.std(yt - np.polyval(ct, tp)))
    lr = LogisticRegression(C=1.0).fit(F, ym > 0)

    boxes = recent_boxes(games, det)
    out, injured = [], set()
    for g in pre:
        sm = get(f"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event={g['id']}") or {}
        outs = {}
        for t in sm.get("injuries", []):
            outs[t["team"]["id"]] = [{"id": i["athlete"]["id"], "n": i["athlete"]["displayName"], "s": i.get("status")}
                                     for i in t.get("injuries", []) if i.get("athlete")]
        o_h = {i["id"] for i in outs.get(g["h"]["id"], []) if i["s"] == "Out"}
        o_a = {i["id"] for i in outs.get(g["a"]["id"], []) if i["s"] == "Out"}
        injured |= o_h | o_a
        # props: "Doubtful" (casi seguro no juega) también cuenta como baja
        injured |= {i["id"] for t_ in outs.values() for i in t_ if i["s"] == "Doubtful"}
        h, a = teams[g["h"]["id"]], teams[g["a"]["id"]]
        ph = beta[0] + beta[1] + beta[2 + h] - beta[2 + n + a]
        pa = beta[0] + beta[2 + a] - beta[2 + n + h]
        gd = (dt.datetime.fromisoformat(g["at"].replace("Z", "")) - dt.timedelta(hours=6)).date()
        f = np.array([[ph - pa, miss_share(boxes.get(g["h"]["id"], []), o_h) - miss_share(boxes.get(g["a"]["id"], []), o_a),
                       float((gd - last.get(g["h"]["id"], gd)).days == 1) - float((gd - last.get(g["a"]["id"], gd)).days == 1)]])
        marg = float(np.r_[f[0], 1] @ c)
        ph_win = float(lr.predict_proba(f)[0, 1])
        tot = float(np.polyval(ct, ph + pa))
        od = g.get("odds") or {}
        sels = [sel("1", ph_win, od.get("h")), sel("2", 1 - ph_win, od.get("a"))]
        if od.get("sp") is not None:
            p = 1 - norm.cdf((-od["sp"] - marg) / sd_m)
            sels += [sel(f"hcp_local_{od['sp']:+g}", p), sel(f"hcp_visita_{-od['sp']:+g}", 1 - p)]
        if od.get("ou"):
            p = 1 - norm.cdf((od["ou"] - tot) / sd_t)
            sels += [sel(f"mas_{od['ou']}", p), sel(f"menos_{od['ou']}", 1 - p)]
        con_casa(sels, PESO["nba"])
        pick = elegir(sels, prefer=sels[:2])
        val = [s for s in sels[:2] if s.get("valor", -1) > 0.03]
        out.append({
            "id": g["id"], "dep": "nba", "lg": "nba", "liga": "NBA", "at": g["at"],
            "ven": g.get("ven"), "city": g.get("city"), "tv": g.get("tv"),
            "vimg_espn": ((((sm.get("gameInfo") or {}).get("venue") or {}).get("images") or [{}])[0]).get("href"),
            "h": {k: g["h"][k] for k in ("id", "n", "ab", "logo", "rec")},
            "a": {k: g["a"][k] for k in ("id", "n", "ab", "logo", "rec")},
            "puntos_esperados": [round(marg / 2 + tot / 2, 1), round(tot / 2 - marg / 2, 1)],
            "margen": round(marg, 1), "total": round(tot, 1),
            "bajas": {"h": outs.get(g["h"]["id"], []), "a": outs.get(g["a"]["id"], [])},
            "mercados": sels, "pick": pick,
            "valor_sin_probar": max(val, key=lambda s: s["valor"]) if val else None, "odds": od or None,
        })
    return out, injured


# ---------------------------------------------------------------- props
PROP_TYPES = {
    "Total Points": ["PTS"], "Total Rebounds": ["REB"], "Total Assists": ["AST"],
    "Total 3-Point Field Goals": ["3PM"], "Total Points and Rebounds": ["PTS", "REB"],
    "Total Points and Assists": ["PTS", "AST"], "Total Assists and Rebounds": ["AST", "REB"],
    "Total Points, Rebounds, and Assists": ["PTS", "REB", "AST"],
}
NOMBRE = {"Total Points": "Puntos", "Total Rebounds": "Rebotes", "Total Assists": "Asistencias",
          "Total 3-Point Field Goals": "Triples", "Total Points and Rebounds": "Pts+Reb",
          "Total Points and Assists": "Pts+Ast", "Total Assists and Rebounds": "Ast+Reb",
          "Total Points, Rebounds, and Assists": "Pts+Reb+Ast"}


# Compañeros ausentes: medido en model (prueba hacia adelante, 15.331 actuaciones):
# media x (1 + B x delta), delta = % de la estadística del equipo que hacen los
# habituales que faltan HOY menos el % que faltaba en los partidos de la ventana.
# Acierto más/menos: PTS 53,2->56,6 %, REB 56,3->57,1, AST 57,4->58,9, 3PM 64,3->64,7.
B_AUS = {"PTS": 0.62, "REB": 0.64, "AST": 0.66, "3PM": 0.35}


def _miss(prev, presentes, k):
    """% de la estadística k (últimos 10 del equipo) que hacen habituales no presentes."""
    prev = prev[-10:]
    if len(prev) < 3:
        return 0.0
    tot = sum(sum(x[k] for x in b.values()) for b in prev) or 1
    acc, gin = {}, {}
    for b in prev:
        for p, x in b.items():
            acc[p] = acc.get(p, 0) + x[k]; gin[p] = gin.get(p, 0) + (x["MIN"] >= 15)
    return sum(v / tot for p, v in acc.items() if not presentes(p) and gin[p] >= len(prev) / 2)


def player_models(games, det, before):
    """Por jugador: lista de partidos previos a 'before' (AAAA-MM-DD).
    También devuelve los box scores por equipo (para saber quién falta)."""
    seq, names, team, tempo = {}, {}, {}, {}
    for g in games:
        if g["at"][:10] >= before:
            break
        if is_preseason(g["at"][:10]):
            continue
        pl = (det.get(g["id"]) or {}).get("pl") or {}
        for s_ in ("h", "a"):
            t = str(g[s_]["id"])
            box = {pid: {"MIN": v["MIN"], **{k: stat_val(v, k) or 0 for k in STATS}}
                   for pid, v in pl.items() if str(v.get("t")) == t and (v.get("MIN") or 0) > 0}
            if not box:
                continue
            # cada temporada empieza de cero (si no, los que se fueron cuentan como bajas)
            temp = g["at"][:4] if g["at"][5:7] >= "08" else str(int(g["at"][:4]) - 1)
            if tempo.get(t) != temp:
                tempo[t] = temp; team[t] = []
            prev = team.get(t, [])
            m = {k: _miss(prev, box.__contains__, k) for k in STATS}
            for pid, x in box.items():
                v = pl[pid]
                loc = s_ == "h"
                rv = g["a"] if loc else g["h"]
                seq.setdefault(pid, []).append({**x, "_at": g["at"][:10], "_l": loc, "_vs": rv.get("ab") or rv.get("n"), "_m": m})
                names[pid] = (v.get("n"), v.get("t"))
            team.setdefault(t, []).append(box)
    return seq, names, team


def factor_ausencias(prev, team_prev, injured, keys):
    """Multiplicador de la media del jugador por compañeros fuera hoy."""
    last = prev[-15:]
    w = np.array([0.88 ** (len(last) - 1 - i) for i in range(len(last))])
    num = den = 0.0
    # fuera hoy: lesionado "Out" o habitual que no jugó los 2 últimos partidos del equipo
    rec = set().union(*team_prev[-2:]) if team_prev else set()
    for k in keys:
        hoy = _miss(team_prev, lambda p: p not in injured and p in rec, k)
        antes = float(np.sum(w * np.array([x.get("_m", {}).get(k, 0) for x in last])) / w.sum())
        sh = float(np.sum(w * np.array([x[k] for x in last])) / w.sum())
        d = hoy - antes
        if d < 0:   # hoy solo se conocen las bajas anunciadas (no los descansos sorpresa): bajar a la mitad
            d *= 0.5
        num += sh * (1 + B_AUS[k] * d); den += sh
    return max(0.7, min(1.4, num / den)) if den > 0 else 1.0


def prop_prob(prev, keys, line, fac=1.0):
    """P(más de la línea). Media: minutos esperados x producción por minuto
    reciente. Forma: binomial negativa con la dispersión real del jugador."""
    last = prev[-15:]
    w = np.array([0.88 ** (len(last) - 1 - i) for i in range(len(last))])
    mins = np.array([p["MIN"] for p in last])
    vals = np.array([sum(p[k] for k in keys) for p in last])
    mu = float(np.sum(w * mins) / w.sum()) * float(np.sum(w * vals) / max(np.sum(w * mins), 1))
    mu = max(mu * fac, 0.05)
    var = max(float(np.var(vals)), mu * 1.05, 0.5)
    k = np.arange(0, int(line) + 1)
    if var <= mu * 1.0001:
        from scipy.stats import poisson
        p_under = float(poisson.cdf(int(line), mu))
    else:
        r = mu * mu / (var - mu)
        from scipy.stats import nbinom
        p_under = float(nbinom.cdf(int(line), r, r / (r + mu)))
    return mu, 1 - p_under


def props(injured, days=None):
    games, det, _ = load("nba")
    out = []
    pdir = os.path.join(DATA, "props")
    hoy = (now() - dt.timedelta(hours=3)).strftime("%Y-%m-%d")
    files = sorted(f for f in os.listdir(pdir) if f.endswith(".json") and (days and f[:10] in days or not days and f[:10] >= hoy))
    for fn in files:
        db = json.load(open(os.path.join(pdir, fn), encoding="utf-8"))
        seq, names, team = player_models(games, det, fn[:10])
        for e, ev in db.items():
            if not days and ev["at"] <= now().strftime("%Y-%m-%dT%H:%MZ"):
                continue
            pairs = {}
            for p in ev["props"]:
                if p["t"] in PROP_TYPES and p["pl"] and p["ln"] is not None:
                    pairs.setdefault((p["pl"], p["t"], p["ln"]), []).append(float(p["o"]))
            for (pid, t, ln), odds in pairs.items():
                prev = seq.get(pid, [])
                if len(prev) < 5 or pid in injured:
                    continue
                fac = factor_ausencias(prev, team.get(str(names[pid][1]), []), injured, PROP_TYPES[t])
                mu, p_over = prop_prob(prev, PROP_TYPES[t], ln, fac)
                side = "mas" if p_over >= 0.5 else "menos"
                p = max(p_over, 1 - p_over)
                worst = min(odds)  # no se sabe cuál cuota es "más" y cuál "menos": se usa la peor
                ks = PROP_TYPES[t]
                q = min(1 / worst / 1.045, 0.97)
                pv = PESO["props"] * p + (1 - PESO["props"]) * q
                out.append({"ev": e, "at": ev["at"], "partido": ev["name"], "pl": pid, "jugador": names[pid][0],
                            "equipo": names[pid][1], "tipo": NOMBRE[t], "t": t, "linea": ln, "lado": side,
                            "esperado": round(mu, 1), "aus": round(fac - 1, 3), "p": round(pv, 4), "pm": round(p, 4), "cuota": worst,
                            "casa": round(1 / worst, 4), "valor": round(pv * worst - 1, 3),
                            "ult": [sum(x[k] for k in ks) for x in prev[-10:]],
                            # ficha del jugador (como IABET): últimos 40 partidos [valor, rival, local, fecha, minutos]
                            "hist": [[sum(x[k] for k in ks), x.get("_vs"), 1 if x.get("_l") else 0, x.get("_at"), round(x["MIN"])] for x in prev[-40:]][::-1],
                            "prom": round(float(np.mean([sum(x[k] for k in ks) for x in prev[-10:]])), 1)})
    out.sort(key=lambda x: -x["valor"])
    return out


# ---------------------------------------------------------------- forma
def form_table():
    """Últimos partidos de cada equipo (todas las ligas que tenemos)."""
    tab = {}
    for key in SOCCER + ["nba"]:
        games, _, _ = load(key)
        for g in games:
            if key == "nba" and is_preseason(g["at"][:10]):
                continue
            for s, o in (("h", "a"), ("a", "h")):
                me, op = g[s]["s"], g[o]["s"]
                tab.setdefault(g[s]["id"], []).append({
                    "at": g["at"], "lg": key, "r": "G" if me > op else ("E" if me == op else "P"),
                    "m": f"{me}-{op}", "vs": g[o]["ab"] or g[o]["n"], "logo": g[o]["logo"], "loc": s == "h"})
    for v in tab.values():
        v.sort(key=lambda x: x["at"])
    return tab


def h2h(key, h, a, n=5):
    games, _, _ = load(key)
    out = [{"at": g["at"], "h": g["h"]["ab"], "a": g["a"]["ab"], "m": f"{g['h']['s']}-{g['a']['s']}"}
           for g in games if {g["h"]["id"], g["a"]["id"]} == {h, a}]
    return out[-n:][::-1]


# ---------------------------------------------------------------- libreta
NOM = {"1": "Gana {h}", "2": "Gana {a}", "X": "Empate", "1X": "{h} o empate", "X2": "{a} o empate",
       "12": "No hay empate", "btts_si": "Ambos marcan", "btts_no": "No marcan ambos"}


def pick_name(m, g):
    if m in NOM:
        return NOM[m].format(h=g["h"]["n"], a=g["a"]["n"])
    if m.startswith("mas_") or m.startswith("menos_"):
        lado, ln = m.split("_", 1)
        u = "goles" if g["dep"] == "futbol" else "puntos"
        return ("Más" if lado == "mas" else "Menos") + f" de {ln} {u}"
    if m.startswith("hcp_"):
        _, who, ln = m.split("_")
        return (g["h"]["n"] if who == "local" else g["a"]["n"]) + " " + ln
    return m


def outcome(m, hs, as_):
    if m == "1": return hs > as_
    if m == "2": return hs < as_
    if m == "X": return hs == as_
    if m == "1X": return hs >= as_
    if m == "X2": return hs <= as_
    if m == "12": return hs != as_
    if m == "btts_si": return hs > 0 and as_ > 0
    if m == "btts_no": return not (hs > 0 and as_ > 0)
    if m.startswith("mas_"): return hs + as_ > float(m[4:])
    if m.startswith("menos_"): return hs + as_ < float(m[6:])
    if m.startswith("hcp_local_"): return hs - as_ + float(m[10:]) > 0
    if m.startswith("hcp_visita_"): return as_ - hs + float(m[11:]) > 0
    return None


FUENTE = "ESPN (site.api.espn.com)"
MODELO = {"partidos_futbol": "futbol-poisson-v2+casa", "partidos_nba": "nba-logit-v2+casa",
          "extra": "estadisticas-nb-v2", "props": "nba-jugadores-v1+casa"}


def version_codigo():
    v = os.environ.get("GITHUB_SHA")
    if v:
        return v[:7]
    try:
        import subprocess
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=os.path.dirname(__file__), text=True).strip()
    except Exception:
        return "local"


def estado_partido(m, hs, as_):
    """acierto / fallo / push (línea exacta en totales o hándicap entero)."""
    if m.startswith("mas_") or m.startswith("menos_"):
        ln = float(m.split("_", 1)[1])
        if hs + as_ == ln:
            return "push"
    if m.startswith("hcp_local_") and hs - as_ + float(m[10:]) == 0:
        return "push"
    if m.startswith("hcp_visita_") and as_ - hs + float(m[11:]) == 0:
        return "push"
    ok = outcome(m, hs, as_)
    return None if ok is None else "acierto" if ok else "fallo"


def ledger(partidos, props_, extras=None):
    """Registro inalterable (ver registro.py): cada pick se anota ANTES del partido la
    primera vez que se publica, no se edita, y se califica una sola vez al terminar."""
    import registro as R
    p = os.path.join(DATA, "ledger.json")
    L = json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {"partidos": {}, "props": {}, "extra": {}}
    L.setdefault("extra", {})
    R.migrar(L)
    ahora = now().strftime("%Y-%m-%dT%H:%M:%SZ")
    ahora_m = ahora[:16] + "Z"
    ver = version_codigo()
    vivos = set()
    # 1) anotar lo publicado en esta corrida (solo partidos que no han empezado)
    for g in partidos:
        if g["at"] <= ahora_m:
            continue
        base = {"at": g["at"], "ev": g["id"], "lg": g["lg"], "liga": g["liga"], "dep": g["dep"],
                "h": g["h"]["n"], "a": g["a"]["n"], "fuente": FUENTE, "ver": ver}
        ex = g.get("extra")
        if ex:
            for x in ex["picks"] + ex["jug"]:
                k = f"{g['id']}|{x['m']}"
                vivos.add(("extra", k))
                R.anotar(L, "extra", k, dict(base, hid=g["h"]["id"], aid=g["a"]["id"], m=x["m"], s=x["s"], sc=x["sc"],
                                            txt=x["txt"], p=x["p"], cuota=x["justa"], casa_real=False,
                                            modelo=MODELO["extra"]), ahora)
        pk = g.get("pick")
        if pk and not pk.get("bajo"):
            viejo = L["partidos"].get(g["id"])      # registro anterior al sello (clave = id del partido)
            if viejo and viejo.get("m") == pk["m"]:
                vivos.add(("partidos", g["id"]))
                continue
            k = f"{g['id']}|{pk['m']}"
            vivos.add(("partidos", k))
            R.anotar(L, "partidos", k, dict(base, hl=g["h"]["logo"], al=g["a"]["logo"], m=pk["m"],
                                            txt=pick_name(pk["m"], g), p=pk.get("pv", pk["p"]), pm=pk["p"],
                                            q=pk.get("casa"), tipo=pk.get("tipo"), valor=pk.get("valor"),
                                            cuota=pk.get("cuota") or pk["justa"], cuota_casa=bool(pk.get("cuota")),
                                            cq=ahora if pk.get("cuota") else None,
                                            modelo=MODELO["partidos_" + g["dep"]]), ahora)
    for x in props_:
        if x["at"] <= ahora_m:
            continue
        k = f"{x['ev']}_{x['pl']}_{x['t']}_{x['linea']}"
        vivos.add(("props", k))
        rec = {kk: x.get(kk) for kk in ("ev", "at", "pl", "jugador", "equipo", "partido", "t", "tipo", "linea", "lado",
                                         "p", "pm", "cuota", "casa", "valor")}
        R.anotar(L, "props", k, dict(rec, dep="nba", liga="NBA", cuota_casa=True, cq=ahora, fuente=FUENTE,
                                     modelo=MODELO["props"], ver=ver), ahora)
    # 2) antes del partido: un pick que el modelo ya no publica queda "retirado" (no cuenta)
    for coll in ("partidos", "extra", "props"):
        for k, e in L[coll].items():
            if not e.get("estado") and e["at"] > ahora_m:
                e["ret"] = (coll, k) not in vivos
    # 3) calificar (una sola vez)
    res, names = {}, {}
    for key in SOCCER + ["nba"]:
        games, det, _ = load(key)
        for g in games:
            res[g["id"]] = (g["h"]["s"], g["a"]["s"], det.get(g["id"]))
    from model import choques
    malos = set()
    for key in SOCCER:
        with open(os.path.join(DATA, "hist", key + ".json"), encoding="utf-8") as f:
            malos |= choques(json.load(f)["games"])
    for coll in ("partidos", "extra", "props"):
        for k, e in L[coll].items():
            if e.get("estado") or e["at"] > ahora_m:
                continue
            gid = e.get("ev") or k.split("|")[0]
            if e.get("ret"):
                R.calificar(L, coll, k, "retirado", motivo="el modelo cambió de pick antes del partido")
            elif gid in malos and gid not in res:
                R.calificar(L, coll, k, "nulo", motivo="partido dudoso en la fuente de datos")
            elif coll == "partidos" and gid in res:
                hs, as_ = res[gid][0], res[gid][1]
                est = estado_partido(e["m"], hs, as_)
                if est:
                    R.calificar(L, coll, k, est, res=f"{hs}-{as_}")
            elif coll == "props" and gid in res and res[gid][2]:
                v = (res[gid][2].get("pl") or {}).get(e["pl"])
                if not v:
                    R.calificar(L, coll, k, "nulo", motivo="el jugador no jugó")
                    continue
                tot = sum(stat_val(v, kk) or 0 for kk in PROP_TYPES[e["t"]])
                est = "push" if tot == e["linea"] else "acierto" if ((tot > e["linea"]) == (e["lado"] == "mas")) else "fallo"
                R.calificar(L, coll, k, est, real=tot)
            elif coll == "extra" and gid in res and res[gid][2]:
                ok, real = extra_outcome(e["m"], res[gid][2], e["hid"], e["aid"])
                if ok is None:
                    R.calificar(L, coll, k, "nulo", real=real, motivo="sin dato oficial de la estadística")
                else:
                    R.calificar(L, coll, k, "acierto" if ok else "fallo", real=real)
    okc, n, h, err = R.verificar(L)
    if not okc:
        raise SystemExit("REGISTRO ROTO: " + "; ".join(err))
    with open(p, "w", encoding="utf-8") as f:
        json.dump(L, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(DATA, "sello.json"), "w", encoding="utf-8") as f:
        json.dump({"t": ahora, "n": n, "h": h, "ver": ver}, f)
    historial(L, ahora, n, h)

    def stats(items):
        done = sorted([e for e in items if e.get("ok") is not None], key=lambda e: e["at"])
        if not done:
            return {"n": 0}
        w = sum(1 for e in done if e["ok"])
        racha, last = 0, done[-1]["ok"]
        for e in reversed(done):
            if e["ok"] != last:
                break
            racha += 1
        gan = sum((e["cuota"] - 1) if e["ok"] else -1 for e in done)
        return {"n": len(done), "g": w, "ef": round(100 * w / len(done), 1),
                "racha": f"{racha} {'G' if last else 'P'}",
                "cuota": round(sum(e["cuota"] for e in done) / len(done), 2),
                "unidades": round(gan, 2)}
    hist = sorted([dict(e, id=k) for k, e in L["partidos"].items() if e.get("ok") is not None],
                  key=lambda e: e["at"], reverse=True)[:60]
    hace7 = (now() - dt.timedelta(days=7)).strftime("%Y-%m-%dT%H:%MZ")
    sem = [e for e in list(L["partidos"].values()) + list(L["extra"].values()) if e["at"] >= hace7 and e.get("ok") is not None]
    semana = {"n": len(sem), "g": sum(1 for e in sem if e["ok"])}
    por = {}
    for e in L["extra"].values():
        por.setdefault(e["s"] + "_" + ("j" if e["sc"] == "j" else "t" if e["sc"] == "t" else "e"), []).append(e)
    val = [e for e in list(L["partidos"].values()) + list(L["props"].values())
           if (e.get("valor") or -1) >= VALOR_MIN and e.get("cuota")]
    return {"partidos": stats(L["partidos"].values()), "props": stats(L["props"].values()), "ultimos": hist,
            "valor": stats(val), "sello": {"n": n, "h": h, "t": ahora},
            "extra": stats(L["extra"].values()), "extra_por": {k: stats(v) for k, v in por.items()}, "semana": semana}


MERCADO = {"res": "Resultado", "cor": "Córners", "sot": "Tiros a puerta", "tir": "Tiros", "fal": "Faltas", "tar": "Tarjetas"}


def _mercado(coll, e):
    if coll == "props":
        return "Jugadores NBA · " + (e.get("tipo") or "")
    if coll == "extra":
        return MERCADO.get(e["s"], e["s"]) + (" (jugador)" if e["sc"] == "j" else " (partido)" if e["sc"] == "t" else " (equipo)")
    m = e["m"]
    if e.get("dep") == "nba":
        return "NBA · " + ("Total de puntos" if m.startswith(("mas_", "menos_")) else "Hándicap" if m.startswith("hcp") else "Ganador")
    return "Goles" if m.startswith(("mas_", "menos_", "btts")) else "Resultado"


def metricas(items):
    """Acierto, ROI real (solo con cuota de una casa), Brier, Log Loss y calibración."""
    g = [e for e in items if e.get("estado") in ("acierto", "fallo")]
    out = {"total": len(items), "calificados": len(g),
           "aciertos": sum(1 for e in g if e["estado"] == "acierto"), "fallos": sum(1 for e in g if e["estado"] == "fallo"),
           "push": sum(1 for e in items if e.get("estado") == "push"), "nulos": sum(1 for e in items if e.get("estado") == "nulo"),
           "retirados": sum(1 for e in items if e.get("estado") == "retirado"),
           "pendientes": sum(1 for e in items if not e.get("estado"))}
    if g:
        y = [1 if e["estado"] == "acierto" else 0 for e in g]
        pp = [min(max(float(e["p"]), 0.001), 0.999) for e in g]
        out["acierto"] = round(100 * sum(y) / len(y), 1)
        out["prob_media"] = round(100 * sum(pp) / len(pp), 1)
        out["brier"] = round(sum((a - b) ** 2 for a, b in zip(pp, y)) / len(y), 4)
        out["logloss"] = round(-sum(math.log(a) if b else math.log(1 - a) for a, b in zip(pp, y)) / len(y), 4)
        reales = [e for e in g if e.get("cuota_casa") or e.get("casa_real") or e.get("pl")]   # props NBA: cuota real
        if reales:
            gan = sum((e["cuota"] - 1) if e["estado"] == "acierto" else -1 for e in reales)
            out["roi"] = {"n": len(reales), "unidades": round(gan, 2), "pct": round(100 * gan / len(reales), 1)}
    return out


BANDAS = [(0.0, 0.5), (0.5, 0.55), (0.55, 0.6), (0.6, 0.65), (0.65, 0.7), (0.7, 0.75), (0.75, 0.8), (0.8, 1.01)]


def historial(L, ahora, n, h):
    """data/historial.json: lo que publica la página Historial (últimos 21 días de picks y
    métricas sobre TODO el registro)."""
    todos = []
    for coll in ("partidos", "extra", "props"):
        for k, e in L[coll].items():
            todos.append((coll, k, e))
    def dep(coll, e):
        return "nba" if coll == "props" or e.get("dep") == "nba" else "futbol"
    vis = [e for c, k, e in todos if e.get("estado") != "retirado" and not e.get("ret")]
    por_dep, por_mk, por_conf = {}, {}, {}
    for c, k, e in todos:
        if e.get("estado") == "retirado" or e.get("ret"):
            continue
        por_dep.setdefault(dep(c, e), []).append(e)
        por_mk.setdefault(_mercado(c, e), []).append(e)
        for lo, hi in BANDAS:
            if lo <= float(e["p"]) < hi:
                por_conf.setdefault(f"{round(lo * 100):02d}-{min(round(hi * 100), 100)}%", []).append(e)
    desde = (now() - dt.timedelta(days=14)).strftime("%Y-%m-%dT%H:%MZ")
    filas = []
    for c, k, e in todos:
        if e["at"] < desde:
            continue
        filas.append({"c": {"partidos": "g", "extra": "x", "props": "n"}[c], "k": k, "at": e["at"], "pub": e.get("pub"), "d": dep(c, e), "lg": e.get("liga") or e.get("lg"),
                      "pt": e.get("partido") or (f"{e['h']} vs {e['a']}" if e.get("h") else None),
                      "mk": _mercado(c, e), "sel": e.get("txt") or f"{e.get('jugador')}: {'más' if e.get('lado') == 'mas' else 'menos'} de {e.get('linea')} {(e.get('tipo') or '').lower()}",
                      "p": e["p"], "cu": e.get("cuota"), "cr": bool(e.get("cuota_casa")), "cq": e.get("cq"),
                      "st": e.get("estado"), "r": e.get("res") if e.get("res") is not None else e.get("real"),
                      "mo": e.get("motivo"), "rt": 1 if e.get("ret") else None, "md": e.get("modelo"), "v": e.get("ver"), "h": (e.get("h_") or "")[:12]})
    filas.sort(key=lambda r: (r["at"], r["k"]), reverse=True)
    out = {"generado": ahora, "sello": {"n": n, "h": h, "t": ahora},
           "global": metricas(vis),
           "deporte": {k: metricas(v) for k, v in por_dep.items()},
           "mercado": {k: metricas(v) for k, v in sorted(por_mk.items(), key=lambda kv: -len(kv[1]))},
           "confianza": {k: metricas(por_conf[k]) for k in sorted(por_conf)},
           "filas": filas}
    with open(os.path.join(DATA, "historial.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))


def _recorte(im, size):
    """Escudo: quita el borde transparente y lo centra en un cuadrado con 4 % de
    margen, así todos los escudos se ven del mismo tamaño."""
    from PIL import Image
    bb = im.getchannel("A").point(lambda a: 255 if a > 10 else 0).getbbox()
    if bb:
        im = im.crop(bb)
    lado = int(max(im.size) * 1.08)
    c = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    c.paste(im, ((lado - im.width) // 2, (lado - im.height) // 2))
    if lado > size:
        c = c.resize((size, size), Image.LANCZOS)
    return c


def _img(url, path, size, recorte=False):
    """Baja una imagen una sola vez, la achica y la guarda como PNG."""
    if os.path.exists(path):
        return True
    import urllib.request, urllib.error, io, time
    from PIL import Image
    for i in range(4):
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                im = Image.open(io.BytesIO(r.read())).convert("RGBA")
            if recorte:
                im = _recorte(im, size)
            else:
                im.thumbnail((size, size), Image.LANCZOS)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            im.save(path, optimize=True)
            return True
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return False
        except Exception:
            pass
        time.sleep(1 + i)
    return False


def _h(u):
    import hashlib
    return hashlib.md5(u.encode()).hexdigest()[:12]


def images(partidos, props_):
    """Escudos y fotos servidos desde la propia app (data/img/...)."""
    from concurrent.futures import ThreadPoolExecutor
    jobs = {}
    def team(t):
        if t and t.get("logo") and not t["logo"].startswith("data/"):
            u = t["logo"]
            rel = f"img/e5/{_h(u)}.png"
            jobs[rel] = (u, 500, True)
            t["logo"] = "data/" + rel
            # versión oficial para fondo oscuro (escudos negros se ven en blanco)
            ud = u.replace("/500/scoreboard/", "/500-dark/").replace("/500/", "/500-dark/")
            if ud != u:
                reld = f"img/e5/{_h(u)}d.png"
                jobs[reld] = (ud, 500, True)
                t["ld"] = "data/" + reld
    for g in partidos:
        team(g["h"]); team(g["a"])
        lg = (g.get("extra") or {}).get("lg") or {}
        for ab, u in list(lg.items()):
            if u and not u.startswith("data/"):
                rel = f"img/e5/{_h(u)}.png"
                jobs.setdefault(rel, (u, 500, True))
                lg[ab] = "data/" + rel
        for s in ("h", "a"):
            for r in (g.get("forma") or {}).get(s, []) + (g.get("ult") or {}).get(s, []):
                if r.get("logo") and not r["logo"].startswith("data/"):
                    rel = f"img/e5/{_h(r['logo'])}.png"
                    jobs.setdefault(rel, (r["logo"], 500, True))
                    r["logo"] = "data/" + rel
    # futbolistas: solo partidos de las próximas 36 h; las que no existen se recuerdan
    nofoto_p = os.path.join(DATA, "img", "nofoto.json")
    nofoto = set(json.load(open(nofoto_p))) if os.path.exists(nofoto_p) else set()
    limite = (now() + dt.timedelta(hours=36)).strftime("%Y-%m-%dT%H:%MZ")
    fjobs = {}
    for g in partidos:
        for x in (g.get("extra") or {}).get("jug", []):
            rel = f"img/f2/{x['pid']}.png"
            if os.path.exists(os.path.join(DATA, rel)):
                x["foto"] = "data/" + rel
            elif g["at"] <= limite and x["pid"] not in nofoto:
                fjobs[rel] = (f"https://a.espncdn.com/i/headshots/soccer/players/full/{x['pid']}.png", 400)
    for x in props_:
        rel = f"img/p2/{x['pl']}.png"   # 400 px: la foto llena el alto de la ficha y debe verse nítida
        jobs[rel] = (f"https://a.espncdn.com/i/headshots/nba/players/full/{x['pl']}.png", 400)
        x["foto"] = "data/" + rel
        if x.get("eq"):
            team(dict(x["eq"]))
    with ThreadPoolExecutor(4) as ex:
        ok = list(ex.map(lambda kv: (kv[0], _img(kv[1][0], os.path.join(DATA, kv[0]), *kv[1][1:])), jobs.items()))
    bad = {k for k, v in ok if not v}
    with ThreadPoolExecutor(6) as ex:
        okf = list(ex.map(lambda kv: (kv[0], _img(kv[1][0], os.path.join(DATA, kv[0]), kv[1][1])), fjobs.items()))
    for k, v in okf:
        if not v:
            nofoto.add(k.split("/")[-1][:-4])
    os.makedirs(os.path.dirname(nofoto_p), exist_ok=True)
    json.dump(sorted(nofoto), open(nofoto_p, "w"))
    for g in partidos:
        for x in (g.get("extra") or {}).get("jug", []):
            if os.path.exists(os.path.join(DATA, f"img/f2/{x['pid']}.png")):
                x["foto"] = f"data/img/f2/{x['pid']}.png"
    # los que ESPN no tiene: foto recortada de FotMob (nombre y equipo deben coincidir)
    try:
        import fotos
        faltan = [(x["pid"], x["jugador"], g[x.get("side") or "h"]["n"]) for g in partidos if g["at"] <= limite
                  for x in (g.get("extra") or {}).get("jug", []) if not x.get("foto")]
        wf = fotos.completar(faltan)
        for g in partidos:
            for x in (g.get("extra") or {}).get("jug", []):
                if not x.get("foto") and str(x["pid"]) in wf:
                    x["foto"] = "data/" + wf[str(x["pid"])]
    except Exception as e:
        print("fotos wikimedia:", e)
    # si una imagen no se pudo bajar, la app muestra la sigla
    for g in partidos:
        for s in ("h", "a"):
            if (g[s].get("logo") or "")[5:] in bad:
                g[s]["logo"] = None
            if (g[s].get("ld") or "")[5:] in bad:
                g[s].pop("ld", None)
            for r in (g.get("forma") or {}).get(s, []) + (g.get("ult") or {}).get(s, []):
                if (r.get("logo") or "")[5:] in bad:
                    r["logo"] = None
        lg = (g.get("extra") or {}).get("lg") or {}
        for ab, u in list(lg.items()):
            if (u or "")[5:] in bad:
                lg[ab] = None
    for x in props_:
        if (x["foto"] or "")[5:] in bad:
            x["foto"] = None


def liga_logos():
    """Logo de cada liga (se baja una sola vez a data/img/l/)."""
    out = {}
    for key, (sp, code, name) in LEAGUES.items():
        rel = f"img/l2/{key}.png"
        path = os.path.join(DATA, rel)
        if not os.path.exists(path):
            d = get(f"https://site.api.espn.com/apis/site/v2/sports/{sp}/{code}/scoreboard") or {}
            try:
                href = d["leagues"][0]["logos"][0]["href"]
                _img(href, path, 200)
            except Exception:
                pass
        out[key] = {"n": name, "logo": ("data/" + rel) if os.path.exists(path) else None}
    return out


def main():
    pesos()
    r = rep()
    par = r["parametros"]
    f = soccer(par["futbol"], r)
    ex = extra_predict(soon, now().date().toordinal())
    for g in f:
        x = ex.get(g["id"])
        if x:
            if g["lg"] in LIGAS_SIMPLES:   # pedido del usuario: sin tiros, tiros a puerta ni faltas
                x["grupos"] = [q for q in x["grupos"] if q.get("s") in MERCADOS_SIMPLES]
                x["picks"] = [q for q in x["picks"] if q.get("s") in MERCADOS_SIMPLES]
                x["jug"] = [q for q in x["jug"] if q.get("s") in MERCADOS_SIMPLES]
            x["jug"] = x["jug"][:30]
            g["extra"] = x
    nb, injured = nba(par["nba"])
    pr = props(injured)
    tab = form_table()
    for g in f + nb:
        g["pick"]["txt"] = pick_name(g["pick"]["m"], g)
        for s in g["mercados"]:
            s["txt"] = pick_name(s["m"], g)
        g["forma"] = {s: [dict(r) for r in tab.get(g[s]["id"], [])[-5:][::-1]] for s in ("h", "a")}
        g["ult"] = {s: [dict(r) for r in tab.get(g[s]["id"], [])[-20:][::-1]] for s in ("h", "a")}   # ficha del pick: 5G/10G/20G
        g["h2h"] = h2h(g["lg"], g["h"]["id"], g["a"]["id"])
    # equipos de los jugadores (logo y sigla)
    teams = {}
    for g in nb:
        for s in ("h", "a"):
            teams[g[s]["id"]] = {"ab": g[s]["ab"], "logo": g[s]["logo"], "ld": g[s].get("ld"), "n": g[s]["n"]}
    for x in pr:
        x["eq"] = teams.get(x["equipo"])
    from venues import completar
    print("estadios nuevos buscados:", completar(f + nb))
    rec = ledger(f + nb, pr)
    xrep = json.load(open(os.path.join(DATA, "model", "extra.json"), encoding="utf-8"))
    images(f + nb, pr)
    res = {
        "generado": now().strftime("%Y-%m-%dT%H:%MZ"),
        "aviso": "Pronósticos estadísticos. No garantizan resultados. Apuesta con responsabilidad.",
        "acierto": {
            "futbol_1x2": r["futbol"]["1X2_acierto"], "futbol_partidos": r["futbol"]["partidos_prueba"],
            "nba_ganador": r["nba"]["ganador"]["acierto_con_ausencias_y_cansancio"],
            "nba_partidos": r["nba"]["partidos_prueba"], "calibracion_futbol": r["futbol"]["calibracion"],
            "calibracion_nba": r["nba"]["calibracion_ganador"],
            "extra": {k: {"titulo": v["titulo"], "picks": v["picks"], "acierto": v["acierto_picks"],
                          "dijo": v["dijo_picks"], "publicar": v["publicar"]} for k, v in xrep["mercados"].items()},
        },
        "cuota_min": CUOTA_MIN, "valor_min": VALOR_MIN, "margen": MARGEN, "peso": PESO,
        "registro": rec,
        "ligas": liga_logos(),
        "partidos": sorted(f + nb, key=lambda x: x["at"]),
        "props": pr[:300],
        "props_en_prueba": True,
    }
    with open(os.path.join(DATA, "picks.json"), "w", encoding="utf-8") as fo:
        json.dump(res, fo, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(f)} partidos de fútbol, {len(nb)} de NBA, {len(pr)} props; registro {rec['partidos']}")


if __name__ == "__main__":
    main()
