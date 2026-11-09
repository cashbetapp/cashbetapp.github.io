"""NBA, como la referencia (pick de equipo "Denver Nuggets más de 103.5 pts"):

- g["extra"]: picks de PUNTOS DE EQUIPO con el mismo formato que las estadísticas de
  fútbol (hist 20 partidos, vr enfrentamientos, grupos por línea, picks) -> la app usa
  la misma ficha (Resumen / Contexto / Análisis IA) y la libreta los califica.
- g["ctx"]: defensa del rival (permitido L10, promedio de la liga, multiplicador,
  ranking, ritmo), líderes del equipo y bajas con puntos por partido que se pierden.

Puntos esperados = (total + margen) / 2 del modelo NBA ya probado. Desviación y
calibración medidas con prueba hacia adelante (ajuste antes de CORTE, medida después)."""
import os, io, json, math, datetime as dt, urllib.request
import numpy as np
from scipy.stats import norm
from model import DATA, load, is_preseason, CORTE, stat_val

PMIN, PMAX = 0.55, 1 / 1.5          # igual que el resto: ni dudosos ni con cuota < 1.50
UA = {"User-Agent": "Mozilla/5.0"}


def temporada(d):
    return d[:4] if d[5:7] >= "08" else str(int(d[:4]) - 1)


def _foto(pid):
    """Foto ESPN del jugador, 160 px, guardada una vez en data/img/hs."""
    rel = f"img/hs/{pid}.png"
    ruta = os.path.join(DATA, rel)
    if os.path.exists(ruta):
        return "data/" + rel
    try:
        from PIL import Image
        with urllib.request.urlopen(urllib.request.Request(
                f"https://a.espncdn.com/i/headshots/nba/players/full/{pid}.png", headers=UA), timeout=20) as r:
            im = Image.open(io.BytesIO(r.read())).convert("RGBA")
        im.thumbnail((160, 160), Image.LANCZOS)
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        im.save(ruta, optimize=True)
        return "data/" + rel
    except Exception:
        return None


def prueba(rows):
    """Prueba hacia adelante: ajuste con partidos antes de CORTE, medida después.
    Devuelve (desviación de los puntos de un equipo, acierto %, dijo %, picks)."""
    def F(r):
        return [r["ph"] - r["pa"], r["mh"] - r["ma"], float(r["b2b_h"]) - float(r["b2b_a"]), 1.0]
    tr = [r for r in rows if r["d"] < CORTE]
    te = [r for r in rows if r["d"] >= CORTE]
    if len(tr) < 100 or len(te) < 100:
        return None
    X = np.array([F(r) for r in tr])
    c = np.linalg.lstsq(X, np.array([r["g"]["h"]["s"] - r["g"]["a"]["s"] for r in tr]), rcond=None)[0]
    ct = np.polyfit([r["ph"] + r["pa"] for r in tr], [r["g"]["h"]["s"] + r["g"]["a"]["s"] for r in tr], 1)

    def esp(r):
        m = float(np.array(F(r)) @ c); t = float(np.polyval(ct, r["ph"] + r["pa"]))
        return (t + m) / 2, (t - m) / 2
    res = []
    for r in tr:
        eh, ea = esp(r); res += [r["g"]["h"]["s"] - eh, r["g"]["a"]["s"] - ea]
    sd = float(np.std(res))
    n = ok = 0; dijo = 0.0
    for r in te:
        for e, y in zip(esp(r), (r["g"]["h"]["s"], r["g"]["a"]["s"])):
            for lado in ("mas", "menos"):          # las dos direcciones, como en vivo
                ln, p = elegir_linea(e, sd, lado)
                if ln is None:
                    continue
                n += 1; dijo += p; ok += (y > ln) == (lado == "mas")
    if not n:
        return None
    return sd, round(100 * ok / n, 1), round(100 * dijo / n, 1), n


def p_mas(e, sd, ln):
    return 1 - norm.cdf((ln - e) / sd)


