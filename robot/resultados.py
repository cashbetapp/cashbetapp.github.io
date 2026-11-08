"""CASHBET - partidos EN VIVO y TERMINADOS (hoy y 2 días atrás) para el Calendario:
marcador, medio tiempo, eventos (goles, tarjetas), estadísticas, video de destacados y crónica.
Fuente: ESPN (español). Guarda data/resultados.json. Los terminados se guardan en caché y
no se vuelven a pedir."""
import json, os, datetime as dt, urllib.request
from concurrent.futures import ThreadPoolExecutor
from fetch import LEAGUES

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
OUT = os.path.join(DATA, "resultados.json")
UA = {"User-Agent": "Mozilla/5.0 (CASHBET)"}
SB = "https://site.api.espn.com/apis/site/v2/sports/{sp}/{lg}/scoreboard?dates={d}"
SUM = "https://site.api.espn.com/apis/site/v2/sports/{sp}/{lg}/summary?event={e}&lang=es&region={r}"
TIPOS = {"Gol": "gol", "Gol en propia puerta": "autogol", "Penal - Gol": "penal", "Gol de penal": "penal", "Tarjeta amarilla": "amarilla",
         "Tarjeta roja": "roja", "Segunda tarjeta amarilla": "roja", "Sustitución": "cambio", "Penal fallado": "penalfallo"}
STATS_FUT = ["Possession", "TIROS", "A GOL", "Tiros de Esquina", "Faltas", "Tarjetas Amarillas", "Tarjetas Rojas", "Fuera de Lugar", "Salvadas"]
NOMBRE = {"Possession": "Posesión %", "TIROS": "Tiros", "A GOL": "Tiros a puerta", "Tiros de Esquina": "Córners", "Faltas": "Faltas",
          "Tarjetas Amarillas": "Tarjetas amarillas", "Tarjetas Rojas": "Tarjetas rojas", "Fuera de Lugar": "Fueras de lugar", "Salvadas": "Atajadas"}


def _json(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25) as r:
            return json.load(r)
    except Exception:
        return None


def equipo(c):
    t = c.get("team") or {}
    return {"id": t.get("id"), "n": t.get("shortDisplayName") or t.get("displayName"), "ab": t.get("abbreviation"),
            "logo": t.get("logo") or ((t.get("logos") or [{}])[0]).get("href"), "s": c.get("score"),
            "ht": ((c.get("linescores") or [{}])[0]).get("displayValue"),
            "rec": ((c.get("records") or [{}])[0]).get("summary")}


