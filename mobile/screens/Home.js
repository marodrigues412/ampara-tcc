import React, { useState, useEffect, useRef } from 'react'
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  Pressable,
  ScrollView,
  TextInput,
  Keyboard,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Switch
} from 'react-native'

import MapView, { Marker, Circle } from 'react-native-maps'
import * as Location from 'expo-location'
import { Ionicons } from '@expo/vector-icons'
import { Image } from 'react-native'
import { Svg, Path } from 'react-native-svg'
import { useRiskDetection } from '../hooks/useRiskDetection'
import { buscarCrimes, buscarOcorrencias } from '../services/crimesService'
import { supabase } from '../services/supabase'
import { getActivityStatus, updateActivityStatus } from "../services/activityService"

// 🛑 URL DO API ENDPOINT NO API GATEWAY DA AWS
const URL_AWS_GATEWAY = "https://2egghrwmeg.execute-api.us-east-1.amazonaws.com/default/ampara-alert-trigger";

const screenWidth = Dimensions.get('window').width

const getRiskRGB = (level) => {
  if (level === 'Crítico') return '196, 104, 122'
  if (level === 'Moderado') return '212, 160, 23'
  return '46, 139, 87'
}

const getRiskLabel = (level) => {
  if (level === 'Crítico') return 'Alto risco · tenha atenção redobrada'
  if (level === 'Moderado') return 'Risco moderado · mantenha o cuidado'
  return 'Baixo risco · ambiente monitorado'
}

function HomeGaugeChart({ score, rgbColor }) {
  const cx = 100, cy = 100, r = 70, sw = 22
  const viewH = 112
  const svgWidth = screenWidth - 140
  const svgHeight = svgWidth * viewH / 200

  const bgPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`

  let fgPath = null
  if (score > 0) {
    const angleRad = Math.PI * (1 - score / 10)
    const xEnd = cx + r * Math.cos(angleRad)
    const yEnd = cy - r * Math.sin(angleRad)
    fgPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${xEnd.toFixed(2)} ${yEnd.toFixed(2)}`
  }

  return (
    <Svg width={svgWidth} height={svgHeight} viewBox={`0 0 200 ${viewH}`}>
      <Path
        d={bgPath}
        stroke="rgba(180,180,180,0.25)"
        strokeWidth={sw}
        fill="none"
        strokeLinecap="round"
      />
      {fgPath && (
        <Path
          d={fgPath}
          stroke={`rgb(${rgbColor})`}
          strokeWidth={sw}
          fill="none"
          strokeLinecap="round"
        />
      )}
    </Svg>
  )
}

