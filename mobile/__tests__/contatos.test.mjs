import test from 'node:test'
import assert from 'node:assert/strict'
import { nomeDoTelefone } from '../utils/contatos.js'

const contatos = [
  { nome: 'Mãe', telefone: '(11) 94217-4470' },
  { nome: 'Ana', telefone: '+55 11 99484-1359' },
  { nome: 'Bia', telefone: '988040087' },
]

test('acha o nome com o número em outro formato', () => {
  assert.equal(nomeDoTelefone('+5511942174470', contatos), 'Mãe')
  assert.equal(nomeDoTelefone('+5511994841359', contatos), 'Ana')
  assert.equal(nomeDoTelefone('+5511988040087', contatos), 'Bia') // cadastro sem DDD: 8 últimos dígitos
})

test('sem contato correspondente ou número curto: nulo', () => {
  assert.equal(nomeDoTelefone('+5511900000000', contatos), null)
  assert.equal(nomeDoTelefone('190', contatos), null)
  assert.equal(nomeDoTelefone('+5511942174470', []), null)
})
