import React, { useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import HeaderComCurvas from '../components/HeaderComCurvas'
import { pedirLocalizacao } from '../services/permissaoLocalizacao'
import { Brand, CremeDoSite, TemaDaAba } from '../constants/brandTheme'

const TEMA = TemaDaAba.Entrada

const MOTIVOS = [
  { icone: 'speedometer-outline', texto: 'Calcular seu risco pela região e pelo horário' },
  { icone: 'alert-circle-outline', texto: 'Mandar seu endereço junto com o alerta SOS' },
  { icone: 'location-outline', texto: 'Mostrar delegacias e farmácias perto de você' },
]

// Explicação antes do pedido do sistema. Aparece uma vez, logo depois de entrar, só se
// o sistema ainda não perguntou. "Agora não" não recusa nada: o pedido continua
// disponível e a Proteção mostra um aviso para ativar depois.
export default function PermissaoLocalizacao({ onConcluir }) {
  const insets = useSafeAreaInsets()
  const [pedindo, setPedindo] = useState(false)

  const permitir = async () => {
    setPedindo(true)
    try {
      await pedirLocalizacao()
    } finally {
      setPedindo(false)
      onConcluir()
    }
  }

  return (
    <View style={styles.tela}>
      <ScrollView contentContainerStyle={styles.conteudo}>
        <HeaderComCurvas aba="Entrada" style={styles.header}>
          <View style={styles.icone}>
            <Ionicons name="navigate" size={30} color={TEMA.forte} />
          </View>
          <Text style={styles.titulo}>Para o Ampara saber onde você está</Text>
        </HeaderComCurvas>

        <View style={styles.corpo}>
          <Text style={styles.texto}>Com a localização ligada, o app consegue:</Text>
          {MOTIVOS.map((m) => (
            <View key={m.texto} style={styles.motivo}>
              <View style={styles.motivoIcone}>
                <Ionicons name={m.icone} size={18} color={TEMA.forte} />
              </View>
              <Text style={styles.motivoTexto}>{m.texto}</Text>
            </View>
          ))}
          <View style={styles.privacidade}>
            <Ionicons name="lock-closed-outline" size={16} color="#776C73" />
            <Text style={styles.privacidadeTexto}>
              Sua localização não aparece para outras usuárias. Ela só vai para sua rede de apoio quando você aciona o SOS.
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.acoes, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
        <TouchableOpacity style={styles.botao} onPress={permitir} disabled={pedindo} accessibilityRole="button">
          {pedindo ? <ActivityIndicator color="#FFF" /> : <Text style={styles.botaoTexto}>Permitir localização</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.depois} onPress={onConcluir} disabled={pedindo} accessibilityRole="button">
          <Text style={styles.depoisTexto}>Agora não</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: CremeDoSite },
  conteudo: { paddingBottom: 24 },
  header: { alignItems: 'center', paddingBottom: 26 },
  icone: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginTop: 18, marginBottom: 14 },
  titulo: { fontSize: 22, fontWeight: '800', color: '#273963', textAlign: 'center', paddingHorizontal: 10 },
  corpo: { paddingHorizontal: 24, paddingTop: 10, gap: 12 },
  texto: { fontSize: 15, color: Brand.ink },
  motivo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  motivoIcone: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  motivoTexto: { flex: 1, fontSize: 15, color: Brand.ink },
  privacidade: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 8 },
  privacidadeTexto: { flex: 1, fontSize: 13, color: '#776C73', lineHeight: 19 },
  acoes: { paddingHorizontal: 24, gap: 4 },
  botao: { backgroundColor: TEMA.forte, borderRadius: 28, paddingVertical: 16, alignItems: 'center' },
  botaoTexto: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  depois: { paddingVertical: 12, alignItems: 'center' },
  depoisTexto: { color: '#776C73', fontWeight: '600', fontSize: 15 },
})
