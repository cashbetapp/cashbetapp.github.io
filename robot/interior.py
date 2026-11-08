"""Foto del estadio POR DENTRO (cancha y tribunas), desde Wikimedia Commons, gratis.

Wikipedia suele usar una foto aérea, de la fachada o hasta el logo. Aquí se busca en
la categoría de Commons del estadio una foto horizontal y grande cuyo nombre indique
que es del interior (partido, tribuna, panorámica, vista desde la grada...)."""
import json, re, urllib.request, urllib.parse

UA = {"User-Agent": "CASHBET/1.0 (https://cashbetapp.github.io)"}
API = "https://commons.wikimedia.org/w/api.php?"
BUENO = re.compile(r"interior|inside|innen|intérieur|interieur|pitch|panoram|view from|vista|tribun|grada|stand\b|stands|bowl|"
                   r"match|game|partido|partita|spiel|derby|\bvs\.?\b|\bv\.? |fans|crowd|aficion|tifo|court|cancha|campo|"
                   r"night|noche|playoff|final|opening|kick|warm|seats|seating|from the|desde|upper|lower|press box|"
                   r"concert|full|sold.?out|atmosph|day|jornada|temporada|season|\d{4}", re.I)
MALO = re.compile(r"tunnel|weiher|lake|lago|pond|river|exterior|outside|außen|aussen|facade|fachada|façade|aerial|luft|drone|logo|wordmark|map|mapa|plan\b|"
                  r"sign|entrance|eingang|entrada|gate|puerta|construction|bau|obras|demoli|ticket|statue|estatua|plaque|"
                  r"placa|mural|bus|train|tram|station|parking|street|calle|night view of the|skyline|from above|satellite|"
                  r"seal|badge|crest|escudo|museum|museo|store|tienda|shop|bar\b|restaurant|toilet|locker|vestuario|"
                  r"model|maqueta|render|ceremony|portrait|player|jugador|coach|trophy", re.I)


def _json(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25) as r:
            return json.load(r)
    except Exception:
        return None


def categoria(qid):
    w = _json(f"https://www.wikidata.org/wiki/Special:EntityData/{qid}.json")
    try:
        return w["entities"][qid]["claims"]["P373"][0]["mainsnak"]["datavalue"]["value"]
    except Exception:
        return None


def _miembros(cat, tipo, n=300):
    r = _json(API + urllib.parse.urlencode({"action": "query", "list": "categorymembers", "cmtitle": "Category:" + cat,
                                            "cmtype": tipo, "cmlimit": n, "format": "json"}))
    return [m["title"] for m in (r or {}).get("query", {}).get("categorymembers", [])]


def _info(titulos):
    out = {}
    for i in range(0, len(titulos), 40):
        r = _json(API + urllib.parse.urlencode({"action": "query", "titles": "|".join(titulos[i:i + 40]), "prop": "imageinfo",
                                                "iiprop": "url|size|mime", "iiurlwidth": 1200, "format": "json"}))
        for pg in ((r or {}).get("query", {}).get("pages") or {}).values():
            ii = (pg.get("imageinfo") or [{}])[0]
            if ii:
                out[pg["title"]] = ii
    return out


def _tokens(s):
    import unicodedata
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return {w for w in re.findall(r"[a-z]+", s) if len(w) > 3} - {"stadium", "stadion", "stade", "estadio", "stadio", "arena",
                                                                   "file", "park", "center", "centre", "jpeg"}


def _puntos(t):
    n = t.lower()
    return len(BUENO.findall(n)) * 2 - len(MALO.findall(n)) * 5


def verde(url):
    """Parte de la mitad de abajo de la foto que es césped (cancha de fútbol vista por dentro)."""
    try:
        import io as _io
        from PIL import Image
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
            im = Image.open(_io.BytesIO(r.read())).convert("RGB")
        im.thumbnail((160, 160))
        w, h = im.size
        px = list(im.crop((0, int(h * 0.4), w, h)).getdata())
        g = sum(1 for (R, G, B) in px if G > 55 and G > R + 12 and G > B + 8)
        return g / max(len(px), 1)
    except Exception:
        return 0


def buscar(qid=None, nombre=None, cesped=True):
    """Primero en la categoría del estadio; si no hay, en todo Commons por el nombre."""
    return _buscar(qid, None, cesped) or (_buscar(None, nombre, cesped) if nombre else None)


def _buscar(qid=None, nombre=None, cesped=True):
    """URL (1200 px) de una foto interior del estadio, o None. Con 'cesped' exige que
    se vea la cancha (fútbol)."""
    files = []
    cat = categoria(qid) if qid else None
    if cat:
        files = _miembros(cat, "file")
        # subcategorías útiles: interior, partidos, eventos, panorámicas
        for sc in _miembros(cat, "subcat", 60):
            if re.search(r"interior|inside|matches|games|events|panoram|pitch|stands|tribun|views", sc, re.I) and not MALO.search(sc):
                files += _miembros(sc.split(":", 1)[1], "file", 150)
    if nombre:
        r = _json(API + urllib.parse.urlencode({"action": "query", "list": "search", "srsearch": f'"{nombre}" filetype:bitmap',
                                                "srnamespace": 6, "srlimit": 30, "format": "json"}))
        files += [h["title"] for h in (r or {}).get("query", {}).get("search", [])]
    files = [f for f in dict.fromkeys(files) if re.search(r"\.jpe?g$", f, re.I)]
    if nombre and not cat:
        # búsqueda libre: el archivo debe nombrar al estadio (evita parques, lagos, otros estadios)
        clave = _tokens(nombre)
        files = [f for f in files if _tokens(f) & clave]
    if not files:
        return None
    files.sort(key=_puntos, reverse=True)
    cand = [f for f in files if _puntos(f) > 0][:30] or files[:12]
    inf = _info(cand)
    mejores = []
    for f in cand:
        ii = inf.get(f)
        if not ii or ii.get("mime") != "image/jpeg":
            continue
        w, h = ii.get("width", 0), ii.get("height", 1)
        if w < 1000 or not (1.25 <= w / h <= 2.8):
            continue
        mejores.append((_puntos(f), min(w, 4000), ii.get("thumburl") or ii["url"], f))
    if not mejores:
        return None
    mejores.sort(reverse=True)
    if not cesped:
        return mejores[0][2]
    # la foto debe mostrar la cancha: se revisan las mejores y gana la de más césped
    ok = []
    for pts, w, url, f in mejores[:12]:
        v = verde(url)
        if v >= 0.22:
            ok.append((v + 0.04 * max(pts, 0), url))
    return max(ok)[1] if ok else None
