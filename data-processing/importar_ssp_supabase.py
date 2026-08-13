#!/usr/bin/env python3
"""
Importa dados criminais da SSP-SP para public.crime_occurrences no Supabase.

O script é incremental: ele registra os meses importados em
public.ssp_imported_months e, nas próximas execuções, importa apenas meses novos.

Exemplos:
  python data-processing/importar_ssp_supabase.py --anos 2026
  python data-processing/importar_ssp_supabase.py --anos 2026 --replace-existing
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlparse

try:
    import pandas as pd
except ImportError as exc:
    raise SystemExit("Instale as dependências: python3 -m pip install -r data-processing/requirements.txt") from exc

try:
    import psycopg2
except ImportError as exc:
    raise SystemExit("Instale as dependências: python3 -m pip install -r data-processing/requirements.txt") from exc

from baixar_ssp import baixar_anos


PROJECT_ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = PROJECT_ROOT / "data" / "raw" / "ssp"
IMPORT_SQL_PATH = PROJECT_ROOT / "data" / "ssp_importacao.sql"
TARGET_TABLE = "public.crime_occurrences"
IMPORT_TABLE = "public.ssp_imported_months"

CIDADES_RMSP = [
    "S.PAULO",
    "S.CAETANO DO SUL",
    "S.BERNARDO DO CAMPO",
    "SANTO ANDRE",
    "DIADEMA",
    "MAUA",
    "OSASCO",
    "GUARULHOS",
    "BARUERI",
]

COLUMN_ALIASES = {
    "data_ocorrencia": ["DATA_OCORRENCIA_BO"],
    "hora_ocorrencia": ["HORA_OCORRENCIA_BO"],
    "periodo": ["DESC_PERIODO", "DESCR_PERIODO"],
    "tipo_local": ["DESCR_TIPOLOCAL"],
    "subtipo_local": ["DESCR_SUBTIPOLOCAL"],
    "departamento": ["NOME_DEPARTAMENTO"],
    "seccional": ["NOME_SECCIONAL"],
    "delegacia": ["NOME_DELEGACIA"],
    "cidade": ["NOME_MUNICIPIO", "CIDADE"],
    "bairro": ["BAIRRO"],
    "logradouro": ["LOGRADOURO"],
    "numero_logradouro": ["NUMERO_LOGRADOURO"],
    "latitude": ["LATITUDE"],
    "longitude": ["LONGITUDE"],
    "rubrica": ["RUBRICA"],
    "conduta": ["DESCR_CONDUTA"],
    "natureza_apurada": ["NATUREZA_APURADA"],
    "ano_bo": ["ANO_BO"],
    "mes_estatistica": ["MES_ESTATISTICA"],
    "ano_estatistica": ["ANO_ESTATISTICA"],
}

TARGET_COLUMNS = list(COLUMN_ALIASES)
OPTIONAL_COLUMNS = {"tipo_local"}


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return

    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def database_config():
    db_url = os.environ.get("SUPABASE_DB_URL") or os.environ.get("DATABASE_URL")
    if db_url:
        parsed = urlparse(db_url)
        if parsed.password and any(char in parsed.password for char in "@/?:#&=%"):
            raise SystemExit(
                "A senha em SUPABASE_DB_URL contem caracteres especiais. "
                "Use as variaveis separadas SUPABASE_DB_HOST, SUPABASE_DB_USER, "
                "SUPABASE_DB_PASSWORD, SUPABASE_DB_NAME e SUPABASE_DB_PORT."
            )
        return db_url

    required = {
        "host": os.environ.get("SUPABASE_DB_HOST"),
        "user": os.environ.get("SUPABASE_DB_USER"),
        "password": os.environ.get("SUPABASE_DB_PASSWORD"),
        "dbname": os.environ.get("SUPABASE_DB_NAME", "postgres"),
        "port": os.environ.get("SUPABASE_DB_PORT", "5432"),
        "sslmode": os.environ.get("SUPABASE_DB_SSLMODE", "require"),
    }
    missing = [name for name, value in required.items() if name not in {"dbname", "port", "sslmode"} and not value]
    if missing:
        raise SystemExit(
            "Defina SUPABASE_DB_URL ou use as variaveis separadas no .env: "
            "SUPABASE_DB_HOST, SUPABASE_DB_USER e SUPABASE_DB_PASSWORD."
        )
    return required


def data_sheet_names(path: Path) -> list[str]:
    sheets = pd.ExcelFile(path).sheet_names
    data_sheets = [sheet for sheet in sheets if "campos" not in sheet.lower()]
    return data_sheets or [sheets[0]]


def normalize_date(series: pd.Series) -> pd.Series:
    numeric = pd.to_numeric(series, errors="coerce")
    dates_from_serial = pd.to_datetime(numeric, unit="D", origin="1899-12-30", errors="coerce")
    dates_from_text = pd.to_datetime(series, errors="coerce", dayfirst=True)
    result = dates_from_serial.fillna(dates_from_text)
    return result.dt.strftime("%Y-%m-%d")


def normalize_time(value):
    if pd.isna(value):
        return None
    text = str(value).strip()
    if text.upper() in {"", "NULL", "NAN", "NONE"}:
        return None
    if ":" in text:
        parts = text.split(":")
        if len(parts) == 2:
            return f"{parts[0].zfill(2)}:{parts[1]}:00"
        return text
    return None


def normalize_text(value):
    if pd.isna(value):
        return None
    text = str(value).strip()
    if text.upper() in {"", "NULL", "NAN", "NONE"}:
        return None
    return text


def selecionar_colunas(df: pd.DataFrame, path: Path, sheet: str) -> pd.DataFrame:
    selecionadas = pd.DataFrame(index=df.index)
    missing = []

    for target, aliases in COLUMN_ALIASES.items():
        source = next((alias for alias in aliases if alias in df.columns), None)
        if source:
            selecionadas[target] = df[source]
        elif target in OPTIONAL_COLUMNS:
            selecionadas[target] = None
        else:
            missing.append(target)

    if missing:
        raise RuntimeError(
            f"Colunas obrigatorias ausentes em {path.name}, aba {sheet}: {', '.join(missing)}"
        )

    return selecionadas


def processar_aba_ssp(path: Path, sheet: str) -> pd.DataFrame:
    print(f"Lendo {path.name}, aba {sheet}", flush=True)

    df = pd.read_excel(path, sheet_name=sheet, dtype=object)
    df = selecionar_colunas(df, path, sheet)
    df = df[df["cidade"].isin(CIDADES_RMSP)]

    for column in ["LATITUDE", "LONGITUDE"]:
        target = column.lower()
        df[target] = (
            df[target]
            .astype(str)
            .str.replace(",", ".", regex=False)
        )
        df[target] = pd.to_numeric(df[target], errors="coerce")

    df = df.dropna(subset=["latitude", "longitude"])
    df = df[(df["latitude"] != 0) & (df["longitude"] != 0)]

    df = df[
        ~df["logradouro"]
        .astype(str)
        .str.contains("VEDAÇÃO DA DIVULGAÇÃO", case=False, na=False)
    ]

    df["data_ocorrencia"] = normalize_date(df["data_ocorrencia"])
    df["hora_ocorrencia"] = df["hora_ocorrencia"].map(normalize_time)

    for column in ["ano_bo", "mes_estatistica", "ano_estatistica"]:
        df[column] = pd.to_numeric(df[column], errors="coerce").astype("Int64")

    text_columns = [
        column for column in TARGET_COLUMNS
        if column not in {
            "data_ocorrencia",
            "hora_ocorrencia",
            "latitude",
            "longitude",
            "ano_bo",
            "mes_estatistica",
            "ano_estatistica",
        }
    ]
    for column in text_columns:
        df[column] = df[column].map(normalize_text)

    return df[TARGET_COLUMNS]


def processar_arquivo_ssp(path: Path) -> pd.DataFrame:
    frames = [processar_aba_ssp(path, sheet) for sheet in data_sheet_names(path)]
    return pd.concat(frames, ignore_index=True)


def ensure_import_schema(conn) -> None:
    with conn.cursor() as cur:
        cur.execute(IMPORT_SQL_PATH.read_text(encoding="utf-8"))
    conn.commit()


def meses_ja_importados(conn) -> set[tuple[int, int]]:
    with conn.cursor() as cur:
        cur.execute(
            f"""
            select ano_estatistica, mes_estatistica
            from {IMPORT_TABLE}
            where base = 'Dados criminais'
            """
        )
        return {(int(year), int(month)) for year, month in cur.fetchall()}


def meses_existentes_na_tabela_principal(conn) -> set[tuple[int, int]]:
    with conn.cursor() as cur:
        cur.execute(
            f"""
            select ano_estatistica, mes_estatistica
            from {TARGET_TABLE}
            where ano_estatistica is not null
              and mes_estatistica is not null
            group by ano_estatistica, mes_estatistica
            """
        )
        return {(int(year), int(month)) for year, month in cur.fetchall()}


def apagar_mes(conn, year: int, month: int) -> None:
    with conn.cursor() as cur:
        cur.execute(
            f"delete from {TARGET_TABLE} where ano_estatistica = %s and mes_estatistica = %s",
            (year, month),
        )


def copiar_para_supabase(conn, df: pd.DataFrame) -> int:
    with tempfile.NamedTemporaryFile("w+", newline="", encoding="utf-8") as temp:
        df.to_csv(temp, columns=TARGET_COLUMNS, index=False, quoting=csv.QUOTE_MINIMAL, na_rep="")
        temp.flush()
        temp.seek(0)

        columns = ", ".join(TARGET_COLUMNS)
        copy_sql = f"copy {TARGET_TABLE} ({columns}) from stdin with (format csv, header true)"
        with conn.cursor() as cur:
            cur.copy_expert(copy_sql, temp)

    return len(df)


def registrar_mes(conn, year: int, month: int, source_file: str, row_count: int) -> None:
    with conn.cursor() as cur:
        cur.execute(
            f"""
            insert into {IMPORT_TABLE}
              (base, ano_estatistica, mes_estatistica, source_file, row_count)
            values ('Dados criminais', %s, %s, %s, %s)
            on conflict (base, ano_estatistica, mes_estatistica)
            do update set
              source_file = excluded.source_file,
              row_count = excluded.row_count,
              imported_at = now()
            """,
            (year, month, source_file, row_count),
        )


def arquivos_para_importar(anos: list[int], skip_download: bool) -> list[Path]:
    if not skip_download:
        return baixar_anos(anos)

    arquivos = []
    for year in anos:
        arquivos.extend(sorted(RAW_DIR.glob(f"*{year}.xlsx")))
    if not arquivos:
        raise RuntimeError("Nenhum arquivo local encontrado em data/raw/ssp.")
    return arquivos


def main() -> int:
    parser = argparse.ArgumentParser(description="Importa meses novos da SSP-SP para o Supabase.")
    parser.add_argument("--anos", nargs="+", type=int, required=True, help="Anos a verificar/importar.")
    parser.add_argument("--skip-download", action="store_true", help="Usa arquivos já baixados em data/raw/ssp.")
    parser.add_argument(
        "--replace-existing",
        action="store_true",
        help="Apaga e recarrega meses que já tinham sido importados.",
    )
    args = parser.parse_args()

    load_dotenv(PROJECT_ROOT / ".env")
    db_config = database_config()

    arquivos = arquivos_para_importar(args.anos, args.skip_download)

    if isinstance(db_config, dict):
        conn_context = psycopg2.connect(**db_config)
    else:
        conn_context = psycopg2.connect(db_config)

    with conn_context as conn:
        ensure_import_schema(conn)
        importados = meses_ja_importados(conn)
        meses_com_dados = meses_existentes_na_tabela_principal(conn)

        for arquivo in arquivos:
            for sheet in data_sheet_names(arquivo):
                df = processar_aba_ssp(arquivo, sheet)
                meses = sorted(
                    {
                        (int(row.ano_estatistica), int(row.mes_estatistica))
                        for row in df[["ano_estatistica", "mes_estatistica"]].dropna().itertuples(index=False)
                    }
                )

                for year, month in meses:
                    if (year, month) in importados and not args.replace_existing:
                        print(f"Pulando {year}-{month:02d}: ja importado", flush=True)
                        continue

                    if (year, month) in meses_com_dados and not args.replace_existing:
                        print(f"Pulando {year}-{month:02d}: ja existem dados na tabela principal", flush=True)
                        continue

                    df_mes = df[(df["ano_estatistica"] == year) & (df["mes_estatistica"] == month)]

                    try:
                        if args.replace_existing:
                            apagar_mes(conn, year, month)
                        total = copiar_para_supabase(conn, df_mes)
                        registrar_mes(conn, year, month, arquivo.name, total)
                        conn.commit()
                    except Exception:
                        conn.rollback()
                        raise

                    importados.add((year, month))
                    meses_com_dados.add((year, month))
                    print(f"Importado {year}-{month:02d}: {total} linhas", flush=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
