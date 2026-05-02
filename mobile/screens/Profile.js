import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator
} from 'react-native'
import { supabase } from '../services/supabase'

export default function Profile({ navigation }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)

    const { data: userData } = await supabase.auth.getUser()

    if (!userData?.user) {
      setLoading(false)
      return
    }

    const currentUser = userData.user
    setUser(currentUser)

    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', currentUser.id)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.log(error)
    }

    setProfile(data)
    setLoading(false)
  }

  const handleLogout = () => {
    Alert.alert(
      'Sair da conta',
      'Tem certeza que deseja sair?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: async () => {
            await supabase.auth.signOut()
          }
        }
      ]
    )
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6B2B38" />
      </View>
    )
  }

return (
  <ScrollView
    style={styles.container}
    contentContainerStyle={styles.scrollContent}
    showsVerticalScrollIndicator={false}
  >
    <View style={styles.header}>
      <Text style={styles.title}>Perfil</Text>
      <Text style={styles.subtitle}>Suas informações</Text>
    </View>

    <View style={styles.card}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {profile?.nome?.charAt(0)?.toUpperCase() || 'U'}
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Nome</Text>
        <Text style={styles.value}>{profile?.nome || 'Não informado'}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{user?.email}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Telefone</Text>
        <Text style={styles.value}>{profile?.telefone || 'Não informado'}</Text>
      </View>

      <TouchableOpacity
        style={styles.editButton}
        onPress={() => navigation.navigate('EditProfile')}
      >
        <Text style={styles.editText}>Editar perfil</Text>
      </TouchableOpacity>
    </View>

    {/* 👇 NOVO BOTÃO CERTO */}
    <TouchableOpacity
      style={styles.secondaryButton}
      onPress={() => navigation.navigate('EmergencyContacts')}
    >
      <Text style={styles.secondaryText}>
        📞 Contatos de emergência
      </Text>
    </TouchableOpacity>

    <TouchableOpacity style={styles.logout} onPress={handleLogout}>
      <Text style={styles.logoutText}>Sair da conta</Text>
    </TouchableOpacity>
  </ScrollView>
)
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5EFEA'
  },

  scrollContent: {
    padding: 20,
    paddingBottom: 120
  },

  header: {
    marginTop: 40,
    marginBottom: 20
  },

  title: {
    fontSize: 34,
    color: '#6B2B38',
    fontWeight: 'bold'
  },

  subtitle: {
    color: '#9C6873',
    fontSize: 17
  },

  card: {
    backgroundColor: '#FFF',
    padding: 20,
    borderRadius: 25,
    marginBottom: 16,
    alignItems: 'center'
  },

  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#6B2B38',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 22
  },

  avatarText: {
    color: '#FFF',
    fontSize: 30,
    fontWeight: 'bold'
  },

  row: {
    width: '100%',
    marginBottom: 16
  },

  label: {
    fontSize: 14,
    color: '#9C6873',
    marginBottom: 4
  },

  value: {
    fontSize: 18,
    color: '#333'
  },

  editButton: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#6B2B38',
    padding: 14,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center'
  },

  editText: {
    color: '#6B2B38',
    fontWeight: '700',
    fontSize: 16
  },

  logout: {
    marginTop: 12,
    backgroundColor: '#C2185B',
    padding: 15,
    borderRadius: 16
  },

  logoutText: {
    color: '#FFF',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 16
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },

  secondaryButton: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#9C6873',
    padding: 14,
    borderRadius: 14,
    alignItems: 'center'
  },

  secondaryText: {
    color: '#9C6873',
    fontWeight: '600',
    fontSize: 15
  },
})