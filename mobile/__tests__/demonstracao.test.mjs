import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LOCAIS_DE_DEMONSTRACAO } from '../constants/demonstracao.js'
import { avaliarContexto, encontrarCelula } from '../utils/contextLayer.js'

const [cabecalho, ...linhas] = readFileSync(new URL('../../data/processed/context_risk_map.csv', import.meta.url), 'utf8').trim().split('\n')
const nomes = cabecalho.split(',')
const mapa = linhas.map((l) => Object.fromEntries(l.split(',').map((v, i) => [nomes[i], v])))

test('os locais da demonstração mostram baixo, médio e alto no horário do estande', () => {
  const faixas = new Set()
  for (const lugar of LOCAIS_DE_DEMONSTRACAO) {
    for (const periodo of ['manha', 'tarde']) {
      const celulas = mapa.filter((c) => c.municipio === lugar.municipio && c.periodo === periodo)
      const r = avaliarContexto({ municipio: lugar.municipio, bairro: lugar.bairro, celula: encontrarCelula(celulas, lugar.bairro) })
      assert.equal(r.origem, 'bairro', `${lugar.rotulo} ${periodo} sem célula do bairro`)
      assert.equal(r.faixa, lugar.faixaNaEureka, `${lugar.rotulo} ${periodo}`)
      faixas.add(r.faixa)
    }
  }
  assert.deepEqual([...faixas].sort(), ['alto', 'baixo', 'medio'])
  assert.ok(LOCAIS_DE_DEMONSTRACAO.some((l) => l.municipio === 'S.CAETANO DO SUL'))
})
