"""CASHBET - guarda las líneas de player props (DraftKings vía ESPN) de los
partidos NBA que no han empezado. Las líneas de partidos pasados no se pueden
recuperar, así que esto tiene que correr seguido desde el primer día.

Guarda en data/props/AAAA-MM-DD.json: {evento: {cuando, props: [...]}}.
Cada corrida actualiza la última línea vista antes del inicio (la de cierre).
"""
import json, os, datetime as dt
from concurrent.futures import ThreadPoolExecutor
from fetch import get, ROOT

OUT = os.path.join(ROOT, "data", "props")
SB = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates={d}"
PB = "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events/{e}/competitions/{e}/odds/100/propBets?limit=1000"


def athlete_id(ref):
    try:
        return ref.split("/athletes/")[1].split("?")[0]
    except Exception:
        return None


def slim(p):
    o = p.get("odds") or {}
    return {
        "pl": athlete_id((p.get("athlete") or {}).get("$ref", "")),
        "t": (p.get("type") or {}).get("name"),
        "ln": (p.get("current") or {}).get("target", {}).get("value"),
        "ln0": (p.get("open") or {}).get("target", {}).get("value"),
        "o": (o.get("decimal") or {}).get("value"),
        "o0": (o.get("decimal") or {}).get("open"),
        "tot": (o.get("total") or {}).get("value"),
        "up": p.get("lastUpdated"),
    }


def run():
    now = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
    days = [(now + dt.timedelta(days=i)).strftime("%Y%m%d") for i in (0, 1)]
    pend = []
    for d in days:
        sb = get(SB.format(d=d)) or {}
        for ev in sb.get("events", []):
            if ev["status"]["type"]["state"] == "pre":
                pend.append((ev["id"], ev["date"], ev["shortName"]))
    def one(x):
        e, at, nm = x
        out, page = [], 1
        while True:
            d = get(PB.format(e=e) + f"&page={page}") or {}
            out += [slim(p) for p in d.get("items", [])]
            if page >= (d.get("pageCount") or 1):
                break
            page += 1
        return x, out
    with ThreadPoolExecutor(6) as ex:
        res = list(ex.map(one, pend))
    os.makedirs(OUT, exist_ok=True)
    tot = 0
    for (e, at, nm), props in res:
        if not props:
            continue
        f = os.path.join(OUT, at[:10] + ".json")
        db = json.load(open(f, encoding="utf-8")) if os.path.exists(f) else {}
        db[e] = {"at": at, "name": nm, "seen": now.strftime("%Y-%m-%dT%H:%MZ"), "props": props}
        json.dump(db, open(f, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        tot += len(props)
        print(f"{nm:12s} {len(props):5d} líneas")
    print("total", tot, "líneas guardadas")


if __name__ == "__main__":
    run()
