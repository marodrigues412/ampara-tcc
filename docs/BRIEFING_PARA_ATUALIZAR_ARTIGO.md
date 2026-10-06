# Briefing de contexto para atualizar o artigo do AMPARA

**Finalidade:** entregar o estado do projeto a outra IA para que ela atualize o artigo existente sem inventar resultados nem confundir o aplicativo atual com a proposta de ML.

**Atualizado em:** 5 de outubro de 2026.
**Fonte principal:** código e arquivos de trabalho locais do repositório `ampara-tcc`, branch `feat/modelo-ml-risco`, além de resultados de consultas ao Supabase compartilhados pelas autoras nesta conversa. O banco não foi consultado novamente para este briefing.

## Instrução central à IA que receber este material

O manuscrito antigo está desatualizado em relação ao estado mais recente do projeto e **não deve ser usado como fonte factual nem como base para descrever implementação, método, dados ou resultados**. Se ele for fornecido, use-o somente como alvo de edição para identificar estrutura formal, autoria, tema e requisitos acadêmicos que ainda se aplicam; substitua afirmações técnicas antigas com evidências atuais do repositório e deste briefing. Não preserve conteúdo apenas porque consta no artigo antigo. Não há manuscrito Word, PDF ou LaTeX versionado neste repositório. A pasta `artigo/` contém imagens de fluxo de dados e identidade visual, não o texto do artigo.

Não trate a orientação do professor, o README antigo, o protótipo, os resultados exploratórios ou código ainda local como se fossem evidência de validação. Diferencie no texto: (1) funcionalidades implementadas; (2) auditorias e experimentos exploratórios; (3) método proposto ainda não treinado/validado; (4) trabalho futuro. Não invente referências, resultados, aprovação ética, conformidade legal, desempenho, cobertura geográfica ou testes em participantes. Quando faltar uma evidência, deixe uma pergunta/placeholder para as autoras em vez de preencher por suposição.

## Identificação e objetivo

O AMPARA é um Trabalho de Conclusão de Curso do Instituto Mauá de Tecnologia, desenvolvido por Amanda Herculano e Maria Eduarda Rodrigues. É um aplicativo móvel de apoio preventivo à segurança de mulheres. A proposta combina informações contextuais e sinais comportamentais para apoiar a usuária durante deslocamentos, com recursos de contatos de emergência, locais seguros, mapa, registro comunitário e SOS.

O sistema não deve ser descrito como detector de agressão, dispositivo médico, serviço de vigilância garantida ou substituto de ajuda humana. A formulação mais fiel é “apoio contextual à segurança” e, para a camada corporal proposta, “detecção de anomalias em relação a padrões observados”.

## Estado do repositório e artefatos

- A branch atual é `feat/modelo-ml-risco`. O `HEAD` observado é `3cd77b3` (`chore: atualiza lockfile mobile`); o ponteiro local de `main` coincide com esse commit.
- Há alterações e arquivos não commitados no diretório de trabalho, incluindo o trabalho de preparação de ML, o mapa contextual local e um diretório `mobile/android 2/`. Portanto, não afirmar que todo esse trabalho está na `main`, no GitHub ou publicado.
- O manuscrito do artigo não está no repositório. `artigo/` contém `Fluxo Dados.png` e quatro imagens de identidade visual. A autora informou que a versão disponível do artigo está desatualizada; não usar suas afirmações técnicas como evidência nem copiar resultados sem verificação independente.
- Há arquivos SSP brutos locais ignorados pelo Git e um CSV local `data-processing/ssp.csv`; esses dados não devem ser incluídos em prompts públicos ou enviados a serviços externos sem autorização e minimização. Não usar arquivos locais de build/configuração como fonte de conteúdo do artigo.
- O `README.md` raiz está desatualizado: ainda apresenta batimentos/smartwatch como trabalho futuro, embora exista integração experimental Wear OS. Para descrever o estado atual, conferir os arquivos de código apontados abaixo e registrar limitações.

## O que existe no produto

### Aplicativo móvel

O app é React Native com Expo/Expo Router (`mobile/`). Há cadastro/login, perfil, contatos de emergência, locais seguros, modo atividade, mapa de crimes e relatos comunitários, histórico/relatos, fluxo SOS e score heurístico. O app consulta Supabase; a localização pode ser gravada em `location_history` com latitude, longitude, velocidade e score. O envio SOS usa uma função AWS Lambda e pode compartilhar a localização com contatos cadastrados. Não dizer que toda informação fica apenas no aparelho. O site em `site/` é uma página institucional/marketing em Astro; afirmações promocionais ali não constituem evidência de desempenho ou validação do sistema.

