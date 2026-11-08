"""CASHBET - previa de cada partido próximo (pestañas Equipos y Plantel, como IABET):
récords, clasificación, estadísticas de temporada, líderes, serie de la temporada y, en la NBA,
la rotación por posición (depth chart) con lesionados. Fuente: ESPN (español).
Guarda data/previa.json {id_partido: {...}}; se renueva cada 6 h por partido."""
import json, os, datetime as dt, urllib.request
from concurrent.futures import ThreadPoolExecutor

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
OUT = os.path.join(DATA, "previa.json")
UA = {"User-Agent": "Mozilla/5.0 (CASHBET)"}
POS = [("pg", "PG"), ("sg", "SG"), ("sf", "SF"), ("pf", "PF"), ("c", "C")]


def _json(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25) as r:
            return json.load(r)
    except Exception:
        return None


def ahora():
    return dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%MZ")


def rotacion(tid, lesion):
    d = _json(f"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{tid}/depthcharts") or {}
    ch = ((d.get("depthchart") or [{}])[0].get("positions")) or {}
    out = []
    for k, lab in POS:
        ats = (ch.get(k) or {}).get("athletes") or []
        js = []
        for a in ats[:5]:
            st = lesion.get(a.get("displayName")) or ((a.get("injuries") or [{}])[0].get("status") if a.get("injuries") else None)
            js.append({"n": a.get("displayName"), "num": a.get("jersey"), "st": st})
        if js:
            out.append({"pos": lab, "js": js})
    return out


def uno(g):
    sp = "basketball/nba" if g["dep"] == "nba" else f"soccer/{g['lg']}"
    s = _json(f"https://site.api.espn.com/apis/site/v2/sports/{sp}/summary?event={g['id']}&lang=es&region={'co' if g['lg'] == 'col.1' else 'mx'}") or {}
    comp = ((s.get("header") or {}).get("competitions") or [{}])[0]
    side, rec = {}, {}
    for c in comp.get("competitors") or []:
        sd = "h" if c.get("homeAway") == "home" else "a"
        side[c.get("team", {}).get("id")] = sd
        rec[sd] = {r.get("type"): r.get("summary") for r in c.get("record") or c.get("records") or []}
    stats = []
    tms = (s.get("boxscore") or {}).get("teams") or []
    if len(tms) == 2:
        by = {side.get(t.get("team", {}).get("id"), "h"): {z.get("label"): z.get("displayValue") for z in t.get("statistics") or []} for t in tms}
        H, A = by.get("h", {}), by.get("a", {})
        stats = [[k, H[k], A[k]] for k in H if k in A]
    lid = []
    for b in s.get("leaders") or []:
        sd = side.get((b.get("team") or {}).get("id"))
        for cat in (b.get("leaders") or [])[:3]:
            l = (cat.get("leaders") or [{}])[0]
            if l.get("athlete"):
                lid.append({"s": sd, "cat": cat.get("displayName"), "j": l["athlete"].get("displayName"), "v": l.get("displayValue")})
    serie = None
    for ss in s.get("seasonseries") or []:
        serie = {"txt": ss.get("summary"), "ev": [{"at": e.get("date"), "st": (e.get("statusType") or {}).get("state") or e.get("status"),
                 "m": "-".join(str(c.get("score")) for c in e.get("competitors") or [] if c.get("score") is not None)} for e in ss.get("events") or []]}
        break
    clas = {}
    for grp in ((s.get("standings") or {}).get("groups") or []):
        for e in ((grp.get("standings") or {}).get("entries") or []):
            sd = side.get(str(e.get("id"))) or next((side.get(k) for k in side if (e.get("team") or "") and k in str(e)), None)
            if not sd:
                continue
            st = {z.get("name") or z.get("type"): z.get("displayValue") for z in e.get("stats") or []}
            clas[sd] = {"pct": st.get("winPercent") or st.get("winpercent"), "racha": st.get("streak"), "pos": st.get("rank") or st.get("playoffSeed"),
                        "pts": st.get("points"), "gb": st.get("gamesBehind")}
    lesion = {}
    for t in s.get("injuries") or []:
        for i in t.get("injuries") or []:
            n = (i.get("athlete") or {}).get("displayName")
            if n:
                lesion[n] = i.get("status")
    out = {"rec": rec, "stats": stats, "lid": lid, "serie": serie, "clas": clas, "q": ahora()}
    if g["dep"] == "nba":
        out["rot"] = {sd: rotacion(tid, lesion) for tid, sd in side.items()}
    return g["id"], out


def main():
    old = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {}
    picks = json.load(open(os.path.join(DATA, "picks.json"), encoding="utf-8"))
    lim = (dt.datetime.utcnow() + dt.timedelta(days=3)).strftime("%Y-%m-%dT%H:%MZ")
    juegos = [g for g in picks["partidos"] if ahora() < g["at"] <= lim]
    hace6 = (dt.datetime.utcnow() - dt.timedelta(hours=6)).strftime("%Y-%m-%dT%H:%MZ")
    pend = [g for g in juegos if not (old.get(g["id"]) and old[g["id"]].get("q", "") >= hace6)]
    out = {g["id"]: old[g["id"]] for g in juegos if g["id"] in old}
    with ThreadPoolExecutor(6) as ex:
        for gid, r in ex.map(uno, pend):
            out[gid] = r
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("previa:", len(out), "nuevas:", len(pend))


if __name__ == "__main__":
    main()
