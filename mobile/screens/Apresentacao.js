import React, { useRef, useState } from 'react'
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from 'react-native-svg'
import AnelDaLia from '../components/AnelDaLia'
import { CremeDoSite, TemaDaAba } from '../constants/brandTheme'

// Apresentação curta, para quem tocou em "Criar minha conta": um slide para cada coisa
// que o app faz, na cor da aba onde ela mora. Quem já tem conta não passa por aqui.
const SLIDES = [
  {
    id: 'risco',
    aba: 'Proteção',
    titulo: 'A Lia acompanha seu risco',
    texto: 'Ela olha a região, o horário e seus locais seguros, e mostra de 0 a 10 como está o seu caminho agora.',
  },
  {
    id: 'sos',
    aba: 'Perfil',
    titulo: 'Sua rede a um toque',
    texto: 'Segure o SOS por 3 segundos e as pessoas que você escolheu recebem sua localização pelo WhatsApp.',
  },
  {
    id: 'mapa',
    aba: 'Mapa',
    titulo: 'Apoio por perto',
    texto: 'Veja no mapa onde há mais ocorrências e encontre delegacias, farmácias e hospitais perto de você.',
  },
]

function Curvas({ cor }) {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 300 300" preserveAspectRatio="none" pointerEvents="none">
      <G fill="none" stroke={cor} strokeWidth={1.4}>
        <Path d="M-10 200 C60 170 120 240 190 200 S280 160 310 180" />
        <Path d="M-10 228 C70 198 130 268 200 228 S290 188 310 208" />
        <Path d="M-10 60 C50 85 110 35 170 60 S260 85 310 50" />
      </G>
    </Svg>
  )
}

// Ilustração de cada slide, feita com os próprios elementos do app.
function Ilustracao({ id, tema }) {
  if (id === 'risco') {
    return <AnelDaLia tamanho={170} score={3} cor="#287861" reacao="oi" />
  }
  if (id === 'sos') {
    return (
      <View style={styles.sos}>
        <View style={styles.rede}>
          {[['M', '#BD5574', '#F7E7EC'], ['J', '#6E5A9E', '#EFEAF5'], ['B', '#3F6A86', '#E9EFF2']].map(([l, cor, fundo]) => (
            <View key={l} style={[styles.pessoa, { backgroundColor: fundo }]}>
              <Text style={[styles.pessoaTexto, { color: cor }]}>{l}</Text>
            </View>
          ))}
        </View>
        <Ionicons name="arrow-up" size={22} color={tema.forte} />
        <View style={styles.botaoSos}>
          <Ionicons name="alert-circle" size={22} color="#FFF" />
          <Text style={styles.botaoSosTexto}>SOS</Text>
        </View>
        <Text style={styles.segure}>segure 3 s</Text>
      </View>
    )
  }
  return (
    <Svg width={200} height={190} viewBox="0 0 200 190">
      <Defs>
        <RadialGradient id="calor" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#E06A3B" stopOpacity="0.75" />
          <Stop offset="0.6" stopColor="#F2B35A" stopOpacity="0.45" />
          <Stop offset="1" stopColor="#F6E7A8" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <G stroke="#FFFFFF" strokeWidth={7}>
        <Path d="M-5 60 L205 85" />
        <Path d="M-5 140 L205 120" />
        <Path d="M60 -5 L80 195" />
        <Path d="M150 -5 L135 195" />
      </G>
      <Circle cx="120" cy="70" r="55" fill="url(#calor)" />
      <Circle cx="55" cy="140" r="38" fill="url(#calor)" />
      <Circle cx="100" cy="105" r="9" fill="#3F6A86" stroke="#FFF" strokeWidth={3} />
      <Circle cx="160" cy="150" r="11" fill={tema.forte} stroke="#FFF" strokeWidth={3} />
      <Circle cx="40" cy="45" r="11" fill={tema.forte} stroke="#FFF" strokeWidth={3} />
    </Svg>
  )
}

export default function Apresentacao({ onFim }) {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const listaRef = useRef(null)
  const [atual, setAtual] = useState(0)
  const tema = TemaDaAba[SLIDES[atual].aba]
  const ultimo = atual === SLIDES.length - 1

  const avancar = () => {
    if (ultimo) { onFim(); return }
    listaRef.current?.scrollToIndex({ index: atual + 1, animated: true })
    setAtual(atual + 1)
  }

  return (
    <View style={[styles.tela, { paddingTop: insets.top + 10, paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
      <View style={styles.topo}>
        <View style={styles.marca}>
          <Image source={require('../assets/images/maos-ampara-azul.png')} style={styles.logo} resizeMode="contain" accessibilityIgnoresInvertColors />
          <Text style={styles.marcaTexto}>Ampara</Text>
        </View>
        {!ultimo && (
          <TouchableOpacity onPress={onFim} hitSlop={10} accessibilityRole="button">
            <Text style={styles.pular}>Pular</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        ref={listaRef}
        data={SLIDES}
        keyExtractor={(s) => s.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setAtual(Math.round(e.nativeEvent.contentOffset.x / width))}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        renderItem={({ item }) => {
          const t = TemaDaAba[item.aba]
          return (
            <View style={[styles.slide, { width }]}>
              <View style={[styles.painel, { backgroundColor: t.fundo }]}>
                <Curvas cor={t.curva} />
                <Ilustracao id={item.id} tema={t} />
              </View>
              <Text style={[styles.titulo, { color: t.forte }]}>{item.titulo}</Text>
              <Text style={styles.texto}>{item.texto}</Text>
            </View>
          )
        }}
      />

      <View style={styles.rodape}>
        <View style={styles.pontos} accessibilityLabel={`Passo ${atual + 1} de ${SLIDES.length}`}>
          {SLIDES.map((s, i) => (
            <View key={s.id} style={[styles.ponto, i === atual && [styles.pontoAtivo, { backgroundColor: tema.forte }]]} />
          ))}
        </View>
        <TouchableOpacity style={[styles.botao, { backgroundColor: tema.forte }]} onPress={avancar} accessibilityRole="button">
          <Text style={styles.botaoTexto}>{ultimo ? 'Criar minha conta' : 'Avançar'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: CremeDoSite },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 },
  marca: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logo: { width: 30, height: 30 },
  marcaTexto: { fontSize: 18, fontWeight: '800', color: '#273963' },
  pular: { fontSize: 15, fontWeight: '700', color: '#776C73' },
  slide: { paddingHorizontal: 24, paddingTop: 18, alignItems: 'center' },
  painel: { width: '100%', aspectRatio: 1, maxHeight: 340, borderRadius: 44, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  titulo: { fontSize: 26, fontWeight: '800', textAlign: 'center', marginTop: 26 },
  texto: { fontSize: 16, lineHeight: 24, color: '#5E5259', textAlign: 'center', marginTop: 10, maxWidth: 320 },
  rodape: { paddingHorizontal: 24, gap: 14 },
  pontos: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  ponto: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E2D8DC' },
  pontoAtivo: { width: 26 },
  botao: { borderRadius: 28, paddingVertical: 16, alignItems: 'center' },
  botaoTexto: { color: '#FFF', fontWeight: '700', fontSize: 16 },

  sos: { alignItems: 'center', gap: 10 },
  rede: { flexDirection: 'row', gap: 12 },
  pessoa: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFFFFF' },
  pessoaTexto: { fontSize: 18, fontWeight: '800' },
  botaoSos: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#B83D53', borderRadius: 30, paddingVertical: 14, paddingHorizontal: 26 },
  botaoSosTexto: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  segure: { fontSize: 12, color: '#776C73' },
})
