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
      <Text style={styles.title}>Editar Perfil</Text>

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
    backgroundColor: '#F5EFEA'
  },

  content: {
    padding: 20,
    paddingTop: 60
  },

  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#6B2B38',
    marginBottom: 20
  },

  card: {
    backgroundColor: '#FFF',
    padding: 20,
    borderRadius: 20
  },

  label: {
    color: '#9C6873',
    marginBottom: 5
  },

  input: {
    borderWidth: 1,
    borderColor: '#E1D7D2',
    borderRadius: 12,
    padding: 12,
    marginBottom: 15
  },

  email: {
    fontSize: 16,
    color: '#555',
    marginBottom: 20
  },

  saveButton: {
    backgroundColor: '#6B2B38',
    padding: 15,
    borderRadius: 12,
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
    color: '#9C6873'
  }
})