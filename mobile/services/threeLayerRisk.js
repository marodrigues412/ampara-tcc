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

// Pico forte do celular (magnitude >= 2,8 g na janela de 2,56 s). Não abre alerta
// sozinho: entra na Camada 2 como movimento do celular = 1 e passa pela matriz como
// qualquer outro sinal (contexto baixo + corpo alto = moderado, sem alerta). Antes, um
// gatilho de impacto abria o alerta direto, por cima da matriz.
export const PICO_FORTE_DO_CELULAR_G = 2.8

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

// Camada 2. Entradas já normalizadas ou nulas:
// - heartRateZScore: z do BPM atual contra a última hora (null sem relógio/BPM velho);
// - movimentoCelular: anomalyScore do Isolation Forest, [0, 1];
// - movimentoRelogio: saída de movimentoDoRelogio, [0, 1].
// O modo sai das leituras disponíveis agora, não do tipo de aparelho: o relógio
// desconectou, cai para só celular; voltou, volta para completo.
// picoForteCelular: a janela do celular teve pico >= PICO_FORTE_DO_CELULAR_G; o
// movimento do celular passa a valer 1 (mesmo sem o Isolation Forest pronto).
export function avaliarCorpo({ heartRateZScore = null, movimentoCelular = null, movimentoRelogio = null, activityMode = false, picoForteCelular = false }) {
  const movimentoDoModelo = valorFinito(movimentoCelular) === null ? null : limitar(Number(movimentoCelular))
  const sinais = {
    bpm: normalizeHeartRateAnomaly(valorFinito(heartRateZScore)),
    movimentoCelular: picoForteCelular ? 1 : movimentoDoModelo,
    movimentoRelogio: valorFinito(movimentoRelogio) === null ? null : limitar(Number(movimentoRelogio)),
  }
  const modo = modoDosSensores(sinais)
  if (!modo) return { disponivel: false, escore: null, faixa: null, modo: null, sinais, pesos: {} }

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

  return { disponivel: true, escore, faixa: classifyScoreBand(escore), modo, sinais, pesos }
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
