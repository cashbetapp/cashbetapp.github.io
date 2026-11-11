"""CASHBET - comparación honesta de modelos (fútbol: 1X2, más de 2.5 goles, ambos marcan).

Todo es "fuera de muestra": cada predicción usa solo partidos anteriores a ese día, y los modelos
que aprenden (Elo calibrado, boosting, regresión) se entrenan SOLO con partidos antes de CORTE y se
miden SOLO con partidos desde CORTE. Nada del periodo de prueba se usa para ajustar nada.

Modelos:
  A  actual: Poisson + Dixon-Coles con remates al arco (model.py)
  B  Elo (con diferencia de goles) + regresión logística
  C  boosting (HistGradientBoosting de scikit-learn, familia de XGBoost/LightGBM) con
     goles esperados del modelo A, Elo, forma reciente y descanso
  D  mezcla 50/50 de A y C
  E  regresión logística con las mismas variables que C

Métricas en la prueba: Log Loss y Brier (más bajo = mejor), acierto, y cómo les va a los picks de 70 %+.
Salida: data/model/comparacion.json      Uso: python comparar.py
"""
import json, os, math, datetime as dt
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from model import DATA, SOCCER, CORTE, day, soccer_walk, soccer_markets

PAR = {"xi": 0.0015, "ridge": 6.0, "wsot": 0.7, "rho": -0.1}
K_ELO, HOME_ELO = 20.0, 60.0


def filas_liga(key, par):
    """Una fila por partido con las variables conocidas ANTES del partido."""
    walk, det = soccer_walk(key, par["xi"], par["ridge"], par["wsot"])
    lam = {g["id"]: (gh, ga) for g, gh, ga, _ in walk}
    from model import load
    games, _, _ = load(key)
    elo, hist, ult = {}, {}, {}
    out = []
    for g in games:
        h, a = g["h"]["id"], g["a"]["id"]
        eh, ea = elo.get(h, 1500.0), elo.get(a, 1500.0)
        hs, as_ = g["h"]["s"], g["a"]["s"]
        d = day(g["at"])
        if g["id"] in lam and len(hist.get(h, [])) >= 4 and len(hist.get(a, [])) >= 4:
            def forma(t):
                xs = hist[t][-6:]
                return (np.mean([x[0] for x in xs]), np.mean([x[1] for x in xs]), np.mean([x[2] for x in xs]))
            fh, fa = forma(h), forma(a)
            gh, ga = lam[g["id"]]
            out.append({
                "at": g["at"], "lg": key, "lh": gh, "la": ga,
                "x": [gh, ga, eh - ea + HOME_ELO, *fh, *fa, min(d - ult.get(h, d - 14), 14), min(d - ult.get(a, d - 14), 14)],
                "elo": eh - ea + HOME_ELO,
                "res": 0 if hs > as_ else 1 if hs == as_ else 2, "o25": int(hs + as_ > 2), "btts": int(hs > 0 and as_ > 0),
            })
        # actualizar después del partido
        esp = 1 / (1 + 10 ** (-(eh - ea + HOME_ELO) / 400))
        real = 1.0 if hs > as_ else 0.5 if hs == as_ else 0.0
        mult = math.log(abs(hs - as_) + 1) + 1
        elo[h] = eh + K_ELO * mult * (real - esp)
        elo[a] = ea - K_ELO * mult * (real - esp)
        pts = lambda f, c: 3 if f > c else 1 if f == c else 0
        hist.setdefault(h, []).append((hs, as_, pts(hs, as_)))
        hist.setdefault(a, []).append((as_, hs, pts(as_, hs)))
        ult[h] = ult[a] = d
    return out


def ll(p, y):
    p = min(max(p, 1e-6), 1 - 1e-6)
    return -math.log(p if y else 1 - p)


