"""CASHBET - modelo de pronósticos y prueba honesta de acierto.

Regla de oro: para pronosticar un partido el modelo SOLO usa partidos
anteriores a ese día (prueba "hacia adelante", sin mirar el futuro).
Los ajustes se eligen con el periodo de calibración (hasta CORTE) y el
acierto se informa SOLO con los partidos posteriores, que el modelo
nunca usó para elegir sus ajustes.

Uso:  python model.py            -> prueba de acierto, guarda data/model/report.json
"""
import json, os, math, datetime as dt
import numpy as np
from scipy.optimize import minimize
from scipy.stats import poisson, norm
from sklearn.linear_model import LogisticRegression

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
CORTE = "2026-02-01"          # antes: calibración / después: prueba
SOCCER = ["eng.1", "esp.1", "ita.1", "ger.1", "fra.1", "uefa.champions", "col.1", "mex.1"]
# SOCCER entrena los modelos (sin cambios). SOCCER_PRED también pronostica las ligas nuevas
# (experimentales) con esos mismos ajustes; solo las que ya tienen historial descargado.
from ligas import NUEVAS as _NUEVAS
SOCCER_PRED = SOCCER + [k for k in _NUEVAS if os.path.exists(os.path.join(DATA, "hist", k + ".json"))]


def day(at):
    return dt.date.fromisoformat(at[:10]).toordinal()


def load(key):
    with open(os.path.join(DATA, "hist", key + ".json"), encoding="utf-8") as f:
        g = json.load(f)["games"]
    try:
        with open(os.path.join(DATA, "detail", key + ".json"), encoding="utf-8") as f:
            det = json.load(f)
    except FileNotFoundError:
        det = {}
    ahora = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
    games = [x for x in g.values() if x["st"] == "post" and x["h"] and x["a"] and x["at"] <= ahora
             and x["h"]["s"] is not None and x["a"]["s"] is not None]
    games.sort(key=lambda x: x["at"])
    pre = [x for x in g.values() if x["st"] == "pre"]
    if key != "nba":
        malos = choques(g)
        pre = [x for x in pre if x["id"] not in malos]
    return games, det, pre


def choques(g, horas=44):
    """Partidos de fútbol con datos imposibles: un equipo con otro partido a
    menos de 'horas' (la fuente a veces repite partidos o deja fechas viejas)."""
    por = {}
    for x in g.values():
        if not x.get("h") or not x.get("a"):
            continue
        t = dt.datetime.fromisoformat(x["at"].replace("Z", ""))
        for s in ("h", "a"):
            por.setdefault(x[s]["id"], []).append((t, x["id"], x["st"]))
    # "bloque de relleno": 5 o más partidos sin jugar a la misma hora exacta
    # (la fuente pone así fechas aún sin confirmar)
    hora = {}
    for x in g.values():
        if x.get("st") == "pre":
            hora.setdefault(x["at"], []).append(x["id"])
    bloque = {i for ids in hora.values() if len(ids) >= 5 for i in ids}
    ahora = dt.datetime.utcnow()
    malos = set()
    for xs in por.values():
        xs.sort()
        for (t1, i1, s1), (t2, i2, s2) in zip(xs, xs[1:]):
            if (t2 - t1).total_seconds() >= horas * 3600:
                continue
            par = [(t1, i1, s1), (t2, i2, s2)]
            dudosos = [i for t, i, st in par if st != "post" or t > ahora]
            # si uno está en el bloque de relleno y el otro no, solo cae el del bloque
            en_b = [i for i in dudosos if i in bloque]
            fuera = [i for t, i, st in par if i not in bloque]
            malos |= set(en_b) if en_b and fuera else set(dudosos)
    # un "terminado" con fecha futura nunca vale
    malos |= {x["id"] for x in g.values() if x.get("st") == "post" and dt.datetime.fromisoformat(x["at"].replace("Z", "")) > ahora}
    return malos


