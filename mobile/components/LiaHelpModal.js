import React from 'react'
import { Image, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Brand } from '../constants/brandTheme'
import LiaAvatar from './LiaAvatar'

// Altura da Lia e do logo opcional, para os dois ficarem do mesmo tamanho.
const TAMANHO_ICONE = 68

// image é opcional: um logo mostrado na ponta direita do card, à frente da Lia. Com ele,
// o título desce para a linha de baixo, porque não sobra largura entre os dois.
export default function LiaHelpModal({ visible, title, message, image, imageLabel, onClose }) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Fechar explicação"
        />
        <View style={styles.panel}>
          {image ? (
            <>
              <View style={styles.headerIcones}>
                <LiaAvatar size={TAMANHO_ICONE} reaction="oi" showRing={false} showBadge={false} transparentBackground />
                <Image source={image} style={styles.image} resizeMode="contain" accessibilityLabel={imageLabel} />
              </View>
              <Text style={[styles.eyebrow, styles.eyebrowAbaixo]}>Lia explica</Text>
              <Text style={styles.title}>{title}</Text>
            </>
          ) : (
            <View style={styles.header}>
              <LiaAvatar size={TAMANHO_ICONE} reaction="oi" showRing={false} showBadge={false} transparentBackground />
              <View style={styles.headerText}>
                <Text style={styles.eyebrow}>Lia explica</Text>
                <Text style={styles.title}>{title}</Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                style={styles.close}
                accessibilityRole="button"
                accessibilityLabel="Fechar"
              >
                <Ionicons name="close" size={21} color={Brand.muted} />
              </TouchableOpacity>
            </View>
          )}
          <Text style={styles.message}>{message}</Text>
          <TouchableOpacity style={styles.dismissButton} onPress={onClose} accessibilityRole="button">
            <Text style={styles.dismissText}>Entendi</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: 'rgba(42, 29, 35, 0.48)' },
  panel: { width: '100%', maxWidth: 420, padding: 22, borderRadius: 24, backgroundColor: Brand.surface, shadowColor: '#291D23', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.16, shadowRadius: 24, elevation: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, minWidth: 0 },
  eyebrow: { color: Brand.rose, fontSize: 12, fontWeight: '700' },
  title: { color: Brand.ink, fontSize: 20, fontWeight: '700', marginTop: 2 },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerIcones: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // Largura e altura fixas, e não porcentagem: no iOS, largura em % com aspectRatio fazia a
  // imagem usar o tamanho original do arquivo e estourar o card. 1098 × 516 é a proporção
  // do logo da Barô, a única imagem usada aqui por enquanto.
  image: { height: TAMANHO_ICONE, width: Math.round(TAMANHO_ICONE * 1098 / 516) },
  eyebrowAbaixo: { marginTop: 14 },
  message: { color: Brand.ink, fontSize: 15, lineHeight: 23, marginTop: 18 },
  dismissButton: { alignSelf: 'flex-end', minWidth: 100, alignItems: 'center', marginTop: 18, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 22, backgroundColor: Brand.rose },
  dismissText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
})
