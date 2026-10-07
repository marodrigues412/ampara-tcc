import React, { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, ScrollView, ActivityIndicator, Image
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../services/supabase'
import { Brand } from '../constants/brandTheme'

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
        <Image source={require('../assets/images/maos-ampara-azul.png')} style={styles.headerLogo} resizeMode="contain" />
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{inicial}</Text>
        </View>
        <Text style={styles.nome}>{profile?.nome || 'Usuária'}</Text>
        <Text style={styles.emailText}>{user?.email}</Text>
      </View>

      {/* ── Conteúdo sobre fundo cream ── */}
      <View style={styles.content}>

        {/* ── Dados da conta ── */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={18} color={Brand.roseDeep} />
            <View style={styles.infoTextCol}>
              <Text style={styles.infoLabel}>Nome</Text>
              <Text style={styles.infoValue}>{profile?.nome || 'Não informado'}</Text>
            </View>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoRow}>
            <Ionicons name="mail-outline" size={18} color={Brand.roseDeep} />
            <View style={styles.infoTextCol}>
              <Text style={styles.infoLabel}>E-mail</Text>
              <Text style={styles.infoValue}>{user?.email}</Text>
            </View>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoRow}>
            <Ionicons name="call-outline" size={18} color={Brand.roseDeep} />
            <View style={styles.infoTextCol}>
              <Text style={styles.infoLabel}>Telefone</Text>
              <Text style={styles.infoValue}>{profile?.telefone || 'Não informado'}</Text>
            </View>
          </View>
        </View>

        {/* ── Menu de ações ── */}
        {[
          { icon: 'person-circle-outline', label: 'Editar perfil', screen: 'EditProfile' },
          { icon: 'heart-circle-outline', label: 'Contatos de emergência', screen: 'EmergencyContacts' },
          { icon: 'location-outline', label: 'Locais seguros', screen: 'SafeLocations' },
        ].map((item) => (
          <React.Fragment key={item.screen}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate(item.screen)}
            >
              <Ionicons name={item.icon} size={22} color={Brand.roseDeep} />
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={18} color="#B99AA5" />
            </TouchableOpacity>
            <View style={styles.menuDivider} />
          </React.Fragment>
        ))}

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={Brand.roseDeep} />
          <Text style={styles.logoutText}>Sair da conta</Text>
        </TouchableOpacity>

      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Brand.canvas },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Brand.canvas },

  header: {
    position: 'relative',
    backgroundColor: Brand.rose,
    alignItems: 'center',
    paddingTop: 64,
    paddingBottom: 34,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  headerLogo: { position: 'absolute', top: 54, right: 20, width: 36, height: 36, opacity: 0.9 },
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
  avatarText: { color: Brand.roseDeep, fontSize: 34, fontWeight: '800' },
  nome: { fontSize: 22, fontWeight: '700', color: '#FFF', marginBottom: 4 },
  emailText: { fontSize: 13, color: 'rgba(255,255,255,0.85)' },

  content: {
    backgroundColor: Brand.canvas,
    paddingHorizontal: 22,
    paddingTop: 0,
  },

  infoCard: {
    backgroundColor: 'transparent',
    paddingVertical: 4,
    marginBottom: 20,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  infoTextCol: { flex: 1 },
  infoLabel: { fontSize: 11, color: Brand.muted, fontWeight: '700', textTransform: 'uppercase' },
  infoValue: { fontSize: 16, color: Brand.ink, fontWeight: '500', marginTop: 2 },
  infoDivider: { height: 1, backgroundColor: Brand.line, marginVertical: 0, marginLeft: 32, marginRight: 4, opacity: 0.8 },

  menuItem: {
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 0,
    paddingVertical: 17,
    borderBottomWidth: 0,
  },
  menuDivider: { height: 1, marginLeft: 34, marginRight: 8, backgroundColor: Brand.line, opacity: 0.72 },
  menuLabel: { flex: 1, fontSize: 15, color: Brand.ink, fontWeight: '600' },

  logoutBtn: {
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    paddingHorizontal: 0,
    paddingVertical: 17,
    marginTop: 10,
  },
  logoutText: { color: Brand.roseDeep, fontWeight: '700', fontSize: 16 },
})
