# Pendências para depois da Eureka (23–24/10/2026)

## Privacidade em `risk_assessments`

- **`nearby_crime_count` e `crime_density_per_km2`**: desde 18/10/2026 o app não grava mais essas colunas nas linhas novas (lista fechada em `mobile/services/riskAssessmentRow.js`). São a contagem e a densidade de crimes num raio de 1 km da posição da usuária; cruzadas com a base pública da SSP, ajudam a localizar onde ela estava.
  - Falta: decidir com as autoras se as colunas e os dados antigos são apagados (ou zerados) e ajustar `risk_assessment_daily_report`, que ainda calcula `average_crime_density_per_km2`.
  - Não apagar antes da Eureka.

## Limitações da fonte (para o artigo)

- **Ameaça fica fora da Camada 1.** O orientador listou "ameaça" entre os crimes a filtrar, mas a base pública da SSP praticamente não traz esse registro: na amostra jan–mar/2026 do estado inteiro há 1 único registro de ameaça (Barra Bonita), e nenhum em São Caetano do Sul e Santo André entre 2022 e 2026. Decisão das autoras (18/10/2026): manter fora e declarar como limitação da fonte, não como escolha de peso.

## Dashboard

- ~~Converter o relatório para os níveis do score de 3 camadas~~ — feito em 18/10/2026 (`risk_level_report`, risco por dia, contexto dos lugares, horários, destaque e resumo da Lia, modo de sensores, trajetos).
- Falta: apagar o código antigo de 0–10 que ficou escondido atrás de `MOSTRAR_SCORE_DE_PONTOS` (Dashboard) e `ENVIAR_SCORE_DE_PONTOS` (contexto da Lia), e decidir se o cálculo de pontos 0–10 da Home (coluna `risco` de `location_history`) continua sendo gravado.
- Tempo por nível = avaliações × 30 s (uma a cada 30 s com o monitoramento ativo); é aproximado.

## Grafias duplicadas de bairro na SSP (Camada 1)

O campo `BAIRRO` da SSP é texto livre: o mesmo lugar aparece com grafias diferentes e vira mais de uma célula no mapa, cada uma com parte dos registros. Decisão das autoras (18/10/2026): não juntar antes da Eureka.

Lista completa (688 pares candidatos, mesmo município) em `docs/grafias_duplicadas_ssp.csv`, com os registros de cada lado e o critério:

- **`abreviacao` (14 pares, quase certamente o mesmo lugar):** só muda JD/JARDIM, PQ/PARQUE etc. 13 em Barueri (ex.: JD BELVAL 153 × JARDIM BELVAL 136; PQ IMPERIAL 299 × PARQUE IMPERIAL 218; PQ DOS CAMARGOS 177 × JD DOS CAMARGOS 91 × PARQUE DOS CAMARGOS 42) e 1 em São Paulo.
  - Efeito no app hoje: a busca expande as abreviações dos dois lados, então as duas células casam com o mesmo nome e o app usa a primeira que encontra — metade dos registros daquele bairro.
- **`revisar` (674 pares):** iguais sem o prefixo (VILA/JARDIM/PARQUE…) ou o complemento entre parênteses, ou a uma letra de distância. Muitos são lugares diferentes (JARDIM IRACEMA × VILA IRACEMA; JARDIM IPANEMA zona leste × zona oeste; ALPHAVILLE RESIDENCIAL 0 × 1) e precisam de revisão humana.
- **São Caetano do Sul (5 pares):** BARCELONA (90) × VILA BARCELONA (240); NOVA GERTI (47) × NOVA GERTY (209); OSVALDO CRUZ (142) × OSWALDO CRUZ (18); PROSPERIDADE (17) × VILA PROPERIDADE (105, erro de digitação da fonte); SANTA PAULA (101) × VILA SANTA PAULA (266).

Caminho sugerido: um dicionário de grafias revisado à mão, aplicado no `build_context_risk_map.py` antes de agrupar (com teste), começando pelas abreviações e por São Caetano.
