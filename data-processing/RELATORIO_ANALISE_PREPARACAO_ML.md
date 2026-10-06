# Relatório de análise e preparação para ML

**Projeto:** Ampara TCC
**Escopo:** auditoria dos dados SSP e preparação metodológica inicial. Este relatório não documenta um modelo treinado.

## Síntese

Neste trabalho, analisamos a possibilidade de derivar a faixa de período (madrugada, manhã, tarde ou noite) a partir de `hora_ocorrencia` quando o rótulo `periodo` está vazio. Os limites observados concordaram com os rótulos disponíveis em janeiro de 2026. Para a preparação exploratória, adotamos essa regra preservando o valor original e identificando explicitamente os períodos derivados.

Como os pares preenchidos de período e hora disponíveis concentram-se em janeiro de 2026, a extensão da regra a anos anteriores é uma hipótese operacional do estudo, não uma validação empírica independente para cada ano. Mantemos rótulos explícitos “em hora incerta” e registros sem hora válida como desconhecidos.

O mapeamento final das categorias criminais e seus pesos também não está validado. Portanto, ainda não se deve calcular score contextual ponderado nem conectá-lo aos alertas do app.

## O que a orientação do professor pede

A proposta recebida descreve três camadas:

1. **Contexto criminal:** agregar ocorrências por região e período, com classificação/ponderação de gravidade.
2. **Anomalia dos sensores:** avaliar comportamento dos sensores em relação ao padrão, com Isolation Forest como modelo proposto e as features indicadas na orientação.
3. **Fusão:** combinar as camadas de contexto e sensores conforme a matriz descrita pelo professor.

O trabalho feito até aqui está na preparação e validação dos dados. Nenhum modelo foi treinado, e o score heurístico, os alertas e a lógica do app não foram alterados.

## Cobertura SSP observada

Após o backfill de Santo André, `public.crime_occurrences` cobre janeiro de 2022 a julho de 2026 e soma **2.177.992 registros em nove municípios selecionados**: Barueri, Diadema, Guarulhos, Mauá, Osasco, Santo André, São Bernardo do Campo, São Caetano do Sul e São Paulo. Esse recorte corresponde a 9 dos 39 municípios da Região Metropolitana de São Paulo (RMSP), não à RMSP inteira nem ao estado.

As tabelas de distribuição temporal e a primeira prévia contextual abaixo foram geradas antes do backfill, quando a base tinha oito municípios e 2.090.981 registros. Elas documentam a auditoria inicial e não devem ser tratadas como retrato atualizado da base de nove municípios; precisamos reexecutar essas agregações antes de treinar ou avaliar qualquer modelo.

| Ano | Registros | Período reconhecido | Período vazio, com hora utilizável | Vazio sem hora | “Hora incerta” |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2022 | 433.478 | 76.052 | 302.687 | 44.754 | 9.985 |
| 2023 | 483.978 | 139.143 | 340.809 | 0 | 4.026 |
| 2024 | 459.247 | 131.451 | 324.062 | 1 | 3.733 |
| 2025 | 449.303 | 126.762 | 319.103 | 0 | 3.438 |
| 2026 até julho | 264.975 | 110.762 | 152.393 | 0 | 1.820 |
| **Total** | **2.090.981** | **584.170** | **1.439.054** | **44.755** | **23.002** |

“Período vazio, com hora utilizável” é a contagem de registros que recebem uma faixa derivada na preparação exploratória, sem sobrescrever o campo original. A hora é validada pelo formato `HH:MM` ou `HH:MM:SS` e pela faixa de 00 a 23. No conjunto auditado, **1.439.054 registros (68,8%)** são candidatos à derivação; **44.755** permanecem desconhecidos por não terem hora válida e **23.002** permanecem desconhecidos por estarem explicitamente marcados como “em hora incerta”.

## Validação do período pela hora

Os registros SSP com rótulo conhecido em janeiro de 2026 concordaram com estas faixas:

| Hora registrada | Período correspondente |
| --- | --- |
| 00:00–05:59 | Madrugada |
| 06:00–11:59 | Manhã |
| 12:00–17:59 | Tarde |
| 18:00–23:59 | Noite |

A consulta cruzada restrita a janeiro de 2026 encontrou **24.670 pares válidos e 24.670 concordâncias**, sem divergências. Os pares observados seguem os mesmos limites nos quatro períodos. Como não há pares preenchidos em quantidade equivalente nos outros anos, registramos a extensão dessa regra ao histórico como uma hipótese de preparação, a ser considerada na análise de limitações.

