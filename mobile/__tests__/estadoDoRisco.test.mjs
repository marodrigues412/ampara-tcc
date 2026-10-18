import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { estadoDoRiscoParaLia, limparEstadoDoRisco, publicarEstadoDoRisco, VALIDADE_DO_ESTADO_MS } from '../services/estadoDoRisco.js'

const AGORA = 1_800_000_000_000
const FUNCAO = readFileSync(new URL('../../supabase/functions/ampara-chat/index.ts', import.meta.url), 'utf8')

test('a Lia recebe nível, origem e modo de sensores', () => {
  publicarEstadoDoRisco({ nivel: 'moderado', estado: 'pronto', origem: 'cidade', modo: 'so_celular' }, AGORA)
  assert.deepEqual(estadoDoRiscoParaLia(AGORA + 1_000), {
    nivelAtual: 'moderado',
    origemDoContexto: 'estimativa da cidade',
    modoDosSensores: 'só celular',
  })
})

test('só esses três campos, e só rótulos: nada de nota, bairro ou posição', () => {
  publicarEstadoDoRisco({
    nivel: 'alto', estado: 'pronto', origem: 'bairro', modo: 'completo',
    escore: 0.1238, bairro: 'MAUA', latitude: -23.6,
  }, AGORA)
  const campos = estadoDoRiscoParaLia(AGORA)
  assert.deepEqual(Object.keys(campos).sort(), ['modoDosSensores', 'nivelAtual', 'origemDoContexto'])
  assert.ok(!JSON.stringify(campos).match(/0\.12|MAUA|-23/))
})

test('valores fora da lista viram vazio', () => {
  publicarEstadoDoRisco({ nivel: 'Bela Vista', estado: 'pronto', origem: 'SE', modo: 'qualquer' }, AGORA)
  assert.equal(estadoDoRiscoParaLia(AGORA), null)
  publicarEstadoDoRisco({ nivel: 'baixo', estado: 'pronto', origem: 'toString', modo: '__proto__' }, AGORA)
  assert.deepEqual(estadoDoRiscoParaLia(AGORA), { nivelAtual: 'baixo', origemDoContexto: null, modoDosSensores: null })
})

test('sem nível calculado: diz o estado, sem origem', () => {
  publicarEstadoDoRisco({ nivel: null, estado: 'sem_contexto', origem: null, modo: 'so_celular' }, AGORA)
  assert.equal(estadoDoRiscoParaLia(AGORA).nivelAtual, 'sem dados da região (o app não estima o nível agora)')
  assert.equal(estadoDoRiscoParaLia(AGORA).origemDoContexto, null)
  publicarEstadoDoRisco({ monitoramentoAtivo: false, nivel: 'alto', estado: 'pronto', origem: 'bairro', modo: 'completo' }, AGORA)
  assert.deepEqual(estadoDoRiscoParaLia(AGORA), { nivelAtual: 'monitoramento pausado', origemDoContexto: null, modoDosSensores: null })
})

test('leitura velha não é "atual"', () => {
  publicarEstadoDoRisco({ nivel: 'baixo', estado: 'pronto', origem: 'bairro', modo: 'completo' }, AGORA)
  assert.ok(estadoDoRiscoParaLia(AGORA + VALIDADE_DO_ESTADO_MS))
  assert.equal(estadoDoRiscoParaLia(AGORA + VALIDADE_DO_ESTADO_MS + 1), null)
  limparEstadoDoRisco()
  assert.equal(estadoDoRiscoParaLia(AGORA), null)
})

test('todo rótulo que o app manda é aceito pela função ampara-chat', () => {
  const rotulos = new Set()
  for (const estado of ['pronto', 'calculando', 'sem_contexto']) {
    for (const nivel of ['baixo', 'moderado', 'alto']) {
      for (const origem of ['bairro', 'cidade']) {
        for (const modo of ['completo', 'so_celular', 'parcial', 'so_relogio']) {
          for (const monitoramentoAtivo of [true, false]) {
            publicarEstadoDoRisco({ monitoramentoAtivo, nivel, estado, origem, modo }, AGORA)
            for (const valor of Object.values(estadoDoRiscoParaLia(AGORA) ?? {})) if (valor) rotulos.add(valor)
          }
        }
      }
    }
  }
  assert.equal(rotulos.size, 6 + 2 + 4)
  for (const rotulo of rotulos) assert.ok(FUNCAO.includes(`'${rotulo}'`), `a função não aceita "${rotulo}"`)
})
