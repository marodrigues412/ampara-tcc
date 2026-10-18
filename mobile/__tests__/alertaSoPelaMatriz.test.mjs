import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { appendPhoneMotionSample, summarizePhoneMotionWindow } from '../utils/motionWindowFeatures.js'
import { extractPhoneMotionFeatures, scoreIsolationForest } from '../services/isolationForestMotion.js'
import {
  DESCIDA_DO_NIVEL_MS, MOVIMENTO_SUSTENTADO_MS, PICO_FORTE_DO_CELULAR_G, SUBIDA_DO_NIVEL_MS,
  acompanharMovimento, alertasPeloNivelExibido, avaliarCorpo, estabilizarNivel, fundirCamadas, movimentoAtipico,
} from '../services/threeLayerRisk.js'
import { avaliarContexto } from '../utils/contextLayer.js'

const modelo = JSON.parse(readFileSync(new URL('../models/isolationForestMotionModel.json', import.meta.url), 'utf8'))
const HOME = readFileSync(new URL('../screens/Home.js', import.meta.url), 'utf8')
const P33 = 0.0016
const P66 = 0.0048
const ESCORE = { baixo: 0.001, medio: 0.003, alto: 0.01 }

// Celular parado (~1 g) com agitação de `duracaoMs` a partir de 3 s: magnitude
// alternando 0,4 g e 3,4 g a 10 Hz (começa em `inicioMs`). Caminho do app, só celular: janela de 2,56 s →
// Isolation Forest + pico → sequência de movimento atípico → corpo → contexto → matriz
// → nível mostrado (estabilizado), que é o que abre o alerta.
function simular({ faixaContexto, duracaoMs, emLocalSeguro = false, inicioMs = 3_000, totalMs = 40_000 }) {
  const contexto = avaliarContexto({
    municipio: 'S.PAULO', bairro: 'TESTE', emLocalSeguro,
    celula: { bairro: 'TESTE', escore_contexto: ESCORE[faixaContexto], percentil_33: P33, percentil_66: P66 },
  })
  let janela = []
  let movimento = null
  let estado = null
  const leituras = []
  for (let t = 0; t <= totalMs; t += 100) {
    const agitando = t >= inicioMs && t < inicioMs + duracaoMs
    const g = agitando ? (t % 200 === 0 ? 3.4 : 0.4) : 1 + 0.01 * Math.sin(t / 300)
    janela = appendPhoneMotionSample(janela, g, t)
    const resumo = summarizePhoneMotionWindow(janela)
    const features = extractPhoneMotionFeatures(resumo)
    const anomalia = features ? scoreIsolationForest(features, modelo)?.anomalyScore ?? null : null
    const picoForte = Number(resumo?.peakMagnitudeG) >= PICO_FORTE_DO_CELULAR_G
    const acompanhado = acompanharMovimento(movimento, { t, atipico: movimentoAtipico({ anomalia, picoForte }) })
    movimento = acompanhado.estado
    const corpo = avaliarCorpo({ movimentoCelular: anomalia, movimentoCelularSustentado: acompanhado.sustentado })
    const { nivel } = fundirCamadas({ contexto, corpo })
    estado = estabilizarNivel(estado, { t, nivel })
    leituras.push({ t, nivel, exibido: estado.exibido, corpo: corpo.faixa })
  }
  const exibidos = new Set(leituras.map((l) => l.exibido))
  return {
    leituras,
    exibidos,
    alertas: alertasPeloNivelExibido(leituras),
    corpos: new Set(leituras.map((l) => l.corpo)),
    exibidoAntes: leituras.find((l) => l.t === 2_900).exibido,
    exibidoNoFim: leituras.at(-1).exibido,
  }
}

test('(a) só celular, região média, agitar 15 s: no máximo moderado, sem alerta', () => {
  const r = simular({ faixaContexto: 'medio', duracaoMs: 15_000 })
  assert.ok(r.corpos.has('medio'), 'a agitação mantida leva o corpo a médio')
  assert.ok(!r.corpos.has('alto'), 'sem relógio, o corpo nunca passa de médio')
  assert.ok(!r.exibidos.has('alto'))
  assert.ok(r.exibidos.has('moderado'))
  assert.deepEqual(r.alertas, [])
})