Em fevereiro de 2026, **24.305 registros** estavam sem `periodo`, mas com `hora_ocorrencia`; todos os registros vazios com período no recorte janeiro–julho de 2026 tinham hora válida, segundo a auditoria mensal.

Implementação exploratória em `data-processing/derive_ssp_period.py`:

- preserva rótulos SSP reconhecidos como `informado`;
- deriva uma categoria somente quando `periodo` está vazio e a hora é válida, marcando-a `derivado_da_hora`;
- mantém “em hora incerta” como desconhecido, mesmo que exista valor em outro campo;
- mantém como desconhecidos os casos sem hora válida;
- não grava dados, não altera a tabela Supabase e não alimenta o score ou alertas.

Os cinco testes unitários dessa função passaram. Ela ainda não está conectada à ingestão nem à aplicação.

## Verificação no CSV local

Também executamos a auditoria agregada sobre o arquivo `data-processing/ssp.csv`, que contém **279.994 registros de janeiro a março de 2026**. Nesse arquivo, a função classificou períodos informados, períodos derivados pela hora e casos desconhecidos, sem imprimir ou exportar linhas individuais:

| Mês de 2026 | Período informado | Derivado pela hora | Desconhecido (“hora incerta”) |
| --- | ---: | ---: | ---: |
| Janeiro | 88.058 | 763 | 2.975 |
| Fevereiro | 23.317 | 63.424 | 2.542 |
| Março | 24.789 | 71.239 | 2.887 |

O CSV local e a tabela Supabase têm coberturas geográficas e filtros diferentes; por isso, não comparamos diretamente suas contagens. A execução serve para verificar a regra no arquivo local e confirmar que a auditoria produz apenas agregados. Os seis testes unitários da função passaram.

## Primeira prévia contextual do Supabase

A consulta de prévia anterior ao backfill produziu **93.907 células agregadas** em 8 municípios e 888 bairros. As células agrupam ano, mês, município, bairro, período, proveniência e rótulo original de natureza apurada. O menor grupo exportado tem cinco ocorrências, conforme o limite de supressão.

As células exportadas somam **1.306.798 ocorrências**. Em comparação com os **2.090.981 registros** da auditoria mensal anterior, cerca de **784.183 (37,5%)** não aparecem na prévia por causa do limite `HAVING count(*) >= 5`. Essa diferença significa que não podemos somar ou usar diretamente a prévia como medida completa de risco; precisamos mudar a estratégia de divulgação/agregação para evitar subcontagem sistemática.

Na auditoria inicial, a tabela tinha apenas oito municípios. A consulta ao controle de importação confirmou, para cada um dos 55 meses, que `row_count` coincidia com a quantidade na tabela, mas essa igualdade não comprovava cobertura geográfica completa: ambos refletiam a mesma carga incompleta. O código do importador também explica como a lacuna persistiu: meses com qualquer dado existente são ignorados nas execuções incrementais.

Comparamos os arquivos SSP de 2022 a 2026 com o Supabase e identificamos **87.011 registros elegíveis de Santo André** em 55 meses. O backfill seletivo foi concluído: as verificações antes e depois da gravação confirmaram ausência prévia da cidade, correspondência das contagens mensais e consistência entre tabela e controle de importação. Uma execução repetida foi interrompida automaticamente ao detectar registros existentes, sem duplicá-los. O total passou de 2.090.981 para **2.177.992 registros**. A rotina não apagou dados dos demais municípios.

O escopo permanece limitado aos nove municípios selecionados. Criamos `data-processing/preview_ssp_city_backfill.py` para a comparação somente de leitura e `data-processing/backfill_ssp_city.py` para a recuperação transacional com validações explícitas.

Por esses motivos, tratamos essa consulta como diagnóstico de estrutura e privacidade, não como tabela final de risco. Não aplicamos os pesos do score a esses resultados.

## Outras questões de qualidade e interpretação

### Coordenadas

A auditoria no Supabase encontrou zero coordenadas ausentes entre os registros importados. Isso decorre do próprio importador, que descarta registros com latitude/longitude nulas ou zero antes da inserção. Portanto, não mede a proporção de registros geocodificados no arquivo SSP original e não deve ser relatado como cobertura completa da fonte.

### Cobertura mensal

