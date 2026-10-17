import React, { useState } from 'react'
import { ActivityIndicator, LayoutAnimation, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { buscarApoioPorPerto } from '../services/chatService'
import { Brand, TemaDaAba } from '../constants/brandTheme'

const TEMA = TemaDaAba.Mapa

const CATEGORIAS = [
  { id: 'ddm', rotulo: 'Delegacia da Mulher', icone: 'shield-outline' },
  { id: 'delegacia', rotulo: 'Delegacia', icone: 'business-outline' },
  { id: 'farmacia', rotulo: 'Farmácia 24 h', icone: 'medkit-outline' },
  { id: 'hospital', rotulo: 'Hospital', icone: 'medical-outline' },
]

const km = (d) => (d < 1 ? `${Math.round(d * 1000)} m` : `${String(d).replace('.', ',')} km`)

// Painel "Apoio por perto" no pé do mapa. Fechado, mostra só as categorias; ao escolher
// uma, busca os lugares (Google Places, pela função ampara-chat) perto do centro dado e
// abre a lista. Os lugares também viram pinos no mapa (onLugares).
export default function ApoioPorPerto({ centro, onLugares, onEscolher }) {
  const [categoria, setCategoria] = useState(null)
  const [lugares, setLugares] = useState([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState(null)
  // Recolhida: a lista some e libera o mapa, mas a categoria e os pinos continuam.
  const [recolhida, setRecolhida] = useState(false)

  const animar = () => LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'))

  const escolher = async (id) => {
    animar()
    if (categoria === id) {
      setCategoria(null)
      setLugares([])
      onLugares([])
      return
    }
    setCategoria(id)
    setRecolhida(false)
    setErro(null)
    setLugares([])
    onLugares([])
    if (!centro) { setErro('Sem localização para buscar lugares por perto.'); return }
    setCarregando(true)
    try {
      const lista = await buscarApoioPorPerto(id, centro.latitude, centro.longitude)
      animar()
      setLugares(lista)
      onLugares(lista)
      if (!lista.length) setErro('Nenhum lugar encontrado por perto.')
    } catch {
      setErro('Não consegui buscar agora. Tente de novo.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <View style={styles.painel}>
      {/* A linha inteira é a área de toque: o ícone sozinho era pequeno demais. */}
      <TouchableOpacity
        style={styles.cabecalho}
        onPress={() => { if (categoria) { animar(); setRecolhida((r) => !r) } }}
        disabled={!categoria}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: Boolean(categoria) && !recolhida }}
        accessibilityLabel={recolhida ? 'Mostrar lista de lugares' : 'Recolher lista de lugares'}
      >
        <Text style={styles.titulo}>Apoio por perto</Text>
        {categoria && (
          <View style={styles.seta}>
            <Ionicons name={recolhida ? 'chevron-up' : 'chevron-down'} size={20} color={TEMA.forte} />
          </View>
        )}
      </TouchableOpacity>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {CATEGORIAS.map((c) => {
          const ativa = categoria === c.id
          return (
            <TouchableOpacity
              key={c.id}
              style={[styles.chip, ativa && styles.chipAtivo]}
              onPress={() => escolher(c.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: ativa }}
            >
              <Ionicons name={c.icone} size={15} color={ativa ? '#FFF' : TEMA.forte} />
              <Text style={[styles.chipTexto, ativa && styles.chipTextoAtivo]}>{c.rotulo}</Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {categoria && !recolhida && (
        <View style={styles.lista}>
          {carregando && (
            <View style={styles.aviso}>
              <ActivityIndicator size="small" color={TEMA.forte} />
              <Text style={styles.avisoTexto}>Procurando por perto…</Text>
            </View>
          )}
          {!carregando && erro && <Text style={styles.avisoTexto}>{erro}</Text>}
          {lugares.map((l, i) => (
            <TouchableOpacity
              key={`${l.nome}${l.distanciaKm}`}
              style={styles.linha}
              onPress={() => onEscolher(l)}
              accessibilityRole="button"
              accessibilityLabel={`${l.nome}, ${km(l.distanciaKm)}. Mostrar no mapa`}
            >
              <View style={styles.numero}><Text style={styles.numeroTexto}>{i + 1}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nome} numberOfLines={1}>{l.nome}</Text>
                <Text style={styles.detalhe} numberOfLines={1}>
                  {km(l.distanciaKm)}
                  {l.abertoAgora === true ? ' · aberto agora' : l.abertoAgora === false ? ' · fechado agora' : ''}
                </Text>
              </View>
              {!!l.telefone && (
                <TouchableOpacity onPress={() => Linking.openURL(`tel:${l.telefone.replace(/[^\d+]/g, '')}`)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Ligar para ${l.nome}`}>
                  <Ionicons name="call-outline" size={20} color={TEMA.forte} />
                </TouchableOpacity>
              )}
              {!!l.mapsUrl && (
                <TouchableOpacity onPress={() => Linking.openURL(l.mapsUrl)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Rota até ${l.nome}`}>
                  <Ionicons name="navigate-outline" size={20} color={TEMA.forte} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          ))}
          {lugares.length > 0 && <Text style={styles.fonte}>Dados: Google</Text>}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  painel: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 14, paddingBottom: 12, elevation: 10, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: -3 } },
  cabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 4, marginBottom: 6, minHeight: 36 },
  seta: { width: 36, height: 36, borderRadius: 18, backgroundColor: TEMA.fundo, alignItems: 'center', justifyContent: 'center' },
  titulo: { fontSize: 15, fontWeight: '800', color: Brand.ink },
  chips: { gap: 8, paddingHorizontal: 18 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 13, borderRadius: 20, backgroundColor: TEMA.fundo },
  chipAtivo: { backgroundColor: TEMA.forte },
  chipTexto: { fontSize: 13, fontWeight: '600', color: TEMA.forte },
  chipTextoAtivo: { color: '#FFF' },
  lista: { paddingHorizontal: 18, paddingTop: 8, maxHeight: 260 },
  aviso: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  avisoTexto: { fontSize: 13, color: '#776C73', paddingVertical: 6 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  numero: { width: 28, height: 28, borderRadius: 14, backgroundColor: TEMA.forte, alignItems: 'center', justifyContent: 'center' },
  numeroTexto: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  nome: { fontSize: 14, color: Brand.ink, fontWeight: '600' },
  detalhe: { fontSize: 12, color: '#776C73', marginTop: 1 },
  fonte: { fontSize: 10, color: '#8A8590', textAlign: 'right', marginTop: 2 },
})
