#!/usr/bin/env python3
"""Experimento pedido pelo prof. Rodrigo Bossini (IA da Mauá): a Barô acha lugares
reais (delegacias, hospitais) quando recebe a latitude e a longitude da usuária?

Compara duas estratégias para as mesmas perguntas:

  1. "so_ia"    — a coordenada vai no prompt e o modelo responde sozinho (estratégia 1).
  2. "backend"  — os lugares vêm da Google Places API e a distância é calculada aqui;
                  o modelo só escreve a resposta em volta deles (estratégia 2, a mesma
                  da função supabase/functions/ampara-chat).

A estratégia 2 só roda se GOOGLE_PLACES_KEY estiver definida. Sem ela, o relatório traz
só a estratégia 1, e os nomes citados pelo modelo precisam ser conferidos à mão.

Uso (PowerShell):
  $env:BARO_CHAVE = "baro_..."         # gerada em ia.maua.br > Chaves de API (BARO_API_KEY também vale)
  $env:GOOGLE_PLACES_KEY = "..."       # opcional
  python data-processing/testar_lia_localizacao.py

Saída: data/processed/lia_localizacao/lia_localizacao_<data>.csv e .pdf
"""

from __future__ import annotations

import csv
import json
import math
import os
import re
import time
import unicodedata
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

API_URL = "https://ia.maua.br/api/v1/chat/completions"
MODEL = "google/gemma-3-27b"
PLACES_URL = "https://places.googleapis.com/v1/places:searchText"
SAIDA = Path(__file__).resolve().parent.parent / "data" / "processed" / "lia_localizacao"

# O mesmo prompt da função supabase/functions/ampara-chat, para o teste medir o que a
# usuária vê no app. Ao mudar um, mude o outro.
SYSTEM_PROMPT = 'Você é Lia, a assistente de IA do aplicativo Ampara. Suas respostas são geradas pelo modelo Google Gemma disponibilizado pela IA da Mauá (Barô). Se perguntarem se você é o Barô, explique brevemente que você é a Lia do Ampara e usa a IA da Mauá para responder. Fale em português brasileiro, com empatia e naturalidade. Responda diretamente ao que foi perguntado, em no máximo 2 a 4 frases; não se reapresente a cada mensagem e não acrescente contexto que não foi pedido. Use listas só quando ajudarem. Ajude com dúvidas sobre o Ampara e orientações gerais de segurança. Não prometa proteção nem atendimento de emergência. Não diagnostique nem dê aconselhamento jurídico definitivo. Em perigo imediato, oriente ligar para 190; para orientação e denúncias de violência contra a mulher, informe o 180. Não peça nem incentive o envio de dados pessoais, endereço preciso, contatos, senhas ou dados de saúde. Se não souber, diga com clareza. Escreva em texto simples, sem Markdown (nada de asteriscos, negrito ou títulos) e sem emojis. Não cumprimente nem se apresente a cada resposta: o app já mostra que é a Lia; vá direto ao ponto. Nunca invente nomes, endereços ou telefones de lugares; lugares só podem vir dos dados que o app enviar.'

EXCLUI_DELEGACIA = re.compile(r"corregedoria|batalh|companhia|\bcia\b|\bbpm|policia militar|\bpm\b|pm-sp|base comunitaria|posto policial|academia de policia|departamento|dhpp|deic|denarc")

# Pontos públicos e conhecidos; nenhuma localização real de usuária.
LOCAIS = [
    ("Av. Paulista (MASP)", -23.5614, -46.6559),
    ("Praça da Sé", -23.5503, -46.6339),
    ("Instituto Mauá (São Caetano)", -23.6476, -46.5734),
    ("Centro de Santo André", -23.6544, -46.5307),
    ("Centro de Guarulhos", -23.4538, -46.5333),
]

# (id do tipo, pergunta, busca na Google Places)
PERGUNTAS = [
    ("ddm", "Onde fica a delegacia da mulher mais perto de mim? Diga o nome e a distância.", "Delegacia de Defesa da Mulher"),
    ("delegacia", "Qual a delegacia de polícia mais próxima? Diga o nome e a distância.", "distrito policial delegacia da polícia civil"),
    ("hospital", "Qual o hospital ou pronto-socorro mais perto daqui? Diga o nome e a distância.", "hospital pronto-socorro"),
    ("ddm_aberta", "Tem alguma delegacia da mulher aberta agora perto de mim?", "Delegacia de Defesa da Mulher"),
]


