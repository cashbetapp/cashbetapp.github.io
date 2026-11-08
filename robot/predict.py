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
CUOTA_MIN = 1.50  # el usuario pidió cuota mínima 1.50 (antes 1.30)


def cuota_ef(s):
    """Cuota real de la casa si existe; si no, la cuota justa del modelo."""
    return s.get("cuota") or s["justa"]


def elegir(sels, prefer=None):
    """Pick principal: el más probable que pague >= CUOTA_MIN. Si 'prefer' tiene
    alguno apto con >= 50 %, se usa ese grupo primero (p. ej. ganador)."""
    apt = [s for s in sels if cuota_ef(s) >= CUOTA_MIN and s["p"] >= 0.5]
    if prefer:
        pa = [s for s in prefer if s in apt]
        if pa:
            return max(pa, key=lambda s: s["p"])
    if apt:
        return max(apt, key=lambda s: s["p"])
    # nada probable paga >= CUOTA_MIN (favorito muy claro): se muestra el favorito
    # marcado como "bajo"; no entra a las listas de picks ni a la libreta
    return dict(max(sels, key=lambda s: s["p"]), bajo=True)


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
        s["valor"] = round(float(p) * odd - 1, 3)   # >0: la casa paga más de lo que debería
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
            by = {s["m"]: s for s in sels}
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


def player_models(games, det, before):
    """Por jugador: lista de partidos previos a 'before' (AAAA-MM-DD)."""
    seq, names = {}, {}
    for g in games:
        if g["at"][:10] >= before:
            break
        if is_preseason(g["at"][:10]):
            continue
        for pid, v in ((det.get(g["id"]) or {}).get("pl") or {}).items():
            if (v.get("MIN") or 0) > 0:
                seq.setdefault(pid, []).append({"MIN": v["MIN"], **{k: stat_val(v, k) or 0 for k in STATS}})
                names[pid] = (v.get("n"), v.get("t"))
    return seq, names


