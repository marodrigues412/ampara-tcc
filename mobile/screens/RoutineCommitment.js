import React, { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Switch, Alert,
  ActivityIndicator, Platform, Keyboard, KeyboardAvoidingView,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../services/supabase'
import { salvarCompromisso, excluirCompromisso, listarLocaisSeguros, criarLocalSeguro } from '../services/routineService'
import { useAddressSearch } from '../hooks/useAddressSearch'
import { TIPOS_COMPROMISSO, TRANSPORTES, COMPROMISSO_VAZIO, dataLocal, abrirNoMapa } from '../utils/rotina'
import { DIAS_SEMANA } from '../utils/activitySchedule'
import { Brand, TemaDaAba, CremeDoSite } from '../constants/brandTheme'
import HeaderComCurvas from '../components/HeaderComCurvas'

// Cores da seção de onde a tela é aberta.
const TEMA = TemaDaAba['Proteção']

// Cadastro e edição de um compromisso da rotina.
//
// Recebe em route.params um destes:
//   compromisso  um compromisso salvo, para editar
//   modelo       um modelo pronto (Faculdade, Trabalho...), para começar preenchido
//   nada         formulário em branco

const TOLERANCIAS = [10, 20, 30]
const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0]

const horaParaData = (hora) => {
  const [h, m] = hora.split(':').map(Number)
  const data = new Date()
  data.setHours(h, m, 0, 0)
  return data
}
const dataParaHora = (data) => `${String(data.getHours()).padStart(2, '0')}:${String(data.getMinutes()).padStart(2, '0')}`
const textoParaData = (texto) => {
  const [ano, mes, dia] = texto.split('-').map(Number)
  return new Date(ano, mes - 1, dia)
}
const dataPorExtenso = (texto) => {
  const data = textoParaData(texto)
  return `${DIAS_SEMANA[data.getDay()].nome}, ${String(data.getDate()).padStart(2, '0')}/${String(data.getMonth() + 1).padStart(2, '0')}`
}

// O banco devolve "08:00:00"; o formulário trabalha com "08:00".
const paraFormulario = (compromisso) => ({
  ...COMPROMISSO_VAZIO,
  ...compromisso,
  hora_chegada: String(compromisso.hora_chegada ?? COMPROMISSO_VAZIO.hora_chegada).slice(0, 5),
  hora_saida: String(compromisso.hora_saida ?? COMPROMISSO_VAZIO.hora_saida).slice(0, 5),
})