export default function Home({ navigation }) {
  const { data, location, riskStatus, errorMsg } = useRiskDetection()
  
  // --- Estados de Interface e Mapa ---
  const [modalVisible, setModalVisible] = useState(false)
  const [crimeData, setCrimeData] = useState([])
  const [occurrenceData, setOccurrenceData] = useState([])
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
  const [occData, setOccData] = useState(new Date().toLocaleDateString('pt-BR'))
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
  const [countdown, setCountdown] = useState(30)
  const [listaContatos, setListaContatos] = useState([])
  const [alertaDisparado, setAlertaDisparado] = useState(false);
  const timerRef = useRef(null);
  const lastAlertSentRef = useRef(null);
  const cancelCooldownRef = useRef(null);
  const highMagnitudeTimerRef = useRef(null);
  const [sustainedHighRisk, setSustainedHighRisk] = useState(false);
  const [sosHolding, setSosHolding] = useState(false);
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
          loadSafeLocations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(safeLocationsChannel);
    };
  }, [])

  // Magnitude sustentada — só marca como alto risco após 3s contínuos acima do limite
  useEffect(() => {
    if (isHighRisk || riskLevel === "Crítico") {
      if (!highMagnitudeTimerRef.current) {
        highMagnitudeTimerRef.current = setTimeout(() => {
          setSustainedHighRisk(true);
          highMagnitudeTimerRef.current = null;
        }, 3000);
      }
    } else {
      if (highMagnitudeTimerRef.current) {
        clearTimeout(highMagnitudeTimerRef.current);
        highMagnitudeTimerRef.current = null;
      }
      setSustainedHighRisk(false);
    }
    return () => {
      if (highMagnitudeTimerRef.current) clearTimeout(highMagnitudeTimerRef.current);
    };
  }, [isHighRisk, riskLevel]);

  // 1️⃣ GATILHO DO MODAL — só abre se risco sustentado e fora de cooldowns
  useEffect(() => {
    if (!sustainedHighRisk || modalVisible || alertaDisparado) return;

    const agora = Date.now();
    const emCooldownEnvio = lastAlertSentRef.current && (agora - lastAlertSentRef.current) < 30 * 60 * 1000;
    const emCooldownCancelamento = cancelCooldownRef.current && agora < cancelCooldownRef.current;

    if (emCooldownEnvio || emCooldownCancelamento) return;

    setCountdown(30);
    setModalVisible(true);
  }, [sustainedHighRisk, modalVisible, alertaDisparado]);

  // 2️⃣ O MOTOR SEGURO
  useEffect(() => {
    if (!modalVisible) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    if (countdown === 0 && modalVisible && !alertaDisparado) {
      
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
    const { data } = await supabase.from('user_profiles').select('nome').eq('id', user.id).single();
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

    lastAlertSentRef.current = Date.now();

    const userLat = location.coords.latitude;
    const userLon = location.coords.longitude;
    const linkMapa = `https://maps.google.com/?q=${userLat},${userLon}`;
    
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
          endereco: enderecoFormatado,
          latitude: userLat,
          longitude: userLon,
          nivelRisco: riskLevel,
          contatos: listaContatos.length > 0
            ? listaContatos.map(t => {
                const cleaned = t.trim()
                if (cleaned.startsWith('+')) return cleaned
                const digits = cleaned.replace(/\D/g, '')
                return digits.startsWith('55') ? `+${digits}` : `+55${digits}`
              })
            : []
        })
      });
    } catch (error) {
      console.error("❌ [AWS Nuvem] Falha de rede ao conectar com o API Gateway:", error);
    }

    // 2. Log Supabase
    try {
      const { data: userData, error: authError } = await supabase.auth.getUser();

      if (!authError && userData?.user) {
        const { error: insertError } = await supabase.from('alert_logs').insert([{
            user_id: userData.user.id,
            message: textoMensagem,
            recipient_names: contatosAEnviar.join(', ')
        }]);

        if (insertError) {
          console.error("❌ [Alerta] Falha ao gravar log:", insertError.message);
        } else {
          console.log("✅ [Alerta] Notificação enviada e gravada com sucesso.");
        }
      }
    } catch (supabaseError) {
      console.error("❌ [Alerta] Erro inesperado ao gravar log:", supabaseError);
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
    setCountdown(30)
    setAlertaDisparado(false)
    setSustainedHighRisk(false)
    cancelCooldownRef.current = Date.now() + 5 * 60 * 1000
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

  useEffect(() => {
    async function carregarOcorrencias() {
      if (!location) return
      try {
        const dados = await buscarOcorrencias()
        const userLat = location.coords.latitude
        const userLon = location.coords.longitude
        const formatadas = dados.map((occ) => {
          const lat = Number(occ.latitude)
          const lon = Number(occ.longitude)
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
          return {
            id: 'occ_' + occ.id,
            lat,
            lon,
            tipo: occ.tipo_crime || 'Ocorrência relatada',
            descricao: occ.descricao || '',
            horario: occ.horario || '',
            address: occ.address || '',
            distancia: Math.sqrt(Math.pow((lat - userLat) * 111, 2) + Math.pow((lon - userLon) * 111, 2))
          }
        }).filter(Boolean).filter(occ => occ.distancia <= 20)
        setOccurrenceData(formatadas)
      } catch (error) { console.error('❌ ERRO AO CARREGAR OCORRÊNCIAS:', error) }
    }
    carregarOcorrencias()
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
    if (!occTipo || !occEndereco || !occHorario || !occData) { Alert.alert('Atenção', 'Preencha o tipo, o local, a data e o horário.'); return; }

    const partesData = occData.split('/')
    if (partesData.length !== 3 || partesData[2].length !== 4) { Alert.alert('Data inválida', 'Use o formato DD/MM/AAAA.'); return; }
    const [dia, mes, ano] = partesData
    const dataOcorrencia = new Date(Number(ano), Number(mes) - 1, Number(dia))
    if (isNaN(dataOcorrencia.getTime())) { Alert.alert('Data inválida', 'Verifique a data informada.'); return; }

    const agora = new Date()
    const hojeZerado = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
    if (dataOcorrencia > hojeZerado) { Alert.alert('Data inválida', 'Não é possível registrar ocorrências em datas futuras.'); return; }

    const partesHorario = occHorario.split(':')
    if (partesHorario.length !== 2) { Alert.alert('Horário inválido', 'Use o formato HH:MM.'); return; }
    const ocorrenciaDatetime = new Date(Number(ano), Number(mes) - 1, Number(dia), Number(partesHorario[0]), Number(partesHorario[1]))
    if (ocorrenciaDatetime > agora) { Alert.alert('Horário inválido', 'Não é possível registrar ocorrências em horários futuros.'); return; }

    try { setIsSaving(true); const { data: userData } = await supabase.auth.getUser()
      if (!userData?.user) { Alert.alert("Erro", "Usuário não autenticado."); return; }
      const dataIso = `${ano}-${mes}-${dia}`
      const { error } = await supabase.from('occurrences').insert([{ user_id: userData.user.id, tipo_crime: occTipo, address: occEndereco, descricao: occDescricao, horario: occHorario, data_ocorrencia: dataIso, latitude: occCoords?.latitude, longitude: occCoords?.longitude, risk_score: magnitude || 0 }]);
      if (error) throw error; Alert.alert("Sucesso", "Ocorrência registrada na rede Ampara!"); setReportModalVisible(false); resetForm();
    } catch (error) { Alert.alert("Erro", `Não foi possível salvar: ${error.message}`) }
    finally { setIsSaving(false) }
  }

  const resetForm = () => { setOccEndereco(''); setOccTipo(''); setOccDescricao(''); setOccCoords(null); setSuggestions([]); setOccHorario(new Date().toLocaleTimeString().slice(0, 5)); setOccData(new Date().toLocaleDateString('pt-BR')); }

  const handleRegionChange = (newRegion) => { setRegion(newRegion); if (!userRegion) return; const distance = Math.abs(newRegion.latitude - userRegion.latitude) + Math.abs(newRegion.longitude - userRegion.longitude); setMapMoved(distance > 0.002); }

  const recenterMap = () => { if (mapRef.current && userRegion) { mapRef.current.animateToRegion(userRegion, 500); setMapMoved(false); } }

  const riskBg = riskLevel === 'Crítico' ? '#FDEAEC' : riskLevel === 'Moderado' ? '#FFFBEB' : '#EAF5EC'
  const riskAccent = riskLevel === 'Crítico' ? '#C4687A' : riskLevel === 'Moderado' ? '#D4A017' : '#2E8B57'

  return (
    <View style={styles.container}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>

        {/* ── HEADER ── */}
        <View style={styles.headerContainer}>
          <View>
            <Text style={styles.header}>Ampara</Text>
            <Text style={styles.subHeader}>Monitoramento ativo</Text>
          </View>
          <Image source={require('../assets/images/maos-ampara-rosa.png')} style={{ width: 38, height: 38 }} resizeMode="contain" />
        </View>

        {/* ── RISCO — sem card ── */}
        <View style={styles.riskSection}>
          <View style={styles.riskRow}>
            <Text style={styles.riskLabel}>Risco atual</Text>
            <View style={[styles.riskBadge, { backgroundColor: riskAccent }]}>
              <Text style={styles.riskBadgeText}>{riskLevel}</Text>
            </View>
          </View>

          <View style={{ alignItems: 'center' }}>
            <View>
              <HomeGaugeChart score={riskScore} rgbColor={getRiskRGB(riskLevel)} />
              <View style={styles.gaugeScoreOverlay}>
                <Text style={[styles.gaugeScoreBig, { color: riskAccent }]}>
                  {riskScore}
                  <Text style={styles.gaugeScoreMax}>/10</Text>
                </Text>
              </View>
            </View>
            <Text style={styles.gaugeDesc}>{getRiskLabel(riskLevel)}</Text>
          </View>
        </View>

        {insideSafeZone && (
          <View style={styles.safeStrip}>
            <Ionicons name="checkmark-circle" size={16} color="#2E8B57" />
            <Text style={styles.safeStripText}>Você está em um perímetro seguro cadastrado</Text>
          </View>
        )}

        {/* ── MODO ATIVIDADE ── */}
        <View style={[styles.activityRow, activityMode && styles.activityRowActive]}>
          <View style={[styles.activityIconWrap, activityMode && styles.activityIconWrapActive]}>
            <Ionicons name="fitness-outline" size={20} color={activityMode ? '#FFF' : '#5A8FAF'} />
          </View>
          <View style={styles.activityTexts}>
            <Text style={[styles.activityTitle, activityMode && { color: '#C4687A' }]}>Modo atividade</Text>
            <Text style={styles.activitySubtitle}>
              {activityMode ? 'Adaptado para exercícios' : 'Evita falsos alertas durante treinos'}
            </Text>
          </View>
          <Switch
            value={activityMode}
            onValueChange={toggleActivity}
            trackColor={{ false: '#D0C8C0', true: '#C4687A' }}
            thumbColor="#FFF"
          />
        </View>
        <View style={styles.separator} />

        {/* ── MAPA — arredondado sem card ── */}
        <View style={styles.mapContainer}>
          {location && region ? (
            <>
              <MapView
                ref={mapRef}
                style={styles.map}
                region={region}
                onRegionChangeComplete={handleRegionChange}
              >
                <Marker coordinate={location.coords} title="Você" pinColor="#5A8FAF" />
                <Circle
                  center={location.coords}
                  radius={500}
                  fillColor="rgba(196,104,122,0.10)"
                  strokeColor="#C4687A"
                />
                {crimeData.map(crime => (
                  <Marker key={crime.id}
                    coordinate={{ latitude: crime.lat, longitude: crime.lon }}
                    title={crime.tipo}
                    description={`${crime.distancia.toFixed(2)} km`}
                    pinColor="#6B1A2E"
                  />
                ))}
                {occurrenceData.map(occ => (
                  <Marker key={occ.id}
                    coordinate={{ latitude: occ.lat, longitude: occ.lon }}
                    title={occ.tipo}
                    description={occ.descricao || occ.address || `${occ.distancia.toFixed(2)} km`}
                    pinColor="#C4687A"
                  />
                ))}
              </MapView>

              <View style={styles.mapLegend}>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#5A8FAF' }]} /><Text style={styles.legendText}>Você</Text></View>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#6B1A2E' }]} /><Text style={styles.legendText}>SSP</Text></View>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#C4687A' }]} /><Text style={styles.legendText}>Ampara</Text></View>
              </View>

              {mapMoved && (
                <TouchableOpacity style={styles.recenterButton} onPress={recenterMap}>
                  <Ionicons name="locate" size={16} color="#FFF" />
                  <Text style={styles.recenterText}>Voltar para mim</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <Text style={{ padding: 20 }}>{errorMsg || 'Carregando mapa...'}</Text>
          )}
        </View>

        {/* ── CRIME STRIP — slim, sem card ── */}
        <View style={[styles.crimeStrip, { borderLeftColor: crimeData.length > 0 ? '#C4687A' : '#2E8B57' }]}>
          <Ionicons
            name={crimeData.length > 0 ? 'warning-outline' : 'checkmark-circle-outline'}
            size={16}
            color={crimeData.length > 0 ? '#C4687A' : '#2E8B57'}
          />
          <Text style={[styles.crimeStripText, { color: crimeData.length > 0 ? '#C4687A' : '#2E8B57' }]}>
            {crimeData.length > 0 ? `${crimeData.length} registros na área` : 'Região sem alertas recentes'}
          </Text>
        </View>

        {/* ── FORÇA G — inline, sem card ── */}
        <View style={styles.forceRow}>
          <Ionicons name="pulse-outline" size={20} color={isHighRisk ? '#C4687A' : '#5A8FAF'} />
          <Text style={[styles.forceValue, { color: isHighRisk ? '#C4687A' : '#1B3A6B' }]}>{magnitude}G</Text>
          <Text style={styles.forceLabel}>Força de aceleração</Text>
          {isHighRisk && <View style={styles.forcePill}><Text style={styles.forcePillText}>Alto</Text></View>}
        </View>
        <View style={styles.separator} />

      </ScrollView>

      {/* BOTÕES FLUTUANTES */}
      <View style={styles.floatingContainer}>
        <Pressable
          style={[styles.fabHelp, sosHolding && styles.fabHelpHolding]}
          onLongPress={executarEnvioDeSocorro}
          onPressIn={() => setSosHolding(true)}
          onPressOut={() => setSosHolding(false)}
          delayLongPress={3000}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="alert-circle" size={18} color="#FFF" />
            <Text style={styles.fabText}>SOS</Text>
          </View>
          {sosHolding && <Text style={styles.fabHoldHint}>segure...</Text>}
        </Pressable>
        <TouchableOpacity style={styles.fabRegister} onPress={() => setReportModalVisible(true)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="clipboard-outline" size={18} color="#FFF" />
            <Text style={styles.fabText}>REGISTRAR</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* ========================================================= */}
      {/* 🛑 MODAL DE FEEDBACK DE SOS ENVIADO (PADRÃO CARD AMPARA)  */}
      {/* ========================================================= */}
      <Modal transparent visible={sosFeedbackVisible} animationType="fade">
        <View style={styles.overlayCentered}>
          <View style={styles.cardModal}>
            <View style={[styles.modalStrip, { backgroundColor: '#4CAF50' }]} />
            <View style={styles.modalInner}>
              <Text style={styles.cardTitleCritical}>Alerta Enviado</Text>
              <Text style={styles.cardSubtitle}>Sua rede de apoio recebeu um SMS com sua localização.</Text>

              <View style={styles.feedbackBox}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Ionicons name="location" size={14} color="#5A8FAF" />
                  <Text style={styles.feedbackLabel}>Localização enviada</Text>
                </View>
                <Text style={styles.feedbackAddressText}>{sosFeedbackData.endereco}</Text>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, marginBottom: 4 }}>
                  <Ionicons name="call" size={14} color="#5A8FAF" />
                  <Text style={styles.feedbackLabel}>Contatos acionados</Text>
                </View>
                {sosFeedbackData.contatos.map((c, i) => (
                  <Text key={i} style={styles.feedbackContact}>{c}</Text>
                ))}
              </View>

              <TouchableOpacity style={styles.btnPrimary} onPress={() => setSosFeedbackVisible(false)}>
                <Text style={styles.btnPrimaryText}>Entendido</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.btnHelpGuide}
                onPress={() => { setSosFeedbackVisible(false); navigation.navigate('HelpGuide') }}
              >
                <Text style={styles.btnHelpGuideText}>O que fazer agora?</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================= */}
      {/* 🚨 MODAL DE REGISTRO (ATUALIZADO PARA PADRÃO CARD AMPARA) */}
      {/* ========================================================= */}
      <Modal visible={reportModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flexOne}>
          <View style={styles.overlayBottom}>
            <View style={styles.cardModalBottom}>
              <View style={[styles.modalStrip, { backgroundColor: '#E8622A' }]} />
              <ScrollView contentContainerStyle={styles.occScrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={styles.modalHandle} />
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 6 }}>
                  <Ionicons name="warning-outline" size={22} color="#E8622A" />
                  <Text style={styles.cardTitle}>Relatar Incidente</Text>
                </View>
                <Text style={styles.cardSubtitle}>Ajude a mapear áreas de risco compartilhando dados com a rede.</Text>

                <Text style={styles.occLabel}>Onde ocorreu?</Text>
                <View style={styles.inputRow}>
                  <TextInput style={styles.inputFlex} placeholder="Buscar endereço..." value={occEndereco} onChangeText={searchAddress} />
                  <TouchableOpacity style={styles.gpsBtn} onPress={handleUseCurrentLocation}>
                    {loadingGPS ? <ActivityIndicator size="small" color="#1B3A6B" /> : <Ionicons name="locate" size={18} color="#1B3A6B" />}
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
                    <Text style={styles.occLabel}>Data</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="DD/MM/AAAA"
                      value={occData}
                      onChangeText={setOccData}
                      maxLength={10}
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
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
                  style={[styles.btnOrange, { marginTop: 25 }, isSaving && { opacity: 0.7 }]}
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
            <View style={styles.modalStrip} />
            <View style={styles.modalInner}>
              <Text style={styles.cardTitleCritical}>Contato de Segurança</Text>
              <Text style={styles.cardSubtitle}>
                Movimento incomum de {magnitude}G detectado.
              </Text>

              <View style={{alignItems: 'center', marginVertical: 10}}>
                <View style={styles.timerCircle}>
                  <Text style={styles.timerCountText}>{countdown}</Text>
                  <Text style={styles.timerSecondsText}>seg</Text>
                </View>
              </View>

              <Text style={styles.alertWarningText}>
                Seus contatos serão acionados automaticamente quando o contador zerar.
              </Text>

              <TouchableOpacity style={styles.btnSafe} onPress={handleUserIsSafe}>
                <Text style={styles.btnSafeText}>Estou bem — Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  )
}

