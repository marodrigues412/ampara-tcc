import React, { useEffect, useState } from 'react'
import {
View,
Text,
StyleSheet,
TextInput,
TouchableOpacity,
ScrollView,
Alert,
Modal,
FlatList,
Image
} from 'react-native'

import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../services/supabase'
import { getPhoneContacts } from '../services/contactService'

const PAISES = [
  { codigo: '55',  bandeira: '🇧🇷', nome: 'Brasil' },
  { codigo: '1',   bandeira: '🇺🇸', nome: 'EUA / Canadá' },
  { codigo: '351', bandeira: '🇵🇹', nome: 'Portugal' },
  { codigo: '54',  bandeira: '🇦🇷', nome: 'Argentina' },
  { codigo: '598', bandeira: '🇺🇾', nome: 'Uruguai' },
  { codigo: '595', bandeira: '🇵🇾', nome: 'Paraguai' },
  { codigo: '56',  bandeira: '🇨🇱', nome: 'Chile' },
  { codigo: '591', bandeira: '🇧🇴', nome: 'Bolívia' },
  { codigo: '57',  bandeira: '🇨🇴', nome: 'Colômbia' },
  { codigo: '34',  bandeira: '🇪🇸', nome: 'Espanha' },
  { codigo: '44',  bandeira: '🇬🇧', nome: 'Reino Unido' },
  { codigo: '49',  bandeira: '🇩🇪', nome: 'Alemanha' },
  { codigo: '33',  bandeira: '🇫🇷', nome: 'França' },
  { codigo: '39',  bandeira: '🇮🇹', nome: 'Itália' },
]

const PAIS_PADRAO = PAISES[0]

// Detecta se um número já tem DDI e retorna { pais, localNumber } ou null
function detectarDdi(numero) {
  const digits = numero.replace(/\D/g, '')
  // Prefixos mais longos primeiro para evitar match parcial
  const ordenados = [...PAISES].sort((a, b) => b.codigo.length - a.codigo.length)
  for (const pais of ordenados) {
    if (digits.startsWith(pais.codigo) && digits.length > pais.codigo.length) {
      return { pais, localNumber: digits.slice(pais.codigo.length) }
    }
  }
  return null
}

function validarNumeroLocal(localNumber, ddi) {
  const digits = localNumber.replace(/\D/g, '')
  if (ddi === '55') return digits.length >= 10 && digits.length <= 11
  return digits.length >= 6
}