# ---------------------------------------------------------------- fútbol
class Poi:
    """Fuerza de ataque/defensa de cada equipo (modelo de Poisson con
    olvido exponencial y freno hacia el promedio)."""

    def __init__(self, n):
        self.p = np.zeros(n * 2 + 2)
        self.n = n

    def fit(self, hi, ai, yh, ya, w, ridge):
        n = self.n

        def f(p):
            mu, hf, att, dfn = p[0], p[1], p[2:2 + n], p[2 + n:]
            lh = np.exp(mu + hf + att[hi] - dfn[ai])
            la = np.exp(mu + att[ai] - dfn[hi])
            ll = np.sum(w * (lh - yh * np.log(lh))) + np.sum(w * (la - ya * np.log(la)))
            ll += ridge * (att @ att + dfn @ dfn)
            rh, ra = w * (lh - yh), w * (la - ya)
            g = np.empty_like(p)
            g[0] = rh.sum() + ra.sum()
            g[1] = rh.sum()
            g[2:2 + n] = np.bincount(hi, rh, n) + np.bincount(ai, ra, n) + 2 * ridge * att
            g[2 + n:] = -np.bincount(ai, rh, n) - np.bincount(hi, ra, n) + 2 * ridge * dfn
            return ll, g

        self.p = minimize(f, self.p, jac=True, method="L-BFGS-B").x

    def lam(self, h, a):
        n, p = self.n, self.p
        return (math.exp(p[0] + p[1] + p[2 + h] - p[2 + n + a]),
                math.exp(p[0] + p[2 + a] - p[2 + n + h]))


def score_matrix(lh, la, rho):
    k = np.arange(11)
    m = np.outer(poisson.pmf(k, lh), poisson.pmf(k, la))
    # corrección Dixon-Coles para marcadores bajos (0-0, 1-1, 1-0, 0-1)
    m[0, 0] *= 1 - lh * la * rho
    m[0, 1] *= 1 + lh * rho
    m[1, 0] *= 1 + la * rho
    m[1, 1] *= 1 - rho
    return m / m.sum()


def soccer_markets(lh, la, lc, rho, disp):
    m = score_matrix(lh, la, rho)
    i, j = np.indices(m.shape)
    tot = i + j
    out = {
        "1": m[i > j].sum(), "X": m[i == j].sum(), "2": m[i < j].sum(),
        "btts": m[(i > 0) & (j > 0)].sum(),
    }
    for ln in (1.5, 2.5, 3.5):
        out[f"o{ln}"] = m[tot > ln].sum()
    # córners: binomial negativa (los córners varían más que un Poisson)
    if lc:
        r = lc / max(disp - 1, 1e-6)
        pr = r / (r + lc)
        for ln in (8.5, 9.5, 10.5):
            out[f"c{ln}"] = 1 - float(np.sum([_nb(k, r, pr) for k in range(int(ln) + 1)]))
    return out


def _nb(k, r, p):
    return math.exp(math.lgamma(k + r) - math.lgamma(r) - math.lgamma(k + 1) + r * math.log(p) + k * math.log(1 - p))


