import React, { useState } from 'react'
import { LayoutAnimation, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Brand } from '../constants/brandTheme'

// Seção que começa fechada, com ícone, título e um resumo; tocar abre o conteúdo.
// `pendente`: algo a fazer nesta seção (ex.: nenhum local cadastrado). O resumo fica em
// âmbar e o ícone ganha um ponto de aviso.
export default function SecaoRecolhida({ icone, titulo, resumo, cor, fundo, children, abertaNoInicio = false, pendente = false }) {
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
          {pendente && <View style={styles.pontoDeAviso} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.titulo}>{titulo}</Text>
          {!!resumo && <Text style={[styles.resumo, pendente && styles.resumoPendente]} numberOfLines={1}>{resumo}</Text>}
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
  resumoPendente: { color: Brand.amber, fontWeight: '600' },
  pontoDeAviso: { position: 'absolute', top: 1, right: 1, width: 10, height: 10, borderRadius: 5, backgroundColor: Brand.amber, borderWidth: 2, borderColor: '#FFFFFF' },
  corpo: { paddingLeft: 50, paddingBottom: 4 },
})