def medir(nombre, P, filas, mercado):
    """P: lista de probabilidades (vector de 3 para 1X2, escalar para binarios)."""
    if mercado == "1X2":
        ys = [f["res"] for f in filas]
        L = np.mean([-math.log(max(p[y], 1e-6)) for p, y in zip(P, ys)])
        B = np.mean([sum((p[k] - (1 if k == y else 0)) ** 2 for k in range(3)) for p, y in zip(P, ys)])
        ac = np.mean([int(np.argmax(p) == y) for p, y in zip(P, ys)])
        picks = [(max(p), int(np.argmax(p) == y)) for p, y in zip(P, ys) if max(p) >= 0.70]
        # dobles oportunidades (1X / X2) de 70 %+: el mercado que más se publica en 1X2
        for p, y in zip(P, ys):
            for q, ok in ((p[0] + p[1], y != 2), (p[1] + p[2], y != 0)):
                if q >= 0.70:
                    picks.append((q, int(ok)))
    else:
        ys = [f[mercado] for f in filas]
        L = np.mean([ll(p, y) for p, y in zip(P, ys)])
        B = np.mean([(p - y) ** 2 for p, y in zip(P, ys)])
        ac = np.mean([int((p > 0.5) == bool(y)) for p, y in zip(P, ys)])
        picks = [(max(p, 1 - p), int((p > 0.5) == bool(y))) for p, y in zip(P, ys) if max(p, 1 - p) >= 0.70]
    n70 = len(picks)
    return {"modelo": nombre, "logloss": round(float(L), 4), "brier": round(float(B), 4), "acierto": round(100 * float(ac), 1),
            "picks70": n70, "acierto70": round(100 * np.mean([o for _, o in picks]), 1) if n70 else None,
            "dijo70": round(100 * np.mean([q for q, _ in picks]), 1) if n70 else None}


def main():
    filas = []
    for key in SOCCER:
        filas += filas_liga(key, PAR)
    cal = [f for f in filas if f["at"][:10] < CORTE]
    test = [f for f in filas if f["at"][:10] >= CORTE]
    Xc, Xt = np.array([f["x"] for f in cal]), np.array([f["x"] for f in test])
    print(f"comparar: {len(cal)} partidos para entrenar (antes de {CORTE}), {len(test)} para probar")
    res = {}

    # A: modelo actual
    A = {k: [] for k in ("1X2", "o25", "btts")}
    for f in test:
        m = soccer_markets(f["lh"], f["la"], None, PAR["rho"], 1)
        A["1X2"].append(np.array([m["1"], m["X"], m["2"]]))
        A["o25"].append(float(m["o2.5"]))
        A["btts"].append(float(m["btts"]))

    def boost():
        return HistGradientBoostingClassifier(max_depth=3, learning_rate=0.04, max_iter=250, l2_regularization=1.0,
                                              min_samples_leaf=40, random_state=7)

    def logit():
        return LogisticRegression(max_iter=2000, C=0.5)

    from sklearn.preprocessing import StandardScaler
    sc = StandardScaler().fit(Xc)
    for mk in ("1X2", "o25", "btts"):
        yc = np.array([f["res"] if mk == "1X2" else f[mk] for f in cal])
        filas_m = test
        out = [medir("A actual (Poisson + Dixon-Coles)", A[mk], filas_m, mk)]
        if mk == "1X2":
            e = LogisticRegression(max_iter=2000).fit(np.array([[f["elo"]] for f in cal]), yc)
            out.append(medir("B Elo", list(e.predict_proba(np.array([[f["elo"]] for f in test]))), filas_m, mk))
        c = boost().fit(Xc, yc)
        pc = c.predict_proba(Xt)
        PC = list(pc) if mk == "1X2" else list(pc[:, 1])
        out.append(medir("C boosting", PC, filas_m, mk))
        PD = [(np.asarray(a) + np.asarray(b)) / 2 for a, b in zip(A[mk], PC)] if mk == "1X2" else [(a + b) / 2 for a, b in zip(A[mk], PC)]
        out.append(medir("D mezcla A + C", PD, filas_m, mk))
        r = logit().fit(sc.transform(Xc), yc)
        pr = r.predict_proba(sc.transform(Xt))
        out.append(medir("E regresión logística", list(pr) if mk == "1X2" else list(pr[:, 1]), filas_m, mk))
        base = np.bincount(yc, minlength=3) / len(yc) if mk == "1X2" else yc.mean()
        out.append(medir("tasa base (sin modelo)", [base] * len(test), filas_m, mk))
        out.sort(key=lambda x: x["logloss"])
        res[mk] = out

    salida = {"generado": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "corte": CORTE,
              "entrenar": len(cal), "probar": len(test), "resultados": res,
              "nota": "Log Loss y Brier: más bajo es mejor. Todo medido fuera de muestra."}
    with open(os.path.join(DATA, "model", "comparacion.json"), "w", encoding="utf-8") as fo:
        json.dump(salida, fo, ensure_ascii=False, indent=1)
    for mk, out in res.items():
        print(f"\n  {mk}")
        print(f"    {'modelo':<34}{'logloss':>8}{'brier':>8}{'acierto':>8}{'picks70':>8}{'ac70':>7}{'dijo70':>7}")
        for o in out:
            print(f"    {o['modelo']:<34}{o['logloss']:>8}{o['brier']:>8}{o['acierto']:>8}{o['picks70']:>8}{str(o['acierto70']):>7}{str(o['dijo70']):>7}")


if __name__ == "__main__":
    main()
