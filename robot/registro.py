"""CASHBET - registro inalterable de picks.

Reglas:
- Un pick se anota la PRIMERA vez que se publica (fecha y hora "pub") y desde ahí no
  se edita. Si el modelo cambia de opinión antes del partido, el nuevo pick es otro
  registro; el anterior queda marcado "retirado" (se ve, pero no cuenta en el acierto).
- Nada se borra. Un partido dudoso en la fuente se califica "nulo" con su motivo.
- Cada anotación y cada calificación se encadena con SHA-256 (cadena de huellas). La
  huella final de cada corrida se guarda en la rama "sellos" de git (con historial),
  así cualquiera puede comprobar que un pick viejo no se cambió (ver verificar.py).
"""
import hashlib, json

# campos que pueden cambiar sin romper el registro (estado del partido / calificación)
# "vis" = el pick salió en la app (no estaba oculto) en alguna corrida antes del partido;
# se marca después de anotar, por eso no entra en la huella
MUTABLES = {"ok", "real", "res", "estado", "ret", "motivo", "h_", "hr", "i", "ir", "vis"}


def _canon(d):
    return json.dumps(d, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def nucleo(rec):
    """Lo que se publicó (no cambia nunca)."""
    return {k: v for k, v in rec.items() if k not in MUTABLES}


def _sello(L, texto):
    c = L.setdefault("cadena", {"n": 0, "h": "0" * 64})
    c["h"] = hashlib.sha256((c["h"] + texto).encode("utf-8")).hexdigest()
    c["n"] += 1
    return c["n"], c["h"]


def anotar(L, coll, key, rec, pub):
    """Anota un pick nuevo (si ya existe no lo toca). Devuelve True si era nuevo."""
    col = L.setdefault(coll, {})
    if key in col:
        return False
    rec = dict(rec, pub=pub)
    rec["i"], rec["h_"] = _sello(L, _canon({"c": coll, "k": key, "d": nucleo(rec)}))
    col[key] = rec
    return True


def calificar(L, coll, key, estado, **extra):
    """Pone el resultado una sola vez y lo encadena."""
    rec = L[coll][key]
    if rec.get("estado"):
        return
    rec.update(extra)
    rec["estado"] = estado
    rec["ok"] = True if estado == "acierto" else False if estado == "fallo" else None
    res = {k: rec.get(k) for k in ("estado", "real", "res", "motivo") if rec.get(k) is not None}
    rec["ir"], rec["hr"] = _sello(L, _canon({"c": coll, "k": key, "r": res}))


def migrar(L):
    """Registros de antes del sello: se encadenan una vez, en orden fijo, tal como están."""
    if L.get("cadena"):
        return
    for coll in ("partidos", "extra", "props"):
        for key in sorted(L.get(coll, {})):
            rec = L[coll][key]
            rec.setdefault("pub", None)          # se anotó antes de guardar la hora de publicación
            rec["i"], rec["h_"] = _sello(L, _canon({"c": coll, "k": key, "d": nucleo(rec)}))
            if "ok" in rec and not rec.get("estado"):
                ok = rec["ok"]
                rec["estado"] = "acierto" if ok else "fallo" if ok is False else "nulo"
                res = {k: rec.get(k) for k in ("estado", "real", "res", "motivo") if rec.get(k) is not None}
                rec["ir"], rec["hr"] = _sello(L, _canon({"c": coll, "k": key, "r": res}))


def verificar(L, cabezas=None):
    """Recalcula la cadena completa desde cero. Devuelve (ok, n, huella, errores).
    Si se pasa una lista 'cabezas', se llena con la huella después de cada evento."""
    ev = []
    for coll in ("partidos", "extra", "props"):
        for key, rec in L.get(coll, {}).items():
            ev.append((rec["i"], _canon({"c": coll, "k": key, "d": nucleo(rec)}), rec["h_"], key))
            if rec.get("ir"):
                res = {k: rec.get(k) for k in ("estado", "real", "res", "motivo") if rec.get(k) is not None}
                ev.append((rec["ir"], _canon({"c": coll, "k": key, "r": res}), rec["hr"], key))
    ev.sort()
    h, errores = "0" * 64, []
    for n, (i, texto, esperado, key) in enumerate(ev, 1):
        if i != n:
            errores.append(f"falta el evento {n} (hay {i})")
            break
        h = hashlib.sha256((h + texto).encode("utf-8")).hexdigest()
        if cabezas is not None:
            cabezas.append(h)
        if h != esperado:
            errores.append(f"evento {i} ({key}) no coincide: el registro fue modificado")
            break
    c = L.get("cadena", {})
    if not errores and (c.get("n") != len(ev) or c.get("h") != h):
        errores.append("la huella final no coincide")
    return not errores, len(ev), h, errores