def soccer_walk(key, xi, ridge, wsot):
    """Recorre la liga fecha por fecha. Devuelve lista de (partido, lambdas)."""
    games, det, pre = load(key)
    teams = {}
    for g in games + pre:
        for s in ("h", "a"):
            teams.setdefault(g[s]["id"], len(teams))
    n = len(teams)
    mg, ms, mc = Poi(n), Poi(n), Poi(n)
    seen = {t: 0 for t in teams}
    out = []
    H, A, YH, YA, SH, SA, CH, CA, D, HASC = [], [], [], [], [], [], [], [], [], []
    by_day = {}
    for g in games:
        by_day.setdefault(g["at"][:10], []).append(g)
    days = sorted(by_day)
    for di, d in enumerate(days):
        today = day(d)
        if len(H) >= 30:
            w = np.exp(-xi * (today - np.array(D)))
            hi, ai = np.array(H), np.array(A)
            mg.fit(hi, ai, np.array(YH, float), np.array(YA, float), w, ridge)
            if wsot:
                ms.fit(hi, ai, np.array(SH, float), np.array(SA, float), w, ridge)
            hc = np.array(HASC)
            if hc.sum() > 30:
                mc.fit(hi[hc], ai[hc], np.array(CH, float)[hc], np.array(CA, float)[hc], w[hc], ridge)
            # goles por remate al arco en la liga (para pasar remates a goles)
            conv = (np.sum(w * (np.array(YH) + np.array(YA))) / max(np.sum(w * (np.array(SH) + np.array(SA))), 1))
            for g in by_day[d]:
                h, a = teams[g["h"]["id"]], teams[g["a"]["id"]]
                if seen[g["h"]["id"]] < 4 or seen[g["a"]["id"]] < 4:
                    continue
                gh, ga = mg.lam(h, a)
                if wsot:
                    sh, sa = ms.lam(h, a)
                    gh = math.exp((1 - wsot) * math.log(gh) + wsot * math.log(sh * conv))
                    ga = math.exp((1 - wsot) * math.log(ga) + wsot * math.log(sa * conv))
                ch, ca = mc.lam(h, a) if hc.sum() > 30 else (None, None)
                out.append((g, gh, ga, (ch + ca) if ch else None))
        for g in by_day[d]:
            h, a = teams[g["h"]["id"]], teams[g["a"]["id"]]
            tm = (det.get(g["id"]) or {}).get("tm") or {}
            th, ta = tm.get(g["h"]["id"]) or {}, tm.get(g["a"]["id"]) or {}
            H.append(h); A.append(a); D.append(today)
            YH.append(g["h"]["s"]); YA.append(g["a"]["s"])
            # si no hay remates al arco, usar los goles como reemplazo
            SH.append(th.get("shotsOnTarget") if th.get("shotsOnTarget") is not None else g["h"]["s"] * 3)
            SA.append(ta.get("shotsOnTarget") if ta.get("shotsOnTarget") is not None else g["a"]["s"] * 3)
            okc = th.get("wonCorners") is not None and ta.get("wonCorners") is not None
            HASC.append(okc)
            CH.append(th.get("wonCorners") or 0); CA.append(ta.get("wonCorners") or 0)
            seen[g["h"]["id"]] += 1; seen[g["a"]["id"]] += 1
    return out, det


def soccer_outcomes(g, det):
    hs, as_ = g["h"]["s"], g["a"]["s"]
    tm = (det.get(g["id"]) or {}).get("tm") or {}
    c = None
    try:
        c = tm[g["h"]["id"]]["wonCorners"] + tm[g["a"]["id"]]["wonCorners"]
    except Exception:
        pass
    o = {"1": hs > as_, "X": hs == as_, "2": hs < as_, "btts": hs > 0 and as_ > 0}
    for ln in (1.5, 2.5, 3.5):
        o[f"o{ln}"] = hs + as_ > ln
    if c is not None:
        for ln in (8.5, 9.5, 10.5):
            o[f"c{ln}"] = c > ln
    return o


# ---------------------------------------------------------------- medición
def logloss(p, y):
    p = min(max(p, 1e-6), 1 - 1e-6)
    return -math.log(p if y else 1 - p)


def evaluate(rows):
    """rows: lista de (mercado, prob, resultado). Devuelve por mercado:
    log-loss del modelo vs. tasa base (lo que pasa en promedio), y
    calibración por rangos de confianza."""
    res = {}
    by = {}
    for mk, p, y in rows:
        by.setdefault(mk, []).append((p, y))
    for mk, xs in by.items():
        base = sum(y for _, y in xs) / len(xs)
        res[mk] = {
            "n": len(xs),
            "ll": sum(logloss(p, y) for p, y in xs) / len(xs),
            "ll_base": sum(logloss(base, y) for _, y in xs) / len(xs),
            "acierto": sum((p > 0.5) == y for p, y in xs) / len(xs),
            "acierto_base": max(base, 1 - base),
        }
    return res


