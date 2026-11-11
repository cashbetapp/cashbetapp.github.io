"""CASHBET - notificaciones push (llegan con la app cerrada).
Entra a Firebase con la cuenta robot, lee las suscripciones de usuarios/{uid}.push y envía:
  - dia: resumen de los picks de hoy (una vez al día, desde las 7 a. m. hora Colombia)
  - err: errores de cuota NUEVOS (misma lógica que web/errores.js)
  - res: resultado de los picks que sigue cada usuario (acierto / fallo / push)
No repite avisos: lo enviado queda en data/avisos.json (rama datos).
Secretos (solo en GitHub Actions): VAPID_PRIVATE, ROBOT_PASS. Sin ellos no hace nada.
Uso de prueba sin enviar: python avisos.py --seco usuarios_prueba.json"""
import json, os, sys, hashlib, datetime as dt, urllib.request, urllib.error

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
OUT = os.path.join(DATA, "avisos.json")
API_KEY = "AIzaSyBMfr10eraDEdxCtOWLkQrKS-70OqptRnU"   # clave pública de la app web (no es secreta)
PROYECTO = "cashbet-2562a"
ROBOT = "robot-avisos@cashbet-2562a.firebaseapp.com"
ERR_PMIN, ERR_MIN, P_TOPE = 0.6, 0.05, 0.75
COL = dt.timezone(dt.timedelta(hours=-5))


def _h(s):
    return hashlib.sha256(s.encode()).hexdigest()[:16]


def _post(url, body, h=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", **(h or {})})
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.load(r)


def _get(url, h):
    with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=25) as r:
        return json.load(r)


def _val(v):
    """Valor tipado de Firestore REST -> Python."""
    if "mapValue" in v:
        return {k: _val(x) for k, x in (v["mapValue"].get("fields") or {}).items()}
    if "arrayValue" in v:
        return [_val(x) for x in v["arrayValue"].get("values") or []]
    for k in ("stringValue", "booleanValue", "timestampValue"):
        if k in v:
            return v[k]
    if "integerValue" in v:
        return int(v["integerValue"])
    if "doubleValue" in v:
        return float(v["doubleValue"])
    return None


def usuarios():
    tok = _post(f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
                {"email": ROBOT, "password": os.environ["ROBOT_PASS"], "returnSecureToken": True})["idToken"]
    h, out, pt = {"Authorization": "Bearer " + tok}, [], ""
    while True:
        d = _get(f"https://firestore.googleapis.com/v1/projects/{PROYECTO}/databases/(default)/documents/usuarios?pageSize=300" + (f"&pageToken={pt}" if pt else ""), h)
        for doc in d.get("documents") or []:
            f = {k: _val(v) for k, v in (doc.get("fields") or {}).items()}
            if (f.get("push") or {}).get("sub"):
                out.append({"uid": doc["name"].rsplit("/", 1)[1], "push": f["push"], "seg": f.get("seg") or {}})
        pt = d.get("nextPageToken")
        if not pt:
            return out


# ---------- errores de cuota (igual que web/errores.js) ----------
def _mk_grupo(g, m):
    if g["dep"] == "nba":
        return "NBA · " + ("Total de puntos" if m.startswith(("mas_", "menos_")) else "Hándicap" if m.startswith("hcp") else "Ganador")
    return "Goles" if m.startswith(("mas_", "menos_", "btts")) else "Resultado"


def _banda(H, p):
    for k, m in (H.get("confianza") or {}).items():
        lo, hi = [int(x) for x in k.replace("%", "").split("-")]
        if lo <= p * 100 < (101 if hi == 100 else hi) and (m.get("calificados") or 0) >= 30 and m.get("acierto") is not None:
            return m["acierto"] / 100
    return None


