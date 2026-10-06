#!/usr/bin/env python3
"""Summarize SSP input coverage for the Ampara risk-model work.

The report intentionally contains aggregate counts only. It never prints or
writes occurrence addresses, coordinates, report numbers, or personal data.
"""

from __future__ import annotations

import argparse
import json
import unicodedata
from pathlib import Path

import pandas as pd

from derive_ssp_period import resolve_ssp_period


DEFAULT_INPUT = Path(__file__).with_name("ssp.csv")


def normalized(series: pd.Series) -> pd.Series:
    def clean(value: object) -> str:
        if pd.isna(value):
            return ""
        decomposed = unicodedata.normalize("NFKD", str(value))
        return "".join(char for char in decomposed if not unicodedata.combining(char)).strip().upper()

    return series.map(clean)


def build_report(path: Path) -> dict[str, object]:
    data = pd.read_csv(path, sep=";", encoding="utf-8-sig", low_memory=False)
    required = {
        "ANO_ESTATISTICA", "MES_ESTATISTICA", "DATA_OCORRENCIA_BO",
        "DESC_PERIODO", "HORA_OCORRENCIA_BO", "DESCR_TIPOLOCAL", "NOME_MUNICIPIO", "BAIRRO",
        "LOGRADOURO", "LATITUDE", "LONGITUDE", "NOME_DELEGACIA",
        "RUBRICA", "NATUREZA_APURADA",
    }
    missing = sorted(required - set(data.columns))
    if missing:
        raise ValueError(f"Colunas SSP ausentes: {', '.join(missing)}")

    rubric = normalized(data["RUBRICA"])
    nature = normalized(data["NATUREZA_APURADA"])
    place_type = normalized(data["DESCR_TIPOLOCAL"])
    station = normalized(data["NOME_DELEGACIA"])
    period = normalized(data["DESC_PERIODO"])
    municipality = normalized(data["NOME_MUNICIPIO"])
    street = normalized(data["LOGRADOURO"])

    target_masks = {
        "feminicidio": rubric.str.contains("FEMINICID", regex=False) | nature.str.contains("FEMINICID", regex=False),
        "estupro": rubric.str.contains("ESTUPRO", regex=False) | nature.str.contains("ESTUPRO", regex=False),
        "lesao_corporal_dolosa": nature.eq("LESAO CORPORAL DOLOSA"),
        "ameaca": rubric.str.contains("AMEACA", regex=False) | nature.str.contains("AMEACA", regex=False),
        "roubo_em_via_publica": (
            (rubric.str.contains("ROUBO", regex=False) | nature.str.contains("ROUBO", regex=False))
            & place_type.eq("VIA PUBLICA")
        ),
    }

    month_counts = (
        data.groupby(["ANO_ESTATISTICA", "MES_ESTATISTICA"], dropna=False)
        .size()
        .sort_index()
    )
    coordinates = data["LATITUDE"].astype("string").str.replace(",", ".", regex=False)
    longitudes = data["LONGITUDE"].astype("string").str.replace(",", ".", regex=False)
    latitude = pd.to_numeric(coordinates, errors="coerce")
    longitude = pd.to_numeric(longitudes, errors="coerce")
    coordinate_pair_valid = latitude.notna() & longitude.notna() & latitude.ne(0) & longitude.ne(0)
    resolved_periods = [
        resolve_ssp_period(period_value, hour_value)
        for period_value, hour_value in zip(data["DESC_PERIODO"], data["HORA_OCORRENCIA_BO"])
    ]
    period_audit = pd.DataFrame({
        "year": data["ANO_ESTATISTICA"],
        "month": data["MES_ESTATISTICA"],
        "period": [period or "(desconhecido)" for period, _ in resolved_periods],
        "provenance": [provenance for _, provenance in resolved_periods],
    })
    period_resolution_by_month = [
        {
            "year": int(year),
            "month": int(month),
            "period": str(period),
            "provenance": str(provenance),
            "rows": int(count),
        }
        for (year, month, period, provenance), count in period_audit
        .dropna(subset=["year", "month"])
        .groupby(["year", "month", "period", "provenance"], dropna=False)
        .size()
        .items()
    ]

    return {
        "source_file": path.name,
        "total_rows": int(len(data)),
        "statistics_months": [
            {"year": int(year), "month": int(month), "rows": int(count)}
            for (year, month), count in month_counts.items()
            if pd.notna(year) and pd.notna(month)
        ],
        "municipality_count": int(municipality.replace("", pd.NA).nunique()),
        "period_counts": {str(key) if key else "(missing)": int(value) for key, value in period.value_counts(dropna=False).items()},
        "period_resolution_by_month": period_resolution_by_month,
        "missing_or_invalid": {
            "neighborhood": int(normalized(data["BAIRRO"]).eq("").sum()),
            "period": int(period.eq("").sum()),
            "coordinate_pair": int((~coordinate_pair_valid).sum()),
            "protected_location_marker": int(street.str.contains("VEDACAO DA DIVULGACAO", regex=False).sum()),
        },
        "target_category_counts": {name: int(mask.sum()) for name, mask in target_masks.items()},
        "ddm_rows": int(station.str.contains("DDM", regex=False).sum()),
        "ddm_target_category_counts": {
            name: int((mask & station.str.contains("DDM", regex=False)).sum())
            for name, mask in target_masks.items()
        },
        "notes": [
            "Counts describe this file only; they are not a complete crime-rate denominator.",
            "The target filters are an audit aid and need methodological review before production scoring.",
            "This report does not expose occurrence-level locations or identifiers.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="SSP CSV with semicolon separators")
    args = parser.parse_args()
    print(json.dumps(build_report(args.input), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
