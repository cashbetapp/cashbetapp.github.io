"""CASHBET - validación honesta del objetivo 70 %.

Lee el registro sellado (data/ledger.json) y mide, por mercado, SOLO con picks ya calificados:
  acierto, intervalo de confianza (Wilson 95 %), probabilidad media dicha, Brier, Log Loss,
  ROI y yield (solo con cuota real de una casa), CLV (cuota del pick frente al cierre del mercado,
  cuando el motor de cuotas tiene ese cierre) y cantidad de predicciones.

Reglas:
- No se toca el registro: solo se lee. Las pérdidas cuentan igual que los aciertos.
- Solo cuenta lo anotado ANTES del partido (pub < hora del partido). Lo anotado antes de que el
  registro guardara la hora de publicación cuenta aparte como "sin hora".
- Un mercado está "validado" para el 70 % solo si, con sus picks de 70 %+, el límite INFERIOR del
  intervalo de 95 % es >= 70 % y hay al menos N_MIN picks. Si no, se dice que no está validado.
- Sobreajuste: si el acierto real queda 8+ puntos por debajo de lo que prometía la prueba histórica.

Salida: data/model/validacion.json
Uso:  python evaluar.py
"""
import json, os, math, datetime as dt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
OBJ = 0.70        # objetivo
N_MIN = 100       # picks mínimos para declarar validado
N_POCO = 30       # menos que esto = datos insuficientes
GAP = 0.08        # caída frente a la prueba histórica que se marca como sobreajuste

MERCADO = {"cor": "Córners", "sot": "Tiros a puerta", "tir": "Tiros", "fal": "Faltas", "tar": "Tarjetas"}


def mercado(coll, e):
    """Mismo nombre de mercado que usa la página Historial (predict._mercado)."""
    if coll == "props":
        return "Jugadores NBA · " + (e.get("tipo") or "")
    if coll == "extra":
        return MERCADO.get(e["s"], e["s"]) + (" (jugador)" if e["sc"] == "j" else " (partido)" if e["sc"] == "t" else " (equipo)")
    m = e["m"]
    if e.get("dep") == "nba":
        return "NBA · " + ("Total de puntos" if m.startswith(("mas_", "menos_")) else "Hándicap" if m.startswith("hcp") else "Ganador")
    return "Goles" if m.startswith(("mas_", "menos_", "btts")) else "Resultado"


def wilson(k, n, z=1.96):
    if not n:
        return None, None
    p = k / n
    c = (p + z * z / (2 * n)) / (1 + z * z / n)
    r = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return c - r, c + r


def leer(path, defecto):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return defecto


def metricas(xs):
    """xs: lista de dicts con p, ok, cuota, real (cuota de casa), clv."""
    n = len(xs)
    out = {"n": n}
    if not n:
        return out
    k = sum(1 for x in xs if x["ok"])
    lo, hi = wilson(k, n)
    pp = [min(max(x["p"], 0.001), 0.999) for x in xs]
    y = [1 if x["ok"] else 0 for x in xs]
    base = sum(y) / n
    out.update({
        "aciertos": k, "fallos": n - k, "acierto": round(100 * k / n, 1),
        "ic95": [round(100 * lo, 1), round(100 * hi, 1)],
        "prob_media": round(100 * sum(pp) / n, 1),
        "brier": round(sum((a - b) ** 2 for a, b in zip(pp, y)) / n, 4),
        "logloss": round(-sum(math.log(a) if b else math.log(1 - a) for a, b in zip(pp, y)) / n, 4),
    })
    # sin la cuota real de una casa no hay ROI (una cuota "justa" calculada por nosotros no vale)
    reales = [x for x in xs if x["real"] and x["cuota"]]
    if reales:
        gan = sum((x["cuota"] - 1) if x["ok"] else -1 for x in reales)
        out["roi"] = {"n": len(reales), "unidades": round(gan, 2),
                      "yield": round(100 * gan / len(reales), 1),               # ganancia / dinero apostado
                      "roi_banca_100": round(gan, 2)}                          # ganancia sobre una banca de 100 unidades (1 por pick)
        out["cuota_media"] = round(sum(x["cuota"] for x in reales) / len(reales), 2)
    clv = [x["clv"] for x in xs if x["clv"] is not None]
    out["clv"] = {"n": len(clv), "medio": round(100 * sum(clv) / len(clv), 2) if clv else None}
    return out


def estado(m70):
    n = m70.get("n", 0)
    if n < N_POCO:
        return "datos insuficientes"
    lo = m70["ic95"][0] / 100
    if n >= N_MIN and lo >= OBJ:
        return "validado"
    if m70["acierto"] / 100 >= OBJ:
        return "en camino (acierto 70 %+ sin prueba suficiente)"
    return "no alcanza el 70 %"


