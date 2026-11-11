"""CASHBET - historial PRIVADO (solo la cuenta admin lo ve).

El repositorio es público, así que el historial (historial.json) y el registro sellado
(ledger.json) ya no se publican en la página ni se guardan legibles en la rama "datos":

  python privado.py cifrar  DIR     -> DIR/privado/*.enc (cifrados) + .gitignore que deja fuera los .json
  python privado.py descifrar DIR   -> recupera DIR/historial.json y DIR/ledger.json desde DIR/privado/*.enc
  python privado.py subir           -> los sube comprimidos a Firestore (privado/historial, privado/ledger),
                                       que según las reglas solo puede leer cashbetia@gmail.com

La clave sale del secreto ROBOT_PASS de GitHub Actions. Si falta la clave o algo no cuadra,
el script falla A PROPÓSITO: es mejor que el robot se detenga a que empiece un registro nuevo
o publique el historial sin cifrar.
"""
import base64, gzip, hashlib, json, os, sys, time, urllib.request

ARCHIVOS = ("historial", "ledger")
API_KEY = "AIzaSyBMfr10eraDEdxCtOWLkQrKS-70OqptRnU"   # clave pública de la app web (no es secreta)
PROYECTO = "cashbet-2562a"
ROBOT = "robot-avisos@cashbet-2562a.firebaseapp.com"
TROZO = 700_000       # Firestore admite ~1 MB por documento: se parte en trozos


def _fernet():
    from cryptography.fernet import Fernet
    pw = os.environ.get("ROBOT_PASS")
    if not pw:
        sys.exit("privado: falta ROBOT_PASS; no se cifra ni descifra nada")
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(("cashbet-datos-v1|" + pw).encode()).digest()))


def cifrar(d):
    f = _fernet()
    os.makedirs(os.path.join(d, "privado"), exist_ok=True)
    for n in ARCHIVOS:
        p = os.path.join(d, n + ".json")
        if not os.path.exists(p):
            continue
        b = open(p, "rb").read()
        json.loads(b)                                   # no cifrar un archivo roto
        tok = f.encrypt(gzip.compress(b, 9))
        assert gzip.decompress(f.decrypt(tok)) == b     # comprobación de ida y vuelta
        open(os.path.join(d, "privado", n + ".enc"), "wb").write(tok)
    with open(os.path.join(d, ".gitignore"), "w") as g:
        g.write("".join(n + ".json\n" for n in ARCHIVOS))
    print("privado: cifrados", [n for n in ARCHIVOS if os.path.exists(os.path.join(d, "privado", n + ".enc"))])


def descifrar(d):
    encs = [n for n in ARCHIVOS if os.path.exists(os.path.join(d, "privado", n + ".enc"))]
    if not encs:
        print("privado: no hay archivos cifrados (primera vez); se usan los .json tal cual")
        return
    f = _fernet()
    for n in encs:
        b = gzip.decompress(f.decrypt(open(os.path.join(d, "privado", n + ".enc"), "rb").read()))
        json.loads(b)
        open(os.path.join(d, n + ".json"), "wb").write(b)
    print("privado: descifrados", encs)


def _req(url, body=None, h=None, metodo=None):
    r = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                               headers=dict({"Content-Type": "application/json"}, **(h or {})), method=metodo)
    with urllib.request.urlopen(r, timeout=60) as x:
        return json.load(x)


def subir():
    pw = os.environ.get("ROBOT_PASS")
    if not pw:
        sys.exit("privado: falta ROBOT_PASS; no se sube nada")
    tok = _req(f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
               {"email": ROBOT, "password": pw, "returnSecureToken": True})["idToken"]
    h = {"Authorization": "Bearer " + tok}
    base = f"https://firestore.googleapis.com/v1/projects/{PROYECTO}/databases/(default)/documents/privado"
    data = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
    for n in ARCHIVOS:
        p = os.path.join(data, n + ".json")
        if not os.path.exists(p):
            continue
        z = base64.b64encode(gzip.compress(open(p, "rb").read(), 9)).decode()
        partes = [z[i:i + TROZO] for i in range(0, len(z), TROZO)]
        ver = str(int(time.time()))
        for i, t in enumerate(partes):      # primero los trozos, al final el índice que los apunta
            _req(f"{base}/{n}-{ver}-{i}", {"fields": {"z": {"stringValue": t}}}, h, "PATCH")
        viejo = None
        try:
            viejo = _req(f"{base}/{n}", h=h)["fields"]
        except Exception:
            pass
        _req(f"{base}/{n}", {"fields": {"ver": {"stringValue": ver}, "n": {"integerValue": str(len(partes))},
                                        "t": {"stringValue": time.strftime("%Y-%m-%dT%H:%MZ", time.gmtime())}}}, h, "PATCH")
        if viejo:                           # se borran los trozos de la versión anterior
            for i in range(int(viejo["n"]["integerValue"])):
                try:
                    _req(f"{base}/{n}-{viejo['ver']['stringValue']}-{i}", h=h, metodo="DELETE")
                except Exception:
                    pass
        print(f"privado: {n} subido ({len(z):,} bytes en {len(partes)} trozo(s))")


if __name__ == "__main__":
    acc = sys.argv[1] if len(sys.argv) > 1 else ""
    if acc == "cifrar":
        cifrar(sys.argv[2])
    elif acc == "descifrar":
        descifrar(sys.argv[2])
    elif acc == "subir":
        subir()
    else:
        sys.exit(__doc__)