def _p_real(H, p0, grupo):
    b = _banda(H, p0)
    p = min(p0, P_TOPE) if b is None else min(p0, b)
    m = (H.get("mercado") or {}).get(grupo)
    if m and (m.get("calificados") or 0) >= 20 and m.get("acierto") is not None and m.get("prob_media") and m["acierto"] < m["prob_media"]:
        p *= m["acierto"] / m["prob_media"]
    return p


def errores(D, H, ahora):
    out, lim = [], ahora + dt.timedelta(hours=36)
    vig = lambda at: ahora < dt.datetime.fromisoformat(at.replace("Z", "+00:00")) < lim
    for g in D.get("partidos") or []:
        if not vig(g["at"]):
            continue
        for x in g.get("mercados") or []:
            if x.get("cuota") and x.get("p"):
                p = _p_real(H, x["p"], _mk_grupo(g, x["m"]))
                if p >= ERR_PMIN and p * x["cuota"] - 1 >= ERR_MIN:
                    out.append({"k": f"{g['id']}|{x['m']}", "n": f"{g['h']['n']} vs {g['a']['n']}", "txt": x["txt"], "p": p, "c": x["cuota"], "e": p * x["cuota"] - 1})
    vmin = D.get("valor_min") or 0.05
    for x in []:   # jugadores NBA fuera: sus "errores de cuota" acertaron 37 % (la casa tenía razón), igual que en la app
        if not vig(x["at"]) or not x.get("cuota") or not ((x.get("valor") or -1) >= vmin or x.get("p", 0) >= 0.55):
            continue
        p = _p_real(H, x.get("pm") or x["p"], "Jugadores NBA · " + x["tipo"])
        if p >= ERR_PMIN and p * x["cuota"] - 1 >= ERR_MIN:
            out.append({"k": f"pl{x['pl']}|{x['ev']}", "n": x["jugador"], "txt": f"{'más' if x['lado'] == 'mas' else 'menos'} de {x['linea']} {x['tipo'].lower()}",
                        "p": p, "c": x["cuota"], "e": p * x["cuota"] - 1})
    visto, res = set(), []
    for e in sorted(out, key=lambda e: -e["e"]):
        if e["k"] not in visto:
            visto.add(e["k"]); res.append(e)
    return sorted(res, key=lambda e: (-e["p"], -e["e"]))


# ---------- resultado de un pick seguido (igual que web/seguidos.js) ----------
def _es_partido(r):
    return r["c"] == "g" or (r["c"] == "p" and (r["k"].isdigit() or "|" in r["k"]))


def estado(filas, sid, v):
    if sid.startswith(("pk|", "pr|")):
        f = next((r for r in filas if r["k"] == sid[3:]), None)
    else:
        m = v.get("m")
        f = next((r for r in filas if _es_partido(r) and (r["k"] == sid or r["k"].startswith(sid + "|")) and (not m or r["k"] == sid or r["k"].endswith("|" + m))), None)
    return f.get("st") if f else None


