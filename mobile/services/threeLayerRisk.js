// Camadas 2 (corpo) e 3 (fusão) do score do Ampara, conforme a orientação do TCC e o
// briefing de 18/10/2026. Puro: os testes rodam sem sensores nem Supabase.
//
// O sistema é híbrido: só o movimento do celular usa ML (Isolation Forest). O BPM é
// estatística (z-score), o movimento do relógio é regra heurística com limites próprios
// do pulso, e a fusão é a matriz 3×3 do orientador.
import { classifyScoreBand, normalizeHeartRateAnomaly } from './isolationForestMotion.js'

// Pesos do corpo com todos os sinais. Faltando algum, os outros são redistribuídos
// (proporcionalmente): nada é imputado.
export const PESOS_DO_CORPO = { bpm: 0.6, movimentoCelular: 0.2, movimentoRelogio: 0.2 }

// Modo atividade: exercício é anomalia de movimento esperada. O movimento entra com
// metade do peso, sem devolver a diferença aos outros sinais — senão, no modo só
// celular, o movimento voltaria a valer 100% e o modo atividade não teria efeito.
export const FATOR_DO_MOVIMENTO_EM_ATIVIDADE = 0.5

// Nível alto precisa durar isso, sem interrupção, antes de abrir o alerta automático.
// Escolha das autoras (18/10/2026) a partir da simulação com o UCI HAR (modelo v2): em
// caminhada normal, a maior sequência de "alto" foi 2,7 s, e 3 s ficava no limite.
// Só o SOS manual não espera (docs/score_bpm_ml.md).
export const ALTO_SUSTENTADO_MS = 5_000

// Pico forte do celular (magnitude >= 2,8 g na janela de 2,56 s). Sozinho não muda
// nada: conta como movimento atípico, e só movimento atípico mantido por
// MOVIMENTO_SUSTENTADO_MS entra no corpo (princípio de corroboração, abaixo).
export const PICO_FORTE_DO_CELULAR_G = 2.8
// Movimento do celular é "atípico" com o Isolation Forest acima da faixa baixa (> 0,33)
// ou com pico forte na janela.
export const LIMIAR_DE_MOVIMENTO_ATIPICO = 0.33
// Quanto o movimento atípico tem que durar, sem interrupção, para contar no corpo.
export const MOVIMENTO_SUSTENTADO_MS = 10_000
// Buracos menores que isso entre leituras atípicas não interrompem a sequência (o
// chacoalhão alterna amostras altas e baixas).
export const TOLERANCIA_DE_INTERRUPCAO_MS = 1_000
// O nível da tela (e o alerta) sobe depois de SUBIDA_DO_NIVEL_MS no nível novo e desce
// depois de DESCIDA_DO_NIVEL_MS estável, para não piscar.
export const SUBIDA_DO_NIVEL_MS = ALTO_SUSTENTADO_MS
export const DESCIDA_DO_NIVEL_MS = 10_000

const RELOGIO_RECENTE_MS = 5_000
const RELOGIO_MIN_AMOSTRAS = 10

const NIVEIS = {
  baixo: { baixo: 'baixo', medio: 'baixo', alto: 'moderado' },
  medio: { baixo: 'baixo', medio: 'moderado', alto: 'alto' },
  alto: { baixo: 'moderado', medio: 'alto', alto: 'alto' },
}

const valorFinito = (valor) => (valor === null || valor === undefined || valor === '' ? null : Number.isFinite(Number(valor)) ? Number(valor) : null)
const limitar = (valor) => Math.max(0, Math.min(1, valor))

// Movimento do relógio em [0, 1], pelos limites do pulso de utils/motionRiskScore.js.
// Não há modelo treinado com dados de pulso: no artigo, isto é regra, não ML.
// null = sem leitura recente (≤ 5 s, ≥ 10 amostras).
export function movimentoDoRelogio(watchMotion, { activityMode = false, now = Date.now() } = {}) {
  const momento = Date.parse(watchMotion?.time)
  const idade = now - momento
  if (!Number.isFinite(momento) || idade < 0 || idade > RELOGIO_RECENTE_MS) return null
  if (!(Number(watchMotion?.samples) >= RELOGIO_MIN_AMOSTRAS)) return null
  const pico = valorFinito(watchMotion?.peak)
  const rms = valorFinito(watchMotion?.rms)
  const jerk = valorFinito(watchMotion?.jerk)
  if (pico === null || rms === null || jerk === null) return null
  if (pico >= 24 && jerk >= 150) return 1
  if (!activityMode && pico >= 14 && rms >= 4.5) return 0.5
  return 0
}

export function modoDosSensores({ bpm, movimentoCelular, movimentoRelogio }) {
  const temRelogio = bpm !== null || movimentoRelogio !== null
  if (bpm !== null && movimentoRelogio !== null && movimentoCelular !== null) return 'completo'
  if (!temRelogio) return movimentoCelular === null ? null : 'so_celular'
  return movimentoCelular === null ? 'so_relogio' : 'parcial'
}

