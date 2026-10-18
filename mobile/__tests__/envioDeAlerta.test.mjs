import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { enviarAlertaOuSimular, MENSAGEM_DO_ENVIO_SIMULADO } from '../services/envioDeAlerta.js'

const dados = { userId: 'u1', nomeUsuario: 'Teste', latitude: -23.6, longitude: -46.5, mensagem: 'ALERTA' }

test('em simulação, o envio real nunca é chamado', async () => {
  let chamadas = 0
  const enviar = async () => { chamadas += 1; return { enviado: true, enviados: ['Mãe'], falhas: [] } }
  const r = await enviarAlertaOuSimular({ simular: true, enviar, dados })
  assert.equal(chamadas, 0)
  assert.deepEqual(r, { simulado: true, enviado: false, enviados: [], falhas: [], detalhe: MENSAGEM_DO_ENVIO_SIMULADO })
  assert.equal(MENSAGEM_DO_ENVIO_SIMULADO, 'Envio simulado — nenhuma mensagem foi enviada')
})

test('fora da simulação, envia uma vez com os mesmos dados', async () => {
  const recebidos = []
  const enviar = async (d) => { recebidos.push(d); return { enviado: true, enviados: ['Mãe'], falhas: [] } }
  const r = await enviarAlertaOuSimular({ simular: false, enviar, dados })
  assert.deepEqual(recebidos, [dados])
  assert.equal(r.simulado, false)
  assert.equal(r.enviado, true)
  assert.deepEqual(r.enviados, ['Mãe'])
})

test('falha real continua sendo falha (não vira simulação)', async () => {
  const r = await enviarAlertaOuSimular({ simular: false, enviar: async () => ({ enviado: false, detalhe: 'sem rede' }), dados })
  assert.equal(r.simulado, false)
  assert.equal(r.enviado, false)
  assert.equal(r.detalhe, 'sem rede')
})

test('a Home só envia pela trava, e a trava cobre apresentação e simulação', () => {
  const home = readFileSync(new URL('../screens/Home.js', import.meta.url), 'utf8')
  // dispararAlerta só aparece no import e como função passada à trava.
  const usos = home.split('\n').filter((l) => l.includes('dispararAlerta') && !l.trim().startsWith('//'))
  assert.equal(usos.length, 2, usos.join('\n'))
  assert.ok(usos.some((l) => l.startsWith('import { dispararAlerta }')))
  assert.ok(usos.some((l) => l.trim() === 'enviar: dispararAlerta,'))
  assert.ok(!home.includes('dispararAlerta('))
  assert.match(home, /const envioSimulado = SHOW_PRESENTATION_MODE \|\| modoApresentacao \|\| contextoSimulado/)
  assert.match(home, /simular: envioSimulado,/)
  // SOS manual (segurar 3 s), fim da contagem e "Preciso de ajuda" usam a mesma função.
  assert.equal((home.match(/executarEnvioDeSocorro\(\)/g) || []).length, 3)
})
