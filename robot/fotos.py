"""Fotos de futbolistas que ESPN no tiene: se buscan en Wikidata / Wikimedia Commons
(libres y gratis). Para no poner la foto de otra persona con el mismo nombre, se
exige que sea futbolista y, si ESPN da la fecha de nacimiento, que coincida."""
import json, os, io, datetime as dt, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
CACHE = os.path.join(DATA, "fotos.json")
UA = {"User-Agent": "CASHBET/1.0 (https://cashbetapp.github.io)"}
FUTBOLISTA = "Q937857"
MAX = 120          # búsquedas por corrida
REINTENTO = 7      # días para volver a buscar a quien no tenía foto


def _json(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20) as r:
        return json.load(r)


def nacimiento(pid):
    try:
        d = _json(f"https://sports.core.api.espn.com/v2/sports/soccer/leagues/eng.1/athletes/{pid}")
        return (d.get("dateOfBirth") or "")[:10] or None
    except Exception:
        return None


def _fecha(c):
    try:
        return c["mainsnak"]["datavalue"]["value"]["time"][1:11]
    except Exception:
        return None


def buscar(nombre, nac):
    ids = []
    for lang in ("en", "es"):
        try:
            q = urllib.parse.urlencode({"action": "wbsearchentities", "search": nombre, "language": lang,
                                        "type": "item", "limit": 7, "format": "json"})
            ids += [e["id"] for e in _json("https://www.wikidata.org/w/api.php?" + q).get("search", [])]
        except Exception:
            pass
        if ids:
            break
    ids = list(dict.fromkeys(ids))
    if not ids:
        return None
    q = urllib.parse.urlencode({"action": "wbgetentities", "ids": "|".join(ids), "props": "claims", "format": "json"})
    ents = _json("https://www.wikidata.org/w/api.php?" + q).get("entities", {})
    cands = []
    for i in ids:
        cl = ents.get(i, {}).get("claims", {})
        ocup = {c["mainsnak"].get("datavalue", {}).get("value", {}).get("id") for c in cl.get("P106", [])}
        if FUTBOLISTA not in ocup or not cl.get("P18"):
            continue
        img = cl["P18"][0]["mainsnak"]["datavalue"]["value"]
        fechas = {f for f in map(_fecha, cl.get("P569", [])) if f}
        cands.append((img, fechas))
    if nac:
        d0 = dt.date.fromisoformat(nac)
        for img, fechas in cands:
            for f in fechas:
                try:
                    if abs((dt.date.fromisoformat(f) - d0).days) <= 1:
                        return img
                except ValueError:
                    pass
        return None
    return cands[0][0] if len(cands) == 1 else None


def bajar(archivo, ruta):
    from PIL import Image
    url = "https://commons.wikimedia.org/wiki/Special:FilePath/" + urllib.parse.quote(archivo.replace(" ", "_")) + "?width=400"
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        im = Image.open(io.BytesIO(r.read())).convert("RGB")
    w, h = im.size
    lado = min(w, h)
    x0 = (w - lado) // 2
    y0 = int(min(h - lado, h * 0.04)) if h > w else 0   # retrato: la cara suele estar arriba
    im = im.crop((x0, y0, x0 + lado, y0 + lado)).resize((220, 220), Image.LANCZOS)
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    im.save(ruta, "JPEG", quality=84, optimize=True)


def uno(pid, nombre):
    rel = f"img/w/{pid}.jpg"
    try:
        img = buscar(nombre, nacimiento(pid))
        if img:
            bajar(img, os.path.join(DATA, rel))
            return pid, rel
    except Exception:
        pass
    return pid, None


def completar(jugadores):
    """jugadores: lista de (pid, nombre) sin foto de ESPN. Devuelve {pid: ruta relativa}."""
    cache = json.load(open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}
    hoy = dt.date.today()
    pend, vistos = [], set()
    for pid, nombre in jugadores:
        pid = str(pid)
        if pid in vistos:
            continue
        vistos.add(pid)
        c = cache.get(pid)
        if c and c.get("f") and os.path.exists(os.path.join(DATA, c["f"])):
            continue
        if c and not c.get("f") and (hoy - dt.date.fromisoformat(c["q"])).days < REINTENTO:
            continue
        pend.append((pid, nombre))
    with ThreadPoolExecutor(4) as ex:
        for pid, rel in ex.map(lambda a: uno(*a), pend[:MAX]):
            cache[pid] = {"f": rel, "q": hoy.isoformat()}
    json.dump(cache, open(CACHE, "w", encoding="utf-8"))
    return {p: c["f"] for p, c in cache.items() if c.get("f") and os.path.exists(os.path.join(DATA, c["f"]))}