O mapa usa busca de crimes próximos via RPC `nearby_crimes`, ordenada por distância no banco, e relatos comunitários via `nearby_occurrences`. A configuração diferencia renderização nativa/plataforma: MapLibre no Android e `react-native-maps` no iOS. O mapa exibe pontos próximos e filtros de ano/categoria; sua presença no app não significa que o score contextual novo de bairro×período já o alimenta.

### Wear OS / smartwatch

Existe um app nativo Android Wear OS (`watch/`) integrado diretamente ao Samsung Health Sensor SDK para leitura contínua de frequência cardíaca e ao Wearable Data Layer para enviar eventos ao celular. O celular tem módulo Expo nativo em `mobile/modules/ampara-watch/`. Há também caminho de leitura via Health Connect, como alternativa/histórico no Android. A idade da leitura é considerada para diferenciar valor ao vivo de leitura antiga; o app mostra estado de monitoramento/conexão.

Essa integração requer build Android de desenvolvimento/produção que contenha o módulo nativo; Expo Go não inclui essa integração nativa do relógio. O README do relógio descreve teste em Galaxy Watch 5 e celular Android, permissões e dependência Samsung distribuída por licença. A integração direta com Wear OS não está disponível no iPhone. A experiência principal do app continua sendo multiplataforma, mas sem conexão direta com esse relógio no iOS.

O código do relógio também calcula sinais de movimento (RMS, pico, jerk e número de amostras) e os envia ao app. Isso é diferente de ler o acelerômetro do telefone. Existe regra heurística para ponderar movimento do telefone e do relógio (`mobile/utils/motionRiskScore.js`), mas não é um modelo de ML treinado.

### Scores atuais versus proposta de ML

Não descrever um único “score inteligente” como se todas as partes já estivessem integradas. `mobile/screens/Home.js` contém um score heurístico de ambiente/movimento em escala 0–10. `mobile/hooks/useRiskDetection.js` mantém outro cálculo heurístico legado em escala 0–100; a leitura do código indicou que ele usa crimes próximos de um JSON mock e passa `bpmPanico: false`, portanto não afirmar que esse cálculo usa o batimento cardíaco. Conferir no código atual quais telas e alertas consomem cada caminho antes de descrever o comportamento do produto. A camada contextual por bairro/período, o Isolation Forest e a nova matriz de fusão são protótipos/proposta, não integrados ao score de produção.

### Banco e serviços

O backend usa Supabase Auth/PostgreSQL. O SQL do projeto define tabelas para perfil, contatos de emergência, locais seguros, estado de atividade, ocorrências comunitárias, histórico de localização e logs de alerta. Há políticas RLS por usuária em SQL versionado. A tabela `crime_occurrences` armazena dados da SSP e `ssp_imported_months` controla importações mensais. O código versionado não basta para provar que a configuração de produção está atualizada; não declarar isso sem verificação.

Há workflow GitHub Actions agendado para importar dados SSP-SP ao Supabase, além de disparo manual (`.github/workflows/atualizar-ssp-supabase.yml`). O workflow lê a senha de banco de um secret, que não deve ser incluído neste briefing/artigo. Ocorreram falhas de autenticação em execuções anteriores; a usuária relatou ter rotacionado a senha e compartilhou uma execução manual bem-sucedida. O estado atual da automação precisa ser confirmado no GitHub antes de afirmar que está operacional continuamente.

## O que já foi feito no trabalho de dados

### Cobertura SSP-SP

O escopo que foi auditado é um recorte de **nove municípios selecionados** da RMSP: Barueri, Diadema, Guarulhos, Mauá, Osasco, Santo André, São Bernardo do Campo, São Caetano do Sul e São Paulo. Isso não representa os 39 municípios da RMSP nem o Estado inteiro.

Um backfill seletivo de Santo André foi implementado e executado; resultados compartilhados pelas autoras indicaram 87.011 linhas adicionais em 55 meses. O relatório de preparação registra **2.177.992 registros, janeiro de 2022 a julho de 2026, em nove municípios**, como fotografia daquele momento. Em consultas posteriores, as autoras compartilharam agregados que incluem **oito meses de 2026**; os números e a data final variam conforme consulta/recorte. Antes de publicar uma tabela definitiva, reexecutar no banco atual a contagem total, período máximo, municípios, meses e filtros usados, e guardar a consulta/resultados reproduzíveis.

O CSV local `data-processing/ssp.csv` tem 279.994 registros de janeiro a março de 2026 segundo a auditoria existente; sua cobertura/filtro não é equivalente à tabela maior do Supabase. Não apresentar o CSV como toda a base.

