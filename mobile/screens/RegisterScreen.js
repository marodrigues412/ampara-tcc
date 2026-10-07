import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, KeyboardAvoidingView,
  Platform, ScrollView, Image
} from 'react-native'
import { supabase } from '../services/supabase'
import { Brand } from '../constants/brandTheme'

export default function RegisterScreen({ onBack }) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const createAccount = async (wantsSmartwatch) => {
    if (!nome || !email || !password) {
      Alert.alert('Erro', 'Preencha todos os campos')
      return
    }
    setIsSubmitting(true)
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { nome: nome.trim(), smartwatch_monitoring_opt_in: wantsSmartwatch },
        },
      })
      if (error) { Alert.alert('Erro', error.message); return }
      const userId = data.user?.id
      if (userId) {
        const { error: insertError } = await supabase.from('user_profiles').insert([{ id: userId, nome: nome.trim() }])
        console.log('INSERT ERROR:', insertError)
      }
      await supabase.auth.signOut()
      const message = Platform.OS === 'ios' && wantsSmartwatch
        ? 'Sua conta foi criada. A conexão direta com o Galaxy Watch está disponível no Android; no iPhone, você pode continuar usando o Ampara sem essa leitura.'
        : 'Agora faça login'
      Alert.alert('Conta criada!', message)
      onBack()
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRegister = () => {
    if (!nome || !email || !password) {
      Alert.alert('Erro', 'Preencha todos os campos')
      return
    }
    if (Platform.OS === 'ios') {
      Alert.alert(
        'Ampara no iPhone',
        'A conexão com smartwatch não está disponível no iPhone. Você ainda pode usar o Ampara normalmente, com localização, movimento e alertas do celular.',
        [
          { text: 'Voltar', style: 'cancel' },
          { text: 'Criar conta', onPress: () => createAccount(false) },
        ],
        { cancelable: false },
      )
      return
    }
    Alert.alert(
      'Você quer usar um smartwatch?',
      'No Android, o Ampara pode receber os batimentos do Galaxy Watch. Se escolher sim, avisaremos com destaque quando o app não estiver recebendo batimentos.',
      [
        { text: 'Agora não', style: 'cancel', onPress: () => createAccount(false) },
        { text: 'Sim, quero', onPress: () => createAccount(true) },
      ],
      { cancelable: false },
    )
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
            <Text style={styles.cardTitle}>Cadastro</Text>

            <TextInput
              placeholder="Nome Completo"
              placeholderTextColor="#AAA"
              value={nome}
              onChangeText={setNome}
              style={styles.input}
            />
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

            <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={isSubmitting}>
              <Text style={styles.buttonText}>{isSubmitting ? 'Criando conta...' : 'Cadastrar'}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={onBack} style={styles.backRow}>
              <Text style={styles.backText}>
                Já tem uma conta?{' '}
                <Text style={styles.backLink}>Entrar aqui</Text>
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
  backRow: { alignItems: 'center' },
  backText: { color: '#999', fontSize: 13, textAlign: 'center' },
  backLink: { color: Brand.roseDeep, fontWeight: '600' },

  navyFill: { flex: 1, minHeight: 60 },
})
