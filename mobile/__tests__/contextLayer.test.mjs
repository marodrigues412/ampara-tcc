import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  avaliarContexto,
  baixarUmaFaixa,
  encontrarCelula,
  faixaPorPercentis,
  localDoEndereco,
  municipioDaSsp,
  normalizarNome,
  periodoDoHorario,
} from '../utils/contextLayer.js'

const P33 = 0.04805914972273567
const P66 = 0.09242144177449169

function celula(bairro, escore, extra = {}) {
  return {
    municipio: 'S.PAULO', bairro, periodo: 'noite',
    escore_contexto: escore, percentil_33: P33, percentil_66: P66, ...extra,
  }
}

test('períodos seguem os cortes do mapa (0–5, 6–11, 12–17, 18–23)', () => {
  const em = (hora) => periodoDoHorario(new Date(2026, 9, 23, hora, 30))
  assert.equal(em(0), 'madrugada')
  assert.equal(em(5), 'madrugada')
  assert.equal(em(6), 'manha')
  assert.equal(em(11), 'manha')
  assert.equal(em(12), 'tarde')
  assert.equal(em(17), 'tarde')
  assert.equal(em(18), 'noite')
  assert.equal(em(23), 'noite')
})

test('nomes do geocodificador viram nomes da SSP', () => {
  assert.equal(normalizarNome('  Freguesia   do Ó '), 'FREGUESIA DO O')
  assert.equal(municipioDaSsp('São Paulo'), 'S.PAULO')
  assert.equal(municipioDaSsp('Santo André'), 'S.ANDRE')
  assert.equal(municipioDaSsp('São Bernardo do Campo'), 'S.BERNARDO DO CAMPO')
  assert.equal(municipioDaSsp('Campinas'), null)
  assert.deepEqual(
    localDoEndereco({ city: null, subregion: 'São Paulo', district: 'Bela Vista' }),
    { municipio: 'S.PAULO', bairro: 'BELA VISTA' },
  )
  assert.deepEqual(localDoEndereco({ city: 'São Paulo', district: '' }), { municipio: 'S.PAULO', bairro: null })
})

test('endereço do iOS (sem formattedAddress) e do Android, com vários resultados', () => {
  const iphone = [
    { city: 'São Paulo', district: null, subregion: null, name: 'Av. Paulista, 1000' },
    { city: 'São Paulo', district: 'Bela Vista', subregion: null },
  ]
  assert.deepEqual(localDoEndereco(iphone), { municipio: 'S.PAULO', bairro: 'BELA VISTA' })

  const android = [{
    city: null, subregion: 'São Paulo', district: null,
    formattedAddress: 'R. Augusta, 100 - Consolação, São Paulo - SP, 01304-000, Brasil',
  }]
  assert.deepEqual(localDoEndereco(android), { municipio: 'S.PAULO', bairro: 'CONSOLACAO' })

  // Cidade do endereço formatado diferente do município: não usa.
  assert.equal(localDoEndereco([{
    city: 'São Paulo', district: null,
    formattedAddress: 'R. A, 1 - Centro, Osasco - SP, 06000-000, Brasil',
  }]).bairro, null)
  assert.deepEqual(localDoEndereco([]), { municipio: null, bairro: null })
  assert.deepEqual(localDoEndereco(null), { municipio: null, bairro: null })
})

test('acha o bairro por nome exato, abreviado ou sem o complemento de homônimo', () => {
  const celulas = [
    celula('BELA VISTA', 0.1),
    celula('JARDIM PAULISTA', 0.05),
    celula('JARDIM BRASIL (ZONA NORTE)', 0.06),
    celula('CHACARA SANTO ANTONIO (ZONA SUL)', 0.03),
    celula('CHACARA SANTO ANTONIO (ZONA LESTE)', 0.07),
  ]
  assert.equal(encontrarCelula(celulas, 'Bela Vista').bairro, 'BELA VISTA')
  assert.equal(encontrarCelula(celulas, 'Jd. Paulista').bairro, 'JARDIM PAULISTA')
  assert.equal(encontrarCelula(celulas, 'Jardim Brasil').bairro, 'JARDIM BRASIL (ZONA NORTE)')
  // Dois homônimos: não escolhe um no chute.
  assert.equal(encontrarCelula(celulas, 'Chácara Santo Antônio'), null)
  assert.equal(encontrarCelula(celulas, 'Moema'), null)
  assert.equal(encontrarCelula(celulas, ''), null)
  assert.equal(encontrarCelula([], 'Bela Vista'), null)
})

test('faixa usa os percentis 33/66 da própria tabela', () => {
  assert.equal(faixaPorPercentis(0.03, P33, P66), 'baixo')
  assert.equal(faixaPorPercentis(P33, P33, P66), 'medio')
  assert.equal(faixaPorPercentis(P66, P33, P66), 'medio')
  assert.equal(faixaPorPercentis(0.2, P33, P66), 'alto')
  assert.equal(faixaPorPercentis(null, P33, P66), null)
})

// CSV simples com campos entre aspas (o pandas só cita quando há vírgula).
function lerCsv(caminho) {
  const texto = readFileSync(new URL(caminho, import.meta.url), 'utf8').trim()
  const linhas = texto.split('\n').map((linha) => {
    const campos = []
    let atual = ''
    let entreAspas = false
    for (const c of linha) {
      if (c === '"') entreAspas = !entreAspas
      else if (c === ',' && !entreAspas) { campos.push(atual); atual = '' }
      else atual += c
    }
    campos.push(atual)
    return campos
  })
  const [cabecalho, ...dados] = linhas
  return dados.map((campos) => {
    assert.equal(campos.length, cabecalho.length, campos.join(','))
    return Object.fromEntries(cabecalho.map((nome, i) => [nome, campos[i]]))
  })
}

