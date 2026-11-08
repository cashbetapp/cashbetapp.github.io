"""CASHBET - detalle de cada partido terminado (box score, estadísticas de
equipo, lesiones). Guarda data/detail/<liga>.json {id_partido: {...}}.
Incremental: solo baja los partidos terminados que aún no tiene."""
import json, os, sys, time
from concurrent.futures import ThreadPoolExecutor
from fetch import get, ROOT, LEAGUES, HIST

OUT = os.path.join(ROOT, "data", "detail")
URL = "https://site.api.espn.com/apis/site/v2/sports/{sp}/{lg}/summary?event={e}"


def num(v):
    try:
        if isinstance(v, str) and "-" in v and not v.startswith("-"):
            a, b = v.split("-", 1)
            return [float(a), float(b)]
        return float(v)
    except Exception:
        return None


def slim_nba(d):
    out = {"pl": {}, "inj": {}}
    for side in (d.get("boxscore") or {}).get("players", []):
        tid = side["team"]["id"]
        for blk in side.get("statistics", []):
            labels = blk.get("labels", [])
            for a in blk.get("athletes", []):
                if a.get("didNotPlay") or not a.get("stats"):
                    continue
                st = dict(zip(labels, a["stats"]))
                ath = a.get("athlete") or {}
                if not ath.get("id"):
                    continue
                out["pl"][ath["id"]] = {
                    "t": tid, "n": ath.get("displayName"), "pos": (ath.get("position") or {}).get("abbreviation"),
                    "st": a.get("starter", False),
                    **{k: num(v) for k, v in st.items()},
                }
    tm = {}
    for t in (d.get("boxscore") or {}).get("teams", []):
        tm[t["team"]["id"]] = {s["name"]: num(s.get("displayValue")) for s in t.get("statistics", [])}
    out["tm"] = tm
    for t in d.get("injuries", []):
        out["inj"][t["team"]["id"]] = [
            {"id": (i.get("athlete") or {}).get("id"), "n": (i.get("athlete") or {}).get("displayName"),
             "s": i.get("status")} for i in t.get("injuries", [])]
    return out


def slim_soccer(d):
    out = {"tm": {}, "pl": {}}
    for t in (d.get("boxscore") or {}).get("teams", []):
        out["tm"][t["team"]["id"]] = {s["name"]: num(s.get("displayValue")) for s in t.get("statistics", [])}
    for r in d.get("rosters", []):
        tid = r["team"]["id"]
        for p in r.get("roster", []):
            ath = p.get("athlete") or {}
            st = {s["name"]: s.get("value") for s in p.get("stats", [])}
            if not st.get("appearances"):
                continue
            out["pl"][ath.get("id")] = {"t": tid, "n": ath.get("displayName"),
                                       "pos": (p.get("position") or {}).get("abbreviation"),
                                       "st": p.get("starter", False), **st}
    return out


def run(workers=4):
    os.makedirs(OUT, exist_ok=True)
    for key, (sp, lg, name) in LEAGUES.items():
        hp = os.path.join(HIST, key + ".json")
        if not os.path.exists(hp):
            continue
        games = json.load(open(hp, encoding="utf-8"))["games"]
        op = os.path.join(OUT, key + ".json")
        db = json.load(open(op, encoding="utf-8")) if os.path.exists(op) else {}
        todo = [g for g, v in games.items() if v["st"] == "post" and g not in db]
        if not todo:
            continue
        t0 = time.time()
        fn = slim_nba if sp == "basketball" else slim_soccer
        def one(e):
            d = get(URL.format(sp=sp, lg=lg, e=e))
            try:
                return e, (fn(d) if d else None)
            except Exception as ex:
                print("  partido", e, "con datos raros:", ex, flush=True)
                return e, None
        done = 0
        with ThreadPoolExecutor(workers) as ex:
            for e, v in ex.map(one, todo):
                if v is not None:
                    db[e] = v; done += 1
                if done and done % 300 == 0:
                    json.dump(db, open(op, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        json.dump(db, open(op, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        print(f"{name:18s} {done}/{len(todo)} partidos con detalle ({time.time()-t0:.0f}s)", flush=True)


if __name__ == "__main__":
    run()
