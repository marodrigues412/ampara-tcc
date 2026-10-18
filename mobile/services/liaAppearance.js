import AsyncStorage from '@react-native-async-storage/async-storage'

export const CHAVE_APARENCIA_LIA = 'ampara:liaAparencia'

export const APARENCIA_PADRAO_LIA = {
  skin: '#C98B6B',
  hairStyle: 'cacheado',
  hair: '#1E1716',
  eyes: 'redondo',
}

const listeners = new Set()
let aparenciaEmCache = APARENCIA_PADRAO_LIA
let carregamentoEmAndamento

export async function carregarAparenciaLia() {
  if (carregamentoEmAndamento) return carregamentoEmAndamento
  carregamentoEmAndamento = (async () => {
  try {
    const salvo = await AsyncStorage.getItem(CHAVE_APARENCIA_LIA)
    aparenciaEmCache = salvo ? { ...APARENCIA_PADRAO_LIA, ...JSON.parse(salvo) } : APARENCIA_PADRAO_LIA
  } catch {
    aparenciaEmCache = APARENCIA_PADRAO_LIA
  }
  return aparenciaEmCache
  })()
  return carregamentoEmAndamento
}

export async function salvarAparenciaLia(aparencia) {
  const novaAparencia = { ...APARENCIA_PADRAO_LIA, ...aparencia }
  await AsyncStorage.setItem(CHAVE_APARENCIA_LIA, JSON.stringify(novaAparencia))
  aparenciaEmCache = novaAparencia
  listeners.forEach((listener) => listener(novaAparencia))
  return novaAparencia
}

export function observarAparenciaLia(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const TONS_DE_PELE_LIA = ['#F6D9C6', '#EEC5A6', '#E3B285', '#D49B72', '#C98B6B', '#A66A49', '#7B4A32', '#523022']
export const CORES_DE_CABELO_LIA = [
  { cor: '#1E1716', nome: 'Preto' },
  { cor: '#3B2620', nome: 'Castanho escuro' },
  { cor: '#6B4430', nome: 'Castanho' },
  { cor: '#B98B55', nome: 'Loiro' },
  { cor: '#8A3D22', nome: 'Ruivo' },
  { cor: '#A39E98', nome: 'Grisalho' },
]

export const PENTEADOS_LIA = [
  { id: 'cacheado', nome: 'Cacheado' },
  { id: 'liso', nome: 'Liso longo' },
  { id: 'chanel', nome: 'Chanel' },
  { id: 'crespo', nome: 'Crespo' },
  { id: 'trancas', nome: 'Tranças' },
  { id: 'coque', nome: 'Coque' },
]
