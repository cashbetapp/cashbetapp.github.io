"""Escudos REALES y actualizados de fútbol (FotMob, 256 px, recortados) en lugar de
los de ESPN, que a veces están viejos (ej. Junior con 4 estrellas en vez de 10).

Para no poner el escudo de otro equipo:
  1) se busca el PARTIDO en FotMob (mismo día y los dos nombres coinciden) -> ids seguros;
  2) si no, el equipo por nombre dentro de su liga.
Si no hay coincidencia segura se deja el de ESPN. Caché: data/escudos.json
(clave = id de ESPN). La NBA sigue con los logos oficiales de ESPN."""
import json, os, re, io, datetime as dt, urllib.parse
from fotos import _abrir, _equipo, norm, Falla

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
CACHE = os.path.join(DATA, "escudos.json")
V = 1
MAX = 120          # búsquedas por corrida
REINTENTO = 7      # días para volver a buscar un equipo no encontrado
LIGA = {"eng.1": 47, "esp.1": 87, "ita.1": 55, "ger.1": 54, "fra.1": 53, "col.1": 274, "mex.1": 230, "uefa.champions": 42}
IMG = "https://images.fotmob.com/image_resources/logo/teamlogo/{}_large.png"


def espn_id(url):
    m = re.search(r"/soccer/500(?:-dark)?/(?:scoreboard/)?(\d+)\.png", url or "")
    return m.group(1) if m else None


def _buscar(term):
    q = urllib.parse.urlencode({"term": term, "lang": "en"})
    out = []
    for g in json.loads(_abrir("https://www.fotmob.com/api/data/search/suggest?" + q)):
        out += g.get("suggestions", [])
    return out


def _parecido(a, b):
    na, nb = " ".join(norm(a)), " ".join(norm(b))
    return na == nb or _equipo(a, b)


def por_partido(h, a, at):
    """ids FotMob de local y visitante buscando el partido del mismo día."""
    dia = at[:10]
    for s in [x for t in variantes(h["n"])[:2] for x in _buscar(t)]:
        if s.get("type") != "match":
            continue
        fd = (s.get("matchDate") or "")[:10]
        if not fd or abs((dt.date.fromisoformat(fd) - dt.date.fromisoformat(dia)).days) > 1:
            continue
        if _parecido(s.get("homeTeamName"), h["n"]) and _parecido(s.get("awayTeamName"), a["n"]):
            return s["homeTeamId"], s["awayTeamId"]
    return None


ALIAS = {"guadalajara": "Chivas", "unam": "Pumas", "cali": "Deportivo Cali", "psg": "Paris Saint-Germain", "man utd": "Manchester United",
         "deportivo": "Deportivo La Coruna", "sporting": "Sporting CP", "verona": "Hellas Verona", "mazatlan": "Mazatlan FC"}
ABREV = {"atl.": "Atletico", "ind.": "Independiente", "dep.": "Deportivo", "man": "Manchester", "utd": "United", "r.": "Real"}


def variantes(n):
    """'Atl. Junior' -> ['Atl. Junior', 'Atletico Junior', 'Junior']."""
    out = [n]
    if " ".join(norm(n)) in ALIAS:
        out.insert(0, ALIAS[" ".join(norm(n))])
    larga = " ".join(ABREV.get(w.lower(), w) for w in n.split())
    if larga != n:
        out.append(larga)
    clave = [w for w in norm(n) if len(w) > 3 and w not in ("atl", "ind", "club", "deportivo", "atletico")]
    if clave:
        out.append(max(clave, key=len))
    return out


def por_nombre(nombres, lg):
    """id FotMob de un equipo por nombre; en liga doméstica exige la misma liga."""
    lid = LIGA.get(lg) if lg != "uefa.champions" else None
    for n in nombres:
        if not n:
            continue
        for i, term in enumerate(variantes(n)):
            vistos, cands = set(), []
            for s in _buscar(term):
                if s.get("type") == "team" and s["id"] not in vistos and (_parecido(s.get("name"), n) or _parecido(s.get("name"), term)):
                    vistos.add(s["id"]); cands.append(s)
            if lid:
                en_liga = [s for s in cands if s.get("leagueId") == lid]
                # descendidos ya no están en la liga: vale solo si el nombre es idéntico y único
                if not en_liga and i < 2:
                    ex = [s for s in cands if norm(s["name"]) in (norm(n), norm(term)) and "(W)" not in s["name"]]
                    if len(ex) == 1:
                        return ex[0]["id"]
                cands = en_liga
            elif i == 2:      # búsqueda por una sola palabra: solo con la liga comprobada
                continue
            exactos = [s for s in cands if norm(s["name"]) in (norm(n), norm(term))]
            if len(exactos) == 1:
                return exactos[0]["id"]
            if len(cands) == 1:
                return cands[0]["id"]
    return None


