import React, { useState, useEffect, useRef } from 'react'
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Keyboard,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform
} from 'react-native'
import { useRiskDetection } from '../hooks/useRiskDetection'
import MapView, { Marker, Circle } from 'react-native-maps'
import * as Location from 'expo-location'
import crimeData from '../data/crimes_mock.json'
import { supabase } from '../services/supabase' // Conexão real habilitada

export default function Home({ navigation }) {
  const { data, location, riskStatus, errorMsg, stepCount, nearbyCrimes } = useRiskDetection()
  const [modalVisible, setModalVisible] = useState(false)

  const [region, setRegion] = useState(null)
  const [userRegion, setUserRegion] = useState(null)
  const [mapMoved, setMapMoved] = useState(false)

  const mapRef = useRef(null)

  const { x, y, z } = data
  const { magnitude, isHighRisk } = riskStatus

  // --- Estados do Registro de Ocorrência ---
  const [reportModalVisible, setReportModalVisible] = useState(false)
  const [occEndereco, setOccEndereco] = useState('')
  const [occTipo, setOccTipo] = useState('')
  const [occDescricao, setOccDescricao] = useState('') // Novo campo de descrição
  const [occHorario, setOccHorario] = useState(new Date().toLocaleTimeString().slice(0, 5))
  const [occCoords, setOccCoords] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [loadingGPS, setLoadingGPS] = useState(false)
  const [isSaving, setIsSaving] = useState(false) // Feedback de salvamento
  const searchTimeout = useRef(null)

  const tiposOcorrencia = [
    'Assalto/Roubo',
    'Assédio/Importunação',
    'Atividade Suspeita',
    'Local Mal Iluminado',
    'Perseguição'
  ]

  useEffect(() => {
    if (isHighRisk && !modalVisible) {
      setModalVisible(true)
    }
  }, [isHighRisk])

  useEffect(() => {
    if (location) {
      const initialRegion = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      }
      setRegion(initialRegion)
      setUserRegion(initialRegion)
    }
  }, [location])

  const handleRegionChange = (newRegion) => {
    setRegion(newRegion)
    if (!userRegion) return
    const distance = Math.abs(newRegion.latitude - userRegion.latitude) + Math.abs(newRegion.longitude - userRegion.longitude)
    setMapMoved(distance > 0.002)
  }

  const recenterMap = () => {
    if (mapRef.current && userRegion) {
      mapRef.current.animateToRegion(userRegion, 500)
      setMapMoved(false)
    }
  }

  const handleUseCurrentLocation = async () => {
    setLoadingGPS(true)
    let { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Erro', 'Permissão de GPS negada')
      setLoadingGPS(false)
      return
    }

    let loc = await Location.getCurrentPositionAsync({})
    const { latitude, longitude } = loc.coords
    setOccCoords({ latitude, longitude })

    const address = await Location.reverseGeocodeAsync({ latitude, longitude })
    if (address && address.length > 0) {
      const a = address[0]
      const formatted = `${a.street || ''}${a.streetNumber ? ', ' + a.streetNumber : ''}, ${a.district || ''}, ${a.city || ''}`
      setOccEndereco(formatted)
    }
    setLoadingGPS(false)
  }

  const searchAddress = (text) => {
    setOccEndereco(text)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (text.trim().length < 3) {
      setSuggestions([])
      return
    }

    searchTimeout.current = setTimeout(async () => {
      try {
        const query = encodeURIComponent(`${text}, São Paulo, Brasil`)
        const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=5&countrycodes=br`
        const response = await fetch(url, { headers: { 'User-Agent': 'ampara-tcc-app' } })
        const result = await response.json()
        setSuggestions(result || [])
      } catch (error) {
        setSuggestions([])
      }
    }, 600)
  }

  const selectSuggestion = (item) => {
    setOccEndereco(item.display_name)
    setOccCoords({ latitude: Number(item.lat), longitude: Number(item.lon) })
    setSuggestions([])
    Keyboard.dismiss()
  }

const handleSaveOccurrence = async () => {
    if (!occTipo || !occEndereco) {
      Alert.alert('Atenção', 'Preencha o tipo e o local.')
      return
    }

    try {
      setIsSaving(true)
      const { data: userData } = await supabase.auth.getUser()

      if (!userData?.user) {
        Alert.alert("Erro", "Usuário não autenticado.")
        return
      }

      // Mapeamento exato de acordo com a imagem image_73b13b.jpg
      const { error } = await supabase
        .from('occurrences')
        .insert([
          {
            user_id: userData.user.id,
            tipo_crime: occTipo,      // Nome da coluna na imagem image_73b13b.jpg
            address: occEndereco,     // Nome da coluna na imagem image_73b13b.jpg
            descricao: occDescricao,
            horario: occHorario,
            latitude: occCoords?.latitude,
            longitude: occCoords?.longitude,
            risk_score: magnitude || 0, // Adicionado para evitar erro de constraint se for obrigatório
          }
        ])

      if (error) throw error

      Alert.alert("Sucesso", "Ocorrência registrada na rede Ampara!")
      setReportModalVisible(false)
      resetForm()
    } catch (error) {
      console.error("Erro detalhado:", error)
      Alert.alert("Erro", `Não foi possível salvar: ${error.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  const resetForm = () => {
    setOccEndereco('')
    setOccTipo('')
    setOccDescricao('')
    setOccCoords(null)
    setSuggestions([])
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerContainer}>
          <Text style={styles.header}>Ampara</Text>
          <Text style={styles.subHeader}>Monitoramento ativo</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Monitor de Atividade:</Text>
          <Text style={styles.data}>👣 {stepCount} passos</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Sensores:</Text>
          <Text style={styles.data}>X: {x.toFixed(2)} | Y: {y.toFixed(2)} | Z: {z.toFixed(2)}</Text>
          <View style={styles.statusBox}>
            <Text style={styles.magnitudeLabel}>Força G:</Text>
            <Text style={[styles.magnitudeValue, { color: isHighRisk ? '#B91C1C' : '#2E8B57' }]}>
              {magnitude}
            </Text>
          </View>
          <Text style={styles.hint}>{isHighRisk ? "⚠️ Movimento brusco" : "✅ Estável"}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Localização:</Text>
          {location && region ? (
            <>
              <Text style={styles.geoText}>LAT: {location.coords.latitude.toFixed(6)}</Text>
              <View style={styles.mapContainer}>
                <MapView ref={mapRef} style={styles.map} region={region} onRegionChangeComplete={handleRegionChange}>
                  <Marker coordinate={location.coords} title="Você" />
                  <Circle center={location.coords} radius={500} fillColor="rgba(134, 97, 145, 0.15)" strokeColor="#000000" />
                  {crimeData.map((crime, i) => (
                    <Marker key={i} coordinate={{ latitude: crime.lat, longitude: crime.lon }} title={crime.tipo} pinColor="#B91C1C" />
                  ))}
                </MapView>
                {mapMoved && (
                  <TouchableOpacity style={styles.recenterButton} onPress={recenterMap}>
                    <Text style={styles.recenterText}>📍 Voltar para mim</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={[styles.crimeAlert, { backgroundColor: nearbyCrimes > 0 ? '#FFEBEE' : '#E8F5E9' }]}>
                <Text style={[styles.crimeAlertText, { color: nearbyCrimes > 0 ? '#C2185B' : '#2E8B57' }]}>
                  {nearbyCrimes > 0 ? `⚠️ ${nearbyCrimes} crimes na região` : "✅ Região segura"}
                </Text>
              </View>
            </>
          ) : (
            <Text>{errorMsg || "Carregando..."}</Text>
          )}
        </View>
      </ScrollView>

      {/* Botões Flutuantes */}
      <View style={styles.floatingContainer}>
        <TouchableOpacity style={styles.fabHelp} onPress={() => alert('Em breve: Tela de Orientações')}>
          <Text style={styles.fabText}>🆘 AJUDA</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.fabRegister} onPress={() => setReportModalVisible(true)}>
          <Text style={styles.fabText}>🚨 REGISTRAR</Text>
        </TouchableOpacity>
      </View>

      {/* Modal de Registro */}
      <Modal visible={reportModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flexOne}>
          <View style={styles.occOverlay}>
            <View style={styles.occModal}>
              <ScrollView contentContainerStyle={styles.occScrollContent} keyboardShouldPersistTaps="handled">
                <TouchableOpacity style={styles.helpQuickButton} onPress={() => alert('Acionando Protocolo...')}>
                  <Text style={styles.helpQuickText}>🆘 PRECISO DE AJUDA AGORA</Text>
                </TouchableOpacity>

                <Text style={styles.occTitle}>Registrar Ocorrência</Text>

                <Text style={styles.occLabel}>Onde ocorreu?</Text>
                <View style={styles.inputRow}>
                  <TextInput style={styles.inputFlex} placeholder="Endereço..." value={occEndereco} onChangeText={searchAddress} />
                  <TouchableOpacity style={styles.gpsBtn} onPress={handleUseCurrentLocation}>
                    {loadingGPS ? <ActivityIndicator size="small" color="#025382" /> : <Text style={styles.gpsIcon}>📍</Text>}
                  </TouchableOpacity>
                </View>

                {suggestions.length > 0 && (
                  <View style={styles.suggestionsBox}>
                    {suggestions.map((item, idx) => (
                      <TouchableOpacity key={idx} style={styles.suggestionItem} onPress={() => selectSuggestion(item)}>
                        <Text numberOfLines={1} style={styles.suggestionText}>{item.display_name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <Text style={styles.occLabel}>O que aconteceu?</Text>
                <View style={styles.typeContainer}>
                  {tiposOcorrencia.map(t => (
                    <TouchableOpacity key={t} style={[styles.typeButton, occTipo === t && styles.typeSelected]} onPress={() => setOccTipo(t)}>
                      <Text style={[styles.typeText, occTipo === t && styles.typeTextSelected]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* NOVO CAMPO: DESCRIÇÃO */}
                <Text style={styles.occLabel}>Descrição dos detalhes</Text>
                <TextInput
                  style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                  placeholder="Ex: Tinha um homem de casaco escuro seguindo..."
                  value={occDescricao}
                  onChangeText={setOccDescricao}
                  multiline
                />

                <Text style={styles.occLabel}>Horário</Text>
                <TextInput style={styles.input} value={occHorario} onChangeText={setOccHorario} keyboardType="numbers-and-punctuation" />

                <TouchableOpacity 
                  style={[styles.confirmBtn, isSaving && { opacity: 0.7 }]} 
                  onPress={handleSaveOccurrence}
                  disabled={isSaving}
                >
                  {isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.confirmBtnText}>Confirmar Registro</Text>}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => { setReportModalVisible(false); resetForm(); }}>
                  <Text style={styles.cancelText}>Cancelar</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal Alerta G */}
      <Modal transparent visible={modalVisible}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.alertTitle}>🚨 ALERTA</Text>
            <Text style={styles.alertText}>Detectamos {magnitude}G. Você está bem?</Text>
            <TouchableOpacity style={styles.button} onPress={() => setModalVisible(false)}>
              <Text style={styles.buttonText}>Estou bem</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  flexOne: { flex: 1 },
  container: { flex: 1, backgroundColor: '#F5EFEA' },
  scrollContent: { padding: 20, paddingBottom: 120 },
  headerContainer: { paddingTop: 40, marginBottom: 20 },
  header: { fontSize: 30, color: '#025382', fontWeight: '600' },
  subHeader: { color: '#3A7FA6' },
  card: { backgroundColor: '#FFF', padding: 20, borderRadius: 20, marginBottom: 16 },
  label: { color: '#3A7FA6', fontWeight: 'bold' },
  data: { color: '#333' },
  geoText: { color: '#555' },
  statusBox: { flexDirection: 'row', marginTop: 10 },
  magnitudeLabel: { color: '#555' },
  magnitudeValue: { fontSize: 30, marginLeft: 10 },
  hint: { marginTop: 5 },
  mapContainer: { height: 200, borderRadius: 15, overflow: 'hidden', marginTop: 10 },
  map: { flex: 1 },
  recenterButton: { position: 'absolute', bottom: 10, alignSelf: 'center', backgroundColor: '#025382', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, elevation: 5 },
  recenterText: { color: '#FFF', fontWeight: '600', fontSize: 13 },
  crimeAlert: { marginTop: 10, padding: 8, borderRadius: 10 },
  crimeAlertText: { fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#FFF', padding: 20, borderRadius: 20, width: '80%' },
  alertTitle: { fontSize: 22, fontWeight: 'bold', color: '#B91C1C', textAlign: 'center', marginBottom: 10 },
  alertText: { fontSize: 16, color: '#333', textAlign: 'center', marginBottom: 20 },
  button: { backgroundColor: '#4CAF50', padding: 15, borderRadius: 10, marginTop: 10 },
  buttonText: { color: '#FFF', textAlign: 'center', fontWeight: 'bold' },
  floatingContainer: { position: 'absolute', bottom: 30, right: 20, alignItems: 'flex-end' },
  fabHelp: { backgroundColor: '#B91C1C', paddingVertical: 12, paddingHorizontal: 18, borderRadius: 25, elevation: 8 },
  fabRegister: { backgroundColor: '#025382', marginTop: 12, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 25, elevation: 8 },
  fabText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  occOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  occModal: { backgroundColor: '#FFF', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20, maxHeight: '85%' },
  occScrollContent: { flexGrow: 1, paddingBottom: 20 },
  helpQuickButton: { backgroundColor: '#B91C1C', padding: 14, borderRadius: 12, marginBottom: 15, alignItems: 'center' },
  helpQuickText: { color: '#FFF', fontWeight: '900', fontSize: 14 },
  occTitle: { fontSize: 24, fontWeight: 'bold', color: '#025382', marginBottom: 10 },
  occLabel: { color: '#3A7FA6', fontWeight: 'bold', marginTop: 15, marginBottom: 5 },
  inputRow: { flexDirection: 'row', gap: 10 },
  input: { borderWidth: 1, borderColor: '#D8D0CC', borderRadius: 12, padding: 12, fontSize: 16, backgroundColor: '#FAFAFA' },
  inputFlex: { flex: 1, borderWidth: 1, borderColor: '#D8D0CC', borderRadius: 12, padding: 12, fontSize: 16, backgroundColor: '#FAFAFA' },
  gpsBtn: { backgroundColor: '#F5EFEA', width: 50, justifyContent: 'center', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#D8D0CC' },
  gpsIcon: { fontSize: 20 },
  typeContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 5 },
  typeButton: { padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#D8D0CC' },
  typeSelected: { backgroundColor: '#025382', borderColor: '#025382' },
  typeText: { color: '#333' },
  typeTextSelected: { color: '#FFF' },
  confirmBtn: { backgroundColor: '#025382', padding: 16, borderRadius: 15, marginTop: 25, alignItems: 'center' },
  confirmBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  cancelText: { textAlign: 'center', color: '#B91C1C', marginTop: 15, fontWeight: 'bold' },
  suggestionsBox: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DDD', borderRadius: 12, marginTop: 5, maxHeight: 150, overflow: 'hidden' },
  suggestionItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  suggestionText: { fontSize: 14, color: '#333' }
})