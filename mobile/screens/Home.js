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

// 🛑 COLE AQUI A URL COMPLETA DO SEU API ENDPOINT GERADA NO CONSOLE DO API GATEWAY DA AWS
const URL_AWS_GATEWAY = "https://2egghrwmeg.execute-api.us-east-1.amazonaws.com/default/ampara-alert-trigger";

export default function Home({ navigation }) {
  const { data, location, riskStatus, errorMsg, stepCount } = useRiskDetection()
  
  // --- Estados de Interface e Mapa ---
  const [modalVisible, setModalVisible] = useState(false)
  const [crimeData, setCrimeData] = useState([])
  const [region, setRegion] = useState(null)
  const [userRegion, setUserRegion] = useState(null)
  const [mapMoved, setMapMoved] = useState(false)
  const mapRef = useRef(null)

  // --- Estados do Registro de Ocorrência ---
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
  const [safeLocations, setSafeLocations] = useState([]);
  const [insideSafeZone, setInsideSafeZone] = useState(false);

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

  // --- Controle do Cronômetro de Alerta (Item 9 e 10) ---
  const [countdown, setCountdown] = useState(15)
  const [listaContatos, setListaContatos] = useState([])
  const timerRef = useRef(null)

  useEffect(() => {
    loadActivity();
    loadSafeLocations();
    loadEmergencyContacts();

    // Cria o canal de escuta em tempo real na tabela de locais seguros
    const safeLocationsChannel = supabase
      .channel('public:safe_locations')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'safe_locations' },
        () => {
          console.log('🔄 [REALTIME] Alteração detectada em safe_locations! Atualizando...');
          loadSafeLocations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(safeLocationsChannel);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [])

  async function loadActivity() {
    const user = (await supabase.auth.getUser()).data.user
    if (!user) return

    const data = await getActivityStatus(user.id)
    if (data) {
      setActivityMode(data.ativo)
    }
  }

  async function loadSafeLocations() {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const { data, error } = await supabase
        .from('safe_locations')
        .select('latitude, longitude')
        .eq('user_id', user.id);

      if (error) throw error;
      setSafeLocations(data || []);
    } catch (error) {
      console.error('❌ ERRO AO CARREGAR LOCAIS SEGUROS:', error);
    }
  }

  async function loadEmergencyContacts() {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const { data, error } = await supabase
        .from('emergency_contacts')
        .select('telefone')
        .eq('user_id', user.id);

      if (error) throw error;
      const telefones = data ? data.map(c => c.telefone) : [];
      setListaContatos(telefones);
    } catch (error) {
      console.error('❌ ERRO AO CARREGAR CONTATOS DE EMERGÊNCIA:', error);
    }
  }

  async function toggleActivity(value) {
    setActivityMode(value)

    const user = (await supabase.auth.getUser()).data.user
    if (!user) return

    await updateActivityStatus(user.id, value, "academia")
  }

  // --- Lógica de Cálculo de Risco Adaptável ---
  useEffect(() => {
    let score = 0
    let logMotivos = {
      movimentoBrusco: 0,
      crimesProximos: 0,
      modoAtividade: 0,
      localSeguro: 0
    }

    if(magnitude >= 4){
        score += 6
        logMotivos.movimentoBrusco = +6
    }
    else if(magnitude >= 2){
        score += 3
        logMotivos.movimentoBrusco = +3
    }
    else if(magnitude >= 1.2){
        score += 1
        logMotivos.movimentoBrusco = +1
    }

    if (crimeData.length > 15) {
      score += 4
      logMotivos.crimesProximos = +4
    } 
    else if (crimeData.length > 5) {
      score += 2
      logMotivos.crimesProximos = +2
    }

    if (activityMode) {
      score -= 2
      logMotivos.modoAtividade = -2
    }

    let emZonaSegura = false
    if (location && safeLocations.length > 0) {
      const userLat = location.coords.latitude
      const userLon = location.coords.longitude

      emZonaSegura = safeLocations.some((loc) => {
        const latSafe = Number(loc.latitude)
        const lonSafe = Number(loc.longitude)
        
        const distanciaEmKm = Math.sqrt(
          Math.pow((latSafe - userLat) * 111, 2) +
          Math.pow((lonSafe - userLon) * 111, 2)
        )
        return distanciaEmKm <= 0.08
      })

      if (emZonaSegura) {
        score -= 3
        logMotivos.localSeguro = -3
      }
    }

    setInsideSafeZone(emZonaSegura)
    score = Math.max(score, 0)
    setRiskScore(score)

    if(score >= 8){
        setRiskLevel("Crítico")
    }
    else if(score >= 4){
        setRiskLevel("Moderado")
    }
    else{
        setRiskLevel("Baixo")
    }

  }, [magnitude, crimeData, activityMode, location, safeLocations])

  // --- Lógica de Gerenciamento do Cronômetro Regressivo (Item 9) ---
  useEffect(() => {
    if (isHighRisk && !modalVisible) {
      setCountdown(15)
      setModalVisible(true)
      
      timerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current)
            setModalVisible(false)
            executarEnvioDeSocorro() 
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isHighRisk])

  // --- Função do Disparo Automático em Segundo Plano (Item 8 e 10) ---
