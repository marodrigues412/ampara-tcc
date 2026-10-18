# Pendências para depois da Eureka (23–24/10/2026)

## Privacidade em `risk_assessments`

- **`nearby_crime_count` e `crime_density_per_km2`**: desde 18/10/2026 o app não grava mais essas colunas nas linhas novas (lista fechada em `mobile/services/riskAssessmentRow.js`). São a contagem e a densidade de crimes num raio de 1 km da posição da usuária; cruzadas com a base pública da SSP, ajudam a localizar onde ela estava.
  - Falta: decidir com as autoras se as colunas e os dados antigos são apagados (ou zerados) e ajustar `risk_assessment_daily_report`, que ainda calcula `average_crime_density_per_km2`.
  - Não apagar antes da Eureka.