Maio de 2022 tem **3.482 registros**, muito abaixo dos meses vizinhos. Deve ser investigado como possível problema de carga/cobertura, não interpretado como uma queda real da criminalidade. Os totais do banco correspondem à seleção de municípios feita pelo importador.

### Classificação de crimes

A busca por palavras em `rubrica` **ou** `natureza_apurada` não é uma classificação validada. A auditoria encontrou pares conflitantes, como rubrica de roubo com natureza apurada de furto. A consulta ampla também não encontrou rótulos para estupro ou ameaça; isso não prova que não ocorreram, podendo indicar diferença de nomenclatura/campos ou falha do filtro.

Também precisamos revisar tipos de ocorrência que não representam necessariamente violência intencional contra a mulher, como ocorrências de trânsito. A decisão deve seguir a pergunta do modelo: crimes violentos pertinentes podem compor o sinal principal; perigos viários, se considerados, devem ficar em uma camada contextual separada; tipos fora do escopo não devem influenciar o sinal de violência. A consulta de triagem por palavras-chave serve apenas para localizar combinações a revisar, não para classificar automaticamente.

Na triagem agregada por `rubrica` e `natureza_apurada`, pelo menos **90.257 registros** apareceram em combinações com cinco ou mais casos sinalizadas como possivelmente ligadas ao trânsito; a maioria corresponde a lesão corporal culposa por acidente de trânsito. O número é um limite inferior, pois combinações menores foram suprimidas. A consulta anual confirmou que `tipo_local` está ausente em 100% dos registros de 2022 a 2024, com preenchimento praticamente completo a partir de 2025. A inspeção dos cabeçalhos dos arquivos originais da SSP confirmou que `DESCR_TIPOLOCAL` não existe nas abas de 2022–2024 e passa a existir em 2025; portanto, essa lacuna é estrutural na fonte, não uma falha do importador. O zero histórico no filtro de roubo em via pública não significa ausência de roubos. O campo `subtipo_local` contém “Via Pública” em todos os anos. Entre esses registros, a busca exploratória encontrou sinal de roubo em ambos os campos em 153.947 casos em 2022, 152.509 em 2023, 129.924 em 2024, 109.243 em 2025 e 59.225 em 2026 (período parcial). Entre registros com sinal em pelo menos um campo, a concordância foi de aproximadamente 99,7% a 100%.

Na separação dos pares de rótulos em “Via Pública”, os sinais concordantes mais frequentes são `ROUBO - OUTROS`, `ROUBO DE VEÍCULO` e `ROUBO DE CARGA`. `LATROCÍNIO` aparece como natureza apurada em registros cuja rubrica contém “Roubo”; por isso, não pode ser perdido por uma regra que só procura a palavra “roubo” na natureza e deve permanecer como classe própria. Também existem conflitos, como rubrica de roubo com natureza de furto ou tentativa de homicídio, e natureza de roubo com rubrica de furto ou de localização/entrega de veículo. Esses conflitos não recebem rótulo automático. Para a análise, mantemos provisoriamente roubo comum, roubo de veículo, roubo de carga e latrocínio separados; isso não define pesos nem os incorpora ainda a um score.

A triagem seguinte lista todas as naturezas apuradas em subtipos “Via Pública”, para revisar os tipos não violentos ou de trânsito e distinguir o sinal de violência de possíveis riscos viários.

O inventário agregado das naturezas em “Via Pública” destaca, entre os grupos exibidos, `FURTO - OUTROS` (841.532), `ROUBO - OUTROS` (522.332), `FURTO DE VEÍCULO` (203.973), `LESÃO CORPORAL DOLOSA` (91.593), `LESÃO CORPORAL CULPOSA POR ACIDENTE DE TRÂNSITO` (82.520), `ROUBO DE VEÍCULO` (70.276), `TRÁFICO DE ENTORPECENTES` (26.665) e `ROUBO DE CARGA` (12.553). Esses totais somam os grupos anuais com pelo menos cinco registros e representam rótulos de `natureza_apurada`, não uma classificação final nem necessariamente ocorrências sem conflito com a rubrica.

Como decisão provisória de análise, furtos ficam fora do sinal de violência interpessoal e podem ser avaliados separadamente como contexto patrimonial; ocorrências culposas de trânsito ficam em uma camada de risco viário, nunca misturadas à violência intencional; apreensão/porte/tráfico são contexto criminal distinto e não entram automaticamente no indicador de agressão. A violência intencional permanece desagregada por natureza, com divergências de rubrica visíveis. A próxima checagem compara esses pares para os principais grupos.

