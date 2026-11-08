"""CASHBET - mercados de estadísticas de fútbol: córners, tiros, tiros a puerta,
faltas y tarjetas (total del partido, de cada equipo y de cada jugador).

Misma regla de oro que model.py: para cada partido SOLO se usan partidos
anteriores. Ajustes elegidos con partidos antes de CORTE; acierto medido
solo con partidos posteriores. Un mercado solo se publica si su pronóstico
gana a "lo que pasa normalmente" (tasa base) en la prueba.

Uso:  python extra.py   -> prueba y guarda data/model/extra.json
"""
import json, os, math, time
import numpy as np
from scipy.stats import nbinom, poisson
from model import DATA, SOCCER, CORTE, Poi, load, day, logloss, calib

STATS = ["cor", "sot", "tir", "fal", "tar"]
CAMPO = {"cor": "wonCorners", "sot": "shotsOnTarget", "tir": "totalShots", "fal": "foulsCommitted"}
NOMBRE = {"cor": "córners", "sot": "tiros a puerta", "tir": "tiros", "fal": "faltas", "tar": "tarjetas"}
TITULO = {"cor": "Córners", "sot": "Tiros a puerta", "tir": "Tiros", "fal": "Faltas", "tar": "Tarjetas"}
# líneas típicas de las casas
LT = {"cor": [7.5, 8.5, 9.5, 10.5, 11.5], "sot": [5.5, 6.5, 7.5, 8.5, 9.5, 10.5],
      "tir": [18.5, 20.5, 22.5, 24.5, 26.5, 28.5], "fal": [19.5, 21.5, 23.5, 25.5, 27.5],
      "tar": [2.5, 3.5, 4.5, 5.5, 6.5]}
LE = {"cor": [2.5, 3.5, 4.5, 5.5, 6.5], "sot": [1.5, 2.5, 3.5, 4.5, 5.5], "tir": [7.5, 9.5, 11.5, 13.5, 15.5],
      "fal": [8.5, 10.5, 12.5, 14.5], "tar": [0.5, 1.5, 2.5, 3.5]}
# jugadores: estadística -> (campo en el box score, líneas)
PJ = {"sot": ("shotsOnTarget", [0.5, 1.5]), "tir": ("totalShots", [0.5, 1.5, 2.5]),
      "fal": ("foulsCommitted", [0.5, 1.5]), "tar": ("yellowCards", [0.5])}
CUOTA_MIN = 1.30            # el usuario no quiere picks con cuota menor a 1.30
MAXP = 1 / CUOTA_MIN        # -> probabilidad máxima de un pick: 76,9 %


def tval(t, s):
    if s == "tar":
        y = t.get("yellowCards")
        return None if y is None else y + (t.get("redCards") or 0)
    return t.get(CAMPO[s])


def p_over(m, line, disp):
    k = math.floor(line)
    m = max(m, 1e-4)
    if disp <= 1.001:
        return float(poisson.sf(k, m))
    r = m / (disp - 1)
    return float(nbinom.sf(k, r, r / (r + m)))


def pos_g(p):
    p = (p or "").upper()
    if p.startswith("G"):
        return "G"
    if p in ("CD", "CD-L", "CD-R", "LB", "RB", "LWB", "RWB", "SW", "D"):
        return "D"
    if p in ("F", "CF", "CF-L", "CF-R", "RCF", "LCF", "LF", "RF", "ST"):
        return "F"
    return "M"


