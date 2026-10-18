import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { appendPhoneMotionSample, summarizePhoneMotionWindow } from '../utils/motionWindowFeatures.js'
import { extractPhoneMotionFeatures, scoreIsolationForest } from '../services/isolationForestMotion.js'
import { ALTO_SUSTENTADO_MS, PICO_FORTE_DO_CELULAR_G, alertasPorPersistencia, avaliarCorpo, fundirCamadas } from '../services/threeLayerRisk.js'

const modelo = JSON.parse(readFileSync(new URL('../models/isolationForestMotionModel.json', import.meta.url), 'utf8'))
const HOME = readFileSync(new URL('../screens/Home.js', import.meta.url), 'utf8')

// Celular parado (~1 g) com um chacoalhão de `duracaoMs` começando em 3 s: magnitude
// alternando 0,4 g e 3,4 g a 10 Hz, bem acima de 2,8 g. Passa pelo caminho do app:
// janela de 2,56 s → Isolation Forest + pico forte → corpo (só celular) → matriz.
function simular({ faixaContexto, duracaoMs, totalMs = 20_000 }) {
  let janela = []
  const leituras = []
  for (let t = 0; t <= totalMs; t += 100) {
    const chacoalhando = t >= 3_000 && t < 3_000 + duracaoMs
    const g = chacoalhando ? (t % 200 === 0 ? 3.4 : 0.4) : 1 + 0.01 * Math.sin(t / 300)
    janela = appendPhoneMotionSample(janela, g, t)
    const resumo = summarizePhoneMotionWindow(janela)
    const features = extractPhoneMotionFeatures(resumo)
    const anomalia = features ? scoreIsolationForest(features, modelo)?.anomalyScore ?? null : null
    const corpo = avaliarCorpo({ movimentoCelular: anomalia, picoForteCelular: Number(resumo?.peakMagnitudeG) >= PICO_FORTE_DO_CELULAR_G })
    const { nivel } = fundirCamadas({ contexto: { disponivel: true, faixa: faixaContexto }, corpo })
    leituras.push({ t, nivel, corpo: corpo.faixa })
  }
  return { leituras, alertas: alertasPorPersistencia(leituras), niveis: new Set(leituras.map((l) => l.nivel)) }
}

test('o pico forte entra como corpo alto, não como alerta', () => {
  const corpo = avaliarCorpo({ movimentoCelular: 0, picoForteCelular: true })
  assert.equal(corpo.sinais.movimentoCelular, 1)
  assert.equal(corpo.faixa, 'alto')
  // Com relógio, o celular pesa 20%: o pico sozinho não leva o corpo a alto.
  assert.equal(avaliarCorpo({ heartRateZScore: 0.5, movimentoCelular: 0, movimentoRelogio: 0, picoForteCelular: true }).faixa, 'baixo')
})

test('balançar com contexto baixo: no máximo moderado, nenhum alerta', () => {
  const r = simular({ faixaContexto: 'baixo', duracaoMs: 10_000 })
  assert.ok(r.leituras.some((l) => l.corpo === 'alto'), 'o chacoalhão tem que levar o corpo a alto')
  assert.ok(!r.niveis.has('alto'))
  assert.ok(r.niveis.has('moderado'))
  assert.deepEqual(r.alertas, [])
})

test('balançar com contexto médio (chacoalhão curto): nenhum alerta', () => {
  // Médio × corpo alto = alto na matriz do orientador, mas o alto dura menos de 5 s
  // (o pico fica na janela de 2,56 s depois que o chacoalhão para).
  const r = simular({ faixaContexto: 'medio', duracaoMs: 1_000 })
  assert.ok(r.niveis.has('alto'))
  assert.deepEqual(r.alertas, [])
})

test('contexto médio + chacoalhar por vários segundos: a matriz dá alto por 5 s e abre o alerta', () => {
  const r = simular({ faixaContexto: 'medio', duracaoMs: 6_000 })
  assert.equal(r.alertas.length, 1)
})

test('contexto alto + corpo alto por 5 s seguidos: alerta; por menos que isso, nada', () => {
  const longo = simular({ faixaContexto: 'alto', duracaoMs: 6_000 })
  assert.equal(longo.alertas.length, 1)
  const inicioDoAlto = longo.leituras.find((l) => l.nivel === 'alto').t
  assert.ok(longo.alertas[0] - inicioDoAlto >= ALTO_SUSTENTADO_MS)
  const curto = simular({ faixaContexto: 'alto', duracaoMs: 1_000 })
  assert.deepEqual(curto.alertas, [])
})

test('regra dos 5 s: alto interrompido recomeça a contagem', () => {
  const seq = (niveis) => niveis.map((nivel, i) => ({ t: i * 1_000, nivel }))
  assert.deepEqual(alertasPorPersistencia(seq(['alto', 'alto', 'alto', 'alto', 'alto', 'alto'])), [5_000])
  assert.deepEqual(alertasPorPersistencia(seq(['alto', 'alto', 'alto', 'moderado', 'alto', 'alto', 'alto'])), [])
  assert.deepEqual(alertasPorPersistencia(seq(['moderado', 'moderado', 'moderado', 'moderado', 'moderado', 'moderado'])), [])
})

test('na Home, nada abre alerta por fora da matriz (fora o SOS manual)', () => {
  assert.ok(!/isHighRisk/.test(HOME), 'gatilho de impacto removido')
  assert.ok(!/simpleCheckVisible|setAlertType|alertType/.test(HOME), 'modais "Tudo bem?" e "Confirma bem-estar?" removidos')
  assert.ok(!/Crítico|crítico/.test(HOME), 'sem nível crítico')
  assert.match(HOME, /setSustainedHighRisk\(altoSustentado\)/)
  // Só um lugar abre o modal, e só com nível alto.
  assert.equal((HOME.match(/setModalVisible\(true\)/g) || []).length, 1)
  assert.match(HOME, /if \(nivelDoRisco !== 'alto'\) return;\s*setCountdown\(10\);\s*setModalVisible\(true\);/)
  // Envio: fim da contagem e SOS manual (segurar 3 s). Nenhum outro.
  assert.equal((HOME.match(/executarEnvioDeSocorro\(\)/g) || []).length, 2)
})