def mensajes(u, D, H, errs, enviados, ahora):
    """Lista de (clave, payload) que le tocan a este usuario y aún no se le enviaron."""
    pref = u["push"].get("pref") or {"dia": True, "err": True, "res": True, "alta": True, "racha": True}
    loc = ahora.astimezone(COL)
    hoy, out = loc.strftime("%Y-%m-%d"), []
    despierto = 7 <= loc.hour <= 23
    if pref.get("dia", True) and despierto and f"dia|{hoy}" not in enviados:
        juegos = [g for g in D.get("partidos") or [] if not (g.get("pick") or {}).get("bajo") and (g.get("pick") or {}).get("txt")
                  and dt.datetime.fromisoformat(g["at"].replace("Z", "+00:00")).astimezone(COL).strftime("%Y-%m-%d") == hoy
                  and dt.datetime.fromisoformat(g["at"].replace("Z", "+00:00")) > ahora]
        if juegos:
            pp = lambda g: g["pick"].get("pv") if g["pick"].get("tipo") == "valor" else g["pick"].get("p", 0)
            mej = max(juegos, key=pp)
            b = f"{len(juegos)} partidos con pick hoy" + (f" · {len(errs)} errores de cuota" if errs else "") + f". El más probable: {mej['pick']['txt']} ({round(pp(mej) * 100)}%)."
            out.append((f"dia|{hoy}", {"t": "Los picks de hoy ya están", "b": b, "u": "./#picks", "tag": "dia"}))
    if pref.get("err", True) and despierto:
        nuevos = [e for e in errs if f"err|{e['k']}" not in enviados]
        if nuevos:
            e = nuevos[0]
            det = f"{e['n']}: {e['txt']}. {round(e['p'] * 100)}% de probabilidad y la casa paga {e['c']:.2f} (debería pagar {1 / e['p']:.2f})."
            t = "Error de cuota detectado" if len(nuevos) == 1 else f"{len(nuevos)} errores de cuota nuevos"
            out.append(([f"err|{x['k']}" for x in nuevos], {"t": t, "b": det, "u": "./#inicio", "tag": "err"}))
    if pref.get("alta", True) and despierto:
        # picks de alta confianza (>= 70 %) de hoy que aún no se avisaron (como "Picks de Alta Confianza" de IABET)
        pp = lambda g: g["pick"].get("pv") if g["pick"].get("tipo") == "valor" else g["pick"].get("p", 0)
        altos = [g for g in D.get("partidos") or [] if (g.get("pick") or {}).get("txt") and not g["pick"].get("bajo") and pp(g) >= 0.70
                 and dt.datetime.fromisoformat(g["at"].replace("Z", "+00:00")).astimezone(COL).strftime("%Y-%m-%d") == hoy
                 and dt.datetime.fromisoformat(g["at"].replace("Z", "+00:00")) > ahora and f"alta|{g['id']}" not in enviados]
        if altos:
            altos.sort(key=lambda g: -pp(g))
            t = "Pick de alta confianza" if len(altos) == 1 else f"{len(altos)} picks de alta confianza"
            b = " · ".join(f"{g['pick']['txt']} ({round(pp(g) * 100)}%)" for g in altos[:3])
            out.append(([f"alta|{g['id']}" for g in altos], {"t": t, "b": b, "u": "./#picks", "tag": "alta"}))
    if pref.get("racha", True):
        # racha de tus picks seguidos: avisa al llegar a 3, 5, 7… aciertos o fallos seguidos
        filas = H.get("filas") or []
        hechos = []
        for sid, v in (u.get("seg") or {}).items():
            if isinstance(v, dict) and v.get("at"):
                st = estado(filas, sid, v)
                if st in ("acierto", "fallo"):
                    hechos.append((v["at"], sid, st))
        hechos.sort()
        if hechos:
            ult, n = hechos[-1][2], 0
            for h in reversed(hechos):
                if h[2] != ult:
                    break
                n += 1
            clave = f"racha|{ult}|{n}|{hechos[-1][1]}"
            if n >= 3 and n % 2 == 1 and clave not in enviados:
                t = f"Racha de {n} aciertos seguidos" if ult == "acierto" else f"{n} fallos seguidos"
                b = "Tus picks seguidos van en racha ganadora." if ult == "acierto" else "Tus picks seguidos van en racha perdedora: revisa tu bankroll y no persigas pérdidas."
                out.append((clave, {"t": t, "b": b, "u": "./#seguidos", "tag": "racha"}))
    if pref.get("res", True):
        filas, gan, per = H.get("filas") or [], [], []
        for sid, v in (u.get("seg") or {}).items():
            if not isinstance(v, dict) or f"res|{sid}" in enviados or not v.get("at"):
                continue
            if dt.datetime.fromisoformat(v["at"].replace("Z", "+00:00")) < ahora - dt.timedelta(days=3):
                continue
            st = estado(filas, sid, v)
            if st in ("acierto", "fallo", "push"):
                (gan if st == "acierto" else per).append((sid, v, st))
        todos = gan + per
        if todos:
            nom = lambda v: v.get("pill") or v.get("txt") or "tu pick"
            if len(todos) == 1:
                sid, v, st = todos[0]
                t = {"acierto": "Ganó tu pick", "fallo": "Tu pick no salió", "push": "Tu pick quedó en push (se devuelve)"}[st]
                b = f"{nom(v)} · {v.get('nom') or (str(v.get('h', '')) + ' vs ' + str(v.get('a', '')))}"
            else:
                ng, npd = len(gan), len([x for x in per if x[2] == "fallo"])
                t = f"Resultados: {ng} {'ganado' if ng == 1 else 'ganados'}, {npd} {'perdido' if npd == 1 else 'perdidos'}"
                b = " · ".join(("Ganó " if st == "acierto" else "Falló " if st == "fallo" else "Push ") + nom(v) for _, v, st in todos[:4])
            out.append(([f"res|{s}" for s, _, _ in todos], {"t": t, "b": b, "u": "./#seguidos", "tag": "res"}))
    return out


