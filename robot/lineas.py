"""Movimiento de la línea: guarda la PRIMERA cuota que el robot vio de cada partido y
la ÚLTIMA (data/lineas.json). La app muestra "104.5 -> 104.5 · cuota 1.44 -> 1.75".
Solo hay movimiento desde que se empezó a guardar (2026-11-09)."""
import json, os, datetime as dt
from model import DATA

RUTA = os.path.join(DATA, "lineas.json")
CAMPOS = ("h", "a", "d", "ou", "sp")


def movimiento(partidos):
    try:
        L = json.load(open(RUTA, encoding="utf-8"))
    except Exception:
        L = {}
    ahora = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
    vivos = set()
    for g in partidos:
        od = g.get("odds") or {}
        foto = {k: od.get(k) for k in CAMPOS if od.get(k) is not None}
        vivos.add(g["id"])
        if not foto:
            continue
        e = L.get(g["id"])
        if not e:
            e = L[g["id"]] = {"ini": dict(foto, t=ahora), "ult": dict(foto, t=ahora), "at": g["at"]}
        elif any(e["ult"].get(k) != v for k, v in foto.items()):
            e["ult"] = dict(foto, t=ahora)
        g["mov"] = e
    # se borran los partidos que ya pasaron hace más de 3 días
    lim = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=3)).strftime("%Y-%m-%dT%H:%MZ")
    L = {k: v for k, v in L.items() if k in vivos or v.get("at", "") >= lim}
    json.dump(L, open(RUTA, "w", encoding="utf-8"), separators=(",", ":"))
