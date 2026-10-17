import React, { useState } from 'react'
import { LayoutAnimation, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Brand } from '../constants/brandTheme'

// Seção que começa fechada, com ícone, título e um resumo; tocar abre o conteúdo.
export default function SecaoRecolhida({ icone, titulo, resumo, cor, fundo, children, abertaNoInicio = false }) {
  const [aberta, setAberta] = useState(abertaNoInicio)

  const alternar = () => {
    LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'))
    setAberta((a) => !a)
  }

  return (
    <View style={styles.secao}>
      <TouchableOpacity
        style={styles.cabecalho}
        onPress={alternar}
        accessibilityRole="button"
        accessibilityState={{ expanded: aberta }}
        accessibilityLabel={`${titulo}. ${resumo ?? ''}`}
      >
        <View style={[styles.icone, { backgroundColor: fundo }]}>
          <Ionicons name={icone} size={18} color={cor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.titulo}>{titulo}</Text>
          {!!resumo && <Text style={styles.resumo} numberOfLines={1}>{resumo}</Text>}
        </View>
        <Ionicons name={aberta ? 'chevron-up' : 'chevron-down'} size={18} color={cor} />
      </TouchableOpacity>
      {aberta && <View style={styles.corpo}>{children}</View>}
    </View>
  )
}

const styles = StyleSheet.create({
  secao: { marginHorizontal: 20, marginTop: 10 },
  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  icone: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  titulo: { fontSize: 15, fontWeight: '700', color: Brand.ink },
  resumo: { fontSize: 12, color: '#8A8590', marginTop: 1 },
  corpo: { paddingLeft: 50, paddingBottom: 4 },
})