def calib(rows, lo=0.5):
    """Para cada pick (lado con prob >= 50%): ¿cuántas veces acierta de verdad?"""
    bins = [(0.5, 0.6), (0.6, 0.7), (0.7, 0.8), (0.8, 0.9), (0.9, 1.01)]
    out = []
    for a, b in bins:
        xs = []
        for _, p, y in rows:
            q, yy = (p, y) if p >= 0.5 else (1 - p, not y)
            if a <= q < b:
                xs.append((q, yy))
        if xs:
            out.append({"rango": f"{int(a*100)}-{min(int(b*100),100)}%", "n": len(xs),
                        "dijo": round(100 * sum(q for q, _ in xs) / len(xs), 1),
                        "paso": round(100 * sum(y for _, y in xs) / len(xs), 1)})
    return out


def soccer_rows(xi, ridge, wsot, rho, disp, period):
    rows = []
    for key in SOCCER:
        walk, det = soccer_walk(key, xi, ridge, wsot)
        for g, gh, ga, lc in walk:
            if (g["at"][:10] < CORTE) != (period == "cal"):
                continue
            pm = soccer_markets(gh, ga, lc, rho, disp)
            ob = soccer_outcomes(g, det)
            for mk, p in pm.items():
                if mk in ob:
                    rows.append((mk, float(p), bool(ob[mk]), key))
    return rows


def tune_soccer():
    best = None
    cache = {}
    for xi in (0.0015, 0.003):
        for ridge in (6.0, 12.0):
            for wsot in (0.7, 0.85, 1.0):
                walks = {k: soccer_walk(k, xi, ridge, wsot) for k in SOCCER}
                cache[(xi, ridge, wsot)] = walks
                for rho in (0.0, -0.1):
                    rows = []
                    for k, (walk, det) in walks.items():
                        for g, gh, ga, lc in walk:
                            if g["at"][:10] >= CORTE:
                                continue
                            pm = soccer_markets(gh, ga, None, rho, 1)
                            ob = soccer_outcomes(g, det)
                            rows += [(m, pm[m], ob[m]) for m in ("1", "X", "2", "o2.5", "btts")]
                    s = sum(logloss(p, y) for _, p, y in rows) / len(rows)
                    print(f"  fútbol xi={xi} freno={ridge} remates={wsot} rho={rho}: {s:.4f}")
                    if best is None or s < best[0]:
                        best = (s, xi, ridge, wsot, rho)
    # dispersión de córners: probar en calibración
    _, xi, ridge, wsot, rho = best
    walks = cache[(xi, ridge, wsot)]
    bd = None
    for disp in (1.6, 2.0, 2.5, 3.0, 4.0):
        rows = []
        for k, (walk, det) in walks.items():
            for g, gh, ga, lc in walk:
                if g["at"][:10] >= CORTE or not lc:
                    continue
                pm = soccer_markets(gh, ga, lc, rho, disp)
                ob = soccer_outcomes(g, det)
                rows += [(m, pm[m], ob[m]) for m in ("c8.5", "c9.5", "c10.5") if m in ob]
        s = sum(logloss(p, y) for _, p, y in rows) / max(len(rows), 1)
        if bd is None or s < bd[0]:
            bd = (s, disp)
    return {"xi": xi, "ridge": ridge, "wsot": wsot, "rho": rho, "disp": bd[1]}, walks


