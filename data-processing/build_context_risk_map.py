#!/usr/bin/env python3
"""Build a local, aggregate-only SSP context map for the Ampara study."""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path
from typing import Optional

import pandas as pd


RMSP_CITIES = {
    "S.PAULO", "S.CAETANO DO SUL", "S.BERNARDO DO CAMPO", "S.ANDRE",
    "DIADEMA", "MAUA", "OSASCO", "GUARULHOS", "BARUERI",
}
WEIGHTS = {
    "feminicidio": 10,
    "estupro": 8,
    "lesao_corporal_dolosa": 5,
    "roubo_em_via_publica": 3,
}
PERIODS = ("madrugada", "manha", "tarde", "noite")
WEEKDAYS = ("segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo")
SOURCE_COLUMNS = {
    "DATA_OCORRENCIA_BO", "DESC_PERIODO", "DESCR_PERIODO", "DESCR_SUBTIPOLOCAL", "BAIRRO",
    "LOGRADOURO", "NOME_MUNICIPIO", "CIDADE", "NOME_DELEGACIA", "RUBRICA",
    "NATUREZA_APURADA", "ANO_ESTATISTICA",
}
SOURCE_ALIASES = {
    "ano_estatistica": ("ANO_ESTATISTICA",),
    "data_ocorrencia": ("DATA_OCORRENCIA_BO",),
    "periodo": ("DESC_PERIODO", "DESCR_PERIODO"),
    "subtipo_local": ("DESCR_SUBTIPOLOCAL",),
    "bairro": ("BAIRRO",),
    "logradouro": ("LOGRADOURO",),
    "cidade": ("NOME_MUNICIPIO", "CIDADE"),
    "delegacia": ("NOME_DELEGACIA",),
    "rubrica": ("RUBRICA",),
    "natureza_apurada": ("NATUREZA_APURADA",),
}


def normalize_text(value: object) -> str:
    if pd.isna(value):
        return ""
    decomposed = unicodedata.normalize("NFKD", str(value).strip().casefold())
    plain = "".join(char for char in decomposed if not unicodedata.combining(char))
    return re.sub(r"\s+", " ", plain)


def normalize_period(value: object) -> Optional[str]:
    period = normalize_text(value)
    if not period or "hora incerta" in period:
        return None
    if "madrugada" in period:
        return "madrugada"
    if "manha" in period:
        return "manha"
    if "tarde" in period:
        return "tarde"
    if "noite" in period:
        return "noite"
    return None


def normalize_date(series: pd.Series) -> pd.Series:
    numeric = pd.to_numeric(series, errors="coerce")
    from_excel = pd.to_datetime(numeric, unit="D", origin="1899-12-30", errors="coerce")
    from_text = pd.to_datetime(series, errors="coerce", dayfirst=True)
    return from_excel.fillna(from_text)


def _text_mask(series: pd.Series, term: str) -> pd.Series:
    return series.str.contains(term, regex=False, na=False)


