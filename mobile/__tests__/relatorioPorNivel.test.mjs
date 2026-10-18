import test from 'node:test'
import assert from 'node:assert/strict'
import {
  gradePorNivel,
  minutosDe,
  nivelNaJanela,
  nivelPorDia,
  normalizarLinhas,
  porModoDeSensores,
  predominante,
  resumoPorNivel,
  tendenciaDoAlto,
} from '../utils/relatorioPorNivel.js'

// 23/10/2026 é sexta; 22/10, quinta.
const linhas = normalizarLinhas([
  { dia: '2026-10-23', hora: 14, nivel: 'alto', modo_sensores: 'so_celular', avaliacoes: 20 },
  { dia: '2026-10-23', hora: 14, nivel: 'baixo', modo_sensores: 'so_celular', avaliacoes: 60 },
  { dia: '2026-10-23', hora: 15, nivel: 'sem_nivel', modo_sensores: 'so_celular', avaliacoes: 20 },
  { dia: '2026-10-22', hora: 8, nivel: 'moderado', modo_sensores: 'completo', avaliacoes: 10 },
  { dia: '2026-10-22', hora: 8, nivel: 'alto', modo_sensores: 'completo', avaliacoes: 10 },
  { dia: '2026-10-22', hora: 21, nivel: 'qualquer', modo_sensores: 'completo', avaliacoes: 4 },
])
const HOJE = new Date(2026, 9, 23, 18)

test('cada avaliação vale 30 s', () => {
  assert.equal(minutosDe(120), 60)
})

test('nível fora da lista conta como sem nível', () => {
  assert.equal(linhas.at(-1).nivel, 'sem_nivel')
})

test('predominante: mais tempo; empate fica com o nível mais alto', () => {
  assert.equal(predominante({ baixo: 5, moderado: 1, alto: 0 }), 'baixo')
  assert.equal(predominante({ baixo: 5, moderado: 5, alto: 0 }), 'moderado')
  assert.equal(predominante({ baixo: 0, moderado: 0, alto: 0 }), null)
})

test('risco por dia: % do tempo em cada nível, com dias vazios', () => {
  const dias = nivelPorDia(linhas, 3, HOJE)
  assert.equal(dias.length, 3)
  assert.equal(dias[0].total, 0)
  assert.equal(dias[0].pct, null)
  const sexta = dias[2]
  assert.equal(sexta.total, 100)
  assert.deepEqual(sexta.pct, { baixo: 60, moderado: 0, alto: 20, sem_nivel: 20 })
  assert.equal(sexta.predominante, 'baixo')
  const quinta = dias[1]
  assert.equal(quinta.predominante, 'alto') // 10 × 10: empate, fica o mais alto
  assert.equal(Math.round(Object.values(quinta.pct).reduce((a, b) => a + b, 0)), 100)
})

test('horários mais expostos: nível predominante por dia da semana × período', () => {
  const { grade, pior } = gradePorNivel(linhas)
  assert.equal(grade.tarde[5].predominante, 'baixo') // sexta à tarde
  assert.equal(grade.manha[4].predominante, 'alto') // quinta de manhã
  assert.equal(grade.noite[4].predominante, null) // só sem nível
  assert.equal(grade.noite[4].total, 4)
  assert.equal(grade.manha[1].total, 0)
  assert.equal(pior.dia, 4)
  assert.equal(pior.periodo.id, 'manha')
})

test('resumo do período e tendência do tempo em alto', () => {
  const r = resumoPorNivel(linhas)
  assert.equal(r.total, 124)
  assert.equal(r.minutos.alto, 15)
  assert.equal(r.minutosMonitorados, 62)
  assert.equal(r.diasComRegistro, 2)
  const anterior = resumoPorNivel(normalizarLinhas([{ dia: '2026-10-15', hora: 9, nivel: 'alto', avaliacoes: 50 }, { dia: '2026-10-15', hora: 9, nivel: 'baixo', avaliacoes: 50 }]))
  assert.deepEqual(tendenciaDoAlto(r, anterior), { pontos: -26, melhorou: true, igual: false })
  assert.equal(tendenciaDoAlto(r, resumoPorNivel([])), null)
})

test('modo de sensores em % do tempo', () => {
  const modos = porModoDeSensores(linhas)
  assert.equal(modos[0].modo, 'so_celular')
  assert.equal(Math.round(modos[0].pct), 81)
  assert.equal(modos[1].modo, 'completo')
  assert.deepEqual(porModoDeSensores([]), [])
})

test('trajeto: nível predominante nas horas da janela, nos dias em que ele acontece', () => {
  // Quinta (4), saída 07:40 → chegada 08:30: horas 7 e 8.
  const quinta = nivelNaJanela(linhas, [4], 7 * 60 + 40, 8 * 60 + 30)
  assert.equal(quinta.predominante, 'alto')
  assert.equal(quinta.total, 20)
  // Janela que termina na hora cheia não conta a hora seguinte.
  assert.equal(nivelNaJanela(linhas, [5], 13 * 60, 14 * 60).total, 0)
  assert.equal(nivelNaJanela(linhas, [1, 2], 0, 24 * 60).predominante, null)
})
