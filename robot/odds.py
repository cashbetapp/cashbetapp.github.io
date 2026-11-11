"""CASHBET ODDS INTELLIGENCE - motor de comparación de cuotas.

Fuente: The Odds API (plan gratis, clave en el secreto ODDS_API_KEY; nunca se imprime).
Casas de la región "eu" (incluye Pinnacle, la referencia de precio justo).

Qué hace en cada corrida:
  1. Mira (gratis) qué ligas tienen partidos en las próximas horas.
  2. Pide cuotas solo de esas ligas y solo si el presupuesto de créditos del mes lo permite.
  3. Quita el margen de cada casa y calcula la probabilidad "del mercado"
     (Pinnacle sin margen; si no está, la mediana de al menos 4 casas).
  4. Compara cada cuota con esa probabilidad (EV = prob × cuota - 1) y con la del modelo de CASHBET.
  5. Clasifica: normal / desajustada / valor / arbitraje / descartada.
  6. Guarda los movimientos de la probabilidad y registra cuándo aparece y desaparece
     cada oportunidad, con la cuota de cierre (CLV) para probar con el tiempo si el valor es real.

Regla: "valor" solo se publica cuando el propio registro del motor demuestra CLV positivo
con suficientes casos (VALOR_MIN_N). Mientras no, lo máximo es "desajustada (en observación)".
Nunca se afirma que una casa tiene un error confirmado.

Salidas: data/odds.json (para la app) y data/odds/{uso,hist,registro}.json (memoria del motor).
Uso:  python odds.py
"""
import json, os, sys, time, gzip, unicodedata, statistics, datetime as dt, urllib.request, urllib.error
from difflib import SequenceMatcher

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
DIR = os.path.join(DATA, "odds")
OUT = os.path.join(DATA, "odds.json")
BASE = "https://api.the-odds-api.com/v4"
KEY = os.environ.get("ODDS_API_KEY", "").strip()

REGION = "eu"
MARKETS = "h2h,totals"           # coste por consulta = 2 créditos (mercados × regiones)
COSTE = 2
CREDITOS_MES = 500
RESERVA = 20                      # nunca bajar de aquí
VENTANA_H = 30                    # solo ligas con partidos en las próximas 30 h
CADA_H = 6                        # una liga no se vuelve a pedir antes de 6 h...
PREVIA_MIN = (30, 150)            # ...salvo para la foto de cierre (30-150 min antes del partido)

MIN_CASAS = 4                     # menos casas = datos insuficientes
UMBRAL_EV = 0.02                  # +2 % sobre el precio justo para considerarla desajustada
UMBRAL_MOV = 0.05                 # 5 puntos de probabilidad = movimiento fuerte
VIEJA_MIN = 45                    # cuota con más de 45 min de atraso frente a la referencia
VALOR_MIN_N = 100                 # oportunidades cerradas necesarias para hablar de "valor"
ANTIGUO_H = 6                     # datos de más de 6 h: se marcan como antiguos (nunca se presentan como actuales)
REF = "pinnacle"
ARB_MIN = 0.005                   # arbitraje de menos de 0.5 % no se cuenta
# bolsas de apuestas: su cuota se paga con comisión sobre la ganancia, así que no se comparan
# como "mejor cuota" ni para arbitraje (sí cuentan para el consenso de precio justo)
BOLSAS = {"betfair_ex_eu", "betfair_ex_uk", "betfair_ex_au", "matchbook", "smarkets"}

LIGAS = {  # clave The Odds API -> (clave ESPN usada en CASHBET, nombre)
    "soccer_epl": ("eng.1", "Premier League"),
    "soccer_spain_la_liga": ("esp.1", "LaLiga"),
    "soccer_italy_serie_a": ("ita.1", "Serie A"),
    "soccer_germany_bundesliga": ("ger.1", "Bundesliga"),
    "soccer_france_ligue_one": ("fra.1", "Ligue 1"),
    "soccer_uefa_champs_league": ("uefa.champions", "Champions League"),
    "soccer_mexico_ligamx": ("mex.1", "Liga MX"),
    "basketball_nba": ("nba", "NBA"),
}