def cal_mercado(walks, par, ligas, pmin=0.6):
    out = {}
    for key in ligas:
        if key not in walks:
            continue
        walk, det = walks[key]
        st = {}
        for g, gh, ga, lc in walk:
            pm = soccer_markets(gh, ga, None, par["rho"], 1)
            ob = soccer_outcomes(g, det)
            mk = {"1": (pm["1"], ob["1"]), "2": (pm["2"], ob["2"]), "X": (pm["X"], ob["X"]),
                  "1X": (pm["1"] + pm["X"], ob["1"] or ob["X"]), "X2": (pm["X"] + pm["2"], ob["X"] or ob["2"]),
                  "12": (pm["1"] + pm["2"], not ob["X"]),
                  "btts_si": (pm["btts"], ob["btts"]), "btts_no": (1 - pm["btts"], not ob["btts"])}
            for ln in (1.5, 2.5, 3.5):
                mk[f"mas_{ln}"] = (pm[f"o{ln}"], ob[f"o{ln}"])
                mk[f"menos_{ln}"] = (1 - pm[f"o{ln}"], not ob[f"o{ln}"])
            for m, (p, y) in mk.items():
                if p >= pmin:
                    x = st.setdefault(m, [0, 0.0, 0])
                    x[0] += 1; x[1] += float(p); x[2] += bool(y)
        out[key] = {m: {"n": n, "dijo": round(sp / n, 4), "paso": round(sy / n, 4)} for m, (n, sp, sy) in st.items()}
    return out


# ---------------------------------------------------------------- NBA
def nba_teams(games):
    from collections import Counter
    c = Counter()
    for g in games:
        c[g["h"]["id"]] += 1; c[g["a"]["id"]] += 1
    return {t for t, k in c.most_common(30)}


def is_preseason(d):
    return ("2025-10-01" <= d <= "2025-10-20") or ("2026-10-01" <= d <= "2026-10-19")


def nba_absence(games, det):
    """Para cada partido y equipo: % de los puntos recientes del equipo que
    hacen jugadores habituales que NO jugaron (lesión/descanso)."""
    hist = {}  # equipo -> lista de {jugador: (min, pts)} de partidos previos
    miss = {}
    for g in games:
        pl = (det.get(g["id"]) or {}).get("pl") or {}
        for s in ("h", "a"):
            t = g[s]["id"]
            prev = hist.get(t, [])[-10:]
            m = 0.0
            if len(prev) >= 3:
                tot_pts = sum(sum(v[1] for v in box.values()) for box in prev) or 1
                played_now = {pid for pid, v in pl.items() if v.get("t") == t}
                pts = {}
                games_in = {}
                for box in prev:
                    for pid, (mn, pt) in box.items():
                        pts[pid] = pts.get(pid, 0) + pt
                        games_in[pid] = games_in.get(pid, 0) + (mn >= 15)
                if pl:
                    for pid, v in pts.items():
                        if games_in[pid] >= len(prev) / 2 and pid not in played_now:
                            m += v / tot_pts
            miss[(g["id"], t)] = m
            box = {pid: (v.get("MIN") or 0, v.get("PTS") or 0) for pid, v in pl.items() if v.get("t") == t}
            if box:
                hist.setdefault(t, []).append(box)
    return miss


def nba_walk(xi, ridge):
    games, det, pre = load("nba")
    keep = nba_teams(games)
    games = [g for g in games if g["h"]["id"] in keep and g["a"]["id"] in keep and not is_preseason(g["at"][:10])]
    teams = {t: i for i, t in enumerate(sorted(keep))}
    miss = nba_absence(games, det)
    last = {}
    rows = []
    X, Y, D = [], [], []
    by_day = {}
    for g in games:
        # fecha local aprox. (hora EE.UU.): restar 6 h
        d = (dt.datetime.fromisoformat(g["at"].replace("Z", "")) - dt.timedelta(hours=6)).date().isoformat()
        by_day.setdefault(d, []).append(g)
    n = len(teams)
    for d in sorted(by_day):
        today = dt.date.fromisoformat(d).toordinal()
        if len(Y) >= 120:
            w = np.exp(-xi * (today - np.array(D)))
            Xa, Ya = np.array(X), np.array(Y)
            # ridge ponderado: puntos = media + local + ataque - defensa rival
            Wx = Xa * w[:, None]
            R = np.eye(Xa.shape[1]) * ridge; R[0, 0] = R[1, 1] = 0
            beta = np.linalg.solve(Xa.T @ Wx + R, Wx.T @ Ya)
            for g in by_day[d]:
                h, a = teams[g["h"]["id"]], teams[g["a"]["id"]]
                ph = beta[0] + beta[1] + beta[2 + h] - beta[2 + n + a]
                pa = beta[0] + beta[2 + a] - beta[2 + n + h]
                rh = today - last.get(g["h"]["id"], -99)
                ra = today - last.get(g["a"]["id"], -99)
                rows.append({"g": g, "d": d, "ph": ph, "pa": pa,
                             "b2b_h": rh == 1, "b2b_a": ra == 1,
                             "mh": miss[(g["id"], g["h"]["id"])], "ma": miss[(g["id"], g["a"]["id"])]})
        for g in by_day[d]:
            h, a = teams[g["h"]["id"]], teams[g["a"]["id"]]
            for s, o, home in ((h, a, 1), (a, h, 0)):
                x = np.zeros(2 + 2 * n); x[0] = 1; x[1] = home; x[2 + s] = 1; x[2 + n + o] = -1
                X.append(x); D.append(today)
            Y.append(g["h"]["s"]); Y.append(g["a"]["s"])
            last[g["h"]["id"]] = today; last[g["a"]["id"]] = today
    return rows, games, det


