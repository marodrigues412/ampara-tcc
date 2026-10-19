import React, { useState } from 'react'
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import HeaderComCurvas from '../components/HeaderComCurvas'
import { supabase } from '../services/supabase'
import { Brand, CremeDoSite, TemaDaAba } from '../constants/brandTheme'

const TEMA = TemaDaAba.Entrada
const MINIMO = 6

// Aberta pelo link de "Esqueci minha senha" do e-mail. A sessão de recuperação já foi
// aberta pelo App.js com os dados do link; aqui ela só escolhe a senha nova.
export default function NovaSenha({ onConcluir }) {
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const salvar = async () => {
    if (senha.length < MINIMO) { Alert.alert('Senha curta', `Use pelo menos ${MINIMO} caracteres.`); return }
    if (senha !== confirmacao) { Alert.alert('Senhas diferentes', 'Digite a mesma senha nos dois campos.'); return }
    setSalvando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setSalvando(false)
    if (error) { Alert.alert('Não foi possível trocar a senha', error.message); return }
    Alert.alert('Senha trocada', 'Pronto, você já está dentro do app.')
    onConcluir()
  }

  return (
    <KeyboardAvoidingView style={styles.tela} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <HeaderComCurvas aba="Entrada" titulo="Crie uma senha nova" subtitulo="Ela vale a partir de agora para entrar no Ampara." />
      <View style={styles.corpo}>
        <View style={styles.campo}>
          <TextInput
            value={senha}
            onChangeText={setSenha}
            placeholder="Senha nova"
            placeholderTextColor="#A69CA2"
            secureTextEntry={!mostrar}
            style={styles.input}
            autoFocus
          />
          <TouchableOpacity onPress={() => setMostrar((m) => !m)} hitSlop={10} accessibilityRole="button" accessibilityLabel={mostrar ? 'Esconder senha' : 'Mostrar senha'}>
            <Ionicons name={mostrar ? 'eye-off-outline' : 'eye-outline'} size={20} color={TEMA.forte} />
          </TouchableOpacity>
        </View>
        <View style={styles.campo}>
          <TextInput
            value={confirmacao}
            onChangeText={setConfirmacao}
            placeholder="Repita a senha nova"
            placeholderTextColor="#A69CA2"
            secureTextEntry={!mostrar}
            style={styles.input}
          />
        </View>
        <Text style={styles.dica}>Pelo menos {MINIMO} caracteres.</Text>
        <TouchableOpacity style={styles.botao} onPress={salvar} disabled={salvando} accessibilityRole="button">
          {salvando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.botaoTexto}>Salvar senha nova</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: CremeDoSite },
  corpo: { paddingHorizontal: 24, paddingTop: 22, gap: 12 },
  campo: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 22, paddingHorizontal: 18 },
  input: { flex: 1, paddingVertical: 14, fontSize: 15, color: Brand.ink },
  dica: { fontSize: 12, color: '#776C73', marginLeft: 6 },
  botao: { backgroundColor: TEMA.forte, borderRadius: 28, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  botaoTexto: { color: '#FFF', fontWeight: '700', fontSize: 16 },
})
