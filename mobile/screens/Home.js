import React, { useState, useEffect, useRef, useMemo } from 'react'
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
  Switch,
  Linking,
  Image
} from 'react-native'

import { useFocusEffect } from '@react-navigation/native'
import * as Location from 'expo-location'
import { Ionicons } from '@expo/vector-icons'
import { useRiskDetection } from '../hooks/useRiskDetection'
import { buscarOcorrencias, buscarMapaCalor, buscarResumoCrimes } from '../services/crimesService'
import { supabase } from '../services/supabase'
import { getActivityStatus, updateActivityStatus } from "../services/activityService"
import { saveLocationPoint } from "../services/locationService"
import { useSmartwatch } from '../hooks/useSmartwatch'
import { calculateMotionRiskScore } from '../utils/motionRiskScore'
import { calculateHeartRateBaseline } from '../services/heartRateBaseline'
import { calculateExperimentalRiskScore, EXPERIMENTAL_RISK_SCORE_VERSION, getExperimentalRiskLevel } from '../services/experimentalRiskScore'
import { Brand } from '../constants/brandTheme'

import { dispararAlerta } from '../services/alertService'
import { camadasDifusas, DENSIDADE_VERMELHO } from '../utils/mapaCalor'
import { distanceKm } from '../utils/geo'

// Raio da primeira busca, antes de o mapa informar a área que está mostrando.
const RAIO_INICIAL_KM = 3
// Teto do raio: o Supabase devolve no máximo 1.000 registros por consulta, então pedir
// uma área muito maior só espalharia os mesmos pontos e deixaria o calor sem sentido.
const RAIO_MAXIMO_KM = 12
// Quanto buscar além da tela. Só o suficiente para cobrir o arredondamento da grade e o
// fato de a área ser um círculo inscrito num retângulo: com margem grande, o recorte
// quadrado da busca aparecia dentro da tela como uma borda reta de cor.
const MARGEM_BUSCA = 1.2

const mapLibre = Platform.OS === 'ios' ? null : require('@maplibre/maplibre-react-native')
const nativeMaps = Platform.OS === 'ios' ? require('react-native-maps') : null
const MapLibreMap = mapLibre?.Map
const MapLibreCamera = mapLibre?.Camera
const MapLibreGeoJSONSource = mapLibre?.GeoJSONSource
const MapLibreLayer = mapLibre?.Layer
const MapView = nativeMaps?.default
const { Circle, Marker } = nativeMaps || {}

const SHOW_PRESENTATION_MODE = false
const LIVE_HEART_RATE_MS = 10_000

const criarGeoJSONMapa = (crimes, ocorrencias) => ({
  type: 'FeatureCollection',
  features: [
    ...crimes.map(crime => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [Number(crime.lon), Number(crime.lat)] },
      properties: { kind: 'crime' },
    })).filter(feature => feature.geometry.coordinates.every(Number.isFinite)),
    ...ocorrencias.map(occ => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [Number(occ.lon), Number(occ.lat)] },
      properties: { kind: 'occurrence' },
    })).filter(feature => feature.geometry.coordinates.every(Number.isFinite)),
  ],
})

const criarGeoJSONRaio = (latitude, longitude, radiusMeters) => {
  const latitudeRadians = latitude * Math.PI / 180
  const angularRadius = radiusMeters / 6371008.8
  const coordinates = Array.from({ length: 64 }, (_, index) => {
    const bearing = (index / 64) * 2 * Math.PI
    const targetLatitude = Math.asin(
      Math.sin(latitudeRadians) * Math.cos(angularRadius)
      + Math.cos(latitudeRadians) * Math.sin(angularRadius) * Math.cos(bearing),
    )
    const targetLongitude = longitude * Math.PI / 180 + Math.atan2(
      Math.sin(bearing) * Math.sin(angularRadius) * Math.cos(latitudeRadians),
      Math.cos(angularRadius) - Math.sin(latitudeRadians) * Math.sin(targetLatitude),
    )
    return [targetLongitude * 180 / Math.PI, targetLatitude * 180 / Math.PI]
  })
  coordinates.push(coordinates[0])

  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [coordinates] },
      properties: {},
    }],
  }
}

// A SSP usa dezenas de descrições ("FURTO - OUTROS", "LESÃO CORPORAL CULPOSA POR
// ACIDENTE DE TRÂNSITO"...). Agrupar em poucas famílias deixa o filtro utilizável.
const FILTROS_CRIME = [
  { id: 'roubo', rotulo: 'Roubo', combina: (t) => t.includes('ROUBO') || t.includes('LATROC') },
  { id: 'furto', rotulo: 'Furto', combina: (t) => t.includes('FURTO') },
  // "culposo" é acidente, não agressão: homicídio culposo por acidente de trânsito
  // pertence ao grupo Trânsito, senão apareceria nos dois.
  { id: 'violencia', rotulo: 'Violência', combina: (t) => !t.includes('CULPOS') && (t.includes('HOMIC') || t.includes('ESTUPRO') || t.includes('LESAO')) },
  { id: 'transito', rotulo: 'Trânsito', combina: (t) => t.includes('TRANSITO') || t.includes('CULPOSA') },
]

// null = todos os anos. A base da SSP cobre 2022 em diante.
const ANOS_DISPONIVEIS = [null, 2026, 2025, 2024, 2023, 2022]


const semAcento = (texto) => String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

const getTimeLabel = () => {
  const h = new Date().getHours()
  if (h >= 0 && h < 6) return 'madrugada (+3 risco)'
  if (h >= 22) return 'noite avançada (+2 risco)'
  if (h >= 18) return 'noite (+1 risco)'
  return 'período diurno'
}

