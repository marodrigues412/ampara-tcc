"""Professor's transparent 3x3 fusion rule for contextual and body signals."""

from __future__ import annotations

from math import isfinite
from typing import Optional


NIVEIS = ("baixo", "medio", "alto")

MATRIZ_FUSAO = {
    ("baixo", "baixo"): "baixo",
    ("baixo", "medio"): "baixo",
    ("baixo", "alto"): "moderado",
    ("medio", "baixo"): "baixo",
    ("medio", "medio"): "moderado",
    ("medio", "alto"): "alto",
    ("alto", "baixo"): "moderado",
    ("alto", "medio"): "alto",
    ("alto", "alto"): "alto",
}


def nivel_por_cortes(
    score: Optional[float],
    limite_baixo: float,
    limite_alto: float,
) -> Optional[str]:
    """Map a [0, 1] score to low/medium/high; missing input remains unavailable."""
    if score is None:
        return None
    value = float(score)
    low = float(limite_baixo)
    high = float(limite_alto)
    if not all(isfinite(item) for item in (value, low, high)):
        raise ValueError("Escore e cortes precisam ser números finitos")
    if not 0 <= value <= 1:
        raise ValueError("O escore precisa estar entre 0 e 1")
    if not 0 <= low <= high <= 1:
        raise ValueError("Os cortes precisam satisfazer 0 <= baixo <= alto <= 1")
    if value < low:
        return "baixo"
    if value <= high:
        return "medio"
    return "alto"


def classificar_risco(
    escore_contexto: Optional[float],
    escore_corporal: Optional[float],
    percentil_33_contexto: float,
    percentil_66_contexto: float,
) -> Optional[str]:
    """Apply the advisor's matrix; never impute a missing layer."""
    nivel_contexto = nivel_por_cortes(
        escore_contexto, percentil_33_contexto, percentil_66_contexto
    )
    nivel_corporal = nivel_por_cortes(escore_corporal, 0.33, 0.66)
    if nivel_contexto is None or nivel_corporal is None:
        return None
    return MATRIZ_FUSAO[(nivel_contexto, nivel_corporal)]
