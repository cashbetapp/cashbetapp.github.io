# CASHBET

Pronósticos de fútbol y NBA calculados por un modelo estadístico, con su acierto medido.

- `web/` — la app (se publica en https://cashbetapp.github.io)
- `robot/` — baja los partidos, calcula los pronósticos y califica los picks
  - `fetch.py` partidos y cuotas · `props.py` líneas de jugadores · `detail.py` estadísticas
  - `model.py` prueba honesta de acierto (elige ajustes) · `predict.py` pronósticos → `data/picks.json`
- Los datos del robot viven en la rama `datos` (no en `main`).
- `.github/workflows/robot.yml` corre todo cada 2 horas y publica la app.

Pronósticos estadísticos: no garantizan resultados. Juego responsable, solo mayores de 18.
