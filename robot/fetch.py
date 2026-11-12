"""CASHBET - robot de datos.

Descarga partidos día por día (fuente pública de ESPN) y guarda un historial
compacto por liga en data/hist/<liga>.json. Es incremental: solo vuelve a
pedir los días que faltan o que todavía tenían partidos sin terminar.

Uso:  python fetch.py [desde AAAA-MM-DD] [hasta AAAA-MM-DD]
"""
import json, os, sys, time, datetime as dt, urllib.request, gzip
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HIST = os.path.join(ROOT, "data", "hist")
API = "https://site.api.espn.com/apis/site/v2/sports/{sp}/{lg}/scoreboard?dates={d}&limit=200"

LEAGUES = {
    # clave: (deporte, código, nombre en la app, inicio de temporada aprox.)
    "nba":  ("basketball", "nba", "NBA"),
    "eng.1": ("soccer", "eng.1", "Premier League"),
    "esp.1": ("soccer", "esp.1", "LaLiga"),
    "ita.1": ("soccer", "ita.1", "Serie A"),
    "ger.1": ("soccer", "ger.1", "Bundesliga"),
    "fra.1": ("soccer", "fra.1", "Ligue 1"),
    "uefa.champions": ("soccer", "uefa.champions", "Champions League"),
    "col.1": ("soccer", "col.1", "Liga BetPlay"),
    "mex.1": ("soccer", "mex.1", "Liga MX"),
}
# ligas nuevas (experimentales, ver ligas.py)
from ligas import NUEVAS, DESDE, NUEVAS_POR_CORRIDA, INTL, DESDE_INTL
LEAGUES.update({k: ("soccer", "fifa.friendly" if k == "intl" else k, v) for k, v in NUEVAS.items()})


def dia_intl(x):
    """Selecciones: junta los partidos de todas sus competencias de ese día (sin repetir)."""
    evs, ok = {}, False
    for code in INTL:
        d = get(API.format(sp="soccer", lg=code, d=x))
        if d is None:
            continue
        ok = True
        for ev in d.get("events", []):
            evs[ev["id"]] = ev
    return {"events": list(evs.values())} if ok else None


def get(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"Accept-Encoding": "gzip"})
            with urllib.request.urlopen(req, timeout=30) as r:
                raw = r.read()
                if r.headers.get("Content-Encoding") == "gzip" or raw[:2] == b"\x1f\x8b":
                    raw = gzip.decompress(raw)
                return json.loads(raw.decode("utf-8"))
        except Exception as e:  # noqa
            if i == tries - 1:
                print("  error", url, e)
                return None
            time.sleep(1.5 * (i + 1))


def american_to_dec(v):
    try:
        s = str(v).strip()
        if s.upper() in ("EVEN", "EV"):
            return 2.0
        n = float(s)
        if n == 0:
            return None
        return round(1 + (n / 100 if n > 0 else 100 / -n), 2)
    except Exception:
        return None


def slim(ev, key):
    """Deja solo lo que usa la app y el modelo."""
    c = ev["competitions"][0]
    side = {}
    for t in c["competitors"]:
        tm = t["team"]
        side[t["homeAway"]] = {
            "id": tm.get("id"), "ab": tm.get("abbreviation"), "n": tm.get("shortDisplayName") or tm.get("displayName"),
            "fn": tm.get("displayName"), "logo": tm.get("logo"),
            "s": int(t["score"]) if str(t.get("score", "")).isdigit() else None,
            "rec": (t.get("records") or [{}])[0].get("summary"),
            "w": t.get("winner"),
        }
    st = ev["status"]["type"]
    o = (c.get("odds") or [None])[0] or {}
    ml = o.get("moneyline") or {}
    def odd(k):
        x = ml.get(k) or {}
        return american_to_dec((x.get("close") or x.get("open") or {}).get("odds"))
    tot = o.get("total") or {}
    g = {
        "id": ev["id"], "lg": key, "at": ev["date"],
        "st": "post" if st.get("completed") else st.get("state"),  # pre | in | post
        "det": ev["status"]["type"].get("shortDetail"),
        "h": side.get("home"), "a": side.get("away"),
        "ven": (c.get("venue") or {}).get("fullName"),
        "city": ((c.get("venue") or {}).get("address") or {}).get("city"),
        "tv": ", ".join(b.get("names", [""])[0] for b in c.get("broadcasts", []) if b.get("names")) or None,
        "odds": {"h": odd("home"), "a": odd("away"), "d": odd("draw"),
                 "ou": o.get("overUnder"), "sp": o.get("spread"), "det": o.get("details")} if o else None,
    }
    return g


