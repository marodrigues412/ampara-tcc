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
// import { supabase } from '../services/supabase' // Comentado até ter a conta

export default function MyReports({ navigation }) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)

  // Simulação de dados para teste (Mock local)
  useEffect(() => {
    const mockData = [
      {
        id: '1',
        tipo: 'Local Mal Iluminado',
        local: 'Rua Alfredo Silveira, 379 - Santo André',
        horario: '21:30',
        data: '08/05/2026'
      },
      {
        id: '2',
        tipo: 'Assédio/Importunação',
        local: 'Av. Industrial, 600 - Santo André',
        horario: '18:15',
        data: '05/05/2026'
      }
    ]

    // Simulando delay de rede
    setTimeout(() => {
      setReports(mockData)
      setLoading(false)
    }, 1000)

    // Quando tiver o Supabase, use: loadReports()
  }, [])

  /* const loadReports = async () => {
    setLoading(true)
    const { data: userData } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('occurrences')
      .select('*')
      .eq('user_id', userData.user.id)
      .order('created_at', { ascending: false })

    if (error) {
      Alert.alert('Erro', 'Não foi possível carregar suas contribuições.')
    } else {
      setReports(data || [])
    }
    setLoading(false)
  }
  */

  const renderReport = ({ item }) => (
    <View style={styles.reportCard}>
      <View style={styles.reportInfo}>
        <Text style={styles.reportType}>{item.tipo}</Text>
        <Text style={styles.reportLocal}>{item.local}</Text>
        <Text style={styles.reportDate}>
          📅 {item.data} às {item.horario}
        </Text>
      </View>
      <View style={styles.statusBadge}>
        <Text style={styles.statusText}>Enviado</Text>
      </View>
    </View>
  )

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#025382" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
        <Text style={styles.backText}>←</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Meus Registros</Text>
      <Text style={styles.subtitle}>Suas contribuições para a comunidade Ampara</Text>

      <FlatList
        data={reports}
        keyExtractor={(item) => item.id}
        renderItem={renderReport}
        contentContainerStyle={styles.listContent}
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
    backgroundColor: '#F5EFEA',
    padding: 20
  },
  backButton: {
    marginTop: 40
  },
  backText: {
    fontSize: 28,
    color: '#025382'
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#025382',
    marginTop: 10
  },
  subtitle: {
    fontSize: 16,
    color: '#3A7FA6',
    marginBottom: 20
  },
  listContent: {
    paddingBottom: 40
  },
  reportCard: {
    backgroundColor: '#FFF',
    padding: 18,
    borderRadius: 20,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    color: '#B91C1C' // Tom de destaque para o crime
  },
  reportLocal: {
    fontSize: 14,
    color: '#555',
    marginTop: 4
  },
  reportDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 8
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