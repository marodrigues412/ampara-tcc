// Primeiro import de propósito: troca a fonte dos estilos antes de as telas criá-los.
import './utils/fontesGlobais'
import React, { useState, useEffect } from 'react'
import { AppRegistry, View } from 'react-native'
import * as Linking from 'expo-linking'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './services/supabase'
// Importado aqui para a tarefa de localização em segundo plano existir antes da 1ª posição.
import './services/monitoramentoEmSegundoPlano'

// Tarefa que nunca termina: enquanto ela roda, o Android não pausa os timers do JS com o
// app em segundo plano. O módulo ampara-watch a liga e desliga junto com o monitoramento.
AppRegistry.registerHeadlessTask('AmparaMonitor', () => () => new Promise(() => {}))
import { useFonts } from 'expo-font'
import { Fraunces_500Medium_Italic } from '@expo-google-fonts/fraunces'
import { Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito'

import LoginScreen from './screens/LoginScreen'
import Abertura from './screens/Abertura'
import BoasVindas from './screens/BoasVindas'
import Apresentacao from './screens/Apresentacao'
import NovaSenha from './screens/NovaSenha'
import PermissaoLocalizacao from './screens/PermissaoLocalizacao'
import { CHAVE_BOAS_VINDAS, ehLinkDeNovaSenha, sessaoDaUrl } from './services/authService'
import { precisaExplicarLocalizacao } from './services/permissaoLocalizacao'
import { CremeDoSite } from './constants/brandTheme'
import Dashboard from './screens/Dashboard'
import Home from './screens/Home'
import CrimeMap from './screens/CrimeMap'
import Profile from './screens/Profile'
import EditProfile from './screens/EditProfile'
import EmergencyContacts from './screens/EmergencyContacts'
import SafeLocations from './screens/SafeLocations'
import LegalNotice from './screens/LegalNotice'
import Routine from './screens/Routine'
import RoutineCommitment from './screens/RoutineCommitment'
import MyReports from './screens/MyReports'
import HelpGuide from './screens/HelpGuide'
import ChatBot from './screens/ChatBot'
import LiaAppearance from './screens/LiaAppearance'

import { NavigationContainer } from '@react-navigation/native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import AmparaTabBar from './components/AmparaTabBar'
import TreinoSos from './screens/TreinoSos'

// TEMPORÁRIO, para testes e apresentação: a boas-vindas aparece em toda abertura do app,
// mesmo para quem já entrou. Voltar para false quando a fase de testes acabar: aí ela
// aparece só na primeira vez e depois de sair da conta.
const BOAS_VINDAS_SEMPRE = true

const Tab = createBottomTabNavigator()
const Stack = createNativeStackNavigator()

// 🔹 Tabs (navbar principal)
function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      // Barra própria: ícone e nome na cor de cada aba. Os ícones ficam no componente.
      tabBar={(props) => <AmparaTabBar {...props} />}
    >
      <Tab.Screen name="Proteção" component={Home} />
      <Tab.Screen name="Mapa" component={CrimeMap} />
      <Tab.Screen name="Dashboard" component={Dashboard} options={{ tabBarLabel: 'Relatório' }} />
      <Tab.Screen name="Assistente" component={ChatBot} options={{ tabBarLabel: 'Lia' }} />
      <Tab.Screen name="Perfil" component={Profile} />
    </Tab.Navigator>
  )
}