def prop_prob(prev, keys, line):
    """P(más de la línea). Media: minutos esperados x producción por minuto
    reciente. Forma: binomial negativa con la dispersión real del jugador."""
    last = prev[-15:]
    w = np.array([0.88 ** (len(last) - 1 - i) for i in range(len(last))])
    mins = np.array([p["MIN"] for p in last])
    vals = np.array([sum(p[k] for k in keys) for p in last])
    mu = float(np.sum(w * mins) / w.sum()) * float(np.sum(w * vals) / max(np.sum(w * mins), 1))
    mu = max(mu, 0.05)
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
        seq, names = player_models(games, det, fn[:10])
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
                mu, p_over = prop_prob(prev, PROP_TYPES[t], ln)
                side = "mas" if p_over >= 0.5 else "menos"
                p = max(p_over, 1 - p_over)
                worst = min(odds)  # no se sabe cuál cuota es "más" y cuál "menos": se usa la peor
                ks = PROP_TYPES[t]
                out.append({"ev": e, "at": ev["at"], "partido": ev["name"], "pl": pid, "jugador": names[pid][0],
                            "equipo": names[pid][1], "tipo": NOMBRE[t], "t": t, "linea": ln, "lado": side,
                            "esperado": round(mu, 1), "p": round(p, 4), "cuota": worst,
                            "casa": round(1 / worst, 4), "valor": round(p * worst - 1, 3),
                            "ult": [sum(x[k] for k in ks) for x in prev[-10:]],
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


def ledger(partidos, props_, extras=None):
    """Anota cada pick ANTES de empezar el partido y lo califica después.
    Así la efectividad que muestra la app es real (no de prueba)."""
    p = os.path.join(DATA, "ledger.json")
    L = json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {"partidos": {}, "props": {}}
    L.setdefault("extra", {})
    ahora = now().strftime("%Y-%m-%dT%H:%MZ")
    # mercados de estadísticas (córners, tiros, faltas, tarjetas; equipo y jugador)
    for g in partidos:
        ex = g.get("extra")
        if not ex or g["at"] <= ahora:
            continue
        for x in ex["picks"] + ex["jug"]:
            L["extra"][f"{g['id']}|{x['m']}"] = {"at": g["at"], "ev": g["id"], "lg": g["lg"], "hid": g["h"]["id"],
                                                 "aid": g["a"]["id"], "m": x["m"], "s": x["s"], "sc": x["sc"],
                                                 "txt": x["txt"], "p": x["p"], "cuota": x["justa"]}
    for g in partidos:
        if g["at"] > ahora and g.get("pick") and not g["pick"].get("bajo"):
            pk = g["pick"]
            L["partidos"][g["id"]] = {"at": g["at"], "lg": g["lg"], "liga": g["liga"], "dep": g["dep"],
                                      "h": g["h"]["n"], "a": g["a"]["n"], "hl": g["h"]["logo"], "al": g["a"]["logo"],
                                      "m": pk["m"], "txt": pick_name(pk["m"], g), "p": pk["p"],
                                      "cuota": pk.get("cuota") or pk["justa"], "cuota_casa": bool(pk.get("cuota"))}
    for x in props_:
        if x["at"] > ahora:
            k = f"{x['ev']}_{x['pl']}_{x['t']}_{x['linea']}"
            L["props"][k] = {kk: x[kk] for kk in ("ev", "at", "pl", "jugador", "t", "tipo", "linea", "lado", "p", "cuota", "casa")}
    # calificar
    res = {}
    for key in SOCCER + ["nba"]:
        games, det, _ = load(key)
        for g in games:
            res[g["id"]] = (g["h"]["s"], g["a"]["s"], det.get(g["id"]))
    from model import choques
    malos = set()
    for key in SOCCER:
        with open(os.path.join(DATA, "hist", key + ".json"), encoding="utf-8") as f:
            malos |= choques(json.load(f)["games"])
    for coll in ("partidos", "extra"):
        for k in [k for k, e in L.get(coll, {}).items() if "ok" not in e and (e.get("ev") or k) in malos]:
            del L[coll][k]   # partido dudoso que no ha terminado: se quita de la libreta
    for gid, e in L["partidos"].items():
        if "ok" not in e and gid in res:
            e["ok"] = outcome(e["m"], res[gid][0], res[gid][1])
            e["res"] = f"{res[gid][0]}-{res[gid][1]}"
    for k, e in L["props"].items():
        if "ok" in e or e["ev"] not in res or not res[e["ev"]][2]:
            continue
        v = (res[e["ev"]][2].get("pl") or {}).get(e["pl"])
        if not v:
            e["ok"] = None  # no jugó: apuesta anulada
            continue
        tot = sum(stat_val(v, kk) or 0 for kk in PROP_TYPES[e["t"]])
        e["real"] = tot
        e["ok"] = (tot > e["linea"]) if e["lado"] == "mas" else (tot < e["linea"])
    for k, e in L["extra"].items():
        if "ok" in e or e["ev"] not in res or not res[e["ev"]][2]:
            continue
        e["ok"], e["real"] = extra_outcome(e["m"], res[e["ev"]][2], e["hid"], e["aid"])
    with open(p, "w", encoding="utf-8") as f:
        json.dump(L, f, ensure_ascii=False, separators=(",", ":"))

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
    return {"partidos": stats(L["partidos"].values()), "props": stats(L["props"].values()), "ultimos": hist,
            "extra": stats(L["extra"].values()), "extra_por": {k: stats(v) for k, v in por.items()}, "semana": semana}


def _img(url, path, size):
    """Baja una imagen una sola vez, la achica y la guarda como PNG."""
    if os.path.exists(path):
        return True
    import urllib.request, urllib.error, io, time
    from PIL import Image
    for i in range(4):
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                im = Image.open(io.BytesIO(r.read())).convert("RGBA")
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
            rel = f"img/t/{_h(t['logo'])}.png"
            jobs[rel] = (t["logo"], 128)
            t["logo"] = "data/" + rel
    for g in partidos:
        team(g["h"]); team(g["a"])
        lg = (g.get("extra") or {}).get("lg") or {}
        for ab, u in list(lg.items()):
            if u and not u.startswith("data/"):
                rel = f"img/t/{_h(u)}.png"
                jobs.setdefault(rel, (u, 128))
                lg[ab] = "data/" + rel
        for s in ("h", "a"):
            for r in (g.get("forma") or {}).get(s, []):
                if r.get("logo") and not r["logo"].startswith("data/"):
                    rel = f"img/t/{_h(r['logo'])}.png"
                    jobs.setdefault(rel, (r["logo"], 128))
                    r["logo"] = "data/" + rel
    # futbolistas: solo partidos de las próximas 36 h; las que no existen se recuerdan
    nofoto_p = os.path.join(DATA, "img", "nofoto.json")
    nofoto = set(json.load(open(nofoto_p))) if os.path.exists(nofoto_p) else set()
    limite = (now() + dt.timedelta(hours=36)).strftime("%Y-%m-%dT%H:%MZ")
    fjobs = {}
    for g in partidos:
        for x in (g.get("extra") or {}).get("jug", []):
            rel = f"img/f/{x['pid']}.png"
            if os.path.exists(os.path.join(DATA, rel)):
                x["foto"] = "data/" + rel
            elif g["at"] <= limite and x["pid"] not in nofoto:
                fjobs[rel] = (f"https://a.espncdn.com/i/headshots/soccer/players/full/{x['pid']}.png", 200)
    for x in props_:
        rel = f"img/p/{x['pl']}.png"
        jobs[rel] = (f"https://a.espncdn.com/i/headshots/nba/players/full/{x['pl']}.png", 160)
        x["foto"] = "data/" + rel
        if x.get("eq"):
            team(dict(x["eq"]))
    with ThreadPoolExecutor(4) as ex:
        ok = list(ex.map(lambda kv: (kv[0], _img(kv[1][0], os.path.join(DATA, kv[0]), kv[1][1])), jobs.items()))
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
            if os.path.exists(os.path.join(DATA, f"img/f/{x['pid']}.png")):
                x["foto"] = f"data/img/f/{x['pid']}.png"
    # si una imagen no se pudo bajar, la app muestra la sigla
    for g in partidos:
        for s in ("h", "a"):
            if (g[s].get("logo") or "")[5:] in bad:
                g[s]["logo"] = None
            for r in (g.get("forma") or {}).get(s, []):
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
        rel = f"img/l/{key}.png"
        path = os.path.join(DATA, rel)
        if not os.path.exists(path):
            d = get(f"https://site.api.espn.com/apis/site/v2/sports/{sp}/{code}/scoreboard") or {}
            try:
                href = d["leagues"][0]["logos"][0]["href"]
                _img(href, path, 96)
            except Exception:
                pass
        out[key] = {"n": name, "logo": ("data/" + rel) if os.path.exists(path) else None}
    return out


def main():
    r = rep()
    par = r["parametros"]
    f = soccer(par["futbol"], r)
    ex = extra_predict(soon, now().date().toordinal())
    for g in f:
        x = ex.get(g["id"])
        if x:
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
        g["h2h"] = h2h(g["lg"], g["h"]["id"], g["a"]["id"])
    # equipos de los jugadores (logo y sigla)
    teams = {}
    for g in nb:
        for s in ("h", "a"):
            teams[g[s]["id"]] = {"ab": g[s]["ab"], "logo": g[s]["logo"], "n": g[s]["n"]}
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
        "cuota_min": CUOTA_MIN,
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
