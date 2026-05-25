import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
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
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="chevron-back" size={20} color="#1B3A6B" />
          <Text style={{ fontSize: 16, color: '#1B3A6B', fontWeight: '600' }}>Voltar</Text>
        </TouchableOpacity>
        <Image source={require('../assets/images/maos-ampara-rosa.png')} style={{ width: 36, height: 36 }} resizeMode="contain" />
      </View>

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
    backgroundColor: '#F5EFE6'
  },

  content: {
    padding: 20,
    paddingTop: 60
  },

  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1B3A6B',
    marginBottom: 20
  },

  card: {
    backgroundColor: '#FFF',
    padding: 20,
    borderRadius: 20,
    elevation: 2,
    shadowColor: '#1B3A6B',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
  },

  label: {
    color: '#5A8FAF',
    fontWeight: '600',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 5,
  },

  input: {
    borderWidth: 1,
    borderColor: '#E8E0DA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 15,
    fontSize: 15,
    color: '#222',
    backgroundColor: '#FAFAFA',
  },

  email: {
    fontSize: 16,
    color: '#555',
    marginBottom: 20
  },

  saveButton: {
    backgroundColor: '#C4687A',
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
    color: '#5A8FAF'
  }
})