import React from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import Svg, { G, Path } from 'react-native-svg'
import { Brand, TemaDaAba } from '../constants/brandTheme'

// Popup padrão do app: topo claro na cor da aba com as mesmas curvas do header, ícone
// num círculo, título e conteúdo livre. As ações ficam embaixo; a principal vem cheia
// na cor da aba e as outras só em texto.
export default function PopupAmpara({ visible, onClose, aba = 'Proteção', icone, titulo, subtitulo, children, acoes = [] }) {
  const tema = TemaDaAba[aba] ?? TemaDaAba['Proteção']
  const botoes = acoes.length ? acoes : [{ texto: 'Fechar', onPress: onClose, principal: true }]

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.fundo}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar" />
        <View style={styles.painel}>
          <View style={[styles.topo, { backgroundColor: tema.fundo }]}>
            <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 380 120" preserveAspectRatio="none" pointerEvents="none">
              <G fill="none" stroke={tema.curva} strokeWidth={1.4}>
                <Path d="M-10 70 C80 40 160 100 250 60 S360 20 400 50" />
                <Path d="M-10 95 C90 65 170 125 260 85 S360 45 400 75" />
              </G>
            </Svg>
            {icone && (
              <View style={styles.icone}>
                <Ionicons name={icone} size={22} color={tema.forte} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.titulo, { color: tema.forte }]}>{titulo}</Text>
              {!!subtitulo && <Text style={styles.subtitulo}>{subtitulo}</Text>}
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Fechar">
              <Ionicons name="close" size={22} color={tema.forte} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.corpo} contentContainerStyle={styles.corpoConteudo}>{children}</ScrollView>

          <View style={styles.acoes}>
            {botoes.map((b) => (
              <TouchableOpacity
                key={b.texto}
                onPress={b.onPress}
                style={[styles.botao, b.principal && { backgroundColor: tema.forte }]}
                accessibilityRole="button"
              >
                {!!b.icone && <Ionicons name={b.icone} size={16} color={b.principal ? '#FFF' : tema.forte} />}
                <Text style={[styles.botaoTexto, { color: b.principal ? '#FFF' : tema.forte }]}>{b.texto}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  )
}

// Linha "rótulo: valor" usada dentro dos popups.
export function LinhaDoPopup({ icone, rotulo, valor, cor }) {
  return (
    <View style={styles.linha}>
      {icone && <Ionicons name={icone} size={17} color={cor ?? '#8A8590'} style={{ marginTop: 1 }} />}
      <View style={{ flex: 1 }}>
        <Text style={styles.linhaRotulo}>{rotulo}</Text>
        <Text style={[styles.linhaValor, cor && { color: cor }]}>{valor}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  fundo: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 22, backgroundColor: 'rgba(42, 29, 35, 0.48)' },
  painel: { width: '100%', maxWidth: 420, maxHeight: '86%', borderRadius: 30, backgroundColor: '#FFFFFF', overflow: 'hidden', elevation: 12, shadowColor: '#291D23', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.16, shadowRadius: 24 },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 18, overflow: 'hidden' },
  icone: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  titulo: { fontSize: 18, fontWeight: '800' },
  subtitulo: { fontSize: 13, color: '#776C73', marginTop: 2 },
  corpo: { flexGrow: 0 },
  corpoConteudo: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 },
  acoes: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, padding: 16, paddingTop: 12 },
  botao: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 11, paddingHorizontal: 18, borderRadius: 22 },
  botaoTexto: { fontSize: 14, fontWeight: '700' },
  linha: { flexDirection: 'row', gap: 10, paddingVertical: 7 },
  linhaRotulo: { fontSize: 11, fontWeight: '700', color: '#8A8590', textTransform: 'uppercase', letterSpacing: 0.5 },
  linhaValor: { fontSize: 14, color: Brand.ink, marginTop: 2, lineHeight: 20 },
})