def elegir_linea(e, sd, lado):
    """La línea más probable para ese lado con probabilidad entre PMIN y PMAX
    (cuota justa >= 1.50)."""
    base = math.floor(e) + 0.5
    mejor = (None, 0)
    for k in range(-20, 21):
        ln = base + k
        p = p_mas(e, sd, ln) if lado == "mas" else 1 - p_mas(e, sd, ln)
        if PMIN <= p <= PMAX and p > mejor[1]:
            mejor = (ln, p)
    return mejor


def completar(nb, rows):
    games, det, _ = load("nba")
    games = [g for g in games if not is_preseason(g["at"][:10])]
    hoy_t = temporada(dt.date.today().isoformat())
    pr = prueba(rows)
    print("NBA puntos de equipo, prueba:", pr and {"sd": round(pr[0], 2), "acierto": pr[1], "dijo": pr[2], "picks": pr[3]})

    # ---- por equipo: partidos (más reciente primero), defensa, ritmo
    por = {}
    for g in games:
        tm = (det.get(g["id"]) or {}).get("tm") or {}
        for s, o in (("h", "a"), ("a", "h")):
            t, r = g[s], g[o]
            st = tm.get(str(t["id"])) or {}
            fga = (st.get("fieldGoalsMade-fieldGoalsAttempted") or [0, 0])[1]
            fta = (st.get("freeThrowsMade-freeThrowsAttempted") or [0, 0])[1]
            pos = fga - (st.get("offensiveRebounds") or 0) + (st.get("totalTurnovers") or st.get("turnovers") or 0) + 0.44 * fta if fga else None
            por.setdefault(str(t["id"]), []).append({
                "vs": r.get("ab") or r.get("n"), "l": 1 if s == "h" else 0, "d": g["at"][:10],
                "r": "G" if t["s"] > r["s"] else "P", "pts": t["s"], "opts": r["s"], "pos": pos,
                "to": st.get("totalTurnovers") or st.get("turnovers"), "t": temporada(g["at"][:10]), "id": g["id"]})
    logos = {}
    for g in games:
        for s in ("h", "a"):
            logos[g[s].get("ab") or g[s]["n"]] = g[s]["logo"]
    # promedio de la liga y ranking defensivo (últimos 10 de cada equipo, esta temporada)
    act = {t: [x for x in v if x["t"] == hoy_t] for t, v in por.items()}
    perm = {t: np.mean([x["opts"] for x in v[-10:]]) for t, v in act.items() if len(v) >= 3}
    liga = float(np.mean([x["pts"] for v in act.values() for x in v])) if any(act.values()) else None
    rank = {t: i + 1 for i, (t, _) in enumerate(sorted(perm.items(), key=lambda kv: kv[1]))}

    # ---- jugadores: promedios de la temporada (líderes y puntos que se pierden por bajas)
    jug = {}
    for g in games:
        if temporada(g["at"][:10]) != hoy_t:
            continue
        for pid, v in ((det.get(g["id"]) or {}).get("pl") or {}).items():
            if (v.get("MIN") or 0) <= 0:
                continue
            j = jug.setdefault(pid, {"n": v.get("n"), "t": str(v.get("t")), "pj": 0, "PTS": 0, "AST": 0, "REB": 0})
            j["pj"] += 1; j["t"] = str(v.get("t"))
            for k in ("PTS", "AST", "REB"):
                j[k] += stat_val(v, k) or 0

    def lideres(t):
        pj_eq = len(act.get(t, []))
        cand = [(pid, j) for pid, j in jug.items() if j["t"] == t and j["pj"] >= max(2, pj_eq * 0.4)]
        out = []
        for k, cat in (("PTS", "Puntos"), ("AST", "Asistencias"), ("REB", "Rebotes")):
            if cand:
                pid, j = max(cand, key=lambda x: x[1][k] / x[1]["pj"])
                out.append({"id": pid, "n": j["n"], "cat": cat, "v": round(j[k] / j["pj"], 1), "foto": _foto(pid)})
        return out

    def ppg(pid):
        j = jug.get(str(pid))
        return round(j["PTS"] / j["pj"], 1) if j and j["pj"] else None

    for g in nb:
        ctx = {"liga": round(liga, 1) if liga else None, "def": {}, "lid": {}, "bajas": {}}
        X = {"grupos": [], "picks": [], "jug": [], "hist": {}, "vr": {}, "lg": {}}
        sdm, sdt = (g.get("sd") or [None, None])
        e = {"h": g["puntos_esperados"][0], "a": g["puntos_esperados"][1]}
        sd = pr[0] if pr else (math.sqrt(sdm ** 2 + sdt ** 2) / 2 if sdm else 12.0)
        od = g.get("odds") or {}
        for s, o in (("h", "a"), ("a", "h")):
            t, r = str(g[s]["id"]), str(g[o]["id"])
            v = act.get(t, [])
            pv = [x for x in v[-10:]]
            ctx["def"][s] = {"perm10": round(float(np.mean([x["opts"] for x in pv])), 1) if pv else None,
                             "anota10": round(float(np.mean([x["pts"] for x in pv])), 1) if pv else None,
                             "rank": rank.get(t), "n": len(rank),
                             "ritmo": round(float(np.mean([x["pos"] for x in pv if x["pos"]])), 1) if any(x["pos"] for x in pv) else None,
                             "to": round(float(np.mean([x["to"] for x in pv if x["to"] is not None])), 1) if any(x["to"] is not None for x in pv) else None}
            if ctx["def"][s]["perm10"] and liga:
                ctx["def"][s]["mult"] = round(ctx["def"][s]["perm10"] / liga, 2)
            ctx["lid"][s] = lideres(t)
            bajas = []
            for b in (g.get("bajas") or {}).get(s, []):
                bajas.append(dict(b, ppg=ppg(b["id"]), foto=_foto(b["id"])))
            ctx["bajas"][s] = bajas
            ctx["bajas"][s + "_lib"] = round(sum(b["ppg"] or 0 for b in bajas if b["s"] == "Out"), 1)
            # historial para la ficha (20 últimos, el más reciente primero) y enfrentamientos
            todos = por.get(t, [])
            X["hist"][s] = [{k: x[k] for k in ("vs", "l", "d", "r", "pts", "opts")} for x in todos[-20:]][::-1]
            for x in todos[-20:]:
                X["lg"][x["vs"]] = logos.get(x["vs"])
            X["vr"][s] = [{k: x[k] for k in ("vs", "l", "d", "r", "pts", "opts")} for x in todos
                          if x["vs"] == (g[o].get("ab") or g[o]["n"])][-5:][::-1]
        # grupos: probabilidad de "más de" por línea, alrededor de lo esperado
        gr = {"s": "pts", "titulo": "Puntos del equipo", "esp": [e["h"], e["a"]], "t": []}
        for s in ("h", "a"):
            base = math.floor(e[s]) + 0.5
            gr[s] = [[base + k, round(p_mas(e[s], sd, base + k), 4)] for k in (-8, -4, 0, 4, 8)]
        X["grupos"].append(gr)
        # pick: dirección = modelo contra la línea implícita de la casa (total y hándicap)
        if od.get("ou") and od.get("sp") is not None:
            impl = {"h": od["ou"] / 2 - od["sp"] / 2, "a": od["ou"] / 2 + od["sp"] / 2}
            ctx["impl"] = {k: round(v, 1) for k, v in impl.items()}
            for s in ("h", "a"):
                lado = "mas" if e[s] > impl[s] else "menos"
                ln, p = elegir_linea(e[s], sd, lado)
                if ln is None:
                    continue
                nom = g[s]["n"]
                X["picks"].append({"m": f"pts|{s}|{lado}|{ln}", "p": round(p, 4), "justa": round(1 / p, 2),
                                   "txt": f"{nom}: {'más' if lado == 'mas' else 'menos'} de {ln} puntos", "s": "pts", "sc": s,
                                   "prueba": pr[1] if pr else None, "esp": e[s], "sd": round(sd, 1),
                                   "disp": round(sd * sd / e[s], 3), "temp": []})   # disp = varianza / media (Monte Carlo)
        g["extra"] = X
        g["ctx"] = ctx
