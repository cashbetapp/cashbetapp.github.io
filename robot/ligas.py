"""Ligas nuevas de fútbol (ampliación de cobertura, 2026-11-12).

- Fuente: ESPN (gratis). Todas traen córners, tiros, tiros a puerta, faltas, tarjetas
  y estadísticas de jugadores (comprobado el 2026-11-12).
- NO entran al entrenamiento de los modelos (que sigue con las 8 ligas de siempre):
  solo se pronostican con los mismos ajustes, así las probabilidades de las ligas
  actuales no cambian.
- Sus picks son EXPERIMENTALES: se registran en el registro sellado como un mercado
  aparte ("Córners (equipo) · liga nueva", etc.) y solo pueden mostrarse cuando ese
  mercado cumpla las mismas reglas de validación que todos (no se mezclan sus
  estadísticas con las de las ligas actuales).
- Sin cuotas de The Odds API (no alcanzan los créditos gratis): no hay EV para ellas.
"""

NUEVAS = {
    "eng.2": "Championship",
    "esp.2": "LaLiga 2",
    "ita.2": "Serie B",
    "ger.2": "2. Bundesliga",
    "fra.2": "Ligue 2",
    "ned.1": "Eredivisie",
    "por.1": "Liga Portugal",
    "bel.1": "Pro League (Bélgica)",
    "tur.1": "Süper Lig",
    "sco.1": "Premiership (Escocia)",
    "uefa.europa": "Europa League",
    "uefa.europa.conf": "Conference League",
    "bra.1": "Brasileirão",
    "arg.1": "Liga Profesional (Argentina)",
}
SUFIJO = " · liga nueva"
DESDE = "2025-08-01"          # historial que se baja la primera vez (igual que las ligas actuales)
import os
NUEVAS_POR_CORRIDA = int(os.environ.get("CASHBET_NUEVAS_POR_CORRIDA", 14))   # todas de una vez (pedido del usuario: 5 h era mucho; local tardó ~11 min)   # 3 ligas nuevas por corrida (sin sobrecargar)


def es_nueva(lg):
    return lg in NUEVAS