class Liga:
    """Recorre una liga día por día. Guarda el estado (modelos de equipo e
    historial de jugadores) usando solo lo ya jugado."""

    def __init__(self, key, xi, ridge):
        self.key, self.xi, self.ridge = key, xi, ridge
        self.games, self.det, self.pre = load(key)
        self.teams = {}
        for g in self.games + self.pre:
            for s in ("h", "a"):
                self.teams.setdefault(g[s]["id"], len(self.teams))
        n = len(self.teams)
        self.m = {s: Poi(n) for s in STATS}
        self.H, self.A, self.D = [], [], []
        self.Y = {s: ([], []) for s in STATS}
        self.seen = {}
        self.tlast = {}     # equipo -> lista de (titulares, valores de equipo)
        self.th = {}        # equipo -> historial para la app (rival, local, stats propias y del rival)
        self.logo = {}      # sigla del rival -> escudo
        self.ph = {}        # jugador -> lista de valores cuando fue titular
        self.pinfo = {}     # jugador -> (nombre, posición, equipo)
        self.prior = {}     # (posición, stat) -> [suma, n]
        self.ready = False

    def fit(self, today):
        if len(self.H) < 30:
            self.ready = False
            return
        w = np.exp(-self.xi * (today - np.array(self.D)))
        hi, ai = np.array(self.H), np.array(self.A)
        for s in STATS:
            self.m[s].fit(hi, ai, np.array(self.Y[s][0], float), np.array(self.Y[s][1], float), w, self.ridge)
        self.ready = True

    def ingest(self, g):
        tm = (self.det.get(g["id"]) or {}).get("tm") or {}
        th, ta = tm.get(g["h"]["id"]), tm.get(g["a"]["id"])
        if not th or not ta or any(tval(t, s) is None for t in (th, ta) for s in STATS):
            return
        today = day(g["at"])
        self.H.append(self.teams[g["h"]["id"]]); self.A.append(self.teams[g["a"]["id"]]); self.D.append(today)
        for s in STATS:
            self.Y[s][0].append(tval(th, s)); self.Y[s][1].append(tval(ta, s))
        pl = (self.det.get(g["id"]) or {}).get("pl") or {}
        for side, t in (("h", th), ("a", ta)):
            tid = g[side]["id"]
            self.seen[tid] = self.seen.get(tid, 0) + 1
            st = [pid for pid, v in pl.items() if v.get("t") == tid and v.get("st")]
            self.tlast.setdefault(tid, []).append((st, {s: tval(t, s) for s in STATS}))
            o = "a" if side == "h" else "h"
            ot = ta if side == "h" else th
            vs = g[o].get("ab") or (g[o].get("n") or "?")[:3].upper()
            self.logo[vs] = g[o].get("logo")
            gf, gc = (g["h"]["s"], g["a"]["s"]) if side == "h" else (g["a"]["s"], g["h"]["s"])
            self.th.setdefault(tid, []).append({"vs": vs, "l": int(side == "h"), "d": g["at"][:10],
                                                "gf": gf, "gc": gc, "r": "G" if gf > gc else "E" if gf == gc else "P",
                                                **{s: tval(t, s) for s in STATS},
                                                **{"o" + s: tval(ot, s) for s in STATS}})
            for pid in st:
                v = pl[pid]
                pg = pos_g(v.get("pos"))
                vals = {s: (v.get(PJ[s][0]) or 0) for s in PJ}
                vals["_vs"], vals["_l"], vals["_d"] = vs, int(side == "h"), g["at"][:10]
                self.ph.setdefault(pid, []).append(vals)
                self.pinfo[pid] = (v.get("n"), pg, tid)
                for s in PJ:
                    pr = self.prior.setdefault((pg, s), [0.0, 0])
                    pr[0] += vals[s]; pr[1] += 1

    def ok(self, g):
        return self.ready and self.seen.get(g["h"]["id"], 0) >= 4 and self.seen.get(g["a"]["id"], 0) >= 4

    def team_lams(self, g):
        h, a = self.teams[g["h"]["id"]], self.teams[g["a"]["id"]]
        return {s: self.m[s].lam(h, a) for s in STATS}

    def players(self, g, lams):
        """Titulares probables (titular en >=3 de los últimos 5 partidos del
        equipo) con los datos crudos para calcular su promedio esperado."""
        out = []
        for i, side in enumerate(("h", "a")):
            tid = g[side]["id"]
            last = self.tlast.get(tid, [])[-5:]
            if len(last) < 4:
                continue
            cnt = {}
            for st, _ in last:
                for pid in st:
                    cnt[pid] = cnt.get(pid, 0) + 1
            tavg = {s: np.mean([tv[s] for _, tv in self.tlast[tid][-10:]]) for s in STATS}
            for pid, c in cnt.items():
                if c < 3:
                    continue
                hist = self.ph.get(pid, [])[-10:]
                nm, pg, _ = self.pinfo[pid]
                if pg == "G" or len(hist) < 3:
                    continue
                for s in PJ:
                    pr = self.prior.get((pg, s), [0, 0])
                    out.append({"pid": pid, "n": nm, "pos": pg, "side": side, "s": s,
                                "sum": sum(x[s] for x in hist), "k": len(hist),
                                "prior": pr[0] / max(pr[1], 1),
                                "ctx": lams[s][i] / max(tavg[s], 0.1)})
        return out


