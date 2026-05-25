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
    title: 'Você não está sozinha',
    desc: 'Mulheres frequentemente modificam hábitos, trajetos e horários por receio de sofrer algum tipo de violência, especialmente durante deslocamentos urbanos.',
  },
  {
    id: '3',
    title: 'Monitoramento em\ntempo real',
    desc: 'O Ampara analisa sua localização e detecta situações de risco com base em dados de segurança pública, te protegendo a cada passo.',
  },
  {
    id: '4',
    title: 'SOS com\num único toque',
    desc: 'Cadastre seus contatos de emergência e dispare um alerta SOS segurando o botão — sua localização é enviada automaticamente por SMS.',
  },
  {
    id: '5',
    title: 'Mapeie seus\nlocais seguros',
    desc: 'Salve pontos de confiança, consulte o índice de segurança da sua região e tome decisões mais seguras no dia a dia.',
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

    return (
      <View style={styles.slide}>
        <View style={styles.slideTop}>
          <Image
            source={require('../assets/images/maos-ampara-azul.png')}
            style={styles.infoLogo}
            resizeMode="contain"
          />
          <Text style={styles.slideBrand}>Ampara</Text>
        </View>
        <View style={styles.slideBody}>
          <Text style={styles.slideTitle}>{item.title}</Text>
          <Text style={styles.slideDesc}>{item.desc}</Text>
        </View>
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
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        renderItem={renderSlide}
        style={styles.list}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {slides.map((_, i) => (
            <View key={i} style={[styles.dot, i === currentIndex && styles.dotActive]} />
          ))}
        </View>
        <TouchableOpacity style={styles.nextBtn} onPress={goNext}>
          <Text style={styles.nextBtnText}>
            {currentIndex === slides.length - 1 ? 'Entrar' : 'Próximo'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5EFE6' },
  list: { flex: 1 },

  slide: { width, flex: 1 },

  // Slide 1 — boas-vindas
  bigLogo: {
    width: width,
    flex: 1,
  },
  welcomeBottom: {
    paddingBottom: 36,
    paddingLeft: 32,
  },
  welcomeLabel: {
    fontSize: 18,
    color: '#C4687A',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  welcomeBrand: {
    fontSize: 64,
    fontWeight: '200',
    color: '#1B3A6B',
    letterSpacing: 6,
    lineHeight: 72,
  },

  // Slides 2-5
  slideTop: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 4,
  },
  slideBrand: {
    fontSize: 52,
    fontWeight: '200',
    color: '#1B3A6B',
    letterSpacing: 6,
    marginBottom: 16,
  },
  infoLogo: {
    width: width * 0.48,
    height: width * 0.48,
  },
  slideBody: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  slideTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#C4687A',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 34,
  },
  slideDesc: {
    fontSize: 17,
    fontWeight: '600',
    color: '#C4687A',
    textAlign: 'center',
    lineHeight: 27,
    opacity: 0.88,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 28,
    paddingTop: 16,
  },
  dots: { flexDirection: 'row', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D0C8C0' },
  dotActive: { backgroundColor: '#1B3A6B', width: 22, borderRadius: 4 },
  nextBtn: {
    backgroundColor: '#1B3A6B',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 20,
  },
  nextBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
})