const styles = StyleSheet.create({
  flexOne: { flex: 1 },
  container: { flex: 1, backgroundColor: '#F5EFE6' },
  scrollContent: { paddingBottom: 130 },

  // ── Header ──
  headerContainer: { paddingTop: 52, paddingHorizontal: 22, paddingBottom: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  header: { fontSize: 34, color: '#1B3A6B', fontWeight: '200', letterSpacing: 3 },
  subHeader: { color: '#C4687A', fontSize: 13, marginTop: 2 },

  // ── Risco sem card ──
  riskSection: { paddingHorizontal: 22, paddingVertical: 16, marginBottom: 4 },
  riskRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  riskLabel: { fontSize: 13, color: '#5A8FAF', fontWeight: '700' },
  riskBadge: { paddingVertical: 6, paddingHorizontal: 16, borderRadius: 20 },
  riskBadgeText: { color: '#FFF', fontWeight: '600', fontSize: 13, letterSpacing: 0.5 },
  gaugeScoreOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center' },
  gaugeScoreBig: { fontSize: 44, fontWeight: '900', lineHeight: 50 },
  gaugeScoreMax: { fontSize: 20, fontWeight: '400', color: '#888' },
  gaugeDesc: { fontSize: 13, color: '#666', marginTop: 14, textAlign: 'center' },

  // ── Safe zone strip ──
  safeStrip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 22, paddingVertical: 10, backgroundColor: '#EAF5EC' },
  safeStripText: { fontSize: 13, color: '#2E8B57', fontWeight: '500' },

  // ── Activity row ──
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFF',
    borderRadius: 18,
    elevation: 2,
    shadowColor: '#1B3A6B',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
  },
  activityRowActive: {
    backgroundColor: '#FDEAEC',
  },
  activityIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EEF6FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityIconWrapActive: {
    backgroundColor: '#C4687A',
  },
  activityTexts: { flex: 1 },
  activityTitle: { fontSize: 15, fontWeight: '700', color: '#1B3A6B' },
  activitySubtitle: { fontSize: 12, color: '#5A8FAF', marginTop: 2 },

  separator: { height: 1, backgroundColor: '#E8E0D8', marginHorizontal: 22 },

  // ── Mapa arredondado sem card ──
  mapContainer: { height: 300, borderRadius: 20, overflow: 'hidden', marginHorizontal: 20, marginBottom: 16 },
  map: { flex: 1 },
  recenterButton: { position: 'absolute', bottom: 14, alignSelf: 'center', backgroundColor: '#1B3A6B', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 20 },
  mapLegend: { position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, gap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: '#333', fontWeight: '600' },
  recenterText: { color: '#FFF', fontWeight: '600', fontSize: 13 },

  // ── Crime strip ──
  crimeStrip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, paddingVertical: 14, borderLeftWidth: 3 },
  crimeStripText: { fontSize: 14, fontWeight: '500' },

  // ── Força G inline ──
  forceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 22, paddingVertical: 16 },
  forceValue: { fontSize: 22, fontWeight: '700' },
  forceLabel: { fontSize: 13, color: '#AAA', flex: 1 },
  forcePill: { backgroundColor: '#FDEAEC', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12 },
  forcePillText: { color: '#C4687A', fontSize: 11, fontWeight: '700' },

  // ── FABs ──
  floatingContainer: { position: 'absolute', bottom: 30, right: 20, alignItems: 'flex-end' },
  fabHelp: { backgroundColor: '#E8622A', paddingVertical: 14, paddingHorizontal: 22, borderRadius: 30, elevation: 8, alignItems: 'center' },
  fabHelpHolding: { backgroundColor: '#B84C14', transform: [{ scale: 1.08 }] },
  fabHoldHint: { color: '#FFD8B0', fontSize: 10, fontWeight: '600', marginTop: 2 },
  fabRegister: { backgroundColor: '#C4687A', marginTop: 10, paddingVertical: 14, paddingHorizontal: 22, borderRadius: 30, elevation: 8 },
  fabText: { color: '#FFF', fontWeight: '600', fontSize: 14, letterSpacing: 0.5 },
  
  // --- ESTILOS GLOBAIS DE MODAL ---
  overlayCentered: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  cardModal: { backgroundColor: '#FFF', borderRadius: 28, overflow: 'hidden', width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 20, elevation: 12 },
  modalStrip: { height: 6, backgroundColor: '#C4687A', width: '100%' },
  modalInner: { padding: 25 },
  cardTitle: { fontSize: 22, fontWeight: '700', color: '#1B3A6B', marginBottom: 5, textAlign: 'center' },
  cardTitleCritical: { fontSize: 22, fontWeight: '700', color: '#C4687A', marginBottom: 5, textAlign: 'center' },
  cardSubtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 20, paddingHorizontal: 10, lineHeight: 20 },

  // Botões
  btnPrimary: { backgroundColor: '#1B3A6B', paddingVertical: 16, borderRadius: 30, alignItems: 'center', width: '100%' },
  btnPrimaryText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  btnCancelText: { textAlign: 'center', color: '#C4687A', marginTop: 15, fontWeight: '600', fontSize: 15 },
  btnHelpGuide: { marginTop: 12, paddingVertical: 14, borderRadius: 30, alignItems: 'center', backgroundColor: '#F5EFE6' },
  btnHelpGuideText: { color: '#1B3A6B', fontWeight: '700', fontSize: 14 },
  btnSafe: { backgroundColor: '#4CAF50', paddingVertical: 15, width: '100%', borderRadius: 30, alignItems: 'center' },
  btnSafeText: { color: '#FFF', fontWeight: '700', fontSize: 16 },

  // Estilos da caixa de Feedback SOS
  // Estilos da caixa de Feedback SOS
  feedbackBox: { backgroundColor: '#F5EFE6', padding: 15, borderRadius: 15, marginBottom: 25, borderWidth: 1, borderColor: '#E8E0D8' },
  feedbackLabel: { fontSize: 12, fontWeight: 'bold', color: '#5A8FAF', marginBottom: 5 },
  feedbackAddressText: { fontSize: 16, color: '#C4687A', fontWeight: 'bold', marginBottom: 5 }, // <-- NOVO ESTILO AQUI
  feedbackText: { fontSize: 14, color: '#333', fontStyle: 'italic' },
  feedbackContact: { fontSize: 15, color: '#1B3A6B', fontWeight: '600', marginTop: 3 },

  // Bottom sheet modal (relato de incidente)
  overlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  cardModalBottom: { backgroundColor: '#FFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '90%', overflow: 'hidden', elevation: 20 },
  modalHandle: { width: 40, height: 4, backgroundColor: '#DDD', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 16 },
  btnOrange: { backgroundColor: '#E8622A', paddingVertical: 16, borderRadius: 30, alignItems: 'center', width: '100%' },

  // Estilos do Formulário de Registro
  occScrollContent: { flexGrow: 1, padding: 22, paddingTop: 0 },
  occLabel: { color: '#1B3A6B', fontWeight: '700', marginTop: 15, marginBottom: 8, fontSize: 14 },
  inputRow: { flexDirection: 'row', gap: 10 },
  inputFlex: { flex: 1, borderWidth: 1, borderColor: '#D8D0CC', borderRadius: 14, padding: 14, fontSize: 15, backgroundColor: '#F9F9F9' },
  input: { borderWidth: 1, borderColor: '#D8D0CC', borderRadius: 14, padding: 14, fontSize: 15, backgroundColor: '#F9F9F9', marginTop: 5 },
  gpsBtn: { backgroundColor: '#F5EFE6', width: 55, justifyContent: 'center', alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: '#D8D0CC' },
  gpsIcon: { fontSize: 20 },
  typeContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 5 },
  typeButton: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: '#D8D0CC', backgroundColor: '#FFF' },
  typeSelected: { backgroundColor: '#1B3A6B', borderColor: '#1B3A6B' },
  typeText: { color: '#555', fontSize: 13, fontWeight: '500' },
  typeTextSelected: { color: '#FFF', fontWeight: 'bold' },
  suggestionsBox: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#D8D0CC', borderRadius: 12, marginTop: 5, maxHeight: 150 },
  suggestionItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#F5EFE6' },
  suggestionText: { fontSize: 13, color: '#333' },

  // Estilos do Cronômetro
  timerCircle: { width: 90, height: 90, borderRadius: 45, borderWidth: 4, borderColor: '#C4687A', justifyContent: 'center', alignItems: 'center', marginVertical: 10 },
  timerCountText: { fontSize: 32, fontWeight: 'bold', color: '#C4687A' },
  timerSecondsText: { fontSize: 11, color: '#666', fontWeight: '600' },
  alertWarningText: { fontSize: 13, color: '#666', textAlign: 'center', marginVertical: 15, paddingHorizontal: 10 },
})