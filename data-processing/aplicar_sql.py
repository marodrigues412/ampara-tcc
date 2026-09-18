#!/usr/bin/env python3
"""
Aplica arquivos .sql no Supabase usando as mesmas credenciais do importador (.env).

Exemplos:
  python data-processing/aplicar_sql.py data/alert_logs_status.sql
  python data-processing/aplicar_sql.py data/alert_logs_status.sql data/nearby_functions.sql
"""

from __future__ import annotations

import sys
from pathlib import Path

import psycopg2

from importar_ssp_supabase import PROJECT_ROOT, database_config, load_dotenv


def main() -> int:
    arquivos = [Path(arg) for arg in sys.argv[1:]]
    if not arquivos:
        raise SystemExit(__doc__)

    load_dotenv(PROJECT_ROOT / ".env")
    config = database_config()
    conn = psycopg2.connect(**config) if isinstance(config, dict) else psycopg2.connect(config)

    with conn:
        for arquivo in arquivos:
            print(f"Aplicando {arquivo}...", flush=True)
            with conn.cursor() as cur:
                cur.execute(arquivo.read_text(encoding="utf-8"))
            print(f"  OK", flush=True)

    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
