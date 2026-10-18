import React, { useState, useEffect } from 'react'
import { supabase } from './services/supabase'
import { useFonts } from 'expo-font'
import { Fraunces_500Medium_Italic } from '@expo-google-fonts/fraunces'

import LoginScreen from './screens/LoginScreen'
import OnboardingScreen from './screens/OnboardingScreen'
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
  const [onboardingSeen, setOnboardingSeen] = useState(false)
  // Fonte do nome da Lia. Se não carregar, o texto aparece na fonte do sistema.
  useFonts({ Fraunces_500Medium_Italic })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  // O provedor fica por fora de tudo: login e onboarding também usam o header com
  // as margens da área segura (notch e barra de status).
  if (!onboardingSeen) {
    return (
      <SafeAreaProvider>
        <OnboardingScreen onDone={() => setOnboardingSeen(true)} />
      </SafeAreaProvider>
    )
  }

  return (
    <SafeAreaProvider>
    <NavigationContainer>
      {!session ? (
        <LoginScreen onLogin={setSession} />
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

        </Stack.Navigator>
      )}
    </NavigationContainer>
    </SafeAreaProvider>
  )
}
