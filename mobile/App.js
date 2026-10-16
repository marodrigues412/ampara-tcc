import React, { useState, useEffect } from 'react'
import { supabase } from './services/supabase'

import LoginScreen from './screens/LoginScreen'
import OnboardingScreen from './screens/OnboardingScreen'
import Dashboard from './screens/Dashboard'
import Home from './screens/Home'
import CrimeMap from './screens/CrimeMap'
import Profile from './screens/Profile'
import EditProfile from './screens/EditProfile'
import EmergencyContacts from './screens/EmergencyContacts'
import SafeLocations from './screens/SafeLocations'
import ActivitySchedules from './screens/ActivitySchedules'
import LegalNotice from './screens/LegalNotice'
import MyReports from './screens/MyReports'
import HelpGuide from './screens/HelpGuide'
import ChatBot from './screens/ChatBot'

import { NavigationContainer } from '@react-navigation/native'
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
      // Barra própria no estilo "bolha": a aba selecionada sobe num círculo com o ícone
      // azul do app. Os ícones de cada aba ficam definidos dentro do componente.
      tabBar={(props) => <AmparaTabBar {...props} />}
    >
      <Tab.Screen name="Início" component={Home} />
      <Tab.Screen name="Mapa" component={CrimeMap} />
      <Tab.Screen name="Dashboard" component={Dashboard} />
      <Tab.Screen name="Assistente" component={ChatBot} options={{ tabBarLabel: 'Lia' }} />
      <Tab.Screen name="Perfil" component={Profile} />
    </Tab.Navigator>
  )
}

// 🔹 App principal
export default function App() {
  const [session, setSession] = useState(null)
  const [onboardingSeen, setOnboardingSeen] = useState(false)

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

  if (!onboardingSeen) {
    return <OnboardingScreen onDone={() => setOnboardingSeen(true)} />
  }

  return (
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
          <Stack.Screen name="ActivitySchedules" component={ActivitySchedules} />
          <Stack.Screen name="LegalNotice" component={LegalNotice} />

          <Stack.Screen name="MyReports" component={MyReports} />
          <Stack.Screen name="HelpGuide" component={HelpGuide} />
          <Stack.Screen name="ChatBot" component={ChatBot} />

        </Stack.Navigator>
      )}
    </NavigationContainer>
  )
}
