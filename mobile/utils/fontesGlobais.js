import { StyleSheet } from 'react-native'

// Fonte padrão do app: Nunito em todos os textos (o Fraunces itálico fica só no nome da
// Lia, que já declara fontFamily própria).
//
// Fonte carregada no React Native é um arquivo por peso: fontWeight sozinho não troca
// o arquivo, e no Android ainda pode cair na fonte do sistema. Em vez de editar cada
// tela, todo estilo criado com StyleSheet.create passa por aqui. Precisa ser o primeiro
// import do App.js, antes das telas criarem seus estilos.
//
// Legibilidade (testes no celular, out/2026): a Nunito no peso normal tem traço fino, os
// cinzas dos textos secundários ficavam abaixo do contraste mínimo sobre o creme e havia
// muito texto de 11 e 12 px. Por isso, aqui:
// - cada texto usa um peso acima do pedido no estilo (normal vira SemiBold, e assim por diante);
// - os cinzas de texto ficam mais escuros (contraste de pelo menos 4,5:1 sobre o creme);
// - textos de até 16 px ganham 1 px, e nada fica abaixo de 12,5 px.

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
      return NUNITO.bold
    case '700':
    case 'bold':
    case '800':
    case '900':
      return NUNITO.extrabold
    default:
      return NUNITO.semibold
  }
}

// Cinzas de texto antigos → versões com contraste suficiente sobre o creme (#F8F4F1).
const CINZAS_MAIS_ESCUROS = {
  '#8A8590': '#6B6570', // ~3,4:1 → ~5,3:1
  '#776C73': '#5E5459', // ~4,6:1 → ~7:1
  '#756670': '#5E5259', // Brand.muted
  '#999': '#6B6570',
  '#999999': '#6B6570',
  '#AAA': '#6B6570',
  '#888': '#5E5459',
  '#666': '#4F474D',
}

// "Tamanho do texto" do Perfil. Lido antes de as telas criarem os estilos (ver Raiz.js).
// Para trocar sem fechar o app, os estilos de texto ficam guardados em `registro` com o
// tamanho de base, e aplicarTamanhoDoTexto atualiza cada um; a Raiz então remonta as
// telas, que passam a desenhar com os valores novos.
export const CHAVE_TAMANHO_DO_TEXTO = 'ampara:tamanhoDoTexto'
export const TAMANHOS_DO_TEXTO = [
  { id: 'padrao', rotulo: 'Padrão', escala: 1 },
  { id: 'grande', rotulo: 'Grande', escala: 1.15 },
  { id: 'maior', rotulo: 'Maior', escala: 1.3 },
]
let escala = 1
let tamanhoEmUso = 'padrao'
export function definirTamanhoDoTexto(id) {
  const escolhido = TAMANHOS_DO_TEXTO.find((t) => t.id === id) ?? TAMANHOS_DO_TEXTO[0]
  escala = escolhido.escala
  tamanhoEmUso = escolhido.id
}
// O tamanho que os estilos estão usando agora.
export const tamanhoDoTextoEmUso = () => tamanhoEmUso

const registro = []
const escalar = (valor) => Math.round(valor * escala * 2) / 2

// Troca o tamanho de todos os estilos de texto já criados. O React Native congela um
// estilo depois de desenhá-lo, então cada um vira um objeto novo, posto no lugar do
// antigo dentro do mapa de estilos da tela (o objeto que StyleSheet.create devolveu, que
// não é congelado). Depois disso as telas precisam ser desenhadas de novo (a Raiz faz isso).
export function aplicarTamanhoDoTexto(id) {
  definirTamanhoDoTexto(id)
  for (const item of registro) {
    const fontSize = escalar(item.fonte)
    const novo = { ...item.mapa[item.nome], fontSize }
    if (item.linha != null) novo.lineHeight = Math.round(item.linha * (fontSize / item.fonte))
    item.mapa[item.nome] = novo
  }
}

// Tamanho de base (antes do "Tamanho do texto"): nada abaixo de 12,5 e +1 até 16.
function tamanhoLegivel(tamanho) {
  return tamanho < 12 ? 12.5 : tamanho <= 16 ? tamanho + 1 : tamanho
}

function comNunito(estilo) {
  if (!estilo || typeof estilo !== 'object') return estilo
  let novo = estilo
  if (typeof estilo.color === 'string') {
    const escuro = CINZAS_MAIS_ESCUROS[estilo.color.toUpperCase()] ?? CINZAS_MAIS_ESCUROS[estilo.color]
    if (escuro) novo = { ...novo, color: escuro }
  }
  if (novo.fontSize == null && novo.fontWeight == null) return novo
  const { fontWeight, ...resto } = novo
  const ajustado = { ...resto }
  if (typeof novo.fontSize === 'number') {
    const fonte = tamanhoLegivel(novo.fontSize)
    // A altura da linha acompanha o aumento, para o texto não ficar cortado.
    const linha = typeof novo.lineHeight === 'number' ? Math.round(novo.lineHeight * (fonte / novo.fontSize)) : null
    ajustado.fontSize = escalar(fonte)
    if (linha != null) ajustado.lineHeight = Math.round(linha * (ajustado.fontSize / fonte))
    // Guardado para o registro (ver StyleSheet.create abaixo), sem aparecer no estilo.
    Object.defineProperty(ajustado, '__base', { value: { fonte, linha }, enumerable: false })
  }
  // Quem já tem fonte própria (o nome da Lia em Fraunces) mantém a dela.
  if (!novo.fontFamily) ajustado.fontFamily = nunitoDoPeso(fontWeight)
  else if (fontWeight != null) ajustado.fontWeight = fontWeight
  return ajustado
}

let aplicado = false
if (!aplicado) {
  aplicado = true
  const criarOriginal = StyleSheet.create
  StyleSheet.create = (estilos) => {
    const ajustados = {}
    for (const nome of Object.keys(estilos)) {
      ajustados[nome] = comNunito(estilos[nome])
      const base = ajustados[nome]?.__base
      if (base) registro.push({ mapa: ajustados, nome, ...base })
    }
    // O original congela cada estilo (em desenvolvimento) e devolve o mesmo mapa. Tudo bem:
    // a troca de tamanho cria objetos novos no mapa, em vez de mudar os congelados.
    return criarOriginal(ajustados)
  }
}