Achados de qualidade que devem aparecer como limitações:

- Maio de 2022 apresentou apenas 3.482 registros em um dos snapshots auditados, muito abaixo dos meses vizinhos; investigar como possível lacuna de extração/importação, não como redução comprovada de criminalidade.
- O importador descarta registros sem coordenadas utilizáveis; por isso, ausência de coordenadas na tabela importada não mede a cobertura de geocodificação da fonte original.
- `tipo_local` não existe nos arquivos SSP de 2022–2024 e aparece em 2025 em diante. É uma lacuna estrutural do arquivo fonte; o zero histórico em filtros baseados nesse campo não significa que não houve crime naquele local.
- Rubrica, natureza apurada e outras taxonomias podem divergir. Busca por palavra-chave em um ou ambos os campos não é uma classificação validada. Furtos, crimes de trânsito culposos, tráfico/apreensão, lesão intencional e violência sexual precisam de escopo próprio e pares conflitantes não devem ser resolvidos silenciosamente.
- “Delegacia da Mulher/DDM” identifica a delegacia registradora; não é, por si só, categoria de crime nem medida validada de gravidade.
- Há campos de período ausentes e a disponibilidade varia por ano/mês. Períodos em branco e “em hora incerta” devem permanecer desconhecidos salvo método explicitamente aprovado.

### Preparação temporal e taxonomia

`data-processing/derive_ssp_period.py` normaliza os quatro períodos (madrugada, manhã, tarde, noite), pode derivar o período a partir da hora somente quando o rótulo está vazio e preserva proveniência (`informado`, `derivado_da_hora`, desconhecido). Não altera Supabase nem score do app. Os limites testados são 00–05 madrugada, 06–11 manhã, 12–17 tarde e 18–23 noite. Em janeiro de 2026, as autoras compartilharam **24.670 pares válidos e 24.670 concordantes** entre período informado e período pela hora. A extrapolação dessa regra a anos anteriores é uma hipótese operacional, não validação independente para cada ano.

Foram criadas consultas SQL agregadas para revisar qualidade mensal, rótulos, subtipo de local, categorias de crime, período e pares de rubrica/natureza. Resultados antigos de prévia contextual foram gerados antes do backfill e com oito municípios; não os misturar com a fotografia posterior de nove municípios. Existem consultas de auditoria em `data/ssp_*_audit.sql` e documentação mais detalhada em `data-processing/RELATORIO_ANALISE_PREPARACAO_ML.md`.

## Método orientado pelo professor

A orientação acadêmica fornecida pelas autoras (`Orientacao_TCC_Ampara (2).docx`) descreve três camadas. Reanexar esse DOCX à outra IA se ela precisar conferir a formulação literal.

1. **Contexto de criminalidade:** localização/região e tempo, com categorias e pesos de gravidade; a orientação dá como exemplos feminicídio=10, estupro=8, lesão corporal intencional=5 e roubo=3. Esses pesos são exemplos do professor, ainda não uma escala validada pelas autoras. A orientação menciona período e dia da semana; a unidade final de agregação precisa ser justificada.
2. **Anomalia corporal:** Isolation Forest ajustado sobre janelas consideradas normais. As sete features propostas e extraídas em código são frequência cardíaca, z-score individual da frequência cardíaca, média/variabilidade/pico do movimento, velocidade GPS e variação da velocidade.
3. **Fusão:** matriz explícita 3×3, preservada em `data-processing/risk_fusion.py`: baixo/baixo→baixo; baixo/médio→baixo; baixo/alto→moderado; médio/baixo→baixo; médio/médio→moderado; médio/alto→alto; alto/baixo→moderado; alto/médio→alto; alto/alto→alto. Ausência de qualquer camada resulta em “indisponível”, não se imputa risco baixo.

### Camada contextual atual

`data-processing/build_context_risk_map.py` foi criado como protótipo local agregador. Ele agrupa dados em município×bairro×dia da semana×período; preserva só células com pelo menos cinco registros; suprime contagem DDM abaixo de cinco; não exporta coordenadas/endereço/boletim. Usa mapeamento textual provisório, períodos reconhecidos (não adivinha os desconhecidos) e alguns pesos exemplificados pelo professor. A execução anteriormente resumida produziu 3.405 células em oito dos nove municípios, sem células publicáveis de São Caetano do Sul. Uma célula ausente significa indisponível, nunca “segura”.

Esse CSV é artefato local não versionado (`data/processed/context_risk_map.csv`), exploratório e não alimenta o app, banco ou alertas. Mapeamento de categorias, tratamento de divergências, pesos, vieses do dado, divisão dos quantis, limiar mínimo e estabilidade temporal ainda exigem revisão. Não publicar os níveis gerados como risco validado.

