import React from 'react'
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import Svg, { G, Path } from 'react-native-svg'
import { TemaDaAba } from '../constants/brandTheme'

// Header de todas as telas: fundo claro na cor da aba, curvas de nível por cima e cantos
// de baixo arredondados. Em cima, a marca do Ampara (mãos + nome); nas telas abertas por
// cima das abas, a seta de voltar vem antes dela. As curvas ficam esticadas
// (preserveAspectRatio "none") para acompanhar a altura do conteúdo.
// semMarca esconde a linha do logo, para telas que já mostram a marca em destaque (login).
export default function HeaderComCurvas({ aba, titulo, subtitulo, onVoltar, direita, children, style, semMarca = false }) {
  const insets = useSafeAreaInsets()
  const tema = TemaDaAba[aba] ?? TemaDaAba['Proteção']

  return (
    <View style={[styles.header, { backgroundColor: tema.fundo, paddingTop: insets.top + 10 }, style]}>
      <Svg style={styles.curvas} width="100%" height="100%" viewBox="0 0 380 200" preserveAspectRatio="none" pointerEvents="none">
        <G fill="none" stroke={tema.curva} strokeWidth={1.4}>
          <Path d="M-10 120 C80 80 160 160 250 110 S360 60 400 90" />
          <Path d="M-10 145 C90 105 170 185 260 135 S360 85 400 115" />
          <Path d="M-10 170 C100 130 180 210 270 160 S360 110 400 140" />
          <Path d="M-10 40 C70 70 150 10 240 40 S350 70 400 30" />
        </G>
      </Svg>

      {!semMarca && (
      <View style={styles.marcaLinha}>
        {onVoltar && (
          <TouchableOpacity onPress={onVoltar} hitSlop={10} style={styles.voltar} accessibilityRole="button" accessibilityLabel="Voltar">
            <Ionicons name="chevron-back" size={22} color={tema.forte} />
          </TouchableOpacity>
        )}
        <Image source={require('../assets/images/maos-ampara-azul.png')} style={styles.logo} resizeMode="contain" accessibilityIgnoresInvertColors />
        <Text style={styles.marca}>Ampara</Text>
        {direita && <View style={styles.direita}>{direita}</View>}
      </View>
      )}

      {titulo && <Text style={[styles.titulo, { color: tema.forte }]}>{titulo}</Text>}
      {subtitulo && <Text style={styles.subtitulo}>{subtitulo}</Text>}
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 20, overflow: 'hidden', borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  curvas: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  marcaLinha: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, minHeight: 30 },
  voltar: { marginRight: 2, marginLeft: -4 },
  logo: { width: 30, height: 30 },
  marca: { fontSize: 17, fontWeight: '800', color: '#273963', letterSpacing: 0.2 },
  direita: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 12 },
  titulo: { fontSize: 22, fontWeight: '800' },
  subtitulo: { fontSize: 13, color: '#776C73', marginTop: 2 },
})
