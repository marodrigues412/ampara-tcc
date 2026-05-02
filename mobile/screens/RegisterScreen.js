import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { supabase } from '../services/supabase'

export default function RegisterScreen({ onBack }) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleRegister = async () => {
    if (!nome || !email || !password) {
      Alert.alert('Erro', 'Preencha todos os campos')
      return
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      Alert.alert('Erro', error.message)
      return
    }

    // 👇 ID correto
    const userId = data.user?.id

    if (userId) {
      const { error: insertError } = await supabase
        .from('user_profiles')
        .insert([
          {
            id: userId,
            nome: nome,
          },
        ])

      console.log('INSERT ERROR:', insertError)
    }

    await supabase.auth.signOut()
    Alert.alert('Conta criada!', 'Agora faça login')
    onBack()
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Criar conta</Text>

      <TextInput
        placeholder="Nome"
        value={nome}
        onChangeText={setNome}
        style={styles.input}
      />

      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
      />

      <TextInput
        placeholder="Senha"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={styles.input}
      />

      <TouchableOpacity style={styles.button} onPress={handleRegister}>
        <Text style={styles.buttonText}>Cadastrar</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onBack}>
        <Text style={styles.link}>Voltar para login</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 30,
    textAlign: 'center',
    color: '#6b2b38'
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 15,
    marginBottom: 15,
    borderRadius: 10
  },
  button: {
    backgroundColor: '#6B2B38',
    padding: 15,
    borderRadius: 10
  },
  buttonText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: 'bold'
  },
  link: {
    marginTop: 15,
    textAlign: 'center',
    color: '#6b2b38'
  }
})