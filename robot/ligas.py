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

# 2026-11-12: el usuario NO quiere estas ligas (solo las principales del mundo + Colombia y México).
# Quedan apagadas aquí; para volver a encenderlas, cambiar DESACTIVADAS por NUEVAS.
DESACTIVADAS = {
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
# 2026-11-12: selecciones (pedido del usuario: fecha FIFA y amistosos de los países más conocidos).
# Una sola "liga" con todas las competencias de selecciones, porque cada selección juega pocas veces al año
# y su historial está repartido entre amistosos, Nations League, eliminatorias y Mundial.
NUEVAS = {"intl": "Selecciones"}
INTL = ["fifa.friendly", "uefa.nations", "concacaf.nations.league", "fifa.world", "fifa.worldq.uefa", "fifa.worldq.conmebol",
        "fifa.worldq.concacaf", "fifa.worldq.afc", "fifa.worldq.caf", "conmebol.america", "concacaf.gold", "uefa.euro"]
DESDE_INTL = "2025-06-01"
# Solo se pronostican partidos entre selecciones conocidas (las dos). El resto se guarda para el historial.
SELECCIONES = {
    "Argentina", "Brazil", "Uruguay", "Colombia", "Ecuador", "Paraguay", "Chile", "Peru", "Venezuela", "Bolivia",
    "Mexico", "United States", "Canada", "Costa Rica", "Panama", "Jamaica", "Honduras",
    "Spain", "France", "England", "Germany", "Portugal", "Netherlands", "Italy", "Belgium", "Croatia", "Switzerland",
    "Denmark", "Austria", "Serbia", "Poland", "Türkiye", "Norway", "Sweden", "Scotland", "Ukraine", "Czechia", "Greece",
    "Hungary", "Wales", "Republic of Ireland", "Slovakia", "Slovenia", "Romania",
    "Japan", "South Korea", "Australia", "Morocco", "Senegal", "Egypt", "Nigeria", "Ivory Coast", "Saudi Arabia", "Iran",
    "Qatar", "Algeria", "Tunisia", "Ghana", "Cameroon",
}


def publicable(key, g):
    """En selecciones solo se pronostica si las dos son conocidas; en las ligas, todo."""
    if key != "intl":
        return True
    if g.get("comp") == "uefa.nations":            # Nations League: todos sus partidos (pedido del usuario)
        return True
    return all(((g.get(s) or {}).get("fn") or (g.get(s) or {}).get("n")) in SELECCIONES for s in ("h", "a"))
SUFIJO = " · liga nueva"
DESDE = "2025-08-01"          # historial que se baja la primera vez (igual que las ligas actuales)
import os
NUEVAS_POR_CORRIDA = int(os.environ.get("CASHBET_NUEVAS_POR_CORRIDA", 3))   # 3 ligas nuevas por corrida (sin sobrecargar)


def es_nueva(lg):
    return lg in NUEVAS
