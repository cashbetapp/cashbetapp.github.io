"""CASHBET - motor de candidatos (solo lectura: NO cambia lo que se publica).

1. Toma todos los eventos que el robot pronosticó (fútbol, ligas nuevas y NBA).
2. Genera todos los candidatos de cada partido: resultado, doble oportunidad, goles,
   ambos marcan, córners, tiros, tiros a puerta, faltas, tarjetas (partido y equipo),
   estadísticas de jugadores y jugadores NBA.
3. Evalúa cada mercado por separado: probabilidad del modelo, cuota justa, cuota real
   (si la hay), EV y margen de error (intervalo de 95 % del acierto REAL de ese mercado).
4. Descarta con un motivo concreto, quita duplicados/correlacionados y ordena.
5. Clasifica en VALIDADO / EN EVALUACIÓN / EXPERIMENTAL con las reglas de siempre
   (validacion.json, no se relajan) y nunca rellena hasta un número fijo de picks.

Sale data/model/candidatos.json (embudo, motivos, escenarios de cuota mínima y ranking).
Uso:  python candidatos.py [picks.json] [validacion.json] [fuente.json] [salida.json]
"""
import json, os, sys, collections, datetime as dt

from evaluar import mercado as nombre_mercado

DATA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
PMIN, PMAX = 0.70, 0.85          # mismas reglas del robot (predict.py)
PISO = 1.40                      # pedido del usuario 2026-11-12: nada con cuota < 1.40
ESCENARIOS = (1.18, 1.30, 1.40)  # para comparar el impacto de la cuota mínima
OBJETIVO = (15, 20)              # objetivo de producción diaria (NUNCA se rellena)
ORDEN_CAT = {"validado": 0, "en evaluación": 1, "experimental": 2}
SN = {"cor": "córners", "sot": "tiros a puerta", "tir": "tiros", "fal": "faltas", "tar": "tarjetas"}


def dia_col(at):
    return (dt.datetime.fromisoformat(at.replace("Z", "")) - dt.timedelta(hours=5)).strftime("%Y-%m-%d")


def categoria(V, nm):
    b = (V or {}).get(nm)
    if not b:
        return "experimental", None
    e = b.get("estado") or ""
    ic = (b.get("p70") or {}).get("ic95")
    if e == "validado":
        return "validado", ic
    if e.startswith("en camino"):
        return "en evaluación", ic
    return "experimental", ic


def familia(m):
    if m in ("1", "X", "2", "1X", "X2", "12") or m.startswith("hcp"):
        return "resultado"
    if m.startswith(("mas_", "menos_")):
        return "goles/puntos"
    return "ambos marcan" if m.startswith("btts") else m


def candidatos(P, V, F):
    out = []

    def add(g, coll, rec, p, sel, txt, grupo, cuota=None, extra_motivo=None):
        nm = nombre_mercado(coll, rec)
        cat, ic = categoria(V, nm)
        out.append({"dia": dia_col(g["at"]), "at": g["at"], "dep": g["dep"], "lg": g.get("lg"), "liga": g.get("liga"),
                    "ev": str(g["id"]), "partido": g.get("partido") or f"{g['h']['n']} vs {g['a']['n']}",
                    "mercado": nm, "sel": sel, "txt": txt, "p": p, "justa": round(1 / p, 2) if p else None,
                    "cuota": cuota, "ev_pct": round(100 * (p * cuota - 1), 1) if (p and cuota) else None,
                    "acierto_real_ic95": ic, "cat": cat, "grupo": grupo, "motivo_previo": extra_motivo})

    for g in P.get("partidos", []):
        # mercados principales (resultado, doble oportunidad, goles, ambos marcan; NBA ganador/hándicap/total)
        for x in g.get("mercados") or []:
            add(g, "partidos", {"m": x["m"], "dep": g["dep"], "lg": g.get("lg")}, x.get("p"), x["m"], x.get("txt") or x["m"],
                (g["id"], "principal", familia(x["m"])), x.get("cuota"))
        ex = g.get("extra") or {}
        # estadísticas de partido y de equipo: todas las líneas, los dos lados
        for gr in ex.get("grupos") or []:
            for sc in ("t", "h", "a"):
                for ln, po in gr.get(sc) or []:
                    for lado, p in (("mas", po), ("menos", 1 - po)):
                        rec = {"s": gr["s"], "sc": sc, "lg": g.get("lg")}
                        quien = "" if sc == "t" else g[sc]["n"] + ": "
                        add(g, "extra", rec, round(p, 4), f"{gr['s']}|{sc}|{lado}|{ln}",
                            f"{quien}{'más' if lado == 'mas' else 'menos'} de {ln} {SN.get(gr['s'], gr['s'])}",
                            (g["id"], gr["s"], sc))
        # jugadores de fútbol (todas las líneas evaluadas; ver extra.py cand_j)
        for clave, motivo in (("jug", None), ("jug_fuera", "liga sin picks de jugadores (pedido del usuario)")):
            for pid, nom, s, lineas in (F.get(clave) or {}).get(str(g["id"]), []):
                for ln, po in lineas:
                    for lado, p in (("mas", po), ("menos", 1 - po)):
                        add(g, "extra", {"s": s, "sc": "j", "lg": g.get("lg")}, round(p, 4), f"{s}|j:{pid}|{lado}|{ln}",
                            f"{nom}: {'más' if lado == 'mas' else 'menos'} de {ln} {SN.get(s, s)}",
                            (g["id"], "jugador", pid), extra_motivo=motivo)
    # jugadores NBA (todas las líneas de ESPN antes del filtro; cuota real = la peor de las dos)
    for x in F.get("props") or []:
        g = {"at": x["at"], "dep": "nba", "lg": "nba", "liga": "NBA", "id": x["ev"], "partido": x["partido"]}
        add(g, "props", {"tipo": x["tipo"]}, x["p"], f"{x['jugador']}|{x['tipo']}|{x['lado']}|{x['linea']}",
            f"{x['jugador']}: {'más' if x['lado'] == 'mas' else 'menos'} de {x['linea']} {x['tipo'].lower()}",
            (x["ev"], "jugador", x["jugador"]), x.get("cuota"))
    return out