def aggregate_context_cells(records: pd.DataFrame) -> pd.DataFrame:
    """Return in-memory weighted cells before privacy suppression and normalization."""
    required = {
        "ano_estatistica", "data_ocorrencia", "periodo", "subtipo_local", "bairro",
        "delegacia", "cidade", "logradouro", "rubrica", "natureza_apurada",
    }
    missing = required - set(records.columns)
    if missing:
        raise ValueError(f"Colunas ausentes: {', '.join(sorted(missing))}")
    data = records[list(required)].copy()
    data["ano_estatistica"] = pd.to_numeric(data["ano_estatistica"], errors="coerce")
    city = data["cidade"].map(lambda value: normalize_text(value).upper())
    data = data[data.ano_estatistica.between(2022, 2026) & city.isin(RMSP_CITIES)].copy()
    protected = data.logradouro.map(normalize_text).str.contains(
        "vedacao da divulgacao", regex=False, na=False
    )
    data = data[~protected].copy()

    data["data"] = normalize_date(data.data_ocorrencia)
    data["periodo_mapa"] = data.periodo.map(normalize_period)
    data["bairro_mapa"] = data.bairro.map(normalize_text).str.upper()
    rubric = data.rubrica.map(normalize_text)
    nature = data.natureza_apurada.map(normalize_text)
    subtype = data.subtipo_local.map(normalize_text)

    femicide = _text_mask(rubric, "feminic") | _text_mask(nature, "feminic")
    sexual_violence = _text_mask(rubric, "estupr") | _text_mask(nature, "estupr")
    intentional_injury = _text_mask(nature, "lesao corporal dolosa")
    public_robbery = (
        subtype.isin({"via publica"})
        & _text_mask(rubric, "roub")
        & (_text_mask(nature, "roub") | _text_mask(nature, "latroc"))
    )
    threat_candidate = _text_mask(rubric, "ameac") | _text_mask(nature, "ameac")

    data["categoria"] = pd.Series(index=data.index, dtype="object")
    data.loc[public_robbery, "categoria"] = "roubo_em_via_publica"
    data.loc[intentional_injury, "categoria"] = "lesao_corporal_dolosa"
    data.loc[sexual_violence, "categoria"] = "estupro"
    data.loc[femicide, "categoria"] = "feminicidio"
    data["peso"] = data.categoria.map(WEIGHTS)
    data["ddm"] = data.delegacia.map(normalize_text).str.contains("ddm", regex=False)

    usable = data[
        data.categoria.notna()
        & data.peso.notna()
        & data.data.notna()
        & data.periodo_mapa.notna()
        & data.bairro_mapa.ne("")
    ].copy()
    if usable.empty:
        return pd.DataFrame(columns=[
            "municipio", "bairro", "dia_semana", "periodo", "registros_com_peso",
            "registros_ddm", "total_ponderado",
        ])

    usable["municipio_mapa"] = usable.cidade.map(
        lambda value: normalize_text(value).upper()
    )
    usable["dia_semana"] = usable.data.dt.dayofweek.map(dict(enumerate(WEEKDAYS)))
    usable["periodo"] = usable.periodo_mapa
    keys = ["municipio_mapa", "bairro_mapa", "dia_semana", "periodo"]
    cells = usable.groupby(keys, as_index=False).agg(
        registros_com_peso=("peso", "size"),
        registros_ddm=("ddm", "sum"),
        total_ponderado=("peso", "sum"),
    )
    cells = cells.rename(columns={
        "municipio_mapa": "municipio", "bairro_mapa": "bairro",
    })
    cells["total_ponderado"] = cells.total_ponderado.astype(int)
    return cells


def finalize_context_map(cells: pd.DataFrame, minimum_cell_records: int = 5) -> pd.DataFrame:
    """Suppress small cells, normalize weighted totals, and apply percentile bands."""
    if minimum_cell_records < 5:
        raise ValueError("O mínimo de publicação precisa ser pelo menos 5 registros")
    output_columns = [
        "municipio", "bairro", "dia_semana", "periodo", "registros_com_peso",
        "registros_ddm", "total_ponderado", "escore_contexto", "nivel_contexto",
        "percentil_33", "percentil_66",
    ]
    if cells.empty:
        return pd.DataFrame(columns=output_columns)
    cells = cells[cells.registros_com_peso >= minimum_cell_records].copy()
    if cells.empty:
        return pd.DataFrame(columns=output_columns)

    maximum = float(cells.total_ponderado.max())
    cells["escore_contexto"] = cells.total_ponderado / maximum
    q33, q66 = cells.escore_contexto.quantile([0.33, 0.66]).tolist()
    cells["nivel_contexto"] = cells.escore_contexto.map(
        lambda value: "baixo" if value < q33 else "medio" if value <= q66 else "alto"
    )
    cells["percentil_33"] = float(q33)
    cells["percentil_66"] = float(q66)
    cells["registros_ddm"] = cells.registros_ddm.map(
        lambda count: int(count) if count >= 5 else "<5 (suprimido)"
    )
    cells["total_ponderado"] = cells.total_ponderado.astype(int)
    return cells[output_columns].sort_values(
        ["municipio", "bairro", "dia_semana", "periodo"]
    ).reset_index(drop=True)


