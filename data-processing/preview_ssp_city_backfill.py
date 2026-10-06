#!/usr/bin/env python3
"""Read-only preview of eligible SSP rows for a municipality already missing in Supabase."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from importar_ssp_supabase import (
    RAW_DIR,
    TARGET_TABLE,
    CIDADES_RMSP,
    database_config,
    data_sheet_names,
    load_dotenv,
    processar_aba_ssp,
)

try:
    import psycopg2
except ImportError as exc:
    raise SystemExit("Instale as dependências de data-processing antes de continuar.") from exc


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def source_counts(files: list[Path], city: str) -> pd.DataFrame:
    frames = []
    for path in files:
        for sheet in data_sheet_names(path):
            eligible = processar_aba_ssp(path, sheet)
            eligible = eligible[eligible["cidade"] == city]
            frames.append(
                eligible.groupby(["ano_estatistica", "mes_estatistica"], dropna=True)
                .size()
                .rename("registros_elegiveis_na_fonte")
                .reset_index()
            )
    if not frames:
        return pd.DataFrame(columns=["ano_estatistica", "mes_estatistica", "registros_elegiveis_na_fonte"])
    return pd.concat(frames, ignore_index=True).groupby(
        ["ano_estatistica", "mes_estatistica"], as_index=False
    )["registros_elegiveis_na_fonte"].sum()


def database_counts(conn, city: str) -> pd.DataFrame:
    with conn.cursor() as cur:
        cur.execute(
            f"""
            select ano_estatistica, mes_estatistica, count(*)
            from {TARGET_TABLE}
            where cidade = %s
            group by ano_estatistica, mes_estatistica
            """,
            (city,),
        )
        rows = cur.fetchall()
    return pd.DataFrame(rows, columns=["ano_estatistica", "mes_estatistica", "registros_ja_no_banco"])


def main() -> int:
    parser = argparse.ArgumentParser(description="Gera uma prévia somente de leitura para cidade ausente na SSP.")
    parser.add_argument("--cidade", default="S.ANDRE", choices=CIDADES_RMSP)
    parser.add_argument("--anos", nargs="+", type=int, required=True)
    parser.add_argument("--skip-download", action="store_true", help="Usa somente arquivos já existentes.")
    args = parser.parse_args()

    if args.skip_download:
        files = [path for year in args.anos for path in sorted(RAW_DIR.glob(f"*{year}.xlsx"))]
        if not files:
            raise SystemExit("Nenhum arquivo SSP local encontrado para os anos pedidos.")
    else:
        from baixar_ssp import baixar_anos

        files = baixar_anos(args.anos)

    load_dotenv(PROJECT_ROOT / ".env")
    config = database_config()
    conn = psycopg2.connect(**config) if isinstance(config, dict) else psycopg2.connect(config)
    try:
        conn.set_session(readonly=True, autocommit=True)
        preview = source_counts(files, args.cidade).merge(
            database_counts(conn, args.cidade),
            on=["ano_estatistica", "mes_estatistica"],
            how="outer",
        ).fillna(0)
    finally:
        conn.close()

    preview = preview.sort_values(["ano_estatistica", "mes_estatistica"])
    print(json.dumps(preview.to_dict(orient="records"), ensure_ascii=False, indent=2))
    print("SOMENTE LEITURA: nenhum dado foi inserido, atualizado ou apagado.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
