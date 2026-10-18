import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { municipioPorCoordenada } from '../utils/municipioPorCoordenada.js'

const dados = JSON.parse(readFileSync(new URL('../data/municipios_rmsp.json', import.meta.url), 'utf8'))
const onde = (lat, lon) => municipioPorCoordenada(lat, lon, dados)

test('os 9 municípios do recorte estão nos contornos', () => {
  assert.deepEqual(dados.municipios.map((m) => m.municipio).sort(), [
    'BARUERI', 'DIADEMA', 'GUARULHOS', 'MAUA', 'OSASCO', 'S.ANDRE', 'S.BERNARDO DO CAMPO', 'S.CAETANO DO SUL', 'S.PAULO',
  ])
})

test('pontos conhecidos caem no município certo, sem rede', () => {
  assert.equal(onde(-23.6486, -46.5736), 'S.CAETANO DO SUL') // Instituto Mauá (Praça Mauá)
  assert.equal(onde(-23.6229, -46.5548), 'S.CAETANO DO SUL') // Centro de São Caetano
  assert.equal(onde(-23.5505, -46.6333), 'S.PAULO') // Praça da Sé
  assert.equal(onde(-23.5614, -46.6559), 'S.PAULO') // Av. Paulista
  assert.equal(onde(-23.6639, -46.5383), 'S.ANDRE') // Centro de Santo André
  assert.equal(onde(-23.4628, -46.5333), 'GUARULHOS')
  assert.equal(onde(-23.5329, -46.7917), 'OSASCO')
  assert.equal(onde(-23.5113, -46.8763), 'BARUERI')
})

test('fora do recorte ou sem coordenada: nulo (sem dados da região)', () => {
  assert.equal(onde(-22.9056, -47.0608), null) // Campinas
  assert.equal(onde(-23.9608, -46.3336), null) // Santos
  assert.equal(onde(null, -46.6), null)
  assert.equal(onde(-23.5, undefined), null)
  assert.equal(municipioPorCoordenada(-23.55, -46.63, null), null)
})