// 🔹 App principal
export default function App() {
  const [session, setSession] = useState(null)
  // null enquanto lê o AsyncStorage e a sessão salva; a abertura cobre essa espera.
  const [boasVindasVista, setBoasVindasVista] = useState(null)
  const [sessaoLida, setSessaoLida] = useState(false)
  const [aberturaFeita, setAberturaFeita] = useState(false)
  const [comecarNoCadastro, setComecarNoCadastro] = useState(false)
  // "Criar minha conta" passa pelos 3 slides de apresentação antes do cadastro.
  const [naApresentacao, setNaApresentacao] = useState(false)
  // Veio do link de "Esqueci minha senha": entra direto na tela de senha nova.
  const [criandoSenha, setCriandoSenha] = useState(false)
  // null = ainda conferindo; true = mostrar a explicação antes do pedido do sistema.
  const [explicarLocalizacao, setExplicarLocalizacao] = useState(null)
  // Nunito em todo o app e Fraunces no nome da Lia. Se der erro ao carregar, o app segue
  // com a fonte do sistema em vez de ficar parado.
  const [fontesCarregadas, erroDasFontes] = useFonts({
    Fraunces_500Medium_Italic, Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold,
  })
  const fontesProntas = fontesCarregadas || Boolean(erroDasFontes)

  useEffect(() => {
    // finally, como na versão da Maria: mesmo com erro na leitura, o app não fica parado.
    supabase.auth.getSession()
      .then(({ data }) => setSession(data.session))
      .finally(() => setSessaoLida(true))
    AsyncStorage.getItem(CHAVE_BOAS_VINDAS)
      .then((valor) => setBoasVindasVista(!BOAS_VINDAS_SEMPRE && valor === 'sim'))
      .catch(() => setBoasVindasVista(false))

    const { data: listener } = supabase.auth.onAuthStateChange((evento, session) => {
      setSession(session)
      // Ao sair pelo Perfil a marca foi apagada: relê para a boas-vindas voltar. O
      // cadastro também sai da conta logo depois de criá-la, mas lá a marca continua.
      if (evento === 'SIGNED_OUT') {
        AsyncStorage.getItem(CHAVE_BOAS_VINDAS)
          .then((v) => {
            const vista = !BOAS_VINDAS_SEMPRE && v === 'sim'
            setBoasVindasVista(vista)
            // Voltando para a boas-vindas, o logo do Ampara vem antes, como na abertura.
            if (!vista) setAberturaFeita(false)
          })
          .catch(() => {})
      }
    })

    // Link do e-mail de nova senha, com o app fechado (getInitialURL) ou aberto (evento).
    const abrirLink = async (url) => {
      if (!ehLinkDeNovaSenha(url)) return
      try {
        const sessao = await sessaoDaUrl(url)
        setSession(sessao)
        setCriandoSenha(true)
      } catch (erro) {
        console.log('Link de nova senha inválido:', erro?.message)
      }
    }
    Linking.getInitialURL().then((url) => url && abrirLink(url))
    const assinaturaLink = Linking.addEventListener('url', ({ url }) => abrirLink(url))

    return () => {
      listener.subscription.unsubscribe()
      assinaturaLink.remove()
    }
  }, [])

  // Ao entrar, confere se o sistema ainda não perguntou sobre a localização.
  const usuarioId = session?.user?.id
  useEffect(() => {
    if (!usuarioId) return
    let ativo = true
    precisaExplicarLocalizacao()
      .then((precisa) => { if (ativo) setExplicarLocalizacao(precisa) })
      .catch(() => { if (ativo) setExplicarLocalizacao(false) })
    return () => { ativo = false }
  }, [usuarioId])

  const marcarBoasVindas = (cadastro) => {
    setComecarNoCadastro(cadastro)
    setBoasVindasVista(true)
    AsyncStorage.setItem(CHAVE_BOAS_VINDAS, 'sim').catch(() => {})
  }

  // O provedor fica por fora de tudo: as telas de entrada também usam a área segura.
  if (!fontesProntas || !aberturaFeita || boasVindasVista === null || !sessaoLida) {
    return (
      <SafeAreaProvider>
        {!fontesProntas || aberturaFeita
          ? <View style={{ flex: 1, backgroundColor: CremeDoSite }} />
          : <Abertura onFim={() => setAberturaFeita(true)} />}
      </SafeAreaProvider>
    )
  }

  if (!boasVindasVista && (!session || BOAS_VINDAS_SEMPRE)) {
    return (
      <SafeAreaProvider>
        {naApresentacao
          ? <Apresentacao onFim={() => { setNaApresentacao(false); marcarBoasVindas(true) }} />
          : <BoasVindas onCriarConta={() => setNaApresentacao(true)} onEntrar={() => marcarBoasVindas(false)} />}
      </SafeAreaProvider>
    )
  }

  if (session && criandoSenha) {
    return (
      <SafeAreaProvider>
        <NovaSenha onConcluir={() => setCriandoSenha(false)} />
      </SafeAreaProvider>
    )
  }

  if (session && explicarLocalizacao !== false) {
    return (
      <SafeAreaProvider>
        {explicarLocalizacao
          ? <PermissaoLocalizacao onConcluir={() => setExplicarLocalizacao(false)} />
          : <View style={{ flex: 1, backgroundColor: CremeDoSite }} />}
      </SafeAreaProvider>
    )
  }

  return (
    <SafeAreaProvider>
    <NavigationContainer>
      {!session ? (
        <LoginScreen onLogin={setSession} comecarNoCadastro={comecarNoCadastro} />
      ) : (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          
          {/* Tabs (Home, Dashboard, Profile) */}
          <Stack.Screen name="Tabs" component={Tabs} />

          {/* Telas fora da navbar (configurações e funcionalidades) */}
          <Stack.Screen name="EditProfile" component={EditProfile} />
          <Stack.Screen name="EmergencyContacts" component={EmergencyContacts} />
          <Stack.Screen name="SafeLocations" component={SafeLocations} />
          <Stack.Screen name="LegalNotice" component={LegalNotice} />
          <Stack.Screen name="Routine" component={Routine} />
          <Stack.Screen name="RoutineCommitment" component={RoutineCommitment} />

          <Stack.Screen name="MyReports" component={MyReports} />
          <Stack.Screen name="HelpGuide" component={HelpGuide} />
          <Stack.Screen name="ChatBot" component={ChatBot} />
          <Stack.Screen name="LiaAppearance" component={LiaAppearance} />
          <Stack.Screen name="TreinoSos" component={TreinoSos} />

        </Stack.Navigator>
      )}
    </NavigationContainer>
    </SafeAreaProvider>
  )
}
