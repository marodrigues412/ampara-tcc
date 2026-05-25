import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert
} from 'react-native'
import { Image } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../services/supabase'

export default function MyReports({ navigation }) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadReports()
  }, [])

  const loadReports = async () => {
    try {
      setLoading(true)
      
      // 1. Obtém o usuário logado
      const { data: userData } = await supabase.auth.getUser()
      const currentUser = userData?.user

      if (!currentUser) {
        setLoading(false)
        return
      }

      // 2. Busca as ocorrências trazendo explicitamente a coluna 'horario'
      const { data, error } = await supabase
        .from('occurrences')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })

      if (error) throw error

      setReports(data || [])
    } catch (error) {
      console.error(error)
      Alert.alert('Erro', 'Não foi possível carregar seus registros.')
    } finally {
      setLoading(false)
    }
  }

  const formatCreatedAt = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  }

  const formatDataOcorrencia = (dataIso) => {
    if (!dataIso) return null
    const [ano, mes, dia] = dataIso.split('-')
    return `${dia}/${mes}/${ano}`
  }

  const renderReport = ({ item }) => (
    <View style={styles.reportCard}>
      <View style={styles.reportInfo}>
        <Text style={styles.reportType}>{item.tipo_crime}</Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
          <Ionicons name="location-outline" size={14} color="#555" />
          <Text style={[styles.reportLocal, { marginTop: 0 }]}>{item.address}</Text>
        </View>

        {item.descricao ? (
          <Text style={styles.reportDescription}>"{item.descricao}"</Text>
        ) : null}

        <View style={styles.divider} />

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Ocorrência em</Text>
          <Text style={styles.metaValue}>
            {formatDataOcorrencia(item.data_ocorrencia) || '—'}
            {item.horario ? ` às ${item.horario}` : ''}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Registrado em</Text>
          <Text style={styles.metaValue}>{formatCreatedAt(item.created_at)}</Text>
        </View>
      </View>

      <View style={styles.statusBadge}>
        <Text style={styles.statusText}>Enviado</Text>
      </View>
    </View>
  )

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1B3A6B" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={20} color="#1B3A6B" />
          <Text style={styles.backText}>Voltar</Text>
        </TouchableOpacity>
        <Image source={require('../assets/images/maos-ampara-rosa.png')} style={{ width: 36, height: 36 }} resizeMode="contain" />
      </View>

      <Text style={styles.title}>Meus Registros</Text>
      <Text style={styles.subtitle}>Suas contribuições para a comunidade Ampara</Text>

      <FlatList
        data={reports}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderReport}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={loadReports}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            Você ainda não realizou nenhum registro de ocorrência.
          </Text>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5EFE6',
    padding: 20
  },
  backButton: {
    marginTop: 40,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: {
    fontSize: 16,
    color: '#1B3A6B',
    fontWeight: '600'
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1B3A6B',
    marginTop: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#5A8FAF',
    marginBottom: 20
  },
  listContent: {
    paddingBottom: 40
  },
  reportCard: {
    backgroundColor: '#FDEAEC',
    padding: 18,
    borderRadius: 20,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5
  },
  reportInfo: {
    flex: 1,
    paddingRight: 10
  },
  reportType: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#C4687A'
  },
  reportLocal: {
    fontSize: 14,
    color: '#555',
    marginTop: 4,
    fontWeight: '500'
  },
  reportDescription: {
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 6,
    backgroundColor: '#F9F9F9',
    padding: 6,
    borderRadius: 8
  },
  divider: {
    height: 1,
    backgroundColor: '#F0EAE4',
    marginVertical: 10
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4
  },
  metaLabel: {
    fontSize: 11,
    color: '#5A8FAF',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4
  },
  metaValue: {
    fontSize: 13,
    color: '#444',
    fontWeight: '500',
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: 8
  },
  statusBadge: {
    backgroundColor: '#E8F5E9',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10
  },
  statusText: {
    color: '#2E8B57',
    fontSize: 11,
    fontWeight: 'bold'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 40,
    fontSize: 16
  }
})