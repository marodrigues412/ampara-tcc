"""Derive a coarse SSP period from an exact occurrence hour without mutation."""

from __future__ import annotations

import re
import math
import unicodedata
from datetime import time


def _normalized_label(value: object) -> str:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        value = ""
    text = unicodedata.normalize("NFKD", str(value))
    return "".join(char for char in text if not unicodedata.combining(char)).strip().upper()


def _parse_hour(value: object) -> int | None:
    if isinstance(value, time):
        return value.hour
    if value is None or isinstance(value, bool):
        return None

    match = re.fullmatch(
        r"([01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?",
        str(value).strip(),
    )
    return int(match.group(1)) if match else None


def _period_for_hour(hour: int) -> str:
    if hour <= 5:
        return "madrugada"
    if hour <= 11:
        return "manhã"
    if hour <= 17:
        return "tarde"
    return "noite"


def resolve_ssp_period(period_label: object, occurrence_time: object) -> tuple[str | None, str]:
    """Return (coarse period, provenance), preserving uncertainty explicitly.

    The time boundaries match the 24,670 period/hour pairs observed for
    2026-01. A missing source label may be derived from a valid exact hour;
    explicit "hora incerta" and unrecognized non-empty labels are not replaced.
    """
    label = _normalized_label(period_label)
    if "HORA INCERTA" in label:
        return None, "hora_incerta"

    if label:
        if "MADRUGADA" in label:
            return "madrugada", "informado"
        if "MANH" in label:
            return "manhã", "informado"
        if "TARDE" in label:
            return "tarde", "informado"
        if "NOITE" in label:
            return "noite", "informado"
        return None, "rotulo_nao_reconhecido"

    hour = _parse_hour(occurrence_time)
    if hour is None:
        return None, "desconhecido"
    return _period_for_hour(hour), "derivado_da_hora"
