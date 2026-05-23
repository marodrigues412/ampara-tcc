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

// 🛑 URL DO API ENDPOINT NO API GATEWAY DA AWS
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
  const [userName, setUserName] = useState("Usuária"); // Valor padrão

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

  // --- Controle do Cronômetro de Alerta e Feedback SOS ---
  const [countdown, setCountdown] = useState(15)
  const [listaContatos, setListaContatos] = useState([])
  const [alertaDisparado, setAlertaDisparado] = useState(false);
  const timerRef = useRef(null);
// NOVO: Estados para a tela de confirmação do SOS
  const [sosFeedbackVisible, setSosFeedbackVisible] = useState(false);
  const [sosFeedbackData, setSosFeedbackData] = useState({ mensagem: '', contatos: [], endereco: '' });
  
  // --- Inicialização e Escuta Realtime do Supabase ---
  useEffect(() => {
    loadActivity();
    loadSafeLocations();
    loadEmergencyContacts();
    loadUserData();

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
    };
  }, [])

  useEffect(() => {
  console.log("🔍 [Debug Sensores] Magnitude atual:", magnitude);
  
  if (magnitude > 1.5) {
     console.log("⚠️ [Debug Sensores] Magnitude acima do limite! Disparando...");
  }
  }, [magnitude]);

  // 1️⃣ GATILHO DO MODAL
  useEffect(() => {
    if ((isHighRisk || riskLevel === "Crítico") && !modalVisible && !alertaDisparado) {
      setCountdown(15);
      setAlertaDisparado(false);
      setModalVisible(true);
      console.log("⏱️ [Timer Ampara] Estado crítico detectado! Abrindo modal visual e resetando countdown para 15s.");
    }
  }, [isHighRisk, riskLevel, modalVisible, alertaDisparado]);

  // 2️⃣ O MOTOR SEGURO
  useEffect(() => {
    if (!modalVisible) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    if (countdown === 0 && modalVisible && !alertaDisparado) {
      console.log("🚀 [Timer Ampara] Zerou com precisão! Cancelando motor e disparando protocolo automático único...");
      
      setAlertaDisparado(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      setModalVisible(false);
      
      executarEnvioDeSocorro();
      return;
    }

    if (countdown > 0 && modalVisible && !alertaDisparado) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const proximoSegundo = countdown - 1;
        setCountdown(proximoSegundo);
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [countdown, isHighRisk, modalVisible, alertaDisparado]);

  async function loadUserData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Tenta buscar o nome (assumindo que você tem uma tabela 'profiles')
    const { data } = await supabase.from('profiles').select('nome').eq('id', user.id).single();
    if (data?.nome) {
     setUserName(data.nome);
   }
  }
  
  async function loadActivity() {
    const user = (await supabase.auth.getUser()).data.user
    if (!user) return
    const data = await getActivityStatus(user.id)
    if (data) setActivityMode(data.ativo)
  }

  async function loadSafeLocations() {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;
      const { data, error } = await supabase.from('safe_locations').select('latitude, longitude').eq('user_id', user.id);
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
      const { data, error } = await supabase.from('emergency_contacts').select('telefone').eq('user_id', user.id);
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
    if (magnitude >= 4) { score += 6; }
    else if (magnitude >= 2) { score += 3; }
    else if (magnitude >= 1.2) { score += 1; }

    if (crimeData.length > 15) { score += 4; }
    else if (crimeData.length > 5) { score += 2; }

    if (activityMode) { score -= 2; }

    let emZonaSegura = false
    if (location && safeLocations.length > 0) {
      const userLat = location.coords.latitude
      const userLon = location.coords.longitude
      emZonaSegura = safeLocations.some((loc) => {
        const latSafe = Number(loc.latitude)
        const lonSafe = Number(loc.longitude)
        const distanciaEmKm = Math.sqrt(Math.pow((latSafe - userLat) * 111, 2) + Math.pow((lonSafe - userLon) * 111, 2));
        return distanciaEmKm <= 0.08;
      });
      if (emZonaSegura) { score -= 3; }
    }

    setInsideSafeZone(emZonaSegura)
    score = Math.max(score, 0)
    setRiskScore(score)

    if (score >= 8) { setRiskLevel("Crítico") }
    else if (score >= 4) { setRiskLevel("Moderado") }
    else { setRiskLevel("Baixo") }
  }, [magnitude, crimeData, activityMode, location, safeLocations])

