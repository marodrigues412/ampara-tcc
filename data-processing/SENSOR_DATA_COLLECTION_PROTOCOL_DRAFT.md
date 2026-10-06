# Rascunho: coleta controlada para a camada de sensores

Este documento é uma proposta para discutir com a orientação e com a instância
de ética aplicável. Não autoriza coleta, não substitui avaliação ética nem
define por si só uma base legal para tratamento de dados pessoais sensíveis.

## Objetivo

Avaliar, em ambiente controlado, se um detector não supervisionado identifica
janelas de sensores diferentes da rotina cotidiana da própria amostra. O
resultado significa apenas “padrão diferente do observado”; não estima
probabilidade de violência, não diagnostica condição de saúde e não aciona
serviços de emergência.

## Dados mínimos propostos

Cada linha representa uma janela de sensores. Calcular as features no aparelho
e exportar apenas as sete features, o rótulo amplo da sessão e identificadores
pseudônimos:

| Campo | Conteúdo |
| --- | --- |
| `participante_id` | Código aleatório, sem nome, e-mail, telefone ou matrícula |
| `sessao_id` | Código aleatório da sessão, sem data/hora absoluta |
| `condicao` | `normal` ou `anomalia_controlada` |
| `exposicao_segundos` | Duração exclusiva coberta pela janela; janelas sobrepostas não podem contar o mesmo tempo duas vezes |
| `heartRateBpm` | Batimento medido no relógio, se disponível |
| `heartRateZScore` | Desvio em relação à linha de base individual calculada localmente |
| `movementMeanMps2` | Média da intensidade de movimento da janela |
| `movementVariabilityMps2` | Variabilidade da intensidade de movimento |
| `movementPeakMps2` | Pico de intensidade de movimento |
| `speedMps` | Velocidade calculada localmente; não exportar coordenadas GPS |
| `speedDeltaMps` | Variação de velocidade calculada localmente |

Não coletar nem exportar: nome, contato, endereço, coordenadas, trajeto,
gravação de áudio/vídeo, amostras brutas contínuas de BPM/acelerômetro ou
identificadores de conta do aplicativo. Se o relógio ou uma feature não estiver
disponível, não estimar nem preencher: a janela fica fora do treino de sete
features e a indisponibilidade é contabilizada de forma agregada.

## Proposta de sessões

1. **Rotina habitual:** atividades cotidianas leves escolhidas pela pessoa,
   sem instruir a participante a reproduzir situação de risco. Rotular como
   `normal`.
2. **Cenário simulado:** movimento ou mudança de rotina previamente aprovado
   pela orientação, realizado em ambiente seguro, com possibilidade de parar
   a qualquer momento. Rotular como `anomalia_controlada` somente se esse
   rótulo corresponder de fato ao protocolo. Não induzir medo, corrida perigosa,
   queda, contenção física, situação de violência ou esforço incompatível com
   a saúde da pessoa.
3. Registrar apenas a condição ampla e duração monitorada. Não guardar hora
   absoluta ou descrição livre que possa revelar identidade ou situação íntima.
4. Fixar a duração da janela, taxa de amostragem, critérios de qualidade,
   intervalo entre sessões e definição operacional de cada cenário antes da
   coleta. O extrator atual usa 10 segundos como padrão técnico, mas essa
   escolha ainda deve ser validada com a orientação.

## Separação de dados e avaliação

- Ajustar o Isolation Forest apenas com janelas `normal` dos participantes de
  treino. Manter participantes inteiros separados entre treino, calibração e
  teste; nunca repartir janelas aleatoriamente do mesmo participante entre
  essas partes.
- Calibrar o limiar em participantes separados do treino. Reservar outros
  participantes para teste final.
- Reportar falsos positivos em janelas normais, recall, precisão e F1 para
  cenários controlados, além de janelas normais sinalizadas por hora usando
  somente tempo monitorado exclusivo e não sobreposto. Definir e validar uma
  regra temporal para agrupar janelas consecutivas em episódios de alerta antes
  de reportar alertas por hora. Se não houver amostra de cenário
  controlado, não reportar recall/precisão/F1 como evidência de detecção.
- Calcular o tamanho de amostra com a orientação. O mínimo técnico de seis
  participantes aceito pelo script serve apenas para formar partições; não é
  justificativa estatística de suficiência nem evidência de validade.
- Avaliar resultados por disponibilidade do relógio e do GPS. Não tratar
  desempenho observado em um aparelho como generalizável a outros modelos.

## Salvaguardas a aprovar antes da coleta

- Objetivo e necessidade de cada dado; aviso claro antes de pedir permissões;
  participação voluntária e retirada sem prejuízo.
- Aprovação da orientação e da instância ética aplicável, além da definição
  documentada da base legal e das responsabilidades pelo tratamento.
- Armazenamento local temporário e transferência criptografada para ambiente
  restrito, se a transferência for aprovada; tabela que liga códigos à
  identidade separada das medições e acessível somente à pessoa responsável.
- Prazo de retenção, procedimento de exclusão dos dados e dos artefatos,
  controle de acesso, resposta a incidentes e regra para publicação de
  resultados agregados.
- Nenhuma coleta de dados de usuárias reais do app, treino em produção,
  persistência no Supabase ou envio a terceiros como consequência automática
  deste protótipo.

## Decisões em aberto para a orientação

- Janela e cadência definitivas; critérios de sinal válido e baseline de BPM.
- Cenários simulados permitidos e definição operacional da classe positiva.
- Quantidade de participantes/sessões e cálculo de suficiência estatística.
- Plataforma de armazenamento, responsáveis, prazo de retenção e processo de
  eliminação.
- Se e como transformar o escore de anomalia em nível corporal para a matriz
  de fusão. Até essa decisão e validação, as camadas não devem ser fundidas em
  alertas apresentados como risco confiável.
