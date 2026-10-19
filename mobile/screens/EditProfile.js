import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView
} from 'react-native'
import { supabase } from '../services/supabase'
import { Brand, TemaDaAba, CremeDoSite } from '../constants/brandTheme'
import HeaderComCurvas from '../components/HeaderComCurvas'

// Cores da seção de onde a tela é aberta.
const TEMA = TemaDaAba.Perfil

export default function EditProfile({ navigation }) {
  const [user, setUser] = useState(null)
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const { data: userData } = await supabase.auth.getUser()
    const currentUser = userData.user
    setUser(currentUser)

    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', currentUser.id)
      .single()

    if (data) {
      setNome(data.nome || '')
      setTelefone(data.telefone || '')
    }
  }

  const handleSave = async () => {
    if (!nome.trim()) {
      Alert.alert('Erro', 'O nome não pode ficar vazio')
      return
    }

    setLoading(true)

    const { error } = await supabase
      .from('user_profiles')
      .update({
        nome: nome.trim(),
        telefone: telefone.trim()
      })
      .eq('id', user.id)

    setLoading(false)

    if (error) {
      Alert.alert('Erro', error.message)
      return
    }

    Alert.alert('Sucesso', 'Perfil atualizado!')
    navigation.goBack()
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <HeaderComCurvas
        aba="Perfil"
        onVoltar={() => navigation.goBack()}
        titulo="Editar perfil"
        style={styles.header}
      />

      <View style={styles.card}>
        <Text style={styles.label}>Nome</Text>
        <TextInput
          value={nome}
          onChangeText={setNome}
          style={styles.input}
        />

        <Text style={styles.label}>Telefone</Text>
        <TextInput
          value={telefone}
          onChangeText={setTelefone}
          style={styles.input}
          keyboardType="phone-pad"
        />

        {/* EMAIL FIXO */}
        <Text style={styles.label}>Email</Text>
        <Text style={styles.email}>{user?.email}</Text>

        {/* BOTÕES */}
        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSave}
        >
          <Text style={styles.saveText}>
            {loading ? 'Salvando...' : 'Salvar'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.cancelText}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CremeDoSite
  },

  header: { marginHorizontal: -20, marginTop: -60, marginBottom: 20 },

  content: {
    padding: 20,
    paddingTop: 60
  },

  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: TEMA.forte,
    marginBottom: 20
  },

  // Formulário solto na tela, sem caixa em volta.
  card: {
    paddingVertical: 4,
  },

  label: {
    color: TEMA.forte,
    fontWeight: '600',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 5,
  },

  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 12,
    marginBottom: 15,
    fontSize: 15,
    color: '#222',
  },

  email: {
    fontSize: 16,
    color: '#555',
    marginBottom: 20
  },

  saveButton: {
    backgroundColor: TEMA.forte,
    padding: 15,
    borderRadius: 20,
    alignItems: 'center'
  },

  saveText: {
    color: '#FFF',
    fontWeight: 'bold'
  },

  cancelButton: {
    marginTop: 10,
    alignItems: 'center'
  },

  cancelText: {
    color: TEMA.forte
  }
})