def p_mean(r, K, alpha):
    return (r["sum"] + K * r["prior"]) / (r["k"] + K) * (r["ctx"] ** alpha)


def walk(key, xi, ridge):
    L = Liga(key, xi, ridge)
    by = {}
    for g in L.games:
        by.setdefault(g["at"][:10], []).append(g)
    rows = []
    for d in sorted(by):
        L.fit(day(d))
        for g in by[d]:
            if not L.ok(g):
                continue
            tm = (L.det.get(g["id"]) or {}).get("tm") or {}
            th, ta = tm.get(g["h"]["id"]), tm.get(g["a"]["id"])
            if not th or not ta:
                continue
            lams = L.team_lams(g)
            real = {s: (tval(th, s), tval(ta, s)) for s in STATS}
            if any(v is None for s in STATS for v in real[s]):
                continue
            pl = (L.det.get(g["id"]) or {}).get("pl") or {}
            prs = []
            for r in L.players(g, lams):
                v = pl.get(r["pid"])
                if not v:      # no jugó: apuesta anulada
                    continue
                r["y"] = v.get(PJ[r["s"]][0]) or 0
                prs.append(r)
            rows.append({"d": g["at"][:10], "lams": lams, "real": real, "pl": prs})
        for g in by[d]:
            L.ingest(g)
    return rows


def probs(M, lines, disp):
    """Matriz N x líneas con la probabilidad de superar cada línea."""
    M = np.maximum(np.asarray(M, float), 1e-4)[:, None]
    k = np.floor(np.asarray(lines))[None, :]
    if disp <= 1.001:
        return poisson.sf(k, M)
    r = M / (disp - 1)
    return nbinom.sf(k, r, r / (r + M))


def lloss(P, Y):
    P = np.clip(P, 1e-6, 1 - 1e-6)
    return float(np.mean(-(Y * np.log(P) + (1 - Y) * np.log(1 - P))))


def arrays(rows, s):
    """Datos de una estadística: total, por equipo y por jugador."""
    d = np.array([r["d"] for r in rows])
    lh = np.array([r["lams"][s][0] for r in rows]); la = np.array([r["lams"][s][1] for r in rows])
    yh = np.array([r["real"][s][0] for r in rows], float); ya = np.array([r["real"][s][1] for r in rows], float)
    out = {"t": {"cal": d < CORTE, "M": lh + la, "Y": yh + ya, "lines": LT[s]},
           "e": {"cal": np.concatenate([d, d]) < CORTE, "M": np.concatenate([lh, la]),
                 "Y": np.concatenate([yh, ya]), "lines": LE[s]}}
    if s in PJ:
        px = [(r["d"], x) for r in rows for x in r["pl"] if x["s"] == s]
        out["j"] = {"cal": np.array([dd for dd, _ in px]) < CORTE,
                    "sum": np.array([x["sum"] for _, x in px], float), "k": np.array([x["k"] for _, x in px], float),
                    "prior": np.array([x["prior"] for _, x in px], float),
                    "ctx": np.array([float(x["ctx"]) for _, x in px]),
                    "Y": np.array([x["y"] for _, x in px], float), "lines": PJ[s][1]}
    return out


def pmean(a, K, alpha):
    return (a["sum"] + K * a["prior"]) / (a["k"] + K) * a["ctx"] ** alpha


def pick_eval(P, Yb):
    """Regla del pick: por fila, el lado (más/menos) y la línea más probable
    entre las que pagan cuota justa >= CUOTA_MIN. Devuelve (prob, acierto)."""
    C = np.concatenate([P, 1 - P], axis=1)
    O = np.concatenate([Yb, 1 - Yb], axis=1)
    ok = (C >= 0.5) & (C <= MAXP)
    Cm = np.where(ok, C, -1)
    j = np.argmax(Cm, axis=1)
    has = Cm[np.arange(len(C)), j] >= 0.5
    i = np.arange(len(C))[has]
    return C[i, j[has]], O[i, j[has]]


