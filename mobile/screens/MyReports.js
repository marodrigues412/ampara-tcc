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
import { supabase } from '../services/supabase' // Conexão real habilitada

export default function MyReports({ navigation }) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadReports()
  }, [])

  const loadReports = async () => {
    try {
      setLoading(true)
      
      // 1. Obtém o usuário logado (mesma lógica de SafeLocations)
      const { data: userData } = await supabase.auth.getUser()
      const currentUser = userData?.user

      if (!currentUser) {
        setLoading(false)
        return
      }

      // 2. Busca as ocorrências vinculadas ao ID deste usuário
      // Usando os nomes de colunas da imagem image_73a93d.png
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

  // Função para formatar a data do created_at (ISO para pt-BR)
  const formatDate = (dateString) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleDateString('pt-BR')
  }

  const renderReport = ({ item }) => (
    <View style={styles.reportCard}>
      <View style={styles.reportInfo}>
        {/* Usando tipo_crime conforme image_73a93d.png */}
        <Text style={styles.reportType}>{item.tipo_crime}</Text>
        
        {/* Usando address conforme image_73a93d.png */}
        <Text style={styles.reportLocal}>{item.address}</Text>
        
        {/* Exibindo a descrição se houver */}
        {item.descricao ? (
          <Text style={styles.reportDescription}>"{item.descricao}"</Text>
        ) : null}

        <Text style={styles.reportDate}>
          📅 {formatDate(item.created_at)} às {item.horario}
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
    alignItems: 'flex-start', // Ajustado para topo para acomodar descrição longa
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
    color: '#B91C1C'
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
  reportDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 10
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