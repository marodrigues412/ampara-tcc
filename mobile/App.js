import React, { useState, useEffect } from 'react'
import { supabase } from './services/supabase'

import LoginScreen from './screens/LoginScreen'
import Dashboard from './screens/Dashboard'
import Home from './screens/Home'
import Profile from './screens/Profile'
import EditProfile from './screens/EditProfile'
import EmergencyContacts from './screens/EmergencyContacts'

import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import { Text } from 'react-native'

const Tab = createBottomTabNavigator()
const Stack = createNativeStackNavigator()

// 🔹 Tabs (navbar principal)
function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,

        tabBarStyle: {
          backgroundColor: '#FFF',
          borderTopWidth: 0,
          height: 80,          
          paddingBottom: 10,  
          paddingTop: 5,       
        },

        tabBarActiveTintColor: '#6B2B38',
        tabBarInactiveTintColor: '#B0A9A3',

        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginBottom: 5,
        },

        tabBarIcon: ({ focused }) => {
          let icon

          if (route.name === 'Início') icon = '🏠'
          else if (route.name === 'Dashboard') icon = '📊'
          else if (route.name === 'Perfil') icon = '👤'

          return (
            <Text style={{ fontSize: focused ? 22 : 18 }}>
              {icon}
            </Text>
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

  return (
    <NavigationContainer>
      {!session ? (
        <LoginScreen onLogin={setSession} />
      ) : (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          
          {/* Tabs (Home, Dashboard, Profile) */}
          <Stack.Screen name="Tabs" component={Tabs} />

          {/* Tela fora da navbar */}
          <Stack.Screen name="EditProfile" component={EditProfile} />

          <Stack.Screen name="EmergencyContacts" component={EmergencyContacts} /> 

        </Stack.Navigator>
      )}
    </NavigationContainer>
  )
}