def main():
    t0 = time.time()
    print("Mercados de estadísticas: eligiendo ajustes (antes de", CORTE + ")", flush=True)
    walks, best = {}, {}
    for xi in (0.004, 0.008):
        for ridge in (6.0, 12.0, 24.0):
            ws = [r for k in SOCCER for r in walk(k, xi, ridge)]
            walks[(xi, ridge)] = ws
            sc = {}
            for s in STATS:
                A = arrays(ws, s)
                v = 0
                for g in ("t", "e"):
                    a = A[g]; c = a["cal"]
                    v += lloss(probs(a["M"][c], a["lines"], 1.3), (a["Y"][c][:, None] > np.array(a["lines"])[None, :]))
                sc[s] = v
                if s not in best or v < best[s][0]:
                    best[s] = (v, xi, ridge)
            print(f"  xi={xi} freno={ridge}:", {s: round(v, 4) for s, v in sc.items()}, f"{time.time()-t0:.0f}s", flush=True)
    print("  elegido por estadística:", {s: (b[1], b[2]) for s, b in best.items()}, flush=True)
    A = {s: arrays(walks[(best[s][1], best[s][2])], s) for s in STATS}
    disp = {"t": {}, "e": {}}
    for s in STATS:
        for g in ("t", "e"):
            a = A[s][g]; c = a["cal"]; Yb = a["Y"][c][:, None] > np.array(a["lines"])[None, :]
            disp[g][s] = min((1.0, 1.15, 1.3, 1.5, 1.8, 2.2, 2.7, 3.3), key=lambda dv: lloss(probs(a["M"][c], a["lines"], dv), Yb))
    print("  dispersión:", disp, flush=True)
    K, alpha = {}, {}
    for s in PJ:
        a = A[s]["j"]; c = a["cal"]; Yb = a["Y"][c][:, None] > np.array(a["lines"])[None, :]
        sub = {kk: (v[c] if isinstance(v, np.ndarray) else v) for kk, v in a.items()}
        K[s], alpha[s] = min(((k, al) for k in (2, 4, 8, 16, 32) for al in (0.0, 0.5, 1.0)),
                             key=lambda ka: lloss(probs(pmean(sub, *ka), a["lines"], 1.0), Yb))
    print("  jugadores K:", K, "contexto:", alpha, flush=True)

    rep = {"corte": CORTE, "cuota_min": CUOTA_MIN,
           "ajustes": {"equipo": {s: {"xi": best[s][1], "ridge": best[s][2]} for s in STATS},
                       "disp_t": disp["t"], "disp_e": disp["e"], "K": K, "alpha": alpha},
           "mercados": {}}
    for s in STATS:
        for g, a in A[s].items():
            lines = np.array(a["lines"])
            Mx = pmean(a, K[s], alpha[s]) if g == "j" else a["M"]
            P = probs(Mx, lines, 1.0 if g == "j" else disp[g][s])
            Yb = (a["Y"][:, None] > lines[None, :]).astype(float)
            c, t = a["cal"], ~a["cal"]
            base = Yb[c].mean(axis=0)                      # lo que pasaba antes (sabido de antemano)
            ml = lloss(P[t], Yb[t])
            bl = lloss(np.broadcast_to(base, Yb[t].shape), Yb[t])
            q, y = pick_eval(P[t], Yb[t])
            key = f"{s}_{g}"
            rep["mercados"][key] = {
                "titulo": TITULO[s] + {"t": " del partido", "e": " por equipo", "j": " por jugador"}[g],
                "n": int(t.sum()), "ll": round(ml, 4), "ll_base": round(bl, 4),
                "mejora": round(100 * (bl - ml) / bl, 2), "publicar": bool(ml < bl * 0.995 and len(q) >= 100),
                "picks": int(len(q)), "acierto_picks": round(100 * float(y.mean()), 1) if len(q) else None,
                "dijo_picks": round(100 * float(q.mean()), 1) if len(q) else None,
                "calibracion": calib([(None, float(qq), bool(yy)) for qq, yy in zip(q, y)]),
            }
            m = rep["mercados"][key]
            print(f"  {m['titulo']:<28} n={m['n']:>6}  modelo {ml:.4f} vs base {bl:.4f} ({m['mejora']:+.1f}%)  "
                  f"picks {m['picks']} dijo {m['dijo_picks']}% pasó {m['acierto_picks']}%  {'PUBLICAR' if m['publicar'] else 'no'}", flush=True)
    os.makedirs(os.path.join(DATA, "model"), exist_ok=True)
    with open(os.path.join(DATA, "model", "extra.json"), "w", encoding="utf-8") as f:
        json.dump(rep, f, ensure_ascii=False, indent=1)
    print(f"listo en {time.time()-t0:.0f}s")