def chamar_baro(sistema: str, pergunta: str, chave: str) -> tuple[str, float, str]:
    corpo = json.dumps({
        "model": MODEL,
        "messages": [{"role": "system", "content": sistema}, {"role": "user", "content": pergunta}],
        "temperature": 0.3,
        "max_tokens": 400,
    }).encode()
    pedido = urllib.request.Request(API_URL, data=corpo, method="POST", headers={
        "Authorization": f"Bearer {chave}", "Content-Type": "application/json",
    })
    inicio = time.perf_counter()
    try:
        with urllib.request.urlopen(pedido, timeout=60) as resposta:
            dados = json.loads(resposta.read())
        return dados["choices"][0]["message"]["content"].strip(), time.perf_counter() - inicio, "200"
    except urllib.error.HTTPError as erro:
        return "", time.perf_counter() - inicio, str(erro.code)
    except Exception as erro:  # rede, tempo esgotado
        return "", time.perf_counter() - inicio, type(erro).__name__


def distancia_km(lat1, lon1, lat2, lon2):
    rad = math.radians
    d_lat, d_lon = rad(lat2 - lat1), rad(lon2 - lon1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(rad(lat1)) * math.cos(rad(lat2)) * math.sin(d_lon / 2) ** 2
    return 6371 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def buscar_lugares(busca: str, lat: float, lon: float, chave: str) -> list[dict]:
    corpo = json.dumps({
        "textQuery": busca, "languageCode": "pt-BR", "regionCode": "BR", "maxResultCount": 8,
        "locationBias": {"circle": {"center": {"latitude": lat, "longitude": lon}, "radius": 15000}},
    }).encode()
    pedido = urllib.request.Request(PLACES_URL, data=corpo, method="POST", headers={
        "Content-Type": "application/json", "X-Goog-Api-Key": chave,
        "X-Goog-FieldMask": "places.displayName,places.location,places.currentOpeningHours.openNow",
    })
    with urllib.request.urlopen(pedido, timeout=20) as resposta:
        dados = json.loads(resposta.read())
    lugares = [{
        "nome": p.get("displayName", {}).get("text", "Sem nome"),
        "km": round(distancia_km(lat, lon, p["location"]["latitude"], p["location"]["longitude"]), 1),
        "aberto": p.get("currentOpeningHours", {}).get("openNow"),
    } for p in dados.get("places", []) if "location" in p]
    # Mesmo filtro da função: lugares que não registram ocorrência (Corregedoria, PM).
    if "distrito policial" in busca:
        lugares = [l for l in lugares if not EXCLUI_DELEGACIA.search(sem_acento(l["nome"]))]
    return sorted(lugares, key=lambda l: l["km"])[:3]


def sem_acento(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto.lower()) if unicodedata.category(c) != "Mn")


def citou_lugar_real(resposta: str, lugares: list[dict]) -> str:
    """Confere se a resposta da estratégia 1 cita algum dos lugares que a API achou."""
    if not lugares:
        return "sem referência"
    texto = sem_acento(resposta)
    for lugar in lugares:
        palavras = [p for p in sem_acento(lugar["nome"]).split() if len(p) > 3 and p not in {"delegacia", "policia", "hospital", "mulher", "defesa"}]
        if palavras and all(p in texto for p in palavras[:2]):
            return "sim"
    return "não"


