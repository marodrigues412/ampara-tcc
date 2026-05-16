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
  Platform,
  Switch
} from 'react-native'

import MapView, { Marker, Circle } from 'react-native-maps'
import * as Location from 'expo-location'
import { useRiskDetection } from '../hooks/useRiskDetection'
import { buscarCrimes } from '../services/crimesService'
import { supabase } from '../services/supabase'
import { getActivityStatus, updateActivityStatus } from "../services/activityService"

export default function Home({ navigation }) {
  const { data, location, riskStatus, errorMsg, stepCount } = useRiskDetection()
  
  // --- Estados de Interface e Mapa ---
  const [modalVisible, setModalVisible] = useState(false)
  const [crimeData, setCrimeData] = useState([])
  const [region, setRegion] = useState(null)
  const [userRegion, setUserRegion] = useState(null)
  const [mapMoved, setMapMoved] = useState(false)
  const mapRef = useRef(null)

  // --- Estados do Registro de Ocorrência (Amanda) ---
  const [reportModalVisible, setReportModalVisible] = useState(false)
  const [occEndereco, setOccEndereco] = useState('')
  const [occTipo, setOccTipo] = useState('')
  const [occDescricao, setOccDescricao] = useState('')
  const [occHorario, setOccHorario] = useState(new Date().toLocaleTimeString().slice(0, 5))
  const [occCoords, setOccCoords] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [loadingGPS, setLoadingGPS] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const searchTimeout = useRef(null)

  const { x, y, z } = data
  const { magnitude, isHighRisk } = riskStatus

  const tiposOcorrencia = [
    'Homicídio Doloso',
    'Tentativa de Homicídio',
    'Lesão Corporal Dolosa',
    'Latrocínio',
    'Estupro',
    'Roubo - Outros',
    'Roubo de Veículo',
    'Roubo de Carga',
    'Roubo a Banco',
    'Furto - Outros',
    'Furto de Veículo'
  ]

  // --- Estados do Score de Risco ---
  const [riskScore, setRiskScore] = useState(0)
  const [riskLevel, setRiskLevel] = useState("Baixo")

  // --- Estado do Modo Atividade ---
  const [activityMode, setActivityMode] = useState(false)

  useEffect(() => {
    loadActivity()
  }, [])

  async function loadActivity() {
    const user = (await supabase.auth.getUser()).data.user
    if (!user) return

    const data = await getActivityStatus(user.id)
    if (data) {
      setActivityMode(data.ativo)
    }
  }

  async function toggleActivity(value) {
    setActivityMode(value)

    const user = (await supabase.auth.getUser()).data.user
    if (!user) return

    await updateActivityStatus(user.id, value, "academia")
  }

  // --- Lógica de Cálculo de Risco ---
  useEffect(() => {
    let score = 0

    // Movimento brusco
    if (magnitude >= 4) {
      score += 6
    } else if (magnitude >= 2) {
      score += 3
    } else if (magnitude >= 1.2) {
      score += 1
    }

    // Crimes próximos
    if (crimeData.length > 15) {
      score += 4
    } else if (crimeData.length > 5) {
      score += 2
    }

    // Atividade reduz sensibilidade
    if (activityMode) {
      score -= 2
    }

    score = Math.max(score, 0)
    setRiskScore(score)

    if (score >= 8) {
      setRiskLevel("Crítico")
    } else if (score >= 4) {
      setRiskLevel("Moderado")
    } else {
      setRiskLevel("Baixo")
    }
  }, [magnitude, crimeData, activityMode])

  // Monitorar G Alto para abrir alerta
  useEffect(() => {
    if (isHighRisk && !modalVisible) {
      setModalVisible(true)
    }
  }, [isHighRisk])

  // Configurar região inicial do mapa
  useEffect(() => {
    if (location) {
      const initialRegion = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      }
      setRegion(initialRegion)
      setUserRegion(initialRegion)
    }
  }, [location])

  // =========================
  // CARREGAR CRIMES (Lógica da Maria)
  // =========================
  useEffect(() => {
    async function carregarCrimes() {
      try {
        const crimes = await buscarCrimes()
        if (!location) return

        const userLat = location.coords.latitude
        const userLon = location.coords.longitude

        const crimesFormatados = crimes
          .map((crime) => {
            const lat = Number(crime.latitude)
            const lon = Number(crime.longitude)
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

            return {
              id: crime.id || Math.random().toString(),
              lat,
              lon,
              tipo: crime.natureza_apurada || crime.conduta || 'Ocorrência',
              distancia: Math.sqrt(
                Math.pow((lat - userLat) * 111, 2) +
                Math.pow((lon - userLon) * 111, 2)
              )
            }
          })
          .filter(Boolean)
          .filter(crime => crime.distancia <= 20)
          .sort((a, b) => a.distancia - b.distancia)
          .slice(0, 100)

        setCrimeData(crimesFormatados)
      } catch (error) {
        console.error('ERRO AO BUSCAR CRIMES:', error)
      }
    }
    carregarCrimes()
  }, [location])

  // =========================
  // LÓGICA DE ENDEREÇO E REGISTRO (Lógica da Amanda)
  // =========================
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
    if (!occTipo || !occEndereco || !occHorario) {
      Alert.alert('Atenção', 'Preencha o tipo, o local e o horário.')
      return
    }

    try {
      setIsSaving(true)
      const { data: userData } = await supabase.auth.getUser()

      if (!userData?.user) {
        Alert.alert("Erro", "Usuário não autenticado.")
        return
      }

      const { error } = await supabase
        .from('occurrences')
        .insert([
          {
            user_id: userData.user.id,
            tipo_crime: occTipo,
            address: occEndereco,
            descricao: occDescricao,
            horario: occHorario, // Salvando o horário capturado ou editado
            latitude: occCoords?.latitude,
            longitude: occCoords?.longitude,
            risk_score: magnitude || 0,
          }
        ])

      if (error) throw error

      Alert.alert("Sucesso", "Ocorrência registrada na rede Ampara!")
      setReportModalVisible(false)
      resetForm()
    } catch (error) {
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
    setOccHorario(new Date().toLocaleTimeString().slice(0, 5)) // Reseta pegando a hora atualizada
  }

  const handleRegionChange = (newRegion) => {
    setRegion(newRegion)
    if (!userRegion) return
    const distance = Math.abs(newRegion.latitude - userRegion.latitude) + 
                     Math.abs(newRegion.longitude - userRegion.longitude)
    setMapMoved(distance > 0.002)
  }

  const recenterMap = () => {
    if (mapRef.current && userRegion) {
      mapRef.current.animateToRegion(userRegion, 500)
      setMapMoved(false)
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        
        {/* HEADER */}
        <View style={styles.headerContainer}>
          <Text style={styles.header}>Ampara</Text>
          <Text style={styles.subHeader}>Monitoramento ativo</Text>
        </View>

        {/* SCORE CARD */}
        <View style={styles.scoreCard}>
          <Text style={styles.scoreLabel}>Risco atual</Text>
          <Text style={styles.scoreValue}>{riskScore}</Text>
          <View style={[
            styles.scoreBadge,
            riskLevel === "Baixo" && styles.lowRisk,
            riskLevel === "Moderado" && styles.mediumRisk,
            riskLevel === "Crítico" && styles.highRisk
          ]}>
            <Text style={styles.scoreBadgeText}>{riskLevel}</Text>
          </View>
          <Text style={styles.scoreDescription}>Monitoramento em tempo real baseado em contexto</Text>
        </View>

        {/* MODO ATIVIDADE */}
        <View style={[styles.activityBanner, activityMode && styles.activityBannerActive]}>
          <View style={styles.activityHeader}>
            <View>
              <Text style={[styles.activityTitle, activityMode && styles.activityTitleActive]}>🏋️ Modo atividade</Text>
              <Text style={styles.activitySubtitle}>
                {activityMode ? "Monitoramento adaptado para exercícios" : "Evita falsos alertas durante exercícios"}
              </Text>
            </View>
            <Switch
              value={activityMode}
              onValueChange={toggleActivity}
              trackColor={{ false: "#DDD", true: "#C2185B" }}
              thumbColor="#FFF"
            />
          </View>
          {activityMode && <Text style={styles.activityStatus}>● Ativo agora</Text>}
        </View>

        {/* MAPA */}
        <View style={styles.mapFixedContainer}>
          {location && region ? (
            <>
              <MapView
                ref={mapRef}
                style={styles.map}
                region={region}
                onRegionChangeComplete={handleRegionChange}
              >
                <Marker coordinate={location.coords} title="Você" pinColor="blue" />
                <Circle
                  center={location.coords}
                  radius={500}
                  fillColor="rgba(194,24,91,0.10)"
                  strokeColor="#C2185B"
                />

                {crimeData.map(crime => (
                  <Marker
                    key={crime.id}
                    coordinate={{ latitude: crime.lat, longitude: crime.lon }}
                    title={crime.tipo}
                    description={`${crime.distancia.toFixed(2)} km`}
                    pinColor="#C2185B"
                  />
                ))}
              </MapView>
              {mapMoved && (
                <TouchableOpacity style={styles.recenterButton} onPress={recenterMap}>
                  <Text style={styles.recenterText}>📍 Voltar para mim</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <Text style={{ padding: 20 }}>{errorMsg || 'Carregando mapa...'}</Text>
          )}
        </View>

        {/* ALERTA CRIMES PRÓXIMOS */}
        <View style={[styles.crimeAlert, { backgroundColor: crimeData.length > 0 ? '#FFEBEE' : '#E8F5E9' }]}>
          <Text style={[styles.crimeAlertText, { color: crimeData.length > 0 ? '#C2185B' : '#2E8B57' }]}>
            {crimeData.length > 0 ? `⚠️ Área com registros recentes` : '✅ Região segura'}
          </Text>
        </View>

        {/* METRICS CONTAINER */}
        <View style={styles.metricsContainer}>
          <View style={styles.metricBox}>
            <Text style={styles.metricIcon}>👣</Text>
            <Text style={styles.metricValue}>{stepCount}</Text>
            <Text style={styles.metricLabel}>passos</Text>
          </View>

          <View style={styles.metricBox}>
            <Text style={styles.metricIcon}>📈</Text>
            <Text style={[styles.metricValue, { color: isHighRisk ? "#B91C1C" : "#2E8B57" }]}>
              {magnitude}
            </Text>
            <Text style={styles.metricLabel}>Força G</Text>
          </View>
        </View>

      </ScrollView>

      {/* BOTÕES FLUTUANTES */}
      <View style={styles.floatingContainer}>
        <TouchableOpacity style={styles.fabHelp} onPress={() => alert('Acionando contatos de emergência...')}>
          <Text style={styles.fabText}>🆘 AJUDA</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.fabRegister} onPress={() => setReportModalVisible(true)}>
          <Text style={styles.fabText}>🚨 REGISTRAR</Text>
        </TouchableOpacity>
      </View>

      {/* MODAL DE REGISTRO */}
      <Modal visible={reportModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flexOne}>
          <View style={styles.occOverlay}>
            <View style={styles.occModal}>
              <ScrollView contentContainerStyle={styles.occScrollContent} keyboardShouldPersistTaps="handled">
                <Text style={styles.occTitle}>Relatar Incidente</Text>

                <Text style={styles.occLabel}>Onde ocorreu?</Text>
                <View style={styles.inputRow}>
                  <TextInput style={styles.inputFlex} placeholder="Buscar endereço..." value={occEndereco} onChangeText={searchAddress} />
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

                {/* 👇 NOVO ENTRADA VISUAL: CAMPO DE HORÁRIO DO INCIDENTE */}
                <Text style={styles.occLabel}>Horário do Ocorrido</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: 19:45"
                  value={occHorario}
                  onChangeText={setOccHorario}
                  maxLength={5}
                  keyboardType="numbers-and-punctuation"
                />

                <Text style={styles.occLabel}>Descrição</Text>
                <TextInput
                  style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                  placeholder="Conte o que aconteceu..."
                  value={occDescricao}
                  onChangeText={setOccDescricao}
                  multiline
                />

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

      {/* MODAL ALERTA G */}
      <Modal transparent visible={modalVisible}>
        <View style={styles.alertOverlay}>
          <View style={styles.alertContent}>
            <Text style={styles.alertTitle}>🚨 MOVIMENTO BRUSCO</Text>
            <Text style={styles.alertText}>Detectamos uma força de {magnitude}G. Você está segura?</Text>
            <TouchableOpacity style={styles.okButton} onPress={() => setModalVisible(false)}>
              <Text style={styles.okButtonText}>Sim, estou bem</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

// --- Folha de Estilos ---
const styles = StyleSheet.create({
  flexOne: { flex: 1 },
  container: { flex: 1, backgroundColor: '#F5EFEA' },
  scrollContent: { padding: 20, paddingBottom: 120 },
  headerContainer: { paddingTop: 40, marginBottom: 20 },
  header: { fontSize: 42, color: '#025382', fontWeight: '700' },
  subHeader: { color: '#3A7FA6', fontSize: 18 },
  mapFixedContainer: { height: 350, borderRadius: 25, overflow: 'hidden', backgroundColor: '#FFF', marginBottom: 14 },
  map: { flex: 1 },
  recenterButton: { position: 'absolute', bottom: 15, alignSelf: 'center', backgroundColor: '#025382', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 20 },
  recenterText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  crimeAlert: { padding: 14, borderRadius: 16, marginBottom: 16 },
  crimeAlertText: { fontWeight: '700', fontSize: 16 },
  activityBanner: { backgroundColor: "#FFF", padding: 16, borderRadius: 20, marginBottom: 16, borderWidth: 1, borderColor: "#E8E0D8" },
  activityBannerActive: { backgroundColor: "#FFF0F7", borderColor: "#C2185B" },
  activityHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  activityTitle: { fontSize: 16, fontWeight: "700", color: "#333" },
  activityTitleActive: { color: "#C2185B" },
  activitySubtitle: { fontSize: 13, color: "#666", marginTop: 4, maxWidth: 220 },
  activityStatus: { marginTop: 10, color: "#C2185B", fontWeight: "700", fontSize: 12 },
  floatingContainer: { position: 'absolute', bottom: 30, right: 20, alignItems: 'flex-end' },
  fabHelp: { backgroundColor: '#B91C1C', paddingVertical: 14, paddingHorizontal: 22, borderRadius: 30, elevation: 8 },
  fabRegister: { backgroundColor: '#025382', marginTop: 12, paddingVertical: 14, paddingHorizontal: 22, borderRadius: 30, elevation: 8 },
  fabText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  occOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  occModal: { backgroundColor: '#FFF', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, maxHeight: '85%' },
  occScrollContent: { flexGrow: 1, paddingBottom: 20 },
  occTitle: { fontSize: 26, fontWeight: 'bold', color: '#025382', marginBottom: 20 },
  occLabel: { color: '#3A7FA6', fontWeight: 'bold', marginTop: 15, marginBottom: 8 },
  inputRow: { flexDirection: 'row', gap: 10 },
  inputFlex: { flex: 1, borderWidth: 1, borderColor: '#D8D0CC', borderRadius: 12, padding: 15, fontSize: 16, backgroundColor: '#FAFAFA' },
  input: { borderWidth: 1, borderColor: '#D8D0CC', borderRadius: 12, padding: 15, fontSize: 16, backgroundColor: '#FAFAFA', marginTop: 5 },
  gpsBtn: { backgroundColor: '#F5EFEA', width: 55, justifyContent: 'center', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#D8D0CC' },
  gpsIcon: { fontSize: 24 },
  typeContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 5 },
  typeButton: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#D8D0CC' },
  typeSelected: { backgroundColor: '#025382', borderColor: '#025382' },
  typeText: { color: '#333' },
  typeTextSelected: { color: '#FFF' },
  confirmBtn: { backgroundColor: '#025382', padding: 18, borderRadius: 15, marginTop: 30, alignItems: 'center' },
  confirmBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 18 },
  cancelText: { textAlign: 'center', color: '#B91C1C', marginTop: 20, fontWeight: 'bold', fontSize: 16 },
  suggestionsBox: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DDD', borderRadius: 12, marginTop: 5, maxHeight: 150 },
  suggestionItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  suggestionText: { fontSize: 14, color: '#333' },
  alertOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  alertContent: { backgroundColor: '#FFF', padding: 30, borderRadius: 25, width: '85%', alignItems: 'center' },
  alertTitle: { fontSize: 24, fontWeight: 'bold', color: '#B91C1C', marginBottom: 15 },
  alertText: { fontSize: 18, color: '#333', textAlign: 'center', marginBottom: 25 },
  okButton: { backgroundColor: '#4CAF50', paddingVertical: 15, paddingHorizontal: 40, borderRadius: 15 },
  okButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 18 },
  scoreCard: { backgroundColor: "#FFF8FC", paddingVertical: 20, paddingHorizontal: 16, borderRadius: 22, marginBottom: 16, alignItems: "center", borderWidth: 1, borderColor: "#F4C7DD" },
  scoreLabel: { fontSize: 14, fontWeight: "600", color: "#666" },
  scoreValue: { fontSize: 58, fontWeight: "bold", color: "#C2185B", marginVertical: 6 },
  scoreBadge: { paddingVertical: 6, paddingHorizontal: 18, borderRadius: 18 },
  scoreBadgeText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  scoreDescription: { marginTop: 10, fontSize: 12, color: "#777", textAlign: 'center' },
  lowRisk: { backgroundColor: "#4CAF50" },
  mediumRisk: { backgroundColor: "#FF9800" },
  highRisk: { backgroundColor: "#B91C1C" },
  metricsContainer: { flexDirection: "row", justifyContent: "space-between", marginTop: 8, marginBottom: 20 },
  metricBox: { backgroundColor: "#FFF", width: "48%", padding: 18, borderRadius: 20, alignItems: "center" },
  metricIcon: { fontSize: 26 },
  metricValue: { fontSize: 28, fontWeight: "bold", marginTop: 8 },
  metricLabel: { marginTop: 5, fontSize: 13, color: "#777" },
})