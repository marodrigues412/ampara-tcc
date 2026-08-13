#!/usr/bin/env python3
"""
Baixa automaticamente os arquivos de "Dados criminais" da SSP-SP.

Exemplos:
  python data-processing/baixar_ssp.py --anos 2026
  python data-processing/baixar_ssp.py --anos 2024 2025 2026
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional
from urllib.parse import unquote, urljoin, urlparse
from urllib.request import Request, urlopen


PROJECT_ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = PROJECT_ROOT / "data" / "raw" / "ssp"
METADATA_PATH = PROJECT_ROOT / "data" / "ssp_downloads.csv"

BASE_URL = "https://www.ssp.sp.gov.br/"
INDICE_SP_DADOS = urljoin(
    BASE_URL,
    "assets/estatistica/transparencia/spDados160_516.json",
)
ANOS_PADRAO = [2022, 2023, 2024, 2025, 2026]
USER_AGENT = (
    "Mozilla/5.0 (compatible; AmparaTCCDataCollector/1.0; "
    "+https://www.ssp.sp.gov.br/estatistica/consultas)"
)


@dataclass(frozen=True)
class ArquivoSsp:
    base: str
    periodo: str
    ano: Optional[int]
    url: str


def baixar_binario(url: str) -> bytes:
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=120) as resposta:
        return resposta.read()


def baixar_json(url: str) -> dict:
    conteudo = baixar_binario(url)
    return json.loads(conteudo.decode("utf-8-sig"))


def detectar_ano(texto: str) -> Optional[int]:
    match = re.search(r"\b(20\d{2})\b", texto)
    return int(match.group(1)) if match else None


def normalizar_nome(texto: str) -> str:
    texto = texto.lower()
    texto = re.sub(r"[^a-z0-9]+", "_", texto)
    return texto.strip("_")


def listar_arquivos(indice_url: str = INDICE_SP_DADOS, base: str = "Dados criminais") -> list[ArquivoSsp]:
    indice = baixar_json(indice_url)
    arquivos: list[ArquivoSsp] = []

    for grupo in indice.get("data", []):
        nome_base = grupo.get("nome", "")
        if nome_base.lower() != base.lower():
            continue

        for item in grupo.get("lista", []):
            periodo = str(item.get("periodo", ""))
            caminho = item.get("arquivo")
            if not caminho:
                continue

            arquivos.append(
                ArquivoSsp(
                    base=nome_base,
                    periodo=periodo,
                    ano=detectar_ano(periodo),
                    url=urljoin(BASE_URL, caminho),
                )
            )

    return arquivos


def filtrar_por_anos(arquivos: Iterable[ArquivoSsp], anos: set[int]) -> list[ArquivoSsp]:
    selecionados = [arquivo for arquivo in arquivos if arquivo.ano in anos]
    return sorted(selecionados, key=lambda arquivo: (arquivo.ano or 0, arquivo.url))


def nome_arquivo(arquivo: ArquivoSsp) -> str:
    nome_original = Path(unquote(urlparse(arquivo.url).path)).name
    sufixo = Path(nome_original).suffix or ".xlsx"
    base = normalizar_nome(arquivo.base)

    if arquivo.ano:
        return f"ssp_sp_{base}_{arquivo.ano}{sufixo}"
    if nome_original:
        return nome_original
    return f"ssp_sp_{base}{sufixo}"


def salvar_metadados(arquivos: list[ArquivoSsp], destino: Path = METADATA_PATH) -> None:
    destino.parent.mkdir(parents=True, exist_ok=True)
    with destino.open("w", newline="", encoding="utf-8") as arquivo_csv:
        escritor = csv.DictWriter(
            arquivo_csv,
            fieldnames=[
                "coletado_em_utc",
                "base",
                "periodo",
                "ano",
                "url_indice",
                "url_arquivo",
                "arquivo_local",
            ],
        )
        escritor.writeheader()
        coletado_em = dt.datetime.now(dt.timezone.utc).isoformat()
        for arquivo in arquivos:
            escritor.writerow(
                {
                    "coletado_em_utc": coletado_em,
                    "base": arquivo.base,
                    "periodo": arquivo.periodo,
                    "ano": arquivo.ano or "",
                    "url_indice": INDICE_SP_DADOS,
                    "url_arquivo": arquivo.url,
                    "arquivo_local": str(RAW_DIR / nome_arquivo(arquivo)),
                }
            )


def baixar_anos(anos: Iterable[int]) -> list[Path]:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    arquivos = filtrar_por_anos(listar_arquivos(), set(anos))
    caminhos: list[Path] = []

    if not arquivos:
        raise RuntimeError("Nenhum arquivo de Dados criminais foi encontrado para os anos informados.")

    for arquivo in arquivos:
        caminho = RAW_DIR / nome_arquivo(arquivo)
        print(f"Baixando {arquivo.periodo}: {arquivo.url}")
        caminho.write_bytes(baixar_binario(arquivo.url))
        caminhos.append(caminho)
        print(f"Salvo em {caminho}")

    salvar_metadados(arquivos)
    return caminhos


def main() -> int:
    parser = argparse.ArgumentParser(description="Baixa arquivos de dados criminais da SSP-SP.")
    parser.add_argument("--anos", nargs="+", type=int, default=ANOS_PADRAO, help="Anos a baixar.")
    args = parser.parse_args()

    baixar_anos(args.anos)
    print(f"Metadados salvos em {METADATA_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
