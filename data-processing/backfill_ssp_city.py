#!/usr/bin/env python3
"""Safely add one missing SSP municipality without replacing existing months."""

from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path

import pandas as pd
import psycopg2

from baixar_ssp import baixar_anos
from importar_ssp_supabase import (
    IMPORT_TABLE,
    RAW_DIR,
    TARGET_COLUMNS,
    TARGET_TABLE,
    database_config,
    data_sheet_names,
    load_dotenv,
    processar_aba_ssp,
)


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BASE_NAME = "Dados criminais"
CIDADES_RMSP = (
    "BARUERI",
    "DIADEMA",
    "GUARULHOS",
    "MAUA",
    "OSASCO",
    "S.ANDRE",
    "S.BERNARDO DO CAMPO",
    "S.CAETANO DO SUL",
    "S.PAULO",
)


def load_city_rows(files: list[Path], city: str) -> pd.DataFrame:
    frames = []
    for path in files:
        for sheet in data_sheet_names(path):
            df = processar_aba_ssp(path, sheet)
            df = df[df["cidade"] == city]
            df = df.dropna(subset=["ano_estatistica", "mes_estatistica"])
            frames.append(df)
    if not frames:
        return pd.DataFrame(columns=TARGET_COLUMNS)
    result = pd.concat(frames, ignore_index=True)
    result["ano_estatistica"] = result["ano_estatistica"].astype(int)
    result["mes_estatistica"] = result["mes_estatistica"].astype(int)
    return result


def source_counts(rows: pd.DataFrame) -> dict[tuple[int, int], int]:
    return {
        (int(year), int(month)): int(count)
        for (year, month), count in rows.groupby(["ano_estatistica", "mes_estatistica"]).size().items()
    }


def database_state(conn, city: str) -> dict[tuple[int, int], dict[str, int]]:
    with conn.cursor() as cur:
        cur.execute(
            f"""
            select ano_estatistica, mes_estatistica, count(*) as total_rows,
                   count(*) filter (where cidade = %s) as city_rows
            from {TARGET_TABLE}
            where ano_estatistica is not null and mes_estatistica is not null
            group by ano_estatistica, mes_estatistica
            """,
            (city,),
        )
        table_rows = cur.fetchall()
        cur.execute(
            f"""
            select ano_estatistica, mes_estatistica, row_count
            from {IMPORT_TABLE}
            where base = %s
            """,
            (BASE_NAME,),
        )
        import_rows = cur.fetchall()

    imports = {(int(year), int(month)): int(count) for year, month, count in import_rows}
    state = {
        (int(year), int(month)): {
            "total_rows": int(total),
            "city_rows": int(city_count),
            "marked_rows": imports.get((int(year), int(month)), -1),
        }
        for year, month, total, city_count in table_rows
    }
    for key, marked in imports.items():
        state.setdefault(key, {"total_rows": 0, "city_rows": 0, "marked_rows": marked})
    return state


def validate_state(expected: dict[tuple[int, int], int], state: dict[tuple[int, int], dict[str, int]]) -> None:
    missing_control = sorted(set(expected) - set(state))
    if missing_control:
        raise RuntimeError(
            "Faltam meses da fonte no controle/tabela do banco: "
            f"{missing_control}. Nada foi gravado."
        )
    for key in sorted(expected):
        month = state[key]
        if month["city_rows"]:
            raise RuntimeError(f"Já existem registros da cidade em {key[0]}-{key[1]:02d}. Nada foi gravado.")
        if month["marked_rows"] != month["total_rows"]:
            raise RuntimeError(
                f"Contagem do controle diverge da tabela em {key[0]}-{key[1]:02d}. Nada foi gravado."
            )


def write_city_rows(conn, rows: pd.DataFrame, expected: dict[tuple[int, int], int]) -> None:
    with conn.cursor() as cur:
        cur.execute(f"lock table {TARGET_TABLE} in share row exclusive mode")
        cur.execute(f"lock table {IMPORT_TABLE} in share row exclusive mode")

    state = database_state(conn, rows["cidade"].iloc[0])
    validate_state(expected, state)

    for key in sorted(expected):
        year, month = key
        month_rows = rows[
            (rows["ano_estatistica"] == year) & (rows["mes_estatistica"] == month)
        ]
        with conn.cursor() as cur:
            with tempfile.NamedTemporaryFile("w+", newline="", encoding="utf-8") as temp:
                month_rows.to_csv(temp, columns=TARGET_COLUMNS, index=False, na_rep="")
                temp.flush()
                temp.seek(0)
                columns = ", ".join(TARGET_COLUMNS)
                cur.copy_expert(
                    f"copy {TARGET_TABLE} ({columns}) from stdin with (format csv, header true)",
                    temp,
                )
            cur.execute(
                f"""
                update {IMPORT_TABLE}
                set row_count = row_count + %s, imported_at = now()
                where base = %s and ano_estatistica = %s and mes_estatistica = %s
                """,
                (expected[key], BASE_NAME, year, month),
            )
            if cur.rowcount != 1:
                raise RuntimeError(f"Controle de importação ausente em {year}-{month:02d}.")

    after = database_state(conn, rows["cidade"].iloc[0])
    for key, added in expected.items():
        month = after[key]
        previous = state[key]
        if month["city_rows"] != added or month["total_rows"] != previous["total_rows"] + added:
            raise RuntimeError(f"A validação pós-carga falhou em {key[0]}-{key[1]:02d}; transação revertida.")
        if month["marked_rows"] != month["total_rows"]:
            raise RuntimeError(f"O controle não confere em {key[0]}-{key[1]:02d}; transação revertida.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Completa uma cidade ausente sem substituir meses existentes.")
    parser.add_argument("--cidade", default="S.ANDRE", choices=CIDADES_RMSP)
    parser.add_argument("--anos", nargs="+", type=int, required=True)
    parser.add_argument("--skip-download", action="store_true", help="Usa arquivos já existentes.")
    parser.add_argument("--confirmar", action="store_true", help="Grava apenas após todas as verificações passarem.")
    args = parser.parse_args()

    if args.skip_download:
        files = [path for year in args.anos for path in sorted(RAW_DIR.glob(f"*{year}.xlsx"))]
        if not files:
            raise SystemExit("Nenhum arquivo SSP local encontrado para os anos pedidos.")
    else:
        files = baixar_anos(args.anos)

    rows = load_city_rows(files, args.cidade)
    expected = source_counts(rows)
    if not expected:
        raise SystemExit("A fonte não tem registros elegíveis para os critérios informados.")

    load_dotenv(PROJECT_ROOT / ".env")
    config = database_config()
    conn = psycopg2.connect(**config) if isinstance(config, dict) else psycopg2.connect(config)
    try:
        conn.set_session(readonly=not args.confirmar, autocommit=False)
        if args.confirmar:
            write_city_rows(conn, rows, expected)
            conn.commit()
        else:
            validate_state(expected, database_state(conn, args.cidade))
            conn.rollback()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    summary = [
        {"ano_estatistica": year, "mes_estatistica": month, "registros_a_adicionar": count}
        for (year, month), count in sorted(expected.items())
    ]
    print(json.dumps({"cidade": args.cidade, "meses": len(summary), "total": len(rows), "por_mes": summary}, ensure_ascii=False, indent=2))
    if args.confirmar:
        print("Backfill concluído; contagens da tabela e do controle verificadas.")
    else:
        print("PRÉVIA: nenhum dado foi alterado. Acrescente --confirmar somente após revisar estas contagens.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