def nba_eval():
    best = None
    for xi in (0.005, 0.012, 0.025):
        for ridge in (5.0, 20.0):
            rows, _, _ = nba_walk(xi, ridge)
            cal = [r for r in rows if r["d"] < CORTE]
            e = sum(abs((r["ph"] - r["pa"]) - (r["g"]["h"]["s"] - r["g"]["a"]["s"])) for r in cal) / len(cal)
            print(f"  NBA xi={xi} freno={ridge}: error medio del margen {e:.2f}")
            if best is None or e < best[0]:
                best = (e, xi, ridge, rows)
    _, xi, ridge, rows = best
    # el inicio de temporada (ratings aún verdes) no sirve para fijar la escala
    cal = [r for r in rows if "2025-11-20" <= r["d"] < CORTE]
    test = [r for r in rows if r["d"] >= CORTE]

    def feats(r):
        return np.array([r["ph"] - r["pa"], r["mh"] - r["ma"], float(r["b2b_h"]) - float(r["b2b_a"])])

    # 2a etapa (ausencias y cansancio): se ajusta SOLO con calibración
    Fc = np.array([feats(r) for r in cal])
    yc = np.array([r["g"]["h"]["s"] - r["g"]["a"]["s"] for r in cal])
    coef = np.linalg.lstsq(np.c_[Fc, np.ones(len(Fc))], yc, rcond=None)[0]
    sd0 = float(np.std(yc - Fc[:, 0]))
    sd1 = float(np.std(yc - np.c_[Fc, np.ones(len(Fc))] @ coef))
    Ft = np.array([feats(r) for r in test])
    yt = np.array([r["g"]["h"]["s"] - r["g"]["a"]["s"] for r in test])
    tt = np.array([r["g"]["h"]["s"] + r["g"]["a"]["s"] for r in test])
    m0 = Ft[:, 0]
    # reajuste mensual de la 2a etapa con TODO lo ya jugado (nunca el futuro),
    # sin los primeros días de cada temporada
    def usable(r):
        return not (r["d"][5:7] == "10" or ("11-01" <= r["d"][5:] <= "11-19"))
    m1 = np.empty(len(test)); p1 = np.empty(len(test)); p0 = np.empty(len(test))
    cur = None
    for i, r in enumerate(test):
        mon = r["d"][:7]
        if mon != cur:
            cur = mon
            past = [q for q in rows if q["d"] < mon + "-01" and usable(q)]
            Fp = np.array([feats(q) for q in past])
            yp = np.array([q["g"]["h"]["s"] - q["g"]["a"]["s"] for q in past])
            Xp = np.c_[Fp, np.ones(len(Fp))]
            c = np.linalg.lstsq(Xp, yp, rcond=None)[0]
            s1 = float(np.std(yp - Xp @ c))
            c0 = np.linalg.lstsq(np.c_[Fp[:, :1], np.ones(len(Fp))], yp, rcond=None)[0]
            s0 = float(np.std(yp - np.c_[Fp[:, :1], np.ones(len(Fp))] @ c0))
            lr1 = LogisticRegression(C=1.0).fit(Fp, yp > 0)
            lr0 = LogisticRegression(C=1.0).fit(Fp[:, :1], yp > 0)
        m1[i] = np.r_[Ft[i], 1] @ c
        p1[i] = lr1.predict_proba(Ft[i:i + 1])[0, 1]
        p0[i] = lr0.predict_proba(Ft[i:i + 1, :1])[0, 1]
    coef, sd1 = c, s1
    win = yt > 0
    home_rate = float(np.mean([r["g"]["h"]["s"] > r["g"]["a"]["s"] for r in cal]))
    totp = np.array([r["ph"] + r["pa"] for r in test])
    rep = {
        "ajustes": {"xi": xi, "freno": ridge, "coef_margen": round(coef[0], 3),
                    "pts_por_ausencias": round(coef[1], 2), "pts_por_b2b": round(coef[2], 2)},
        "partidos_prueba": len(test),
        "ganador": {
            "acierto_solo_ratings": round(100 * float(np.mean((p0 > 0.5) == win)), 1),
            "acierto_con_ausencias_y_cansancio": round(100 * float(np.mean((p1 > 0.5) == win)), 1),
            "acierto_siempre_local": round(100 * float(np.mean(win)), 1),
            "ll_solo_ratings": round(float(np.mean([logloss(p, y) for p, y in zip(p0, win)])), 4),
            "ll_con_factores": round(float(np.mean([logloss(p, y) for p, y in zip(p1, win)])), 4),
            "ll_base": round(float(np.mean([logloss(home_rate, y) for y in win])), 4),
        },
        "margen_error_medio": round(float(np.mean(np.abs(m1 - yt))), 2),
        "total_error_medio": round(float(np.mean(np.abs(totp - tt))), 2),
        "total_error_medio_base": round(float(np.mean(np.abs(np.mean([r["g"]["h"]["s"] + r["g"]["a"]["s"] for r in cal]) - tt))), 2),
        "calibracion_ganador": calib([("w", float(p), bool(y)) for p, y in zip(p1, win)]),
    }
    return rep, {"xi": xi, "ridge": ridge, "coef": coef.tolist(), "sd": sd1}


