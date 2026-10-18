import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { COLUNAS_3_CAMADAS, linhaNoFormatoAntigo, montarLinhaDaAvaliacao } from '../services/riskAssessmentRow.js'

const MIGRACAO = readFileSync(new URL('../../data/score_3_camadas.sql', import.meta.url), 'utf8')
// Sem os comentários, para as checagens olharem só o que o banco executa.
const SQL = MIGRACAO.split('\n').filter((linha) => !linha.trim().startsWith('--')).join('\n').toLowerCase()

const avaliacao = {
  measuredAt: '2026-10-23T15:00:00.000Z',
  bpm: null,
  experimentalRiskLevel: 'moderado',
  sensorMode: 'so_celular',
  bodyScore: 0.5,
  bodyBand: 'medio',
  contextBand: 'alto',
  contextOrigin: 'cidade',
  contextUnavailableReason: 'sem_celula',
  // Nada disto pode ir para o banco, mesmo se alguém passar.
  contextCellScore: 0.1238,
  nearbyCrimeCount: 4321,
  crimeDensityPerKm2: 1375.4,
  escore: 0.1238,
  bairro: 'MAUA',
  municipio: 'S.CAETANO DO SUL',
  latitude: -23.648,
  longitude: -46.573,
}

test('grava faixa, origem do contexto e modo de sensores', () => {
  const linha = montarLinhaDaAvaliacao('usuaria-1', avaliacao)
  assert.equal(linha.user_id, 'usuaria-1')
  assert.equal(linha.context_band, 'alto')
  assert.equal(linha.context_origin, 'cidade')
  assert.equal(linha.sensor_mode, 'so_celular')
  assert.equal(linha.experimental_risk_level, 'moderado')
})

test('não grava a nota da célula, crimes do entorno, coordenada nem nome do lugar', () => {
  const linha = montarLinhaDaAvaliacao('usuaria-1', avaliacao)
  const proibidas = Object.keys(linha).filter((coluna) => /cell|escore|lat|lon|bairro|munic|endereco|address|crime/.test(coluna))
  assert.deepEqual(proibidas, [])
  for (const valor of [0.1238, 4321, 1375.4, 'MAUA', 'S.CAETANO DO SUL', -23.648, -46.573]) {
    assert.ok(!Object.values(linha).includes(valor), `valor ${valor} foi parar na linha`)
  }
})

test('formato antigo tira só as colunas do score de 3 camadas', () => {
  const linha = montarLinhaDaAvaliacao('usuaria-1', { ...avaliacao, bpm: 80 })
  const antiga = linhaNoFormatoAntigo(linha)
  for (const coluna of COLUNAS_3_CAMADAS) assert.ok(!(coluna in antiga), coluna)
  assert.equal(antiga.bpm, 80)
  assert.equal(antiga.user_id, 'usuaria-1')
  assert.ok('context_band' in linha, 'a linha original não pode ser alterada')
})

test('a migração cria exatamente as colunas que o app grava', () => {
  const criadas = [...SQL.matchAll(/add column if not exists (\w+)/g)].map((m) => m[1]).sort()
  assert.deepEqual(criadas, [...COLUNAS_3_CAMADAS].sort())
  assert.ok(!SQL.includes('context_cell_score'))
})

test('a migração não apaga, reescreve nem mexe na RLS', () => {
  for (const proibido of ['drop table', 'drop column', 'delete ', 'update ', 'truncate', 'policy', 'row level security', 'set not null', 'grant', 'revoke']) {
    assert.ok(!SQL.includes(proibido), `encontrou "${proibido}"`)
  }
  // Colunas novas aceitam vazio: nenhuma é not null nem tem default que preencha linhas antigas.
  for (const m of SQL.matchAll(/add column if not exists \w+ ([^,;]+)/g)) {
    assert.ok(!/not null|default/.test(m[1]), m[0])
  }
})
