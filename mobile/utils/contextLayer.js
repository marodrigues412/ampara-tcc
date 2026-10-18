// Camada 1 do score (contexto): onde e quando a usuária está, segundo o mapa
// município × bairro × período (data/context_risk_map.sql), com a reserva município ×
// período (context_risk_map_cidade) para bairro sem célula.
//
// Tudo aqui é puro, para os testes rodarem sem Supabase nem GPS. A busca fica em
// services/contextRiskMapService.js.
//
// Regras combinadas com as autoras:
// - bairro sem célula usa a estimativa da cidade; sem ela também = "indisponível",
//   nunca "baixo";
// - o horário não soma de novo por fora: o mapa já separa por período;
// - dentro de um local seguro cadastrado (80 m), o contexto é baixo — extensão nossa,
//   não está na orientação (decisão das autoras, 18/10/2026).

export const PERIODOS = ['madrugada', 'manha', 'tarde', 'noite']
const FAIXAS = ['baixo', 'medio', 'alto']

// Nome do geocodificador → nome da SSP. A SSP abrevia "São"/"Santo" nos municípios.
const MUNICIPIOS_SSP = {
  'SAO PAULO': 'S.PAULO',
  'SAO CAETANO DO SUL': 'S.CAETANO DO SUL',
  'SAO BERNARDO DO CAMPO': 'S.BERNARDO DO CAMPO',
  'SANTO ANDRE': 'S.ANDRE',
  DIADEMA: 'DIADEMA',
  MAUA: 'MAUA',
  OSASCO: 'OSASCO',
  GUARULHOS: 'GUARULHOS',
  BARUERI: 'BARUERI',
}

// Abreviações comuns em nome de bairro. O mapa quase sempre traz a forma por extenso.
const ABREVIACOES = {
  JD: 'JARDIM', JDM: 'JARDIM', VL: 'VILA', PQ: 'PARQUE', PRQ: 'PARQUE',
  STA: 'SANTA', STO: 'SANTO', CJ: 'CONJUNTO', CONJ: 'CONJUNTO', CID: 'CIDADE',
  RES: 'RESIDENCIAL', CHAC: 'CHACARA',
}

// Igual ao normalize_text do build_context_risk_map.py, em maiúsculas.
export function normalizarNome(valor) {
  if (valor === null || valor === undefined) return ''
  return String(valor)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
}

function expandirAbreviacoes(nome) {
  return nome
    .split(' ')
    .map((parte) => ABREVIACOES[parte.replace(/\.$/, '')] ?? parte)
    .join(' ')
}

function semComplemento(nome) {
  return nome.replace(/\s*\([^)]*\)\s*$/, '').trim()
}

export function municipioDaSsp(cidade) {
  return MUNICIPIOS_SSP[normalizarNome(cidade)] ?? null
}

// madrugada 0–5, manhã 6–11, tarde 12–17, noite 18–23 (hora local do aparelho).
export function periodoDoHorario(data) {
  const hora = data.getHours()
  return PERIODOS[Math.floor(hora / 6)]
}

// Mesma regra do finalize_context_map: < p33 baixo, ≤ p66 médio, senão alto.
export function faixaPorPercentis(escore, p33, p66) {
  // Number(null) e Number('') dão 0, que viraria "baixo": vazio tem que ser vazio.
  if ([escore, p33, p66].some((v) => v === null || v === undefined || v === '')) return null
  const valor = Number(escore)
  const corte33 = Number(p33)
  const corte66 = Number(p66)
  if (![valor, corte33, corte66].every(Number.isFinite)) return null
  if (valor < corte33) return 'baixo'
  if (valor <= corte66) return 'medio'
  return 'alto'
}

export function baixarUmaFaixa(faixa) {
  const indice = FAIXAS.indexOf(faixa)
  return indice <= 0 ? faixa : FAIXAS[indice - 1]
}

// Bairro dentro do formattedAddress do Android, no formato brasileiro do Google:
// "R. Augusta, 100 - Bela Vista, São Paulo - SP, 01304-000, Brasil". Só aceita se a
// cidade logo depois for a mesma do município, para não pegar um pedaço da rua.
export function bairroDoEnderecoFormatado(texto, municipio) {
  if (!texto || !municipio) return null
  const encontrado = String(texto).match(/ - ([^,]+), ([^,]+?) - [A-Z]{2}\b/)
  if (!encontrado || municipioDaSsp(encontrado[2]) !== municipio) return null
  return normalizarNome(encontrado[1]) || null
}