# ---------------------------------------------------------------- pronóstico
def _txt(s, sc, lado, ln, quien=""):
    if s == "tar" and sc == "j" and ln == 0.5:
        return f"{quien}: {'recibe tarjeta' if lado == 'mas' else 'no recibe tarjeta'}"
    base = f"{'Más' if lado == 'mas' else 'Menos'} de {ln:g} {NOMBRE[s]}"
    return f"{quien}: {base[0].lower() + base[1:]}" if quien else base


def _best(pov, lines):
    """Pick de un mercado: el lado/línea más probable con cuota justa >= CUOTA_MIN."""
    c = [(p, "mas", ln) for p, ln in zip(pov, lines)] + [(1 - p, "menos", ln) for p, ln in zip(pov, lines)]
    c = [x for x in c if 0.5 <= x[0] <= MAXP]
    return max(c, key=lambda x: x[0]) if c else None


def _sel(m, p, txt, **kw):
    return {"m": m, "p": round(float(p), 4), "justa": round(1 / max(float(p), 1e-6), 2), "txt": txt, **kw}


def _ab(g, sd):
    return g[sd].get("ab") or (g[sd].get("n") or "?")[:3].upper()


def tabla(L, g):
    """Posiciones de la temporada actual (desde el 1 de julio) para los dos equipos."""
    hoy = g["at"][:10]
    ini = f"{int(hoy[:4]) - (1 if hoy[5:7] < '07' else 0)}-07-01"
    t = {}
    for x in L.games:
        if x["at"][:10] < ini:
            continue
        for sd, o in (("h", "a"), ("a", "h")):
            r = t.setdefault(x[sd]["id"], {"pj": 0, "g": 0, "e": 0, "p": 0, "gf": 0, "gc": 0})
            gf, gc = x[sd]["s"], x[o]["s"]
            r["pj"] += 1; r["gf"] += gf; r["gc"] += gc
            r["g" if gf > gc else "e" if gf == gc else "p"] += 1
    for r in t.values():
        r["pts"] = 3 * r["g"] + r["e"]
    orden = sorted(t, key=lambda k: (-t[k]["pts"], -(t[k]["gf"] - t[k]["gc"]), -t[k]["gf"]))
    out = {"n": len(orden)}
    for sd in ("h", "a"):
        tid = g[sd]["id"]
        if tid in t:
            out[sd] = {**t[tid], "pos": orden.index(tid) + 1}
    return out