def load(key):
    p = os.path.join(HIST, key + ".json")
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    return {"days": {}, "games": {}}


def save(key, db):
    os.makedirs(HIST, exist_ok=True)
    p = os.path.join(HIST, key + ".json")
    with open(p + ".tmp", "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(p + ".tmp", p)


def run(d0, d1, workers=4):
    days = []
    d = d0
    while d <= d1:
        days.append(d.strftime("%Y%m%d"))
        d += dt.timedelta(days=1)
    today = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None).strftime("%Y%m%d")
    nuevas = 0
    for key, (sp, lg, name) in LEAGUES.items():
        db = load(key)
        dias = days
        if key in NUEVAS and not db["days"]:
            # liga nueva sin historial: se baja desde DESDE, pocas ligas por corrida (sin sobrecargar)
            if nuevas >= NUEVAS_POR_CORRIDA:
                continue
            nuevas += 1
            d, dias = dt.date.fromisoformat(DESDE_INTL if key == "intl" else DESDE), []
            while d <= d1:
                dias.append(d.strftime("%Y%m%d")); d += dt.timedelta(days=1)
            print(f"{name}: liga nueva, bajando historial desde {dias[0]} ({len(dias)} días)", flush=True)
        # pedir: días nunca pedidos, o con partidos sin terminar, o de hoy/futuros
        todo = [x for x in dias if x not in db["days"] or db["days"][x] == "open" or x >= today]
        if not todo:
            continue
        t0 = time.time()
        with ThreadPoolExecutor(workers) as ex:
            res = list(ex.map(lambda x: (x, dia_intl(x) if key == "intl" else get(API.format(sp=sp, lg=lg, d=x))), todo))
        n = 0
        for day, data in res:
            if data is None:
                continue
            evs = data.get("events", [])
            open_ = False
            vistos = {ev["id"] for ev in evs}
            # partidos que antes salían en este día y la fuente ya no muestra
            # (cambiados de fecha o cancelados): se borran si no han terminado
            for gid in [k for k, v in db["games"].items() if v.get("dq") == day and k not in vistos and v.get("st") != "post"]:
                del db["games"][gid]
            for ev in evs:
                g = slim(ev, key)
                g["dq"] = day
                old = db["games"].get(g["id"]) or {}
                # en vivo o terminado, la fuente cambia o borra las cuotas:
                # conservar las últimas de antes del partido
                if g["st"] != "pre" and old.get("odds"):
                    g["odds"] = old["odds"]
                elif g["st"] != "pre":
                    g["odds"] = None
                db["games"][g["id"]] = g
                n += 1
                if g["st"] != "post" and g["st"] != "postponed":
                    open_ = True
            db["days"][day] = "open" if open_ else "ok"
        save(key, db)
        print(f"{name:18s} {len(todo):4d} días, {n:5d} partidos leídos, total {len(db['games'])}  ({time.time()-t0:.0f}s)")


if __name__ == "__main__":
    now = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None).date()
    d0 = dt.date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else now - dt.timedelta(days=3)
    d1 = dt.date.fromisoformat(sys.argv[2]) if len(sys.argv) > 2 else now + dt.timedelta(days=7)
    run(d0, d1)
