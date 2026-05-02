import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { supabase } from '../services/supabase'
import RegisterScreen from './RegisterScreen'

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isRegistering, setIsRegistering] = useState(false)

  const handleLogin = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      Alert.alert('Erro', error.message)
    } else {
      onLogin(data.session)
    }
  }

    const handleSignUp = async () => {
    const { error } = await supabase.auth.signUp({
        email,
        password,
    })

    if (error) {
        Alert.alert('Erro', error.message)
    } else {
        await supabase.auth.signOut()
        Alert.alert('Conta criada!', 'Agora faça login')
    }
    }

    if (isRegistering) {
    return <RegisterScreen onBack={() => setIsRegistering(false)} />
    }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ampara</Text>

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

      <TouchableOpacity style={styles.button} onPress={handleLogin}>
        <Text style={styles.buttonText}>Entrar</Text>
      </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsRegistering(true)}>
            <Text style={styles.link}>Criar conta</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  title: { fontSize: 32, fontWeight: 'bold', marginBottom: 30, textAlign: 'center', color: '#6b2b38' },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 15, marginBottom: 15, borderRadius: 10 },
  button: { backgroundColor: '#6B2B38', padding: 15, borderRadius: 10 },
  buttonText: { color: '#fff', textAlign: 'center', fontWeight: 'bold' },
  link: { marginTop: 15, textAlign: 'center', color: '#6b2b38' }
})