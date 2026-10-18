# Pendências para depois da Eureka (23–24/10/2026)

## Privacidade em `risk_assessments`

- **`nearby_crime_count` e `crime_density_per_km2`**: desde 18/10/2026 o app não grava mais essas colunas nas linhas novas (lista fechada em `mobile/services/riskAssessmentRow.js`). São a contagem e a densidade de crimes num raio de 1 km da posição da usuária; cruzadas com a base pública da SSP, ajudam a localizar onde ela estava.
  - Falta: decidir com as autoras se as colunas e os dados antigos são apagados (ou zerados) e ajustar `risk_assessment_daily_report`, que ainda calcula `average_crime_density_per_km2`.
  - Não apagar antes da Eureka.

## Limitações da fonte (para o artigo)

- **Ameaça fica fora da Camada 1.** O orientador listou "ameaça" entre os crimes a filtrar, mas a base pública da SSP praticamente não traz esse registro: na amostra jan–mar/2026 do estado inteiro há 1 único registro de ameaça (Barra Bonita), e nenhum em São Caetano do Sul e Santo André entre 2022 e 2026. Decisão das autoras (18/10/2026): manter fora e declarar como limitação da fonte, não como escolha de peso.

## Dashboard

- **Converter o relatório para os níveis do score de 3 camadas** (tempo em baixo / moderado / alto e modo de sensores). Estimativa: 3–4 h, porque `location_history` só guarda o score de pontos 0–10, os níveis estão em `risk_assessments` e a grade de horários, os trajetos e o resumo da Lia precisam ser refeitos. Até lá, os elementos de 0–10 ficam escondidos para não haver dois scores no app.