const executarEnvioDeSocorro = async () => {
    if (!location) {
      console.error("❌ [Ampara] Abortando: Localização GPS ausente para resgate.");
      return;
    }

    const userLat = location.coords.latitude;
    const userLon = location.coords.longitude;
    
    // 1️⃣ DECLARA A VARIÁVEL AQUI (Acessível para a função toda)
    const linkMapa = `https://maps.google.com/?q=${userLat},${userLon}`;
    const textoMensagem = `ALERTA AMPARA: Amanda pode estar em perigo! Risco: ${riskLevel}. Localização: ${linkMapa}`;

    console.log("🚀 [Ampara] Disparando protocolo de socorro automático e silencioso...");

    // --- DISPARO DE SMS AUTOMÁTICO (AWS Lambda + Amazon SNS) ---
    try {
      const response = await fetch(URL_AWS_GATEWAY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nomeUsuario: "Amanda",
          latitude: userLat,
          longitude: userLon,
          nivelRisco: riskLevel,
          contatos: listaContatos.length > 0 ? listaContatos : ["+5511999999999"] 
        })
      });

      if (response.ok) {
        console.log("✅ [AWS Nuvem] Requisição aceita com sucesso pelo API Gateway!");
      } else {
        console.warn(`⚠️ [AWS Nuvem] Servidor respondeu com código de alerta: ${response.status}`);
      }
    } catch (error) {
      console.error("❌ [AWS Nuvem] Falha de rede ao conectar com o API Gateway:", error);
    }

    // --- REGISTRO AUTOMÁTICO DE AUDITORIA NO SUPABASE (alert_logs) ---
    // --- REGISTRO AUTOMÁTICO DE AUDITORIA NO SUPABASE (alert_logs) ---
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      
      if (userError || !userData?.user) {
        console.error("❌ [Supabase] Erro: Usuário não autenticado ou sessão expirada.", userError);
        return;
      }

      // Prepara os números exatamente para o campo text 'recipient_names'
      const contatosString = listaContatos.length > 0 ? listaContatos.join(', ') : "+5511999999999";

      console.log("⏳ [Supabase] Tentando inserir na alert_logs para o UID:", userData.user.id);

      // Faz o insert capturando explicitamente o retorno de erro do Postgres
      const { error: insertError } = await supabase
        .from('alert_logs')
        .insert([
          {
            user_id: userData.user.id,        // uuid null -> Vinculado a auth.users
            message: textoMensagem,           // text null
            recipient_names: contatosString   // text null
          }
        ]);

      if (insertError) {
        // Se o Postgres rejeitar por RLS (Row Level Security) ou FK, vai estourar aqui
        console.error("❌ [Supabase] O Postgres rejeitou o insert:", insertError.message, insertError.details);
      } else {
        console.log("✅ [Supabase] Log de alerta cravado com sucesso na tabela alert_logs!");
      }

    } catch (supabaseError) {
      console.error("❌ [Supabase] Falha grave de execução no bloco alert_logs:", supabaseError);
    }
  }

  const handleUserIsSafe = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setModalVisible(false)
    setCountdown(15)
    console.log("🔒 [Ampara] Envio automático abortado pela usuária.")
  }

  // Região inicial do mapa
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

  // --- Carregamento de Ocorrências SSP-SP (Lógica da Maria) ---
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
              tipo: crime.natureza_apurada || crime.condcta || 'Ocorrência',
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
        console.error('❌ ERRO AO FILTRAR CRIMES:', error)
      }
    }
    carregarCrimes()
  }, [location])

  // --- Lógica Geocodificação Reversa / Nominatim (Lógica da Amanda) ---
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
            horario: occHorario,
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
    setOccHorario(new Date().toLocaleTimeString().slice(0, 5))
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
        
        {insideSafeZone && (
          <View style={styles.safeZoneBanner}>
            <Text style={styles.safeZoneBannerTitle}>Perímetro Seguro Ativo</Text>
            <Text style={styles.safeZoneBannerSubtitle}>O nível de risco local foi ajustado para este estabelecimento cadastrado.</Text>
          </View>
        )}
  
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
        <TouchableOpacity style={styles.fabHelp} onPress={executarEnvioDeSocorro}>
          <Text style={styles.fabText}>🆘 SOS IMEDIATO</Text>
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

      {/* MODAL DO CRONÔMETRO DE SEGURANÇA */}
      <Modal transparent visible={modalVisible} animationType="fade">
        <View style={styles.alertOverlay}>
          <View style={styles.alertContent}>
            <Text style={styles.alertTitle}>🚨 CONTATO DE SEGURANÇA</Text>
            <Text style={styles.alertText}>
              Detectamos um movimento incomum de {magnitude}G no dispositivo.
            </Text>
            
            <View style={styles.timerCircle}>
              <Text style={styles.timerCountText}>{countdown}</Text>
              <Text style={styles.timerSecondsText}>segundos</Text>
            </View>

            <Text style={styles.alertWarningText}>
              Os contatos de emergência e a central serão acionados automaticamente após o limite.
            </Text>

            <TouchableOpacity style={styles.okButton} onPress={handleUserIsSafe}>
              <Text style={styles.okButtonText}>Estou bem, cancelar envio</Text>
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
  alertOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  alertContent: { backgroundColor: '#FFF', padding: 25, borderRadius: 25, width: '85%', alignItems: 'center' },
  alertTitle: { fontSize: 20, fontWeight: 'bold', color: '#B91C1C', marginBottom: 10, textAlign: 'center' },
  alertText: { fontSize: 16, color: '#333', textAlign: 'center', marginBottom: 15 },
  alertWarningText: { fontSize: 13, color: '#666', textAlign: 'center', marginVertical: 15, paddingHorizontal: 10 },
  okButton: { backgroundColor: '#4CAF50', paddingVertical: 15, width: '100%', borderRadius: 15, alignItems: 'center' },
  okButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  scoreCard: { backgroundColor: "#FFF8FC", paddingVertical: 20, paddingHorizontal: 16, borderRadius: 22, marginBottom: 16, alignItems: "center", borderWidth: 1, borderColor: "#F4C7DD" },
  scoreLabel: { fontSize: 14, fontWeight: "600", color: "#666" },
  scoreValue: { fontSize: 58, fontWeight: "bold", color: "#C2185B", marginVertical: 6 },
  scoreBadge: { paddingVertical: 6, paddingHorizontal: 18, borderRadius: 18 },
  scoreBadgeText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  scoreDescription: { marginTop: 10, fontSize: 12, color: "#777", textAlign: 'center' },
  lowRisk: { backgroundColor: "#4CAF50" },
  mediumRisk: { backgroundColor: "#FF9800" },
  highRisk: { backgroundColor: "#B91C1C" },
  safeZoneBanner: { backgroundColor: '#FFF', padding: 16, borderRadius: 20, marginBottom: 16, borderWidth: 1.5, borderColor: '#025382', elevation: 1, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4 },
  safeZoneBannerTitle: { fontSize: 16, fontWeight: 'bold', color: '#025382' },
  safeZoneBannerSubtitle: { fontSize: 13, color: '#3A7FA6', marginTop: 4, fontWeight: '500' },
  metricsContainer: { flexDirection: "row", justifyContent: "space-between", marginTop: 8, marginBottom: 20 },
  metricBox: { backgroundColor: "#FFF", width: "48%", padding: 18, borderRadius: 20, alignItems: "center" },
  metricIcon: { fontSize: 26 },
  metricValue: { fontSize: 28, fontWeight: "bold", marginTop: 8 },
  metricLabel: { marginTop: 5, fontSize: 13, color: "#777" },
  timerCircle: { width: 100, height: 100, borderRadius: 50, borderWidth: 4, borderColor: '#B91C1C', justifyContent: 'center', alignItems: 'center', marginVertical: 10 },
  timerCountText: { fontSize: 36, fontWeight: 'bold', color: '#B91C1C' },
  timerSecondsText: { fontSize: 11, color: '#666', fontWeight: '600' }
})