export default function EmergencyContacts({ navigation }) {

const [contatos, setContatos] = useState([])
const [nome, setNome] = useState('')
const [telefone, setTelefone] = useState('')
const [relacao, setRelacao] = useState('')
const [paisSelecionado, setPaisSelecionado] = useState(PAIS_PADRAO)

const [userId, setUserId] = useState(null)

const [editingContact, setEditingContact] = useState(null)
const [modalVisible, setModalVisible] = useState(false)

const [phoneContacts, setPhoneContacts] = useState([])
const [contactsModalVisible, setContactsModalVisible] = useState(false)
const [contactSearch, setContactSearch] = useState('')

// Modal seletor de país (campo principal)
const [ddiModalVisible, setDdiModalVisible] = useState(false)
const [ddiSearch, setDdiSearch] = useState('')

// Modal confirmação de país ao importar contato sem DDI
const [confirmDdiModalVisible, setConfirmDdiModalVisible] = useState(false)
const [pendingContact, setPendingContact] = useState(null)
const [confirmPais, setConfirmPais] = useState(PAIS_PADRAO)
const [confirmDdiSearch, setConfirmDdiSearch] = useState('')
const [confirmDdd, setConfirmDdd] = useState('')

const MAX_CONTATOS = 3
const restante = MAX_CONTATOS - contatos.length
const textoInfo = restante === 0
  ? 'Você já adicionou o máximo de contatos'
  : restante === 1
  ? 'Você pode adicionar mais 1 contato'
  : `Você pode adicionar mais ${restante} contatos`

useEffect(() => { loadUser() }, [])

async function loadUser() {
  const { data } = await supabase.auth.getUser()
  if (data?.user) {
    setUserId(data.user.id)
    loadContacts(data.user.id)
  }
}

async function loadContacts(id) {
  const { data } = await supabase
    .from('emergency_contacts')
    .select('*')
    .eq('user_id', id)
  setContatos(data || [])
}

function limparCampos() {
  setNome('')
  setTelefone('')
  setRelacao('')
  setPaisSelecionado(PAIS_PADRAO)
}

async function handleAdd() {
  if (!nome || !telefone) {
    Alert.alert('Erro', 'Preencha nome e telefone')
    return
  }
  if (!validarNumeroLocal(telefone, paisSelecionado.codigo)) {
    Alert.alert('Telefone inválido', `Número inválido para ${paisSelecionado.nome}. Verifique os dígitos e o DDD.`)
    return
  }
  if (contatos.length >= MAX_CONTATOS) {
    Alert.alert('Limite', 'Máximo de contatos atingido')
    return
  }

  const localClean = telefone.replace(/\D/g, '')
  const e164 = `+${paisSelecionado.codigo}${localClean}`

  const { error } = await supabase
    .from('emergency_contacts')
    .insert({ user_id: userId, nome, telefone: e164, relacao })

  if (error) { Alert.alert('Erro', error.message); return }

  limparCampos()
  loadContacts(userId)
}

async function handleDelete(id) {
  await supabase.from('emergency_contacts').delete().eq('id', id)
  loadContacts(userId)
}

function openEditModal(contact) {
  setEditingContact(contact)
  setModalVisible(true)
}

async function handleSaveEdit() {
  await supabase
    .from('emergency_contacts')
    .update({
      nome: editingContact.nome,
      telefone: editingContact.telefone,
      relacao: editingContact.relacao
    })
    .eq('id', editingContact.id)
  setModalVisible(false)
  loadContacts(userId)
}

async function openPhoneContacts() {
  const data = await getPhoneContacts()
  const sorted = (data || [])
    .filter(c => c.name && c.phoneNumbers?.length)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  setPhoneContacts(sorted)
  setContactSearch('')
  setContactsModalVisible(true)
}

function handleSelectContact(contact) {
  const rawNumber = contact.phoneNumbers?.[0]?.number || ''
  const detectado = detectarDdi(rawNumber)

  setContactsModalVisible(false)

  if (detectado) {
    // Número já tem DDI reconhecido — preenche direto
    setNome(contact.name)
    setTelefone(detectado.localNumber)
    setPaisSelecionado(detectado.pais)
  } else {
    // Número sem DDI — abre modal de confirmação de país
    setPendingContact({ name: contact.name, rawNumber })
    setConfirmPais(PAIS_PADRAO)
    setConfirmDdiSearch('')
    setConfirmDdd('')
    setConfirmDdiModalVisible(true)
  }
}

function handleConfirmDdi() {
  if (!pendingContact) return
  const localClean = pendingContact.rawNumber.replace(/\D/g, '')
  const precisaDdd = confirmPais.codigo === '55' && localClean.length < 10

  if (precisaDdd) {
    const dddClean = confirmDdd.replace(/\D/g, '')
    if (dddClean.length !== 2) {
      Alert.alert('DDD inválido', 'Informe o DDD com 2 dígitos. Ex: 11')
      return
    }
    setTelefone(dddClean + localClean)
  } else {
    setTelefone(localClean)
  }

  setNome(pendingContact.name)
  setPaisSelecionado(confirmPais)
  setPendingContact(null)
  setConfirmDdiModalVisible(false)
}

const filteredContacts = contactSearch.trim() === ''
  ? phoneContacts
  : phoneContacts.filter(c => {
      const term = contactSearch.toLowerCase()
      return (
        c.name?.toLowerCase().includes(term) ||
        c.phoneNumbers?.[0]?.number?.includes(term)
      )
    })

const filteredDdi = ddiSearch.trim() === ''
  ? PAISES
  : PAISES.filter(p =>
      p.nome.toLowerCase().includes(ddiSearch.toLowerCase()) ||
      p.codigo.includes(ddiSearch)
    )

const filteredConfirmDdi = confirmDdiSearch.trim() === ''
  ? PAISES
  : PAISES.filter(p =>
      p.nome.toLowerCase().includes(confirmDdiSearch.toLowerCase()) ||
      p.codigo.includes(confirmDdiSearch)
    )

return (
<SafeAreaView style={styles.container}>
<ScrollView contentContainerStyle={{ padding: 20 }}>

  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
    <TouchableOpacity onPress={() => navigation.goBack()} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 }}>
      <Ionicons name="chevron-back" size={20} color="#1B3A6B" />
      <Text style={styles.back}>Voltar</Text>
    </TouchableOpacity>
    <Image source={require('../assets/images/maos-ampara-rosa.png')} style={{ width: 36, height: 36 }} resizeMode="contain" />
  </View>

  <Text style={styles.title}>Contatos de Emergência</Text>
  <Text style={styles.subtitle}>{textoInfo}</Text>

  <View style={styles.card}>

    <Text style={styles.label}>Nome</Text>
    <TextInput style={styles.input} value={nome} onChangeText={setNome} />

    <Text style={styles.label}>Telefone</Text>
    <View style={styles.phoneRow}>
      <TouchableOpacity
        style={styles.ddiButton}
        onPress={() => { setDdiSearch(''); setDdiModalVisible(true) }}
      >
        <Text style={styles.ddiButtonText}>
          {paisSelecionado.bandeira} +{paisSelecionado.codigo}
        </Text>
        <Text style={styles.ddiChevron}>▾</Text>
      </TouchableOpacity>
      <TextInput
        style={styles.phoneInput}
        value={telefone}
        onChangeText={setTelefone}
        keyboardType="phone-pad"
        placeholder={paisSelecionado.codigo === '55' ? 'DDD + número' : 'Número local'}
        placeholderTextColor="#BBB"
      />
    </View>

    <Text style={styles.label}>Relação</Text>
    <TextInput
      style={styles.input}
      value={relacao}
      onChangeText={setRelacao}
      placeholder="Ex: mãe"
    />

    <TouchableOpacity style={styles.selectButton} onPress={openPhoneContacts}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Ionicons name="people-outline" size={18} color="#FFF" />
        <Text style={styles.selectButtonText}>Selecionar da agenda</Text>
      </View>
    </TouchableOpacity>

    <TouchableOpacity style={styles.button} onPress={handleAdd}>
      <Text style={styles.buttonText}>Adicionar</Text>
    </TouchableOpacity>

    <TouchableOpacity onPress={limparCampos}>
      <Text style={styles.clearText}>Limpar campos</Text>
    </TouchableOpacity>

  </View>

  {contatos.map(item => (
    <View key={item.id} style={styles.contact}>
      <View>
        <Text style={styles.name}>{item.nome}</Text>
        <Text style={styles.phone}>{item.telefone}</Text>
        <Text style={styles.relacao}>{item.relacao}</Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => openEditModal(item)}>
          <Ionicons name="create-outline" size={22} color="#5A8FAF" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item.id)}>
          <Ionicons name="trash-outline" size={22} color="#C4687A" />
        </TouchableOpacity>
      </View>
    </View>
  ))}


  {/* ── MODAL AGENDA ── */}
  <Modal visible={contactsModalVisible} animationType="slide">
    <ScrollView style={{ paddingTop: 80, paddingHorizontal: 20, backgroundColor: '#F5EFE6' }}>
      <TouchableOpacity onPress={() => setContactsModalVisible(false)}>
        <Text style={{ color: '#1B3A6B', fontSize: 18, marginBottom: 25 }}>← Voltar</Text>
      </TouchableOpacity>
      <Text style={{ fontSize: 28, fontWeight: 'bold', marginBottom: 16 }}>Selecionar contato</Text>
      <TextInput
        style={styles.searchInput}
        value={contactSearch}
        onChangeText={setContactSearch}
        placeholder="Buscar por nome ou número..."
        placeholderTextColor="#AAA"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
      {filteredContacts.length === 0 && (
        <Text style={styles.emptySearch}>Nenhum contato encontrado</Text>
      )}
      {filteredContacts.map(contact => (
        <TouchableOpacity
          key={contact.id}
          style={styles.phoneCard}
          onPress={() => handleSelectContact(contact)}
        >
          <Text style={styles.phoneName}>{contact.name}</Text>
          <Text style={styles.phoneNumber}>{contact.phoneNumbers?.[0]?.number}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  </Modal>


  {/* ── MODAL SELETOR DDI (campo principal) ── */}
  <Modal visible={ddiModalVisible} transparent animationType="slide">
    <View style={styles.modalOverlay}>
      <View style={[styles.modal, { maxHeight: '75%' }]}>
        <Text style={styles.modalTitle}>Selecionar país</Text>
        <TextInput
          style={styles.searchInput}
          value={ddiSearch}
          onChangeText={setDdiSearch}
          placeholder="Buscar país..."
          placeholderTextColor="#AAA"
          autoCorrect={false}
        />
        <FlatList
          data={filteredDdi}
          keyExtractor={p => p.codigo}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.ddiItem, item.codigo === paisSelecionado.codigo && styles.ddiItemSelected]}
              onPress={() => { setPaisSelecionado(item); setDdiModalVisible(false) }}
            >
              <Text style={styles.ddiItemText}>{item.bandeira}  {item.nome}</Text>
              <Text style={styles.ddiItemCode}>+{item.codigo}</Text>
            </TouchableOpacity>
          )}
        />
        <TouchableOpacity onPress={() => setDdiModalVisible(false)}>
          <Text style={styles.clearText}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>


  {/* ── MODAL CONFIRMAR DDI (importação de contato sem código) ── */}
  <Modal visible={confirmDdiModalVisible} transparent animationType="slide">
    <View style={styles.modalOverlay}>
      <View style={[styles.modal, { maxHeight: '75%' }]}>
        <Text style={styles.modalTitle}>Selecionar país</Text>
        <Text style={styles.confirmHint}>
          O número <Text style={{ fontWeight: 'bold' }}>{pendingContact?.rawNumber}</Text> não tem código de país.{'\n'}Selecione o país correto:
        </Text>
        <TextInput
          style={styles.searchInput}
          value={confirmDdiSearch}
          onChangeText={setConfirmDdiSearch}
          placeholder="Buscar país..."
          placeholderTextColor="#AAA"
          autoCorrect={false}
        />
        <FlatList
          data={filteredConfirmDdi}
          keyExtractor={p => p.codigo}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.ddiItem, item.codigo === confirmPais.codigo && styles.ddiItemSelected]}
              onPress={() => setConfirmPais(item)}
            >
              <Text style={styles.ddiItemText}>{item.bandeira}  {item.nome}</Text>
              <Text style={styles.ddiItemCode}>+{item.codigo}</Text>
            </TouchableOpacity>
          )}
        />
        {confirmPais.codigo === '55' &&
          pendingContact &&
          pendingContact.rawNumber.replace(/\D/g, '').length < 10 && (
          <View style={{ marginTop: 12 }}>
            <Text style={[styles.label, { marginTop: 0, marginBottom: 6 }]}>
              DDD <Text style={{ color: '#C4687A' }}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={confirmDdd}
              onChangeText={setConfirmDdd}
              keyboardType="number-pad"
              placeholder="Ex: 11"
              placeholderTextColor="#BBB"
              maxLength={2}
            />
          </View>
        )}

        <TouchableOpacity style={[styles.button, { marginTop: 16 }]} onPress={handleConfirmDdi}>
          <Text style={styles.buttonText}>Confirmar</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setConfirmDdiModalVisible(false)}>
          <Text style={styles.clearText}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>


  {/* ── MODAL EDITAR ── */}
  <Modal visible={modalVisible} transparent animationType="slide">
    <View style={styles.modalOverlay}>
      <View style={styles.modal}>
        <Text style={styles.modalTitle}>Editar contato</Text>

        <Text style={styles.label}>Nome</Text>
        <TextInput
          style={styles.input}
          value={editingContact?.nome || ''}
          onChangeText={t => setEditingContact({ ...editingContact, nome: t })}
        />

        <Text style={styles.label}>Telefone</Text>
        <TextInput
          style={styles.input}
          value={editingContact?.telefone || ''}
          onChangeText={t => setEditingContact({ ...editingContact, telefone: t })}
          keyboardType="phone-pad"
        />

        <Text style={styles.label}>Relação</Text>
        <TextInput
          style={styles.input}
          value={editingContact?.relacao || ''}
          onChangeText={t => setEditingContact({ ...editingContact, relacao: t })}
        />

        <TouchableOpacity style={styles.button} onPress={handleSaveEdit}>
          <Text style={styles.buttonText}>Salvar</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setModalVisible(false)}>
          <Text style={styles.clearText}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>