def prepare_context_map(records: pd.DataFrame, minimum_cell_records: int = 5) -> pd.DataFrame:
    """Classify conservative source-label candidates and aggregate safe map cells."""
    return finalize_context_map(aggregate_context_cells(records), minimum_cell_records)


def iter_source_record_frames(input_dir: Path):
    """Read one workbook sheet at a time so full SSP years are not held in memory."""
    found = False
    for path in sorted(input_dir.glob("ssp_sp_dados_criminais_*.xlsx")):
        sheets = pd.ExcelFile(path).sheet_names
        for sheet in (name for name in sheets if "campos" not in name.casefold()):
            print(f"Lendo {path.name}, aba {sheet}", flush=True)
            frame = pd.read_excel(
                path,
                sheet_name=sheet,
                dtype=object,
                usecols=lambda column: column in SOURCE_COLUMNS,
            )
            if not any(alias in frame for alias in SOURCE_ALIASES["ano_estatistica"]):
                raise ValueError(f"ANO_ESTATISTICA ausente em {path.name} / {sheet}")
            normalized = pd.DataFrame(index=frame.index)
            for target, aliases in SOURCE_ALIASES.items():
                source = next((alias for alias in aliases if alias in frame.columns), None)
                normalized[target] = frame[source] if source else None
            for column in ("tipo_local",):
                if column not in frame:
                    normalized[column] = None
            found = True
            yield normalized
    if not found:
        raise FileNotFoundError(f"Nenhuma planilha SSP encontrada em {input_dir}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, default=Path("data/raw/ssp"))
    parser.add_argument(
        "--output", type=Path, default=Path("data/processed/context_risk_map.csv")
    )
    parser.add_argument("--minimum-cell-records", type=int, default=5)
    args = parser.parse_args()

    partials = []
    for source in iter_source_record_frames(args.input_dir):
        aggregated = aggregate_context_cells(source)
        if not aggregated.empty:
            partials.append(aggregated)
        del source
    if partials:
        keys = ["municipio", "bairro", "dia_semana", "periodo"]
        combined = pd.concat(partials, ignore_index=True).groupby(keys, as_index=False).agg(
            registros_com_peso=("registros_com_peso", "sum"),
            registros_ddm=("registros_ddm", "sum"),
            total_ponderado=("total_ponderado", "sum"),
        )
    else:
        combined = pd.DataFrame(columns=[
            "municipio", "bairro", "dia_semana", "periodo", "registros_com_peso",
            "registros_ddm", "total_ponderado",
        ])
    result = finalize_context_map(combined, args.minimum_cell_records)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    result.to_csv(args.output, index=False)
    published_cities = sorted(result.municipio.unique().tolist())
    cities_without_cells = sorted(RMSP_CITIES - set(published_cities))
    print(json.dumps({
        "municipios_no_recorte": 9,
        "municipios_com_celulas_publicaveis": published_cities,
        "municipios_sem_celulas_publicaveis": cities_without_cells,
        "linhas_agregadas_publicadas": len(result),
        "minimo_por_celula": args.minimum_cell_records,
        "pesos_exemplificados_pelo_orientador": WEIGHTS,
        "periodos": list(PERIODS),
        "dias_da_semana": list(WEEKDAYS),
        "limites": [
            "Prévia exploratória, limitada aos nove municípios e às planilhas locais disponíveis.",
            "Município sem célula publicada tem contexto indisponível, não risco baixo.",
            "Somente períodos informados pela SSP; período ausente/incerto não é inferido.",
            "Ameaça fica fora do peso; DDM é indicador separado e suprimido abaixo de cinco.",
            "Pesos são exemplos do orientador e ainda precisam de validação metodológica.",
            "A exportação contém apenas agregados, sem coordenadas, endereços ou identificadores.",
        ],
        "arquivo": str(args.output),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