def motivo(c, piso, nba_ok):
    p = c["p"]
    if p is None:
        return "falta de datos"
    if c["motivo_previo"]:
        return c["motivo_previo"]
    if p < PMIN:
        return "probabilidad < 70 %"
    if p > PMAX:
        return "probabilidad > 85 % (el modelo no publica tan alto)"
    cuota = c["cuota"] or c["justa"]
    if cuota < piso:
        return f"cuota < {piso:.2f}"
    if c["cuota"] and p * c["cuota"] < 1:
        return "cuota real sin valor (EV < 0)"
    if c["dep"] == "nba" and not nba_ok:
        return "NBA bloqueada (no demostró 70 % real)"
    return None


def clave_orden(c):
    lo = (c["acierto_real_ic95"] or [0, 0])[0]
    return (ORDEN_CAT[c["cat"]], -lo, -(c["p"] or 0), -(c["ev_pct"] or -99))


def evaluar_piso(C, piso, nba_ok):
    motivos = collections.Counter()
    vivos = []
    for c in C:
        m = motivo(c, piso, nba_ok)
        if m:
            motivos[m] += 1
        else:
            vivos.append(c)
    # duplicados / correlacionados: uno por grupo (mismo partido + misma familia/estadística/jugador)
    mejor = {}
    for c in sorted(vivos, key=clave_orden):
        if c["grupo"] in mejor:
            motivos["duplicado o correlacionado con otro pick del mismo partido"] += 1
        else:
            mejor[c["grupo"]] = c
    return motivos, sorted(mejor.values(), key=clave_orden)


def main():
    a = sys.argv[1:] + [None] * 4
    P = json.load(open(a[0] or os.path.join(DATA, "picks.json"), encoding="utf-8"))
    V = json.load(open(a[1] or os.path.join(DATA, "model", "validacion.json"), encoding="utf-8")).get("mercados") or {}
    fp = a[2] or os.path.join(DATA, "model", "candidatos_fuente.json")
    F = json.load(open(fp, encoding="utf-8")) if os.path.exists(fp) else {}
    nba_ok = F.get("nba_ok", P.get("nba_ok", False))
    C = candidatos(P, V, F)
    hoy = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=5)).strftime("%Y-%m-%d")
    dias = sorted({c["dia"] for c in C if c["dia"] >= hoy})
    C = [c for c in C if c["dia"] >= hoy]
    ev_dia = collections.defaultdict(set)
    for c in C:
        ev_dia[(c["dia"], c["dep"])].add(c["ev"])
    res = {"generado": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
           "reglas": {"probabilidad": f"{int(PMIN * 100)}-{int(PMAX * 100)} %", "cuota_minima": PISO,
                      "objetivo_diario": f"{OBJETIVO[0]}-{OBJETIVO[1]} (no se rellena si no hay oportunidades)",
                      "categorias": "validado / en evaluación / experimental según validacion.json (sin cambios)",
                      "nba_en_listas": nba_ok},
           "cobertura": {d: {"futbol": len(ev_dia[(d, "futbol")]), "nba": len(ev_dia[(d, "nba")])} for d in dias},
           "ligas": dict(collections.Counter(z[1] for z in {(c["ev"], c["liga"]) for c in C})),
           "candidatos": len(C), "mercados_evaluados": len({c["mercado"] for c in C}),
           "por_mercado": dict(collections.Counter(c["mercado"] for c in C).most_common()),
           "escenarios": {}}
    for piso in ESCENARIOS:
        motivos, ok = evaluar_piso(C, piso, nba_ok)
        pub = [c for c in ok if c["cat"] != "experimental"]
        exp = [c for c in ok if c["cat"] == "experimental"]
        res["escenarios"][f"{piso:.2f}"] = {
            "descartes": dict(motivos.most_common()),
            "descartes_pct": {k: round(100 * v / max(len(C), 1), 1) for k, v in motivos.most_common()},
            "publicables_por_dia": {d: sum(c["dia"] == d for c in pub) for d in dias},
            "experimentales_por_dia": {d: sum(c["dia"] == d for c in exp) for d in dias},
            "por_mercado": dict(collections.Counter(c["mercado"] for c in ok).most_common()),
            "por_categoria": dict(collections.Counter(c["cat"] for c in ok)),
        }
        if piso == PISO:
            campos = ("dia", "at", "dep", "liga", "partido", "mercado", "txt", "p", "justa", "cuota", "ev_pct", "acierto_real_ic95", "cat")
            res["ranking"] = {d: [{k: c[k] for k in campos} for c in ok if c["dia"] == d][:OBJETIVO[1]] for d in dias}
    out = a[3] or os.path.join(DATA, "model", "candidatos.json")
    json.dump(res, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    e = res["escenarios"][f"{PISO:.2f}"]
    print(f"candidatos: {len(C)} en {sum(len(v) for v in ev_dia.values())} partidos, {res['mercados_evaluados']} mercados;",
          "publicables por día (cuota >= %.2f):" % PISO, e["publicables_por_dia"])


if __name__ == "__main__":
    main()
