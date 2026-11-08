"""Fotos recortadas (sin fondo) de futbolistas que ESPN no tiene, desde el buscador
público de FotMob. Para no poner a otra persona con el mismo nombre se exige que el
nombre coincida y, si hay varios, que también coincida el equipo."""
import json, os, io, re, time, unicodedata, datetime as dt, urllib.request, urllib.parse, urllib.error
from concurrent.futures import ThreadPoolExecutor

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
CACHE = os.path.join(DATA, "fotos.json")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"}
MAX = 250          # búsquedas por corrida
REINTENTO = 7      # días para volver a buscar a quien no tenía foto
V = 3              # versión del caché (las anteriores se vuelven a buscar)
RUIDO = {"fc", "cf", "ac", "sc", "cd", "ud", "sd", "afc", "club", "de", "real", "fk", "sk", "if", "bk", "ssc", "as", "rc", "ca", "us", "the"}


class Falla(Exception):
    """Error pasajero (límite de peticiones, red): se vuelve a intentar en la próxima corrida."""


def _abrir(url, timeout=25):
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise
            time.sleep(2 + 3 * i)
        except Exception:
            time.sleep(2 + 3 * i)
    raise Falla(url)


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9 ]", " ", s).split()


def _mismo(a, b):
    a, b = norm(a), norm(b)
    if not a or not b:
        return False
    if a == b:
        return True
    # "Vinicius Junior" / "Vinícius Júnior", o un nombre más largo que contiene al otro
    return (set(a) <= set(b) or set(b) <= set(a)) and a[-1] == b[-1]


def _equipo(a, b):
    ta, tb = set(norm(a)) - RUIDO, set(norm(b)) - RUIDO
    return bool(ta & tb)


def buscar(nombre, equipo):
    q = urllib.parse.urlencode({"term": nombre, "lang": "en"})
    r = json.loads(_abrir("https://www.fotmob.com/api/data/search/suggest?" + q))
    vistos, cands = set(), []
    for grupo in r:
        for s in grupo.get("suggestions", []):
            if s.get("type") != "player" or s.get("isCoach") or s["id"] in vistos:
                continue
            vistos.add(s["id"])
            if _mismo(s.get("name"), nombre):
                cands.append(s)
    if not cands:
        return None
    eq = [s for s in cands if _equipo(s.get("teamName"), equipo)]
    if eq:
        return eq[0]["id"]
    return cands[0]["id"] if len(cands) == 1 and norm(cands[0]["name"]) == norm(nombre) else None


def bajar(fid, ruta):
    from PIL import Image
    im = Image.open(io.BytesIO(_abrir(f"https://images.fotmob.com/image_resources/playerimages/{fid}.png"))).convert("RGBA")
    if im.getbbox() is None:
        return False
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    im.save(ruta, optimize=True)
    return True


def nitida(rel):
    """FotMob solo da 192 px: se agranda al doble con filtro de nitidez (img/m2/) para la ficha grande."""
    rel2 = rel.replace("img/m/", "img/m2/")
    p2 = os.path.join(DATA, rel2)
    if not os.path.exists(p2):
        from PIL import Image, ImageFilter
        im = Image.open(os.path.join(DATA, rel)).convert("RGBA")
        im = im.resize((im.width * 2, im.height * 2), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.6, percent=70, threshold=2))
        os.makedirs(os.path.dirname(p2), exist_ok=True)
        im.save(p2, optimize=True)
    return rel2


def uno(pid, nombre, equipo):
    """(pid, ruta) si hay foto; (pid, None) si de verdad no hay; (pid, False) si falló la red."""
    rel = f"img/m/{pid}.png"
    try:
        fid = buscar(nombre, equipo)
        if fid and bajar(fid, os.path.join(DATA, rel)):
            return pid, rel
        return pid, None
    except urllib.error.HTTPError:
        return pid, None
    except Exception:
        return pid, False


def completar(jugadores):
    """jugadores: lista de (pid, nombre, equipo) sin foto de ESPN. Devuelve {pid: ruta relativa}."""
    cache = json.load(open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}
    hoy = dt.date.today()
    pend, vistos = [], set()
    for pid, nombre, equipo in jugadores:
        pid = str(pid)
        if pid in vistos:
            continue
        vistos.add(pid)
        c = cache.get(pid)
        if c and c.get("v") == V:
            if c.get("f") and os.path.exists(os.path.join(DATA, c["f"])):
                continue
            if not c.get("f") and (hoy - dt.date.fromisoformat(c["q"])).days < REINTENTO:
                continue
        pend.append((pid, nombre, equipo))
    with ThreadPoolExecutor(3) as ex:
        for pid, rel in ex.map(lambda a: uno(*a), pend[:MAX]):
            if rel is not False:
                cache[pid] = {"f": rel, "q": hoy.isoformat(), "v": V}
    json.dump(cache, open(CACHE, "w", encoding="utf-8"))
    out = {}
    for p, c in cache.items():
        if c.get("v") == V and c.get("f") and os.path.exists(os.path.join(DATA, c["f"])):
            try:
                out[p] = nitida(c["f"])
            except Exception:
                out[p] = c["f"]
    return out
