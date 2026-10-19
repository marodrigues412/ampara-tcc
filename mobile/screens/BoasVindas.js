import React from 'react'
import { Image, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { G, Path } from 'react-native-svg'
import LiaAvatar from '../components/LiaAvatar'
import { CremeDoSite, FonteDaLia, TemaDaAba } from '../constants/brandTheme'

const TEMA = TemaDaAba.Entrada

// Primeira tela de quem acabou de instalar: no lugar do carrossel de 5 slides, a Lia,
// a promessa do app em uma frase e duas saídas. O 190 fica visível já aqui, para quem
// abriu o app numa emergência. Os recursos são explicados dentro do app.
export default function BoasVindas({ onCriarConta, onEntrar }) {
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.tela, { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
      <Svg style={styles.curvas} width="100%" height="100%" viewBox="0 0 380 800" preserveAspectRatio="none" pointerEvents="none">
        <G fill="none" stroke={TEMA.curva} strokeWidth={1.4}>
          <Path d="M-10 120 C80 80 160 160 250 110 S360 60 400 90" />
          <Path d="M-10 150 C90 110 170 190 260 140 S360 90 400 120" />
          <Path d="M-10 470 C70 500 150 440 240 470 S350 500 400 460" />
          <Path d="M-10 500 C80 530 160 470 250 500 S360 530 400 490" />
        </G>
      </Svg>

      <View style={styles.marca}>
        <Image source={require('../assets/images/maos-ampara-azul.png')} style={styles.logo} resizeMode="contain" accessibilityIgnoresInvertColors />
        <Text style={styles.marcaTexto}>Ampara</Text>
      </View>

      <View style={styles.centro}>
        <View style={styles.liaFundo}>
          <LiaAvatar size={150} reaction="oi" showRing={false} showBadge={false} />
        </View>
        <Text style={styles.ola}>Oi, eu sou a Lia</Text>
        <Text style={styles.promessa}>
          Fico de olho no seu caminho e aviso sua rede de apoio quando você precisar.
        </Text>
      </View>

      <View style={styles.acoes}>
        <TouchableOpacity style={styles.botao} onPress={onCriarConta} accessibilityRole="button">
          <Text style={styles.botaoTexto}>Criar minha conta</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.botao, styles.botaoClaro]} onPress={onEntrar} accessibilityRole="button">
          <Text style={[styles.botaoTexto, styles.botaoTextoClaro]}>Já tenho conta</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => Linking.openURL('tel:190')} style={styles.emergencia} accessibilityRole="button" accessibilityLabel="Em perigo agora? Ligar para 190">
          <Text style={styles.emergenciaTexto}>Em perigo agora? <Text style={styles.emergenciaLink}>Ligue 190</Text></Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: CremeDoSite, paddingHorizontal: 24 },
  curvas: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  marca: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logo: { width: 32, height: 32 },
  marcaTexto: { fontSize: 18, fontWeight: '800', color: '#273963' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  liaFundo: { width: 176, height: 176, borderRadius: 88, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  ola: { fontFamily: FonteDaLia, fontSize: 32, color: TEMA.forte, marginTop: 6 },
  promessa: { fontSize: 16, lineHeight: 24, color: '#5E5259', textAlign: 'center', maxWidth: 300 },
  acoes: { gap: 10 },
  botao: { backgroundColor: TEMA.forte, borderRadius: 28, paddingVertical: 16, alignItems: 'center' },
  botaoClaro: { backgroundColor: '#FFFFFF' },
  botaoTexto: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  botaoTextoClaro: { color: TEMA.forte },
  emergencia: { alignItems: 'center', paddingVertical: 8 },
  emergenciaTexto: { color: '#776C73', fontSize: 14 },
  emergenciaLink: { color: '#B83D53', fontWeight: '700' },
})