</ScrollView>
</SafeAreaView>
)
}

const styles = StyleSheet.create({

container: { flex: 1, backgroundColor: '#F5EFE6' },

back: { color: '#1B3A6B', marginBottom: 10 },

title: { fontSize: 30, fontWeight: 'bold', color: '#1B3A6B' },

subtitle: { color: '#5A8FAF', marginBottom: 20 },

card: { backgroundColor: '#FFF', padding: 20, borderRadius: 20, marginBottom: 20, elevation: 2, shadowColor: '#1B3A6B', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8 },

label: { marginTop: 10, color: '#5A8FAF', fontSize: 16 },

input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 12, padding: 14, marginTop: 5 },

phoneRow: { flexDirection: 'row', gap: 8, marginTop: 5 },

ddiButton: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
  borderWidth: 1,
  borderColor: '#DDD',
  borderRadius: 12,
  paddingHorizontal: 12,
  paddingVertical: 14,
  backgroundColor: '#F9F9F9'
},

ddiButtonText: { fontSize: 15, color: '#333', fontWeight: '600' },

ddiChevron: { fontSize: 12, color: '#999' },

phoneInput: {
  flex: 1,
  borderWidth: 1,
  borderColor: '#DDD',
  borderRadius: 12,
  padding: 14,
  fontSize: 15
},

