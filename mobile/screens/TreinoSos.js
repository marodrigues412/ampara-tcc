import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import * as Location from 'expo-location'
import * as Haptics from 'expo-haptics'
import { Ionicons } from '@expo/vector-icons'
import HeaderComCurvas from '../components/HeaderComCurvas'
import { supabase } from '../services/supabase'
import { buscarEnderecoReverso } from '../services/enderecoReverso'
import { marcarTreinoDoSos } from '../services/tutorial'
import { Brand, CremeDoSite, TemaDaAba } from '../constants/brandTheme'

const TEMA = TemaDaAba['Proteção']
const SEGURAR_MS = 3_000

// Treino do SOS: o mesmo gesto do botão de verdade (segurar 3 segundos, com a contagem e
// a vibração), mas NADA é enviado. No fim, mostra quem receberia o alerta e o endereço
// que iria junto, para ela conferir a rede e a localização antes de precisar.
export default function TreinoSos({ navigation }) {
  const [contatos, setContatos] = useState(null)
  const [segurando, setSegurando] = useState(false)
  const [restanteMs, setRestanteMs] = useState(SEGURAR_MS)
  const [concluido, setConcluido] = useState(false)
  const [endereco, setEndereco] = useState(undefined) // undefined = buscando; null = sem localização
  const fimRef = useRef(null)
  const relogioRef = useRef(null)

  useFocusEffect(useCallback(() => {
    let ativo = true
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (!data?.user) return
      const { data: rede } = await supabase.from('emergency_contacts').select('id, nome').eq('user_id', data.user.id)
      if (ativo) setContatos(rede ?? [])
    })()
    return () => { ativo = false }
  }, []))

  useEffect(() => () => clearInterval(relogioRef.current), [])

  const buscarEndereco = async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync()
      if (status !== 'granted') { setEndereco(null); return }
      const posicao = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 })
        ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const { latitude, longitude } = posicao.coords
      const { enderecos } = await buscarEnderecoReverso({ latitude, longitude, prioridade: 'protecao', prazoMs: 6_000 })
      const e = enderecos?.[0]
      setEndereco(e
        ? [`${e.street || e.name || ''}${e.streetNumber ? ', ' + e.streetNumber : ''}`, e.district || e.subregion, e.city].filter(Boolean).join(', ')
        : `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`)
    } catch {
      setEndereco(null)
    }
  }

  const concluir = () => {
    clearInterval(relogioRef.current)
    setSegurando(false)
    setConcluido(true)
    marcarTreinoDoSos()
    buscarEndereco()
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    AccessibilityInfo.announceForAccessibility('Treino concluído. Nenhum alerta foi enviado.')
  }

  const comecar = () => {
    if (concluido) return
    setSegurando(true)
    fimRef.current = Date.now() + SEGURAR_MS
    let segundoAnterior = 3
    relogioRef.current = setInterval(() => {
      const restante = Math.max(0, fimRef.current - Date.now())
      setRestanteMs(restante)
      const segundo = Math.ceil(restante / 1000)
      if (segundo !== segundoAnterior && segundo > 0) void Haptics.selectionAsync().catch(() => {})
      segundoAnterior = segundo
      if (restante === 0) concluir()
    }, 100)
  }

  const soltar = () => {
    if (concluido || !segurando) return
    clearInterval(relogioRef.current)
    setSegurando(false)
    setRestanteMs(SEGURAR_MS)
  }

  const recomecar = () => {
    setConcluido(false)
    setEndereco(undefined)
    setRestanteMs(SEGURAR_MS)
  }

  const nomes = (contatos ?? []).map((c) => (c.nome ?? '').split(' ')[0]).filter(Boolean)
  const progresso = 1 - restanteMs / SEGURAR_MS

  return (
    <View style={styles.tela}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <HeaderComCurvas aba="Proteção" onVoltar={() => navigation.goBack()} titulo="Treino do SOS" subtitulo="O mesmo gesto do alerta de verdade. Nada é enviado." />

        <View style={styles.faixa}>
          <Ionicons name="school-outline" size={16} color={TEMA.forte} />
          <Text style={styles.faixaTexto}>Modo treino: ninguém recebe nada.</Text>
        </View>

        {!concluido ? (
          <View style={styles.centro}>
            <Text style={styles.instrucao}>
              {segurando ? 'Continue segurando…' : 'Segure o botão por 3 segundos. Se soltar antes, cancela.'}
            </Text>
            <View style={styles.contagem}>
              <Text style={styles.contagemNumero}>{segurando ? Math.ceil(restanteMs / 1000) : 3}</Text>
              <Text style={styles.contagemSeg}>seg</Text>
            </View>
            <View style={styles.trilha}><View style={[styles.barra, { width: `${progresso * 100}%` }]} /></View>
            <Pressable
              onPressIn={comecar}
              onPressOut={soltar}
              style={[styles.sos, segurando && styles.sosSegurando]}
              accessibilityRole="button"
              accessibilityLabel="Segure por três segundos para treinar o SOS. Nada será enviado."
            >
              <Ionicons name="alert-circle" size={20} color="#FFF" />
              <Text style={styles.sosTexto}>SOS</Text>
            </Pressable>
            <Text style={styles.dica}>{segurando ? 'continue segurando' : 'segure 3 s'}</Text>
          </View>
        ) : (
          <View style={styles.resultado}>
            <View style={styles.ok}><Ionicons name="checkmark" size={30} color={Brand.green} /></View>
            <Text style={styles.resultadoTitulo}>Treino concluído</Text>
            <Text style={styles.resultadoTexto}>Num alerta de verdade, isto teria acontecido. Desta vez, nada foi enviado.</Text>

            <View style={styles.linha}>
              <Ionicons name="people-outline" size={20} color={TEMA.forte} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rotulo}>Receberiam pelo WhatsApp</Text>
                {contatos === null ? <ActivityIndicator color={TEMA.forte} style={{ alignSelf: 'flex-start' }} />
                  : nomes.length ? <Text style={styles.valor}>{nomes.join(', ')}</Text>
                    : (
                      <TouchableOpacity onPress={() => navigation.navigate('EmergencyContacts')} accessibilityRole="button">
                        <Text style={[styles.valor, styles.falta]}>Ninguém ainda. Toque para cadastrar sua rede de apoio.</Text>
                      </TouchableOpacity>
                    )}
              </View>
            </View>

            <View style={styles.linha}>
              <Ionicons name="location-outline" size={20} color={TEMA.forte} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rotulo}>Com a sua localização</Text>
                {endereco === undefined ? <ActivityIndicator color={TEMA.forte} style={{ alignSelf: 'flex-start' }} />
                  : <Text style={[styles.valor, !endereco && styles.falta]}>{endereco || 'Localização desligada: o alerta iria sem o seu endereço.'}</Text>}
              </View>
            </View>

            <TouchableOpacity style={styles.botao} onPress={() => navigation.goBack()} accessibilityRole="button">
              <Text style={styles.botaoTexto}>Pronto</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.botaoTexto2} onPress={recomecar} accessibilityRole="button">
              <Text style={styles.recomecar}>Treinar de novo</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: CremeDoSite },
  faixa: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', marginTop: 18, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: TEMA.fundo },
  faixaTexto: { fontSize: 13, fontWeight: '700', color: TEMA.forte },
  centro: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 22, gap: 14 },
  instrucao: { fontSize: 15, color: Brand.ink, textAlign: 'center', minHeight: 44 },
  contagem: { width: 150, height: 150, borderRadius: 75, borderWidth: 5, borderColor: TEMA.forte, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  contagemNumero: { fontSize: 56, fontWeight: '800', color: TEMA.forte, lineHeight: 62 },
  contagemSeg: { fontSize: 13, fontWeight: '700', color: '#8A8590' },
  trilha: { width: 150, height: 6, borderRadius: 3, backgroundColor: '#EFE4E8', overflow: 'hidden' },
  barra: { height: 6, borderRadius: 3, backgroundColor: TEMA.forte },
  sos: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Brand.danger, borderRadius: 32, paddingVertical: 16, paddingHorizontal: 34, marginTop: 10 },
  sosSegurando: { backgroundColor: '#9F2B40', transform: [{ scale: 1.15 }] },
  sosTexto: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  dica: { fontSize: 12, color: '#8A8590' },
  resultado: { paddingHorizontal: 24, paddingTop: 22, gap: 14 },
  ok: { width: 60, height: 60, borderRadius: 30, backgroundColor: Brand.mint, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  resultadoTitulo: { fontSize: 22, fontWeight: '800', color: TEMA.forte, textAlign: 'center' },
  resultadoTexto: { fontSize: 15, color: '#5E5259', textAlign: 'center', lineHeight: 22 },
  linha: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 6 },
  rotulo: { fontSize: 11, fontWeight: '800', color: '#8A8590', textTransform: 'uppercase', letterSpacing: 0.5 },
  valor: { fontSize: 15, color: Brand.ink, marginTop: 2, lineHeight: 21 },
  falta: { color: TEMA.forte },
  botao: { backgroundColor: TEMA.forte, borderRadius: 28, paddingVertical: 16, alignItems: 'center', marginTop: 10 },
  botaoTexto: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  botaoTexto2: { paddingVertical: 10, alignItems: 'center' },
  recomecar: { color: TEMA.forte, fontWeight: '700', fontSize: 15 },
})
