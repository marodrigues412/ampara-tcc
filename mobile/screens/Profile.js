import React, { useCallback, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, ActivityIndicator } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../services/supabase'
import { CHAVE_BOAS_VINDAS } from '../services/authService'
import { listarCompromissos, listarLocaisSeguros } from '../services/routineService'
import HeaderComCurvas from '../components/HeaderComCurvas'
import SecaoRecolhida from '../components/SecaoRecolhida'
import { Brand, TemaDaAba, CremeDoSite } from '../constants/brandTheme'
import LiaAvatar from '../components/LiaAvatar'
import DicaDaLia from '../components/DicaDaLia'
import { reverTutorial, treinoDoSosFeito } from '../services/tutorial'

const TEMA = TemaDaAba.Perfil
const CORES_DA_REDE = [['#BD5574', '#F7E7EC'], ['#6E5A9E', '#EFEAF5'], ['#3F6A86', '#E9EFF2']]
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`
// Cada seção com a sua cor (ícone forte sobre fundo claro), como as abas do app.
const COR_DA_SECAO = {
  dados: ['#273963', '#E8ECF4'],
  rede: ['#BD5574', '#F7E7EC'],
  locais: [Brand.green, Brand.mint],
  rotina: ['#3F6A86', '#E9EFF2'],
  lia: ['#6E5A9E', '#EFEAF5'],
  sobre: ['#756670', '#F3EFF1'],
}

// Perfil em seções recolhidas: fechadas, cada uma mostra só um resumo ("3 contatos").
export default function Profile({ navigation }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [contatos, setContatos] = useState([])
  const [locais, setLocais] = useState([])
  const [compromissos, setCompromissos] = useState([])
  const [treinou, setTreinou] = useState(false)
  const [loading, setLoading] = useState(true)

  // Recarrega ao voltar das telas de edição, para os resumos refletirem a mudança.
  useFocusEffect(useCallback(() => {
    let ativo = true
    ;(async () => {
      const { data: userData } = await supabase.auth.getUser()
      const atual = userData?.user
      if (!atual) { if (ativo) setLoading(false); return }
      const [perfil, rede, seguros, rotina, treino] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('id', atual.id).single(),
        supabase.from('emergency_contacts').select('id, nome, telefone').eq('user_id', atual.id),
        listarLocaisSeguros(atual.id),
        listarCompromissos(atual.id),
        treinoDoSosFeito(),
      ])
      if (!ativo) return
      if (perfil.error && perfil.error.code !== 'PGRST116') console.log(perfil.error)
      setUser(atual)
      setProfile(perfil.data)
      setContatos(rede.data ?? [])
      setLocais(seguros)
      setCompromissos(rotina)
      setTreinou(treino)
      setLoading(false)
    })()
    return () => { ativo = false }
  }, []))

  const reverDicas = async () => {
    await reverTutorial()
    Alert.alert('Dicas de volta', 'O tour da Proteção e as dicas da Lia vão aparecer de novo na próxima visita de cada aba, e os primeiros passos voltam para a Proteção.')
  }

  const handleLogout = () => {
    Alert.alert('Sair da conta', 'Tem certeza que deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem(CHAVE_BOAS_VINDAS).catch(() => {})
          await supabase.auth.signOut()
        },
      },
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
  const temCasa = locais.some((l) => String(l.tipo ?? l.nome ?? '').toLowerCase().includes('casa'))

  // O que deixa o Ampara pronto para agir; o primeiro que falta vira o próximo passo.
  const passos = [
    { feito: contatos.length > 0, texto: 'Cadastre quem deve receber seu alerta SOS', tela: 'EmergencyContacts' },
    { feito: temCasa, texto: 'Cadastre sua casa como local seguro', tela: 'SafeLocations' },
    { feito: treinou, texto: 'Treine o SOS: é o mesmo gesto, sem enviar nada', tela: 'TreinoSos' },
    { feito: ativos.length > 0, texto: 'Cadastre sua rotina para eu acompanhar seus trajetos', tela: 'Routine' },
  ]
  const feitos = passos.filter((p) => p.feito).length
  const proximo = passos.find((p) => !p.feito)
  const primeiroNome = nome.split(' ')[0]

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
        <View style={styles.pilulas}>
          {[
            ['people', plural(contatos.length, 'contato', 'contatos'), COR_DA_SECAO.rede],
            ['location', plural(locais.length, 'local seguro', 'locais seguros'), COR_DA_SECAO.locais],
            ['calendar', plural(ativos.length, 'compromisso', 'compromissos'), COR_DA_SECAO.rotina],
          ].map(([icone, texto, [cor, fundo]]) => (
            <View key={icone} style={[styles.pilula, { backgroundColor: fundo }]}>
              <Ionicons name={icone} size={13} color={cor} />
              <Text style={[styles.pilulaTexto, { color: cor }]}>{texto}</Text>
            </View>
          ))}
        </View>
      </HeaderComCurvas>

      <DicaDaLia
        id="perfil"
        aba="Perfil"
        texto="Aqui ficam sua rede de apoio, seus locais seguros e sua rotina. Toque numa seção para abrir. Em Como usar o Ampara você treina o SOS."
        style={{ marginHorizontal: 20, marginTop: 14 }}
      />

      {/* A Lia conta quanto o Ampara está pronto e qual é o próximo passo. */}
      <TouchableOpacity
        style={styles.preparo}
        onPress={proximo ? () => navigation.navigate(proximo.tela) : undefined}
        disabled={!proximo}
        accessibilityRole={proximo ? 'button' : undefined}
        accessibilityLabel={proximo ? `${feitos} de ${passos.length} passos prontos. Próximo: ${proximo.texto}` : 'Tudo pronto'}
      >
        <LiaAvatar size={56} reaction={proximo ? 'oi' : 'feliz'} showRing={false} showBadge={false} />
        <View style={{ flex: 1 }}>
          <Text style={styles.preparoTitulo}>
            {proximo ? `${primeiroNome}, faltam ${passos.length - feitos} ${passos.length - feitos === 1 ? 'passo' : 'passos'}` : `Tudo pronto, ${primeiroNome}!`}
          </Text>
          <Text style={styles.preparoTexto}>
            {proximo ? proximo.texto : 'Sua rede, seus lugares e sua rotina estão cadastrados. Eu sigo de olho.'}
          </Text>
          <View style={styles.preparoTrilha}>
            <View style={[styles.preparoBarra, { width: `${(feitos / passos.length) * 100}%` }]} />
          </View>
        </View>
        {proximo && <Ionicons name="chevron-forward" size={20} color={TEMA.forte} />}
      </TouchableOpacity>

      <View style={{ height: 4 }} />

      <SecaoRecolhida icone="person-outline" titulo="Seus dados" resumo={profile?.telefone ? 'Nome, e-mail e telefone' : 'Falta o telefone'} pendente={!profile?.telefone} cor={COR_DA_SECAO.dados[0]} fundo={COR_DA_SECAO.dados[1]}>
        {[['Nome', profile?.nome], ['E-mail', user?.email], ['Telefone', profile?.telefone]].map(([rotulo, valor]) => (
          <View key={rotulo} style={styles.dado}>
            <Text style={styles.dadoRotulo}>{rotulo}</Text>
            <Text style={styles.linhaTitulo}>{valor || 'Não informado'}</Text>
          </View>
        ))}
        {link('Editar perfil', 'EditProfile', 'create-outline')}
      </SecaoRecolhida>

      <SecaoRecolhida icone="people-outline" titulo="Rede de apoio" resumo={contatos.length ? contatos.map((c) => (c.nome ?? '').split(' ')[0]).filter(Boolean).join(', ') : 'Nenhum contato cadastrado'} pendente={!contatos.length} cor={COR_DA_SECAO.rede[0]} fundo={COR_DA_SECAO.rede[1]}>
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

      <SecaoRecolhida icone="location-outline" titulo="Locais seguros" resumo={locais.length ? locais.map((l) => l.nome).join(', ') : 'Nenhum local cadastrado'} pendente={!locais.length} cor={COR_DA_SECAO.locais[0]} fundo={COR_DA_SECAO.locais[1]}>
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

      <SecaoRecolhida icone="calendar-outline" titulo="Rotina" resumo={ativos.length ? `${plural(ativos.length, 'compromisso', 'compromissos')} na semana` : 'Nenhum compromisso cadastrado'} pendente={!ativos.length} cor={COR_DA_SECAO.rotina[0]} fundo={COR_DA_SECAO.rotina[1]}>
        <Text style={styles.nota}>Os compromissos de exercício ligam o modo atividade sozinhos.</Text>
        {link('Abrir minha rotina', 'Routine', 'arrow-forward')}
      </SecaoRecolhida>

      <SecaoRecolhida icone="color-palette-outline" titulo="Sua Lia" resumo="Personalize a aparência da assistente" cor={COR_DA_SECAO.lia[0]} fundo={COR_DA_SECAO.lia[1]}>
        <Text style={styles.nota}>Escolha o tom de pele, o cabelo e os olhos da Lia.</Text>
        {link('Personalizar a Lia', 'LiaAppearance', 'sparkles-outline')}
      </SecaoRecolhida>

      <SecaoRecolhida icone="school-outline" titulo="Como usar o Ampara" resumo={treinou ? 'Treino do SOS feito' : 'Treine o SOS e reveja as dicas'} pendente={!treinou} cor={COR_DA_SECAO.rede[0]} fundo={COR_DA_SECAO.rede[1]}>
        <Text style={styles.nota}>Treine o SOS quando quiser: é o mesmo gesto do alerta, e nada é enviado.</Text>
        {link(treinou ? 'Treinar o SOS de novo' : 'Treinar o SOS', 'TreinoSos', 'alert-circle-outline')}
        <TouchableOpacity style={styles.linha} onPress={reverDicas} accessibilityRole="button">
          <Ionicons name="bulb-outline" size={18} color={TEMA.forte} />
          <Text style={[styles.linkTexto, { color: TEMA.forte }]}>Rever as dicas da Lia</Text>
        </TouchableOpacity>
      </SecaoRecolhida>

      <SecaoRecolhida icone="information-circle-outline" titulo="Sobre o Ampara" resumo="Avisos e limitações" cor={COR_DA_SECAO.sobre[0]} fundo={COR_DA_SECAO.sobre[1]}>
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
  container: { flex: 1, backgroundColor: CremeDoSite },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: CremeDoSite },
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
  pilulas: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  pilula: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999 },
  pilulaTexto: { fontSize: 12, fontWeight: '700' },
  preparo: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 20, marginTop: 16, padding: 14, borderRadius: 20, backgroundColor: '#FFF3F6', borderWidth: 1, borderColor: '#F3DDE5' },
  preparoTitulo: { fontSize: 15, fontWeight: '800', color: Brand.ink },
  preparoTexto: { fontSize: 13, color: '#776C73', marginTop: 2, lineHeight: 18 },
  preparoTrilha: { height: 6, borderRadius: 3, backgroundColor: '#F1DCE3', marginTop: 10, overflow: 'hidden' },
  preparoBarra: { height: 6, borderRadius: 3, backgroundColor: Brand.rose },
  sair: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, marginTop: 22, paddingVertical: 10 },
  sairTexto: { color: Brand.danger, fontWeight: '700', fontSize: 15 },
})
