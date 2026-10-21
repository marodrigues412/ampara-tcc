import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Modal, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { FadeIn } from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { TemaDaAba } from '../constants/brandTheme'
import { dicaJaVista, marcarDicaVista } from '../services/tutorial'
import { alvosDoTour } from '../utils/alvosDoTour'

const TEMA = TemaDaAba['Proteção']
const ID = 'tour-protecao'
const FOLGA = 8
// Reserva, se a barra de abas não puder ser medida: 10 de respiro + 48 da aba.
const ALTURA_BARRA = 58

const PASSOS = [
  { alvo: 'anel', titulo: 'Seu risco agora', texto: 'A Lia fica dentro do anel. A cor e o nível mostram como está o seu caminho, pela região e pelo horário.' },
  { alvo: 'sos', titulo: 'Botão SOS', texto: 'Segure por 3 segundos e sua rede de apoio recebe sua localização pelo WhatsApp. Soltar antes cancela.' },
  { alvo: 'barra', titulo: 'Tudo a um toque', texto: 'Na barra de baixo ficam o Mapa, o seu Relatório, a conversa com a Lia e o seu Perfil.' },
]

// Retângulo de fora com um furo de cantos arredondados no meio (regra evenodd).
const caminhoComFuro = (w, h, { x, y, largura, altura, raio }) => {
  const r = Math.min(raio, largura / 2, altura / 2)
  return [
    `M0 0 H${w} V${h} H0 Z`,
    `M${x + r} ${y} H${x + largura - r} A${r} ${r} 0 0 1 ${x + largura} ${y + r}`,
    `V${y + altura - r} A${r} ${r} 0 0 1 ${x + largura - r} ${y + altura}`,
    `H${x + r} A${r} ${r} 0 0 1 ${x} ${y + altura - r}`,
    `V${y + r} A${r} ${r} 0 0 1 ${x + r} ${y} Z`,
  ].join(' ')
}

const medirView = (view) => new Promise((resolver) => {
  if (!view?.measureInWindow) { resolver(null); return }
  view.measureInWindow((x, y, largura, altura) => resolver(largura ? { x, y, largura, altura } : null))
})
const medir = (ref) => medirView(ref?.current)

