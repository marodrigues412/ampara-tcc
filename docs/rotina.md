# Rotina da usuária — como funciona e o que falta (score)

Branch: `feat/rotina`. Este documento descreve o que já está pronto e o contrato para quem
for implementar a detecção de desvio da rotina no score.

## Ideia

A usuária cadastra os compromissos da semana (faculdade, trabalho, academia, um jantar no
sábado). Com isso o app sabe **onde ela deveria estar e quando**, deduz os **trajetos**
entre um compromisso e outro e pode **estranhar** quando algo foge disso (atraso, parada
longa no caminho, movimento fora do horário).

## O que já está pronto

| Parte | Arquivo |
|---|---|
| Tabela no banco | `data/rotina.sql` (rodar no SQL Editor do Supabase) |
| Acesso ao banco | `mobile/services/routineService.js` |
| Regras (linha do tempo, estado esperado) | `mobile/utils/rotina.js` |
| Tela "Minha rotina" (Perfil → Minha rotina) | `mobile/screens/Routine.js` |
| Cadastro/edição de compromisso | `mobile/screens/RoutineCommitment.js` |
| Busca de endereço (compartilhada com a aba Mapa) | `mobile/services/addressSearch.js` |
| Exercício liga o modo atividade | `mobile/screens/Home.js`, `loadHorariosAtividade()` |

A antiga tela "Horários de atividade" foi removida: compromissos de **Exercício** com
"Ligar o modo atividade" fazem o mesmo papel. A tabela `activity_schedules` continua no
banco, mas o app não lê mais. A chave manual "Atividade" na tela Proteção continua, para
exercício fora da rotina.

**Ainda não existe:** nenhuma detecção de desvio, nenhum aviso de atraso, nada no score.
O campo "Avisar se eu não chegar" é salvo, mas ninguém lê ainda.

## Tabela `routine_commitments`

| Coluna | Tipo | Significado |
|---|---|---|
| `id`, `user_id` | uuid | RLS: cada usuária só vê os próprios |
| `nome` | text | "Faculdade", "Jantar com amigas" |
| `tipo` | text | `estudo`, `trabalho`, `exercicio`, `saude`, `lazer`, `outro` |
| `local_nome`, `endereco` | text | Nome curto e endereço do lugar |
| `latitude`, `longitude` | double | Ponto do compromisso (sempre preenchido) |
| `safe_location_id` | uuid, nulo | Se veio de um local seguro. Se o local seguro for apagado, vira nulo e as coordenadas continuam |
| `dias` | smallint[], nulo | Recorrência semanal. 0 = domingo … 6 = sábado (igual `Date.getDay()`) |
| `data` | date, nulo | Compromisso de uma vez só. **Ou `dias` ou `data`, nunca os dois** (o banco garante) |
| `hora_chegada`, `hora_saida` | time | Quando ela deve chegar e sair |
| `transporte` | text | `pe`, `onibus`, `carro`, `bike` — usado na estimativa do trajeto até aqui |
| `avisar_atraso` | bool | Se o app deve estranhar quando ela não chega |
| `tolerancia_min` | smallint | Minutos de atraso aceitos antes de estranhar (10, 20 ou 30 na tela) |
| `liga_modo_atividade` | bool | Só para `exercicio`: liga o modo atividade durante o compromisso |
| `ativo` | bool | Chave na lista; desligado = como se não existisse |

### Local do compromisso ≠ local seguro

O local do compromisso **não reduz o score**. Ele só serve para saber se ela chegou. Um
restaurante entra na rotina sem virar local seguro. Na tela há a opção "Salvar também como
local seguro" (desmarcada por padrão), que cria uma linha em `safe_locations` e liga as duas.

## Regras de tempo (`utils/rotina.js`)

### Trajeto estimado

```
minutos = max(5, distância_em_linha_reta × 1,3 ÷ velocidade × 60 + espera)
```

| Transporte | Velocidade | Espera |
|---|---|---|
| A pé | 4,5 km/h | 0 |
| Bike | 13 km/h | 0 |
| Ônibus ou metrô | 15 km/h | 10 min |
| Carro ou app | 20 km/h | 5 min |

1,3 corrige a linha reta para o caminho pelas ruas. **É estimativa**: não há serviço de
rotas, então não conhece o caminho real nem o trânsito do dia.

