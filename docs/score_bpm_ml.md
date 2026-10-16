# Score experimental BPM + ML

## Pipeline

1. O app calcula um baseline pessoal de BPM usando o histórico recente e o z-score da leitura atual.
2. Um Isolation Forest analisa uma janela de 2,56 s do acelerômetro do celular: magnitude média, desvio-padrão, pico e jerk máximo.
3. As bandas corporais (baixo, médio, alto) e de contexto são combinadas pela matriz definida na orientação do TCC. O BPM tem peso de 70% no sinal corporal; o movimento ML, 30% quando disponível.
4. A leitura e as variáveis usadas podem ser gravadas em `risk_assessments`, protegidas por RLS, para relatórios posteriores. O score experimental não dispara alertas.

## Treino e avaliação atual

O modelo foi treinado apenas com atividades cotidianas do UCI HAR (andar, subir/descer escadas, sentar, ficar em pé e deitar). O treino usa 7.352 janelas; 1.201 janelas de quatro participantes calibram os limites e 1.746 janelas de outros cinco participantes são usadas para avaliar a taxa de anomalias em atividades normais. No conjunto de avaliação, 1,49% excederam o limite moderado e 0,06% o alto. Os resultados completos por atividade estão em [`score_ml_evaluation.json`](score_ml_evaluation.json).

Isso mede apenas o comportamento do modelo em atividades cotidianas de uma base pública; não mede detecção de violência, emergência ou risco real. A UCI HAR não tem BPM nem GPS. O BPM é um sinal separado com baseline pessoal; o contexto mostrado hoje ainda é heurístico (ocorrências próximas, horário e zona segura), não o mapa bairro × período proposto. A posição do celular no estudo original também difere do uso real do Ampara.

## Próximos passos antes de uso operacional

- Importar o mapa SSP por município, bairro, dia da semana e período para uma tabela consultável no Supabase e resolver o bairro da localização com uma fonte confiável.
- Aplicar no Supabase a atualização de `data/score_bpm.sql` para persistir a faixa combinada e a anomalia ML nos relatórios.
- Coletar sessões consentidas e representativas com BPM e acelerômetro do relógio/celular; avaliar falsos positivos, falsos negativos, cobertura e diferenças de posicionamento.
- Só então recalibrar os pesos/limites e decidir se o score pode influenciar alertas.

Treino reproduzível: `python3 data-processing/treinar_isolation_forest.py --download`.

Fonte: [UCI Human Activity Recognition Using Smartphones](https://www.ics.uci.edu/~mhealth/), DOI `10.24432/C54S4K`, licença CC BY 4.0.
