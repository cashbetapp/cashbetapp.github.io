"""Verificador público del registro de CASHBET.

Uso:  python verificar.py ledger.json [sellos.txt]

1) Recalcula desde cero la cadena de huellas SHA-256 de todos los picks y sus
   resultados. Si alguien cambió un pick o un resultado viejo, falla.
2) Si se pasa sellos.txt (rama "sellos" del repositorio), comprueba que cada huella
   sellada en el pasado coincide con la cadena de hoy: el pasado no se reescribió.
   Cada huella diaria además está anclada en Bitcoin con OpenTimestamps (archivos .ots).
"""
import json, sys
import registro as R


def main():
    L = json.load(open(sys.argv[1], encoding="utf-8"))
    cab = []
    ok, n, h, err = R.verificar(L, cab)
    print(f"Eventos en la cadena: {n}\nHuella final: {h}")
    if not ok:
        print("ERROR:", "; ".join(err))
        sys.exit(1)
    print("Cadena íntegra: ningún pick ni resultado fue modificado.")
    if len(sys.argv) > 2:
        malos = 0
        lineas = [l.split() for l in open(sys.argv[2], encoding="utf-8") if l.strip() and not l.startswith("#")]
        for t, nn, hh in ((l[0], int(l[1]), l[2]) for l in lineas):
            if nn > len(cab) or cab[nn - 1] != hh:
                malos += 1
                print(f"SELLO NO COINCIDE: {t} (evento {nn})")
        print(f"Sellos revisados: {len(lineas)}, sin coincidir: {malos}")
        sys.exit(1 if malos else 0)


if __name__ == "__main__":
    main()