Antes de estimar categorias ou seus pesos, estabelecemos como etapa de trabalho a criação de uma tabela de mapeamento explícita e auditável. A natureza apurada será a referência inicial; divergências com a rubrica serão mantidas para revisão, não resolvidas silenciosamente. Registros DDM identificam a delegacia registradora; não são, por si, uma classe de ocorrência nem uma medida validada de gravidade.

## Privacidade e LGPD

- Nesta análise, usamos apenas contagens agregadas e não consultamos nem compartilhamos endereços, coordenadas exatas, números de boletim ou dados de usuárias.
- A camada contextual deve ser exportada apenas em agregados regionais e temporais. Não enviar pontos criminais exatos ao app ou ao pipeline de treinamento.
- BPM, acelerômetro e outros dados de saúde permanecem fora do banco por padrão; nenhuma alteração foi feita nessa política.
- Não usaremos dados de usuárias reais para treinar ou depurar o modelo sem finalidade definida, base legal avaliada, informação clara, controles de acesso e processo de retenção e exclusão.
- Este documento é uma nota técnica de pesquisa, não uma declaração de conformidade jurídica com a LGPD.

## Decisões e próximos passos

### Decisões adotadas

1. Derivar o período apenas quando o rótulo original está vazio e a hora é válida.
2. Preservar o período original e registrar a proveniência (`informado`, `derivado_da_hora`, `desconhecido`, `hora_incerta` ou `rotulo_nao_reconhecido`).
3. Não imputar “em hora incerta”, hora inválida ou período não reconhecido.
4. Não aplicar pesos ou score de criminalidade até que a taxonomia e a justificativa dos pesos estejam documentadas.

### Próximas etapas

1. Ampliar a auditoria local para resumir períodos informados, derivados e desconhecidos por mês.
2. Reexecutar as auditorias temporais e a agregação contextual após o backfill, cobrindo os nove municípios.
3. Revisar uma política de agregação contextual que não descarte 37,5% dos registros por supressão de células.
4. Revisar os pares de rubrica/natureza para violência, patrimônio e trânsito em “Via Pública”; completar a tabela de classificação criminal e documentar a justificativa dos pesos antes de calcular o score contextual.
5. Separadamente, desenhar validação controlada do Isolation Forest e da fusão; ainda não há conjunto rotulado nem métricas de desempenho.

## Arquivos de apoio

- `data/ssp_ml_quality_audit.sql`: consultas de auditoria agregada, somente leitura.
- `data/ssp_crime_taxonomy_audit.sql`: combinações agregadas de rubrica/natureza e triagem exploratória de ocorrências possivelmente ligadas a trânsito.
- `data/ssp_robbery_place_audit.sql`: distribuição agregada de rubrica, natureza e tipo de local para ocorrências rotuladas como roubo.
- `data/ssp_place_type_completeness.sql`: completude anual agregada do campo `tipo_local`.
- `data/ssp_robbery_subtype_audit.sql`: distribuição agregada do subtipo para rótulos relacionados a roubo.
- `data/ssp_public_subtype_label_consistency.sql`: concordância dos sinais de roubo em registros com subtipo “Via Pública”.
- `data/ssp_public_robbery_taxonomy_audit.sql`: pares de rubrica/natureza dos candidatos a roubo em “Via Pública”, preservando divergências.
- `data/ssp_public_occurrence_taxonomy_audit.sql`: inventário agregado de naturezas em subtipos “Via Pública”.
- `data/ssp_public_core_label_pair_audit.sql`: pares agregados de rubrica/natureza para os principais candidatos de violência, patrimônio e trânsito.
- `data/ssp_context_aggregate_preview.sql`: prévia agregada da camada contextual, sem pesos nem coordenadas exatas.
- `data-processing/preview_ssp_city_backfill.py`: comparação somente de leitura da cobertura de uma cidade nos arquivos SSP e no Supabase.
- `data-processing/backfill_ssp_city.py`: backfill transacional de uma cidade ausente, com pré-condições e validação antes do commit.
- `data-processing/derive_ssp_period.py`: resolução exploratória e rastreável de período.
- `data-processing/test_derive_ssp_period.py`: testes da resolução de período.
- `data-processing/ML_PRIVACY_AND_READINESS.md`: checklist de prontidão e privacidade.