# ---------------------------------------------------------------- props NBA
STATS = {"PTS": "PTS", "REB": "REB", "AST": "AST", "3PM": "3PT"}


def stat_val(v, k):
    x = v.get(STATS[k])
    if isinstance(x, list):
        return x[0]
    return x


def props_eval(games, det):
    """Pronóstico de puntos/rebotes/asistencias/triples de cada jugador:
    minutos esperados x producción por minuto reciente (con olvido).
    Se compara contra el promedio simple de la temporada."""
    seq = {}
    err = {k: [0, 0, 0] for k in STATS}  # suma |modelo|, suma |base|, n
    resid = {k: [] for k in STATS}
    for g in games:
        dte = g["at"][:10]
        if is_preseason(dte):
            continue
        pl = (det.get(g["id"]) or {}).get("pl") or {}
        for pid, v in pl.items():
            prev = seq.get(pid, [])
            if len(prev) >= 5 and dte >= CORTE and (v.get("MIN") or 0) > 0:
                last = prev[-15:]
                w = np.array([0.88 ** (len(last) - 1 - i) for i in range(len(last))])
                mins = np.array([p["MIN"] for p in last])
                mpred = float(np.sum(w * mins) / w.sum())
                for k in STATS:
                    vals = np.array([p[k] for p in last])
                    rate = float(np.sum(w * vals) / max(np.sum(w * mins), 1))
                    pred = mpred * rate
                    base = float(np.mean([p[k] for p in prev]))
                    y = stat_val(v, k) or 0
                    err[k][0] += abs(pred - y); err[k][1] += abs(base - y); err[k][2] += 1
                    resid[k].append((pred, y))
            if (v.get("MIN") or 0) > 0:
                seq.setdefault(pid, []).append({"MIN": v["MIN"], **{k: stat_val(v, k) or 0 for k in STATS}})
    out = {}
    for k, (a, b, n) in err.items():
        out[k] = {"n": n, "error_modelo": round(a / n, 2), "error_promedio_simple": round(b / n, 2),
                  "mejora_%": round(100 * (1 - a / b), 1)}
    return out


