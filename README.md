# Sellos del registro de CASHBET

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