# ---------------------------------------------------------------- utilidades
def ahora():
    return dt.datetime.now(dt.timezone.utc)


def iso(t):
    return t.strftime("%Y-%m-%dT%H:%MZ")


def fecha(s):
    if not s:
        return None
    s = s.replace("Z", "+00:00")
    if len(s) == 22 and s[16] == "+":  # 2026-11-09T00:00+00:00
        s = s[:16] + ":00" + s[16:]
    return dt.datetime.fromisoformat(s)


def leer(path, defecto):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return defecto


def guardar(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)


def limpio(msg):
    """Nunca dejar la clave en un mensaje."""
    return str(msg).replace(KEY, "***") if KEY else str(msg)


def pedir(ruta, **params):
    """GET a The Odds API. Devuelve (json, cabeceras) o (None, error)."""
    params["apiKey"] = KEY
    q = "&".join(f"{k}={v}" for k, v in params.items())
    req = urllib.request.Request(f"{BASE}{ruta}?{q}", headers={"Accept-Encoding": "gzip", "User-Agent": "cashbet-robot"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            if r.headers.get("Content-Encoding") == "gzip" or raw[:2] == b"\x1f\x8b":
                raw = gzip.decompress(raw)
            return json.loads(raw.decode("utf-8")), dict(r.headers)
    except urllib.error.HTTPError as e:
        cuerpo = ""
        try:
            cuerpo = e.read().decode("utf-8", "ignore")[:200]
        except Exception:
            pass
        return None, limpio(f"HTTP {e.code} {cuerpo}")
    except Exception as e:  # noqa
        return None, limpio(e)


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    for ch in ".-'&/()":
        s = s.replace(ch, " ")
    fuera = {"fc", "cf", "club", "de", "the", "ac", "sc", "cd", "ud", "afc", "ssc", "as", "rc", "sv", "vfb", "vfl", "tsg", "1", "fsv", "sk"}
    return " ".join(w for w in s.split() if w not in fuera)


def parecido(a, b):
    a, b = norm(a), norm(b)
    if not a or not b:
        return 0.0
    if a in b or b in a:
        return 1.0
    ta, tb = set(a.split()), set(b.split())
    if ta & tb:
        return max(0.85, SequenceMatcher(None, a, b).ratio())
    return SequenceMatcher(None, a, b).ratio()


def sin_margen(precios):
    """Cuotas decimales -> probabilidades sin el margen de la casa (método proporcional)."""
    imp = [1 / c for c in precios]
    s = sum(imp)
    return [x / s for x in imp], s - 1


def pt(x):
    return ("%g" % float(x))


# ---------------------------------------------------------------- presupuesto
def presupuesto(uso, t):
    """Créditos que se pueden gastar hoy sin quedarse sin nada antes de fin de mes."""
    mes = t.strftime("%Y-%m")
    if uso.get("mes") != mes:
        uso.update({"mes": mes, "restantes": CREDITOS_MES, "dias": {}})
    sig = (t.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
    dias_quedan = (sig.date() - t.date()).days  # incluye hoy
    hoy = t.strftime("%Y-%m-%d")
    gastado_hoy = uso["dias"].get(hoy, 0)
    disponible = max(0, uso.get("restantes", CREDITOS_MES) - RESERVA)
    cupo_hoy = (disponible + gastado_hoy) / max(1, dias_quedan)
    return max(0, int(cupo_hoy - gastado_hoy)), hoy


# ---------------------------------------------------------------- partidos de CASHBET
def partidos_cashbet():
    d = leer(os.path.join(DATA, "picks.json"), {})
    return d.get("partidos", [])


def emparejar(ev, lg, partidos):
    t = fecha(ev["commence_time"])
    mejor, score = None, 0
    for g in partidos:
        if g.get("lg") != lg or not g.get("at"):
            continue
        if abs((fecha(g["at"]) - t).total_seconds()) > 3 * 3600:
            continue
        s = parecido(ev["home_team"], g["h"]["n"]) + parecido(ev["away_team"], g["a"]["n"])
        if s > score:
            mejor, score = g, s
    return mejor if score >= 1.5 else None


# ---------------------------------------------------------------- análisis de un evento
def analizar(ev, lg, liga, g, hist, t):
    casas = ev.get("bookmakers") or []
    modelo = {m["m"]: m["p"] for m in (g or {}).get("mercados", []) if m.get("p") is not None}
    nombres = {ev["home_team"]: "1", ev["away_team"]: "2", "Draw": "X"}
    txt_l = (g or {}).get("h", {}).get("n") or ev["home_team"]
    txt_v = (g or {}).get("a", {}).get("n") or ev["away_team"]

    # agrupar: (mercado, línea) -> casa -> {resultado: (cuota, hora)}
    grupos = {}
    for b in casas:
        for mk in b.get("markets", []):
            hora = mk.get("last_update") or b.get("last_update")
            for o in mk.get("outcomes", []):
                if mk["key"] == "h2h":
                    clave, res = ("h2h", None), nombres.get(o["name"])
                elif mk["key"] == "totals" and o.get("point") is not None:
                    clave, res = ("totals", pt(o["point"])), ("mas" if o["name"] == "Over" else "menos")
                else:
                    continue
                if res and o.get("price") and o["price"] > 1:
                    grupos.setdefault(clave, {}).setdefault(b["key"], {"titulo": b.get("title", b["key"]), "r": {}})["r"][res] = (float(o["price"]), hora)

    # totales: cada casa ofrece líneas distintas; solo se analizan las que ofrecen 4+ casas.
    # Si ninguna llega, se deja la más ofrecida (saldrá como descartada por datos insuficientes).
    tot = {c: v for c, v in grupos.items() if c[0] == "totals"}
    if tot:
        buenas = [c for c, v in tot.items() if len(v) >= MIN_CASAS]
        dejar = set(buenas) or {max(tot, key=lambda c: len(tot[c]))}
        grupos = {c: v for c, v in grupos.items() if c[0] != "totals" or c in dejar}

    salida = []
    for (mk, linea), por_casa in grupos.items():
        resultados = ["1", "X", "2"] if mk == "h2h" and lg != "nba" else ["1", "2"] if mk == "h2h" else ["mas", "menos"]
        completas = {k: v for k, v in por_casa.items() if all(r in v["r"] for r in resultados)}
        n = len(completas)
        # probabilidad justa por casa
        justas = {}
        for k, v in completas.items():
            probs, margen = sin_margen([v["r"][r][0] for r in resultados])
            justas[k] = dict(zip(resultados, probs))
            v["margen"] = margen
        if REF in justas and n >= 2:  # Pinnacle sola no deja nada que comparar
            ref, ref_nom, ref_hora = justas[REF], "Pinnacle sin margen", fecha(completas[REF]["r"][resultados[0]][1])
        elif n >= MIN_CASAS:  # sin Pinnacle: mediana
            ref = {r: statistics.median(j[r] for j in justas.values()) for r in resultados}
            s = sum(ref.values())
            ref = {r: p / s for r, p in ref.items()}
            ref_nom, ref_hora = f"mediana de {n} casas sin margen", None
        else:
            ref, ref_nom, ref_hora = None, None, None

        # arbitraje: la mejor cuota de cada resultado, de casas distintas o no
        mejores = {}
        for r in resultados:
            ofertas = [(v["r"][r][0], k, v["titulo"], v["r"][r][1]) for k, v in por_casa.items() if r in v["r"] and k not in BOLSAS]
            if ofertas:
                mejores[r] = max(ofertas)
        arb = None
        if len(mejores) == len(resultados):
            suma = sum(1 / mejores[r][0] for r in resultados)
            if 1 / suma - 1 >= ARB_MIN:
                arb = round(1 / suma - 1, 4)

        for r in resultados:
            if r not in mejores:
                continue
            cuota, ck, ctit, chora = mejores[r]
            m_key = r if mk == "h2h" else f"{r}_{linea}"
            if mk == "h2h":
                txt = "Empate" if r == "X" else f"Gana {txt_l if r == '1' else txt_v}"
            else:
                txt = f"{'Más' if r == 'mas' else 'Menos'} de {linea} {'puntos' if lg == 'nba' else 'goles'}"
            item = {
                "mercado": m_key, "txt": txt, "casas": n,
                "mejor": {"casa": ctit, "cuota": cuota, "hora": chora},
                "cuotas": sorted(([v["titulo"] + (" (bolsa)" if k in BOLSAS else ""), v["r"][r][0]] for k, v in por_casa.items() if r in v["r"]), key=lambda x: -x[1]),
                "p_mercado": None, "ref": ref_nom, "ev": None,
                "p_modelo": modelo.get(m_key), "ev_modelo": None,
                "arbitraje": arb, "mov": None, "vieja": False,
            }
            if item["p_modelo"] is not None:
                item["ev_modelo"] = round(item["p_modelo"] * cuota - 1, 4)
            # estado
            if ref is None:
                item["estado"], item["motivo"] = "descartada", f"datos insuficientes: {n} casas con el mercado completo y sin Pinnacle"
                item["confianza"] = "baja"
            else:
                p = ref[r]
                item["p_mercado"] = round(p, 4)
                item["justa"] = round(1 / p, 2)
                item["ev"] = round(p * cuota - 1, 4)
                # movimiento de la probabilidad del mercado
                hk = f"{ev['id']}|{m_key}"
                serie = hist.setdefault(hk, [])
                if not serie or serie[-1][1] != round(p, 4):
                    serie.append([iso(t), round(p, 4)])
                del serie[:-24]
                if len(serie) >= 2:
                    item["mov"] = round(serie[-1][1] - serie[0][1], 4)
                    salto = serie[-1][1] - serie[-2][1]
                    if abs(salto) >= UMBRAL_MOV:   # cambio brusco entre dos consultas seguidas
                        item["brusco"] = {"puntos": round(100 * salto, 1), "desde": serie[-2][0]}
                # confianza: referencia Pinnacle con muchas casas = alta; mediana o pocas casas = media
                item["confianza"] = "alta" if ref_nom.startswith("Pinnacle") and n >= 10 else "media"
                # cuota posiblemente desactualizada (la casa no se movió cuando la referencia sí)
                if ref_hora and chora and ck != REF:
                    atraso = (ref_hora - fecha(chora)).total_seconds() / 60
                    item["vieja"] = atraso > VIEJA_MIN
                if arb:
                    item["estado"], item["motivo"] = "arbitraje", f"cubriendo todos los resultados con las mejores cuotas queda +{arb:.1%}; puede ser una cuota vieja: verificar en la casa"
                    if item["vieja"]:
                        item["motivo"] += f" ({ctit} no actualiza esta cuota hace rato)"
                elif item["ev"] >= UMBRAL_EV and ck != REF:
                    item["estado"] = "desajustada"
                    item["motivo"] = f"{ctit} paga {cuota} y el precio justo es {item['justa']} (EV {item['ev']:+.1%})"
                    if item["vieja"]:
                        item["motivo"] += "; su cuota no se actualizó cuando el mercado se movió"
                else:
                    item["estado"], item["motivo"] = "normal", "en línea con el mercado"
                if item.get("brusco"):
                    item["motivo"] += f"; cambio brusco de {item['brusco']['puntos']:+} puntos de probabilidad desde la consulta anterior"
            salida.append(item)
    return salida


# ---------------------------------------------------------------- vigilancia (suspensiones, noticias, partidos empezados)
BAJA = ("out", "doubtful", "fuera", "duda", "injured", "lesionado", "suspended", "suspendido", "day-to-day")


def bajas_de(previa, gid):
    """Jugadores con estado de lesión/suspensión según ESPN (previa.json; solo la NBA trae rotación)."""
    out = {}
    for lado, pos in ((previa.get(gid) or {}).get("rot") or {}).items():
        vistos = {}
        for p in pos:
            for j in p.get("js", []):
                if j.get("st") and any(b in j["st"].lower() for b in BAJA):
                    vistos[j["n"]] = j["st"]
        if vistos:
            out[lado] = [[n, st] for n, st in vistos.items()]
    return out


def vigilar(eventos, viejos, t):
    """Compara con la consulta anterior: mercados que desaparecen, casas que retiran la cuota,
    nuevas bajas posteriores a la cuota y edad de los datos."""
    previa = leer(os.path.join(DATA, "previa.json"), {})
    for e in eventos:
        fresco = e.get("actualizado") == iso(t)
        v = viejos.get(e["oid"])
        e["edad_min"] = int((t - fecha(e["actualizado"])).total_seconds() // 60)
        e["antiguo"] = e["edad_min"] >= ANTIGUO_H * 60
        avisos = []
        if fresco and v and v.get("actualizado") != e["actualizado"]:
            nuevos = {m["mercado"]: m for m in e["mercados"]}
            for m in v.get("mercados", []):
                # solo ganador (las líneas de totales cambian de número y eso no es una suspensión)
                if m["mercado"] not in ("1", "X", "2") or m.get("estado") == "suspendido":
                    continue
                if m["mercado"] not in nuevos:
                    e["mercados"].append(dict(m, estado="suspendido", motivo="ninguna casa ofrece ya este mercado (suspendido o retirado)",
                                              cuotas=[], arbitraje=None, brusco=None, confianza="baja"))
                    avisos.append(f"Mercado suspendido: {m['txt']}")
                else:
                    antes = {c[0] for c in m.get("cuotas", [])}
                    ahora_ = {c[0] for c in nuevos[m["mercado"]]["cuotas"]}
                    fuera = sorted(antes - ahora_)
                    if fuera:
                        nuevos[m["mercado"]]["retiradas"] = fuera
        if e.get("id"):
            b = bajas_de(previa, e["id"])
            if b:
                e["bajas"] = b
                antes = {n for lado in (v or {}).get("bajas", {}).values() for n, _ in lado}
                for lado in b.values():
                    for n, st in lado:
                        if v and n not in antes:
                            avisos.append(f"Nueva baja: {n} ({st}). " + ("Las cuotas son de esta consulta." if fresco
                                          else f"Las cuotas guardadas son de hace {e['edad_min'] // 60} h y quizá no la reflejan."))
        if e["antiguo"]:
            avisos.append(f"Datos de hace {e['edad_min'] // 60} h: no son cuotas actuales.")
        e["avisos"] = avisos


def cerrados(viejos, t):
    """Partidos que ya empezaron: sus cuotas pre-partido dejan de valer. No se siguen cuotas en vivo
    (el plan gratis no alcanza); se informa lo que pasó en el partido según ESPN."""
    res = leer(os.path.join(DATA, "resultados.json"), {})
    out = []
    for e in viejos.values():
        empieza = fecha(e["at"])
        if not (t - dt.timedelta(hours=4) < empieza <= t):
            continue
        r = res.get(e.get("id") or "", {})
        ev = [{"t": x["t"], "min": x.get("min"), "s": x.get("s"), "j": x.get("j")} for x in r.get("ev", []) if x.get("t") in ("gol", "autogol", "penal", "roja")]
        out.append({"oid": e["oid"], "id": e.get("id"), "liga": e["liga"], "at": e["at"], "local": e["local"], "visita": e["visita"],
                    "estado_partido": r.get("st"), "marcador": [r.get("h", {}).get("s"), r.get("a", {}).get("s")] if r else None,
                    "eventos": ev, "motivo": "empezó el partido: las cuotas pre-partido ya no valen; no se siguen cuotas en vivo"})
    return out


# ---------------------------------------------------------------- registro de oportunidades
def registrar(reg, eventos, t):
    """Abre/actualiza/cierra oportunidades. La foto de cierre (CLV) es la última antes del partido."""
    vistos = set()
    for e in eventos:
        empieza = fecha(e["at"])
        fresco = e.get("actualizado") == iso(t)
        for m in e["mercados"]:
            k = f"{e['oid']}|{m['mercado']}|{m['mejor']['casa']}"
            if not fresco:  # datos de una consulta anterior: no se toca nada, solo no se da por desaparecida
                if k in reg:
                    vistos.add(k)
                continue
            if m["p_mercado"] is not None and empieza > t:  # foto de cierre para todas las abiertas de este mercado
                for r in reg.values():
                    if r["evento"] == e["oid"] and r["mercado"] == m["mercado"]:
                        r["p_cierre"], r["hora_cierre"] = m["p_mercado"], iso(t)
                        r["clv"] = round(r["cuota"] * m["p_mercado"] - 1, 4)
            if m["estado"] not in ("desajustada", "arbitraje", "valor") or empieza <= t:
                continue
            vistos.add(k)
            r = reg.get(k)
            if not r:
                reg[k] = r = {"evento": e["oid"], "espn": e.get("id"), "lg": e["lg"], "at": e["at"],
                              "partido": f"{e['local']} vs {e['visita']}", "mercado": m["mercado"], "txt": m["txt"],
                              "casa": m["mejor"]["casa"], "cuota": m["mejor"]["cuota"], "p_mercado": m["p_mercado"],
                              "p_modelo": m["p_modelo"], "ev": m["ev"], "estado": m["estado"],
                              "aparece": iso(t), "fuente": "The Odds API / " + REGION}
                # la misma selección ya registrada con otra casa: se guarda (historial), pero no cuenta dos veces
                primera = next((kk for kk, rr in reg.items() if kk != k and rr["evento"] == e["oid"] and rr["mercado"] == m["mercado"]
                                and not rr.get("repetida")), None)
                if primera:
                    r["repetida"] = primera
            r["ultima"] = iso(t)
            r.pop("desaparece", None)
    for k, r in reg.items():
        if k not in vistos and "desaparece" not in r and fecha(r["ultima"]) < t:
            r["desaparece"] = iso(t)


def calificar(reg, t):
    """Resultado de cada oportunidad con el marcador final de ESPN (resultados.json). Una sola vez."""
    res = leer(os.path.join(DATA, "resultados.json"), {})
    for r in reg.values():
        if r.get("res") or fecha(r["at"]) > t:
            continue
        x = res.get(r.get("espn") or "")
        if not x or x.get("st") != "post":
            continue
        try:
            hs, as_ = int(x["h"]["s"]), int(x["a"]["s"])
        except Exception:
            continue
        m = r["mercado"]
        if m in ("1", "X", "2"):
            gana = {"1": hs > as_, "X": hs == as_, "2": hs < as_}[m]
        else:
            lado, linea = m.split("_")
            tot = hs + as_
            if tot == float(linea):
                r["res"], r["marcador"] = "nula", f"{hs}-{as_}"
                continue
            gana = (tot > float(linea)) == (lado == "mas")
        r["res"], r["marcador"] = ("ganada" if gana else "perdida"), f"{hs}-{as_}"


def rendimiento(reg):
    """Indicadores del panel, calculados aquí (nunca en la app): acierto, unidades, yield, CLV y la
    curva de unidades acumuladas (1 unidad por oportunidad, a la cuota detectada)."""
    unicas = [r for r in reg.values() if not r.get("repetida")]   # cada selección cuenta una sola vez (la primera casa detectada)
    xs = sorted((r for r in unicas if r.get("res") in ("ganada", "perdida")), key=lambda r: r["at"])
    out = {"n": len(xs), "pendientes": sum(1 for r in unicas if not r.get("res"))}
    if xs:
        u, serie = 0.0, []
        for r in xs:
            u += (r["cuota"] - 1) if r["res"] == "ganada" else -1
            serie.append([r["at"][:10], round(u, 2)])
        g = sum(1 for r in xs if r["res"] == "ganada")
        out.update({"ganadas": g, "perdidas": len(xs) - g, "acierto": round(100 * g / len(xs), 1),
                    "unidades": round(u, 2), "yield": round(100 * u / len(xs), 1),
                    "prob_media_mercado": round(100 * sum(r["p_mercado"] for r in xs) / len(xs), 1),
                    "serie": serie[-200:]})
    clv = [r["clv"] for r in xs if r.get("clv") is not None]
    out["clv"] = {"n": len(clv), "medio": round(100 * sum(clv) / len(clv), 2) if clv else None}
    por = {}
    for r in xs:
        q = por.setdefault(r["estado"], {"n": 0, "ganadas": 0, "unidades": 0.0})
        q["n"] += 1; q["ganadas"] += r["res"] == "ganada"
        q["unidades"] = round(q["unidades"] + ((r["cuota"] - 1) if r["res"] == "ganada" else -1), 2)
    out["por_estado"] = por
    return out


def valor_probado(reg):
    cerradas = [r["clv"] for r in reg.values() if r.get("clv") is not None and not r.get("repetida") and fecha(r["at"]) <= ahora()]
    n = len(cerradas)
    media = round(sum(cerradas) / n, 4) if n else None
    return (n >= VALOR_MIN_N and media is not None and media > 0), n, media


# ---------------------------------------------------------------- principal
def main():
    t = ahora()
    previo = leer(OUT, {})
    uso = leer(os.path.join(DIR, "uso.json"), {})
    hist = leer(os.path.join(DIR, "hist.json"), {})
    reg = leer(os.path.join(DIR, "registro.json"), {})
    cierre = leer(os.path.join(DIR, "cierre.json"), {})
    base = {"generado": iso(t), "fuente": "The Odds API (región eu)", "referencia": "Pinnacle sin margen; si falta, mediana de 4+ casas"}

    if not KEY:
        print("odds: falta el secreto ODDS_API_KEY; no se consulta nada")
        guardar(OUT, {**previo, **base, "estado": "sin clave", "errores": ["falta la clave de The Odds API"],
                      "salud": {"api": "falla", "en_vivo": False}, "eventos": []})
        return

    cupo, hoy = presupuesto(uso, t)
    ultimos = uso.setdefault("ligas", {})
    eventos, errores, pedidas, sin_cupo = [], [], [], []
    partidos = partidos_cashbet()
    viejos = {e["oid"]: e for e in previo.get("eventos", [])}

    for sk, (lg, liga) in LIGAS.items():
        # 1) gratis: ¿hay partidos pronto?
        lista, info = pedir(f"/sports/{sk}/events", dateFormat="iso")
        if lista is None:
            errores.append(f"{liga}: {info}")
            for e in viejos.values():   # se conserva lo anterior, marcado con su hora real
                if e["lg"] == lg and fecha(e["at"]) > t:
                    eventos.append(e)
            continue
        uso["ultima_ok"] = iso(t)
        pronto = [e for e in lista if t < fecha(e["commence_time"]) <= t + dt.timedelta(hours=VENTANA_H)]
        if not pronto:
            continue
        ult = fecha(ultimos.get(sk)) if ultimos.get(sk) else None
        hay_cierre = any(PREVIA_MIN[0] <= (fecha(e["commence_time"]) - t).total_seconds() / 60 <= PREVIA_MIN[1] for e in pronto)
        toca = os.environ.get("ODDS_FORZAR") == "1" or ult is None or (t - ult) >= dt.timedelta(hours=CADA_H) or (hay_cierre and (t - ult) >= dt.timedelta(hours=2))
        if toca and cupo < COSTE:
            sin_cupo.append(liga)
        if not toca or cupo < COSTE:
            # se conservan los datos anteriores de esta liga, marcados con su hora real
            for e in viejos.values():
                if e["lg"] == lg and fecha(e["at"]) > t:
                    eventos.append(e)
            continue
        # 2) con coste: cuotas de las casas
        datos, info = pedir(f"/sports/{sk}/odds", regions=REGION, markets=MARKETS, oddsFormat="decimal", dateFormat="iso")
        if datos is None:
            errores.append(f"{liga}: {info}")
            continue
        try:
            uso["restantes"] = int(float(info.get("x-requests-remaining", info.get("X-Requests-Remaining"))))
        except Exception:
            pass
        gasto = COSTE
        try:
            gasto = int(float(info.get("x-requests-last", info.get("X-Requests-Last"))))
        except Exception:
            pass
        uso["dias"][hoy] = uso["dias"].get(hoy, 0) + gasto
        cupo -= gasto
        ultimos[sk] = iso(t)
        pedidas.append(liga)
        for ev in datos:
            if not (t < fecha(ev["commence_time"]) <= t + dt.timedelta(hours=VENTANA_H)):
                continue
            g = emparejar(ev, lg, partidos)
            eventos.append({
                "oid": ev["id"], "id": g["id"] if g else None, "lg": lg, "liga": liga, "at": iso(fecha(ev["commence_time"])),
                "local": g["h"]["n"] if g else ev["home_team"], "visita": g["a"]["n"] if g else ev["away_team"],
                "actualizado": iso(t), "mercados": analizar(ev, lg, liga, g, hist, t),
            })

    ok, n_cerradas, clv_medio = valor_probado(reg)
    if ok:  # solo con CLV positivo demostrado una desajustada que el modelo respalda pasa a "valor"
        for e in eventos:
            for m in e["mercados"]:
                if m["estado"] == "desajustada" and (m["ev_modelo"] or -1) >= UMBRAL_EV:
                    m["estado"] = "valor"
    registrar(reg, eventos, t)
    vigilar(eventos, viejos, t)
    calificar(reg, t)
    # cierre del mercado por partido de CASHBET (para medir el CLV de los picks en evaluar.py):
    # se pisa en cada consulta hecha antes del partido, así queda la última antes de empezar
    for e in eventos:
        if e.get("id") and e.get("actualizado") == iso(t) and fecha(e["at"]) > t:
            for m in e["mercados"]:
                if m["p_mercado"] is not None:
                    cierre[f"{e['id']}|{m['mercado']}"] = {"p": m["p_mercado"], "t": iso(t), "at": e["at"]}

    # limpiar memoria vieja: series de 10 días; el registro de oportunidades se guarda 180 días (historial)
    corte = t - dt.timedelta(days=10)
    reg = {k: r for k, r in reg.items() if fecha(r["at"]) > t - dt.timedelta(days=180)}
    cierre = {k: c for k, c in cierre.items() if fecha(c["at"]) > t - dt.timedelta(days=60)}
    vivos = {e["oid"] for e in eventos}
    hist = {k: v for k, v in hist.items() if k.split("|")[0] in vivos or fecha(v[-1][0]) > corte}

    cuenta = {}
    for e in eventos:
        for m in e["mercados"]:
            cuenta[m["estado"]] = cuenta.get(m["estado"], 0) + 1
    salud = {"api": "ok" if uso.get("ultima_ok") == iso(t) else "falla",
             "ultima_consulta_ok": uso.get("ultima_ok"), "sin_creditos_hoy": sin_cupo,
             # hora real de las cuotas mostradas (la revisión gratis de partidos no trae cuotas)
             "cuotas_de": min((e["actualizado"] for e in eventos if e.get("actualizado")), default=None),
             "cuotas_hasta": max((e["actualizado"] for e in eventos if e.get("actualizado")), default=None),
             "frecuencia": f"cada {CADA_H} h por liga (y una más 30-150 min antes de cada partido), según los créditos del plan gratis",
             "en_vivo": False}
    salida = {**base, "estado": "con errores" if errores else "ok", "errores": errores, "salud": salud,
              "consultadas": pedidas, "creditos_restantes": uso.get("restantes"), "cerrados": cerrados(viejos, t),
              "valor": {"probado": ok, "n": n_cerradas, "clv_medio": clv_medio, "minimo": VALOR_MIN_N},
              "resumen": cuenta, "eventos": sorted(eventos, key=lambda e: e["at"]),
              "rendimiento": rendimiento(reg),
              # historial completo (ganadas, perdidas, nulas y pendientes), lo más reciente primero
              "historial": sorted(reg.values(), key=lambda r: (r["at"], r["aparece"]), reverse=True)[:300]}
    guardar(OUT, salida)
    guardar(os.path.join(DIR, "uso.json"), uso)
    guardar(os.path.join(DIR, "hist.json"), hist)
    guardar(os.path.join(DIR, "registro.json"), reg)
    guardar(os.path.join(DIR, "cierre.json"), cierre)
    print(f"odds: {len(eventos)} partidos, consultadas {pedidas or 'ninguna'}, créditos restantes {uso.get('restantes')}, {cuenta}")
    for e in errores:
        print("  error", e)


if __name__ == "__main__":
    main()
