import test from 'node:test'
import assert from 'node:assert/strict'
import { chaveDoLugar, criarFilaDeEnderecos } from '../services/filaDeEnderecos.js'

// Geocodificador falso: cada chamada fica pendente até o teste responder.
function geocodificadorFalso() {
  const chamadas = []
  const geocodificar = (coords) => new Promise((resolve, reject) => chamadas.push({ coords, resolve, reject }))
  return { chamadas, geocodificar }
}
const armazenamentoFalso = () => {
  const dados = new Map()
  return { dados, getItem: async (k) => dados.get(k) ?? null, setItem: async (k, v) => { dados.set(k, v) } }
}
const tique = () => new Promise((r) => setImmediate(r))
const MAUA = { latitude: -23.6486, longitude: -46.5736 }
const SE = { latitude: -23.5505, longitude: -46.6333 }
const PAULISTA = { latitude: -23.5614, longitude: -46.6559 }

test('Proteção passa na frente do Relatório', async () => {
  const g = geocodificadorFalso()
  const fila = criarFilaDeEnderecos({ geocodificar: g.geocodificar, esperar: async () => {} })
  const r1 = fila.buscar({ ...SE, prioridade: 'relatorio' })
  const r2 = fila.buscar({ ...PAULISTA, prioridade: 'relatorio' })
  await tique()
  const p = fila.buscar({ ...MAUA, prioridade: 'protecao' })
  await tique()
  // O primeiro do Relatório já tinha saído; o próximo a sair é o da Proteção.
  g.chamadas[0].resolve([{ district: 'Sé', city: 'São Paulo' }])
  await tique(); await tique()
  assert.deepEqual(g.chamadas[1].coords, MAUA)
  g.chamadas[1].resolve([{ district: 'Mauá', city: 'São Caetano do Sul' }])
  assert.equal((await p).enderecos[0].district, 'Mauá')
  await tique(); await tique()
  g.chamadas[2].resolve([{ district: 'Bela Vista' }])
  assert.equal((await r1).enderecos[0].district, 'Sé')
  assert.equal((await r2).enderecos[0].district, 'Bela Vista')
})

test('cache por quadradinho de ~150 m, na memória e no aparelho', async () => {
  const g = geocodificadorFalso()
  const armazenamento = armazenamentoFalso()
  const fila = criarFilaDeEnderecos({ geocodificar: g.geocodificar, armazenamento })
  const primeiro = fila.buscar(MAUA)
  await tique()
  g.chamadas[0].resolve([{ district: 'Mauá', city: 'São Caetano do Sul', street: 'Praça Mauá', streetNumber: '1', postalCode: '09580-900', timezone: 'America/Sao_Paulo' }])
  await primeiro
  const perto = await fila.buscar({ latitude: -23.6487, longitude: -46.5737 })
  assert.equal(perto.deCache, true)
  assert.equal(g.chamadas.length, 1)
  // Só os campos usados vão para o aparelho (o número fica para o endereço do SOS).
  const salvo = JSON.parse([...armazenamento.dados.values()][0])
  assert.deepEqual(salvo.enderecos, [{ district: 'Mauá', city: 'São Caetano do Sul', street: 'Praça Mauá', streetNumber: '1' }])
  // Outra sessão do app lê do aparelho.
  const outra = criarFilaDeEnderecos({ geocodificar: g.geocodificar, armazenamento })
  assert.equal((await outra.buscar(MAUA)).deCache, true)
  assert.equal(g.chamadas.length, 1)
})

test('pedidos do mesmo lugar em andamento são um só', async () => {
  const g = geocodificadorFalso()
  const fila = criarFilaDeEnderecos({ geocodificar: g.geocodificar })
  const a = fila.buscar(MAUA)
  const b = fila.buscar(MAUA)
  await tique()
  assert.equal(g.chamadas.length, 1)
  g.chamadas[0].resolve([{ district: 'Mauá' }])
  assert.equal((await a).enderecos[0].district, 'Mauá')
  assert.equal((await b).enderecos[0].district, 'Mauá')
})

test('nunca espera para sempre: prazo vence, e a resposta atrasada entra no cache', async () => {
  const g = geocodificadorFalso()
  const registros = []
  const fila = criarFilaDeEnderecos({ geocodificar: g.geocodificar, registrar: (t) => registros.push(t) })
  const r = await fila.buscar({ ...MAUA, prazoMs: 20 })
  assert.deepEqual({ enderecos: r.enderecos, expirou: r.expirou }, { enderecos: null, expirou: true })
  assert.ok(registros.includes('[endereço reverso] prazo vencido'))
  g.chamadas[0].resolve([{ district: 'Mauá' }])
  await tique()
  assert.equal((await fila.buscar(MAUA)).deCache, true)
})

test('erro (ex.: cota da Apple) é registrado e não trava a fila', async () => {
  const g = geocodificadorFalso()
  const registros = []
  const fila = criarFilaDeEnderecos({ geocodificar: g.geocodificar, registrar: (t, d) => registros.push([t, d]), plataforma: 'ios' })
  const falha = fila.buscar(MAUA)
  const depois = fila.buscar(SE)
  await tique()
  const erro = Object.assign(new Error('The operation couldn’t be completed. (kCLErrorDomain error 2.)'), { code: 'ERR_GEOCODING_FAILED' })
  g.chamadas[0].reject(erro)
  const r = await falha
  assert.equal(r.enderecos, null)
  assert.equal(r.erro.code, 'ERR_GEOCODING_FAILED')
  const [titulo, dados] = registros.find(([t]) => t === '[endereço reverso] erro')
  assert.equal(titulo, '[endereço reverso] erro')
  assert.equal(dados.plataforma, 'ios')
  await tique()
  g.chamadas[1].resolve([{ district: 'Sé' }])
  assert.equal((await depois).enderecos[0].district, 'Sé')
})

test('o resultado bruto vai para o console (todos os campos)', async () => {
  const g = geocodificadorFalso()
  const registros = []
  const fila = criarFilaDeEnderecos({ geocodificar: g.geocodificar, registrar: (t, d) => registros.push([t, d]) })
  const r = fila.buscar(MAUA)
  await tique()
  const bruto = [{ district: null, city: 'São Caetano do Sul', name: 'Praça Mauá, 1', subregion: null, timezone: 'America/Sao_Paulo' }]
  g.chamadas[0].resolve(bruto)
  await r
  const [, dados] = registros.find(([t]) => t === '[endereço reverso] resultado bruto')
  assert.deepEqual(dados.enderecos, bruto)
})

test('pedidos do Relatório saem espaçados', async () => {
  const g = geocodificadorFalso()
  const esperas = []
  let relogio = 0
  const fila = criarFilaDeEnderecos({
    geocodificar: g.geocodificar,
    agora: () => relogio,
    esperar: async (ms) => { esperas.push(ms); relogio += ms },
  })
  const a = fila.buscar({ ...SE, prioridade: 'relatorio' })
  const b = fila.buscar({ ...PAULISTA, prioridade: 'relatorio' })
  await tique()
  g.chamadas[0].resolve([])
  await a
  await tique(); await tique()
  assert.deepEqual(esperas, [1500])
  g.chamadas[1].resolve([])
  await b
})

test('quadradinhos diferentes têm chaves diferentes', () => {
  assert.equal(chaveDoLugar(-23.6486, -46.5736), chaveDoLugar(-23.6490, -46.5740))
  assert.notEqual(chaveDoLugar(-23.6486, -46.5736), chaveDoLugar(-23.5505, -46.6333))
})
