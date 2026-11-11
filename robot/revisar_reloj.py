"""CASHBET - prueba de que el robot corre cada hora (lee la API pública de GitHub; no cambia nada).

Uso:  python revisar_reloj.py [horas=24]

Para cada hora de las últimas N dice si hubo al menos una corrida EXITOSA del robot, y lista los
huecos. Sirve para demostrar (o desmentir) que el reloj funciona: no se afirma "24/7" sin esto.
"""
import json, sys, urllib.request, datetime as dt

REPO = "cashbetapp/cashbetapp.github.io"


def corridas(flujo, paginas=3):
    out = []
    for pg in range(1, paginas + 1):
        url = f"https://api.github.com/repos/{REPO}/actions/workflows/{flujo}/runs?per_page=100&page={pg}"
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "cashbet-revision"}), timeout=30) as r:
            rs = json.load(r)["workflow_runs"]
        out += rs
        if len(rs) < 100:
            break
    return out


def main():
    horas = int(sys.argv[1]) if len(sys.argv) > 1 else 24
    ahora = dt.datetime.now(dt.timezone.utc).replace(minute=0, second=0, microsecond=0)
    f = lambda s: dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
    rob = [r for r in corridas("robot.yml") if r.get("run_started_at")]
    rel = corridas("reloj.yml", 1)
    ok = {}
    for r in rob:
        if r["conclusion"] == "success":
            h = f(r["run_started_at"]).replace(minute=0, second=0, microsecond=0)
            ok.setdefault(h, []).append(r["event"])
    huecos, cubiertas = [], 0
    for i in range(horas, 0, -1):
        h = ahora - dt.timedelta(hours=i)
        if h in ok:
            cubiertas += 1
        else:
            huecos.append(h)
    print(f"Últimas {horas} h completas (UTC; Colombia = UTC-5): {cubiertas}/{horas} horas con el robot corriendo bien "
          f"({100 * cubiertas / horas:.0f} %)")
    por_evento = {}
    for h, evs in ok.items():
        if h >= ahora - dt.timedelta(hours=horas):
            for e in evs:
                por_evento[e] = por_evento.get(e, 0) + 1
    print("Corridas exitosas por origen:", por_evento or "ninguna")
    if huecos:
        print("Horas SIN corrida exitosa:", ", ".join(h.strftime("%m-%d %H:00") for h in huecos))
    fall = [r for r in rob if r["conclusion"] not in ("success", None, "skipped") and f(r["created_at"]) >= ahora - dt.timedelta(hours=horas)]
    if fall:
        print("Corridas con falla:", ", ".join(f"{r['created_at'][5:16]} {r['conclusion']}" for r in fall))
    vivos = [r for r in rel if r["status"] in ("in_progress", "queued", "pending", "waiting")]
    print("Reloj:", "activo (" + ", ".join(r["status"] for r in vivos) + ")" if vivos else "DETENIDO: ningún reloj esperando")
    print("Últimos relojes:", ", ".join(f"{r['created_at'][5:16]} {r['event']} {r['conclusion'] or r['status']}" for r in rel[:6]))


if __name__ == "__main__":
    main()