// Tour de 3 passos na primeira visita à Proteção: a tela escurece e destaca o anel de
// risco, o botão SOS e a barra de abas, um por vez. Aparece uma vez (volta com "Rever as
// dicas da Lia" no Perfil). Num Modal, para cobrir também a barra de abas e para o leitor
// de tela ficar só no tour enquanto ele estiver aberto.
export default function TourDaProtecao({ refAnel, refSos, pronto, onTreinarSos }) {
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const [aberto, setAberto] = useState(false)
  const [passo, setPasso] = useState(0)
  const [alvos, setAlvos] = useState({})
  // Onde o Modal começa na janela e o tamanho dele. Em alguns celulares (barra de status,
  // telas maiores) o Modal não começa no mesmo ponto da janela, e sem descontar isso o
  // destaque saía torto.
  const [origem, setOrigem] = useState(null)
  const raizRef = useRef(null)

  const medirAlvos = useCallback(async () => {
    const [anel, sos, barra] = await Promise.all([medir(refAnel), medir(refSos), medirView(alvosDoTour.barra)])
    if (!anel || !sos) return null
    return {
      // O anel é um círculo: o furo é um círculo no centro do que foi medido, mesmo que o
      // botão em volta dele não seja quadrado.
      anel: { ...anel, circulo: true },
      sos: { ...sos, raio: sos.altura / 2 },
      barra: barra
        ? { ...barra, raio: 0 }
        : { x: 0, y: height - ALTURA_BARRA - Math.max(insets.bottom, 10), largura: width, altura: ALTURA_BARRA + Math.max(insets.bottom, 10), raio: 0 },
    }
  }, [refAnel, refSos, width, height, insets.bottom])

  useFocusEffect(useCallback(() => {
    if (!pronto) return undefined
    let ativo = true
    // Um respiro para a tela terminar de montar e o anel começar a encher.
    const espera = setTimeout(async () => {
      if (await dicaJaVista(ID)) return
      const medidos = await medirAlvos()
      if (!ativo || !medidos) return
      setAlvos(medidos)
      setOrigem(null)
      setPasso(0)
      setAberto(true)
    }, 1200)
    return () => { ativo = false; clearTimeout(espera) }
  }, [pronto, medirAlvos]))

  // A cada passo, mede de novo: a tela pode ter mudado (texto do nível, rolagem).
  useEffect(() => {
    if (!aberto) return
    let ativo = true
    medirAlvos().then((medidos) => { if (ativo && medidos) setAlvos(medidos) })
    return () => { ativo = false }
  }, [aberto, passo, medirAlvos])

  const aoMontarRaiz = () => {
    medirView(raizRef.current).then((m) => { if (m) setOrigem(m) })
  }

  useEffect(() => {
    if (aberto) AccessibilityInfo.announceForAccessibility(`${PASSOS[passo].titulo}. ${PASSOS[passo].texto}`)
  }, [aberto, passo])

  if (!aberto) return null

  const atual = PASSOS[passo]
  const bruto = alvos[atual.alvo]
  // Tamanho e início do Modal (enquanto não foram medidos, usa a janela inteira).
  const larguraTela = origem?.largura ?? width
  const alturaTela = origem?.altura ?? height
  const alvo = { ...bruto, x: bruto.x - (origem?.x ?? 0), y: bruto.y - (origem?.y ?? 0) }
  let furo
  if (alvo.circulo) {
    const r = Math.min(alvo.largura, alvo.altura) / 2 + FOLGA
    const cx = alvo.x + alvo.largura / 2, cy = alvo.y + alvo.altura / 2
    furo = { x: cx - r, y: cy - r, largura: r * 2, altura: r * 2, raio: r }
  } else {
    furo = { x: alvo.x - FOLGA, y: alvo.y - FOLGA, largura: alvo.largura + FOLGA * 2, altura: alvo.altura + FOLGA * 2, raio: alvo.raio + FOLGA }
  }
  const ultimo = passo === PASSOS.length - 1
  // O balão vai do lado com mais espaço: abaixo do alvo se ele estiver na metade de cima.
  const embaixo = furo.y + furo.altura / 2 < alturaTela / 2
  const posicaoBalao = embaixo
    ? { top: furo.y + furo.altura + 14 }
    : { bottom: alturaTela - furo.y + 14 }

  const encerrar = () => {
    setAberto(false)
    marcarDicaVista(ID)
  }

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={encerrar}>
      <View ref={raizRef} onLayout={aoMontarRaiz} collapsable={false} style={StyleSheet.absoluteFill} accessibilityViewIsModal>
        <Svg width={larguraTela} height={alturaTela} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Path d={caminhoComFuro(larguraTela, alturaTela, furo)} fill="rgba(38,25,31,0.72)" fillRule="evenodd" />
        </Svg>
        <View pointerEvents="none" style={[styles.contorno, { left: furo.x, top: furo.y, width: furo.largura, height: furo.altura, borderRadius: furo.raio }]} />

        <Animated.View key={passo} entering={FadeIn.duration(220)} style={[styles.balao, posicaoBalao]}>
          <Text style={styles.contagem}>Passo {passo + 1} de {PASSOS.length}</Text>
          <Text style={styles.titulo}>{atual.titulo}</Text>
          <Text style={styles.texto}>{atual.texto}</Text>
          <View style={styles.acoes}>
            <View style={styles.pontos}>
              {PASSOS.map((p, i) => <View key={p.alvo} style={[styles.ponto, i === passo && styles.pontoAtivo]} />)}
            </View>
            {!ultimo && (
              <TouchableOpacity onPress={encerrar} hitSlop={10} accessibilityRole="button">
                <Text style={styles.pular}>Pular</Text>
              </TouchableOpacity>
            )}
            {ultimo && onTreinarSos && (
              <TouchableOpacity onPress={() => { encerrar(); onTreinarSos() }} hitSlop={10} accessibilityRole="button">
                <Text style={styles.pular}>Treinar o SOS</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.botao} onPress={ultimo ? encerrar : () => setPasso(passo + 1)} accessibilityRole="button">
              <Text style={styles.botaoTexto}>{ultimo ? 'Entendi' : 'Próximo'}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  contorno: { position: 'absolute', borderWidth: 3, borderColor: '#FFFFFF' },
  balao: { position: 'absolute', left: 20, right: 20, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 18, gap: 4 },
  contagem: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: '#8A8590' },
  titulo: { fontSize: 18, fontWeight: '800', color: TEMA.forte },
  texto: { fontSize: 15, lineHeight: 22, color: '#3A3138' },
  acoes: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 10 },
  pontos: { flex: 1, flexDirection: 'row', gap: 6 },
  ponto: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#E2D8DC' },
  pontoAtivo: { width: 20, backgroundColor: TEMA.forte },
  pular: { fontSize: 14, fontWeight: '700', color: '#776C73' },
  botao: { backgroundColor: TEMA.forte, borderRadius: 22, paddingVertical: 10, paddingHorizontal: 18 },
  botaoTexto: { color: '#FFF', fontWeight: '800', fontSize: 14 },
})