def main():
    seco = "--seco" in sys.argv
    if not seco and not (os.environ.get("VAPID_PRIVATE") and os.environ.get("ROBOT_PASS")):
        print("avisos: faltan los secretos, no se envía nada"); return
    D = json.load(open(os.path.join(DATA, "picks.json"), encoding="utf-8"))
    H = json.load(open(os.path.join(DATA, "historial.json"), encoding="utf-8")) if os.path.exists(os.path.join(DATA, "historial.json")) else {}
    est = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {}
    ahora = dt.datetime.now(dt.timezone.utc)
    if "--ahora" in sys.argv:
        ahora = dt.datetime.fromisoformat(sys.argv[sys.argv.index("--ahora") + 1])
    us = json.load(open(sys.argv[sys.argv.index("--seco") + 1], encoding="utf-8")) if seco else usuarios()
    errs = errores(D, H, ahora)
    if not seco:
        from pywebpush import webpush, WebPushException
        from py_vapid import Vapid
        vapid = Vapid.from_raw(os.environ["VAPID_PRIVATE"].encode())
    enviados_n = fallos = 0
    for u in us:
        # la rama datos es pública: solo se guardan huellas (hash), nunca el uid ni la suscripción
        reg = est.setdefault(_h(u["uid"]), {})
        if reg.get("_muerta") and reg["_muerta"] == _h(u["push"]["sub"]):
            continue
        for clave, msg in mensajes(u, D, H, errs, reg, ahora):
            claves = clave if isinstance(clave, list) else [clave]
            if seco:
                print(u["uid"], "->", json.dumps(msg, ensure_ascii=False)); ok = True
            else:
                try:
                    webpush(subscription_info=json.loads(u["push"]["sub"]), data=json.dumps(msg, ensure_ascii=False),
                            vapid_private_key=vapid, vapid_claims={"sub": "https://cashbetapp.github.io"}, ttl=6 * 3600)
                    ok = True; enviados_n += 1
                except WebPushException as e:
                    ok = False; fallos += 1
                    code = getattr(e.response, "status_code", None)
                    print("push falló", _h(u["uid"])[:6], code)
                    if code in (404, 410):   # suscripción vencida: no insistir hasta que el usuario la renueve
                        reg["_muerta"] = _h(u["push"]["sub"])
                        break
            if ok:
                for c in claves:
                    reg[c] = ahora.strftime("%Y-%m-%dT%H:%MZ")
    # limpiar claves de más de 10 días
    corte = (ahora - dt.timedelta(days=10)).strftime("%Y-%m-%dT%H:%MZ")
    for uid in list(est):
        est[uid] = {k: v for k, v in est[uid].items() if k.startswith("_") or v >= corte}
    if not seco:
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump(est, f, separators=(",", ":"))
    print(f"avisos: {len(us)} suscritos, {len(errs)} errores de cuota, {enviados_n} enviados, {fallos} fallidos")


if __name__ == "__main__":
    main()
