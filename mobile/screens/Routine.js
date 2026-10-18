import React, { useCallback, useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Alert,
  ActivityIndicator, Modal, Pressable,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../services/supabase'
import { listarCompromissos, listarLocaisSeguros, alternarCompromisso } from '../services/routineService'
import {
  TIPOS_COMPROMISSO, TRANSPORTES, MODELOS_COMPROMISSO, linhaDoTempo, horaDosMinutos, descreverRecorrencia,
  abrirNoMapa,
} from '../utils/rotina'
import { DIAS_SEMANA } from '../utils/activitySchedule'
import { Brand, TemaDaAba } from '../constants/brandTheme'
import HeaderComCurvas from '../components/HeaderComCurvas'

// Cores da seção de onde a tela é aberta.
const TEMA = TemaDaAba['Proteção']

// Minha rotina: a linha do tempo do dia escolhido (compromissos e os trajetos entre
// eles) e, embaixo, todos os compromissos cadastrados.

const iconeDoTipo = (tipo) => TIPOS_COMPROMISSO.find((t) => t.id === tipo)?.icone ?? 'location-outline'
const transporteDe = (id) => TRANSPORTES.find((t) => t.id === id) ?? TRANSPORTES[2]

// A semana começa na segunda, como o calendário brasileiro costuma mostrar.
const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0]

// Próxima data (a partir de hoje) que cai no dia da semana escolhido.
const proximaData = (diaSemana) => {
  const hoje = new Date()
  const data = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  data.setDate(data.getDate() + ((diaSemana - hoje.getDay() + 7) % 7))
  return data
}

