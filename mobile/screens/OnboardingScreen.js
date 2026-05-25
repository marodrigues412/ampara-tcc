import React, { useState, useRef } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  Image, Dimensions, FlatList
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const { width, height } = Dimensions.get('window')

const slides = [
  { id: '1', welcome: true },
  {
    id: '2',
    fullBg: true,
    title: 'Você não\nestá sozinha',
    desc: 'Mulheres frequentemente modificam hábitos, trajetos e horários por receio de sofrer algum tipo de violência, especialmente durante deslocamentos urbanos.',
  },
  {
    id: '3',
    title: 'Monitoramento em\ntempo real',
    desc: 'O Ampara analisa sua localização e detecta situações de risco com base em dados de segurança pública, te protegendo a cada passo.',
    image: require('../assets/images/sensores_info.png'),
  },
  {
    id: '4',
    title: 'SOS com\num único toque',
    desc: 'Cadastre seus contatos de emergência e dispare um alerta SOS segurando o botão — sua localização é enviada automaticamente por SMS.',
    image: require('../assets/images/sos_info.png'),
  },
  {
    id: '5',
    title: 'Mapeie seus\nlocais seguros',
    desc: 'Salve pontos de confiança, consulte o índice de segurança da sua região e tome decisões mais seguras no dia a dia.',
    image: require('../assets/images/contatos_info.png'),
  },
]

export default function OnboardingScreen({ onDone }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const flatListRef = useRef(null)

  const goNext = () => {
    if (currentIndex < slides.length - 1) {
      const next = currentIndex + 1
      flatListRef.current?.scrollToIndex({ index: next, animated: true })
      setCurrentIndex(next)
    } else {
      onDone()
    }
  }

  const renderSlide = ({ item }) => {
    if (item.welcome) {
      return (
        <View style={styles.slide}>
          <Image
            source={require('../assets/images/maos-azul-recortadas.png')}
            style={styles.bigLogo}
            resizeMode="cover"
          />
          <View style={styles.welcomeBottom}>
            <Text style={styles.welcomeLabel}>bem vinda ao</Text>
            <Text style={styles.welcomeBrand}>Ampara</Text>
          </View>
        </View>
      )
    }

    if (item.fullBg) {
      return (
        <View style={styles.slide}>
          <View style={styles.fullBgWhite}>
            <Image
              source={require('../assets/images/maos-azul-recortadas.png')}
              style={styles.bigLogo}
              resizeMode="cover"
              tintColor="#EFEFEF"
            />
            <View style={styles.fullBgOverlay}>
              {/* Header fixo no topo */}
              <View style={styles.slideHeader}>
                <Image
                  source={require('../assets/images/maos-ampara-azul.png')}
                  style={styles.headerLogo}
                  resizeMode="contain"
                />
                <Text style={styles.headerBrand}>Ampara</Text>
              </View>
              {/* Texto centralizado no espaço restante */}
              <View style={styles.fullBgTextArea}>
                <Text style={styles.fullBgTitle}>{item.title}</Text>
                <Text style={styles.fullBgDesc}>{item.desc}</Text>
              </View>
            </View>
          </View>
        </View>
      )
    }

    return (
      <View style={styles.slide}>
        {/* Cabeçalho com logo pequeno */}
        <View style={styles.slideHeader}>
          <Image
            source={require('../assets/images/maos-ampara-azul.png')}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <Text style={styles.headerBrand}>Ampara</Text>
        </View>

        {/* Título grande no topo */}
        <Text style={styles.slideTitle}>{item.title}</Text>

        {/* Imagem grande central */}
        <View style={styles.imageWrap}>
          {item.image
            ? <Image source={item.image} style={styles.slideInfoImage} resizeMode="contain" />
            : <Image source={require('../assets/images/maos-ampara-azul.png')} style={styles.slideFallback} resizeMode="contain" />
          }
        </View>

        {/* Descrição abaixo da imagem */}
        <Text style={styles.slideDesc}>{item.desc}</Text>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={slides}
        keyExtractor={item => item.id}
        horizontal
        pagingEnabled
        scrollEnabled={true}
        showsHorizontalScrollIndicator={false}
        renderItem={renderSlide}
        style={styles.list}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / width)
          setCurrentIndex(index)
        }}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {slides.map((_, i) => (
            <View key={i} style={[styles.dot, i === currentIndex && styles.dotActive]} />
          ))}
        </View>
        <TouchableOpacity style={styles.nextBtn} onPress={goNext}>
          <Text style={styles.nextBtnText}>
            {currentIndex === slides.length - 1 ? 'Entrar' : 'Avançar'}
          </Text>
        </TouchableOpacity>
        {currentIndex < slides.length - 1 && (
          <TouchableOpacity onPress={onDone} style={styles.skipBtn}>
            <Text style={styles.skipText}>Pular</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  list: { flex: 1 },
  slide: { width, flex: 1 },

  // Slide 1 — boas-vindas
  bigLogo: { width, flex: 1 },
  welcomeBottom: { paddingBottom: 36, paddingLeft: 32 },
  welcomeLabel: { fontSize: 18, color: '#C4687A', fontWeight: '600', letterSpacing: 0.5 },
  welcomeBrand: { fontSize: 64, fontWeight: '200', color: '#1B3A6B', letterSpacing: 6, lineHeight: 72 },

  // Slide 2 — fullBg
  fullBgWhite: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  fullBgOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'flex-start',
  },
  fullBgTextArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  fullBgTitle: {
    fontSize: 40,
    fontWeight: '800',
    color: '#1B3A6B',
    textAlign: 'center',
    lineHeight: 48,
    marginBottom: 24,
  },
  fullBgDesc: {
    fontSize: 16,
    color: '#5A8FAF',
    textAlign: 'center',
    lineHeight: 26,
    fontWeight: '500',
  },

  // Slides 2-5
  slideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 12,
  },
  headerLogo: { width: 64, height: 64 },
  headerBrand: { fontSize: 44, fontWeight: '300', color: '#1B3A6B', letterSpacing: 5 },

  slideTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1B3A6B',
    paddingHorizontal: 24,
    marginBottom: 8,
    lineHeight: 36,
    textAlign: 'center',
  },

  imageWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  slideInfoImage: {
    width: width * 0.88,
    height: width * 0.88,
  },
  slideFallback: {
    width: width * 0.55,
    height: width * 0.55,
    opacity: 0.18,
  },

  slideDesc: {
    fontSize: 14,
    color: '#5A8FAF',
    paddingHorizontal: 24,
    paddingBottom: 12,
    lineHeight: 22,
    fontWeight: '500',
  },

  // Footer
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 28,
    paddingTop: 12,
    gap: 10,
  },
  dots: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D0C8C0' },
  dotActive: { backgroundColor: '#1B3A6B', width: 24, borderRadius: 4 },
  nextBtn: {
    backgroundColor: '#C4687A',
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
  },
  nextBtnText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  skipBtn: { alignItems: 'center', paddingVertical: 4 },
  skipText: { color: '#AAA', fontSize: 14, fontWeight: '600' },
})
