import { StyleSheet } from 'react-native'

// Fonte padrão do app: Nunito em todos os textos (o Fraunces itálico fica só no nome da
// Lia, que já declara fontFamily própria).
//
// Fonte carregada no React Native é um arquivo por peso: fontWeight sozinho não troca
// o arquivo, e no Android ainda pode cair na fonte do sistema. Em vez de editar cada
// tela, todo estilo criado com StyleSheet.create que tenha fontSize ou fontWeight ganha
// aqui o arquivo da Nunito do peso pedido. Precisa ser o primeiro import do App.js,
// antes das telas criarem seus estilos.

export const NUNITO = {
  regular: 'Nunito_400Regular',
  semibold: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  extrabold: 'Nunito_800ExtraBold',
}

export function nunitoDoPeso(peso) {
  switch (String(peso ?? '400')) {
    case '500':
    case '600':
      return NUNITO.semibold
    case '700':
    case 'bold':
      return NUNITO.bold
    case '800':
    case '900':
      return NUNITO.extrabold
    default:
      return NUNITO.regular
  }
}

function comNunito(estilo) {
  if (!estilo || typeof estilo !== 'object' || estilo.fontFamily) return estilo
  if (estilo.fontSize == null && estilo.fontWeight == null) return estilo
  const { fontWeight, ...resto } = estilo
  return { ...resto, fontFamily: nunitoDoPeso(fontWeight) }
}

let aplicado = false
if (!aplicado) {
  aplicado = true
  const criarOriginal = StyleSheet.create
  StyleSheet.create = (estilos) => {
    const ajustados = {}
    for (const nome of Object.keys(estilos)) ajustados[nome] = comNunito(estilos[nome])
    return criarOriginal(ajustados)
  }
}