### `linhaDoTempo(lista, dia, casa)`

Devolve o dia como sequência: `trajeto → compromisso → trajeto → … → trajeto (volta)`.

- `casa` = local seguro com `tipo = 'Casa'` (ou `null`). Sem casa, o primeiro trajeto do dia
  e a volta ficam de fora; os trajetos **entre** compromissos continuam.
- Origem de cada trajeto = compromisso anterior do dia (ou a casa, no primeiro).
- Cada trajeto tem `saida`, `chegada` (minutos do dia), `minutos`, `origem`, `destino`,
  `transporte`, `compromisso` (o destino; `null` na volta), `volta` e `apertado`
  (`true` quando o intervalo entre dois compromissos é menor que o trajeto estimado).

### `estadoEsperado(lista, agora, casa)` — **use esta função no score**

Diz onde ela deveria estar **agora**:

| Retorno | Quando |
|---|---|
| `{ tipo: 'trajeto', trajeto, limiteChegada }` | Entre a `saida` do trajeto e `chegada + tolerancia_min`. `limiteChegada` em minutos do dia |
| `{ tipo: 'compromisso', compromisso }` | Entre `hora_chegada` e `hora_saida` (e já passou a tolerância) |
| `{ tipo: 'livre' }` | Nada previsto |

O trajeto é testado **antes** do compromisso: entre a hora de chegada e a tolerância ela
ainda pode estar a caminho, e só depois disso o atraso deve ser estranhado.

Exemplo testado (segunda, Faculdade 8:00–12:00, tolerância 20):

| Hora | Estado |
|---|---|
| 6:00 | livre |
| 7:50 | trajeto para a Faculdade, limite 8:20 |
| 8:15 | trajeto para a Faculdade, limite 8:20 (atrasada, mas dentro da tolerância) |
| 8:25 | compromisso Faculdade → **aqui ela já deveria estar lá** |

## O que falta implementar (score / detecção)

Sugestão de regras, a partir de `estadoEsperado()` e da posição atual:

1. **Atraso na chegada.** Estado `compromisso`, `avisar_atraso = true` e ela está a mais de
   80 m do compromisso (mesmo raio do local seguro, `utils/geo.js`). → checagem simples
   ("Tudo bem por aí?"). Disparar **uma vez** por compromisso por dia.
2. **Fora do caminho.** Estado `trajeto` e a distância até a linha origem→destino é muito
   maior que a do próprio trajeto (ex.: mais de 2 km ou 50% do trajeto). → checagem simples.
3. **Parada longa no caminho.** Estado `trajeto` e parada (velocidade ~0) por mais de X min
   fora de qualquer local cadastrado.
4. **Movimento fora da rotina à noite.** Estado `livre`, de madrugada, em deslocamento.

Para o aviso, sugerimos reaproveitar o modal "simples" que já existe na Home
(`alertType === 'simples'`), com três respostas: **Estou bem**, **Mudei meu dia** (dispensa
o resto da rotina daquele dia) e **Preciso de ajuda** (segue para o fluxo de SOS). Sem
resposta, sobe para o modal moderado com contagem.

Se o desvio também entrar no **score**, decidir quantos pontos soma e se ele vale para os
níveis de alerta atuais (score > 8 crítico, ≥ 5 moderado).

## Limitações que afetam a detecção

- **Localização só com o app aberto.** Hoje não há rastreio em segundo plano
  (`hooks/useRiskDetection.js` usa `watchPositionAsync` em primeiro plano). Com o app
  fechado, nada disso funciona. Rastrear em segundo plano exige `expo-task-manager`,
  permissão "Sempre", build próprio (não roda no Expo Go) e, no iPhone, conta Apple
  Developer.
- **GPS a cada 50 m ou 5 min.** Atrasos de poucos minutos podem demorar a aparecer.
- **Compromisso que passa da meia-noite** (ex.: 22:00 às 02:00) não é tratado: o
  `estadoEsperado()` não reconhece o trecho depois da meia-noite.
- **Trajeto estimado sem trânsito real** (ver acima).

## Privacidade

A rotina diz onde a usuária está em cada horário. Fica só com ela (RLS), mas vale citar na
página **Avisos e limitações** (`screens/LegalNotice.js`, seção "Seus dados") quando a
detecção entrar.