export const ROTULOS_DO_MODO = {
  completo: 'completo',
  so_celular: 'só celular',
  parcial: 'relógio parcial',
  so_relogio: 'só relógio',
}

// Sequência de movimento atípico do celular. estado = { inicio, ultimo } (ou null);
// devolve o novo estado e se ela já dura MOVIMENTO_SUSTENTADO_MS.
export function acompanharMovimento(estado, { t, atipico }) {
  let { inicio = null, ultimo = null } = estado ?? {}
  if (atipico) {
    if (inicio === null || t - ultimo > TOLERANCIA_DE_INTERRUPCAO_MS) inicio = t
    ultimo = t
  } else if (ultimo !== null && t - ultimo > TOLERANCIA_DE_INTERRUPCAO_MS) {
    inicio = null
    ultimo = null
  }
  const sustentado = inicio !== null && t - inicio >= MOVIMENTO_SUSTENTADO_MS
  return { estado: { inicio, ultimo }, sustentado }
}

export const movimentoAtipico = ({ anomalia, picoForte }) =>
  Boolean(picoForte) || (Number.isFinite(Number(anomalia)) && anomalia !== null && Number(anomalia) > LIMIAR_DE_MOVIMENTO_ATIPICO)

// Camada 2. Entradas já normalizadas ou nulas:
// - heartRateZScore: z do BPM atual contra a última hora (null sem relógio/BPM velho);
// - movimentoCelular: anomalyScore do Isolation Forest, [0, 1];
// - movimentoRelogio: saída de movimentoDoRelogio, [0, 1];
// - movimentoCelularSustentado: movimento atípico do celular há >= 10 s seguidos
//   (acompanharMovimento).
// O modo sai das leituras disponíveis agora, não do tipo de aparelho: o relógio
// desconectou, cai para só celular; voltou, volta para completo.
//
// Princípio de corroboração (decisão de projeto, docs/score_bpm_ml.md): o acelerômetro
// do celular sozinho não tem a confiança de batimento + movimento.
// - Só celular: o corpo nunca passa de médio, e só chega a médio com movimento atípico
//   mantido por 10 s (fora do modo atividade). Um pico isolado não muda nada.
// - Com relógio: "alto" exige o batimento (>= faixa média) ou o movimento do relógio
//   (>= 0,5) confirmando; sem confirmação, fica em médio.
export function avaliarCorpo({ heartRateZScore = null, movimentoCelular = null, movimentoRelogio = null, activityMode = false, movimentoCelularSustentado = false }) {
  const movimentoDoModelo = valorFinito(movimentoCelular) === null ? null : limitar(Number(movimentoCelular))
  const sinais = {
    bpm: normalizeHeartRateAnomaly(valorFinito(heartRateZScore)),
    // Movimento atípico mantido conta inteiro; fora isso, vale a nota do modelo.
    movimentoCelular: movimentoDoModelo === null && !movimentoCelularSustentado ? null : movimentoCelularSustentado ? 1 : movimentoDoModelo,
    movimentoRelogio: valorFinito(movimentoRelogio) === null ? null : limitar(Number(movimentoRelogio)),
  }
  const modo = modoDosSensores(sinais)
  if (!modo) return { disponivel: false, escore: null, faixa: null, modo: null, sinais, pesos: {}, limitado: false }

  if (modo === 'so_celular') {
    const agitado = movimentoCelularSustentado && !activityMode
    const escore = agitado ? 0.5 : Math.round(Math.min(sinais.movimentoCelular, 0.33) * 1000) / 1000
    return {
      disponivel: true, escore, faixa: agitado ? 'medio' : 'baixo', modo, sinais,
      pesos: { movimentoCelular: 1 }, movimentoSustentado: Boolean(movimentoCelularSustentado),
      // Sem relógio, um movimento forte não confirmado pelo corpo não passa de médio.
      limitado: sinais.movimentoCelular > 0.66 || (movimentoCelularSustentado && activityMode),
    }
  }

  const disponiveis = Object.keys(sinais).filter((nome) => sinais[nome] !== null)
  const somaNominal = disponiveis.reduce((soma, nome) => soma + PESOS_DO_CORPO[nome], 0)
  const pesos = {}
  let escore = 0
  for (const nome of disponiveis) {
    const atenuacao = activityMode && nome !== 'bpm' ? FATOR_DO_MOVIMENTO_EM_ATIVIDADE : 1
    pesos[nome] = (PESOS_DO_CORPO[nome] * atenuacao) / somaNominal
    escore += pesos[nome] * sinais[nome]
  }
  escore = Math.round(limitar(escore) * 1000) / 1000

  let faixa = classifyScoreBand(escore)
  const confirmado = (sinais.bpm !== null && sinais.bpm > 0.33) || (sinais.movimentoRelogio !== null && sinais.movimentoRelogio >= 0.5)
  const limitado = faixa === 'alto' && !confirmado
  if (limitado) {
    faixa = 'medio'
    escore = 0.66
  }
  return { disponivel: true, escore, faixa, modo, sinais, pesos, movimentoSustentado: Boolean(movimentoCelularSustentado), limitado }
}

