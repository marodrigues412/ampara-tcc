import test from 'node:test'
import assert from 'node:assert/strict'
import { agruparPorCelula, chaveDaCelula, resumirContextos } from '../utils/contextoDosLugares.js'

const ponto = (lat, lon, quando = '2026-10-23T17:00:00Z') => ({ latitude: lat, longitude: lon, created_at: quando })

test('pontos a menos de ~150 m caem no mesmo quadradinho', () => {
  assert.equal(chaveDaCelula(-23.6481, -46.5731), chaveDaCelula(-23.6485, -46.5735))
  assert.notEqual(chaveDaCelula(-23.6481, -46.5731), chaveDaCelula(-23.6531, -46.5731))
})

test('agrupa, ordena pelo mais visitado e limita os endereços reversos', () => {
  const pontos = [
    ponto(-23.6481, -46.5731), ponto(-23.6482, -46.5732), ponto(-23.6483, -46.5733),
    ponto(-23.5600, -46.6500),
    ponto(-23.5000, -46.6000), ponto(-23.5001, -46.6001),
    { latitude: null, longitude: -46.6, created_at: '2026-10-23T17:00:00Z' },
  ]
  const { usadas, deFora } = agruparPorCelula(pontos, 2)
  assert.deepEqual(usadas.map((c) => c.pontos.length), [3, 2])
  assert.equal(deFora, 1)
})

test('resumo: % dos pontos por faixa do mapa e quanto veio da estimativa da cidade', () => {
  const r = resumirContextos([
    { faixa: 'alto', origem: 'bairro' }, { faixa: 'alto', origem: 'bairro' },
    { faixa: 'medio', origem: 'cidade' }, { faixa: null, origem: null },
  ])
  assert.equal(r.total, 4)
  assert.deepEqual(r.pct, { baixo: 0, medio: 25, alto: 50, sem_dados: 25 })
  assert.equal(r.pctDaCidade, 25)
  assert.equal(resumirContextos([]).pct, null)
})
