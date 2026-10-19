import AsyncStorage from '@react-native-async-storage/async-storage'

// O que o tutorial guarda no celular: quais dicas da Lia ela já viu, se já treinou o SOS
// e se fechou a lista de primeiros passos. Tudo local; nada vai para o servidor.

const CHAVE_DICA = (id) => `ampara:dica:${id}`
const CHAVE_TREINO = 'ampara:treinoSosFeito'
const CHAVE_PASSOS_FECHADOS = 'ampara:primeirosPassosFechados'
// tour-protecao é o tour de 3 passos da Proteção (TourDaProtecao).
export const DICAS = ['mapa', 'relatorio', 'lia', 'perfil', 'tour-protecao']

const ler = async (chave) => {
  try { return (await AsyncStorage.getItem(chave)) === 'sim' } catch { return false }
}
const marcar = (chave) => AsyncStorage.setItem(chave, 'sim').catch(() => {})

export const dicaJaVista = (id) => ler(CHAVE_DICA(id))
export const marcarDicaVista = (id) => marcar(CHAVE_DICA(id))
export const treinoDoSosFeito = () => ler(CHAVE_TREINO)
export const marcarTreinoDoSos = () => marcar(CHAVE_TREINO)
export const primeirosPassosFechados = () => ler(CHAVE_PASSOS_FECHADOS)
export const fecharPrimeirosPassos = () => marcar(CHAVE_PASSOS_FECHADOS)

// "Rever as dicas" no Perfil: as dicas e a lista de primeiros passos voltam a aparecer.
export async function reverTutorial() {
  try {
    await AsyncStorage.multiRemove([...DICAS.map(CHAVE_DICA), CHAVE_PASSOS_FECHADOS])
  } catch {}
}
