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
import { Brand } from '../constants/brandTheme'
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
                ? <ActivityIndicator size="small" color={Brand.roseDeep} />
                : <>
                    <Ionicons name="logo-google" size={18} color={Brand.roseDeep} />
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
  root: { flex: 1, backgroundColor: Brand.canvas },
  kav: { flex: 1 },
  scroll: { flexGrow: 1 },

  brandArea: {
    alignItems: 'center',
    paddingTop: 54,
    paddingBottom: 34,
  },
  logo: {
    width: 66,
    height: 66,
    marginBottom: 10,
  },
  brand: {
    fontSize: 36,
    fontWeight: '700',
    color: Brand.roseDeep,
  },

  card: {
    marginHorizontal: 24,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Brand.ink,
    textAlign: 'left',
    marginBottom: 28,
  },
  input: {
    borderBottomWidth: 1,
    borderColor: '#D8C5CC',
    borderRadius: 0,
    paddingVertical: 14,
    paddingHorizontal: 2,
    fontSize: 15,
    marginBottom: 12,
    color: Brand.ink,
  },
  button: {
    backgroundColor: Brand.rose,
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  buttonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 16,
  },
  divisorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  divisorLinha: { flex: 1, height: 1, backgroundColor: '#E8E0D8' },
  divisorTexto: { color: '#999', fontSize: 12 },
  provedorBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 48, borderRadius: 8, marginBottom: 10 },
  provedorGoogle: { backgroundColor: 'transparent', borderBottomWidth: 1, borderColor: Brand.line },
  provedorTextoGoogle: { color: Brand.ink, fontWeight: '600', fontSize: 15 },

  registerRow: { alignItems: 'center', marginTop: 10 },
  registerText: { color: '#999', fontSize: 13, textAlign: 'center' },
  registerLink: { color: Brand.roseDeep, fontWeight: '600' },

  navyFill: { flex: 1, minHeight: 60 },
})
