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

from derive_ssp_period import resolve_ssp_period


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
MINIMUM_CELL_RECORDS = 5
SOURCE_COLUMNS = {
    "DESC_PERIODO", "DESCR_PERIODO", "HORA_OCORRENCIA_BO", "DESCR_SUBTIPOLOCAL", "BAIRRO",
    "LOGRADOURO", "NOME_MUNICIPIO", "CIDADE", "NOME_DELEGACIA", "RUBRICA",
    "NATUREZA_APURADA", "ANO_ESTATISTICA",
}
SOURCE_ALIASES = {
    "ano_estatistica": ("ANO_ESTATISTICA",),
    "periodo": ("DESC_PERIODO", "DESCR_PERIODO"),
    "hora_ocorrencia": ("HORA_OCORRENCIA_BO",),
    "subtipo_local": ("DESCR_SUBTIPOLOCAL",),
    "bairro": ("BAIRRO",),
    "logradouro": ("LOGRADOURO",),
    "cidade": ("NOME_MUNICIPIO", "CIDADE"),
    "delegacia": ("NOME_DELEGACIA",),
    "rubrica": ("RUBRICA",),
    "natureza_apurada": ("NATUREZA_APURADA",),
}
# Contagens somadas por célula, antes da supressão. Somar é seguro entre planilhas.
COUNT_COLUMNS = [
    "registros_com_peso", "registros_periodo_informado", "registros_periodo_derivado",
    "registros_ddm", "total_ponderado",
]
RAW_KEYS = ["municipio", "bairro", "periodo"]
NEIGHBORHOOD_COLUMNS = [
    "municipio", "bairro", "periodo", "registros_com_peso", "registros_periodo_informado",
    "registros_periodo_derivado", "registros_ddm", "total_ponderado", "escore_contexto",
    "nivel_contexto", "percentil_33", "percentil_66",
]
CITY_COLUMNS = [
    "municipio", "periodo", "registros_com_peso", "registros_periodo_informado",
    "registros_periodo_derivado", "registros_ddm", "total_ponderado", "bairros_com_registro",
    "total_medio_por_bairro", "escore_contexto", "nivel_contexto", "percentil_33", "percentil_66",
]


def normalize_text(value: object) -> str:
    if pd.isna(value):
        return ""
    decomposed = unicodedata.normalize("NFKD", str(value).strip().casefold())
    plain = "".join(char for char in decomposed if not unicodedata.combining(char))
    return re.sub(r"\s+", " ", plain)


def map_period(period_label: object, occurrence_time: object) -> tuple[Optional[str], str]:
    """Período do mapa e proveniência (informado / derivado_da_hora / descartado).

    Usa resolve_ssp_period: rótulo vazio com hora válida vira o período da hora;
    "em hora incerta", rótulo desconhecido e hora ausente continuam fora.
    """
    if isinstance(occurrence_time, float) and pd.isna(occurrence_time):
        occurrence_time = None
    period, provenance = resolve_ssp_period(period_label, occurrence_time)
    if period is None:
        return None, provenance
    return normalize_text(period), provenance


def _text_mask(series: pd.Series, term: str) -> pd.Series:
    return series.str.contains(term, regex=False, na=False)


def _empty_raw_cells() -> pd.DataFrame:
    return pd.DataFrame(columns=RAW_KEYS + COUNT_COLUMNS)


