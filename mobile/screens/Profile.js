import React, { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, ScrollView, ActivityIndicator, Image
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
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
    if (!userData?.user) { setLoading(false); return }
    const currentUser = userData.user
    setUser(currentUser)
    const { data, error } = await supabase.from('user_profiles').select('*').eq('id', currentUser.id).single()
    if (error && error.code !== 'PGRST116') console.log(error)
    setProfile(data)
    setLoading(false)
  }

  const handleLogout = () => {
    Alert.alert('Sair da conta', 'Tem certeza que deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: async () => { await supabase.auth.signOut() } }
    ])
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#C4687A" />
      </View>
    )
  }

  const inicial = profile?.nome?.charAt(0)?.toUpperCase() || 'U'

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>

      {/* ── Cabeçalho coral ── */}
      <View style={styles.header}>
        <Image source={require('../assets/images/maos-ampara-azul.png')} style={{ position: 'absolute', top: 16, right: 20, width: 36, height: 36, opacity: 0.85 }} resizeMode="contain" />
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{inicial}</Text>
        </View>
        <Text style={styles.nome}>{profile?.nome || 'Usuária'}</Text>
        <Text style={styles.emailText}>{user?.email}</Text>
      </View>

      {/* ── Conteúdo sobre fundo cream ── */}
      <View style={styles.content}>

        {/* ── Card info ── */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={18} color="#5A8FAF" />
            <View style={styles.infoTextCol}>
              <Text style={styles.infoLabel}>Nome</Text>
              <Text style={styles.infoValue}>{profile?.nome || 'Não informado'}</Text>
            </View>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoRow}>
            <Ionicons name="mail-outline" size={18} color="#5A8FAF" />
            <View style={styles.infoTextCol}>
              <Text style={styles.infoLabel}>E-mail</Text>
              <Text style={styles.infoValue}>{user?.email}</Text>
            </View>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoRow}>
            <Ionicons name="call-outline" size={18} color="#5A8FAF" />
            <View style={styles.infoTextCol}>
              <Text style={styles.infoLabel}>Telefone</Text>
              <Text style={styles.infoValue}>{profile?.telefone || 'Não informado'}</Text>
            </View>
          </View>
        </View>

        {/* ── Menu de ações ── */}
        {[
          { icon: 'create-outline', label: 'Editar perfil', screen: 'EditProfile' },
          { icon: 'call-outline', label: 'Contatos de emergência', screen: 'EmergencyContacts' },
          { icon: 'location-outline', label: 'Locais seguros', screen: 'SafeLocations' },
          { icon: 'document-text-outline', label: 'Meus registros e contribuições', screen: 'MyReports' },
        ].map((item) => (
          <TouchableOpacity
            key={item.screen}
            style={styles.menuItem}
            onPress={() => navigation.navigate(item.screen)}
          >
            <Ionicons name={item.icon} size={22} color="#1B3A6B" />
            <Text style={styles.menuLabel}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={18} color="#A0B8C8" />
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#FFF" />
          <Text style={styles.logoutText}>Sair da conta</Text>
        </TouchableOpacity>

      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5EFE6' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5EFE6' },

  header: {
    backgroundColor: '#C4687A',
    alignItems: 'center',
    paddingTop: 64,
    paddingBottom: 40,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  avatarText: { color: '#1B3A6B', fontSize: 34, fontWeight: '800' },
  nome: { fontSize: 22, fontWeight: '700', color: '#FFF', marginBottom: 4 },
  emailText: { fontSize: 13, color: 'rgba(255,255,255,0.75)' },

  content: {
    backgroundColor: '#F5EFE6',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -20,
    padding: 20,
  },

  infoCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 18,
    marginBottom: 18,
    elevation: 2,
    shadowColor: '#1B3A6B',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  infoTextCol: { flex: 1 },
  infoLabel: { fontSize: 11, color: '#5A8FAF', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 16, color: '#222', fontWeight: '500', marginTop: 2 },
  infoDivider: { height: 1, backgroundColor: '#B8D6E8', marginVertical: 2 },

  menuItem: {
    backgroundColor: '#FFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: 16,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  menuLabel: { flex: 1, fontSize: 15, color: '#1B3A6B', fontWeight: '600' },

  logoutBtn: {
    backgroundColor: '#C4687A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 16,
    marginTop: 10,
  },
  logoutText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
})