### Experimento agregado separado

Foi executado pelas autoras um experimento exploratório de previsão de contagens mensais agregadas por município para um grupo provisório “violência interpessoal”. A execução usou um arquivo agregado temporário compartilhado localmente, com nove municípios e oito meses de teste de 2026; não é o detector de sensores e não estima risco individual. Resultado então apresentado:

| Referência | MAE de contagens | RMSE de contagens | Observações |
| --- | ---: | ---: | ---: |
| Regressor Poisson | 30,509 | 50,676 | 72 |
| Persistência (mês anterior) | 26,722 | 67,140 | 72 |
| Mesmo mês do ano anterior | 46,194 | 108,986 | 72 |
| Média histórica do mês-calendário | 76,670 | 170,436 | 72 |

O baseline de persistência teve MAE menor que Poisson nesse teste. Isso não demonstra superioridade de modelo, associação causal nem risco para indivíduos. O grupo alvo e taxonomia são provisórios; o CSV de entrada e a execução precisam ser preservados/reproduzidos antes de usar as métricas no artigo. O script é `data-processing/train_ssp_city_month_model.py`; não há modelo final salvo.

### Camada corporal e fusão ainda não concluídas

`mobile/services/sensorFeatureWindows.js` extrai as sete features em memória, sem persistência, log ou rede. O padrão de janela é 10 s; batimento/velocidade têm verificações de atualidade; z-score exige ao menos 20 amostras anteriores numa hora; movimento é uma proxy calculada após centralizar eixos, ainda sem validação em dispositivos reais. Missing/stale permanece `null`. O extrator ainda não está integrado a uma coleta de pesquisa nem ao score da aplicação.

UCI-HAR inclui janelas de movimento do celular, mas não frequência cardíaca nem GPS; pode apoiar um protótipo de movimento, não treinar honestamente o modelo completo de sete variáveis. Não preencher as features ausentes com valores inventados.

Foi preparado `data-processing/train_sensor_anomaly_model.py`, que exige CSV autorizado com as sete features, pseudônimos de participante/sessão, rótulo `normal`/`anomalia_controlada` e exposição exclusiva em segundos. Separa participantes entre ajuste, calibração e teste; Isolation Forest é ajustado somente em janelas normais; calcula métricas somente se o teste contém cenários controlados. O escore de anomalia não é probabilidade de agressão e não foi calibrado para a matriz de fusão. O template vazio é `data-processing/sensor_feature_template.csv`. Nenhum dado real de sensor foi treinado com esse script e nenhum modelo foi persistido.

O mínimo técnico de seis participantes aceito pelo script serve apenas para formar partições; não prova suficiência estatística. O avaliador informa janelas normais sinalizadas por hora, não episódios de alerta; uma regra temporal para unir janelas consecutivas continua pendente.

## Privacidade, segurança e ética

O projeto lida ou pode lidar com dados de localização, contatos e dados de saúde derivados de sensores. No app atual, o histórico de localização pode ser persistido e a posição pode ser compartilhada durante alertas. Portanto, não afirmar que o produto inteiro é “local-only”, anônimo ou conforme à LGPD sem avaliação e evidência.

As análises de SSP para ML foram planejadas para exportar somente agregados regionais/temporais e não endereços, coordenadas exatas ou número de boletim. A camada de sensores deve manter BPM/acelerômetro brutos no dispositivo por padrão, derivar features localmente, não enviar GPS exato ao treino e não usar dados de usuárias de produção. Antes de qualquer coleta/persistência de features de saúde: aprovação da orientação e da instância ética aplicável, avaliação da base legal, aviso claro, participação voluntária/retirada, finalidade, minimização, controle de acesso, retenção e exclusão. O protocolo existente é apenas rascunho: `data-processing/SENSOR_DATA_COLLECTION_PROTOCOL_DRAFT.md`; não é aprovação ética ou parecer jurídico.

## Testes e evidência técnica

Na última verificação local compartilhada, a suíte Python em `data-processing` teve 29 testes passando; os testes do extrator móvel tiveram 7 passando. São testes unitários de regras/parsing/matriz/código com dados de teste, não validação com participantes, estudo clínico, teste de efetividade de SOS ou avaliação de segurança. O treinamento de sensores não foi executado com dados reais.

Antes de declarar o MVP plenamente funcional, revisar também o estado de execução atual. Durante a leitura do `mobile/screens/Home.js` foi observado que a constante `watchMotionDetail` aparenta referenciar `smartwatchConnected` antes da declaração da própria constante no mesmo escopo; confirmar/corrigir e testar, pois `const` em JavaScript tem zona temporal morta. Não usar a leitura de código como evidência de que o app foi validado em todos os aparelhos.

