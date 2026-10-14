import React, { useCallback, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Modal,
  TextInput, Switch, ActivityIndicator, Image, Platform, KeyboardAvoidingView,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../services/supabase'
import {
  listarHorariosAtividade, salvarHorarioAtividade,
  alternarHorarioAtividade, excluirHorarioAtividade,
} from '../services/activityScheduleService'
import { DIAS_SEMANA, descreverDias } from '../utils/activitySchedule'
import { Brand } from '../constants/brandTheme'

const NOVO_HORARIO = { nome: 'Treino', dias: [1, 2, 3, 4, 5], hora_inicio: '08:00', hora_fim: '09:00', ativo: true }

const horaParaData = (hora) => {
  const [h, m] = hora.split(':').map(Number)
  const data = new Date()
  data.setHours(h, m, 0, 0)
  return data
}

const dataParaHora = (data) =>
  `${String(data.getHours()).padStart(2, '0')}:${String(data.getMinutes()).padStart(2, '0')}`

export default function ActivitySchedules({ navigation }) {
  const [userId, setUserId] = useState(null)
  const [horarios, setHorarios] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [form, setForm] = useState(null)
  // Qual hora está sendo escolhida no seletor: 'hora_inicio', 'hora_fim' ou null.
  const [escolhendo, setEscolhendo] = useState(null)
  const [salvando, setSalvando] = useState(false)

  const carregar = async () => {
    const { data } = await supabase.auth.getUser()
    if (!data?.user) return
    setUserId(data.user.id)
    setHorarios(await listarHorariosAtividade(data.user.id))
    setCarregando(false)
  }

  useFocusEffect(useCallback(() => { carregar() }, []))

  const abrir = (horario) => {
    setEscolhendo(null)
    setForm(horario
      ? { ...horario, hora_inicio: horario.hora_inicio.slice(0, 5), hora_fim: horario.hora_fim.slice(0, 5) }
      : { ...NOVO_HORARIO })
  }

  const alternarDia = (dia) => setForm((atual) => ({
    ...atual,
    dias: atual.dias.includes(dia) ? atual.dias.filter((d) => d !== dia) : [...atual.dias, dia],
  }))

  // No Android o seletor é uma janela que fecha sozinha; no iOS ele fica aberto dentro do
  // formulário e cada giro da roda já atualiza a hora.
  const aoEscolherHora = (evento, data) => {
    const campo = escolhendo
    if (Platform.OS === 'android') setEscolhendo(null)
    if (evento.type === 'dismissed' || !data) return
    setForm((atual) => ({ ...atual, [campo]: dataParaHora(data) }))
  }

  const salvar = async () => {
    if (form.dias.length === 0) { Alert.alert('Escolha os dias', 'Marque pelo menos um dia da semana.'); return }
    if (form.hora_inicio === form.hora_fim) { Alert.alert('Horário inválido', 'O início e o fim precisam ser diferentes.'); return }
    try {
      setSalvando(true)
      await salvarHorarioAtividade(userId, { ...form, nome: form.nome.trim() || 'Treino' })
      setForm(null)
      carregar()
    } catch (error) {
      Alert.alert('Erro', `Não foi possível salvar: ${error.message}`)
    } finally {
      setSalvando(false)
    }
  }

  const alternar = async (horario, ativo) => {
    setHorarios((atual) => atual.map((h) => h.id === horario.id ? { ...h, ativo } : h))
    try {
      await alternarHorarioAtividade(horario.id, ativo)
    } catch {
      Alert.alert('Erro', 'Não foi possível atualizar o horário.')
      carregar()
    }
  }

  const excluir = (horario) => {
    Alert.alert('Excluir horário', `Remover "${horario.nome}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await excluirHorarioAtividade(horario.id)
            setForm(null)
            carregar()
          } catch {
            Alert.alert('Erro', 'Não foi possível excluir o horário.')
          }
        },
      },
    ])
  }

  const atravessaMeiaNoite = form && form.hora_fim < form.hora_inicio

  return (
    <View style={styles.container}>
      <View style={styles.topo}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.voltar}>
          <Ionicons name="chevron-back" size={20} color={Brand.blue} />
          <Text style={styles.voltarTexto}>Voltar</Text>
        </TouchableOpacity>
        <Image source={require('../assets/images/maos-ampara-azul.png')} style={styles.logo} resizeMode="contain" />
      </View>

      <Text style={styles.titulo}>Horários de atividade</Text>
      <Text style={styles.subtitulo}>
        No horário programado, o modo atividade liga sozinho e desliga ao fim. Funciona com o Ampara aberto.
      </Text>

      <ScrollView contentContainerStyle={styles.lista} showsVerticalScrollIndicator={false}>
        {carregando ? (
          <ActivityIndicator size="large" color={Brand.rose} style={{ marginTop: 40 }} />
        ) : horarios.length === 0 ? (
          <View style={styles.vazio}>
            <Ionicons name="alarm-outline" size={36} color={Brand.line} />
            <Text style={styles.vazioTexto}>Nenhum horário programado ainda.</Text>
          </View>
        ) : horarios.map((h) => (
          <TouchableOpacity key={h.id} style={styles.item} onPress={() => abrir(h)} accessibilityRole="button" accessibilityLabel={`Editar ${h.nome}`}>
            <View style={styles.itemTextos}>
              <Text style={[styles.itemHora, !h.ativo && styles.desativado]}>
                {h.hora_inicio.slice(0, 5)} – {h.hora_fim.slice(0, 5)}
              </Text>
              <Text style={[styles.itemDetalhe, !h.ativo && styles.desativado]}>
                {h.nome} · {descreverDias(h.dias)}
              </Text>
            </View>
            <Switch
              value={h.ativo}
              onValueChange={(valor) => alternar(h, valor)}
              trackColor={{ false: '#E6DCE0', true: Brand.rose }}
              thumbColor="#FFF"
              accessibilityLabel={`Ativar ${h.nome}`}
            />
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.botaoNovo} onPress={() => abrir(null)}>
          <Ionicons name="add" size={20} color="#FFF" />
          <Text style={styles.botaoNovoTexto}>Novo horário</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={Boolean(form)} transparent animationType="slide" onRequestClose={() => setForm(null)}>
        <KeyboardAvoidingView style={styles.fundoModal} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {form && (
            <View style={styles.modal}>
              <Text style={styles.modalTitulo}>{form.id ? 'Editar horário' : 'Novo horário'}</Text>

              <Text style={styles.rotulo}>Nome</Text>
              <TextInput
                style={styles.input}
                value={form.nome}
                onChangeText={(nome) => setForm((atual) => ({ ...atual, nome }))}
                placeholder="Ex.: Academia, Corrida"
                maxLength={40}
              />

              <Text style={styles.rotulo}>Repetir</Text>
              <View style={styles.dias}>
                {DIAS_SEMANA.map((dia) => {
                  const marcado = form.dias.includes(dia.id)
                  return (
                    <TouchableOpacity
                      key={dia.id}
                      style={[styles.dia, marcado && styles.diaMarcado]}
                      onPress={() => alternarDia(dia.id)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: marcado }}
                      accessibilityLabel={dia.nome}
                    >
                      <Text style={[styles.diaTexto, marcado && styles.diaTextoMarcado]}>{dia.curto}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>

              <View style={styles.horas}>
                {[['hora_inicio', 'Início'], ['hora_fim', 'Fim']].map(([campo, rotulo]) => (
                  <TouchableOpacity
                    key={campo}
                    style={[styles.hora, escolhendo === campo && styles.horaEscolhendo]}
                    onPress={() => setEscolhendo(escolhendo === campo ? null : campo)}
                    accessibilityRole="button"
                    accessibilityLabel={`${rotulo}: ${form[campo]}`}
                  >
                    <Text style={styles.rotuloHora}>{rotulo}</Text>
                    <Text style={styles.valorHora}>{form[campo]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {atravessaMeiaNoite && (
                <Text style={styles.aviso}>Termina no dia seguinte.</Text>
              )}

              {escolhendo && (
                <DateTimePicker
                  value={horaParaData(form[escolhendo])}
                  mode="time"
                  is24Hour
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={aoEscolherHora}
                  locale="pt-BR"
                />
              )}

              <TouchableOpacity style={styles.botaoSalvar} onPress={salvar} disabled={salvando}>
                {salvando
                  ? <ActivityIndicator color="#FFF" />
                  : <Text style={styles.botaoSalvarTexto}>Salvar</Text>}
              </TouchableOpacity>
              <View style={styles.acoesModal}>
                {form.id && (
                  <TouchableOpacity onPress={() => excluir(form)}>
                    <Text style={styles.excluir}>Excluir</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setForm(null)} style={{ marginLeft: 'auto' }}>
                  <Text style={styles.cancelar}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Brand.canvas, paddingHorizontal: 22 },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 40, marginBottom: 6 },
  voltar: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  voltarTexto: { color: Brand.blue, fontSize: 15, fontWeight: '600' },
  logo: { width: 36, height: 36 },
  titulo: { fontSize: 26, fontWeight: '700', color: Brand.rose, marginTop: 8 },
  subtitulo: { color: Brand.muted, fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: 18 },

  lista: { paddingBottom: 60 },
  vazio: { alignItems: 'center', gap: 10, paddingVertical: 36 },
  vazioTexto: { color: Brand.muted, fontSize: 14 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Brand.line },
  itemTextos: { flex: 1 },
  itemHora: { fontSize: 28, fontWeight: '300', color: Brand.ink, fontVariant: ['tabular-nums'] },
  itemDetalhe: { fontSize: 13, color: Brand.muted, marginTop: 2 },
  desativado: { color: '#B9AEB4' },

  botaoNovo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Brand.rose, borderRadius: 14, paddingVertical: 15, marginTop: 22 },
  botaoNovoTexto: { color: '#FFF', fontWeight: '700', fontSize: 15 },

  fundoModal: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  modal: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 34 },
  modalTitulo: { fontSize: 20, fontWeight: '700', color: Brand.ink, marginBottom: 12 },
  rotulo: { fontSize: 12, fontWeight: '700', color: Brand.muted, textTransform: 'uppercase', marginTop: 12, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: Brand.line, borderRadius: 12, padding: 13, fontSize: 15, color: Brand.ink },
  dias: { flexDirection: 'row', justifyContent: 'space-between' },
  dia: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: Brand.line, alignItems: 'center', justifyContent: 'center' },
  diaMarcado: { backgroundColor: Brand.rose, borderColor: Brand.rose },
  diaTexto: { color: Brand.muted, fontWeight: '700' },
  diaTextoMarcado: { color: '#FFF' },
  horas: { flexDirection: 'row', gap: 12, marginTop: 18 },
  hora: { flex: 1, borderWidth: 1, borderColor: Brand.line, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  horaEscolhendo: { borderColor: Brand.rose, backgroundColor: Brand.surfaceSoft },
  rotuloHora: { fontSize: 12, color: Brand.muted, fontWeight: '600' },
  valorHora: { fontSize: 26, color: Brand.ink, fontWeight: '400', marginTop: 2, fontVariant: ['tabular-nums'] },
  aviso: { color: Brand.blue, fontSize: 12, marginTop: 8, textAlign: 'center' },
  botaoSalvar: { backgroundColor: Brand.rose, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  botaoSalvarTexto: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  acoesModal: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  excluir: { color: Brand.danger, fontWeight: '600', fontSize: 15 },
  cancelar: { color: Brand.blue, fontWeight: '600', fontSize: 15 },
})
