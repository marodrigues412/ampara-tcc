import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, KeyboardAvoidingView,
  Platform, ScrollView, Image
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { ActivityIndicator } from 'react-native'
import { supabase } from '../services/supabase'
import { entrarComProvedor } from '../services/authService'
import RegisterScreen from './RegisterScreen'

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isRegistering, setIsRegistering] = useState(false)
  const [provedorCarregando, setProvedorCarregando] = useState(null)

  const handleLogin = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) Alert.alert('Erro', error.message)
    else onLogin(data.session)
  }

  const handleProvedor = async (provider) => {
    setProvedorCarregando(provider)
    try {
      const sessao = await entrarComProvedor(provider)
      if (sessao) onLogin(sessao)
    } catch (error) {
      Alert.alert('Não foi possível entrar', error.message)
    } finally {
      setProvedorCarregando(null)
    }
  }

  if (isRegistering) {
    return <RegisterScreen onBack={() => setIsRegistering(false)} />
  }

  return (
    <View style={styles.root}>
      <View style={styles.bgNavy} />
      <View style={styles.bgRose} />

      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandArea}>
            <Image
              source={require('../assets/images/maos-ampara-azul.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.brand}>Ampara</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Entrar</Text>

            <TextInput
              placeholder="E-mail"
              placeholderTextColor="#AAA"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <TextInput
              placeholder="Senha"
              placeholderTextColor="#AAA"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              style={styles.input}
            />

            <TouchableOpacity style={styles.button} onPress={handleLogin}>
              <Text style={styles.buttonText}>Entrar</Text>
            </TouchableOpacity>

            {/* O botão da Apple foi removido: o provedor exige o Apple Developer Program
                (US$ 99/ano), e um botão que só devolve erro é pior do que não existir. Para
                voltar, é só reativar o provedor no Supabase e chamar handleProvedor('apple') —
                o authService já é genérico. */}
            <View style={styles.divisorRow}>
              <View style={styles.divisorLinha} />
              <Text style={styles.divisorTexto}>ou entre com</Text>
              <View style={styles.divisorLinha} />
            </View>

            <TouchableOpacity
              style={[styles.provedorBtn, styles.provedorGoogle]}
              onPress={() => handleProvedor('google')}
              disabled={provedorCarregando !== null}
            >
              {provedorCarregando === 'google'
                ? <ActivityIndicator size="small" color="#1B3A6B" />
                : <>
                    <Ionicons name="logo-google" size={18} color="#1B3A6B" />
                    <Text style={styles.provedorTextoGoogle}>Google</Text>
                  </>}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setIsRegistering(true)} style={styles.registerRow}>
              <Text style={styles.registerText}>
                Ainda não tem uma conta?{' '}
                <Text style={styles.registerLink}>Cadastre-se aqui</Text>
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.navyFill} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  bgNavy: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: '#1B3A6B',
  },
  bgRose: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: '48%',
    backgroundColor: '#C4687A',
    borderBottomLeftRadius: 48,
    borderBottomRightRadius: 48,
  },

  kav: { flex: 1 },
  scroll: { flexGrow: 1 },

  brandArea: {
    alignItems: 'center',
    paddingTop: 72,
    paddingBottom: 28,
  },
  logo: {
    width: 72,
    height: 72,
    marginBottom: 10,
  },
  brand: {
    fontSize: 44,
    fontWeight: '200',
    color: '#FFF',
    letterSpacing: 4,
  },

  card: {
    marginHorizontal: 24,
    backgroundColor: '#FFF',
    borderRadius: 32,
    paddingHorizontal: 28,
    paddingVertical: 32,
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1B3A6B',
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#DDE8F0',
    borderRadius: 30,
    paddingVertical: 13,
    paddingHorizontal: 20,
    fontSize: 15,
    marginBottom: 12,
    color: '#333',
  },
  button: {
    backgroundColor: '#1B3A6B',
    paddingVertical: 15,
    borderRadius: 30,
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  buttonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 16,
    letterSpacing: 0.8,
  },
  divisorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  divisorLinha: { flex: 1, height: 1, backgroundColor: '#E8E0D8' },
  divisorTexto: { color: '#999', fontSize: 12 },
  provedorBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 48, borderRadius: 30, marginBottom: 10 },
  provedorGoogle: { backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#DDE8F0' },
  provedorTextoGoogle: { color: '#1B3A6B', fontWeight: '600', fontSize: 15 },

  registerRow: { alignItems: 'center', marginTop: 10 },
  registerText: { color: '#999', fontSize: 13, textAlign: 'center' },
  registerLink: { color: '#C4687A', fontWeight: '600' },

  navyFill: { flex: 1, minHeight: 60 },
})