test('(b) só celular, região alta, agitação de 15 s: alto e alerta', () => {
  const r = simular({ faixaContexto: 'alto', duracaoMs: 15_000 })
  assert.ok(r.exibidos.has('alto'))
  assert.equal(r.alertas.length, 1)
  // Corpo só vira médio depois de 10 s de agitação; a tela, 5 s depois disso.
  const corpoMedio = r.leituras.find((l) => l.corpo === 'medio').t
  assert.ok(corpoMedio - 3_000 >= MOVIMENTO_SUSTENTADO_MS)
  assert.ok(r.alertas[0] - corpoMedio >= SUBIDA_DO_NIVEL_MS)
})

test('(c) local seguro + agitar: no máximo moderado, sem alerta', () => {
  const r = simular({ faixaContexto: 'alto', emLocalSeguro: true, duracaoMs: 15_000 })
  assert.ok(!r.exibidos.has('alto'))
  assert.deepEqual(r.alertas, [])
})

test('(d) pico de 1 s: nada muda, em nenhuma região', () => {
  for (const faixaContexto of ['baixo', 'medio', 'alto']) {
    // Pico aos 15 s, com a tela já estável (os primeiros segundos são "calculando").
    const r = simular({ faixaContexto, duracaoMs: 1_000, inicioMs: 15_000 })
    assert.ok(!r.corpos.has('medio') && !r.corpos.has('alto'), `${faixaContexto}: corpo não sobe`)
    assert.equal(new Set(r.leituras.filter((l) => l.t >= 14_900).map((l) => l.exibido)).size, 1, `${faixaContexto}: o topo não muda`)
    assert.deepEqual(r.alertas, [])
  }
})

test('o nível da tela sobe com 5 s seguidos e desce com 10 s estável, sem piscar', () => {
  const seq = (niveis, passo = 1_000) => niveis.map((nivel, i) => ({ t: i * passo, nivel }))
  const rodar = (leituras) => leituras.reduce((acc, l) => { acc.estado = estabilizarNivel(acc.estado, l); acc.vistos.push(acc.estado.exibido); return acc }, { estado: null, vistos: [] }).vistos
  // Sobe só depois de 5 s.
  assert.deepEqual(rodar(seq(['baixo', 'alto', 'alto', 'alto', 'alto', 'alto', 'alto'])), ['baixo', 'baixo', 'baixo', 'baixo', 'baixo', 'baixo', 'alto'])
  // Alto interrompido não sobe.
  assert.ok(!rodar(seq(['baixo', 'alto', 'alto', 'alto', 'baixo', 'alto', 'alto', 'alto'])).includes('alto'))
  // Desce só depois de 10 s estável.
  const descida = rodar(seq(['baixo', ...Array(6).fill('alto'), ...Array(11).fill('baixo')]))
  assert.equal(descida.lastIndexOf('alto'), 6 + 10) // primeira leitura baixa em 7 s, desce em 17 s
  assert.equal(descida.at(-1), 'baixo')
  assert.equal(SUBIDA_DO_NIVEL_MS, 5_000)
  assert.equal(DESCIDA_DO_NIVEL_MS, 10_000)
  // Sem nível (calculando / sem dados) vale na hora.
  assert.equal(estabilizarNivel({ exibido: 'alto' }, { t: 0, nivel: null }).exibido, null)
})

test('movimento atípico: interrupções curtas não zeram a sequência, longas zeram', () => {
  let e = null
  let r
  for (let t = 0; t <= 10_000; t += 500) {
    r = acompanharMovimento(e, { t, atipico: t % 1_000 === 0 }) // atípico a cada 1 s
    e = r.estado
  }
  assert.equal(r.sustentado, true)
  r = acompanharMovimento(e, { t: 12_500, atipico: false })
  assert.equal(r.sustentado, false)
})

test('na Home, tela e alerta usam o mesmo nível estabilizado; nada abre alerta por fora', () => {
  assert.ok(!/isHighRisk/.test(HOME), 'sem gatilho de impacto')
  assert.ok(!/simpleCheckVisible|setAlertType|alertType/.test(HOME))
  assert.ok(!/Crítico|crítico/.test(HOME))
  assert.match(HOME, /estabilizarNivel\(/)
  assert.match(HOME, /const nivelNaTela = monitoramentoAtivo \? nivelExibido : null/)
  assert.match(HOME, /setSustainedHighRisk\(nivelExibido === 'alto'\)/)
  assert.equal((HOME.match(/setModalVisible\(true\)/g) || []).length, 1)
  assert.equal((HOME.match(/executarEnvioDeSocorro\(\)/g) || []).length, 2) // fim da contagem e SOS manual
  assert.ok(!/Sensores do dispositivo/.test(HOME), 'seção técnica removida')
})
