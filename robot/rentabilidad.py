"""CASHBET - informe de rentabilidad (solo lee el registro sellado; no cambia nada).

Separa el ROI por deporte, mercado, fuente de la cuota, rango de cuota, probabilidad estimada,
lado (más/menos), fecha y por si la hora de publicación es verificable. El ROI solo se calcula con
picks que tienen CUOTA REAL de una casa; una cuota "justa" calculada por el modelo no vale para ROI.

Para cada grupo da también el punto de equilibrio: con cuota media c hay que acertar 1/c para no perder.
"Posible ventaja" = grupo con 30+ picks cuyo intervalo de Wilson 95 % del acierto queda ENTERO por
encima del punto de equilibrio. Sin eso, no se afirma ninguna ventaja.

Salida: data/model/rentabilidad.json
Uso:  python rentabilidad.py [ruta_al_ledger.json]
"""
import json, os, sys, datetime as dt
from evaluar import mercado, wilson, leer, DATA

N_GRUPO = 30


def filas(L):
    out = []
    for coll in ("partidos", "extra", "props"):
        for key, e in L.get(coll, {}).items():
            if e.get("ret") or e.get("estado") not in ("acierto", "fallo"):
                continue
            pub = e.get("pub")
            if pub and pub[:16] >= e["at"][:16]:
                continue                                   # anotado con el partido empezado: no cuenta
            # igual que evaluar.py: props NBA siempre traen la cuota de la casa (ESPN); en extra solo si casa_real
            real = bool(e.get("cuota_casa") or e.get("casa_real") or coll == "props")
            out.append({
                "coll": coll, "mk": mercado(coll, e), "p": float(e["p"]), "ok": e["estado"] == "acierto",
                "cuota": e.get("cuota"), "real": real and bool(e.get("cuota")),
                "dep": "nba" if coll == "props" or e.get("dep") == "nba" else "futbol",
                "liga": e.get("liga") or e.get("lg") or "?",
                "fuente": (e.get("fuente") or "ESPN (registro antiguo, sin campo fuente)") if real else "sin cuota real",
                "lado": e.get("lado") or (e["m"].split("|")[2] if coll == "extra" and e["m"].count("|") >= 3 else
                                           "mas" if str(e.get("m", "")).startswith("mas_") else
                                           "menos" if str(e.get("m", "")).startswith("menos_") else "otro"),
                "tipo": e.get("tipo") if coll == "partidos" else ("valor" if (e.get("valor") or -1) > 0 else "prob") if coll == "props" else "prob",
                "verificable": bool(pub), "dia": e["at"][:10],
            })
    return out


def resumen(xs):
    n = len(xs)
    out = {"n": n}
    if not n:
        return out
    k = sum(x["ok"] for x in xs)
    lo, hi = wilson(k, n)
    out.update({"acierto": round(100 * k / n, 1), "ic95": [round(100 * lo, 1), round(100 * hi, 1)],
                "prob_media": round(100 * sum(x["p"] for x in xs) / n, 1)})
    reales = [x for x in xs if x["real"]]
    out["con_cuota_real"] = len(reales)
    if reales:
        g = sum((x["cuota"] - 1) if x["ok"] else -1 for x in reales)
        cm = sum(x["cuota"] for x in reales) / len(reales)
        kr = sum(x["ok"] for x in reales)
        lo_r, hi_r = wilson(kr, len(reales))
        eq = 1 / cm
        out.update({"unidades": round(g, 2), "yield": round(100 * g / len(reales), 1), "cuota_media": round(cm, 2),
                    "acierto_con_cuota": round(100 * kr / len(reales), 1),
                    "equilibrio": round(100 * eq, 1),       # acierto necesario para no perder con esa cuota media
                    # cuánto pagaba la casa frente a lo que decía el modelo: p*cuota-1 medio (EV prometido)
                    "ev_prometido": round(100 * sum(x["p"] * x["cuota"] - 1 for x in reales) / len(reales), 1)})
        if len(reales) >= N_GRUPO:
            out["veredicto"] = ("posible ventaja (acierto por encima del equilibrio con 95 % de confianza)" if lo_r > eq else
                                "pierde (acierto por debajo del equilibrio con 95 % de confianza)" if hi_r < eq else
                                "sin conclusión (el intervalo cruza el equilibrio)")
        else:
            out["veredicto"] = "muy pocos picks con cuota real"
    else:
        out["veredicto"] = "sin cuota real: el ROI no se puede medir"
    return out


def por(xs, clave):
    g = {}
    for x in xs:
        g.setdefault(clave(x), []).append(x)
    return {k: resumen(v) for k, v in sorted(g.items(), key=lambda kv: -len(kv[1]))}


def rango_cuota(c):
    if not c:
        return "sin cuota"
    for lo, hi in [(1, 1.3), (1.3, 1.5), (1.5, 1.7), (1.7, 2.0), (2.0, 2.5), (2.5, 99)]:
        if lo <= c < hi:
            return f"{lo:.2f}-{hi:.2f}" if hi < 99 else "2.50+"
    return "?"


def rango_p(p):
    for lo, hi in [(0, .5), (.5, .55), (.55, .6), (.6, .65), (.65, .7), (.7, .74), (.74, .8), (.8, 1.01)]:
        if lo <= p < hi:
            return f"{round(lo * 100)}-{min(round(hi * 100), 100)} %"


def semana(d):
    y, w, _ = dt.date.fromisoformat(d).isocalendar()
    return f"{y}-S{w:02d}"


def main():
    ruta = sys.argv[1] if len(sys.argv) > 1 else os.path.join(DATA, "ledger.json")
    L = leer(ruta, {})
    if not L:
        print("rentabilidad: no hay registro")
        return
    xs = filas(L)
    out = {
        "generado": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "nota": "ROI solo con cuota real de una casa. Nada se modifica: solo se lee el registro sellado.",
        "total": resumen(xs),
        "verificable": {"con hora de publicación": resumen([x for x in xs if x["verificable"]]),
                        "sin hora (antes del sello)": resumen([x for x in xs if not x["verificable"]])},
        "deporte": por(xs, lambda x: x["dep"]),
        "mercado": por(xs, lambda x: x["mk"]),
        "fuente_cuota": por(xs, lambda x: x["fuente"]),
        "liga": por(xs, lambda x: x["liga"]),
        "rango_cuota": por([x for x in xs if x["real"]], lambda x: rango_cuota(x["cuota"])),
        "probabilidad": por(xs, lambda x: rango_p(x["p"])),
        "lado": por(xs, lambda x: x["lado"]),
        "tipo_pick": por(xs, lambda x: f"{x['coll']}·{x['tipo']}"),
        "semana": por(xs, lambda x: semana(x["dia"])),
    }
    out["posibles_ventajas"] = [f"{sec}: {k}" for sec in ("mercado", "liga", "rango_cuota", "probabilidad", "lado", "tipo_pick")
                                for k, v in out[sec].items() if str(v.get("veredicto", "")).startswith("posible")]
    dest = os.path.join(DATA, "model", "rentabilidad.json") if len(sys.argv) <= 1 else sys.argv[2] if len(sys.argv) > 2 else "rentabilidad.json"
    os.makedirs(os.path.dirname(os.path.abspath(dest)), exist_ok=True)
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    t = out["total"]
    print(f"rentabilidad: {t['n']} picks, {t.get('con_cuota_real', 0)} con cuota real, yield {t.get('yield')} %")
    print("posibles ventajas:", out["posibles_ventajas"] or "ninguna demostrada")


if __name__ == "__main__":
    main()