def detalle(key, sp, code, e):
    d = _json(SUM.format(sp=sp, lg=code, e=e, r="co" if key == "col.1" else "mx")) or {}
    comp = ((d.get("header") or {}).get("competitions") or [{}])[0]
    cs = comp.get("competitors") or []
    side = {c.get("team", {}).get("id"): ("h" if c.get("homeAway") == "home" else "a") for c in cs}
    ev = []
    for k in d.get("keyEvents") or []:
        t = TIPOS.get(((k.get("type") or {}).get("text") or "").strip())
        if not t:
            continue
        who = [((p.get("athlete") or {}).get("displayName")) for p in (k.get("participants") or [])]
        ev.append({"t": t, "min": (k.get("clock") or {}).get("displayValue"), "s": side.get((k.get("team") or {}).get("id")),
                   "j": who[0] if who else None, "j2": who[1] if len(who) > 1 else None})
    stats = []
    tms = (d.get("boxscore") or {}).get("teams") or []
    if len(tms) == 2:
        by = [{s.get("label") or s.get("name"): s.get("displayValue") for s in t.get("statistics") or []} for t in tms]
        sd = [side.get(t.get("team", {}).get("id"), "h") for t in tms]
        H, A = (by[0], by[1]) if sd[0] == "h" else (by[1], by[0])
        if sp == "soccer":
            for lab in STATS_FUT:
                if lab in H and lab in A:
                    stats.append([NOMBRE[lab], H[lab], A[lab]])
        else:
            for lab in list(H)[:12]:
                if lab in A:
                    stats.append([lab, H[lab], A[lab]])
    vid = next(({"tit": v.get("headline"), "img": v.get("thumbnail"), "dur": v.get("duration"),
                 "url": ((v.get("links") or {}).get("web") or {}).get("href")} for v in d.get("videos") or [] if v.get("thumbnail")), None)
    nombres = [w.lower() for c in cs for w in ((c.get("team") or {}).get("displayName") or "").split() if len(w) > 3]
    art = next(({"tit": a.get("headline"), "txt": a.get("description"), "url": ((a.get("links") or {}).get("web") or {}).get("href")}
                for a in ((d.get("news") or {}).get("articles") or [])
                if a.get("headline") and any(n in (a.get("headline") + " " + (a.get("description") or "")).lower() for n in nombres)), None)
    ht = {side.get(c.get("team", {}).get("id")): ((c.get("linescores") or [{}])[0]).get("displayValue") for c in cs}
    stt = ((comp.get("status") or {}).get("type") or {})
    lid = []
    for blk in (d.get("leaders") or [])[:2]:
        for cat in (blk.get("leaders") or [])[:3]:
            l = (cat.get("leaders") or [{}])[0]
            if l.get("athlete"):
                lid.append({"s": side.get((blk.get("team") or {}).get("id")), "cat": cat.get("displayName"), "j": l["athlete"].get("displayName"), "v": l.get("displayValue")})
    return {"ev": ev, "stats": stats, "video": vid, "recap": art, "lid": lid, "ht": ht, "det_es": stt.get("detail") or stt.get("shortDetail"),
            "tv": [b.get("media", {}).get("shortName") for b in comp.get("broadcasts") or [] if b.get("media")],
            "ven": ((d.get("gameInfo") or {}).get("venue") or {}).get("fullName")}


def main():
    old = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {}
    hoy = dt.datetime.utcnow() - dt.timedelta(hours=5)
    dias = [(hoy - dt.timedelta(days=i)).strftime("%Y%m%d") for i in range(0, 3)] + [(hoy + dt.timedelta(days=1)).strftime("%Y%m%d")]
    juegos = []
    for key, (sp, code, name) in LEAGUES.items():
        for d in dias:
            sb = _json(SB.format(sp=sp, lg=code, d=d)) or {}
            for e in sb.get("events") or []:
                comp = (e.get("competitions") or [{}])[0]
                st = ((comp.get("status") or {}).get("type") or {})
                if st.get("state") not in ("in", "post"):
                    continue
                cs = {("h" if c.get("homeAway") == "home" else "a"): equipo(c) for c in comp.get("competitors") or []}
                juegos.append((key, sp, code, name, e["id"], e.get("date"), st, cs))
    out = {}
    def uno(j):
        key, sp, code, name, gid, at, st, cs = j
        prev = old.get(gid)
        if prev and prev.get("st") == "post" and st.get("state") == "post" and prev.get("ev") is not None:
            return gid, prev
        det = detalle(key, sp, code, gid)
        for s in ("h", "a"):
            if cs.get(s) and det.get("ht", {}).get(s) is not None:
                cs[s]["ht"] = det["ht"][s]
        return gid, dict(det, lg=key, liga=name, dep="nba" if key == "nba" else "futbol", at=(at or "")[:16] + "Z",
                         st=st.get("state"), det=det.pop("det_es", None) or st.get("shortDetail"), h=cs.get("h"), a=cs.get("a"))
    with ThreadPoolExecutor(6) as ex:
        for gid, r in ex.map(uno, juegos):
            out[gid] = r
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("resultados:", len(out), "en vivo:", sum(1 for r in out.values() if r["st"] == "in"))


if __name__ == "__main__":
    main()
