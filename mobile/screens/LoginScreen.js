import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, KeyboardAvoidingView,
  Platform, ScrollView, Image, ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../services/supabase'
import { entrarComProvedor, pedirNovaSenha } from '../services/authService'
import { Brand, CremeDoSite, FonteDaLia, TemaDaAba } from '../constants/brandTheme'
import HeaderComCurvas from '../components/HeaderComCurvas'
import PopupAmpara from '../components/PopupAmpara'
import RegisterScreen from './RegisterScreen'

const TEMA = TemaDaAba.Entrada

// comecarNoCadastro: vindo de "Criar minha conta" na boas-vindas, abre direto o cadastro.
export default function LoginScreen({ onLogin, comecarNoCadastro = false }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [isRegistering, setIsRegistering] = useState(comecarNoCadastro)
  const [provedorCarregando, setProvedorCarregando] = useState(null)
  const [entrando, setEntrando] = useState(false)
  // "Esqueci minha senha": null (fechado), 'pedir' ou 'enviado'.
  const [recuperacao, setRecuperacao] = useState(null)
  const [emailRecuperacao, setEmailRecuperacao] = useState('')
  const [enviando, setEnviando] = useState(false)

  const handleLogin = async () => {
    setEntrando(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setEntrando(false)
    if (error) Alert.alert('Não foi possível entrar', error.message)
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

  const abrirRecuperacao = () => {
    setEmailRecuperacao(email)
    setRecuperacao('pedir')
  }

  const enviarRecuperacao = async () => {
    if (!emailRecuperacao.trim()) { Alert.alert('Falta o e-mail', 'Digite o e-mail da sua conta.'); return }
    setEnviando(true)
    try {
      await pedirNovaSenha(emailRecuperacao)
      setRecuperacao('enviado')
    } catch (error) {
      Alert.alert('Não foi possível enviar', error.message)
    } finally {
      setEnviando(false)
    }
  }

  if (isRegistering) {
    return <RegisterScreen onBack={() => setIsRegistering(false)} />
  }

  // No Android, sem KeyboardAvoidingView: com ele o app fechava ao digitar com o
  // teclado aberto (correção da Maria). O ScrollView já sobe o campo sozinho.
  const conteudo = (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" bounces={false} showsVerticalScrollIndicator={false}>
      <HeaderComCurvas aba="Entrada" semMarca style={styles.hero}>
        <Image source={require('../assets/images/maos-ampara-azul.png')} style={styles.logo} resizeMode="contain" accessibilityIgnoresInvertColors />
        <Text style={styles.brand}>Ampara</Text>
        <Text style={styles.lema}>Que bom te ver de novo</Text>
      </HeaderComCurvas>

      <View style={styles.form}>
        {/* O botão da Apple foi removido: o provedor exige o Apple Developer Program
            (US$ 99/ano), e um botão que só devolve erro é pior do que não existir. Para
            voltar, é só reativar o provedor no Supabase e chamar handleProvedor('apple') —
            o authService já é genérico. */}
        <TouchableOpacity
          style={styles.google}
          onPress={() => handleProvedor('google')}
          disabled={provedorCarregando !== null}
          accessibilityRole="button"
        >
          {provedorCarregando === 'google'
            ? <ActivityIndicator size="small" color={TEMA.forte} />
            : <>
                <Ionicons name="logo-google" size={18} color={TEMA.forte} />
                <Text style={styles.googleTexto}>Continuar com Google</Text>
              </>}
        </TouchableOpacity>

        <Text style={styles.ou}>ou com seu e-mail</Text>

        <TextInput
          placeholder="E-mail"
          placeholderTextColor="#A69CA2"
          value={email}
          onChangeText={setEmail}
          style={styles.input}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <View style={styles.campoSenha}>
          <TextInput
            placeholder="Senha"
            placeholderTextColor="#A69CA2"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!mostrarSenha}
            style={styles.inputSenha}
            autoComplete="password"
          />
          <TouchableOpacity onPress={() => setMostrarSenha((m) => !m)} hitSlop={10} accessibilityRole="button" accessibilityLabel={mostrarSenha ? 'Esconder senha' : 'Mostrar senha'}>
            <Ionicons name={mostrarSenha ? 'eye-off-outline' : 'eye-outline'} size={20} color={TEMA.forte} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={abrirRecuperacao} style={styles.esqueci} accessibilityRole="button">
          <Text style={styles.esqueciTexto}>Esqueci minha senha</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={entrando} accessibilityRole="button">
          {entrando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Entrar</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsRegistering(true)} style={styles.registerRow} accessibilityRole="button">
          <Text style={styles.registerText}>
            Ainda não tem uma conta? <Text style={styles.registerLink}>Cadastre-se</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )

  return (
    <View style={styles.root}>
      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView style={styles.kav} behavior="padding">
          {conteudo}
        </KeyboardAvoidingView>
      ) : conteudo}

      <PopupAmpara
        aba="Entrada"
        visible={recuperacao !== null}
        onClose={() => setRecuperacao(null)}
        icone={recuperacao === 'enviado' ? 'mail-open-outline' : 'key-outline'}
        titulo={recuperacao === 'enviado' ? 'Confira seu e-mail' : 'Esqueci minha senha'}
        subtitulo={recuperacao === 'enviado' ? emailRecuperacao.trim() : 'Mandamos um link para você criar uma senha nova.'}
        acoes={recuperacao === 'enviado'
          ? [{ texto: 'Entendi', principal: true, onPress: () => setRecuperacao(null) }]
          : [
              { texto: 'Cancelar', onPress: () => setRecuperacao(null) },
              { texto: enviando ? 'Enviando…' : 'Enviar link', principal: true, onPress: enviando ? () => {} : enviarRecuperacao },
            ]}
      >
        {recuperacao === 'enviado' ? (
          <Text style={styles.popupTexto}>
            Abra o e-mail neste celular e toque no link. O Ampara abre na tela para criar a senha nova. Se não achar, olhe a caixa de spam.
          </Text>
        ) : (
          <TextInput
            placeholder="E-mail da sua conta"
            placeholderTextColor="#A69CA2"
            value={emailRecuperacao}
            onChangeText={setEmailRecuperacao}
            style={[styles.input, styles.inputPopup]}
            keyboardType="email-address"
            autoCapitalize="none"
            autoFocus
          />
        )}
      </PopupAmpara>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: CremeDoSite },
  kav: { flex: 1 },
  scroll: { flexGrow: 1, paddingBottom: 32 },

  hero: { alignItems: 'center', paddingTop: 50, paddingBottom: 28, marginBottom: 10 },
  logo: { width: 70, height: 70, marginBottom: 6 },
  brand: { fontSize: 34, fontWeight: '800', color: '#273963' },
  lema: { fontFamily: FonteDaLia, fontSize: 18, color: TEMA.forte, marginTop: 4 },

  form: { marginHorizontal: 24, gap: 12 },
  google: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 52, borderRadius: 28, backgroundColor: '#FFFFFF' },
  googleTexto: { color: Brand.ink, fontWeight: '600', fontSize: 15 },
  ou: { textAlign: 'center', color: '#8A8590', fontSize: 13, marginVertical: 4 },
  input: { backgroundColor: '#FFFFFF', borderRadius: 22, paddingVertical: 14, paddingHorizontal: 18, fontSize: 15, color: Brand.ink },
  campoSenha: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 22, paddingHorizontal: 18 },
  inputSenha: { flex: 1, paddingVertical: 14, fontSize: 15, color: Brand.ink },
  esqueci: { alignSelf: 'flex-end', paddingVertical: 2 },
  esqueciTexto: { color: TEMA.forte, fontWeight: '700', fontSize: 14 },
  button: { backgroundColor: TEMA.forte, paddingVertical: 16, borderRadius: 28, alignItems: 'center', marginTop: 4 },
  buttonText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  registerRow: { alignItems: 'center', marginTop: 8 },
  registerText: { color: '#776C73', fontSize: 14, textAlign: 'center' },
  registerLink: { color: TEMA.forte, fontWeight: '700' },

  popupTexto: { fontSize: 14, color: '#5E5259', lineHeight: 21, paddingVertical: 4 },
  inputPopup: { backgroundColor: '#F7F4F5', marginVertical: 6 },
})