# ---------------------------------------------------------------- main
def main():
    print("Fútbol: eligiendo ajustes con el periodo de calibración (antes de", CORTE + ")")
    par, walks = tune_soccer()
    print("  elegido:", par)
    rows = []
    for k, (walk, det) in walks.items():
        for g, gh, ga, lc in walk:
            if g["at"][:10] < CORTE:
                continue
            pm = soccer_markets(gh, ga, lc, par["rho"], par["disp"])
            ob = soccer_outcomes(g, det)
            rows += [(m, float(pm[m]), bool(ob[m]), k) for m in pm if m in ob]
    names = {"1": "Gana local", "X": "Empate", "2": "Gana visitante", "btts": "Ambos marcan",
             "o1.5": "Más de 1.5 goles", "o2.5": "Más de 2.5 goles", "o3.5": "Más de 3.5 goles",
             "c8.5": "Más de 8.5 córners", "c9.5": "Más de 9.5 córners", "c10.5": "Más de 10.5 córners"}
    ev = evaluate([(m, p, y) for m, p, y, _ in rows])
    # ganador 1X2: el resultado con más probabilidad
    from collections import defaultdict
    g1x2 = defaultdict(dict)
    for m, p, y, k in rows:
        pass
    # recomputar 1X2 por partido
    hits = tot = 0
    by_league = {}
    for k, (walk, det) in walks.items():
        for g, gh, ga, lc in walk:
            if g["at"][:10] < CORTE:
                continue
            pm = soccer_markets(gh, ga, None, par["rho"], 1)
            ob = soccer_outcomes(g, det)
            pick = max(("1", "X", "2"), key=lambda m: pm[m])
            hits += ob[pick]; tot += 1
            bl = by_league.setdefault(k, [0, 0]); bl[0] += ob[pick]; bl[1] += 1
    home = sum(y for m, p, y, _ in rows if m == "1") / max(1, sum(1 for m, *_ in rows if m == "1"))
    rep = {
        "fecha": dt.date.today().isoformat(), "corte": CORTE,
        "futbol": {
            "ajustes": par, "partidos_prueba": tot,
            "1X2_acierto": round(100 * hits / tot, 1),
            "1X2_acierto_siempre_local": round(100 * home, 1),
            "1X2_por_liga": {k: round(100 * a / b, 1) for k, (a, b) in by_league.items()},
            "mercados": {names[m]: {**{kk: round(vv, 4) if isinstance(vv, float) else vv for kk, vv in v.items()}}
                         for m, v in ev.items()},
            "calibracion": calib([(m, p, y) for m, p, y, _ in rows]),
        },
    }
    # Liga MX y BetPlay: acierto real de cada mercado cuando el modelo lo daría como pick (>= 60 %),
    # con TODOS los partidos jugados. predict.py baja la probabilidad de los que acertaron menos de lo que decían.
    rep["futbol"]["cal_mercado"] = cal_mercado(walks, par, ("col.1", "mex.1"))
    print("NBA: eligiendo ajustes con calibración")
    rep["nba"], nbapar = nba_eval()
    games, det, _ = load("nba")
    rep["nba_props"] = props_eval(games, det)
    rep["parametros"] = {"futbol": par, "nba": nbapar}
    os.makedirs(os.path.join(DATA, "model"), exist_ok=True)
    with open(os.path.join(DATA, "model", "report.json"), "w", encoding="utf-8") as f:
        json.dump(rep, f, ensure_ascii=False, indent=1)
    print(json.dumps(rep, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
