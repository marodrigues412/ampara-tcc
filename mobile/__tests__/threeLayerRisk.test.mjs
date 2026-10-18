import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ALTO_SUSTENTADO_MS,
  acaoDoNivel,
  avaliarCorpo,
  fundirCamadas,
  modoDosSensores,
  movimentoDoRelogio,
  PESOS_DO_CORPO,
} from '../services/threeLayerRisk.js'
import { classifyScoreBand, normalizeHeartRateAnomaly } from '../services/isolationForestMotion.js'
import { avaliarContexto } from '../utils/contextLayer.js'

const AGORA = Date.parse('2026-10-23T15:00:00Z')
const relogio = (extra = {}) => ({ time: new Date(AGORA - 1_000).toISOString(), samples: 50, peak: 10, rms: 2, jerk: 40, ...extra })
const perto = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`)
const contexto = (faixa) => ({ disponivel: true, faixa })
const corpo = (faixa) => ({ disponivel: true, faixa })

test('sem dado não vira zero: BPM e faixa nulos ficam nulos', () => {
  assert.equal(normalizeHeartRateAnomaly(null), null)
  assert.equal(normalizeHeartRateAnomaly(undefined), null)
  assert.equal(classifyScoreBand(null), null)
  assert.equal(classifyScoreBand(''), null)
})

test('relógio: limites próprios do pulso convertidos para 0, 0,5 e 1', () => {
  const ler = (extra, opcoes = {}) => movimentoDoRelogio(relogio(extra), { now: AGORA, ...opcoes })
  assert.equal(ler({ peak: 24, jerk: 150 }), 1)
  assert.equal(ler({ peak: 30, jerk: 149 }), 0)
  assert.equal(ler({ peak: 14, rms: 4.5 }), 0.5)
  assert.equal(ler({ peak: 14, rms: 4.5 }, { activityMode: true }), 0)
  // O 1,0 vale mesmo no modo atividade: pico e jerk fortes não são passada de corrida.
  assert.equal(ler({ peak: 24, jerk: 150 }, { activityMode: true }), 1)
  assert.equal(ler({ peak: 13.9, rms: 9 }), 0)
})

test('relógio: só leitura recente (≤ 5 s) e com ≥ 10 amostras', () => {
  assert.equal(movimentoDoRelogio(relogio({ time: new Date(AGORA - 5_001).toISOString() }), { now: AGORA }), null)
  assert.equal(movimentoDoRelogio(relogio({ time: new Date(AGORA + 1_000).toISOString() }), { now: AGORA }), null)
  assert.equal(movimentoDoRelogio(relogio({ samples: 9 }), { now: AGORA }), null)
  assert.equal(movimentoDoRelogio(relogio({ peak: null }), { now: AGORA }), null)
  assert.equal(movimentoDoRelogio(null, { now: AGORA }), null)
})

test('cenário 3 (Galaxy Watch): 60/20/20', () => {
  const r = avaliarCorpo({ heartRateZScore: 2.5, movimentoCelular: 0.5, movimentoRelogio: 0 })
  assert.equal(r.modo, 'completo')
  perto(r.pesos.bpm, 0.6)
  perto(r.pesos.movimentoCelular, 0.2)
  perto(r.pesos.movimentoRelogio, 0.2)
  assert.equal(r.escore, 0.7)
  assert.equal(r.faixa, 'alto')
})

test('cenários 1 e 2 (iPhone / Android sem relógio): movimento do celular vale 100%', () => {
  const r = avaliarCorpo({ movimentoCelular: 0.5 })
  assert.equal(r.modo, 'so_celular')
  assert.deepEqual(r.pesos, { movimentoCelular: 1 })
  assert.equal(r.escore, 0.5)
  assert.equal(r.faixa, 'medio')
})

test('relógio parcial: redistribui entre o que houver', () => {
  const soBpm = avaliarCorpo({ heartRateZScore: 2.5, movimentoCelular: 0 })
  assert.equal(soBpm.modo, 'parcial')
  perto(soBpm.pesos.bpm, 0.75)
  perto(soBpm.pesos.movimentoCelular, 0.25)
  assert.equal(soBpm.escore, 0.75)

  const soMovimento = avaliarCorpo({ movimentoCelular: 0, movimentoRelogio: 1 })
  assert.equal(soMovimento.modo, 'parcial')
  perto(soMovimento.pesos.movimentoRelogio, 0.5)
  assert.equal(soMovimento.escore, 0.5)

  assert.equal(avaliarCorpo({ heartRateZScore: 2.5 }).modo, 'so_relogio')
})

test('o modo segue as leituras: relógio cai, volta para só celular; volta, completo', () => {
  const leituras = [
    { heartRateZScore: 1, movimentoCelular: 0.1, movimentoRelogio: 0 },
    { heartRateZScore: null, movimentoCelular: 0.1, movimentoRelogio: null },
    { heartRateZScore: 1, movimentoCelular: 0.1, movimentoRelogio: 0 },
  ]
  assert.deepEqual(leituras.map((l) => avaliarCorpo(l).modo), ['completo', 'so_celular', 'completo'])
})

test('sem nenhum sinal o corpo fica indisponível', () => {
  const r = avaliarCorpo({})
  assert.equal(r.disponivel, false)
  assert.equal(r.faixa, null)
  assert.equal(modoDosSensores({ bpm: null, movimentoCelular: null, movimentoRelogio: null }), null)
})

test('modo atividade reduz o peso do movimento em todos os cenários', () => {
  const normal = avaliarCorpo({ movimentoCelular: 0.9 })
  const atividade = avaliarCorpo({ movimentoCelular: 0.9, activityMode: true })
  assert.equal(normal.faixa, 'alto')
  assert.equal(atividade.escore, 0.45)
  assert.equal(atividade.faixa, 'medio')

  const completo = avaliarCorpo({ heartRateZScore: 0.5, movimentoCelular: 1, movimentoRelogio: 1, activityMode: true })
  perto(completo.pesos.bpm, 0.6)
  perto(completo.pesos.movimentoCelular, 0.1)
  assert.equal(completo.escore, 0.2)
})

test('soma dos pesos nominais é 1', () => {
  perto(Object.values(PESOS_DO_CORPO).reduce((a, b) => a + b, 0), 1)
})

test('matriz 3×3 do orientador, nas 9 combinações', () => {
  const esperado = {
    baixo: { baixo: 'baixo', medio: 'baixo', alto: 'moderado' },
    medio: { baixo: 'baixo', medio: 'moderado', alto: 'alto' },
    alto: { baixo: 'moderado', medio: 'alto', alto: 'alto' },
  }
  for (const faixaContexto of ['baixo', 'medio', 'alto']) {
    for (const faixaCorpo of ['baixo', 'medio', 'alto']) {
      assert.deepEqual(
        fundirCamadas({ contexto: contexto(faixaContexto), corpo: corpo(faixaCorpo) }),
        { estado: 'pronto', nivel: esperado[faixaContexto][faixaCorpo] },
      )
    }
  }
})

test('camada ausente: sem nível, nunca baixo', () => {
  assert.deepEqual(fundirCamadas({ contexto: null, corpo: corpo('alto') }), { estado: 'calculando', nivel: null })
  assert.deepEqual(fundirCamadas({ contexto: { disponivel: false }, corpo: corpo('alto') }), { estado: 'sem_contexto', nivel: null })
  assert.deepEqual(fundirCamadas({ contexto: contexto('alto'), corpo: { disponivel: false } }), { estado: 'calculando', nivel: null })
  assert.deepEqual(fundirCamadas({ contexto: contexto('alto'), corpo: null }), { estado: 'calculando', nivel: null })
})

test('local seguro entra pela Camada 1 e muda o resultado da matriz', () => {
  const celula = { escore_contexto: 0.5, percentil_33: 0.048, percentil_66: 0.092 }
  const fora = avaliarContexto({ municipio: 'S.PAULO', bairro: 'SE', celula })
  const dentro = avaliarContexto({ municipio: 'S.PAULO', bairro: 'SE', celula, emLocalSeguro: true })
  const c = avaliarCorpo({ movimentoCelular: 0.5 })
  assert.equal(fundirCamadas({ contexto: fora, corpo: c }).nivel, 'alto')
  assert.equal(fundirCamadas({ contexto: dentro, corpo: c }).nivel, 'moderado')
})

test('ações por nível', () => {
  assert.equal(acaoDoNivel('baixo'), 'nenhuma')
  assert.equal(acaoDoNivel('moderado'), 'monitoramento_reforcado')
  assert.equal(acaoDoNivel('alto'), 'alerta')
  assert.equal(acaoDoNivel(null), 'nenhuma')
})

test('persistência: alto por 5 s contínuos; só o SOS manual não espera', () => {
  assert.equal(ALTO_SUSTENTADO_MS, 5_000)
  const home = readFileSync(new URL('../screens/Home.js', import.meta.url), 'utf8')
  // O timer recomeça quando o nível muda (dependência nivelDoRisco): mede tempo contínuo.
  assert.match(home, /setTimeout\(\(\) => setAltoSustentado\(alto\), alto \? ALTO_SUSTENTADO_MS : 0\)/)
  assert.match(home, /\}, \[monitoramentoAtivo, nivelDoRisco\]\)/)
  // Sem atalho: o pico forte do celular só entra pela Camada 2 (alertaSoPelaMatriz.test.mjs).
  assert.match(home, /setSustainedHighRisk\(altoSustentado\)/)
  assert.ok(!/isHighRisk/.test(home))
  assert.ok(!/const ALTO_SUSTENTADO_MS/.test(home), 'a regra fica num lugar só (threeLayerRisk.js)')
  // SOS manual: segurar 3 s chama o envio direto, sem depender do nível.
  assert.match(home, /sosHoldTimerRef\.current = setTimeout\(\(\) => \{[\s\S]*?void executarEnvioDeSocorro\(\)[\s\S]*?\}, SOS_HOLD_MS\)/)
})
