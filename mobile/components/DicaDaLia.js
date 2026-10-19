import React, { useCallback, useState } from 'react'
import { LayoutAnimation, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import LiaAvatar from './LiaAvatar'
import { TemaDaAba } from '../constants/brandTheme'
import { dicaJaVista, marcarDicaVista } from '../services/tutorial'

// Dica da Lia na primeira visita de cada aba: uma frase sobre o que dá para fazer ali e
// um "Entendi". Aparece uma vez por aba (guardado no celular) e fica no meio do conteúdo,
// não por cima dele, para o leitor de tela ler como texto normal.
export default function DicaDaLia({ id, aba, texto, style }) {
  const tema = TemaDaAba[aba] ?? TemaDaAba['Proteção']
  const [visivel, setVisivel] = useState(false)

  // Relê ao voltar para a aba: "Rever as dicas" no Perfil pode ter apagado a marca.
  useFocusEffect(useCallback(() => {
    let ativo = true
    dicaJaVista(id).then((vista) => { if (ativo) setVisivel(!vista) })
    return () => { ativo = false }
  }, [id]))

  if (!visivel) return null

  const entendi = () => {
    LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'))
    setVisivel(false)
    marcarDicaVista(id)
  }

  return (
    <View style={[styles.dica, { backgroundColor: tema.fundo }, style]} accessibilityRole="summary">
      <LiaAvatar size={38} reaction="oi" showRing={false} showBadge={false} />
      <View style={styles.textos}>
        <Text style={[styles.rotulo, { color: tema.forte }]}>Dica da Lia</Text>
        <Text style={styles.texto}>{texto}</Text>
        <TouchableOpacity onPress={entendi} hitSlop={10} style={styles.botao} accessibilityRole="button" accessibilityLabel="Entendi, fechar a dica">
          <Text style={[styles.botaoTexto, { color: tema.forte }]}>Entendi</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  dica: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 14, borderRadius: 22 },
  textos: { flex: 1 },
  rotulo: { fontSize: 12, fontWeight: '800', marginBottom: 2 },
  texto: { fontSize: 14, lineHeight: 20, color: '#3A3138' },
  botao: { alignSelf: 'flex-end', marginTop: 6 },
  botaoTexto: { fontSize: 14, fontWeight: '800' },
})
