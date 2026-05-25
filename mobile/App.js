import React, { useState, useEffect } from 'react'
import { supabase } from './services/supabase'

import LoginScreen from './screens/LoginScreen'
import OnboardingScreen from './screens/OnboardingScreen'
import Dashboard from './screens/Dashboard'
import Home from './screens/Home'
import Profile from './screens/Profile'
import EditProfile from './screens/EditProfile'
import EmergencyContacts from './screens/EmergencyContacts'
import SafeLocations from './screens/SafeLocations'
import MyReports from './screens/MyReports'
import HelpGuide from './screens/HelpGuide'

import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import { Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

const Tab = createBottomTabNavigator()
const Stack = createNativeStackNavigator()

// 🔹 Tabs (navbar principal)
function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,

        tabBarStyle: {
          backgroundColor: '#1B3A6B',
          borderTopWidth: 0,
          height: 72,
          paddingBottom: 12,
          paddingTop: 12,
        },

        tabBarActiveTintColor: '#C4687A',
        tabBarInactiveTintColor: '#8EB4D0',

        tabBarShowLabel: false,

        tabBarIcon: ({ focused, color }) => {
          let iconName

          if (route.name === 'Início') iconName = focused ? 'home' : 'home-outline'
          else if (route.name === 'Dashboard') iconName = focused ? 'bar-chart' : 'bar-chart-outline'
          else if (route.name === 'Perfil') iconName = focused ? 'person' : 'person-outline'

          return (
            <View style={{
              backgroundColor: focused ? 'rgba(196, 104, 122, 0.22)' : 'transparent',
              borderRadius: 12,
              width: 48,
              height: 32,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Ionicons name={iconName} size={22} color={color} />
            </View>
          )
        },
      })}
    >
      <Tab.Screen name="Início" component={Home} />
      <Tab.Screen name="Dashboard" component={Dashboard} />
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

          <Stack.Screen name="MyReports" component={MyReports} />
          <Stack.Screen name="HelpGuide" component={HelpGuide} />

        </Stack.Navigator>
      )}
    </NavigationContainer>
  )
}