for (const [nome, caminho] of [
  ['bairros', '../../data/processed/context_risk_map.csv'],
  ['reserva da cidade', '../../data/processed/context_risk_map_cidade.csv'],
]) {
  test(`a regra do app reproduz o nivel_contexto do Python em todo o mapa (${nome})`, () => {
    const linhas = lerCsv(caminho)
    assert.ok(linhas.length > 0)
    for (const linha of linhas) {
      assert.equal(
        faixaPorPercentis(linha.escore_contexto, linha.percentil_33, linha.percentil_66),
        linha.nivel_contexto,
        JSON.stringify(linha),
      )
      // O app consulta pelo período com o nome sem acento da tabela.
      assert.ok(['madrugada', 'manha', 'tarde', 'noite'].includes(linha.periodo), linha.periodo)
    }
  })
}

test('reserva da cidade usa a mesma régua (percentis) do mapa de bairros', () => {
  const bairros = lerCsv('../../data/processed/context_risk_map.csv')
  const cidades = lerCsv('../../data/processed/context_risk_map_cidade.csv')
  for (const cidade of cidades) {
    assert.equal(cidade.percentil_33, bairros[0].percentil_33)
    assert.equal(cidade.percentil_66, bairros[0].percentil_66)
  }
})

test('bairro sem célula usa a estimativa da cidade', () => {
  const cidade = { municipio: 'S.CAETANO DO SUL', periodo: 'noite', escore_contexto: 0.06, percentil_33: P33, percentil_66: P66 }
  const semCelula = avaliarContexto({ municipio: 'S.CAETANO DO SUL', bairro: 'MAUA', celula: null, celulaDaCidade: cidade })
  assert.equal(semCelula.disponivel, true)
  assert.equal(semCelula.origem, 'cidade')
  assert.equal(semCelula.motivo, 'sem_celula')
  assert.equal(semCelula.faixa, 'medio')

  const semBairro = avaliarContexto({ municipio: 'S.CAETANO DO SUL', bairro: null, celula: null, celulaDaCidade: cidade })
  assert.equal(semBairro.origem, 'cidade')
  assert.equal(semBairro.motivo, 'bairro_nao_identificado')

  // Com célula do bairro, a da cidade é ignorada.
  const doBairro = avaliarContexto({ municipio: 'S.PAULO', bairro: 'SE', celula: celula('SE', 0.5), celulaDaCidade: cidade })
  assert.equal(doBairro.origem, 'bairro')
  assert.equal(doBairro.faixa, 'alto')

  // Local seguro baixa a estimativa da cidade também.
  assert.equal(avaliarContexto({ municipio: 'S.CAETANO DO SUL', bairro: 'MAUA', celula: null, celulaDaCidade: cidade, emLocalSeguro: true }).faixa, 'baixo')

  // Município fora do mapa não usa reserva nenhuma.
  assert.equal(avaliarContexto({ municipio: null, bairro: 'CENTRO', celula: null, celulaDaCidade: cidade }).disponivel, false)
})

test('célula ausente é indisponível, nunca baixo', () => {
  for (const [entrada, motivo] of [
    [{ municipio: null, bairro: 'CENTRO', celula: null }, 'fora_da_cobertura'],
    [{ municipio: 'S.PAULO', bairro: null, celula: null }, 'bairro_nao_identificado'],
    [{ municipio: 'S.PAULO', bairro: 'MOEMA', celula: null }, 'sem_celula'],
  ]) {
    const resultado = avaliarContexto(entrada)
    assert.equal(resultado.disponivel, false)
    assert.equal(resultado.faixa, null)
    assert.equal(resultado.motivo, motivo)
  }
  // Local seguro não transforma "sem dados" em "baixo".
  assert.equal(avaliarContexto({ municipio: 'S.PAULO', bairro: 'MOEMA', celula: null, emLocalSeguro: true }).faixa, null)
})

test('célula presente devolve a faixa do mapa', () => {
  const alto = avaliarContexto({ municipio: 'S.PAULO', bairro: 'SE', celula: celula('SE', 0.5) })
  assert.equal(alto.disponivel, true)
  assert.equal(alto.faixa, 'alto')
  assert.equal(alto.faixaDoMapa, 'alto')
  assert.equal(alto.escore, 0.5)
  assert.equal(alto.localSeguroAplicado, false)
})

test('local seguro baixa uma faixa, e baixo continua baixo', () => {
  assert.equal(baixarUmaFaixa('alto'), 'medio')
  assert.equal(baixarUmaFaixa('medio'), 'baixo')
  assert.equal(baixarUmaFaixa('baixo'), 'baixo')
  const seguro = (escore) => avaliarContexto({
    municipio: 'S.PAULO', bairro: 'SE', celula: celula('SE', escore), emLocalSeguro: true,
  })
  assert.equal(seguro(0.5).faixa, 'medio')
  assert.equal(seguro(0.5).faixaDoMapa, 'alto')
  assert.equal(seguro(0.5).localSeguroAplicado, true)
  assert.equal(seguro(0.06).faixa, 'baixo')
  assert.equal(seguro(0.01).faixa, 'baixo')
  assert.equal(seguro(0.01).localSeguroAplicado, false)
})