const ORDEM_DO_NIVEL = { baixo: 0, moderado: 1, alto: 2 }

// Nível mostrado na tela (e que abre o alerta), a partir do nível bruto da matriz.
// estado = { exibido, direcao, desde, extremo } (ou null). A cada leitura { t, nivel }:
// - igual ao exibido: nada muda;
// - acima: só sobe depois de SUBIDA_DO_NIVEL_MS acima sem interrupção, para o menor
//   nível visto nesse tempo (alto por 5 s → alto; moderado e alto → moderado);
// - abaixo: só desce depois de DESCIDA_DO_NIVEL_MS abaixo, para o maior nível visto;
// - sem nível (calculando / sem dados da região): vale na hora. Saindo de "sem nível",
//   baixo aparece na hora e os outros esperam a subida.
export function estabilizarNivel(estado, { t, nivel }) {
  const atual = estado ?? { exibido: null, direcao: null, desde: null, extremo: null }
  if (nivel === null || nivel === undefined) return { exibido: null, direcao: null, desde: null, extremo: null }
  if (atual.exibido === null && nivel === 'baixo') return { exibido: 'baixo', direcao: null, desde: null, extremo: null }
  if (nivel === atual.exibido) return { ...atual, direcao: null, desde: null, extremo: null }

  const ordemExibida = atual.exibido === null ? -1 : ORDEM_DO_NIVEL[atual.exibido]
  const direcao = ORDEM_DO_NIVEL[nivel] > ordemExibida ? 'subida' : 'descida'
  if (atual.direcao !== direcao) return { ...atual, direcao, desde: t, extremo: nivel }

  const extremo = direcao === 'subida'
    ? (ORDEM_DO_NIVEL[nivel] < ORDEM_DO_NIVEL[atual.extremo] ? nivel : atual.extremo)
    : (ORDEM_DO_NIVEL[nivel] > ORDEM_DO_NIVEL[atual.extremo] ? nivel : atual.extremo)
  const espera = direcao === 'subida' ? SUBIDA_DO_NIVEL_MS : DESCIDA_DO_NIVEL_MS
  if (t - atual.desde >= espera) return { exibido: extremo, direcao: null, desde: null, extremo: null }
  return { ...atual, extremo }
}

// Instantes em que o alerta abriria para uma sequência de leituras [{ t, nivel }]: quando
// o nível mostrado (estabilizarNivel) vira "alto". É a mesma regra da Home.
export function alertasPeloNivelExibido(leituras) {
  const alertas = []
  let estado = null
  for (const leitura of leituras) {
    const antes = estado?.exibido ?? null
    estado = estabilizarNivel(estado, leitura)
    if (estado.exibido === 'alto' && antes !== 'alto') alertas.push(leitura.t)
  }
  return alertas
}

// Camada 3: matriz 3×3 do orientador. Com uma camada indisponível não há nível — a
// tela mostra "calculando"/"sem dados da região" e o SOS manual segue funcionando.
// `contexto` é o resultado de utils/contextLayer.js#avaliarContexto (ou null enquanto
// ainda carrega); `corpo` é o de avaliarCorpo.
export function fundirCamadas({ contexto, corpo }) {
  if (!contexto) return { estado: 'calculando', nivel: null }
  if (!contexto.disponivel) return { estado: 'sem_contexto', nivel: null }
  if (!corpo?.disponivel) return { estado: 'calculando', nivel: null }
  return { estado: 'pronto', nivel: NIVEIS[contexto.faixa][corpo.faixa] }
}

// Regra do alerta automático, para uma sequência de leituras [{ t (ms), nivel }]:
// abre quando o nível fica "alto" por ALTO_SUSTENTADO_MS seguidos, uma vez por
// sequência. Devolve os instantes em que abriria. É a mesma regra do timer da Home.
export function alertasPorPersistencia(leituras, minimoMs = ALTO_SUSTENTADO_MS) {
  const alertas = []
  let inicio = null
  let disparou = false
  for (const { t, nivel } of leituras) {
    if (nivel === 'alto') {
      if (inicio === null) { inicio = t; disparou = false }
      if (!disparou && t - inicio >= minimoMs) { alertas.push(t); disparou = true }
    } else {
      inicio = null
    }
  }
  return alertas
}

// Ação de cada nível. Áudio e sugestão de PM no alto ficam para depois da Eureka.
export function acaoDoNivel(nivel) {
  if (nivel === 'alto') return 'alerta'
  if (nivel === 'moderado') return 'monitoramento_reforcado'
  return 'nenhuma'
}