// Endereço(s) do expo-location → chave do mapa. Nas duas plataformas o expo-location
// põe o bairro em district (subLocality: CLPlacemark no iOS, Address no Android) e a
// cidade em city (locality), com subregion (subAdministrativeArea) de reserva — no
// Android a cidade às vezes vem só ali. O geocodificador pode devolver mais de um
// resultado e o primeiro vir sem bairro, por isso olha todos. Só o Android tem
// formattedAddress, usado em último caso.
export function localDoEndereco(enderecos) {
  const lista = (Array.isArray(enderecos) ? enderecos : [enderecos]).filter(Boolean)
  const municipio = lista
    .map((e) => municipioDaSsp(e.city) ?? municipioDaSsp(e.subregion))
    .find(Boolean) ?? null
  const bairro = lista.map((e) => normalizarNome(e.district)).find(Boolean)
    ?? lista.map((e) => bairroDoEnderecoFormatado(e.formattedAddress, municipio)).find(Boolean)
    ?? null
  return { municipio, bairro }
}

// Acha o bairro entre as células de um município/período. Tenta, em ordem:
// nome exato; nome com abreviações expandidas; nome sem o complemento entre parênteses
// que a SSP usa para homônimos, ex. "JARDIM BRASIL (ZONA NORTE)". Neste último, só
// aceita se houver um candidato: com dois, não dá para saber qual é.
export function encontrarCelula(celulas, bairro) {
  const nome = normalizarNome(bairro)
  if (!nome || !Array.isArray(celulas) || celulas.length === 0) return null
  const expandido = expandirAbreviacoes(nome)
  const comparaveis = celulas.map((celula) => ({
    celula,
    nome: expandirAbreviacoes(normalizarNome(celula.bairro)),
  }))

  const exata = comparaveis.find((c) => c.nome === nome || c.nome === expandido)
  if (exata) return exata.celula

  const parecidas = comparaveis.filter((c) => semComplemento(c.nome) === semComplemento(expandido))
  return parecidas.length === 1 ? parecidas[0].celula : null
}

// Resultado da Camada 1. `faixa` é null sempre que `disponivel` é false: quem chama
// mostra "sem dados da região" em vez de um nível. `origem` diz de onde veio a faixa:
// 'bairro' (célula do bairro) ou 'cidade' (estimativa da cidade, quando o bairro não
// foi identificado ou não tem célula publicada nesse período).
export function avaliarContexto({ municipio, bairro, celula, celulaDaCidade = null, emLocalSeguro = false }) {
  const indisponivel = (motivo) => ({
    disponivel: false, motivo, origem: null, faixa: null, faixaDoMapa: null, escore: null,
    celula: null, localSeguroAplicado: false,
  })
  if (!municipio) return indisponivel('fora_da_cobertura')

  const motivoDoBairro = !bairro ? 'bairro_nao_identificado' : !celula ? 'sem_celula' : null
  const escolhida = motivoDoBairro ? celulaDaCidade : celula
  if (!escolhida) return indisponivel(motivoDoBairro)

  const faixaDoMapa = faixaPorPercentis(escolhida.escore_contexto, escolhida.percentil_33, escolhida.percentil_66)
    ?? (FAIXAS.includes(escolhida.nivel_contexto) ? escolhida.nivel_contexto : null)
  if (!faixaDoMapa) return indisponivel(motivoDoBairro ?? 'sem_celula')

  return {
    disponivel: true,
    // Com a estimativa da cidade, guarda por que o bairro não serviu.
    motivo: motivoDoBairro,
    origem: motivoDoBairro ? 'cidade' : 'bairro',
    faixaDoMapa,
    faixa: emLocalSeguro ? 'baixo' : faixaDoMapa,
    escore: Number(escolhida.escore_contexto),
    celula: escolhida,
    localSeguroAplicado: Boolean(emLocalSeguro) && faixaDoMapa !== 'baixo',
  }
}
