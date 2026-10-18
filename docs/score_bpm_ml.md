# Score de 3 camadas: contexto × corpo

O sistema é híbrido. Só o movimento do celular usa aprendizado de máquina (Isolation Forest, não supervisionado). O contexto é estatística descritiva, o BPM é estatística (z-score), o movimento do relógio é regra heurística e a fusão é uma regra (matriz 3×3 da orientação do TCC).

## Pipeline

1. **Camada 1, contexto:** faixa do mapa SSP município × bairro × período (`context_risk_map`), com a reserva município × período (`context_risk_map_cidade`) quando o bairro não tem célula. Local seguro (80 m) baixa uma faixa.
2. **Camada 2, corpo:** sinais disponíveis na leitura, sem imputar.
   - BPM: z-score contra a última hora, normalizado (z − 0,5)/2 em [0, 1].
   - Movimento do celular: Isolation Forest sobre uma janela de 2,56 s do acelerômetro a 10 Hz (magnitude média, desvio-padrão, pico e jerk máximo).
   - Movimento do relógio: limites próprios do pulso (0 / 0,5 / 1), sem modelo treinado.
   - Pesos 60/20/20 com relógio; só celular (iPhone, Android sem relógio) = 100% movimento do celular. Modo atividade: movimento com metade do peso.
3. **Camada 3, fusão:** matriz 3×3 da orientação. O alerta automático só abre quando a matriz dá alto por 5 s contínuos (contagem regressiva de 10 s); moderado reforça o monitoramento em silêncio; baixo não faz nada. Um pico forte do celular (≥ 2,8 g na janela) não abre alerta sozinho: entra na Camada 2 como movimento do celular = 1 e passa pela matriz. Só o SOS manual é imediato.
4. Cada avaliação vai para `risk_assessments` (RLS por usuária) com nível, faixa e origem do contexto e modo de sensores — sem a nota da célula nem o bairro.

## Treino e avaliação do Isolation Forest (modelo `uci-har-motion-if-v2`)

O modelo foi treinado só com atividades cotidianas do UCI HAR (andar, subir/descer escadas, sentar, ficar em pé e deitar). O treino usa 7.352 janelas; 1.201 janelas de quatro participantes calibram os limites (percentis 95 e 99,5) e 1.746 janelas de outros cinco participantes avaliam a taxa de anomalias em atividades normais. No conjunto de avaliação, 1,49% excederam o limite moderado e 0,06% o alto. Os resultados por atividade estão em [`score_ml_evaluation.json`](score_ml_evaluation.json).

### Correção do jerk (v1 → v2, 18/10/2026)

Na v1, o script de treino multiplicava a diferença entre amostras vizinhas por 50 (a taxa original do UCI HAR) depois de reduzir o sinal a 10 Hz. O certo é 10, que é o que o app calcula (`mobile/utils/motionWindowFeatures.js`). O modelo aprendeu jerks 5× maiores que os que o app mede.

- **A avaliação offline de 1,49% tinha esse erro**, mas aplicado igual no treino e na avaliação. Como as features são padronizadas antes do Isolation Forest, um fator constante não muda o modelo: a v2 tem as mesmas árvores e limites e reproduz exatamente 1,49% / 0,06%. Esse número continua válido como medida offline.
- **O erro estava na integração com o app:** o app entregava ao modelo um jerk 5× menor que o do treino, uma combinação (movimento forte com jerk baixo) que o modelo nunca tinha visto. Caminhada normal parecia anômala no celular.

### Alertas falsos estimados numa caminhada normal (modo só celular)

Simulação com as funções do próprio app, amostra a amostra, sobre o sinal contínuo do UCI HAR reduzido a 10 Hz, só com participantes fora do treino (32,9 min de caminhada: plano, subida e descida de escada). Contexto "alto" é o pior caso (ex.: bairro Mauá, em São Caetano do Sul).

| Contexto alto | Tempo em "alto" | Alto por ≥ 3 s | Alto por ≥ 5 s | Maior sequência de "alto" |
|---|---|---|---|---|
| v1 (jerk do app 5× menor que o do treino) | 13,3% | 16,4 alertas/h (IC 95% 7,5–31) | 7,3/h (2,0–19) | — |
| v2 (jerk igual nos dois) | 2,3% | 0/h (IC 95% 0–6,7) | 0/h (0–6,7) | 2,7 s |

Com a v2, a regra de 3 s ficava a 0,3 s do limite; a regra adotada é 5 s contínuos (decisão das autoras, 18/10/2026). Pico acima de 2,8 g não aconteceu em caminhada.

Limites dessa estimativa: são só 33 minutos (zero alertas significa até ~6,7/h com 95% de confiança); as gravações contínuas do UCI HAR têm ~13 s de mediana (máx. 22 s), o que corta sequências longas e impede avaliar regras de 10 s ou mais; o celular estava preso à cintura, não no bolso ou na bolsa. Não mede detecção de violência, emergência ou risco real.

## Próximos passos antes de uso operacional

- Testar no aparelho, com o celular no bolso e na bolsa, a taxa de "alto" em caminhada e transporte.
- Coleta de sessões representativas com BPM e acelerômetro só com aprovação ética (hoje não há; não coletar dados de participantes).
- Modelo próprio para o pulso (bases públicas com sensor de pulso) como trabalho futuro.

Treino reproduzível: `python3 data-processing/treinar_isolation_forest.py --download`.

Fonte: [UCI Human Activity Recognition Using Smartphones](https://archive.ics.uci.edu/dataset/240/human+activity+recognition+using+smartphones), DOI `10.24432/C54S4K`, licença CC BY 4.0.