def aggregate_context_cells(records: pd.DataFrame) -> pd.DataFrame:
    """Células município × bairro × período, ainda sem supressão nem normalização.

    Registros sem bairro entram com bairro "" — não vão para o mapa de bairros, mas
    contam na reserva da cidade.
    """
    required = {
        "ano_estatistica", "periodo", "subtipo_local", "bairro",
        "delegacia", "cidade", "logradouro", "rubrica", "natureza_apurada",
    }
    missing = required - set(records.columns)
    if missing:
        raise ValueError(f"Colunas ausentes: {', '.join(sorted(missing))}")
    data = records[list(required)].copy()
    data["hora_ocorrencia"] = records["hora_ocorrencia"] if "hora_ocorrencia" in records else None
    data["ano_estatistica"] = pd.to_numeric(data["ano_estatistica"], errors="coerce")
    city = data["cidade"].map(lambda value: normalize_text(value).upper())
    data = data[data.ano_estatistica.between(2022, 2026) & city.isin(RMSP_CITIES)].copy()
    protected = data.logradouro.map(normalize_text).str.contains(
        "vedacao da divulgacao", regex=False, na=False
    )
    data = data[~protected].copy()
    if data.empty:
        return _empty_raw_cells()

    resolved = [map_period(label, hour) for label, hour in zip(data.periodo, data.hora_ocorrencia)]
    data["periodo_mapa"] = [period for period, _ in resolved]
    data["proveniencia"] = [provenance for _, provenance in resolved]
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

    data["categoria"] = pd.Series(index=data.index, dtype="object")
    data.loc[public_robbery, "categoria"] = "roubo_em_via_publica"
    data.loc[intentional_injury, "categoria"] = "lesao_corporal_dolosa"
    data.loc[sexual_violence, "categoria"] = "estupro"
    data.loc[femicide, "categoria"] = "feminicidio"
    data["peso"] = data.categoria.map(WEIGHTS)
    data["ddm"] = data.delegacia.map(normalize_text).str.contains("ddm", regex=False)

    usable = data[data.categoria.notna() & data.peso.notna() & data.periodo_mapa.notna()].copy()
    if usable.empty:
        return _empty_raw_cells()

    usable["municipio"] = usable.cidade.map(lambda value: normalize_text(value).upper())
    usable["bairro"] = usable.bairro_mapa
    usable["periodo"] = usable.periodo_mapa
    usable["informado"] = usable.proveniencia.eq("informado")
    usable["derivado"] = usable.proveniencia.eq("derivado_da_hora")
    cells = usable.groupby(RAW_KEYS, as_index=False).agg(
        registros_com_peso=("peso", "size"),
        registros_periodo_informado=("informado", "sum"),
        registros_periodo_derivado=("derivado", "sum"),
        registros_ddm=("ddm", "sum"),
        total_ponderado=("peso", "sum"),
    )
    for column in COUNT_COLUMNS:
        cells[column] = cells[column].astype(int)
    return cells


def combine_cells(partials: list[pd.DataFrame]) -> pd.DataFrame:
    partials = [part for part in partials if not part.empty]
    if not partials:
        return _empty_raw_cells()
    combined = pd.concat(partials, ignore_index=True)
    return combined.groupby(RAW_KEYS, as_index=False)[COUNT_COLUMNS].sum()


def _band(value: float, q33: float, q66: float) -> str:
    return "baixo" if value < q33 else "medio" if value <= q66 else "alto"


def _suppress_ddm(series: pd.Series) -> pd.Series:
    return series.map(lambda count: int(count) if count >= 5 else "<5 (suprimido)")


def finalize_context_map(cells: pd.DataFrame, minimum_cell_records: int = MINIMUM_CELL_RECORDS) -> pd.DataFrame:
    """Mapa de bairros: suprime células pequenas, normaliza pelo máximo e aplica p33/p66."""
    if minimum_cell_records < 5:
        raise ValueError("O mínimo de publicação precisa ser pelo menos 5 registros")
    cells = cells[(cells.bairro != "") & (cells.registros_com_peso >= minimum_cell_records)].copy()
    if cells.empty:
        return pd.DataFrame(columns=NEIGHBORHOOD_COLUMNS)

    maximum = float(cells.total_ponderado.max())
    cells["escore_contexto"] = cells.total_ponderado / maximum
    q33, q66 = cells.escore_contexto.quantile([0.33, 0.66]).tolist()
    cells["nivel_contexto"] = cells.escore_contexto.map(lambda value: _band(value, q33, q66))
    cells["percentil_33"] = float(q33)
    cells["percentil_66"] = float(q66)
    cells["registros_ddm"] = _suppress_ddm(cells.registros_ddm)
    return cells[NEIGHBORHOOD_COLUMNS].sort_values(RAW_KEYS).reset_index(drop=True)


