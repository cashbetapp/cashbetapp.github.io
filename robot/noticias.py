"""CASHBET - noticias en español (ESPN, gratis) de las ligas que cubre la app.

Guarda data/noticias.json con las 30 más recientes y su foto en data/img/n/.
"""
import json, os, hashlib, io, urllib.request, datetime as dt
from fetch import LEAGUES

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
UA = {"User-Agent": "Mozilla/5.0 (CASHBET)"}
REGION = {"col.1": "co"}


def _json(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20) as r:
            return json.load(r)
    except Exception:
        return None


def foto(url):
    rel = f"img/n/{hashlib.md5(url.encode()).hexdigest()[:12]}.jpg"
    path = os.path.join(DATA, rel)
    if os.path.exists(path):
        return "data/" + rel
    try:
        from PIL import Image
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25) as r:
            im = Image.open(io.BytesIO(r.read())).convert("RGB")
        im.thumbnail((720, 720))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        im.save(path, quality=78, optimize=True)
        return "data/" + rel
    except Exception:
        return None


def main():
    vistas, out = set(), []
    for key, (sp, code, name) in LEAGUES.items():
        reg = REGION.get(key, "mx")
        d = _json(f"https://site.api.espn.com/apis/site/v2/sports/{sp}/{code}/news?lang=es&region={reg}&limit=6") or {}
        for a in d.get("articles", []):
            url = ((a.get("links") or {}).get("web") or {}).get("href")
            tit = (a.get("headline") or "").strip()
            if not url or not tit or tit in vistas:
                continue
            vistas.add(tit)
            img = next((i.get("url") for i in a.get("images") or [] if i.get("url")), None)
            out.append({"lg": key, "liga": name, "tipo": "video" if a.get("type") == "Media" else "articulo",
                        "titulo": tit, "resumen": (a.get("description") or "").strip(), "at": a.get("published"),
                        "url": url, "img_url": img})
    out.sort(key=lambda x: x["at"] or "", reverse=True)
    out = out[:30]
    for x in out:
        x["img"] = foto(x.pop("img_url")) if x.get("img_url") else None
        x.pop("img_url", None)
    with open(os.path.join(DATA, "noticias.json"), "w", encoding="utf-8") as f:
        json.dump({"generado": dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%MZ"), "noticias": out}, f, ensure_ascii=False)
    print("noticias:", len(out))


if __name__ == "__main__":
    main()
