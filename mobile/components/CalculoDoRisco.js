import React, { useState } from 'react'
import { LayoutAnimation, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Brand } from '../constants/brandTheme'

// "Por que seu risco está assim": lista recolhida com cada fator do score e os pontos
// que ele somou. Fechada, mostra numa linha só os fatores que contaram.
const corDosPontos = (pontos) => (pontos > 0 ? Brand.amber : pontos < 0 ? Brand.green : '#8A8590')
const formatarPontos = (pontos) => (pontos > 0 ? `+${pontos}` : pontos < 0 ? `−${Math.abs(pontos)}` : '0')

export default function CalculoDoRisco({ fatores, total, rotuloDoNivel, corDoNivel, corDaAba }) {
  const [aberta, setAberta] = useState(false)
  const queContaram = fatores.filter((f) => f.pontos !== 0)
  const resumo = queContaram.length
    ? queContaram.map((f) => `${f.curto} ${formatarPontos(f.pontos)}`).join(' · ')
    : 'Nenhum fator somou pontos agora'

  const alternar = () => {
    LayoutAnimation.configureNext(LayoutAnimation.create(240, 'easeInEaseOut', 'opacity'))
    setAberta((a) => !a)
  }

  return (
    <View style={styles.secao}>
      <TouchableOpacity
        style={styles.cabecalho}
        onPress={alternar}
        accessibilityRole="button"
        accessibilityState={{ expanded: aberta }}
        accessibilityLabel={`Por que seu risco está assim. ${resumo}`}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.titulo}>Por que seu risco está assim</Text>
          <Text style={styles.resumo}>{resumo}</Text>
        </View>
        <Ionicons name={aberta ? 'chevron-up' : 'chevron-down'} size={18} color={corDaAba} />
      </TouchableOpacity>

      {aberta && (
        <View>
          {fatores.map((f) => (
            <View key={f.id} style={styles.linha}>
              <View style={[styles.icone, { backgroundColor: f.pontos === 0 ? '#F3EFF1' : f.fundo }]}>
                <Ionicons name={f.icone} size={16} color={f.pontos === 0 ? '#8A8590' : f.cor} />
              </View>
              <Text style={[styles.nome, f.pontos === 0 && styles.apagado]}>{f.nome}</Text>
              <Text style={[styles.pontos, { color: corDosPontos(f.pontos) }]}>{formatarPontos(f.pontos)}</Text>
            </View>
          ))}
          <View style={styles.linha}>
            <Text style={[styles.nome, styles.total]}>Total</Text>
            <Text style={[styles.pontos, styles.totalValor, { color: corDoNivel }]}>{total} / 10 · {rotuloDoNivel.toLowerCase()}</Text>
          </View>
          <Text style={styles.nota}>O risco vai de 0 a 10 e é recalculado enquanto você se move.</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  secao: { marginHorizontal: 20, marginTop: 18 },
  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  titulo: { fontSize: 15, fontWeight: '700', color: Brand.ink },
  resumo: { fontSize: 12, color: '#8A8590', marginTop: 2 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7 },
  icone: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  nome: { flex: 1, fontSize: 14, color: Brand.ink },
  apagado: { color: '#8A8590' },
  pontos: { fontSize: 14, fontWeight: '700' },
  total: { fontWeight: '700' },
  totalValor: { fontSize: 15 },
  nota: { fontSize: 12, color: '#8A8590', marginTop: 2 },
})