const formatReadingAge = (time) => {
  if (!time) return null
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(time)) / 1000))
  if (seconds < 5) return 'agora'
  if (seconds < 60) return `há ${seconds} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes === 1) return 'há 1 min'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  return hours === 1 ? 'há 1 h' : `há ${hours} h`
}

const getSmartwatchConnectionText = (status, directWatchStatus, measurement, liveReading) => {
  if (status === 'checking' || directWatchStatus === 'checking') return 'Verificando conexão'
  if (directWatchStatus === 'connected') {
    return liveReading
      ? `${measurement.source} · ${formatReadingAge(measurement.time)}`
      : 'Relógio conectado · aguardando batimentos'
  }
  if (status === 'connected') return 'Health Connect disponível · Galaxy Watch desconectado'
  if (status === 'permission_required') return 'Conecte pelo Health Connect ou ative o relógio'
  if (status === 'update_required') return 'Atualize o Health Connect'
  if (status === 'development_build_required') return 'Requer a versão Android do Ampara'
  if (status === 'unavailable') return 'Ative o monitoramento no Galaxy Watch'
  if (status === 'unsupported') return 'Smartwatch indisponível neste aparelho'
  if (status === 'error') return 'Falha na conexão · toque para tentar novamente'
  if (measurement?.source) return measurement.source
  return 'Conectado · aguardando batimentos'
}

export default function Home({ navigation }) {
  // Precisam existir antes da chamada do hook porque são passados como entrada dele
  // (zona segura / modo atividade agora também pesam no score salvo no histórico).
  const [safeLocations, setSafeLocations] = useState([]);
  const [insideSafeZone, setInsideSafeZone] = useState(false);
  const [activityMode, setActivityMode] = useState(false)
  const [watchMonitoringWanted, setWatchMonitoringWanted] = useState(false)
  const [watchAlertDismissed, setWatchAlertDismissed] = useState(false)
  const [heartRateFreshnessExpired, setHeartRateFreshnessExpired] = useState(true)
  const [riskContextScore, setRiskContextScore] = useState(null)

  const { data, location, riskStatus, errorMsg, currentScore } = useRiskDetection({ insideSafeZone, activityMode })
  const smartwatch = useSmartwatch()
  const motionRisk = useMemo(() => calculateMotionRiskScore({
    phoneMagnitudeG: riskStatus.magnitude,
    watchMotion: smartwatch.watchMotion,
    activityMode,
  }), [riskStatus.magnitude, smartwatch.watchMotion, activityMode])
  const watchMotionDetail = motionRisk.watchIsRecent
    ? `RMS ${smartwatch.watchMotion.rms.toFixed(1)} m/s²${motionRisk.watchPoints ? ` · relógio +${motionRisk.watchPoints}` : ' · sem elevação'}${motionRisk.corroborationPoints ? ' · conjunto +1' : ''}`
    : smartwatchConnected ? 'Sem leitura recente' : 'Desconectado'
  const smartwatchConnected = smartwatch.directWatchStatus === 'connected'
  const heartRateIsCurrent = smartwatchConnected
    && smartwatch.measurement?.isDirect
    && smartwatch.measurement?.isRecent
    && !heartRateFreshnessExpired
  const heartRateBaseline = calculateHeartRateBaseline(
    smartwatch.heartRateSamples,
    heartRateIsCurrent ? smartwatch.measurement : null,
  )
  const experimentalRiskScore = heartRateBaseline.available
    ? calculateExperimentalRiskScore({ heartRateZScore: heartRateBaseline.zScore, contextScore: riskContextScore })
    : null
  const smartwatchWarning = ['disconnected', 'error', 'development_build_required'].includes(smartwatch.directWatchStatus)
    ? {
        title: smartwatch.directWatchStatus === 'development_build_required'
          ? 'Versão Android necessária'
          : 'Smartwatch desconectado',
        message: smartwatch.directWatchStatus === 'development_build_required'
          ? 'Abra o Ampara instalado no celular para conectar o Galaxy Watch.'
          : 'Conecte o Galaxy Watch para retomar o envio dos batimentos.',
      }
    : smartwatchConnected && smartwatch.monitoringStatus === 'inactive'
      ? {
          title: 'Monitoramento cardíaco desligado',
          message: 'No relógio, toque em “Ativar monitoramento” para voltar a enviar os batimentos.',
        }
      : smartwatchConnected && smartwatch.monitoringStatus === 'active' && !heartRateIsCurrent
        ? {
            title: 'Sem batimentos recentes',
            message: 'O relógio informa que o monitoramento está ativo, mas o celular ainda não recebeu uma leitura recente.',
          }
        : smartwatchConnected && smartwatch.monitoringStatus === 'unknown' && !heartRateIsCurrent
          ? {
              title: 'Sem confirmação do relógio',
              message: 'O celular ainda não recebeu o status do monitoramento nem uma leitura recente do Ampara no relógio.',
            }
      : null
  const isReceivingHeartRate = smartwatch.measurement?.isDirect
    && smartwatch.measurement?.isRecent
    && !heartRateFreshnessExpired
  const showWatchMonitoringAlert = Platform.OS === 'android'
    && watchMonitoringWanted
    && !isReceivingHeartRate
    && !watchAlertDismissed
  const heartRateValue = heartRateIsCurrent ? Math.round(smartwatch.measurement.bpm) : '--'
  const heartRateDetail = heartRateIsCurrent
    ? `${smartwatch.measurement.source} · ${formatReadingAge(smartwatch.measurement.time)}`
    : smartwatch.measurement
      ? `Última leitura: ${Math.round(smartwatch.measurement.bpm)} bpm · ${formatReadingAge(smartwatch.measurement.time)}`
      : 'Aguardando leitura automática'
  const smartwatchConnectionText = getSmartwatchConnectionText(
    smartwatch.status,
    smartwatch.directWatchStatus,
    smartwatch.measurement,
    heartRateIsCurrent,
  )

  useEffect(() => {
    if (isReceivingHeartRate) setWatchAlertDismissed(false)
  }, [isReceivingHeartRate])

  useEffect(() => {
    const time = Date.parse(smartwatch.measurement?.time)
    if (!smartwatch.measurement?.isDirect || !Number.isFinite(time)) {
      setHeartRateFreshnessExpired(true)
      return undefined
    }
    const remaining = LIVE_HEART_RATE_MS - (Date.now() - time)
    if (remaining <= 0) {
      setHeartRateFreshnessExpired(true)
      return undefined
    }
    setHeartRateFreshnessExpired(false)
    const expiryTimer = setTimeout(() => setHeartRateFreshnessExpired(true), remaining + 25)
    return () => clearTimeout(expiryTimer)
  }, [smartwatch.measurement?.isDirect, smartwatch.measurement?.time])

  // --- Estados de Interface e Mapa ---
  const [modalVisible, setModalVisible] = useState(false)
  // { roubo: 3475, furto: 12738, ... } no raio de RAIO_INICIAL_KM em volta da usuária.
  const [resumoCrimes, setResumoCrimes] = useState({})
  const [occurrenceData, setOccurrenceData] = useState([])
  const [region, setRegion] = useState(null)
  const [userRegion, setUserRegion] = useState(null)
  const [mapMoved, setMapMoved] = useState(false)
  // Centro e raio da área que o mapa está mostrando. Alimenta a busca de crimes para que
  // o calor exista em qualquer lugar que a usuária navegue, não só em volta dela.
  const [areaVisivel, setAreaVisivel] = useState(null)
  const [celulasCalor, setCelulasCalor] = useState([])
  const [celulaGraus, setCelulaGraus] = useState(0.00063)
  // Abre já filtrado no que é mais relevante para segurança pessoal e no ano corrente.
  // Lista vazia = sem filtro de tipo (mostra tudo).
  // Roubo e furto respondem por mais de 90% das ocorrências e são o que afeta quem anda
  // na rua. Abrir com os dois mantém a mancha de calor legível em vez de cobrir tudo.
  const [tiposSelecionados, setTiposSelecionados] = useState(['roubo', 'furto'])
  const [anoFiltro, setAnoFiltro] = useState(2026)
  const [homeSection, setHomeSection] = useState('mapa')
  const cameraRef = useRef(null)

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
  const [userName, setUserName] = useState("Usuária");
  const [userId, setUserId] = useState(null);

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

  // --- Controle do Cronômetro de Alerta e Feedback SOS ---
  const [countdown, setCountdown] = useState(30)
  const [alertaDisparado, setAlertaDisparado] = useState(false);
  const timerRef = useRef(null);
  const lastAlertSentRef = useRef(null);
  const cancelCooldownRef = useRef(null);
  const [sustainedHighRisk, setSustainedHighRisk] = useState(false);
  const [sosHolding, setSosHolding] = useState(false);
  const [sosFeedbackVisible, setSosFeedbackVisible] = useState(false);
  const [sosFeedbackData, setSosFeedbackData] = useState({ status: 'enviando', mensagem: '', enviados: [], falhas: [], endereco: '', detalhe: '' });
  const [simpleCheckVisible, setSimpleCheckVisible] = useState(false);
  const [alertType, setAlertType] = useState('moderado');
  const [demoScore, setDemoScore] = useState(null);
  const [demoBonus, setDemoBonus] = useState(0);
  const [demoEnvLabel, setDemoEnvLabel] = useState(null);

  // --- Modo Monitoramento (liga/desliga detecção automática de risco) ---
  const [monitoramentoAtivo, setMonitoramentoAtivo] = useState(true);

  // --- Inicialização e Escuta Realtime do Supabase ---
  useEffect(() => {
    loadActivity();
    loadSafeLocations();
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

  // Recarrega locais seguros e status de atividade sempre que a tela volta a ficar em foco —
  // garante que apagar um local seguro (ou sair do modo atividade) em outra tela libere o
  // recálculo do score mesmo que o evento realtime tenha sido perdido durante a navegação.
  useFocusEffect(
    React.useCallback(() => {
      loadSafeLocations();
      loadActivity();
    }, [])
  );

  // Grava histórico de localização (já throttled a 50m/5min no hook) para alimentar os dashboards
  useEffect(() => {
    if (!location || !userId) return
    saveLocationPoint(userId, location.coords.latitude, location.coords.longitude, location.coords.speed, currentScore)
  }, [location, userId])

  // Grava um ponto extra fora do throttle de GPS quando zona segura ou modo atividade mudam —
  // esses eventos alteram o score (via useRiskDetection) mesmo sem a usuária ter se movido,
  // e sem isso o dashboard só veria a mudança no próximo ponto de GPS (até 5min depois).
  const isFirstZoneActivityRender = useRef(true);
  useEffect(() => {
    if (isFirstZoneActivityRender.current) {
      isFirstZoneActivityRender.current = false;
      return;
    }
    if (!location || !userId) return;
    saveLocationPoint(userId, location.coords.latitude, location.coords.longitude, location.coords.speed, currentScore, "recalculo");
  }, [insideSafeZone, activityMode])

  // Movimento brusco — dispara imediatamente ao detectar pico
  useEffect(() => {
    if (!monitoramentoAtivo) {
      setSustainedHighRisk(false);
      return;
    }
    if (isHighRisk || riskLevel === "Crítico") {
      setSustainedHighRisk(true);
    } else {
      setSustainedHighRisk(false);
    }
  }, [monitoramentoAtivo, isHighRisk, riskLevel]);

  // 1️⃣ GATILHO DO MODAL — 3 níveis baseados no riskScore
  useEffect(() => {
    if (!monitoramentoAtivo) return;
    if (!sustainedHighRisk || alertaDisparado) return;
    if (modalVisible || simpleCheckVisible) return;

    const agora = Date.now();
    const emCooldownEnvio = lastAlertSentRef.current && (agora - lastAlertSentRef.current) < 60 * 1000;
    const emCooldownCancelamento = cancelCooldownRef.current && agora < cancelCooldownRef.current;
    if (emCooldownEnvio || emCooldownCancelamento) return;

    if (riskScore > 8) {
      setAlertType('critico');
      setCountdown(10);
      setModalVisible(true);
    } else if (riskScore >= 5) {
      setAlertType('moderado');
      setCountdown(30);
      setModalVisible(true);
    } else {
      setAlertType('simples');
      setSimpleCheckVisible(true);
    }
  }, [monitoramentoAtivo, sustainedHighRisk, modalVisible, simpleCheckVisible, alertaDisparado, riskScore, activityMode, insideSafeZone]);

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
        setCountdown(countdown - 1);
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [countdown, isHighRisk, modalVisible, alertaDisparado]);

  async function loadUserData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    setWatchMonitoringWanted(user.user_metadata?.smartwatch_monitoring_opt_in === true)
    const { data } = await supabase.from('user_profiles').select('nome').eq('id', user.id).single();
    if (data?.nome) setUserName(data.nome);
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


  async function toggleActivity(value) {
    setActivityMode(value)
    const user = (await supabase.auth.getUser()).data.user
    if (!user) return
    await updateActivityStatus(user.id, value, "academia")
  }

  function toggleMonitoramento(value) {
    setMonitoramentoAtivo(value)
    if (!value) {
      if (timerRef.current) clearTimeout(timerRef.current)
      setModalVisible(false)
      setSimpleCheckVisible(false)
      setAlertaDisparado(false)
      setSustainedHighRisk(false)
      setDemoScore(null)
      setDemoBonus(0)
      setDemoEnvLabel(null)
      cancelCooldownRef.current = Date.now() + 30 * 1000
    }
  }

  function handleSmartwatchPress() {
    if (smartwatch.status === 'connected') smartwatch.refresh()
    else if (smartwatch.status === 'permission_required' || smartwatch.status === 'error') smartwatch.connect()
  }

  // --- Score ambiental combinado com movimento dos dois dispositivos ---
  useEffect(() => {
    let score = 0

    // Crimes na área
    // Densidade por km², e não contagem bruta: a contagem dependia do raio buscado e
    // vinha truncada em 1.000, então qualquer região urbana batia no teto e somava os
    // mesmos 4 pontos. Os limites são os mesmos que pintam o mapa de calor, para a cor
    // que a usuária vê e o score contarem a mesma história.
    const densidadeCrimes = totalCrimesEntorno / (Math.PI * RAIO_INICIAL_KM ** 2)
    if (densidadeCrimes > 700) { score += 4; }
    else if (densidadeCrimes > 250) { score += 2; }

    // Fator horário
    const hora = new Date().getHours()
    if (hora >= 0 && hora < 6) { score += 3; }
    else if (hora >= 22) { score += 2; }
    else if (hora >= 18) { score += 1; }

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
    const contextScore = Math.max(0, Math.min(10, score))
    setRiskContextScore(contextScore)
    score += motionRisk.total
    score = Math.max(score, 0)
    score = Math.min(score, 10)
    setRiskScore(score)

    if (score > 8) { setRiskLevel("Crítico") }
    else if (score >= 5) { setRiskLevel("Moderado") }
    else { setRiskLevel("Baixo") }
  }, [totalCrimesEntorno, activityMode, location, safeLocations, motionRisk.total])

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
    
    let enderecoFormatado = "Endereço não identificado (Apenas GPS)";
    try {
      const addressArray = await Location.reverseGeocodeAsync({ latitude: userLat, longitude: userLon });
      if (addressArray && addressArray.length > 0) {
        const a = addressArray[0];
        enderecoFormatado = `${a.street || a.name || ''}${a.streetNumber ? ', ' + a.streetNumber : ''} - ${a.district || a.subregion || ''}, ${a.city || ''}`;
      }
    } catch (e) {
      console.log("Erro ao buscar endereço reverso no SOS:", e);
    }

    const textoMensagem = `🚨 ALERTA AMPARA: ${userName} pode estar em perigo! Risco: ${riskLevel}. Local: ${enderecoFormatado}. Mapa: ${linkMapa}`;

    setSosFeedbackData({ status: 'enviando', mensagem: textoMensagem, enviados: [], falhas: [], endereco: enderecoFormatado, detalhe: '' });
    setSosFeedbackVisible(true);

    const resultado = await dispararAlerta({
      userId,
      nomeUsuario: userName,
      endereco: enderecoFormatado,
      latitude: userLat,
      longitude: userLon,
      nivelRisco: riskLevel,
      mensagem: textoMensagem,
    });

    if (!resultado.enviado) console.error("❌ [Alerta] Envio não confirmado:", resultado.detalhe);

    setSosFeedbackData({
      status: resultado.enviado ? 'enviado' : 'falhou',
      mensagem: textoMensagem,
      enviados: resultado.enviados,
      falhas: resultado.falhas,
      endereco: enderecoFormatado,
      detalhe: resultado.enviado ? '' : resultado.detalhe,
    });
  }

  const handleUserIsSafe = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setModalVisible(false)
    setSimpleCheckVisible(false)
    setCountdown(30)
    setAlertaDisparado(false)
    setSustainedHighRisk(false)
    cancelCooldownRef.current = Date.now() + 30 * 1000
  }

  useEffect(() => {
    if (location) {
      const initialRegion = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        // ~440 m de ponta a ponta: o quarteirão da usuária e os vizinhos imediatos.
        latitudeDelta: 0.004,
        longitudeDelta: 0.004,
      }
      setRegion(initialRegion)
      setUserRegion(initialRegion)
    }
  }, [location])

  // Crimes oficiais (SSP) já chegam do serviço ordenados do mais próximo ao mais distante.
  // A busca acompanha a área visível do mapa, não a posição da usuária: sem isso, arrastar
  // o mapa mostrava região em branco, como se não houvesse ocorrência por lá.
  // Grade do mapa de calor: acompanha a área visível e os filtros de tipo e ano.
  useEffect(() => {
    async function carregarCalor() {
      const alvo = areaVisivel ?? (location && {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        raioKm: RAIO_INICIAL_KM,
      })
      if (!alvo) return
      // Busca além da borda da tela: sem essa margem, a região que entra ao arrastar
      // chega sem cor e o calor parece ir "aparecendo" conforme a usuária move o mapa.
      // O teto vale depois da margem — pedir 21 km levava a consulta a 6 s na primeira
      // leitura, perto do limite de 8 s que o banco impõe.
      const raioBusca = Math.min(alvo.raioKm * MARGEM_BUSCA, RAIO_MAXIMO_KM)
      const { celulas, celulaGraus: tamanho } = await buscarMapaCalor(
        alvo.latitude, alvo.longitude, raioBusca, anoFiltro, tiposSelecionados,
      )
      // Em falha, celulas vem nulo e o mapa mantém o que já estava desenhado: apagar o
      // calor por causa de uma consulta lenta é pior do que mostrar dado de um segundo atrás.
      if (celulas) {
        setCelulasCalor(celulas)
        setCelulaGraus(tamanho)
      }
    }
    carregarCalor()
  }, [areaVisivel, location, anoFiltro, tiposSelecionados])

  // Contagem por tipo no entorno da usuária, para o score, os números dos filtros e a
  // faixa de status. Fica presa à posição dela, e não à área visível: o risco é de onde
  // ela está, não de onde ela está olhando no mapa.
  useEffect(() => {
    async function carregarResumo() {
      if (!location) return
      const resumo = await buscarResumoCrimes(
        location.coords.latitude, location.coords.longitude, RAIO_INICIAL_KM, anoFiltro,
      )
      if (resumo) setResumoCrimes(resumo)
    }
    carregarResumo()
  }, [location, anoFiltro])

  // Relatos da comunidade — mesma ordenação por proximidade vinda do serviço.
  useEffect(() => {
    async function carregarOcorrencias() {
      if (!location) return
      try {
        const dados = await buscarOcorrencias(location.coords.latitude, location.coords.longitude, 3)

        setOccurrenceData(dados.map((occ) => ({
          id: 'occ_' + occ.id,
          lat: occ.latitude,
          lon: occ.longitude,
          tipo: occ.tipo_crime || 'Ocorrência relatada',
          descricao: occ.descricao || '',
          horario: occ.horario || '',
          address: occ.address || '',
          distancia: occ.distancia_km
        })))
      } catch (error) {
        console.error('❌ ERRO AO CARREGAR OCORRÊNCIAS:', error)
      }
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
      try {
        const query = encodeURIComponent(`${text}, São Paulo, Brasil`)
        const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=5&countrycodes=br`
        const response = await fetch(url, { headers: { 'User-Agent': 'ampara-tcc-app' } })
        const result = await response.json()
        setSuggestions(result || [])
      } catch (error) { setSuggestions([]); }
    }, 600)
  }

  const selectSuggestion = (item) => {
    setOccEndereco(item.display_name)
    setOccCoords({ latitude: Number(item.lat), longitude: Number(item.lon) })
    setSuggestions([])
    Keyboard.dismiss()
  }

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

    try {
      setIsSaving(true)
      const { data: userData } = await supabase.auth.getUser()
      if (!userData?.user) { Alert.alert("Erro", "Usuário não autenticado."); return; }
      const dataIso = `${ano}-${mes}-${dia}`
      const { error } = await supabase.from('occurrences').insert([{
        user_id: userData.user.id,
        tipo_crime: occTipo,
        address: occEndereco,
        descricao: occDescricao,
        horario: occHorario,
        data_ocorrencia: dataIso,
        latitude: occCoords?.latitude,
        longitude: occCoords?.longitude,
        risk_score: magnitude || 0
      }])
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
    setOccData(new Date().toLocaleDateString('pt-BR'))
  }

  // Só vale a pena rebuscar quando a área nova é de fato outra: sem esse corte, cada
  // quadro da animação de arrastar dispararia uma consulta.
  const atualizarAreaVisivel = (latitude, longitude, raioKm) => {
    const limitado = Math.min(Math.max(raioKm, 0.5), RAIO_MAXIMO_KM)
    setAreaVisivel((atual) => {
      if (atual) {
        const deslocamentoKm = distanceKm(atual.latitude, atual.longitude, latitude, longitude)
        // Com a margem curta, a busca precisa acompanhar o movimento de perto: qualquer
        // deslocamento relevante já descobre área sem cor.
        const mudouPouco = deslocamentoKm < atual.raioKm * 0.15
        const zoomParecido = Math.abs(limitado - atual.raioKm) < atual.raioKm * 0.2
        if (mudouPouco && zoomParecido) return atual
      }
      return { latitude, longitude, raioKm: limitado }
    })
  }

  const handleMapLibreRegionWillChange = (event) => {
    if (event.nativeEvent.userInteraction) setMapMoved(true)
  }

  const handleMapLibreRegionChange = (event) => {
    const [longitude, latitude] = event.nativeEvent.center
    const limites = event.nativeEvent.visibleBounds
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      // visibleBounds vem como [[lonNE, latNE], [lonSO, latSO]]: metade da diagonal é o
      // raio que cobre a tela inteira.
      const raioKm = limites
        ? distanceKm(limites[1][1], limites[1][0], limites[0][1], limites[0][0]) / 2
        : RAIO_INICIAL_KM
      atualizarAreaVisivel(latitude, longitude, raioKm)
    }
    if (!userRegion) return
    const distance = Math.abs(latitude - userRegion.latitude) + Math.abs(longitude - userRegion.longitude)
    setMapMoved(distance > 0.0007)
  }

  const recenterMap = () => {
    if (cameraRef.current && userRegion) {
      if (Platform.OS !== 'ios') {
        cameraRef.current.easeTo({ center: [userRegion.longitude, userRegion.latitude], duration: 500 })
      } else {
        cameraRef.current.animateToRegion(userRegion, 500)
      }
      setMapMoved(false)
    }
  }

  const displayScore = monitoramentoAtivo ? riskScore : 0
  const displayLevel = displayScore > 8 ? 'Crítico' : displayScore >= 5 ? 'Moderado' : 'Baixo'
  // O filtro vale para o mapa e para a faixa de status. O score continua olhando todos os
  // tipos: esconder um deles no mapa não torna a região mais segura.
  // Os números dos botões de filtro e o total do entorno vêm prontos do banco, agrupados
  // pelos mesmos quatro tipos que o filtro oferece.
  const contagemPorTipo = useMemo(() => (
    FILTROS_CRIME.reduce((acc, filtro) => ({ ...acc, [filtro.id]: resumoCrimes[filtro.id] ?? 0 }), {})
  ), [resumoCrimes])
  const totalCrimesEntorno = useMemo(
    () => Object.values(resumoCrimes).reduce((soma, n) => soma + n, 0),
    [resumoCrimes],
  )
  // Quantos crimes dos tipos marcados existem no entorno — é o que a faixa de status diz.
  const totalFiltrado = useMemo(() => (
    tiposSelecionados.length === 0
      ? totalCrimesEntorno
      : tiposSelecionados.reduce((soma, id) => soma + (resumoCrimes[id] ?? 0), 0)
  ), [resumoCrimes, tiposSelecionados, totalCrimesEntorno])
  const mapFeatures = useMemo(
    () => criarGeoJSONMapa([], occurrenceData),
    [occurrenceData],
  )
  // A grade do calor vem somada do banco e cobre a área inteira do mapa.
  const crimesGeoJSON = useMemo(() => ({
    type: 'FeatureCollection',
    features: celulasCalor.map((celula) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [Number(celula.lon), Number(celula.lat)] },
      properties: { peso: Number(celula.peso) },
    })).filter((f) => f.geometry.coordinates.every(Number.isFinite)),
  }), [celulasCalor])
  // Área da célula em km². É o divisor que torna a cor comparável entre zooms e entre
  // regiões, já que a célula cresce quando o mapa se afasta.
  const areaCelulaKm2 = useMemo(() => (celulaGraus * 111) ** 2, [celulaGraus])
  // Contagem equivalente ao vermelho nesta célula: a camada do Android espera peso de 0 a 1.
  const pesoVermelho = useMemo(
    () => Math.max(DENSIDADE_VERMELHO * areaCelulaKm2, 1),
    [areaCelulaKm2],
  )
  const userLocationFeature = useMemo(() => ({
    type: 'FeatureCollection',
    features: location ? [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [location.coords.longitude, location.coords.latitude] },
      properties: {},
    }] : [],
  }), [location])
  const safetyRadius = useMemo(
    () => location ? criarGeoJSONRaio(location.coords.latitude, location.coords.longitude, 3000) : null,
    [location],
  )
  const rotuloFiltro = tiposSelecionados.length === 0
    ? 'registros'
    : tiposSelecionados.map((id) => FILTROS_CRIME.find((f) => f.id === id).rotulo.toLowerCase()).join(' + ')
  const alternarTipo = (id) =>
    setTiposSelecionados((atual) => atual.includes(id) ? atual.filter((t) => t !== id) : [...atual, id])
  const riskAccent = !monitoramentoAtivo ? '#9A8C93' : displayLevel === 'Crítico' ? Brand.danger : displayLevel === 'Moderado' ? Brand.amber : Brand.green

  const simularNivel = (score) => {
    setDemoEnvLabel(null)
    setDemoBonus(0)
    setDemoScore(score)
  }

  const setDemoEnvironment = (bonus, label) => {
    setDemoScore(null)
    setDemoBonus(bonus)
    setDemoEnvLabel(label)
  }

  const resetDemo = () => {
    setDemoScore(null)
    setDemoBonus(0)
    setDemoEnvLabel(null)
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>

        {/* ── HEADER ── */}
        <View style={styles.headerContainer}>
          <View style={styles.headerBrandRow}>
            <Image source={require('../assets/images/maos-ampara-azul.png')} style={styles.headerLogo} resizeMode="contain" />
            <Text style={styles.header}>Ampara</Text>
          </View>
        </View>

        <View style={styles.topModesRow}>
          <View style={styles.topModeCell}>
            <View style={styles.topModeHeading}>
              <Ionicons name={monitoramentoAtivo ? 'shield-checkmark-outline' : 'shield-outline'} size={17} color={monitoramentoAtivo ? Brand.green : Brand.muted} />
              <Text style={styles.topModeTitle}>Monitoramento</Text>
            </View>
            <View style={styles.topModeControlRow}>
              <Text style={[styles.topModeSubtitle, !monitoramentoAtivo && styles.monitoringStatusOff]} numberOfLines={1}>
                {monitoramentoAtivo ? 'Alertas ativos' : 'Alertas pausados'}
              </Text>
              <Switch
                value={monitoramentoAtivo}
                onValueChange={toggleMonitoramento}
                trackColor={{ false: '#E6DCE0', true: Brand.green }}
                thumbColor="#FFF"
                accessibilityLabel="Modo monitoramento"
              />
            </View>
          </View>
          <View style={styles.topModeDivider} />
          <View style={styles.topModeCell}>
            <View style={styles.topModeHeading}>
              <Ionicons name="fitness-outline" size={17} color={activityMode ? Brand.roseDeep : Brand.muted} />
              <Text style={styles.topModeTitle}>Atividade</Text>
            </View>
            <View style={styles.topModeControlRow}>
              <Text style={styles.topModeSubtitle} numberOfLines={1}>
                {activityMode ? 'Exercício ativo' : 'Para exercícios'}
              </Text>
              <Switch
                value={activityMode}
                onValueChange={toggleActivity}
                trackColor={{ false: '#E6DCE0', true: Brand.rose }}
                thumbColor="#FFF"
                accessibilityLabel="Modo atividade"
              />
            </View>
          </View>
        </View>

        {/* ── RISCO ── */}
        <View style={styles.riskSection}>
          <View style={styles.riskRow}>
            <Text style={styles.riskLabel}>Risco atual</Text>
            <View style={styles.riskSummary}>
              <Text style={[styles.gaugeScoreBig, { color: riskAccent }]}>
                {displayScore}<Text style={styles.gaugeScoreMax}>/10</Text>
              </Text>
              <Text style={[styles.riskBadgeText, { color: riskAccent }]}>
                {monitoramentoAtivo ? displayLevel : 'Pausado'}
              </Text>
            </View>
          </View>
          <View style={styles.riskCompactRow}>
            {monitoramentoAtivo ? (
              <View style={styles.timeFactorRow}>
                <Ionicons name="time-outline" size={12} color={Brand.blue} />
                <Text style={styles.timeFactorText} numberOfLines={1}>{getTimeLabel()}</Text>
              </View>
            ) : (
              <Text style={styles.gaugeDesc}>Alertas automáticos pausados</Text>
            )}
          </View>
          <View style={styles.scoreTrack}>
            <View style={[styles.scoreFill, { width: `${Math.min(Math.max(Number(displayScore), 0), 10) * 10}%`, backgroundColor: riskAccent }]} />
          </View>
        </View>

        {insideSafeZone && (
          <View style={styles.safeStrip}>
            <Ionicons name="checkmark-circle" size={16} color="#2E8B57" />
            <Text style={styles.safeStripText}>Você está em um perímetro seguro cadastrado</Text>
          </View>
        )}

        <View style={styles.homeSectionTabs} accessibilityRole="tablist">
          {[
            { id: 'mapa', label: 'Mapa', icon: 'map-outline' },
            { id: 'sensores', label: 'Sensores', icon: 'pulse-outline' },
          ].map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.homeSectionTab, homeSection === item.id && styles.homeSectionTabActive]}
              onPress={() => setHomeSection(item.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: homeSection === item.id }}
            >
              <Ionicons name={item.icon} size={17} color={homeSection === item.id ? Brand.roseDeep : Brand.muted} />
              <Text style={[styles.homeSectionTabText, homeSection === item.id && styles.homeSectionTabTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {homeSection === 'sensores' && <>
        <Text style={styles.mapSectionTitle}>Sensores do dispositivo</Text>
        {Platform.OS === 'android' && (
          <>
            <View style={styles.experimentalScorePanel}>
              <View style={styles.experimentalScoreHeading}>
                <Text style={styles.experimentalScoreTitle}>Score experimental · BPM + contexto</Text>
                <Text style={styles.experimentalScoreVersion}>{EXPERIMENTAL_RISK_SCORE_VERSION}</Text>
              </View>
              {experimentalRiskScore == null ? (
                <Text style={styles.experimentalScoreValueUnavailable}>
                  Aguardando histórico pessoal de BPM por quase 1 hora
                </Text>
              ) : (
                <View style={styles.experimentalScoreResult}>
                  <Text style={styles.experimentalScoreValue}>{experimentalRiskScore}/10</Text>
                  <Text style={styles.experimentalScoreLevel}>{getExperimentalRiskLevel(experimentalRiskScore)}</Text>
                  <Text style={styles.experimentalScoreDetail}>
                    BPM {heartRateBaseline.zScore >= 0 ? '+' : ''}{heartRateBaseline.zScore.toFixed(1)} desvios · contexto {riskContextScore}/10
                  </Text>
                </View>
              )}
              <Text style={styles.experimentalScoreDisclaimer}>
                Prévia exploratória. Não validada, não aciona alertas e não substitui avaliação de segurança.
              </Text>
            </View>
            <View style={styles.heartRatePanel}>
              <Ionicons
                name={heartRateIsCurrent ? 'heart' : 'heart-outline'}
                size={23}
                color={heartRateIsCurrent ? Brand.roseDeep : '#9A8C93'}
              />
              <Text style={styles.heartRateLabel}>FREQUÊNCIA CARDÍACA</Text>
              <View style={styles.heartRateValueRow}>
                <Text style={[styles.heartRateValue, !heartRateIsCurrent && styles.heartRateValueUnavailable]}>
                  {heartRateValue}
                </Text>
                <Text style={styles.heartRateUnit}>bpm</Text>
              </View>
              <Text style={[styles.heartRateDetail, !heartRateIsCurrent && styles.heartRateDetailStale]}>
                {heartRateDetail}
              </Text>
              <Text style={styles.heartRateBaselineDetail}>
                {!heartRateIsCurrent
                  ? 'Aguardando BPM atual para comparar com sua média'
                  : heartRateBaseline.available
                  ? `${heartRateBaseline.zScore >= 0 ? '+' : ''}${heartRateBaseline.zScore.toFixed(1)} desvios da sua média da última hora`
                  : heartRateBaseline.sampleCount < 20
                    ? `Formando sua média pessoal · ${heartRateBaseline.sampleCount}/20 leituras`
                    : heartRateBaseline.baselineReady
                      ? 'Sua média estável não permite calcular o desvio agora'
                      : `Histórico pessoal: ${heartRateBaseline.coverageMinutes} min · precisa cobrir quase 1 hora`}
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.smartwatchConnectionButton,
                smartwatchConnected ? styles.smartwatchConnectionButtonConnected : styles.smartwatchConnectionButtonDisconnected,
              ]}
              onPress={handleSmartwatchPress}
              disabled={smartwatch.isBusy || !['connected', 'permission_required', 'error'].includes(smartwatch.status)}
              accessibilityRole="button"
              accessibilityLabel="Conexão com smartwatch"
            >
              <View style={styles.smartwatchIconWrap}>
                <Ionicons name="watch-outline" size={22} color={smartwatchConnected ? Brand.green : Brand.roseDeep} />
              </View>
              <View style={styles.smartwatchConnectionTexts}>
                <Text style={styles.smartwatchConnectionTitle}>
                  {smartwatchConnected ? 'Smartwatch conectado' : 'Smartwatch desconectado'}
                </Text>
                <Text style={styles.smartwatchConnectionSubtitle}>{smartwatchConnectionText}</Text>
              </View>
              {smartwatch.isBusy ? (
                <ActivityIndicator size="small" color={Brand.roseDeep} />
              ) : (
                <Ionicons
                  name={smartwatchConnected ? 'checkmark-circle' : 'link-outline'}
                  size={23}
                  color={smartwatchConnected ? Brand.green : Brand.roseDeep}
                />
              )}
            </TouchableOpacity>

            {smartwatchWarning && (
              <View
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                style={styles.smartwatchWarning}
              >
                <Ionicons name="warning" size={20} color="#A65D00" />
                <View style={styles.smartwatchWarningTexts}>
                  <Text style={styles.smartwatchWarningTitle}>{smartwatchWarning.title}</Text>
                  <Text style={styles.smartwatchWarningMessage}>{smartwatchWarning.message}</Text>
                </View>
              </View>
            )}

            {Platform.OS === 'android' && (
              <View style={styles.watchMotionRow}>
                <Ionicons name="watch-outline" size={18} color={motionRisk.watchIsRecent ? Brand.green : Brand.muted} />
                <Text style={styles.watchMotionValue}>
                  {motionRisk.watchIsRecent ? `${smartwatch.watchMotion.peak.toFixed(1)} m/s²` : '—'}
                </Text>
                <View style={styles.watchMotionTexts}>
                  <Text style={styles.watchMotionTitle}>Acelerômetro do relógio</Text>
                  <Text style={styles.watchMotionDetail}>{watchMotionDetail}</Text>
                </View>
              </View>
            )}
          </>
        )}
        <View style={styles.forceRow}>
          <Ionicons name="phone-portrait-outline" size={18} color={isHighRisk ? Brand.roseDeep : Brand.muted} />
          <Text style={[styles.forceValue, { color: isHighRisk ? Brand.roseDeep : Brand.ink }]}>{magnitude}G</Text>
          <Text style={styles.forceLabel}>Acelerômetro do celular{motionRisk.phonePoints > 0 ? ` · +${motionRisk.phonePoints}` : ''}</Text>
          {isHighRisk && <View style={styles.forcePill}><Text style={styles.forcePillText}>Alto</Text></View>}
        </View>
        {Platform.OS === 'ios' && (
          <Text style={styles.sensorAvailabilityNote}>A leitura cardíaca e o acelerômetro do relógio ficam disponíveis no Android.</Text>
        )}

        </>}

        {homeSection === 'mapa' && <>
        <Text style={styles.mapSectionTitle}>Ocorrências próximas</Text>
        {/* ── FILTROS DO MAPA ── */}
        <View style={styles.filtroBloco}>
          <View style={styles.filtroCabecalho}>
            <Text style={styles.filtroTitulo}>Tipo de ocorrência</Text>
            {tiposSelecionados.length > 0 && (
              <TouchableOpacity onPress={() => setTiposSelecionados([])}>
                <Text style={styles.filtroLimpar}>Limpar</Text>
              </TouchableOpacity>
            )}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtroRow}>
            {FILTROS_CRIME.map((filtro) => {
              const ativo = tiposSelecionados.includes(filtro.id)
              const total = contagemPorTipo[filtro.id] ?? 0
              return (
                <TouchableOpacity
                  key={filtro.id}
                  style={[styles.filtroChip, ativo && styles.filtroChipAtivo, total === 0 && styles.filtroChipVazio]}
                  onPress={() => alternarTipo(filtro.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: ativo }}
                >
                  <Text style={[styles.filtroTexto, ativo && styles.filtroTextoAtivo]}>{filtro.rotulo}</Text>
                  <Text style={[styles.filtroContagem, ativo && styles.filtroTextoAtivo]}>{total}</Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>

          <Text style={[styles.filtroTitulo, { marginTop: 14 }]}>Ano</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtroRow}>
            {ANOS_DISPONIVEIS.map((ano) => {
              const ativo = anoFiltro === ano
              return (
                <TouchableOpacity
                  key={ano ?? 'todos'}
                  style={[styles.filtroChip, ativo && styles.filtroChipAtivo]}
                  onPress={() => setAnoFiltro(ano)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: ativo }}
                >
                  <Text style={[styles.filtroTexto, ativo && styles.filtroTextoAtivo]}>{ano ?? 'Todos'}</Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </View>

        {/* ── MAPA ── */}
        <View style={styles.mapContainer}>
          {location && region ? (
            <>
              {Platform.OS !== 'ios' ? (
              <MapLibreMap
                style={styles.map}
                mapStyle="https://tiles.openfreemap.org/styles/liberty"
                attribution
                attributionPosition={{ bottom: 8, right: 8 }}
                logo
                logoPosition={{ bottom: 8, left: 8 }}
                onRegionWillChange={handleMapLibreRegionWillChange}
                onRegionDidChange={handleMapLibreRegionChange}
              >
                <MapLibreCamera
                  ref={cameraRef}
                  initialViewState={{
                    center: [region.longitude, region.latitude],
                    zoom: 15.5,
                  }}
                  minZoom={3}
                  maxZoom={20}
                />
                <MapLibreGeoJSONSource id="ampara-safety-radius" data={safetyRadius}>
                  <MapLibreLayer
                    id="ampara-safety-radius-fill"
                    type="fill"
                    paint={{ 'fill-color': '#C4687A', 'fill-opacity': 0.10 }}
                  />
                  <MapLibreLayer
                    id="ampara-safety-radius-outline"
                    type="line"
                    paint={{ 'line-color': '#C4687A', 'line-width': 1.5 }}
                  />
                </MapLibreGeoJSONSource>
                {/* Crimes viram mancha de calor: mil alfinetes sobrepostos não dizem onde
                    o risco se concentra, e ainda escondem o mapa embaixo. */}
                <MapLibreGeoJSONSource id="ampara-crimes" data={crimesGeoJSON}>
                  <MapLibreLayer
                    id="ampara-crimes-heat"
                    type="heatmap"
                    paint={{
                      // Cada ponto é uma célula somada. O divisor é fixo (densidade que
                      // corresponde ao vermelho), não o máximo da tela: assim a mesma rua
                      // mantém a cor quando a usuária arrasta o mapa.
                      'heatmap-weight': ['min', 1, ['/', ['get', 'peso'], pesoVermelho]],
                      // Raio generoso para as manchas se fundirem em áreas contínuas, em
                      // vez de virar bolinhas separadas. Cresce com o zoom, senão some a
                      // diferença entre as regiões quando a usuária se aproxima.
                      // Raio curto de propósito: as ocorrências são geocodificadas em
                      // endereços, então manchas pequenas acompanham o traçado das ruas.
                      // Raio grande engorda tudo e cobre o quarteirão inteiro.
                      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 11, 14, 15, 34, 18, 70],
                      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 11, 0.4, 18, 0.7],
                      // Opacidade baixa para os nomes das ruas continuarem legíveis.
                      'heatmap-opacity': 0.45,
                      // Verde, amarelo, laranja, vermelho: a sequência é lida como
                      // intensidade sem precisar de legenda.
                      'heatmap-color': [
                        'interpolate', ['linear'], ['heatmap-density'],
                        0, 'rgba(76, 175, 80, 0)',
                        0.15, 'rgba(76, 175, 80, 0.20)',
                        0.35, 'rgba(174, 213, 129, 0.30)',
                        0.5, 'rgba(255, 235, 59, 0.38)',
                        0.65, 'rgba(255, 183, 77, 0.45)',
                        0.8, 'rgba(255, 152, 0, 0.52)',
                        1, 'rgba(211, 47, 47, 0.62)',
                      ],
                    }}
                  />
                </MapLibreGeoJSONSource>
                {/* Relatos da comunidade seguem como pontos: são poucos e identificam um
                    local específico, não uma área. */}
                <MapLibreGeoJSONSource id="ampara-map-points" data={mapFeatures}>
                  <MapLibreLayer
                    id="ampara-map-points-layer"
                    type="circle"
                    filter={['==', ['get', 'kind'], 'occurrence']}
                    paint={{
                      'circle-radius': 6,
                      'circle-color': '#C4687A',
                      'circle-stroke-color': '#FFFFFF',
                      'circle-stroke-width': 2,
                    }}
                  />
                </MapLibreGeoJSONSource>
                <MapLibreGeoJSONSource id="ampara-user-location" data={userLocationFeature}>
                  <MapLibreLayer
                    id="ampara-user-location-layer"
                    type="circle"
                    paint={{
                      'circle-radius': 9,
                      'circle-color': '#5A8FAF',
                      'circle-stroke-color': '#FFFFFF',
                      'circle-stroke-width': 3,
                    }}
                  />
                </MapLibreGeoJSONSource>
              </MapLibreMap>
              ) : (
                <MapView
                  ref={cameraRef}
                  style={styles.map}
                  initialRegion={region}
                  showsUserLocation
                  showsMyLocationButton={false}
                  onPanDrag={() => setMapMoved(true)}
                  onRegionChangeComplete={(nextRegion) => {
                    // latitudeDelta é a altura da tela em graus; metade dela, em km, é o
                    // raio que cobre o que está visível.
                    atualizarAreaVisivel(
                      nextRegion.latitude,
                      nextRegion.longitude,
                      (nextRegion.latitudeDelta * 111) / 2,
                    )
                    if (!userRegion) return
                    const distance = Math.abs(nextRegion.latitude - userRegion.latitude)
                      + Math.abs(nextRegion.longitude - userRegion.longitude)
                    setMapMoved(distance > 0.0007)
                  }}
                >
                  {location && (
                    <Circle
                      center={{ latitude: location.coords.latitude, longitude: location.coords.longitude }}
                      radius={3000}
                      fillColor="rgba(196, 104, 122, 0.10)"
                      strokeColor="#C4687A"
                      strokeWidth={1.5}
                    />
                  )}
                  {/* Equivalente ao mapa de calor do Android: o Apple Maps não tem camada
                      de calor, então a densidade vira um círculo por célula da grade. */}
                  {celulasCalor.flatMap((celula, indice) =>
                    // 0,85 do lado da célula, e não metade: círculos do tamanho exato da
                    // célula deixam vãos nos cantos da grade, e a mancha fica pontilhada.
                    // Com a sobreposição, as áreas vizinhas se fundem.
                    camadasDifusas({ ...celula, chave: `c${indice}` }, areaCelulaKm2, celulaGraus * 111000 * 0.85).map((camada) => (
                      <Circle
                        key={`calor-${camada.id}`}
                        center={{ latitude: Number(celula.lat), longitude: Number(celula.lon) }}
                        radius={camada.raio}
                        fillColor={camada.cor}
                        strokeColor="transparent"
                        strokeWidth={0}
                      />
                    ))
                  )}
                  {occurrenceData.map((occurrence) => (
                    <Marker
                      key={`occurrence-${occurrence.id}`}
                      coordinate={{ latitude: Number(occurrence.lat), longitude: Number(occurrence.lon) }}
                      pinColor="#C4687A"
                      title={occurrence.tipo}
                      description={occurrence.descricao}
                    />
                  ))}
                </MapView>
              )}

              <View style={styles.mapLegend}>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#5A8FAF' }]} /><Text style={styles.legendText}>Você</Text></View>
                <View style={styles.legendItem}><View style={[styles.legendDot, styles.legendCalor]} /><Text style={styles.legendText}>Concentração SSP</Text></View>
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

        {/* ── CRIME STRIP ── */}
        <View style={[styles.crimeStrip, { borderLeftColor: totalFiltrado > 0 ? '#C4687A' : '#2E8B57' }]}>
          <Ionicons
            name={totalFiltrado > 0 ? 'warning-outline' : 'checkmark-circle-outline'}
            size={16}
            color={totalFiltrado > 0 ? '#C4687A' : '#2E8B57'}
          />
          <Text style={[styles.crimeStripText, { color: totalFiltrado > 0 ? '#C4687A' : '#2E8B57' }]}>
            {totalFiltrado > 0
              ? `${totalFiltrado.toLocaleString('pt-BR')} ${rotuloFiltro} num raio de ${RAIO_INICIAL_KM} km${anoFiltro ? ` em ${anoFiltro}` : ''}`
              : `Nenhum registro${tiposSelecionados.length > 0 ? ` de ${rotuloFiltro}` : ''} por perto${anoFiltro ? ` em ${anoFiltro}` : ''}`}
          </Text>
        </View>
        </>}

        {/* Mantido oculto para possível reutilização futura; não participa do score real. */}
        {SHOW_PRESENTATION_MODE && (
        <View style={styles.demoPanel}>
          <View style={styles.demoPanelHeader}>
            <Ionicons name="flask-outline" size={16} color="#5A8FAF" />
            <Text style={styles.demoPanelTitle}>Modo Apresentação</Text>
          </View>

          {/* Seção 1: Ambiente + sacudir */}
          <Text style={styles.demoSectionLabel}>① Simular ambiente · depois sacuda o celular</Text>
          <View style={styles.demoBtnRow}>
            <TouchableOpacity
              style={[
                styles.demoBtn,
                { borderColor: '#E6A200', borderWidth: demoEnvLabel === 'risco-dia' ? 2.5 : 1.5 },
                demoEnvLabel === 'risco-dia' && { backgroundColor: '#FFF8E6' }
              ]}
              onPress={() => setDemoEnvironment(1, 'risco-dia')}
            >
              {demoEnvLabel === 'risco-dia'
                ? <Ionicons name="checkmark-circle" size={18} color="#E6A200" />
                : <Ionicons name="sunny-outline" size={16} color="#E6A200" />
              }
              <Text style={[styles.demoBtnText, { color: '#E6A200' }]}>Risco (dia)</Text>
              <Text style={styles.demoBtnSub}>Sacuda → Moderado</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.demoBtn,
                { borderColor: '#D32F2F', borderWidth: demoEnvLabel === 'risco-noite' ? 2.5 : 1.5 },
                demoEnvLabel === 'risco-noite' && { backgroundColor: '#FDEAEA' }
              ]}
              onPress={() => setDemoEnvironment(3, 'risco-noite')}
            >
              {demoEnvLabel === 'risco-noite'
                ? <Ionicons name="checkmark-circle" size={18} color="#D32F2F" />
                : <Ionicons name="moon-outline" size={16} color="#D32F2F" />
              }
              <Text style={[styles.demoBtnText, { color: '#D32F2F' }]}>Risco noturno</Text>
              <Text style={styles.demoBtnSub}>Sacuda → Crítico</Text>
            </TouchableOpacity>
          </View>

          {demoEnvLabel && (
            <View style={styles.demoEnvActive}>
              <Ionicons name="radio-outline" size={13} color="#27AE60" />
              <Text style={styles.demoEnvActiveText}>
                {demoEnvLabel === 'risco-dia' ? 'Região de risco (dia) ativa' : 'Risco noturno ativo'} · Sacuda para acionar
              </Text>
            </View>
          )}

          {/* Seção 2: Acionamento direto */}
          <Text style={[styles.demoSectionLabel, { marginTop: 14 }]}>② Ou acione diretamente</Text>
          <View style={styles.demoBtnRow}>
            <TouchableOpacity style={[styles.demoBtn, { borderColor: '#27AE60' }]} onPress={() => simularNivel(3)}>
              <Text style={[styles.demoBtnText, { color: '#27AE60' }]}>Nível 1</Text>
              <Text style={styles.demoBtnSub}>Tudo bem?</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.demoBtn, { borderColor: '#E6A200' }]} onPress={() => simularNivel(6)}>
              <Text style={[styles.demoBtnText, { color: '#E6A200' }]}>Nível 2</Text>
              <Text style={styles.demoBtnSub}>Confirmar (30s)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.demoBtn, { borderColor: '#D32F2F' }]} onPress={() => simularNivel(9)}>
              <Text style={[styles.demoBtnText, { color: '#D32F2F' }]}>Nível 3</Text>
              <Text style={styles.demoBtnSub}>Alerta (10s)</Text>
            </TouchableOpacity>
          </View>

          {(demoScore !== null || demoEnvLabel !== null) && (
            <TouchableOpacity style={styles.demoResetBtn} onPress={resetDemo}>
              <Ionicons name="refresh-outline" size={14} color="#5A8FAF" />
              <Text style={styles.demoResetText}>Resetar demo</Text>
            </TouchableOpacity>
          )}
        </View>
        )}

      </ScrollView>

      <View style={styles.floatingContainer} pointerEvents="box-none">
        <Pressable
          style={[styles.fabHelp, sosHolding && styles.fabHelpHolding]}
          onLongPress={executarEnvioDeSocorro}
          onPressIn={() => setSosHolding(true)}
          onPressOut={() => setSosHolding(false)}
          delayLongPress={3000}
        >
          <View style={styles.quickActionContent}>
            <Ionicons name="alert-circle" size={18} color="#FFF" />
            <Text style={styles.fabText}>SOS</Text>
          </View>
          {sosHolding && <Text style={styles.fabHoldHint}>segure...</Text>}
        </Pressable>
      </View>

      {/* MODAL FEEDBACK SOS */}
      <Modal transparent visible={sosFeedbackVisible} animationType="fade">
        <View style={styles.overlayCentered}>
          <View style={styles.cardModal}>
            <View style={[styles.modalStrip, { backgroundColor: sosFeedbackData.status === 'enviado' ? '#4CAF50' : sosFeedbackData.status === 'falhou' ? '#D32F2F' : '#5A8FAF' }]} />
            <View style={styles.modalInner}>
              {sosFeedbackData.status === 'enviando' && (
                <>
                  <ActivityIndicator size="large" color="#5A8FAF" style={{ marginBottom: 12 }} />
                  <Text style={styles.cardTitle}>Enviando alerta...</Text>
                  <Text style={styles.cardSubtitle}>Avisando sua rede de apoio com sua localização.</Text>
                </>
              )}
              {sosFeedbackData.status === 'enviado' && (
                <>
                  <Text style={[styles.cardTitleCritical, { color: '#2E8B57' }]}>Alerta Enviado</Text>
                  <Text style={styles.cardSubtitle}>
                    Mensagem de WhatsApp com sua localização enviada para {sosFeedbackData.enviados.length} {sosFeedbackData.enviados.length === 1 ? 'contato' : 'contatos'}.
                  </Text>
                </>
              )}
              {sosFeedbackData.status === 'falhou' && (
                <>
                  <Text style={[styles.cardTitleCritical, { color: '#D32F2F' }]}>Alerta NÃO confirmado</Text>
                  <Text style={styles.cardSubtitle}>
                    Não conseguimos confirmar o envio aos seus contatos. Se estiver em perigo, ligue para a polícia agora.
                  </Text>
                  <Text style={styles.sosFailDetail}>Motivo: {sosFeedbackData.detalhe}</Text>
                  <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: '#D32F2F', marginBottom: 12 }]} onPress={() => Linking.openURL('tel:190')}>
                    <Text style={styles.btnPrimaryText}>Ligar 190</Text>
                  </TouchableOpacity>
                </>
              )}

              {sosFeedbackData.status !== 'enviando' && (
                <View style={styles.feedbackBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Ionicons name="location" size={14} color="#5A8FAF" />
                    <Text style={styles.feedbackLabel}>Sua localização</Text>
                  </View>
                  <Text style={styles.feedbackAddressText}>{sosFeedbackData.endereco}</Text>

                  {sosFeedbackData.enviados.length > 0 && (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, marginBottom: 4 }}>
                        <Ionicons name="logo-whatsapp" size={14} color="#2E8B57" />
                        <Text style={styles.feedbackLabel}>Mensagem de WhatsApp enviada para</Text>
                      </View>
                      {sosFeedbackData.enviados.map((c) => (
                        <TouchableOpacity key={c} onPress={() => Linking.openURL(`tel:${c}`)}>
                          <Text style={styles.feedbackContact}>{c}</Text>
                        </TouchableOpacity>
                      ))}
                    </>
                  )}
                  {sosFeedbackData.falhas.length > 0 && (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, marginBottom: 4 }}>
                        <Ionicons name="close-circle" size={14} color="#D32F2F" />
                        <Text style={styles.feedbackLabel}>Não foi possível enviar para · toque para ligar</Text>
                      </View>
                      {sosFeedbackData.falhas.map((c) => (
                        <TouchableOpacity key={c} onPress={() => Linking.openURL(`tel:${c}`)}>
                          <Text style={[styles.feedbackContact, { color: '#D32F2F' }]}>{c}</Text>
                        </TouchableOpacity>
                      ))}
                    </>
                  )}
                </View>
              )}

              <TouchableOpacity
                style={[styles.btnPrimary, sosFeedbackData.status === 'enviando' && { opacity: 0.5 }]}
                disabled={sosFeedbackData.status === 'enviando'}
                onPress={() => { setSosFeedbackVisible(false); setAlertaDisparado(false); setSustainedHighRisk(false); }}
              >
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

      {/* MODAL REGISTRO DE INCIDENTE */}
      <Modal visible={reportModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flexOne}>
          <Pressable style={styles.overlayBottom} onPress={() => { setReportModalVisible(false); resetForm(); }}>
            <Pressable style={styles.cardModalBottom} onPress={() => {}}>
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
                    <TextInput style={styles.input} placeholder="DD/MM/AAAA" value={occData} onChangeText={setOccData} maxLength={10} keyboardType="numbers-and-punctuation" />
                  </View>
                  <View style={{flex: 1}}>
                    <Text style={styles.occLabel}>Horário</Text>
                    <TextInput style={styles.input} placeholder="Ex: 19:45" value={occHorario} onChangeText={setOccHorario} maxLength={5} keyboardType="numbers-and-punctuation" />
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
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL CHECK SIMPLES — Nível 1 (score ≤ 5) */}
      <Modal transparent visible={simpleCheckVisible} animationType="fade">
        <View style={styles.overlayCentered}>
          <View style={styles.cardModal}>
            <View style={[styles.modalStrip, { backgroundColor: '#2E8B57' }]} />
            <View style={styles.modalInner}>
              <Ionicons name="heart-outline" size={36} color="#2E8B57" style={{ alignSelf: 'center', marginBottom: 10 }} />
              <Text style={[styles.cardTitleCritical, { color: '#2E8B57' }]}>Tudo bem?</Text>
              <Text style={styles.cardSubtitle}>
                O Ampara está monitorando você. Confirme que está segura.
              </Text>
              <TouchableOpacity style={[styles.btnSafe, { backgroundColor: '#2E8B57' }]} onPress={handleUserIsSafe}>
                <Text style={styles.btnSafeText}>Sim, estou bem</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { marginTop: 10, backgroundColor: '#C4687A' }]}
                onPress={() => { setSimpleCheckVisible(false); executarEnvioDeSocorro(); }}
              >
                <Text style={styles.btnPrimaryText}>Preciso de ajuda</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL CRONÔMETRO — Nível 2 (score 5-8) e Nível 3 (score > 8) */}
      <Modal transparent visible={modalVisible} animationType="fade">
        <View style={styles.overlayCentered}>
          <View style={styles.cardModal}>
            <View style={[styles.modalStrip, { backgroundColor: alertType === 'critico' ? '#C4687A' : '#D4A017' }]} />
            <View style={styles.modalInner}>
              <Text style={styles.cardTitleCritical}>
                {alertType === 'critico' ? 'Alerta Crítico' : 'Confirma bem-estar?'}
              </Text>
              <Text style={styles.cardSubtitle}>
                {alertType === 'critico'
                  ? `Score ${displayScore}/10 · Risco alto detectado. Seus contatos serão acionados em:`
                  : `Score ${displayScore}/10 · Movimento incomum detectado. Confirme que está segura.`}
              </Text>

              <View style={{alignItems: 'center', marginVertical: 10}}>
                <View style={[styles.timerCircle, { borderColor: alertType === 'critico' ? '#C4687A' : '#D4A017' }]}>
                  <Text style={[styles.timerCountText, { color: alertType === 'critico' ? '#C4687A' : '#D4A017' }]}>{countdown}</Text>
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

      <Modal
        visible={showWatchMonitoringAlert}
        animationType="fade"
        onRequestClose={() => setWatchAlertDismissed(true)}
        statusBarTranslucent
      >
        <View style={styles.watchAlertScreen}>
          <View style={styles.watchAlertHeader}>
            <Image
              source={require('../assets/images/maos-ampara-azul.png')}
              style={styles.watchAlertLogo}
              resizeMode="contain"
            />
            <TouchableOpacity
              onPress={() => setWatchAlertDismissed(true)}
              style={styles.watchAlertClose}
              accessibilityRole="button"
              accessibilityLabel="Fechar aviso de monitoramento cardíaco"
            >
              <Ionicons name="close" size={24} color="#526170" />
            </TouchableOpacity>
          </View>

          <View style={styles.watchAlertContent}>
            <View style={styles.watchAlertIcon}>
              <Ionicons name="heart-dis" size={38} color="#C4475D" />
            </View>
            <Text style={styles.watchAlertEyebrow}>ATENÇÃO AO MONITORAMENTO</Text>
            <Text style={styles.watchAlertTitle}>O Ampara não está recebendo seus batimentos</Text>
            <Text style={styles.watchAlertBody}>
              Sua frequência cardíaca não está sendo acompanhada pelo app neste momento.
            </Text>
            <View style={styles.watchAlertSteps}>
              <Text style={styles.watchAlertStepsTitle}>Confira o relógio</Text>
              <Text style={styles.watchAlertStep}>• Ele está ligado e próximo do celular?</Text>
              <Text style={styles.watchAlertStep}>• O Ampara está aberto no relógio?</Text>
              <Text style={styles.watchAlertStep}>• O monitoramento cardíaco está ativo?</Text>
            </View>
            <TouchableOpacity
              style={styles.watchAlertButton}
              onPress={() => setWatchAlertDismissed(true)}
              accessibilityRole="button"
            >
              <Text style={styles.watchAlertButtonText}>Entendi</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  )
}