def _oscuro(im):
    """True si el escudo es casi todo negro (en tema oscuro no se vería)."""
    px = [p for p in im.convert("RGBA").resize((64, 64)).getdata() if p[3] > 128]
    if not px:
        return False
    lum = sum(0.3 * r + 0.59 * g + 0.11 * b for r, g, b, _ in px) / len(px)
    return lum < 55


def bajar(fid, rel, recorte):
    """Baja el escudo de FotMob, lo recorta y guarda. Devuelve (ok, oscuro)."""
    from PIL import Image
    ruta = os.path.join(DATA, rel)
    if not os.path.exists(ruta):
        im = Image.open(io.BytesIO(_abrir(IMG.format(fid)))).convert("RGBA")
        im = recorte(im, 256)
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        im.save(ruta, optimize=True)
    return _oscuro(Image.open(ruta))


def mapa(partidos, recorte):
    """{id ESPN: {"logo": "img/fm/<id>.png", "osc": bool}} para los equipos de fútbol
    de los partidos y de sus filas de forma."""
    try:
        c = json.load(open(CACHE, encoding="utf-8"))
        if c.get("v") != V:
            c = {}
    except Exception:
        c = {}
    eq = c.setdefault("e", {})
    hoy = dt.date.today().isoformat()
    busc = 0

    def fresco(k):
        x = eq.get(k)
        return x and (x.get("f") or (dt.date.fromisoformat(hoy) - dt.date.fromisoformat(x["t"])).days < REINTENTO)

    # 1) por partido (lo más seguro)
    for g in partidos:
        if g.get("dep") == "nba":
            continue
        ih, ia = espn_id(g["h"].get("logo")) or str(g["h"]["id"]), espn_id(g["a"].get("logo")) or str(g["a"]["id"])
        if fresco(ih) and fresco(ia) or busc >= MAX:
            continue
        busc += 1
        try:
            r = por_partido(g["h"], g["a"], g["at"])
        except Exception:
            continue
        if r:
            eq[ih] = {"f": str(r[0]), "t": hoy, "n": g["h"]["n"]}
            eq[ia] = {"f": str(r[1]), "t": hoy, "n": g["a"]["n"]}
    # 2) por nombre (equipos que quedaron sin buscar o rivales de las filas de forma)
    full = {}
    import glob
    for f in glob.glob(os.path.join(DATA, "hist", "*.json")):
        if f.endswith("nba.json"):
            continue
        try:
            for x in json.load(open(f, encoding="utf-8"))["games"].values():
                for t in (x.get("h"), x.get("a")):
                    if t and t.get("logo"):
                        full.setdefault(espn_id(t["logo"]) or str(t["id"]), t.get("fn"))
        except Exception:
            pass
    pend = {}
    for g in partidos:
        if g.get("dep") == "nba":
            continue
        for s in ("h", "a"):
            k = espn_id(g[s].get("logo")) or str(g[s]["id"])
            pend.setdefault(k, ([g[s]["n"], g[s].get("fn") or full.get(k)], g["lg"]))
            for r in (g.get("ult") or {}).get(s, []):
                k2 = espn_id(r.get("logo"))
                if k2:
                    pend.setdefault(k2, ([r.get("vsn") or r.get("vs"), full.get(k2)], r.get("lg") or g["lg"]))
    for k, (nombres, lg) in pend.items():
        if fresco(k) or busc >= MAX:
            continue
        busc += 1
        try:
            fid = por_nombre(nombres, lg)
        except Exception:      # red / límite de FotMob: se vuelve a buscar en la próxima corrida
            continue
        eq[k] = {"f": str(fid) if fid else None, "t": hoy, "n": nombres[0]}
    # 3) imágenes
    out = {}
    for k, x in eq.items():
        if not x.get("f"):
            continue
        rel = f"img/fm/{x['f']}.png"
        try:
            osc = bajar(x["f"], rel, recorte)
        except Exception:
            continue
        out[k] = {"logo": rel, "osc": osc}
    c["v"] = V
    os.makedirs(DATA, exist_ok=True)
    json.dump(c, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(f"escudos FotMob: {len(out)} equipos ({busc} búsquedas)")
    return out