selectButton: { backgroundColor: '#C4687A', padding: 16, borderRadius: 14, marginTop: 25, alignItems: 'center' },

button: { backgroundColor: '#1B3A6B', padding: 16, borderRadius: 14, marginTop: 14, alignItems: 'center' },

selectButtonText: { color: '#FFF', fontWeight: 'bold' },

buttonText: { color: '#FFF', fontWeight: 'bold' },

clearText: { textAlign: 'center', marginTop: 14, color: '#999' },

contact: { backgroundColor: '#FDEAEC', padding: 15, borderRadius: 15, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between' },

name: { fontWeight: 'bold', fontSize: 18 },

phone: { color: '#666' },

relacao: { color: '#1B3A6B' },

actions: { flexDirection: 'row', gap: 15 },

icon: { fontSize: 22 },

searchInput: { backgroundColor: '#FFF', borderRadius: 14, padding: 14, fontSize: 16, marginBottom: 12, borderWidth: 1, borderColor: '#DDD' },

emptySearch: { textAlign: 'center', color: '#999', marginTop: 30, fontSize: 16 },

phoneCard: { backgroundColor: '#FFF', padding: 20, borderRadius: 20, marginBottom: 14 },

phoneName: { fontWeight: 'bold', fontSize: 18 },

phoneNumber: { marginTop: 5, color: '#666' },

modalOverlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'center' },

modal: { backgroundColor: '#FFF', margin: 20, borderRadius: 20, padding: 20 },

modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },

confirmHint: { fontSize: 14, color: '#555', marginBottom: 12, lineHeight: 20 },

ddiItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },

ddiItemSelected: { backgroundColor: '#D4E9F7' },

ddiItemText: { fontSize: 16, color: '#333' },

ddiItemCode: { fontSize: 15, color: '#1B3A6B', fontWeight: '700' },

})