const styles = StyleSheet.create({
  flexOne: { flex: 1 },
  container: { flex: 1, backgroundColor: Brand.canvas },
  scrollContent: { paddingBottom: 130 },

  headerContainer: { paddingTop: 52, paddingHorizontal: 22, paddingBottom: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerBrandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerLogo: { width: 42, height: 36 },
  header: { fontSize: 29, color: Brand.roseDeep, fontWeight: '700' },

  topModesRow: { minHeight: 70, marginHorizontal: 22, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Brand.line },
  topModeCell: { flex: 1, minWidth: 0, paddingVertical: 7, paddingHorizontal: 4 },
  topModeHeading: { minHeight: 25, flexDirection: 'row', alignItems: 'center', gap: 6 },
  topModeTitle: { flex: 1, minWidth: 0, color: Brand.ink, fontSize: 11, fontWeight: '700' },
  topModeControlRow: { minHeight: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  topModeSubtitle: { flex: 1, minWidth: 0, color: Brand.green, fontSize: 10 },
  topModeDivider: { width: 1, height: 42, backgroundColor: Brand.line, marginHorizontal: 8 },
  monitoringStatusOff: { color: Brand.muted },

  riskSection: { paddingHorizontal: 22, paddingTop: 5, paddingBottom: 20, marginHorizontal: 0, marginTop: 0, marginBottom: 0 },
  riskRow: { minHeight: 30, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  riskSummary: { flexDirection: 'row', alignItems: 'baseline', gap: 9 },
  riskLabel: { fontSize: 12, color: Brand.roseDeep, fontWeight: '700', textTransform: 'uppercase' },
  riskBadgeText: { color: Brand.roseDeep, fontWeight: '700', fontSize: 12 },
  riskCompactRow: { minHeight: 17, flexDirection: 'row', alignItems: 'center' },
  gaugeScoreBig: { fontSize: 32, fontWeight: '800', lineHeight: 36 },
  gaugeScoreMax: { fontSize: 14, fontWeight: '500', color: Brand.muted },
  gaugeDesc: { fontSize: 10, lineHeight: 13, color: Brand.muted },
  timeFactorRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeFactorText: { fontSize: 10, color: Brand.muted, fontWeight: '600' },
  scoreTrack: { height: 3, overflow: 'hidden', marginTop: 2, borderRadius: 3, backgroundColor: 'rgba(118,103,112,0.16)' },
  scoreFill: { height: '100%', borderRadius: 4 },

  safeStrip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 22, paddingVertical: 12, backgroundColor: Brand.mint },
  safeStripText: { fontSize: 13, color: Brand.green, fontWeight: '500' },

  homeSectionTabs: { flexDirection: 'row', marginHorizontal: 22, paddingTop: 5, borderTopWidth: 1, borderTopColor: Brand.line, borderBottomWidth: 1, borderBottomColor: Brand.line },
  homeSectionTab: { minWidth: 112, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  homeSectionTabActive: { borderBottomColor: Brand.rose },
  homeSectionTabText: { color: Brand.muted, fontSize: 13, fontWeight: '600' },
  homeSectionTabTextActive: { color: Brand.roseDeep },
  mapSectionTitle: { marginHorizontal: 22, marginTop: 20, marginBottom: 14, color: Brand.ink, fontSize: 19, fontWeight: '700' },
  sensorAvailabilityNote: { marginHorizontal: 22, paddingVertical: 14, color: Brand.muted, fontSize: 12, lineHeight: 18, borderBottomWidth: 1, borderBottomColor: Brand.line },

  heartRatePanel: { minHeight: 132, marginHorizontal: 22, marginTop: 2, paddingVertical: 12, paddingHorizontal: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent', borderBottomWidth: 1, borderBottomColor: Brand.line },
  heartRateLabel: { marginTop: 6, color: Brand.muted, fontSize: 11, fontWeight: '700' },
  heartRateValueRow: { minHeight: 58, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' },
  heartRateValue: { color: Brand.roseDeep, fontSize: 46, lineHeight: 56, fontWeight: '800' },
  heartRateValueUnavailable: { color: Brand.muted },
  heartRateUnit: { marginLeft: 6, color: Brand.muted, fontSize: 18, fontWeight: '600' },
  heartRateDetail: { minHeight: 18, color: Brand.green, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  heartRateBaselineDetail: { minHeight: 16, marginTop: 4, color: Brand.muted, fontSize: 11, textAlign: 'center' },
  experimentalScorePanel: { marginHorizontal: 22, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Brand.line },
  experimentalScoreHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  experimentalScoreTitle: { color: Brand.ink, fontSize: 13, fontWeight: '700' },
  experimentalScoreVersion: { color: Brand.muted, fontSize: 10 },
  experimentalScoreResult: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 5 },
  experimentalScoreValue: { color: Brand.roseDeep, fontSize: 22, fontWeight: '800' },
  experimentalScoreLevel: { color: Brand.ink, fontSize: 13, fontWeight: '600' },
  experimentalScoreValueUnavailable: { marginTop: 5, color: Brand.muted, fontSize: 12 },
  experimentalScoreDetail: { color: Brand.muted, fontSize: 11 },
  experimentalScoreDisclaimer: { marginTop: 4, color: Brand.muted, fontSize: 10, lineHeight: 14 },
  heartRateDetailStale: { color: Brand.amber },
  smartwatchConnectionButton: { minHeight: 66, marginHorizontal: 22, marginTop: 0, marginBottom: 14, paddingHorizontal: 0, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Brand.line, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'transparent' },
  smartwatchConnectionButtonConnected: { borderColor: Brand.line },
  smartwatchConnectionButtonDisconnected: { borderColor: Brand.line },
  smartwatchIconWrap: { width: 28, height: 32, alignItems: 'center', justifyContent: 'center' },
  smartwatchConnectionTexts: { flex: 1 },
  smartwatchConnectionTitle: { color: Brand.ink, fontSize: 15, fontWeight: '800' },
  smartwatchConnectionSubtitle: { color: Brand.muted, fontSize: 11, marginTop: 2 },
  smartwatchWarning: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, marginTop: -8, marginBottom: 16, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, borderWidth: 1, borderColor: '#F1D9B7', backgroundColor: Brand.amberSoft },
  smartwatchWarningTexts: { flex: 1 },
  smartwatchWarningTitle: { color: '#744210', fontSize: 13, fontWeight: '700' },
  smartwatchWarningMessage: { color: '#775A36', fontSize: 11, marginTop: 2 },
  watchAlertScreen: { flex: 1, backgroundColor: Brand.canvas, paddingTop: Platform.OS === 'android' ? 34 : 18, paddingHorizontal: 24, paddingBottom: 28 },
  watchAlertHeader: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  watchAlertLogo: { width: 58, height: 42 },
  watchAlertClose: { width: 42, height: 42, borderRadius: 21, backgroundColor: Brand.surfaceRose, alignItems: 'center', justifyContent: 'center' },
  watchAlertContent: { flex: 1, justifyContent: 'center', alignItems: 'center', maxWidth: 460, width: '100%', alignSelf: 'center' },
  watchAlertIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: Brand.surfaceRose, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  watchAlertEyebrow: { color: Brand.roseDeep, fontSize: 11, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
  watchAlertTitle: { color: Brand.ink, fontSize: 26, lineHeight: 32, fontWeight: '800', textAlign: 'center' },
  watchAlertBody: { color: Brand.muted, fontSize: 16, lineHeight: 23, textAlign: 'center', marginTop: 14 },
  watchAlertSteps: { width: '100%', marginTop: 28, padding: 18, backgroundColor: Brand.surface, borderRadius: 20, borderWidth: 1, borderColor: Brand.line, gap: 10 },
  watchAlertStepsTitle: { color: Brand.ink, fontSize: 15, fontWeight: '700', marginBottom: 2 },
  watchAlertStep: { color: Brand.muted, fontSize: 14, lineHeight: 20 },
  watchAlertButton: { width: '100%', minHeight: 54, marginTop: 24, backgroundColor: Brand.rose, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  watchAlertButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  separator: { height: 1, backgroundColor: '#E8E0D8', marginHorizontal: 22 },

  filtroBloco: { marginHorizontal: 20, marginBottom: 14 },
  filtroCabecalho: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  filtroTitulo: { fontSize: 11, color: '#5A8FAF', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  filtroLimpar: { fontSize: 12, color: '#C4687A', fontWeight: '700', marginBottom: 8 },
  filtroRow: { gap: 8, paddingRight: 20 },
  filtroChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: '#E8E0D8', backgroundColor: '#FFF' },
  filtroChipAtivo: { backgroundColor: '#1B3A6B', borderColor: '#1B3A6B' },
  filtroChipVazio: { opacity: 0.45 },
  filtroTexto: { fontSize: 13, color: '#5A8FAF', fontWeight: '600' },
  filtroContagem: { fontSize: 11, color: '#9AA0A6', fontWeight: '700' },
  filtroTextoAtivo: { color: '#FFF' },

  mapContainer: { height: 300, borderTopLeftRadius: 24, borderTopRightRadius: 12, borderBottomRightRadius: 24, borderBottomLeftRadius: 12, overflow: 'hidden', marginHorizontal: 20, marginBottom: 16 },
  map: { flex: 1 },
  recenterButton: { position: 'absolute', bottom: 44, left: 12, backgroundColor: '#1B3A6B', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20 },
  mapLegend: { position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, gap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  // Quadrado, e não bolinha: representa uma área de concentração, não um ponto exato.
  legendCalor: { borderRadius: 5, backgroundColor: 'rgba(255, 152, 0, 0.8)', borderWidth: 1, borderColor: 'rgba(211, 47, 47, 0.9)' },
  legendText: { fontSize: 11, color: '#333', fontWeight: '600' },
  recenterText: { color: '#FFF', fontWeight: '600', fontSize: 13 },

  crimeStrip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, paddingVertical: 14, borderLeftWidth: 3 },
  crimeStripText: { fontSize: 14, fontWeight: '500' },

  forceRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 22, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Brand.line },
  forceValue: { fontSize: 22, fontWeight: '700' },
  forceLabel: { fontSize: 13, color: '#AAA', flex: 1 },
  forcePill: { backgroundColor: '#FDEAEC', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12 },
  forcePillText: { color: '#C4687A', fontSize: 11, fontWeight: '700' },
  watchMotionRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 22, paddingVertical: 8 },
  watchMotionValue: { minWidth: 82, color: '#1B3A6B', fontSize: 14, fontWeight: '700' },
  watchMotionTexts: { flex: 1 },
  watchMotionTitle: { color: '#526170', fontSize: 12, fontWeight: '700' },
  watchMotionDetail: { color: '#737B83', fontSize: 10, marginTop: 2 },

  floatingContainer: { position: 'absolute', bottom: 30, right: 20, alignItems: 'flex-end', zIndex: 10 },
  quickActionContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  fabHelp: { backgroundColor: '#E8622A', paddingVertical: 14, paddingHorizontal: 22, borderRadius: 30, elevation: 8, alignItems: 'center' },
  fabHelpHolding: { backgroundColor: '#B84C14', transform: [{ scale: 1.08 }] },
  fabHoldHint: { color: '#FFD8B0', fontSize: 10, fontWeight: '600', marginTop: 2 },
  fabText: { color: '#FFF', fontWeight: '600', fontSize: 13 },

  overlayCentered: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  cardModal: { backgroundColor: '#FFF', borderRadius: 28, overflow: 'hidden', width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 20, elevation: 12 },
  modalStrip: { height: 6, backgroundColor: '#C4687A', width: '100%' },
  modalInner: { padding: 25 },
  cardTitle: { fontSize: 22, fontWeight: '700', color: '#1B3A6B', marginBottom: 5, textAlign: 'center' },
  cardTitleCritical: { fontSize: 22, fontWeight: '700', color: '#C4687A', marginBottom: 5, textAlign: 'center' },
  cardSubtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 20, paddingHorizontal: 10, lineHeight: 20 },

  btnPrimary: { backgroundColor: '#1B3A6B', paddingVertical: 16, borderRadius: 30, alignItems: 'center', width: '100%' },
  btnPrimaryText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  btnCancelText: { textAlign: 'center', color: '#C4687A', marginTop: 15, fontWeight: '600', fontSize: 15 },
  btnHelpGuide: { marginTop: 12, paddingVertical: 14, borderRadius: 30, alignItems: 'center', backgroundColor: '#F5EFE6' },
  btnHelpGuideText: { color: '#1B3A6B', fontWeight: '700', fontSize: 14 },
  btnSafe: { backgroundColor: '#4CAF50', paddingVertical: 15, width: '100%', borderRadius: 30, alignItems: 'center' },
  btnSafeText: { color: '#FFF', fontWeight: '700', fontSize: 16 },

  feedbackBox: { backgroundColor: '#F5EFE6', padding: 15, borderRadius: 15, marginBottom: 25, borderWidth: 1, borderColor: '#E8E0D8' },
  feedbackLabel: { fontSize: 12, fontWeight: 'bold', color: '#5A8FAF', marginBottom: 5 },
  feedbackAddressText: { fontSize: 16, color: '#C4687A', fontWeight: 'bold', marginBottom: 5 },
  feedbackText: { fontSize: 14, color: '#333', fontStyle: 'italic' },
  sosFailDetail: { fontSize: 11, color: '#999', textAlign: 'center', marginTop: -12, marginBottom: 16 },
  feedbackContact: { fontSize: 15, color: '#1B3A6B', fontWeight: '600', marginTop: 3 },

  overlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  cardModalBottom: { backgroundColor: '#FFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '90%', overflow: 'hidden', elevation: 20 },
  modalHandle: { width: 40, height: 4, backgroundColor: '#DDD', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 16 },
  btnOrange: { backgroundColor: '#E8622A', paddingVertical: 16, borderRadius: 30, alignItems: 'center', width: '100%' },

  occScrollContent: { flexGrow: 1, padding: 22, paddingTop: 0 },
  occLabel: { color: '#1B3A6B', fontWeight: '700', marginTop: 15, marginBottom: 8, fontSize: 14 },
  inputRow: { flexDirection: 'row', gap: 10 },
  inputFlex: { flex: 1, borderWidth: 1, borderColor: '#D8D0CC', borderRadius: 14, padding: 14, fontSize: 15, backgroundColor: '#F9F9F9' },
  input: { borderWidth: 1, borderColor: '#D8D0CC', borderRadius: 14, padding: 14, fontSize: 15, backgroundColor: '#F9F9F9', marginTop: 5 },
  gpsBtn: { backgroundColor: '#F5EFE6', width: 55, justifyContent: 'center', alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: '#D8D0CC' },
  typeContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 5 },
  typeButton: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: '#D8D0CC', backgroundColor: '#FFF' },
  typeSelected: { backgroundColor: '#1B3A6B', borderColor: '#1B3A6B' },
  typeText: { color: '#555', fontSize: 13, fontWeight: '500' },
  typeTextSelected: { color: '#FFF', fontWeight: 'bold' },
  suggestionsBox: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#D8D0CC', borderRadius: 12, marginTop: 5, maxHeight: 150 },
  suggestionItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#F5EFE6' },
  suggestionText: { fontSize: 13, color: '#333' },

  timerCircle: { width: 90, height: 90, borderRadius: 45, borderWidth: 4, borderColor: '#C4687A', justifyContent: 'center', alignItems: 'center', marginVertical: 10 },
  timerCountText: { fontSize: 32, fontWeight: 'bold', color: '#C4687A' },
  timerSecondsText: { fontSize: 11, color: '#666', fontWeight: '600' },
  alertWarningText: { fontSize: 13, color: '#666', textAlign: 'center', marginVertical: 15, paddingHorizontal: 10 },

  demoPanel: { marginHorizontal: 20, marginTop: 16, marginBottom: 8, backgroundColor: '#EEF6FC', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#B8D6E8' },
  demoPanelHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  demoPanelTitle: { fontSize: 13, fontWeight: '700', color: '#1B3A6B' },
  demoSectionLabel: { fontSize: 11, color: '#5A8FAF', fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  demoBtnRow: { flexDirection: 'row', gap: 8 },
  demoBtn: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, alignItems: 'center', backgroundColor: '#FFF', gap: 2 },
  demoBtnActive: { backgroundColor: '#F0F8FF' },
  demoBtnText: { fontSize: 12, fontWeight: '700' },
  demoBtnSub: { fontSize: 10, color: '#888' },
  demoEnvActive: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: '#EAF5EC', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10 },
  demoEnvActiveText: { fontSize: 11, color: '#27AE60', fontWeight: '600', flex: 1 },
  demoResetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 12 },
  demoResetText: { fontSize: 12, color: '#5A8FAF', fontWeight: '600' },
})
