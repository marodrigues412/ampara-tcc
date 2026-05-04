import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../services/supabase'

export default function EmergencyContacts({ navigation }) {
  const [contatos, setContatos] = useState([])
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [relacao, setRelacao] = useState('')
  const [userId, setUserId] = useState(null)

  const [editingContact, setEditingContact] = useState(null)
  const [modalVisible, setModalVisible] = useState(false)

  const MAX_CONTATOS = 3
  const restante = MAX_CONTATOS - contatos.length

  const textoInfo =
    restante === 0
      ? 'Você já adicionou o máximo de contatos'
      : restante === 1
      ? 'Você pode adicionar mais 1 contato'
      : `Você pode adicionar mais ${restante} contatos`

  useEffect(() => {
    loadUser()
  }, [])

  const loadUser = async () => {
    const { data } = await supabase.auth.getUser()
    if (data?.user) {
      setUserId(data.user.id)
      loadContacts(data.user.id)
    }
  }

  const loadContacts = async (id) => {
    const { data } = await supabase
      .from('emergency_contacts')
      .select('*')
      .eq('user_id', id)

    setContatos(data || [])
  }

  const validarTelefone = (tel) => {
    const cleaned = tel.replace(/\D/g, '')
    return cleaned.length >= 10 && cleaned.length <= 11
  }

  const handleAdd = async () => {
    if (!nome || !telefone) {
      Alert.alert('Erro', 'Preencha nome e telefone')
      return
    }

    if (!validarTelefone(telefone)) {
      Alert.alert('Erro', 'Telefone inválido')
      return
    }

    if (contatos.length >= MAX_CONTATOS) {
      Alert.alert('Limite atingido', 'Você já adicionou o máximo de contatos')
      return
    }

    const { error } = await supabase.from('emergency_contacts').insert({
      user_id: userId,
      nome,
      telefone,
      relacao
    })

    if (error) {
      Alert.alert('Erro', error.message)
      return
    }

    setNome('')
    setTelefone('')
    setRelacao('')
    loadContacts(userId)
  }

  const handleDelete = async (id) => {
    await supabase.from('emergency_contacts').delete().eq('id', id)
    loadContacts(userId)
  }

  const openEditModal = (contact) => {
    setEditingContact(contact)
    setModalVisible(true)
  }

  const handleSaveEdit = async () => {
    if (!validarTelefone(editingContact.telefone)) {
      Alert.alert('Erro', 'Telefone inválido')
      return
    }

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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5EFEA' }}>
      <ScrollView contentContainerStyle={styles.container}>
        
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Voltar</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Contatos de Emergência</Text>
        <Text style={styles.subtitle}>{textoInfo}</Text>

        {/* FORM */}
        <View style={styles.card}>
          <Text style={styles.label}>Nome</Text>
          <TextInput
            style={styles.input}
            value={nome}
            onChangeText={setNome}
          />

          <Text style={styles.label}>Telefone</Text>
          <TextInput
            style={styles.input}
            value={telefone}
            onChangeText={setTelefone}
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>Relação</Text>
          <TextInput
            style={styles.input}
            value={relacao}
            onChangeText={setRelacao}
            placeholder="Ex: mãe, amigo..."
          />

          <TouchableOpacity
            style={[
              styles.button,
              contatos.length >= MAX_CONTATOS && { opacity: 0.5 }
            ]}
            onPress={handleAdd}
            disabled={contatos.length >= MAX_CONTATOS}
          >
            <Text style={styles.buttonText}>Adicionar</Text>
          </TouchableOpacity>
        </View>

        {/* ESTADO VAZIO */}
        {contatos.length === 0 && (
          <Text style={styles.empty}>
            Você ainda não adicionou contatos de emergência
          </Text>
        )}

        {/* LISTA */}
        {contatos.map((item) => (
          <View key={item.id} style={styles.contact}>
            <View>
              <Text style={styles.name}>{item.nome}</Text>
              <Text style={styles.phone}>{item.telefone}</Text>
              {item.relacao && (
                <Text style={styles.relacao}>{item.relacao}</Text>
              )}
            </View>

            <View style={styles.actions}>
              <TouchableOpacity onPress={() => openEditModal(item)}>
                <Text style={styles.icon}>✏️</Text>
              </TouchableOpacity>

              <View style={styles.divider} />

              <TouchableOpacity onPress={() => handleDelete(item.id)}>
                <Text style={styles.icon}>🗑️</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {/* MODAL */}
        <Modal visible={modalVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>Editar contato</Text>

              <Text style={styles.label}>Nome</Text>
              <TextInput
                style={styles.input}
                value={editingContact?.nome}
                onChangeText={(text) =>
                  setEditingContact({ ...editingContact, nome: text })
                }
              />

              <Text style={styles.label}>Telefone</Text>
              <TextInput
                style={styles.input}
                value={editingContact?.telefone}
                onChangeText={(text) =>
                  setEditingContact({ ...editingContact, telefone: text })
                }
              />

              <Text style={styles.label}>Relação</Text>
              <TextInput
                style={styles.input}
                value={editingContact?.relacao}
                onChangeText={(text) =>
                  setEditingContact({ ...editingContact, relacao: text })
                }
              />

              <TouchableOpacity style={styles.button} onPress={handleSaveEdit}>
                <Text style={styles.buttonText}>Salvar</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.cancel}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { padding: 20 },

  back: { color: '#025382', marginBottom: 10 },

  title: { fontSize: 30, fontWeight: 'bold', color: '#025382' },

  subtitle: { color: '#3A7FA6', marginBottom: 20 },

  card: {
    backgroundColor: '#FFF',
    padding: 20,
    borderRadius: 20,
    marginBottom: 20
  },

  label: { marginTop: 10, color: '#3A7FA6' },

  input: {
    borderWidth: 1,
    borderColor: '#E1D7D2',
    borderRadius: 12,
    padding: 12,
    marginTop: 5
  },

  button: {
    backgroundColor: '#025382',
    padding: 14,
    borderRadius: 12,
    marginTop: 15,
    alignItems: 'center'
  },

  buttonText: { color: '#FFF', fontWeight: 'bold' },

  empty: { textAlign: 'center', color: '#999', marginTop: 20 },

  contact: {
    backgroundColor: '#FFF',
    padding: 15,
    borderRadius: 15,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },

  name: { fontWeight: 'bold', fontSize: 16 },
  phone: { color: '#666' },
  relacao: { color: '#3A7FA6' },

  actions: { flexDirection: 'row', alignItems: 'center' },
  icon: { fontSize: 18, marginHorizontal: 8 },

  divider: {
    width: 1,
    height: 20,
    backgroundColor: '#CCC'
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: '#00000066',
    justifyContent: 'center'
  },

  modal: {
    backgroundColor: '#FFF',
    margin: 20,
    borderRadius: 20,
    padding: 20
  },

  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },

  cancel: { textAlign: 'center', marginTop: 10, color: '#999' }
})