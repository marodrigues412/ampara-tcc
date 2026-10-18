#!/usr/bin/env python3
"""
Sobe a Camada 1 do score para o Supabase: o mapa de bairros (public.context_risk_map)
e a reserva da cidade (public.context_risk_map_cidade).

Substitui o conteúdo das duas tabelas numa transação só: o app nunca lê um mapa pela
metade, nem um mapa de bairros com a reserva de outra versão.
Antes, aplique a estrutura com:
  python data-processing/aplicar_sql.py data/context_risk_map.sql

Uso:
  python data-processing/importar_context_risk_map.py
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

COLUNAS_BAIRRO = [
    "municipio", "bairro", "periodo", "registros_com_peso", "registros_periodo_informado",
    "registros_periodo_derivado", "registros_ddm", "total_ponderado", "escore_contexto",
    "nivel_contexto", "percentil_33", "percentil_66",
]
COLUNAS_CIDADE = [
    "municipio", "periodo", "registros_com_peso", "registros_periodo_informado",
    "registros_periodo_derivado", "registros_ddm", "total_ponderado", "bairros_com_registro",
    "total_medio_por_bairro", "escore_contexto", "nivel_contexto", "percentil_33", "percentil_66",
]
# Mantido com o nome antigo: é o formato da tabela de bairros.
COLUNAS = COLUNAS_BAIRRO
PERIODOS = {"madrugada", "manha", "tarde", "noite"}
NIVEIS = {"baixo", "medio", "alto"}
INTEIRAS = {
    "registros_com_peso", "registros_periodo_informado", "registros_periodo_derivado",
    "total_ponderado", "bairros_com_registro",
}
REAIS = {"escore_contexto", "percentil_33", "percentil_66", "total_medio_por_bairro"}


def _converter(coluna: str, valor):
    if coluna in INTEIRAS:
        return int(valor)
    if coluna in REAIS:
        return float(valor)
    return str(valor)


def _preparar(mapa: pd.DataFrame, colunas: list[str], chaves: list[str]) -> list[tuple]:
    faltando = set(colunas) - set(mapa.columns)
    if faltando:
        raise ValueError(f"Colunas ausentes: {', '.join(sorted(faltando))}")
    dados = mapa[colunas].copy()
    if dados.empty:
        raise ValueError("Mapa vazio: nada para importar")
    if not dados.periodo.isin(PERIODOS).all():
        raise ValueError("periodo fora do esperado")
    if not dados.nivel_contexto.isin(NIVEIS).all():
        raise ValueError("nivel_contexto fora do esperado")
    if (dados.registros_com_peso < 5).any():
        raise ValueError("Célula com menos de 5 registros não pode ser publicada")
    proveniencia = dados.registros_periodo_informado + dados.registros_periodo_derivado
    if not proveniencia.eq(dados.registros_com_peso).all():
        raise ValueError("Proveniência do período não fecha com o total de registros")
    if dados.duplicated(chaves).any():
        raise ValueError("Células repetidas no mapa")
    dados["registros_ddm"] = dados.registros_ddm.astype(str)
    return [
        tuple(_converter(coluna, valor) for coluna, valor in zip(colunas, linha))
        for linha in dados.itertuples(index=False)
    ]


def preparar_linhas(mapa: pd.DataFrame) -> list[tuple]:
    """Confere o mapa de bairros e devolve as tuplas na ordem de COLUNAS_BAIRRO."""
    return _preparar(mapa, COLUNAS_BAIRRO, ["municipio", "bairro", "periodo"])


def preparar_linhas_cidade(mapa: pd.DataFrame) -> list[tuple]:
    """Confere a reserva da cidade e devolve as tuplas na ordem de COLUNAS_CIDADE."""
    linhas = _preparar(mapa, COLUNAS_CIDADE, ["municipio", "periodo"])
    if (mapa.bairros_com_registro <= 0).any():
        raise ValueError("Reserva da cidade sem bairro com registro")
    return linhas


def main() -> int:
    import psycopg2
    from psycopg2.extras import execute_values

    from importar_ssp_supabase import PROJECT_ROOT, database_config, load_dotenv

    processados = PROJECT_ROOT / "data" / "processed"
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", type=Path, default=processados / "context_risk_map.csv")
    parser.add_argument("--csv-cidade", type=Path, default=processados / "context_risk_map_cidade.csv")
    args = parser.parse_args()

    bairros = preparar_linhas(pd.read_csv(args.csv, dtype={"registros_ddm": str}))
    cidades = preparar_linhas_cidade(pd.read_csv(args.csv_cidade, dtype={"registros_ddm": str}))

    load_dotenv(PROJECT_ROOT / ".env")
    config = database_config()
    conn = psycopg2.connect(**config) if isinstance(config, dict) else psycopg2.connect(config)
    with conn, conn.cursor() as cur:
        for tabela, colunas, linhas in (
            ("context_risk_map", COLUNAS_BAIRRO, bairros),
            ("context_risk_map_cidade", COLUNAS_CIDADE, cidades),
        ):
            cur.execute(f"delete from public.{tabela}")
            execute_values(
                cur,
                f"insert into public.{tabela} ({', '.join(colunas)}) values %s",
                linhas,
                page_size=1000,
            )
        cur.execute("select (select count(*) from public.context_risk_map), (select count(*) from public.context_risk_map_cidade)")
        total_bairros, total_cidades = cur.fetchone()
    conn.close()
    print(f"context_risk_map: {total_bairros} células · context_risk_map_cidade: {total_cidades} células")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