export default function RoutineCommitment({ navigation, route }) {
  const original = route.params?.compromisso ?? null
  const [form, setForm] = useState(() => paraFormulario(original ?? route.params?.modelo ?? {}))
  const [userId, setUserId] = useState(null)
  const [locaisSeguros, setLocaisSeguros] = useState([])
  const [salvarComoSeguro, setSalvarComoSeguro] = useState(false)
  const [salvando, setSalvando] = useState(false)
  // Qual seletor está aberto: 'hora_chegada', 'hora_saida', 'data' ou null.
  const [escolhendo, setEscolhendo] = useState(null)

  const { busca, sugestoes, procurar, limpar: limparBusca } = useAddressSearch()

  const temLocal = Number.isFinite(form.latitude) && Number.isFinite(form.longitude)
  const atualizar = (campos) => setForm((atual) => ({ ...atual, ...campos }))

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser()
      if (!data?.user) return
      setUserId(data.user.id)
      setLocaisSeguros(await listarLocaisSeguros(data.user.id))
    })()
  }, [])

  // Endereço digitado: fica só no compromisso. Ele vira local seguro apenas se a usuária
  // marcar a opção, porque local seguro reduz o score, e um restaurante não deve.
  const escolherEndereco = (item) => {
    atualizar({
      local_nome: item.nome,
      endereco: item.endereco || null,
      latitude: item.latitude,
      longitude: item.longitude,
      safe_location_id: null,
    })
    limparBusca()
    Keyboard.dismiss()
  }

  const escolherLocalSeguro = (local) => {
    atualizar({
      local_nome: local.nome,
      endereco: local.endereco,
      latitude: Number(local.latitude),
      longitude: Number(local.longitude),
      safe_location_id: local.id,
    })
    setSalvarComoSeguro(false)
  }

  const trocarLocal = () => atualizar({ local_nome: '', endereco: null, latitude: null, longitude: null, safe_location_id: null })

  const alternarDia = (dia) => atualizar({
    dias: form.dias?.includes(dia) ? form.dias.filter((d) => d !== dia) : [...(form.dias ?? []), dia],
  })

  const mudarRecorrencia = (umaVez) => {
    if (umaVez) atualizar({ data: form.data ?? dataLocal(new Date()) })
    else atualizar({ data: null, dias: form.dias?.length ? form.dias : [new Date().getDay()] })
  }

  // No Android o seletor é uma janela que fecha sozinha; no iOS ele fica aberto no
  // formulário e cada giro da roda já atualiza o valor.
  const aoEscolher = (evento, valor) => {
    const campo = escolhendo
    if (Platform.OS === 'android') setEscolhendo(null)
    if (evento.type === 'dismissed' || !valor) return
    atualizar({ [campo]: campo === 'data' ? dataLocal(valor) : dataParaHora(valor) })
  }

  const salvar = async () => {
    if (!form.nome.trim()) { Alert.alert('Falta o nome', 'Dê um nome ao compromisso, como "Faculdade".'); return }
    if (!temLocal) { Alert.alert('Falta o local', 'Busque um endereço ou escolha um dos seus locais seguros.'); return }
    if (!form.data && !form.dias?.length) { Alert.alert('Escolha os dias', 'Marque pelo menos um dia da semana.'); return }
    if (form.hora_chegada === form.hora_saida) { Alert.alert('Horário inválido', 'A chegada e a saída precisam ser diferentes.'); return }
    try {
      setSalvando(true)
      let compromisso = { ...form, nome: form.nome.trim() }
      if (salvarComoSeguro && !form.safe_location_id) {
        const id = await criarLocalSeguro(userId, {
          nome: form.local_nome, endereco: form.endereco, latitude: form.latitude, longitude: form.longitude,
        })
        compromisso = { ...compromisso, safe_location_id: id }
      }
      await salvarCompromisso(userId, compromisso)
      navigation.goBack()
    } catch (error) {
      Alert.alert('Erro', `Não foi possível salvar: ${error.message}`)
    } finally {
      setSalvando(false)
    }
  }

  const excluir = () => {
    Alert.alert('Excluir compromisso', `Remover "${original.nome}" da sua rotina?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await excluirCompromisso(original.id)
            navigation.goBack()
          } catch {
            Alert.alert('Erro', 'Não foi possível excluir o compromisso.')
          }
        },
      },
    ])
  }

  const valorDoSeletor = escolhendo === 'data'
    ? textoParaData(form.data)
    : escolhendo ? horaParaData(form[escolhendo]) : null

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <HeaderComCurvas
        aba="Proteção"
        onVoltar={() => navigation.goBack()}
        titulo={original ? 'Editar compromisso' : 'Novo compromisso'}
        style={styles.header}
      />

      <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        <Text style={styles.rotulo}>Nome</Text>
        <TextInput
          style={styles.input}
          value={form.nome}
          onChangeText={(nome) => atualizar({ nome })}
          placeholder="Faculdade, jantar com amigas..."
          placeholderTextColor={Brand.muted}
          maxLength={40}
        />

        <Text style={styles.rotulo}>Tipo</Text>
        <View style={styles.chips}>
          {TIPOS_COMPROMISSO.map((tipo) => {
            const ativo = form.tipo === tipo.id
            return (
              <TouchableOpacity key={tipo.id} style={[styles.chip, ativo && styles.chipAtivo]} onPress={() => atualizar({ tipo: tipo.id })}>
                <Ionicons name={tipo.icone} size={15} color={ativo ? '#FFF' : TEMA.forte} />
                <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]}>{tipo.rotulo}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <Text style={styles.rotulo}>Onde</Text>
        {temLocal ? (
          <>
            <View style={styles.localEscolhido}>
              <Ionicons name={form.safe_location_id ? 'shield-checkmark-outline' : 'location-outline'} size={20} color={TEMA.forte} />
              <View style={{ flex: 1 }}>
                <Text style={styles.localNome}>{form.local_nome}</Text>
                {!!form.endereco && <Text style={styles.localEndereco} numberOfLines={1}>{form.endereco}</Text>}
              </View>
              <TouchableOpacity onPress={trocarLocal} hitSlop={8} accessibilityLabel="Trocar local">
                <Ionicons name="close-circle" size={20} color={Brand.muted} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.verRegiao} onPress={() => abrirNoMapa(navigation, form)} accessibilityRole="button">
              <Ionicons name="map-outline" size={16} color={TEMA.forte} />
              <Text style={styles.verRegiaoTexto}>Ver como está a região no mapa</Text>
            </TouchableOpacity>
            {!form.safe_location_id && (
              <TouchableOpacity style={styles.marcar} onPress={() => setSalvarComoSeguro((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: salvarComoSeguro }}>
                <Ionicons name={salvarComoSeguro ? 'checkbox' : 'square-outline'} size={22} color={salvarComoSeguro ? TEMA.forte : Brand.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.marcarTexto}>Salvar também como local seguro</Text>
                  <Text style={styles.ajuda}>Só marque se você se sente segura lá sempre. Local seguro reduz o score.</Text>
                </View>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <>
            <View style={styles.buscaCaixa}>
              <Ionicons name="search" size={18} color={Brand.muted} />
              <TextInput
                style={styles.buscaInput}
                value={busca}
                onChangeText={procurar}
                placeholder="Buscar endereço ou lugar"
                placeholderTextColor={Brand.muted}
                accessibilityLabel="Buscar endereço"
              />
            </View>
            {sugestoes.map((item) => (
              <TouchableOpacity key={item.id} style={styles.sugestao} onPress={() => escolherEndereco(item)}>
                <Ionicons name="location-outline" size={16} color={TEMA.forte} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.sugestaoNome} numberOfLines={1}>{item.nome}</Text>
                  {!!item.endereco && <Text style={styles.sugestaoTexto} numberOfLines={1}>{item.endereco}</Text>}
                </View>
              </TouchableOpacity>
            ))}
            {locaisSeguros.length > 0 && (
              <>
                <Text style={styles.ajuda}>Ou escolha um local seguro</Text>
                <View style={styles.chips}>
                  {locaisSeguros.map((local) => (
                    <TouchableOpacity key={local.id} style={styles.chip} onPress={() => escolherLocalSeguro(local)}>
                      <Ionicons name="shield-checkmark-outline" size={15} color={TEMA.forte} />
                      <Text style={styles.chipTexto}>{local.nome}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </>
        )}

        <Text style={styles.rotulo}>Repetir</Text>
        <View style={styles.chips}>
          <TouchableOpacity style={[styles.chip, !form.data && styles.chipAtivo]} onPress={() => mudarRecorrencia(false)}>
            <Text style={[styles.chipTexto, !form.data && styles.chipTextoAtivo]}>Toda semana</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.chip, !!form.data && styles.chipAtivo]} onPress={() => mudarRecorrencia(true)}>
            <Text style={[styles.chipTexto, !!form.data && styles.chipTextoAtivo]}>Só uma vez</Text>
          </TouchableOpacity>
        </View>
        {form.data ? (
          <TouchableOpacity style={[styles.campoHora, escolhendo === 'data' && styles.campoHoraAberto]} onPress={() => setEscolhendo(escolhendo === 'data' ? null : 'data')}>
            <Ionicons name="calendar-outline" size={18} color={TEMA.forte} />
            <Text style={styles.campoHoraTexto}>{dataPorExtenso(form.data)}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.dias}>
            {ORDEM_SEMANA.map((id) => {
              const marcado = form.dias?.includes(id)
              return (
                <TouchableOpacity
                  key={id}
                  style={[styles.dia, marcado && styles.diaMarcado]}
                  onPress={() => alternarDia(id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: marcado }}
                  accessibilityLabel={DIAS_SEMANA[id].nome}
                >
                  <Text style={[styles.diaTexto, marcado && styles.diaTextoMarcado]}>{DIAS_SEMANA[id].curto}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        )}

        <View style={styles.horas}>
          {[['hora_chegada', 'Chego às'], ['hora_saida', 'Saio às']].map(([campo, rotulo]) => (
            <TouchableOpacity
              key={campo}
              style={[styles.hora, escolhendo === campo && styles.campoHoraAberto]}
              onPress={() => setEscolhendo(escolhendo === campo ? null : campo)}
              accessibilityRole="button"
              accessibilityLabel={`${rotulo}: ${form[campo]}`}
            >
              <Text style={styles.ajuda}>{rotulo}</Text>
              <Text style={styles.valorHora}>{form[campo]}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {escolhendo && (
          <DateTimePicker
            value={valorDoSeletor}
            mode={escolhendo === 'data' ? 'date' : 'time'}
            is24Hour
            minimumDate={escolhendo === 'data' ? new Date() : undefined}
            display={Platform.OS === 'ios' ? (escolhendo === 'data' ? 'inline' : 'spinner') : 'default'}
            onChange={aoEscolher}
            locale="pt-BR"
            // As telas do Ampara são sempre claras. Com o iPhone no modo escuro, o seletor
            // usaria texto branco e sumiria no fundo branco.
            themeVariant="light"
            textColor={Brand.ink}
            accentColor={TEMA.forte}
          />
        )}

        <Text style={styles.rotulo}>Como você vai</Text>
        <View style={styles.chips}>
          {TRANSPORTES.map((t) => {
            const ativo = form.transporte === t.id
            return (
              <TouchableOpacity key={t.id} style={[styles.chip, ativo && styles.chipAtivo]} onPress={() => atualizar({ transporte: t.id })}>
                <Ionicons name={t.icone} size={15} color={ativo ? '#FFF' : TEMA.forte} />
                <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]}>{t.rotulo}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
        <Text style={styles.ajuda}>Usado para estimar a hora de sair. É uma estimativa, sem considerar o trânsito do dia.</Text>

        <View style={styles.linhaSwitch}>
          <View style={{ flex: 1 }}>
            <Text style={styles.marcarTexto}>Avisar se eu não chegar</Text>
            <Text style={styles.ajuda}>O Ampara pergunta se está tudo bem quando você atrasa.</Text>
          </View>
          <Switch
            value={form.avisar_atraso}
            onValueChange={(avisar_atraso) => atualizar({ avisar_atraso })}
            trackColor={{ false: '#E6DCE0', true: TEMA.forte }}
            thumbColor="#FFF"
          />
        </View>
        {form.avisar_atraso && (
          <View style={styles.chips}>
            {TOLERANCIAS.map((min) => {
              const ativo = form.tolerancia_min === min
              return (
                <TouchableOpacity key={min} style={[styles.chip, ativo && styles.chipAtivo]} onPress={() => atualizar({ tolerancia_min: min })}>
                  <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]}>{min} min de atraso</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        )}

        {form.tipo === 'exercicio' && (
          <View style={styles.linhaSwitch}>
            <View style={{ flex: 1 }}>
              <Text style={styles.marcarTexto}>Ligar o modo atividade</Text>
              <Text style={styles.ajuda}>Durante o compromisso, o exercício não é tratado como movimento incomum.</Text>
            </View>
            <Switch
              value={form.liga_modo_atividade}
              onValueChange={(liga_modo_atividade) => atualizar({ liga_modo_atividade })}
              trackColor={{ false: '#E6DCE0', true: TEMA.forte }}
              thumbColor="#FFF"
            />
          </View>
        )}

        <TouchableOpacity style={styles.botaoSalvar} onPress={salvar} disabled={salvando || !userId}>
          {salvando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.botaoSalvarTexto}>Salvar</Text>}
        </TouchableOpacity>
        {original && (
          <TouchableOpacity onPress={excluir} style={styles.excluir}>
            <Text style={styles.excluirTexto}>Excluir compromisso</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  // O header vai de ponta a ponta: as margens negativas desfazem o padding da tela.
  header: { marginHorizontal: -22, marginBottom: 14 },
  container: { flex: 1, backgroundColor: CremeDoSite, paddingHorizontal: 22 },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 40, marginBottom: 6 },
  voltar: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  voltarTexto: { color: TEMA.forte, fontSize: 15, fontWeight: '600' },
  logo: { width: 36, height: 36 },
  conteudo: { paddingBottom: 60 },
  titulo: { fontSize: 26, fontWeight: '700', color: TEMA.forte, marginTop: 8, marginBottom: 4 },

  rotulo: { fontSize: 12, fontWeight: '700', color: Brand.muted, textTransform: 'uppercase', marginTop: 20, marginBottom: 8 },
  ajuda: { fontSize: 12, color: Brand.muted, lineHeight: 17, marginTop: 4 },
  input: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 13, fontSize: 15, color: Brand.ink },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 18, borderWidth: 0, backgroundColor: '#FFF' },
  chipAtivo: { backgroundColor: TEMA.forte, borderColor: TEMA.forte },
  chipTexto: { fontSize: 13, color: TEMA.forte, fontWeight: '600' },
  chipTextoAtivo: { color: '#FFF' },

  buscaCaixa: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 12, height: 48 },
  buscaInput: { flex: 1, fontSize: 15, color: Brand.ink },
  sugestao: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  sugestaoNome: { fontSize: 14, color: Brand.ink, fontWeight: '600' },
  sugestaoTexto: { fontSize: 12, color: Brand.muted, marginTop: 1 },
  localEscolhido: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 12 },
  localNome: { fontSize: 15, color: Brand.ink, fontWeight: '600' },
  localEndereco: { fontSize: 12, color: Brand.muted, marginTop: 2 },
  verRegiao: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  verRegiaoTexto: { color: TEMA.forte, fontSize: 14, fontWeight: '600' },
  marcar: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 12 },
  marcarTexto: { fontSize: 14, color: Brand.ink, fontWeight: '600' },

  dias: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  dia: { width: 40, height: 40, borderRadius: 20, borderWidth: 0, alignItems: 'center', justifyContent: 'center' },
  diaMarcado: { backgroundColor: TEMA.forte, borderColor: TEMA.forte },
  diaTexto: { color: Brand.muted, fontWeight: '700' },
  diaTextoMarcado: { color: '#FFF' },
  campoHora: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 13, marginTop: 10 },
  campoHoraAberto: { borderColor: TEMA.forte, backgroundColor: TEMA.fundo },
  campoHoraTexto: { fontSize: 15, color: Brand.ink, fontWeight: '600' },

  horas: { flexDirection: 'row', gap: 12, marginTop: 16 },
  hora: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 18, paddingVertical: 10, alignItems: 'center' },
  valorHora: { fontSize: 26, color: Brand.ink, marginTop: 2, fontVariant: ['tabular-nums'] },

  linhaSwitch: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 22 },

  botaoSalvar: { backgroundColor: TEMA.forte, borderRadius: 20, paddingVertical: 15, alignItems: 'center', marginTop: 28 },
  botaoSalvarTexto: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  excluir: { alignItems: 'center', paddingVertical: 16 },
  excluirTexto: { color: Brand.danger, fontWeight: '600', fontSize: 15 },
})
