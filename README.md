# CASHBET

Pronósticos de fútbol y NBA calculados por un modelo estadístico, con su acierto medido.
Regla fundamental: si no hay una oportunidad estadísticamente demostrable, no se publica ninguna apuesta.

- `web/` — la app (se publica en https://cashbetapp.github.io)
- `robot/` — baja los partidos, calcula los pronósticos y califica los picks
  - `fetch.py` partidos y cuotas · `props.py` líneas de jugadores · `detail.py` estadísticas
  - `model.py` prueba honesta de acierto (elige ajustes) · `predict.py` pronósticos → `data/picks.json`
  - `evaluar.py` validación del objetivo 70 % con el registro real (intervalo de Wilson 95 %, 100+ picks):
    decide qué tipos de pick se muestran ("validado" / "en prueba"); los demás se registran pero quedan ocultos
  - `odds.py` Odds Intelligence: compara casas (The Odds API, secreto `ODDS_API_KEY`), quita el margen,
    EV, arbitraje, movimientos y CLV → `data/odds.json` (panel `web/odds.js`, ruta `#odds`)
  - `comparar.py` comparación de modelos fuera de muestra (se queda Poisson + Dixon-Coles)
  - `registro.py` / `verificar.py` registro sellado con SHA-256: nada se edita ni se borra
- Los datos del robot viven en la rama `datos` (no en `main`); los sellos en la rama `sellos`.
- `.github/workflows/robot.yml` corre todo y publica la app. `reloj.yml` lo lanza cada hora
  (el horario cron de GitHub casi no se cumple en este repositorio).

Pronósticos estadísticos: no garantizan resultados. Juego responsable, solo mayores de 18.