export default function Routine({ navigation }) {
  const [userId, setUserId] = useState(null)
  const [compromissos, setCompromissos] = useState([])
  const [casa, setCasa] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [diaEscolhido, setDiaEscolhido] = useState(new Date().getDay())
  const [modelosVisiveis, setModelosVisiveis] = useState(false)

  const carregar = async () => {
    const { data } = await supabase.auth.getUser()
    if (!data?.user) return
    setUserId(data.user.id)
    const [lista, locais] = await Promise.all([listarCompromissos(data.user.id), listarLocaisSeguros(data.user.id)])
    setCompromissos(lista)
    // A casa é a origem do primeiro trajeto do dia e o destino da volta.
    setCasa(locais.find((l) => String(l.tipo).toLowerCase() === 'casa') ?? null)
    setCarregando(false)
  }

  useFocusEffect(useCallback(() => { carregar() }, []))

  const itensDoDia = useMemo(
    () => linhaDoTempo(compromissos, proximaData(diaEscolhido), casa),
    [compromissos, diaEscolhido, casa],
  )

  const alternar = async (compromisso, ativo) => {
    setCompromissos((atual) => atual.map((c) => c.id === compromisso.id ? { ...c, ativo } : c))
    try {
      await alternarCompromisso(compromisso.id, ativo)
    } catch {
      Alert.alert('Erro', 'Não foi possível atualizar o compromisso.')
      carregar()
    }
  }

  const abrirFormulario = (params) => {
    setModelosVisiveis(false)
    navigation.navigate('RoutineCommitment', params)
  }

  return (
    <View style={styles.container}>
      <HeaderComCurvas
        aba="Proteção"
        onVoltar={() => navigation.goBack()}
        titulo="Minha rotina"
        subtitulo="Cadastre seus compromissos para o Ampara conhecer seus horários de deslocamento."
        style={styles.header}
      />

      <ScrollView contentContainerStyle={styles.conteudo} showsVerticalScrollIndicator={false}>

        <View style={styles.dias} accessibilityRole="tablist">
          {ORDEM_SEMANA.map((id) => {
            const escolhido = diaEscolhido === id
            return (
              <TouchableOpacity
                key={id}
                style={[styles.dia, escolhido && styles.diaEscolhido]}
                onPress={() => setDiaEscolhido(id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: escolhido }}
                accessibilityLabel={DIAS_SEMANA[id].nome}
              >
                <Text style={[styles.diaTexto, escolhido && styles.diaTextoEscolhido]}>{DIAS_SEMANA[id].nome}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {carregando ? (
          <ActivityIndicator size="large" color={TEMA.forte} style={{ marginTop: 40 }} />
        ) : (
          <>
            {itensDoDia.length === 0 ? (
              <View style={styles.vazio}>
                <Ionicons name="calendar-outline" size={32} color={Brand.line} />
                <Text style={styles.vazioTexto}>Nenhum compromisso neste dia.</Text>
              </View>
            ) : (
              <View style={styles.linha}>
                {itensDoDia.map((item) => item.tipo === 'trajeto' ? (
                  <View key={item.chave} style={styles.trajeto}>
                    <Ionicons name={transporteDe(item.transporte).icone} size={16} color={TEMA.forte} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.trajetoTexto}>
                        {item.volta ? 'Volta para ' : 'Sair às '}
                        {item.volta ? item.destino : horaDosMinutos(item.saida)}
                        {' · cerca de '}{item.minutos} min
                      </Text>
                      {item.apertado && (
                        <Text style={styles.apertado}>Tempo curto entre os compromissos</Text>
                      )}
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    key={item.chave}
                    style={[styles.compromisso, !item.compromisso.avisar_atraso && styles.compromissoSemAviso]}
                    onPress={() => abrirFormulario({ compromisso: item.compromisso })}
                    accessibilityRole="button"
                    accessibilityLabel={`Editar ${item.compromisso.nome}`}
                  >
                    <Ionicons name={iconeDoTipo(item.compromisso.tipo)} size={20} color={TEMA.forte} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.compromissoHora}>
                        {item.compromisso.hora_chegada.slice(0, 5)} às {item.compromisso.hora_saida.slice(0, 5)}
                      </Text>
                      <Text style={styles.compromissoNome}>{item.compromisso.nome}</Text>
                      <Text style={styles.compromissoLocal} numberOfLines={1}>{item.compromisso.local_nome}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.botaoMapa}
                      onPress={() => abrirNoMapa(navigation, item.compromisso)}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={`Ver a região de ${item.compromisso.local_nome} no mapa`}
                    >
                      <Ionicons name="map-outline" size={18} color={TEMA.forte} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {!casa && compromissos.length > 0 && (
              <TouchableOpacity style={styles.dica} onPress={() => navigation.navigate('SafeLocations')}>
                <Ionicons name="home-outline" size={18} color={TEMA.forte} />
                <Text style={styles.dicaTexto}>
                  Cadastre sua Casa nos locais seguros para ver o primeiro trajeto do dia e a volta.
                </Text>
              </TouchableOpacity>
            )}

            <Text style={styles.secao}>Todos os compromissos</Text>
            {compromissos.length === 0 && (
              <Text style={styles.vazioTexto}>Comece adicionando a faculdade, o trabalho ou a academia.</Text>
            )}
            {compromissos.map((c) => (
              <TouchableOpacity key={c.id} style={styles.item} onPress={() => abrirFormulario({ compromisso: c })}>
                <Ionicons name={iconeDoTipo(c.tipo)} size={20} color={c.ativo ? TEMA.forte : '#B9AEB4'} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemNome, !c.ativo && styles.desativado]}>{c.nome}</Text>
                  <Text style={[styles.itemDetalhe, !c.ativo && styles.desativado]}>
                    {descreverRecorrencia(c)} · {c.hora_chegada.slice(0, 5)} às {c.hora_saida.slice(0, 5)}
                  </Text>
                </View>
                <Switch
                  value={c.ativo}
                  onValueChange={(valor) => alternar(c, valor)}
                  trackColor={{ false: '#E6DCE0', true: TEMA.forte }}
                  thumbColor="#FFF"
                  accessibilityLabel={`Ativar ${c.nome}`}
                />
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={styles.botaoNovo} onPress={() => setModelosVisiveis(true)} disabled={!userId}>
              <Ionicons name="add" size={20} color="#FFF" />
              <Text style={styles.botaoNovoTexto}>Novo compromisso</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Modelos prontos: abrem o formulário já preenchido. */}
      <Modal visible={modelosVisiveis} transparent animationType="slide" onRequestClose={() => setModelosVisiveis(false)}>
        <View style={styles.fundoModal}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModelosVisiveis(false)} accessibilityLabel="Fechar" />
          <View style={styles.modal}>
            <Text style={styles.modalTitulo}>O que você quer adicionar?</Text>
            {MODELOS_COMPROMISSO.map((modelo) => (
              <TouchableOpacity key={modelo.nome} style={styles.modelo} onPress={() => abrirFormulario({ modelo })}>
                <Ionicons name={iconeDoTipo(modelo.tipo)} size={22} color={TEMA.forte} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemNome}>{modelo.nome}</Text>
                  <Text style={styles.itemDetalhe}>{descreverRecorrencia(modelo)} · {modelo.hora_chegada} às {modelo.hora_saida}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#B99AA5" />
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modelo} onPress={() => abrirFormulario({})}>
              <Ionicons name="add-circle-outline" size={22} color={Brand.muted} />
              <Text style={[styles.itemNome, { flex: 1 }]}>Outro compromisso</Text>
              <Ionicons name="chevron-forward" size={18} color="#B99AA5" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  // O header vai de ponta a ponta: as margens negativas desfazem o padding da tela.
  header: { marginHorizontal: -22, marginBottom: 14 },
  container: { flex: 1, backgroundColor: '#FFFFFF', paddingHorizontal: 22 },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 40, marginBottom: 6 },
  voltar: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  voltarTexto: { color: TEMA.forte, fontSize: 15, fontWeight: '600' },
  logo: { width: 36, height: 36 },
  conteudo: { paddingBottom: 60 },
  titulo: { fontSize: 26, fontWeight: '700', color: TEMA.forte, marginTop: 8 },
  subtitulo: { color: Brand.muted, fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: 16 },

  dias: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  dia: { paddingVertical: 7, paddingHorizontal: 8, borderRadius: 20 },
  diaEscolhido: { backgroundColor: TEMA.forte },
  diaTexto: { color: Brand.muted, fontWeight: '600', fontSize: 13 },
  diaTextoEscolhido: { color: '#FFF' },

  linha: { gap: 6 },
  trajeto: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 9, paddingLeft: 14, paddingVertical: 6, borderLeftWidth: 2, borderLeftColor: Brand.line, borderStyle: 'dashed' },
  trajetoTexto: { color: TEMA.forte, fontSize: 13, fontWeight: '600' },
  apertado: { color: Brand.amber, fontSize: 12, marginTop: 2 },
  compromisso: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  compromissoSemAviso: { backgroundColor: '#F7F4F5' },
  compromissoHora: { fontSize: 13, color: Brand.muted, fontWeight: '600', fontVariant: ['tabular-nums'] },
  compromissoNome: { fontSize: 16, color: Brand.ink, fontWeight: '700', marginTop: 1 },
  compromissoLocal: { fontSize: 12, color: Brand.muted, marginTop: 1 },
  botaoMapa: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },

  vazio: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  vazioTexto: { color: Brand.muted, fontSize: 14 },
  dica: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: TEMA.fundo, borderRadius: 20, padding: 12, marginTop: 14 },
  dicaTexto: { flex: 1, color: TEMA.forte, fontSize: 13, lineHeight: 18 },

  secao: { fontSize: 13, fontWeight: '700', color: Brand.muted, textTransform: 'uppercase', marginTop: 26, marginBottom: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  itemNome: { fontSize: 15, color: Brand.ink, fontWeight: '600' },
  itemDetalhe: { fontSize: 13, color: Brand.muted, marginTop: 2 },
  desativado: { color: '#B9AEB4' },

  botaoNovo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: TEMA.forte, borderRadius: 20, paddingVertical: 15, marginTop: 22 },
  botaoNovoTexto: { color: '#FFF', fontWeight: '700', fontSize: 15 },

  fundoModal: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  modal: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 34, gap: 4 },
  modalTitulo: { fontSize: 20, fontWeight: '700', color: Brand.ink, marginBottom: 8 },
  modelo: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
})