// --- Função do Disparo de Socorro ---
  const executarEnvioDeSocorro = async () => {
    if (!location) {
      Alert.alert("Erro", "Localização GPS ausente para o resgate.");
      return;
    }

    const userLat = location.coords.latitude;
    const userLon = location.coords.longitude;
    const linkMapa = `http://googleusercontent.com/maps.google.com/maps?q=${userLat},${userLon}`;
    
    // 🔍 BUSCA DO ENDEREÇO LEGÍVEL (Geocodificação Reversa)
    let enderecoFormatado = "Endereço não identificado (Apenas GPS)";
    try {
      const addressArray = await Location.reverseGeocodeAsync({ latitude: userLat, longitude: userLon });
      if (addressArray && addressArray.length > 0) {
        const a = addressArray[0];
        // Monta a string: "Nome da Rua, Número - Bairro, Cidade"
        enderecoFormatado = `${a.street || a.name || ''}${a.streetNumber ? ', ' + a.streetNumber : ''} - ${a.district || a.subregion || ''}, ${a.city || ''}`;
      }
    } catch (e) {
      console.log("Erro ao buscar endereço reverso no SOS:", e);
    }

    // A mensagem de texto agora inclui o endereço em texto plano e o link do mapa
    const textoMensagem = `🚨 ALERTA AMPARA: ${userName} pode estar em perigo! Risco: ${riskLevel}. Local: ${enderecoFormatado}. Mapa: ${linkMapa}`;
    const contatosAEnviar = listaContatos.length > 0 ? listaContatos : ["Nenhum contato cadastrado"];

    console.log("🚀 [Ampara] Disparando protocolo de socorro automático...");

    // 1. Envio AWS
    try {
      await fetch(URL_AWS_GATEWAY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nomeUsuario: userName,
          latitude: userLat,
          longitude: userLon,
          nivelRisco: riskLevel,
          contatos: listaContatos.length > 0 ? listaContatos : ["+5511999999999"] 
        })
      });
    } catch (error) {
      console.error("❌ [AWS Nuvem] Falha de rede ao conectar com o API Gateway:", error);
    }

    // 2. Log Supabase
    try {
      console.log("⏳ [Supabase] Verificando autenticação...");
      const { data: userData, error: authError } = await supabase.auth.getUser();
      
      if (authError || !userData?.user) {
        console.error("❌ [Supabase] Usuário não está logado no App! O log foi abortado.");
      } else {
        console.log(`⏳ [Supabase] Gravando log para o usuário: ${userData.user.id}`);
        
        const { error: insertError } = await supabase.from('alert_logs').insert([{
            user_id: userData.user.id,
            message: textoMensagem,
            recipient_names: contatosAEnviar.join(', ')
        }]);

        if (insertError) {
          console.error("❌ [Supabase] O Postgres rejeitou o insert:", insertError.message, insertError.details);
        } else {
          console.log("✅ [Supabase] Alerta gravado com sucesso na tabela alert_logs!");
        }
      }
    } catch (supabaseError) {
      console.error("❌ [Supabase] Falha grave de código no bloco alert_logs:", supabaseError);
    }

    // 3. Mostrar Feedback Visual para a Usuária (agora com o endereço em destaque)
    setSosFeedbackData({
      mensagem: textoMensagem,
      contatos: contatosAEnviar,
      endereco: enderecoFormatado
    });
    setSosFeedbackVisible(true);
  }

  const handleUserIsSafe = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setModalVisible(false)
    setCountdown(15)
    setAlertaDisparado(false)
    console.log("🔒 [Ampara] Envio automático abortado pela usuária.")
  }

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

  useEffect(() => {
    async function carregarCrimes() {
      try {
        const crimes = await buscarCrimes()
        if (!location) return
        const userLat = location.coords.latitude
        const userLon = location.coords.longitude
        const crimesFormatados = crimes.map((crime) => {
          const lat = Number(crime.latitude); const lon = Number(crime.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
          return { id: crime.id || Math.random().toString(), lat, lon, tipo: crime.natureza_apurada || crime.condcta || 'Ocorrência',
            distancia: Math.sqrt(Math.pow((lat - userLat) * 111, 2) + Math.pow((lon - userLon) * 111, 2))
          }
        }).filter(Boolean).filter(crime => crime.distancia <= 20).sort((a, b) => a.distancia - b.distancia).slice(0, 100)
        setCrimeData(crimesFormatados)
      } catch (error) { console.error('❌ ERRO AO FILTRAR CRIMES:', error) }
    }
    carregarCrimes()
  }, [location])

  const handleUseCurrentLocation = async () => {
    setLoadingGPS(true)
    let { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') { Alert.alert('Erro', 'Permissão de GPS negada'); setLoadingGPS(false); return; }
    let loc = await Location.getCurrentPositionAsync({})
    const { latitude, longitude } = loc.coords
    setOccCoords({ latitude, longitude })
    const address = await Location.reverseGeocodeAsync({ latitude, longitude })
    if (address && address.length > 0) { const a = address[0]; setOccEndereco(`${a.street || ''}${a.streetNumber ? ', ' + a.streetNumber : ''}, ${a.district || ''}, ${a.city || ''}`); }
    setLoadingGPS(false)
  }

  const searchAddress = (text) => {
    setOccEndereco(text)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (text.trim().length < 3) { setSuggestions([]); return; }
    searchTimeout.current = setTimeout(async () => {
      try { const query = encodeURIComponent(`${text}, São Paulo, Brasil`); const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=5&countrycodes=br`;
        const response = await fetch(url, { headers: { 'User-Agent': 'ampara-tcc-app' } }); const result = await response.json(); setSuggestions(result || []);
      } catch (error) { setSuggestions([]); }
    }, 600)
  }

  const selectSuggestion = (item) => { setOccEndereco(item.display_name); setOccCoords({ latitude: Number(item.lat), longitude: Number(item.lon) }); setSuggestions([]); Keyboard.dismiss(); }

  const handleSaveOccurrence = async () => {
    if (!occTipo || !occEndereco || !occHorario) { Alert.alert('Atenção', 'Preencha o tipo, o local e o horário.'); return; }
    try { setIsSaving(true); const { data: userData } = await supabase.auth.getUser()
      if (!userData?.user) { Alert.alert("Erro", "Usuário não autenticado."); return; }
      const { error } = await supabase.from('occurrences').insert([{ user_id: userData.user.id, tipo_crime: occTipo, address: occEndereco, descricao: occDescricao, horario: occHorario, latitude: occCoords?.latitude, longitude: occCoords?.longitude, risk_score: magnitude || 0 }]);
      if (error) throw error; Alert.alert("Sucesso", "Ocorrência registrada na rede Ampara!"); setReportModalVisible(false); resetForm();
    } catch (error) { Alert.alert("Erro", `Não foi possível salvar: ${error.message}`) }
    finally { setIsSaving(false) }
  }

  const resetForm = () => { setOccEndereco(''); setOccTipo(''); setOccDescricao(''); setOccCoords(null); setSuggestions([]); setOccHorario(new Date().toLocaleTimeString().slice(0, 5)); }

  const handleRegionChange = (newRegion) => { setRegion(newRegion); if (!userRegion) return; const distance = Math.abs(newRegion.latitude - userRegion.latitude) + Math.abs(newRegion.longitude - userRegion.longitude); setMapMoved(distance > 0.002); }

  const recenterMap = () => { if (mapRef.current && userRegion) { mapRef.current.animateToRegion(userRegion, 500); setMapMoved(false); } }

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
          <Text style={styles.fabText}>🆘 SOS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.fabRegister} onPress={() => setReportModalVisible(true)}>
          <Text style={styles.fabText}>🚨 REGISTRAR</Text>
        </TouchableOpacity>
      </View>

      {/* ========================================================= */}
      {/* 🛑 MODAL DE FEEDBACK DE SOS ENVIADO (PADRÃO CARD AMPARA)  */}
      {/* ========================================================= */}
      <Modal transparent visible={sosFeedbackVisible} animationType="fade">
        <View style={styles.overlayCentered}>
          <View style={styles.cardModal}>
            <Text style={styles.cardTitleCritical}>✅ Alerta Enviado</Text>
            <Text style={styles.cardSubtitle}>Sua rede de apoio recebeu um SMS com a sua localização em tempo real.</Text>
            
            <View style={styles.feedbackBox}>
              <Text style={styles.feedbackLabel}>📍 Localização enviada:</Text>
              <Text style={styles.feedbackAddressText}>{sosFeedbackData.endereco}</Text>
              
              <Text style={[styles.feedbackLabel, { marginTop: 15 }]}>✉️ Mensagem exata:</Text>
              <Text style={styles.feedbackText}>{sosFeedbackData.mensagem}</Text>
              
              <Text style={[styles.feedbackLabel, { marginTop: 15 }]}>📞 Contatos acionados:</Text>
              {sosFeedbackData.contatos.map((c, i) => (
                <Text key={i} style={styles.feedbackContact}>{c}</Text>
              ))}
            </View>

            <TouchableOpacity style={styles.btnPrimary} onPress={() => setSosFeedbackVisible(false)}>
              <Text style={styles.btnPrimaryText}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ========================================================= */}
      {/* 🚨 MODAL DE REGISTRO (ATUALIZADO PARA PADRÃO CARD AMPARA) */}
      {/* ========================================================= */}
      <Modal visible={reportModalVisible} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flexOne}>
          <View style={styles.overlayCentered}>
            <View style={[styles.cardModal, { maxHeight: '85%' }]}>
              <ScrollView contentContainerStyle={styles.occScrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.cardTitle}>Relatar Incidente</Text>
                <Text style={styles.cardSubtitle}>Ajude a mapear áreas de risco compartilhando dados com a rede.</Text>

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

                <View style={{flexDirection: 'row', gap: 10}}>
                  <View style={{flex: 1}}>
                    <Text style={styles.occLabel}>Horário</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Ex: 19:45"
                      value={occHorario}
                      onChangeText={setOccHorario}
                      maxLength={5}
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                </View>

                <Text style={styles.occLabel}>Descrição (Opcional)</Text>
                <TextInput
                  style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                  placeholder="Mais detalhes ajudam na inteligência do mapa..."
                  value={occDescricao}
                  onChangeText={setOccDescricao}
                  multiline
                />

                <TouchableOpacity 
                  style={[styles.btnPrimary, { marginTop: 25 }, isSaving && { opacity: 0.7 }]} 
                  onPress={handleSaveOccurrence}
                  disabled={isSaving}
                >
                  {isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnPrimaryText}>Publicar Ocorrência</Text>}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => { setReportModalVisible(false); resetForm(); }}>
                  <Text style={styles.btnCancelText}>Cancelar e Voltar</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ========================================================= */}
      {/* ⏱️ MODAL DO CRONÔMETRO DE SEGURANÇA (MANTIDO)             */}
      {/* ========================================================= */}
      <Modal transparent visible={modalVisible} animationType="fade">
        <View style={styles.overlayCentered}>
          <View style={styles.cardModal}>
            <Text style={styles.cardTitleCritical}>🚨 CONTATO DE SEGURANÇA</Text>
            <Text style={styles.cardSubtitle}>
              Detectamos um movimento incomum de {magnitude}G no dispositivo.
            </Text>
            
            <View style={{alignItems: 'center'}}>
              <View style={styles.timerCircle}>
                <Text style={styles.timerCountText}>{countdown}</Text>
                <Text style={styles.timerSecondsText}>segundos</Text>
              </View>
            </View>

            <Text style={styles.alertWarningText}>
              Os contatos de emergência serão acionados automaticamente após o limite.
            </Text>

            <TouchableOpacity style={styles.btnSafe} onPress={handleUserIsSafe}>
              <Text style={styles.btnSafeText}>Estou bem, cancelar envio</Text>
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
  
  scoreCard: { backgroundColor: "#FFF8FC", paddingVertical: 20, paddingHorizontal: 16, borderRadius: 22, marginBottom: 16, alignItems: "center", borderWidth: 1, borderColor: "#F4C7DD" },
  scoreLabel: { fontSize: 14, fontWeight: "600", color: "#666" },
  scoreValue: { fontSize: 58, fontWeight: "bold", color: "#C2185B", marginVertical: 6 },
  scoreBadge: { paddingVertical: 6, paddingHorizontal: 18, borderRadius: 18 },
  scoreBadgeText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  scoreDescription: { marginTop: 10, fontSize: 12, color: "#777", textAlign: 'center' },
  lowRisk: { backgroundColor: "#4CAF50" },
  mediumRisk: { backgroundColor: "#FF9800" },
  highRisk: { backgroundColor: "#B91C1C" },
  
  safeZoneBanner: { backgroundColor: '#FFF', padding: 16, borderRadius: 20, marginBottom: 16, borderWidth: 1.5, borderColor: '#025382', elevation: 1 },
  safeZoneBannerTitle: { fontSize: 16, fontWeight: 'bold', color: '#025382' },
  safeZoneBannerSubtitle: { fontSize: 13, color: '#3A7FA6', marginTop: 4, fontWeight: '500' },
  
  metricsContainer: { flexDirection: "row", justifyContent: "space-between", marginTop: 8, marginBottom: 20 },
  metricBox: { backgroundColor: "#FFF", width: "48%", padding: 18, borderRadius: 20, alignItems: "center" },
  metricIcon: { fontSize: 26 },
  metricValue: { fontSize: 28, fontWeight: "bold", marginTop: 8 },
  metricLabel: { marginTop: 5, fontSize: 13, color: "#777" },
  
  // --- ESTILOS GLOBAIS DE MODAL (PADRÃO CARD AMPARA) ---
  overlayCentered: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  cardModal: { backgroundColor: '#FFF', borderRadius: 25, padding: 25, width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 8 },
  cardTitle: { fontSize: 22, fontWeight: 'bold', color: '#025382', marginBottom: 5, textAlign: 'center' },
  cardTitleCritical: { fontSize: 22, fontWeight: 'bold', color: '#B91C1C', marginBottom: 5, textAlign: 'center' },
  cardSubtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 20, paddingHorizontal: 10 },
  
  // Estilos de Botões Padrão Card
  btnPrimary: { backgroundColor: '#025382', paddingVertical: 16, borderRadius: 15, alignItems: 'center', width: '100%' },
  btnPrimaryText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  btnCancelText: { textAlign: 'center', color: '#B91C1C', marginTop: 15, fontWeight: '600', fontSize: 15 },
  btnSafe: { backgroundColor: '#4CAF50', paddingVertical: 15, width: '100%', borderRadius: 15, alignItems: 'center' },
  btnSafeText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },

  // Estilos da caixa de Feedback SOS
  // Estilos da caixa de Feedback SOS
  feedbackBox: { backgroundColor: '#F5EFEA', padding: 15, borderRadius: 15, marginBottom: 25, borderWidth: 1, borderColor: '#E8E0D8' },
  feedbackLabel: { fontSize: 12, fontWeight: 'bold', color: '#3A7FA6', marginBottom: 5 },
  feedbackAddressText: { fontSize: 16, color: '#B91C1C', fontWeight: 'bold', marginBottom: 5 }, // <-- NOVO ESTILO AQUI
  feedbackText: { fontSize: 14, color: '#333', fontStyle: 'italic' },
  feedbackContact: { fontSize: 15, color: '#025382', fontWeight: '600', marginTop: 3 },

  // Estilos do Formulário de Registro
  occScrollContent: { flexGrow: 1 },
  occLabel: { color: '#025382', fontWeight: '700', marginTop: 15, marginBottom: 8, fontSize: 14 },
  inputRow: { flexDirection: 'row', gap: 10 },
  inputFlex: { flex: 1, borderWidth: 1, borderColor: '#D8D0CC', borderRadius: 14, padding: 14, fontSize: 15, backgroundColor: '#F9F9F9' },
  input: { borderWidth: 1, borderColor: '#D8D0CC', borderRadius: 14, padding: 14, fontSize: 15, backgroundColor: '#F9F9F9', marginTop: 5 },
  gpsBtn: { backgroundColor: '#F5EFEA', width: 55, justifyContent: 'center', alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: '#D8D0CC' },
  gpsIcon: { fontSize: 20 },
  typeContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 5 },
  typeButton: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: '#D8D0CC', backgroundColor: '#FFF' },
  typeSelected: { backgroundColor: '#025382', borderColor: '#025382' },
  typeText: { color: '#555', fontSize: 13, fontWeight: '500' },
  typeTextSelected: { color: '#FFF', fontWeight: 'bold' },
  suggestionsBox: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#D8D0CC', borderRadius: 12, marginTop: 5, maxHeight: 150 },
  suggestionItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#F5EFEA' },
  suggestionText: { fontSize: 13, color: '#333' },

  // Estilos do Cronômetro
  timerCircle: { width: 90, height: 90, borderRadius: 45, borderWidth: 4, borderColor: '#B91C1C', justifyContent: 'center', alignItems: 'center', marginVertical: 10 },
  timerCountText: { fontSize: 32, fontWeight: 'bold', color: '#B91C1C' },
  timerSecondsText: { fontSize: 11, color: '#666', fontWeight: '600' },
  alertWarningText: { fontSize: 13, color: '#666', textAlign: 'center', marginVertical: 15, paddingHorizontal: 10 },
})