## Arquivos de referência para a próxima IA

- `README.md`: descrição geral e instalação, mas desatualizado em smartwatch/ML.
- `mobile/screens/Home.js`, `mobile/hooks/useRiskDetection.js`: tela inicial e score atualmente integrado.
- `mobile/hooks/useSmartwatch.js`, `mobile/services/watchHeartRateService.js`, `mobile/services/healthConnectService.js`, `mobile/modules/ampara-watch/` e `watch/`: integração Android/Wear OS.
- `mobile/services/crimesService.js`, `mobile/services/locationService.js`, `mobile/services/alertService.js`: mapa, localização e SOS.
- `data/criacaoTabelas.sql`, `data/ssp_importacao.sql`, `data/nearby_functions.sql`, `data/rls_comunidade.sql`: estrutura e consultas do banco.
- `.github/workflows/atualizar-ssp-supabase.yml`, `data-processing/importar_ssp_supabase.py`: atualização SSP automatizada.
- `data-processing/RELATORIO_ANALISE_PREPARACAO_ML.md`: auditorias anteriores, com distinção temporal de snapshots.
- `data-processing/ML_PRIVACY_AND_READINESS.md`: limitações e portas de privacidade/método.
- `data-processing/SENSOR_DATA_COLLECTION_PROTOCOL_DRAFT.md`: protocolo proposto ainda pendente de aprovação.
- `data-processing/risk_fusion.py`, `data-processing/build_context_risk_map.py`, `data-processing/train_sensor_anomaly_model.py`, `data-processing/train_ssp_city_month_model.py`: protótipos de ML e análises.
- `mobile/package.json`, `mobile/app.json`: dependências e plataformas/build.

## Pendências antes de fechar o artigo

1. Solicitar o arquivo do artigo desatualizado apenas como alvo de edição/guia de estrutura e obter as instruções formais vigentes do curso/periódico. Não usar o conteúdo técnico antigo como fonte; reconstruir essas seções com evidências atuais e marcar lacunas para as autoras.
2. Recalcular os números SSP na base atual com consultas reprodutíveis; declarar datas, filtros, nove municípios e meses efetivamente disponíveis.
3. Resolver/classificar a taxonomia criminal com a orientação; explicitar dados ausentes, conflitos e categorias excluídas/separadas.
4. Decidir o agrupamento contextual e os pesos como escolhas do estudo, testar supressão/viés e não chamar nível de contexto de probabilidade de vitimização.
5. Revisar o score heurístico já implementado versus o novo método proposto; não descrever o Isolation Forest/fusão como implementados no produto.
6. Revisar metodologia de pesquisa, protocolo ético/LGPD e referências bibliográficas com as autoras/orientador. Não coletar dados de participantes até a aprovação apropriada.
7. Reproduzir os resultados do experimento Poisson a partir de arquivo documentado, com baselines e limitação de rótulo; se não for reproduzível, remover números do artigo.
8. Revisar e testar o app atual (incluindo potencial ordem de declaração em `Home.js`); descrever matriz real de suporte Android/iOS, Expo Go e build nativo.
9. Atualizar conclusão, limitações e trabalhos futuros para refletir que o modelo corporal e sua avaliação real ainda estão pendentes.

## Prompt pronto para usar com outra IA

“O artigo que vou anexar está desatualizado. Use-o somente como alvo de edição e referência de estrutura, autoria e exigências formais que ainda forem válidas; não use suas afirmações técnicas, dados ou resultados como fonte factual. Reconstrua o estado do projeto usando este briefing e evidências atuais do repositório, apontando conflitos e incertezas. Não aceite o README antigo como estado atual quando houver conflito com código mais recente. Separe funcionalidades implementadas, protótipos, experimentos exploratórios e trabalho futuro. Não invente amostras, referências, resultados, validação, aprovação ética ou conformidade LGPD. Os números SSP e Poisson deste briefing são snapshots/resultados exploratórios e devem ser reproduzidos antes de virarem resultados finais. O Isolation Forest de sete features, o mapa contextual e a matriz de fusão ainda não foram validados nem integrados ao produto. Verifique também quais scores heurísticos são realmente usados em cada fluxo e não afirme que o score legado usa batimento cardíaco sem evidência. Marque lacunas com perguntas para mim, não preencha por suposição. Antes de reescrever, apresente uma lista curta das seções desatualizadas e das evidências atuais que pretende usar; depois proponha a nova versão respeitando as exigências vigentes do orientador.”
