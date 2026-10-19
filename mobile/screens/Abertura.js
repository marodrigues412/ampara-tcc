import React, { useEffect } from 'react'
import { AccessibilityInfo, Image, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import { CremeDoSite } from '../constants/brandTheme'

// Abertura com o logo do Ampara, logo depois da splash nativa (que tem o mesmo fundo
// creme e as mesmas mãos, então a passagem não pisca). As mãos aparecem primeiro, o nome
// em seguida, e a tela passa sozinha. Com "reduzir movimento" ligado, só espera.
const DURACAO_MS = 1600

export default function Abertura({ onFim }) {
  const maos = useSharedValue(0)
  const nome = useSharedValue(0)

  useEffect(() => {
    maos.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) })
    nome.value = withDelay(350, withTiming(1, { duration: 500 }))
    AccessibilityInfo.announceForAccessibility('Ampara')
    const fim = setTimeout(onFim, DURACAO_MS)
    return () => clearTimeout(fim)
  }, [])

  const estiloMaos = useAnimatedStyle(() => ({ opacity: maos.value, transform: [{ scale: 0.92 + maos.value * 0.08 }] }))
  const estiloNome = useAnimatedStyle(() => ({ opacity: nome.value, transform: [{ translateY: (1 - nome.value) * 8 }] }))

  return (
    <View style={styles.tela}>
      <Animated.View style={estiloMaos}>
        <Image source={require('../assets/images/maos-ampara-azul.png')} style={styles.logo} resizeMode="contain" accessibilityIgnoresInvertColors />
      </Animated.View>
      <Animated.View style={[styles.textos, estiloNome]}>
        <Text style={styles.nome}>Ampara</Text>
        <Text style={styles.lema}>Você não está sozinha.</Text>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: CremeDoSite, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 150, height: 150 },
  textos: { alignItems: 'center', marginTop: 6 },
  nome: { fontSize: 38, fontWeight: '800', color: '#273963', letterSpacing: 0.3 },
  lema: { fontFamily: 'Fraunces_500Medium_Italic', fontSize: 18, color: '#BD5574', marginTop: 4 },
})