def finalize_city_fallback(
    cells: pd.DataFrame,
    neighborhood_map: pd.DataFrame,
    minimum_cell_records: int = MINIMUM_CELL_RECORDS,
) -> pd.DataFrame:
    """Reserva município × período, para bairro sem célula publicada.

    Total da cidade dividido pelos bairros com algum registro no período ("bairro
    típico"), na mesma régua do mapa de bairros: dividido pelo mesmo máximo e cortado
    pelos mesmos p33/p66. Assim a faixa da cidade se compara com a de um bairro, e São
    Paulo não fica "alto" só por ser maior. Registros sem bairro contam no total.
    """
    if minimum_cell_records < 5:
        raise ValueError("O mínimo de publicação precisa ser pelo menos 5 registros")
    if cells.empty or neighborhood_map.empty:
        return pd.DataFrame(columns=CITY_COLUMNS)
    city = cells.groupby(["municipio", "periodo"], as_index=False)[COUNT_COLUMNS].sum()
    neighborhoods = (
        cells[cells.bairro != ""].groupby(["municipio", "periodo"]).bairro.nunique()
        .rename("bairros_com_registro").reset_index()
    )
    city = city.merge(neighborhoods, on=["municipio", "periodo"], how="left")
    city["bairros_com_registro"] = city.bairros_com_registro.fillna(0).astype(int)
    city = city[(city.registros_com_peso >= minimum_cell_records) & (city.bairros_com_registro > 0)].copy()
    if city.empty:
        return pd.DataFrame(columns=CITY_COLUMNS)

    maximum = float(neighborhood_map.total_ponderado.max())
    q33 = float(neighborhood_map.percentil_33.iloc[0])
    q66 = float(neighborhood_map.percentil_66.iloc[0])
    city["total_medio_por_bairro"] = city.total_ponderado / city.bairros_com_registro
    city["escore_contexto"] = (city.total_medio_por_bairro / maximum).clip(upper=1.0)
    city["nivel_contexto"] = city.escore_contexto.map(lambda value: _band(value, q33, q66))
    city["percentil_33"] = q33
    city["percentil_66"] = q66
    city["registros_ddm"] = _suppress_ddm(city.registros_ddm)
    return city[CITY_COLUMNS].sort_values(["municipio", "periodo"]).reset_index(drop=True)


def prepare_context_map(records: pd.DataFrame, minimum_cell_records: int = MINIMUM_CELL_RECORDS) -> pd.DataFrame:
    """Classifica os registros e devolve o mapa de bairros publicável."""
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
    parser.add_argument(
        "--city-output", type=Path, default=Path("data/processed/context_risk_map_cidade.csv")
    )
    parser.add_argument(
        "--raw-cells-output", type=Path, default=None,
        help="Opcional, só para diagnóstico local: células antes da supressão. Não publicar.",
    )
    parser.add_argument("--minimum-cell-records", type=int, default=MINIMUM_CELL_RECORDS)
    args = parser.parse_args()

    partials = [aggregate_context_cells(source) for source in iter_source_record_frames(args.input_dir)]
    combined = combine_cells(partials)
    if args.raw_cells_output:
        combined.to_csv(args.raw_cells_output, index=False)
    result = finalize_context_map(combined, args.minimum_cell_records)
    city = finalize_city_fallback(combined, result, args.minimum_cell_records)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    result.to_csv(args.output, index=False)
    city.to_csv(args.city_output, index=False)
    print(json.dumps({
        "municipios_no_recorte": len(RMSP_CITIES),
        "celulas_de_bairro_por_municipio": result.municipio.value_counts().sort_index().to_dict(),
        "celulas_da_cidade_por_municipio": city.municipio.value_counts().sort_index().to_dict(),
        "registros_com_peso_por_proveniencia": {
            "informado": int(combined.registros_periodo_informado.sum()),
            "derivado_da_hora": int(combined.registros_periodo_derivado.sum()),
        },
        "minimo_por_celula": args.minimum_cell_records,
        "pesos_exemplificados_pelo_orientador": WEIGHTS,
        "periodos": list(PERIODS),
        "limites": [
            "Agrupamento município × bairro × período, como na orientação (sem dia da semana).",
            "Período vazio é derivado da hora exata (derive_ssp_period.py); 'em hora incerta' fica fora.",
            "Bairro sem célula usa a reserva da cidade (bairro típico); município sem reserva é indisponível.",
            "Ameaça fica fora: a base pública da SSP praticamente não traz esse registro (limitação da fonte).",
            "DDM é indicador separado e suprimido abaixo de cinco.",
            "Pesos são exemplos do orientador e ainda precisam de validação metodológica.",
            "A exportação contém apenas agregados, sem coordenadas, endereços ou identificadores.",
        ],
        "arquivos": [str(args.output), str(args.city_output)],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
