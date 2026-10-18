import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import HeaderComCurvas from '../components/HeaderComCurvas'
import LiaAvatar from '../components/LiaAvatar'
import { Brand, TemaDaAba } from '../constants/brandTheme'
import {
  APARENCIA_PADRAO_LIA,
  CORES_DE_CABELO_LIA,
  PENTEADOS_LIA,
  TONS_DE_PELE_LIA,
  carregarAparenciaLia,
  salvarAparenciaLia,
} from '../services/liaAppearance'

const TEMA = TemaDaAba.Assistente

export default function LiaAppearance({ navigation }) {
  const [aparencia, setAparencia] = useState(APARENCIA_PADRAO_LIA)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    carregarAparenciaLia().then(setAparencia).finally(() => setCarregando(false))
  }, [])

  const escolher = (campo, valor) => {
    setAparencia((atual) => ({ ...atual, [campo]: valor }))
  }

  const salvar = async () => {
    setSalvando(true)
    try {
      await salvarAparenciaLia(aparencia)
      navigation.goBack()
    } catch {
      Alert.alert('Não foi possível salvar', 'Tente novamente em instantes.')
    } finally {
      setSalvando(false)
    }
  }

  const amostra = (look, tamanho = 64, transparente = true) => (
    <LiaAvatar
      size={tamanho}
      reaction="oi"
      skin={look.skin}
      hair={look.hair}
      hairStyle={look.hairStyle}
      eyes={look.eyes}
      showRing={false}
      showBadge={false}
      transparentBackground={transparente}
    />
  )

  if (carregando) {
    return <View style={styles.carregando}><ActivityIndicator color={TEMA.forte} size="large" /></View>
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.conteudo} showsVerticalScrollIndicator={false}>
      <HeaderComCurvas
        aba="Assistente"
        onVoltar={() => navigation.goBack()}
        titulo="Escolha a sua Lia"
        subtitulo="Ela vai te acompanhar nos trajetos. Deixe-a mais parecida com você."
      >
        <View style={styles.preview}>
          <View style={styles.previewAvatar}>{amostra(aparencia, 156, false)}</View>
          <Text style={styles.previewNome}>Lia</Text>
          <Text style={styles.previewDescricao}>Sua companheira no Ampara</Text>
        </View>
      </HeaderComCurvas>

      <View style={styles.secao}>
        <Text style={styles.rotulo}>Tom de pele</Text>
        <View style={styles.tonsLinha}>
          {TONS_DE_PELE_LIA.map((cor, index) => {
            const selecionado = aparencia.skin === cor
            return (
              <TouchableOpacity
                key={cor}
                style={[styles.tom, { backgroundColor: cor }, selecionado && styles.tomSelecionado]}
                onPress={() => escolher('skin', cor)}
                accessibilityRole="button"
                accessibilityLabel={`Tom de pele ${index + 1}`}
                accessibilityState={{ selected: selecionado }}
              />
            )
          })}
        </View>
      </View>

      <View style={styles.secao}>
        <Text style={styles.rotulo}>Cabelo</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.penteadosLinha}>
          {PENTEADOS_LIA.map((penteado) => {
            const selecionado = aparencia.hairStyle === penteado.id
            return (
              <TouchableOpacity
                key={penteado.id}
                style={[styles.penteado, selecionado && styles.opcaoSelecionada]}
                onPress={() => escolher('hairStyle', penteado.id)}
                accessibilityRole="button"
                accessibilityLabel={penteado.nome}
                accessibilityState={{ selected: selecionado }}
              >
                {amostra({ ...aparencia, hairStyle: penteado.id }, 68)}
                <Text style={[styles.penteadoNome, selecionado && styles.penteadoNomeSelecionado]}>{penteado.nome}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>

      <View style={styles.secao}>
        <Text style={styles.rotulo}>Cor do cabelo</Text>
        <View style={styles.coresLinha}>
          {CORES_DE_CABELO_LIA.map(({ cor, nome }) => {
            const selecionado = aparencia.hair === cor
            return (
              <TouchableOpacity
                key={cor}
                style={[styles.tom, { backgroundColor: cor }, selecionado && styles.tomSelecionado]}
                onPress={() => escolher('hair', cor)}
                accessibilityRole="button"
                accessibilityLabel={nome}
                accessibilityState={{ selected: selecionado }}
              />
            )
          })}
        </View>
      </View>

      <View style={styles.secao}>
        <Text style={styles.rotulo}>Olhos</Text>
        <View style={styles.olhosLinha}>
          {[
            { id: 'redondo', nome: 'Redondos', icon: 'ellipse-outline' },
            { id: 'amendoado', nome: 'Amendoados', icon: 'eye-outline' },
          ].map((opcao) => {
            const selecionado = aparencia.eyes === opcao.id
            return (
              <TouchableOpacity
                key={opcao.id}
                style={[styles.olhosOpcao, selecionado && styles.olhosSelecionados]}
                onPress={() => escolher('eyes', opcao.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: selecionado }}
              >
                <Ionicons name={opcao.icon} size={20} color={selecionado ? '#FFF' : TEMA.forte} />
                <Text style={[styles.olhosTexto, selecionado && styles.textoSelecionado]}>{opcao.nome}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      <TouchableOpacity style={styles.salvar} onPress={salvar} disabled={salvando} accessibilityRole="button">
        {salvando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.salvarTexto}>Salvar aparência</Text>}
        {!salvando && <Ionicons name="arrow-forward" size={19} color="#FFF" />}
      </TouchableOpacity>
      <Text style={styles.nota}>Você pode mudar isso quando quiser no seu perfil.</Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  conteudo: { paddingBottom: 34 },
  carregando: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  preview: { alignItems: 'center', paddingTop: 18 },
  previewAvatar: { width: 176, height: 176, borderRadius: 88, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F6F1E9' },
  previewNome: { marginTop: 10, color: '#273963', fontFamily: 'Fraunces_500Medium_Italic', fontSize: 25 },
  previewDescricao: { marginTop: 2, color: '#6E5A9E', fontSize: 12 },
  secao: { marginHorizontal: 20, marginTop: 23 },
  rotulo: { marginBottom: 11, color: TEMA.forte, fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  tonsLinha: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', gap: 8 },
  coresLinha: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  tom: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: '#FFF', shadowColor: '#273963', shadowOpacity: 0.12, shadowRadius: 3, elevation: 1 },
  tomSelecionado: { borderColor: TEMA.forte, borderWidth: 3 },
  penteadosLinha: { gap: 9, paddingVertical: 2, paddingRight: 20 },
  penteado: { minWidth: 88, minHeight: 112, alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 2, borderColor: '#F0E5E9', borderRadius: 14, backgroundColor: '#FFF', padding: 8 },
  opcaoSelecionada: { borderColor: TEMA.forte, backgroundColor: TEMA.fundo },
  penteadoNome: { color: Brand.ink, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  penteadoNomeSelecionado: { color: TEMA.forte, fontWeight: '800' },
  textoSelecionado: { color: '#FFF' },
  olhosLinha: { flexDirection: 'row', gap: 10 },
  olhosOpcao: { minHeight: 48, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: Brand.line, borderRadius: 12, backgroundColor: '#FFF' },
  olhosSelecionados: { borderColor: TEMA.forte, backgroundColor: TEMA.forte },
  olhosTexto: { color: TEMA.forte, fontSize: 13, fontWeight: '700' },
  salvar: { minHeight: 52, marginHorizontal: 20, marginTop: 28, borderRadius: 14, backgroundColor: TEMA.forte, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  salvarTexto: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  nota: { marginTop: 12, marginHorizontal: 24, color: '#756670', fontSize: 12, textAlign: 'center' },
})
