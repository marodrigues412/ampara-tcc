#!/usr/bin/env python3
"""
Baixa os limites oficiais dos municipios atendidos e grava data/municipios_rmsp.geojson.

O importador usa esse arquivo para decidir quais ocorrencias da SSP entram na base,
recortando por area em vez de por nome de cidade — a SSP abrevia "Santo"/"Sao" como "S."
e qualquer divergencia de grafia descartaria o municipio inteiro em silencio.

Para incluir outra cidade, acrescente o codigo do IBGE em MUNICIPIOS e rode de novo:
  python data-processing/baixar_limites_ibge.py
"""

from __future__ import annotations

import gzip
import json
import urllib.request
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DESTINO = PROJECT_ROOT / "data" / "municipios_rmsp.geojson"

# Codigo do IBGE -> nome apenas para leitura humana. O codigo e o que vale.
MUNICIPIOS = {
    "3550308": "Sao Paulo",
    "3518800": "Guarulhos",
    "3534401": "Osasco",
    "3547809": "Santo Andre",
    "3548708": "Sao Bernardo do Campo",
    "3548807": "Sao Caetano do Sul",
    "3513801": "Diadema",
    "3529401": "Maua",
    "3505708": "Barueri",
}

URL = "https://servicodados.ibge.gov.br/api/v3/malhas/municipios/{codigo}?formato=application/vnd.geo+json"


def baixar(codigo: str) -> dict:
    requisicao = urllib.request.Request(
        URL.format(codigo=codigo),
        headers={"User-Agent": "AmparaTCC/1.0", "Accept-Encoding": "gzip"},
    )
    with urllib.request.urlopen(requisicao, timeout=90) as resposta:
        conteudo = resposta.read()
    if conteudo[:2] == b"\x1f\x8b":
        conteudo = gzip.decompress(conteudo)
    return json.loads(conteudo)["features"][0]["geometry"]


def main() -> int:
    features = []
    for codigo, nome in MUNICIPIOS.items():
        print(f"Baixando {nome} ({codigo})...", flush=True)
        features.append({
            "type": "Feature",
            "properties": {"codigo_ibge": codigo, "nome": nome},
            "geometry": baixar(codigo),
        })

    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    DESTINO.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}),
        encoding="utf-8",
    )
    print(f"\n{len(features)} municipios gravados em {DESTINO}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
