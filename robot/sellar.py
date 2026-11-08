"""Respaldo externo de la huella del registro.

- Agrega una línea "fecha eventos huella" a sellos/sellos.txt (rama "sellos" de git,
  que conserva todo su historial).
- Una vez al día (o si no hay sello de hoy) ancla la huella en Bitcoin con
  OpenTimestamps: se envía SOLO la huella (32 bytes) a 3 calendarios públicos y se
  guarda la prueba .ots. Se puede comprobar en https://opentimestamps.org
"""
import hashlib, json, os, sys, urllib.request

MAGIC = b"\x00OpenTimestamps\x00\x00Proof\x00\xbf\x89\xe2\xe8\x84\xe8\x92\x94"
CALENDARIOS = ["https://a.pool.opentimestamps.org", "https://b.pool.opentimestamps.org", "https://a.pool.eternitywall.com"]


LEEME = """# Sellos del registro de CASHBET

Cada línea de `sellos.txt` es: fecha (UTC), número de eventos y huella SHA-256 de la
cadena de picks en ese momento. Esta rama nunca se reescribe: su historial de git es
parte de la prueba. Cada día, `diario/AAAA-MM-DD.txt.ots` ancla la huella en Bitcoin
con OpenTimestamps (compruébalo arrastrando el .txt y su .ots a https://opentimestamps.org).

## Verificar tú mismo
1. Descarga el registro: https://cashbetapp.github.io/data/ledger.json
2. Descarga `sellos.txt`, `registro.py` y `verificar.py` de esta rama.
3. Ejecuta: `python verificar.py ledger.json sellos.txt`

Si alguien hubiera cambiado o borrado un pick o un resultado, la cadena no coincide con
los sellos del pasado y el verificador lo dice.
"""


def ots(ruta):
    """Crea ruta.ots (formato estándar de OpenTimestamps) para el archivo 'ruta'."""
    d = hashlib.sha256(open(ruta, "rb").read()).digest()
    resp = []
    for cal in CALENDARIOS:
        try:
            req = urllib.request.Request(cal + "/digest", data=d, headers={"Accept": "application/vnd.opentimestamps.v1",
                                                                           "User-Agent": "CASHBET/1.0"})
            resp.append(urllib.request.urlopen(req, timeout=25).read())
        except Exception as e:
            print("calendario sin respuesta:", cal, e)
    if not resp:
        return False
    cuerpo = b"".join(b"\xff" + r for r in resp[:-1]) + resp[-1]
    open(ruta + ".ots", "wb").write(MAGIC + b"\x01" + b"\x08" + d + cuerpo)
    return True


def main(data_dir, sellos_dir):
    s = json.load(open(os.path.join(data_dir, "sello.json"), encoding="utf-8"))
    os.makedirs(sellos_dir, exist_ok=True)
    readme = os.path.join(sellos_dir, "README.md")
    if not os.path.exists(readme):
        open(readme, "w", encoding="utf-8").write(LEEME)
    f = os.path.join(sellos_dir, "sellos.txt")
    if not os.path.exists(f):
        open(f, "w", encoding="utf-8").write("# fecha_utc eventos huella_sha256  (verificar con robot/verificar.py)\n")
    ult = [l.split() for l in open(f, encoding="utf-8") if l.strip() and not l.startswith("#")]
    if not ult or ult[-1][1:] != [str(s["n"]), s["h"]]:
        open(f, "a", encoding="utf-8").write(f"{s['t']} {s['n']} {s['h']}\n")
        print("sello agregado:", s["n"], s["h"][:16])
    dia = s["t"][:10]
    diario = os.path.join(sellos_dir, "diario", f"{dia}.txt")
    if not os.path.exists(diario + ".ots"):
        os.makedirs(os.path.dirname(diario), exist_ok=True)
        open(diario, "w", encoding="utf-8").write(f"CASHBET registro {s['t']} eventos={s['n']} huella={s['h']}\n")
        print("OpenTimestamps:", "ok" if ots(diario) else "sin respuesta (se reintenta en la próxima corrida)")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
