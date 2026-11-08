"""CASHBET - foto y capacidad de cada estadio (Wikipedia/Wikidata, gratis).

Se busca una sola vez por estadio y se guarda en data/venues.json; la foto
queda en data/img/v/. Si no se encuentra con seguridad, la app muestra solo
el nombre y la ciudad.
"""
import json, os, re, hashlib, urllib.request, urllib.parse, io

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
CACHE = os.path.join(DATA, "venues.json")
UA = {"User-Agent": "CASHBET/1.0 (https://cashbetapp.github.io)"}
NO = re.compile(r"district|distrito|quartiere|neighbo|barrio|comune|village|town in|city in|ciudad|commune", re.I)
PAL = re.compile(r"stadium|stadion|stade|estadio|stadio|arena|center|centre|ground|park|field|coliseo|campo|recinto|pabell", re.I)


def _get(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20) as r:
            return r.read()
    except Exception:
        return None


def _json(url):
    b = _get(url)
    try:
        return json.loads(b) if b else None
    except Exception:
        return None


def _norm(s):
    import unicodedata
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return set(w for w in re.findall(r"[a-z0-9]+", s) if len(w) > 2 and w not in ("estadio", "stadium", "stadio", "stade", "the", "del", "de"))


def buscar(nombre, ciudad):
    """Devuelve {"img": url, "cap": int|None, "t": título} o {} si no hay un resultado seguro."""
    for lang in ("en", "es"):
        # 1) título exacto con redirecciones (nombres comerciales -> página del estadio)
        rr = _json(f"https://{lang}.wikipedia.org/w/api.php?action=query&titles={urllib.parse.quote(nombre)}&redirects=1&format=json")
        for pg in ((rr or {}).get("query", {}).get("pages") or {}).values():
            if "missing" in pg:
                continue
            info = _pagina(lang, pg["title"])
            if info:
                return info
        q = urllib.parse.quote(f"{nombre} {ciudad or ''}".strip())
        r = _json(f"https://{lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch={q}&srlimit=3&format=json")
        for hit in (r or {}).get("query", {}).get("search", []):
            t = hit["title"]
            # el título debe compartir palabras con el nombre del estadio
            if not (_norm(t) & _norm(nombre)):
                continue
            info = _pagina(lang, t)
            if info:
                return info
    return {}


def _pagina(lang, t):
    """Foto y capacidad de una página de Wikipedia si de verdad es un estadio."""
    if True:
        if True:
            s = _json(f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(t.replace(' ', '_'))}")
            if not s or not PAL.search((s.get("description") or "") + " " + t + " " + (s.get("extract") or "")[:200]):
                return None
            # no confundir con barrios, distritos o ciudades que se llaman igual
            if NO.search(t + " " + (s.get("description") or "")):
                return None
            img = (s.get("originalimage") or s.get("thumbnail") or {}).get("source")
            cap = None
            qid = s.get("wikibase_item")
            if qid:
                w = _json(f"https://www.wikidata.org/wiki/Special:EntityData/{qid}.json")
                try:
                    cl = w["entities"][qid]["claims"].get("P1083") or []
                    cap = int(float(cl[0]["mainsnak"]["datavalue"]["value"]["amount"]))
                except Exception:
                    cap = None
            if img or cap:
                return {"img": img, "cap": cap, "t": t}
            return None


def foto(url, nombre):
    """Baja la foto una vez, a 900 px de ancho, en JPG."""
    rel = f"img/v/{hashlib.md5(nombre.encode()).hexdigest()[:12]}.jpg"
    path = os.path.join(DATA, rel)
    if os.path.exists(path):
        return "data/" + rel
    b = _get(url)
    if not b:
        return None
    try:
        from PIL import Image
        im = Image.open(io.BytesIO(b)).convert("RGB")
        im.thumbnail((900, 900))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        im.save(path, quality=78, optimize=True)
        return "data/" + rel
    except Exception:
        return None


def completar(partidos):
    """Agrega g["vimg"] (foto) y g["cap"] (capacidad) a cada partido con estadio."""
    db = json.load(open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}
    nuevos = 0
    for g in partidos:
        v = g.get("ven")
        if not v:
            continue
        import datetime as _dt
        hoy = _dt.date.today().isoformat()
        sin_foto = v in db and not db[v].get("foto") and db[v].get("q") != hoy   # reintento 1 vez al día
        if (v not in db or sin_foto) and nuevos < 60:   # tope por corrida para no abusar del servicio
            info = buscar(v, g.get("city"))
            if g.get("vimg_espn") and not info.get("img"):
                info["img"] = g["vimg_espn"]
            if info.get("img"):
                info["foto"] = foto(info["img"], v)
            info["q"] = hoy
            db[v] = info
            nuevos += 1
        info = db.get(v) or {}
        if info.get("foto") and os.path.exists(os.path.join(DATA, info["foto"][5:])):
            g["vimg"] = info["foto"]
        if info.get("cap"):
            g["cap"] = info["cap"]
        g.pop("vimg_espn", None)
    with open(CACHE, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=0)
    return nuevos
