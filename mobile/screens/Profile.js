import React, { useCallback, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, ActivityIndicator } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../services/supabase'
import { listarCompromissos, listarLocaisSeguros } from '../services/routineService'
import HeaderComCurvas from '../components/HeaderComCurvas'
import SecaoRecolhida from '../components/SecaoRecolhida'
import { Brand, TemaDaAba } from '../constants/brandTheme'

const TEMA = TemaDaAba.Perfil
const CORES_DA_REDE = [['#BD5574', '#F7E7EC'], ['#6E5A9E', '#EFEAF5'], ['#3F6A86', '#E9EFF2']]
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`

// Perfil em seções recolhidas: fechadas, cada uma mostra só um resumo ("3 contatos").
export default function Profile({ navigation }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [contatos, setContatos] = useState([])
  const [locais, setLocais] = useState([])
  const [compromissos, setCompromissos] = useState([])
  const [loading, setLoading] = useState(true)

  // Recarrega ao voltar das telas de edição, para os resumos refletirem a mudança.
  useFocusEffect(useCallback(() => {
    let ativo = true
    ;(async () => {
      const { data: userData } = await supabase.auth.getUser()
      const atual = userData?.user
      if (!atual) { if (ativo) setLoading(false); return }
      const [perfil, rede, seguros, rotina] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('id', atual.id).single(),
        supabase.from('emergency_contacts').select('id, nome, telefone').eq('user_id', atual.id),
        listarLocaisSeguros(atual.id),
        listarCompromissos(atual.id),
      ])
      if (!ativo) return
      if (perfil.error && perfil.error.code !== 'PGRST116') console.log(perfil.error)
      setUser(atual)
      setProfile(perfil.data)
      setContatos(rede.data ?? [])
      setLocais(seguros)
      setCompromissos(rotina)
      setLoading(false)
    })()
    return () => { ativo = false }
  }, []))

  const handleLogout = () => {
    Alert.alert('Sair da conta', 'Tem certeza que deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: async () => { await supabase.auth.signOut() } },
    ])
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={TEMA.forte} />
      </View>
    )
  }

  const nome = profile?.nome || 'Usuária'
  const ativos = compromissos.filter((c) => c.ativo !== false)

  const link = (texto, tela, icone = 'add') => (
    <TouchableOpacity style={styles.linha} onPress={() => navigation.navigate(tela)} accessibilityRole="button">
      <Ionicons name={icone} size={18} color={TEMA.forte} />
      <Text style={[styles.linkTexto, { color: TEMA.forte }]}>{texto}</Text>
    </TouchableOpacity>
  )

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
      <HeaderComCurvas aba="Perfil">
        <View style={styles.topo}>
          <View style={[styles.avatar, { backgroundColor: TEMA.forte }]}>
            <Text style={styles.avatarText}>{nome.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.nome, { color: TEMA.forte }]} numberOfLines={1}>{nome}</Text>
            <Text style={styles.email} numberOfLines={1}>{user?.email}</Text>
          </View>
        </View>
      </HeaderComCurvas>

      <View style={{ height: 8 }} />

      <SecaoRecolhida icone="people-outline" titulo="Rede de apoio" resumo={contatos.length ? plural(contatos.length, 'contato', 'contatos') : 'Nenhum contato cadastrado'} cor={TEMA.forte} fundo={TEMA.fundo}>
        {contatos.map((c, k) => (
          <View key={c.id} style={styles.linha}>
            <View style={[styles.inicial, { backgroundColor: CORES_DA_REDE[k % 3][1] }]}>
              <Text style={[styles.inicialTexto, { color: CORES_DA_REDE[k % 3][0] }]}>{(c.nome ?? '?').charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.linhaTitulo}>{c.nome}</Text>
              {!!c.telefone && <Text style={styles.linhaDetalhe}>{c.telefone}</Text>}
            </View>
          </View>
        ))}
        {link(contatos.length ? 'Gerenciar contatos' : 'Adicionar contato', 'EmergencyContacts', contatos.length ? 'create-outline' : 'add')}
      </SecaoRecolhida>

      <SecaoRecolhida icone="location-outline" titulo="Locais seguros" resumo={locais.length ? locais.map((l) => l.nome).join(', ') : 'Nenhum local cadastrado'} cor={TEMA.forte} fundo={TEMA.fundo}>
        {locais.map((l) => (
          <View key={l.id} style={styles.linha}>
            <View style={{ flex: 1 }}>
              <Text style={styles.linhaTitulo}>{l.nome}</Text>
              {!!l.endereco && <Text style={styles.linhaDetalhe} numberOfLines={1}>{l.endereco}</Text>}
            </View>
          </View>
        ))}
        {link(locais.length ? 'Gerenciar locais' : 'Adicionar local', 'SafeLocations', locais.length ? 'create-outline' : 'add')}
      </SecaoRecolhida>

      <SecaoRecolhida icone="calendar-outline" titulo="Rotina" resumo={ativos.length ? `${plural(ativos.length, 'compromisso', 'compromissos')} na semana` : 'Nenhum compromisso cadastrado'} cor={TEMA.forte} fundo={TEMA.fundo}>
        <Text style={styles.nota}>Os compromissos de exercício ligam o modo atividade sozinhos.</Text>
        {link('Abrir minha rotina', 'Routine', 'arrow-forward')}
      </SecaoRecolhida>

      <SecaoRecolhida icone="color-palette-outline" titulo="Sua Lia" resumo="Personalize a aparência da assistente" cor={TEMA.forte} fundo={TEMA.fundo}>
        <Text style={styles.nota}>Escolha o tom de pele, o cabelo e os olhos da Lia.</Text>
        {link('Personalizar a Lia', 'LiaAppearance', 'sparkles-outline')}
      </SecaoRecolhida>

      <SecaoRecolhida icone="person-outline" titulo="Seus dados" resumo="Nome, e-mail e telefone" cor={TEMA.forte} fundo={TEMA.fundo}>
        {[['Nome', profile?.nome], ['E-mail', user?.email], ['Telefone', profile?.telefone]].map(([rotulo, valor]) => (
          <View key={rotulo} style={styles.dado}>
            <Text style={styles.dadoRotulo}>{rotulo}</Text>
            <Text style={styles.linhaTitulo}>{valor || 'Não informado'}</Text>
          </View>
        ))}
        {link('Editar perfil', 'EditProfile', 'create-outline')}
      </SecaoRecolhida>

      <SecaoRecolhida icone="information-circle-outline" titulo="Sobre o Ampara" resumo="Avisos e limitações" cor={TEMA.forte} fundo={TEMA.fundo}>
        {link('Avisos e limitações', 'LegalNotice', 'document-text-outline')}
      </SecaoRecolhida>

      <TouchableOpacity style={styles.sair} onPress={handleLogout} accessibilityRole="button">
        <Ionicons name="log-out-outline" size={20} color={Brand.danger} />
        <Text style={styles.sairTexto}>Sair da conta</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  nome: { fontSize: 21, fontWeight: '800' },
  email: { fontSize: 13, color: '#776C73', marginTop: 1 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  linhaTitulo: { fontSize: 14, color: Brand.ink },
  linhaDetalhe: { fontSize: 12, color: '#8A8590', marginTop: 1 },
  linkTexto: { fontSize: 14, fontWeight: '700' },
  inicial: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  inicialTexto: { fontSize: 13, fontWeight: '700' },
  nota: { fontSize: 13, color: '#8A8590', paddingVertical: 4 },
  dado: { paddingVertical: 6 },
  dadoRotulo: { fontSize: 11, color: '#8A8590', fontWeight: '700', textTransform: 'uppercase' },
  sair: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, marginTop: 22, paddingVertical: 10 },
  sairTexto: { color: Brand.danger, fontWeight: '700', fontSize: 15 },
})
