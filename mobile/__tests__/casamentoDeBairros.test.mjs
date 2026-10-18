import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { encontrarCelula, localDoEndereco, normalizarNome } from '../utils/contextLayer.js'

// Para cada bairro do mapa, simula o nome como o GPS devolveria e confere se o app acha
// a célula certa em todos os períodos em que o bairro tem célula.
//
// "Como o GPS devolveria": sem o complemento entre parênteses que só a SSP usa
// ("(ZONA SUL)"), com as abreviações por extenso ("JD" → "Jardim") e com iniciais
// maiúsculas; a cidade com o nome comum ("São Caetano do Sul"). Não cobre bairros que o
// geocodificador chama por outro nome — isso só o log do aparelho mostra.

const [cabecalho, ...linhas] = readFileSync(new URL('../../data/processed/context_risk_map.csv', import.meta.url), 'utf8').trim().split('\n')
const colunas = cabecalho.split(',')
const mapa = linhas.map((l) => Object.fromEntries(l.split(',').map((v, i) => [colunas[i], v])))

const CIDADE = {
  'S.PAULO': 'São Paulo', 'S.CAETANO DO SUL': 'São Caetano do Sul', 'S.BERNARDO DO CAMPO': 'São Bernardo do Campo',
  'S.ANDRE': 'Santo André', DIADEMA: 'Diadema', MAUA: 'Mauá', OSASCO: 'Osasco', GUARULHOS: 'Guarulhos', BARUERI: 'Barueri',
}
const POR_EXTENSO = { JD: 'Jardim', JDM: 'Jardim', VL: 'Vila', PQ: 'Parque', PRQ: 'Parque', STA: 'Santa', STO: 'Santo', CJ: 'Conjunto', CONJ: 'Conjunto', CID: 'Cidade', RES: 'Residencial', CHAC: 'Chácara' }
const MINUSCULAS = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E'])
const semComplemento = (nome) => nome.replace(/\s*\(.*\)\s*$/, '')
const porExtenso = (nome) => nome.split(' ').map((p) => (POR_EXTENSO[p] ?? p).toUpperCase()).join(' ')
const comoOGps = (ssp) => semComplemento(ssp).split(' ')
  .map((p, i) => POR_EXTENSO[p] ?? (i > 0 && MINUSCULAS.has(p) ? p.toLowerCase() : p.charAt(0) + p.slice(1).toLowerCase()))
  .join(' ')

const fatias = {}
for (const c of mapa) (fatias[`${c.municipio}|${c.periodo}`] ??= []).push(c)
const bairros = [...new Set(mapa.map((c) => `${c.municipio}|${c.bairro}`))].map((k) => k.split('|'))
const nomesDoMunicipio = (m) => [...new Set(mapa.filter((c) => c.municipio === m).map((c) => c.bairro))]

function avaliar([municipio, bairro]) {
  const local = localDoEndereco([{ city: CIDADE[municipio], district: comoOGps(bairro) }])
  if (local.municipio !== municipio) return { tipo: 'municipio', municipio, bairro }
  // Olha todos os períodos: basta um com a célula de outro bairro para contar como
  // "outra"; "nenhuma" é quando não acha célula em período nenhum (vai a cidade).
  const periodos = mapa.filter((c) => c.municipio === municipio && c.bairro === bairro).map((c) => c.periodo)
  const achadas = periodos.map((periodo) => encontrarCelula(fatias[`${municipio}|${periodo}`], local.bairro))
  const outra = achadas.find((c) => c && c.bairro !== bairro)
  if (outra) return { tipo: 'outra', municipio, bairro, achou: outra.bairro, emParte: achadas.some((c) => !c) }
  if (achadas.every((c) => !c)) return { tipo: 'nenhuma', municipio, bairro }
  if (achadas.some((c) => !c)) return { tipo: 'parcial', municipio, bairro }
  return { tipo: 'certo', municipio, bairro }
}

const resultados = bairros.map(avaliar)
const doTipo = (t) => resultados.filter((r) => r.tipo === t)

test('todos os bairros do mapa entram na conta', () => {
  assert.equal(bairros.length, 2336)
  assert.equal(doTipo('municipio').length, 0, 'toda cidade do GPS vira o município da SSP')
})

test('Mauá (São Caetano do Sul) e os bairros da Eureka casam com a própria célula', () => {
  for (const [m, b] of [['S.CAETANO DO SUL', 'MAUA'], ['S.CAETANO DO SUL', 'CENTRO'], ['S.CAETANO DO SUL', 'BARCELONA'], ['S.PAULO', 'BELA VISTA'], ['S.PAULO', 'SE']]) {
    assert.equal(avaliar([m, b]).tipo, 'certo', `${m} / ${b}`)
  }
})

test('2.239 de 2.336 casam com a própria célula em todos os períodos', () => {
  assert.equal(doTipo('certo').length, 2239)
})

test('quem cai em outra célula é grafia duplicada ou homônimo da SSP, nada mais', () => {
  const outras = doTipo('outra')
  assert.equal(outras.length, 77)
  const abreviacao = outras.filter((r) => porExtenso(r.bairro) === porExtenso(r.achou))
  const homonimo = outras.filter((r) => semComplemento(r.bairro) !== r.bairro && normalizarNome(semComplemento(r.bairro)) === r.achou)
  assert.equal(abreviacao.length, 14) // JD/JARDIM, PQ/PARQUE: o mesmo lugar (pendência de grafias)
  assert.equal(homonimo.length, 63) // "JARDIM ANGELA (ZONA LESTE)" → "JARDIM ANGELA" (outro lugar)
  assert.equal(abreviacao.length + homonimo.length, outras.length)
  assert.equal(outras.filter((r) => r.emParte).length, 20) // nos outros períodos, vai a cidade
})

test('quem fica sem célula é homônimo ambíguo: o app usa a estimativa da cidade', () => {
  const semCelula = [...doTipo('nenhuma'), ...doTipo('parcial')]
  assert.equal(doTipo('nenhuma').length, 17) // sempre a cidade
  assert.equal(doTipo('parcial').length, 3) // a própria célula em parte do dia, a cidade no resto
  for (const r of semCelula) {
    const base = normalizarNome(semComplemento(r.bairro))
    const xaras = nomesDoMunicipio(r.municipio).filter((n) => normalizarNome(semComplemento(n)) === base)
    assert.ok(xaras.length >= 2, `${r.bairro}: esperava homônimos`)
  }
})