def predict(soon, today_ord):
    """Mercados de estadísticas para los próximos partidos de fútbol.
    Devuelve {id_partido: {...}} solo con mercados que pasaron la prueba."""
    rep = json.load(open(os.path.join(DATA, "model", "extra.json"), encoding="utf-8"))
    aj, pub = rep["ajustes"], {k: v["publicar"] for k, v in rep["mercados"].items()}
    acierto = {k: v["acierto_picks"] for k, v in rep["mercados"].items()}
    out = {}
    for key in SOCCER:
        ligas = {}
        for s in STATS:
            pr = (aj["equipo"][s]["xi"], aj["equipo"][s]["ridge"])
            if pr not in ligas:
                L = Liga(key, *pr)
                for g in L.games:
                    L.ingest(g)
                L.fit(today_ord)
                ligas[pr] = L
        Ls = {s: ligas[(aj["equipo"][s]["xi"], aj["equipo"][s]["ridge"])] for s in STATS}
        L0 = Ls["sot"]
        for g in L0.pre:
            if not (g["h"] and g["a"] and soon(g["at"])) or not all(Ls[s].ok(g) for s in STATS):
                continue
            lams = {s: Ls[s].team_lams(g)[s] for s in STATS}
            grupos, picks = [], []
            for s in STATS:
                lh, la = lams[s]
                gr = {"s": s, "titulo": TITULO[s], "esp": [round(lh, 1), round(la, 1)]}
                for sc, M, lines, dsp, quien in (("t", lh + la, LT[s], aj["disp_t"][s], ""),
                                                  ("h", lh, LE[s], aj["disp_e"][s], g["h"]["n"]),
                                                  ("a", la, LE[s], aj["disp_e"][s], g["a"]["n"])):
                    if not pub.get(f"{s}_{'t' if sc == 't' else 'e'}"):
                        continue
                    pov = [p_over(M, ln, dsp) for ln in lines]
                    gr[sc] = [[ln, round(p, 4)] for ln, p in zip(lines, pov)]
                    b = _best(pov, lines)
                    if b:
                        picks.append(_sel(f"{s}|{sc}|{b[1]}|{b[2]:g}", b[0], _txt(s, "e", b[1], b[2], quien),
                                          s=s, sc=sc, prueba=acierto.get(f"{s}_{'t' if sc == 't' else 'e'}")))
                if len(gr) > 3:
                    grupos.append(gr)
            jug = []
            for r in L0.players(g, lams):
                s = r["s"]
                if not pub.get(f"{s}_j"):
                    continue
                m = pmean({k: np.array([v]) for k, v in r.items() if k in ("sum", "k", "prior", "ctx")},
                          aj["K"][s], aj["alpha"][s])[0]
                lines = PJ[s][1]
                b = _best([p_over(m, ln, 1.0) for ln in lines], lines)
                if b:
                    jug.append(_sel(f"{s}|j:{r['pid']}|{b[1]}|{b[2]:g}", b[0], _txt(s, "j", b[1], b[2], r["n"]),
                                    s=s, sc="j", pid=r["pid"], jugador=r["n"], side=r["side"],
                                    esp=round(float(m), 2), prueba=acierto.get(f"{s}_j"),
                                    ult=[[e[s], e["_vs"], e["_l"]] for e in L0.ph.get(r["pid"], [])[-30:]][::-1],
                                    vr=[[e[s], e["_d"], e["_l"]] for e in L0.ph.get(r["pid"], [])
                                        if e["_vs"] == _ab(g, "a" if r["side"] == "h" else "h")][-5:][::-1]))
            jug.sort(key=lambda x: -x["p"])
            hist = {sd: L0.th.get(g[sd]["id"], [])[-30:][::-1] for sd in ("h", "a")}
            vr = {sd: [e for e in L0.th.get(g[sd]["id"], []) if e["vs"] == _ab(g, "a" if sd == "h" else "h")][-5:][::-1]
                  for sd in ("h", "a")}
            out[g["id"]] = {"grupos": grupos, "picks": sorted(picks, key=lambda x: -x["p"]), "jug": jug,
                            "hist": hist, "vr": vr, "lg": {}, "tabla": tabla(L0, g)}
            for sd in ("h", "a"):
                for e in hist[sd]:
                    out[g["id"]]["lg"][e["vs"]] = L0.logo.get(e["vs"])
    return out


def outcome(m, det_g, hid, aid):
    """Califica un pick de estadísticas con el box score del partido.
    None = anulado (por ejemplo, el jugador no jugó)."""
    s, sc, lado, ln = m.split("|")
    ln = float(ln)
    tm = (det_g or {}).get("tm") or {}
    if sc.startswith("j:"):
        v = ((det_g or {}).get("pl") or {}).get(sc[2:])
        if not v:
            return None, None
        x = v.get(PJ[s][0]) or 0
    else:
        th, ta = tm.get(hid), tm.get(aid)
        if not th or not ta or tval(th, s) is None or tval(ta, s) is None:
            return None, None
        x = {"t": tval(th, s) + tval(ta, s), "h": tval(th, s), "a": tval(ta, s)}[sc]
    return ((x > ln) if lado == "mas" else (x < ln)), x


if __name__ == "__main__":
    main()
