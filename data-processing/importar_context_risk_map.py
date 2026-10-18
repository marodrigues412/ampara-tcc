#!/usr/bin/env python3
"""
Sobe o mapa de contexto (Camada 1) para a tabela public.context_risk_map do Supabase.

Substitui o conteúdo inteiro numa transação só: o app nunca lê um mapa pela metade.
Antes, aplique a estrutura com:
  python data-processing/aplicar_sql.py data/context_risk_map.sql

Uso:
  python data-processing/importar_context_risk_map.py
  python data-processing/importar_context_risk_map.py --csv data/processed/context_risk_map.csv
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

COLUNAS = [
    "municipio", "bairro", "dia_semana", "periodo", "registros_com_peso",
    "registros_ddm", "total_ponderado", "escore_contexto", "nivel_contexto",
    "percentil_33", "percentil_66",
]
DIAS = {"segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"}
PERIODOS = {"madrugada", "manha", "tarde", "noite"}
NIVEIS = {"baixo", "medio", "alto"}


def preparar_linhas(mapa: pd.DataFrame) -> list[tuple]:
    """Confere o CSV e devolve as tuplas na ordem de COLUNAS."""
    faltando = set(COLUNAS) - set(mapa.columns)
    if faltando:
        raise ValueError(f"Colunas ausentes: {', '.join(sorted(faltando))}")
    dados = mapa[COLUNAS].copy()
    if dados.empty:
        raise ValueError("Mapa vazio: nada para importar")
    if not dados.dia_semana.isin(DIAS).all():
        raise ValueError("dia_semana fora do esperado")
    if not dados.periodo.isin(PERIODOS).all():
        raise ValueError("periodo fora do esperado")
    if not dados.nivel_contexto.isin(NIVEIS).all():
        raise ValueError("nivel_contexto fora do esperado")
    if (dados.registros_com_peso < 5).any():
        raise ValueError("Célula com menos de 5 registros não pode ser publicada")
    chaves = ["municipio", "bairro", "dia_semana", "periodo"]
    if dados.duplicated(chaves).any():
        raise ValueError("Células repetidas no mapa")

    dados["registros_ddm"] = dados.registros_ddm.astype(str)
    return [
        (
            str(l.municipio), str(l.bairro), str(l.dia_semana), str(l.periodo),
            int(l.registros_com_peso), l.registros_ddm, int(l.total_ponderado),
            float(l.escore_contexto), str(l.nivel_contexto),
            float(l.percentil_33), float(l.percentil_66),
        )
        for l in dados.itertuples(index=False)
    ]


def main() -> int:
    import psycopg2
    from psycopg2.extras import execute_values

    from importar_ssp_supabase import PROJECT_ROOT, database_config, load_dotenv

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--csv", type=Path, default=PROJECT_ROOT / "data" / "processed" / "context_risk_map.csv"
    )
    args = parser.parse_args()

    linhas = preparar_linhas(pd.read_csv(args.csv, dtype={"registros_ddm": str}))

    load_dotenv(PROJECT_ROOT / ".env")
    config = database_config()
    conn = psycopg2.connect(**config) if isinstance(config, dict) else psycopg2.connect(config)
    with conn, conn.cursor() as cur:
        cur.execute("delete from public.context_risk_map")
        execute_values(
            cur,
            f"insert into public.context_risk_map ({', '.join(COLUNAS)}) values %s",
            linhas,
            page_size=1000,
        )
        cur.execute("select count(*) from public.context_risk_map")
        total = cur.fetchone()[0]
    conn.close()
    print(f"context_risk_map: {total} células importadas de {args.csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