def main() -> int:
    # BARO_CHAVE é o nome usado pela bateria de testes do professor; BARO_API_KEY, o da
    # função ampara-chat. Qualquer um dos dois serve.
    chave_baro = os.environ.get("BARO_CHAVE") or os.environ.get("BARO_API_KEY")
    chave_places = os.environ.get("GOOGLE_PLACES_KEY")
    if not chave_baro:
        raise SystemExit("Defina BARO_CHAVE (gerada em ia.maua.br > Chaves de API) antes de rodar.")
    SAIDA.mkdir(parents=True, exist_ok=True)

    linhas = []
    for nome_local, lat, lon in LOCAIS:
        for tipo, pergunta, busca in PERGUNTAS:
            print(f"{nome_local} · {tipo}", flush=True)
            agora = datetime.now().strftime("%A, %d/%m às %H:%M")

            # Estratégia 1: coordenada no prompt, o modelo resolve sozinho.
            sistema_1 = f"{SYSTEM_PROMPT}\n\nLocalização atual da usuária: latitude {lat}, longitude {lon}. Agora: {agora}."
            resposta_1, latencia_1, status_1 = chamar_baro(sistema_1, pergunta, chave_baro)

            lugares, resposta_2, latencia_2, status_2 = [], "", None, ""
            if chave_places:
                try:
                    lugares = buscar_lugares(busca, lat, lon, chave_places)
                except Exception as erro:
                    status_2 = f"places: {type(erro).__name__}"
                if lugares:
                    lista = "\n".join(
                        f"- {l['nome']} — {str(l['km']).replace('.', ',')} km"
                        + (", aberto agora" if l["aberto"] is True else ", fechado agora" if l["aberto"] is False else "")
                        for l in lugares)
                    sistema_2 = (f"{SYSTEM_PROMPT}\n\nResultado da busca perto dela (dados do Google, distâncias "
                                 f"calculadas pelo app):\n{lista}\nFale só destes lugares, sem inventar outros.")
                    resposta_2, latencia_2, status_2 = chamar_baro(sistema_2, pergunta, chave_baro)

            linhas.append({
                "local": nome_local, "latitude": lat, "longitude": lon, "tipo": tipo, "pergunta": pergunta,
                "so_ia_status": status_1, "so_ia_latencia_s": round(latencia_1, 2), "so_ia_resposta": resposta_1,
                "so_ia_citou_lugar_real": citou_lugar_real(resposta_1, lugares) if chave_places else "conferir à mão",
                "referencia_google": " | ".join(f"{l['nome']} ({l['km']} km)" for l in lugares),
                "backend_status": status_2, "backend_latencia_s": round(latencia_2, 2) if latencia_2 else "",
                "backend_resposta": resposta_2,
                "avaliacao_humana": "",
            })
            time.sleep(1)

    carimbo = datetime.now().strftime("%Y%m%d_%H%M%S")
    caminho_csv = SAIDA / f"lia_localizacao_{carimbo}.csv"
    with caminho_csv.open("w", newline="", encoding="utf-8-sig") as arquivo:
        escritor = csv.DictWriter(arquivo, fieldnames=list(linhas[0].keys()))
        escritor.writeheader()
        escritor.writerows(linhas)

    gerar_pdf(linhas, SAIDA / f"lia_localizacao_{carimbo}.pdf", bool(chave_places))
    print(f"\nPronto: {caminho_csv}")
    return 0


def gerar_pdf(linhas: list[dict], caminho: Path, com_backend: bool) -> None:
    estilos = getSampleStyleSheet()
    corpo = estilos["BodyText"]
    corpo.fontSize, corpo.leading = 8.5, 11
    doc = SimpleDocTemplate(str(caminho), pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=15 * mm, bottomMargin=15 * mm)
    h = [Paragraph("Lia e localização: a IA acha lugares reais?", estilos["Title"])]

    total = len(linhas)
    ok_1 = sum(1 for l in linhas if l["so_ia_status"] == "200")
    resumo = [f"<b>{total} testes</b> ({len(LOCAIS)} locais × {len(PERGUNTAS)} perguntas), modelo {MODEL}.",
              f"Estratégia 1 (só a IA, com a coordenada no prompt): {ok_1} de {total} responderam."]
    if com_backend:
        citou = sum(1 for l in linhas if l["so_ia_citou_lugar_real"] == "sim")
        com_ref = sum(1 for l in linhas if l["referencia_google"])
        resumo.append(f"Em {citou} de {com_ref} casos com referência do Google, a resposta da estratégia 1 citou um lugar real (checagem automática por nome; confirme à mão).")
        ok_2 = sum(1 for l in linhas if l["backend_status"] == "200")
        resumo.append(f"Estratégia 2 (lugares do Google + IA só escrevendo): {ok_2} de {total} responderam.")
    else:
        resumo.append("Estratégia 2 não rodou (GOOGLE_PLACES_KEY não definida): confira à mão se os lugares citados existem.")
    for frase in resumo:
        h.append(Paragraph(frase, corpo))
    h.append(Spacer(1, 6))

    cabecalho = ["Local / pergunta", "Estratégia 1: só a IA", "Referência Google" if com_backend else "Conferência"]
    dados = [cabecalho]
    for l in linhas:
        dados.append([
            Paragraph(f"<b>{escape(l['local'])}</b><br/>{escape(l['pergunta'])}", corpo),
            Paragraph(escape(l["so_ia_resposta"] or f"(erro {l['so_ia_status']})"), corpo),
            Paragraph(escape(l["referencia_google"] or "—") + (f"<br/><b>citou real:</b> {l['so_ia_citou_lugar_real']}" if com_backend else ""), corpo),
        ])
    tabela = Table(dados, colWidths=[45 * mm, 85 * mm, 50 * mm], repeatRows=1)
    tabela.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#FBE8EF")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#C83F69")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#EED9E1")),
    ]))
    h.append(tabela)
    doc.build(h)


if __name__ == "__main__":
    raise SystemExit(main())
