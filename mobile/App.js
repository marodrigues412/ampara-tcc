import React, { useState, useEffect } from 'react'
import { StyleSheet, Text } from 'react-native'
import { supabase } from './services/supabase'

import LoginScreen from './screens/LoginScreen'
import Dashboard from './screens/Dashboard'
import Home from './screens/Home'
import Profile from './screens/Profile'

import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'

import { SafeAreaProvider } from 'react-native-safe-area-context'

const Tab = createBottomTabNavigator()

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
<SafeAreaProvider>
    <NavigationContainer>
      {!session ? (
        <LoginScreen onLogin={setSession} />
      ) : (
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,

        tabBarStyle: {
            backgroundColor: '#FFFFFF',
            borderTopWidth: 0,
            height: 80,
            paddingBottom: 20,
            paddingTop: 10,

            shadowColor: '#000',
            shadowOpacity: 0.05,
            shadowRadius: 5,
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
      )}
    </NavigationContainer>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({})