def main():
    L = leer(os.path.join(DATA, "ledger.json"), {})
    cierre = leer(os.path.join(DATA, "odds", "cierre.json"), {})
    extra_bt = leer(os.path.join(DATA, "model", "extra.json"), {}).get("mercados", {})
    if not L:
        print("evaluar: no hay registro")
        return
    filas, sin_hora, despues = [], 0, 0
    for coll in ("partidos", "extra", "props"):
        for key, e in L.get(coll, {}).items():
            if e.get("ret") or e.get("estado") not in ("acierto", "fallo"):
                continue
            pub = e.get("pub")
            if pub and pub[:16] >= e["at"][:16]:
                despues += 1            # anotado con el partido ya empezado: no cuenta
                continue
            if not pub:
                sin_hora += 1
            c = cierre.get(f"{e.get('ev')}|{e.get('m')}") if coll == "partidos" else None
            cuota = e.get("cuota")
            filas.append({
                "coll": coll, "mk": mercado(coll, e), "p": float(e["p"]), "ok": e["estado"] == "acierto",
                "cuota": cuota, "real": bool(e.get("cuota_casa") or coll == "props"),
                "clv": round(cuota * c["p"] - 1, 4) if c and cuota and e.get("cuota_casa") else None,
                "bt": f"{e['s']}_{e['sc']}" if coll == "extra" else None, "dep": "nba" if coll == "props" or e.get("dep") == "nba" else "futbol",
                "at": e["at"], "pub": bool(pub),
            })

    def bloque(xs):
        todos = metricas(xs)
        m70 = metricas([x for x in xs if x["p"] >= OBJ])
        m74 = metricas([x for x in xs if x["p"] >= 0.74])
        return {"todos": todos, "p70": m70, "p74": m74, "estado": estado(m70)}

    por_mk = {}
    for x in filas:
        por_mk.setdefault(x["mk"], []).append(x)
    mercados = {}
    for mk, xs in sorted(por_mk.items(), key=lambda kv: -len(kv[1])):
        b = bloque(xs)
        # sobreajuste: lo que prometía la prueba histórica (extra.json) frente a lo real
        bts = {x["bt"] for x in xs if x["bt"]}
        prom = [extra_bt[k]["acierto_picks"] for k in bts if k in extra_bt and extra_bt[k].get("acierto_picks")]
        if prom and b["todos"]["n"] >= N_POCO:
            esperado = sum(prom) / len(prom)
            b["prueba_historica"] = round(esperado, 1)
            b["sobreajuste"] = (esperado - b["todos"]["acierto"]) / 100 >= GAP
        mercados[mk] = b

    calib = []
    for lo, hi in [(0.5, 0.6), (0.6, 0.7), (0.7, 0.74), (0.74, 0.8), (0.8, 1.01)]:
        xs = [x for x in filas if lo <= x["p"] < hi]
        if xs:
            calib.append({"rango": f"{round(lo * 100)}-{min(round(hi * 100), 100)} %", "n": len(xs),
                          "dijo": round(100 * sum(x["p"] for x in xs) / len(xs), 1),
                          "paso": round(100 * sum(x["ok"] for x in xs) / len(xs), 1)})
    out = {
        "generado": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "objetivo": {"acierto": 100 * OBJ, "n_min": N_MIN, "regla": "límite inferior del intervalo de 95 % >= 70 % con 100+ picks de 70 %+"},
        "excluidos": {"anotados_con_el_partido_empezado": despues},
        "sin_hora_de_publicacion": sin_hora,
        "global": bloque(filas),
        # solo los picks con hora de publicación guardada ANTES del partido (los de antes del sello no la tienen):
        # es la muestra que se puede demostrar que se predijo antes del resultado
        "verificable": bloque([x for x in filas if x["pub"]]),
        "deporte": {d: bloque([x for x in filas if x["dep"] == d]) for d in ("futbol", "nba")},
        "mercados": mercados,
        "calibracion": calib,
        "validados": [mk for mk, b in mercados.items() if b["estado"] == "validado"],
    }
    os.makedirs(os.path.join(DATA, "model"), exist_ok=True)
    with open(os.path.join(DATA, "model", "validacion.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    g = out["global"]
    print(f"evaluar: {g['todos']['n']} picks calificados ({sin_hora} sin hora de publicación, {despues} excluidos)")
    v = out["verificable"]["p70"]
    print(f"evaluar: con hora probada, picks de 70 %+: {v.get('n', 0)}, acierto {v.get('acierto')}, IC95 {v.get('ic95')}")
    print(f"  {'mercado':<34}{'n':>5}{'acierto':>9}{'n70+':>6}{'ac70+':>7}{'IC95 70+':>14}  estado")
    for mk, b in mercados.items():
        t, m = b["todos"], b["p70"]
        ic = f"{m['ic95'][0]}-{m['ic95'][1]}" if m.get("ic95") else "-"
        print(f"  {mk[:33]:<34}{t['n']:>5}{t.get('acierto', '-'):>9}{m['n']:>6}{m.get('acierto', '-'):>7}{ic:>14}  {b['estado']}"
              + ("  [SOBREAJUSTE: prueba " + str(b['prueba_historica']) + "]" if b.get("sobreajuste") else ""))
    print("  validados:", out["validados"] or "ninguno todavía")


if __name__ == "__main__":
    main()
