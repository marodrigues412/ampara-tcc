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
  Image,
  AccessibilityInfo,
} from 'react-native'

import { useFocusEffect } from '@react-navigation/native'
import * as Location from 'expo-location'
import * as Haptics from 'expo-haptics'
import { Ionicons } from '@expo/vector-icons'
import { useRiskDetection } from '../hooks/useRiskDetection'
import { useContextLayer } from '../hooks/useContextLayer'
import { buscarEnderecoReverso } from '../services/enderecoReverso'
import { buscarResumoCrimes } from '../services/crimesService'
import { supabase } from '../services/supabase'
import { getActivityStatus, updateActivityStatus } from "../services/activityService"
import { listarCompromissos } from "../services/routineService"
import { comoHorariosDeAtividade } from "../utils/rotina"
import { horarioAtivoAgora, descreverProximoHorario } from "../utils/activitySchedule"
import { saveLocationPoint } from "../services/locationService"
import { useSmartwatch } from '../hooks/useSmartwatch'
import { calculateMotionRiskScore } from '../utils/motionRiskScore'
import { calculateHeartRateBaseline } from '../services/heartRateBaseline'
import { extractPhoneMotionFeatures, scoreIsolationForest } from '../services/isolationForestMotion'
import { ALTO_SUSTENTADO_MS, acaoDoNivel, avaliarCorpo, fundirCamadas, movimentoDoRelogio } from '../services/threeLayerRisk'
import { publicarEstadoDoRisco } from '../services/estadoDoRisco'
import isolationForestMotionModel from '../models/isolationForestMotionModel.json'
import { RISK_ASSESSMENT_SAMPLE_INTERVAL_MS, saveRiskAssessment } from '../services/riskAssessmentService'
import { Brand, FonteDaLia, TemaDaAba } from '../constants/brandTheme'
import { nivelDaRegiao } from '../utils/relatorio'
import LiaAvatar from '../components/LiaAvatar'
import LiaHelpModal from '../components/LiaHelpModal'
import SosHoldOverlay from '../components/SosHoldOverlay'
import RoutineToday from '../components/RoutineToday'
import HeaderComCurvas from '../components/HeaderComCurvas'
import AnelDaLia from '../components/AnelDaLia'
import CamadasDoRisco from '../components/CamadasDoRisco'

import { dispararAlerta } from '../services/alertService'
import { FRACAO_DO_ANO } from '../utils/mapaCalor'

// Raio do entorno da usuária: a área cujos crimes entram no score. É o mesmo raio que a
// aba Mapa usa para resumir uma região.
const RAIO_INICIAL_KM = 1
// Monitoramento reforçado (nível moderado): grava a posição nesse intervalo, sem avisar.
const INTERVALO_REFORCADO_MS = 60_000
const VERSAO_DO_SCORE = 'contexto-ssp+corpo-3camadas-v2.0'
const LIVE_HEART_RATE_MS = 10_000
const SOS_HOLD_MS = 3_000
const HEART_RATE_STATUS_MAX_AGE_MS = 30_000

const getHeartRateSignalMessage = (sensorStatus) => {
  if (!sensorStatus || Date.now() - Date.parse(sensorStatus.time) > HEART_RATE_STATUS_MAX_AGE_MS) return null
  switch (sensorStatus.status) {
    case -10:
      return 'Sinal fraco ou movimento excessivo. Ajuste o relógio no pulso e aguarde alguns segundos.'
    case -8:
      return 'O sinal do sensor oscilou. Confira o encaixe do relógio no pulso e aguarde uma nova leitura.'
    case -3:
      return 'O relógio detectou que está fora do pulso. Recoloque-o para retomar as leituras.'
    case -2:
      return 'O relógio detectou movimento durante a medição. As leituras voltam quando o sinal estabilizar.'
    case -999:
      return 'Outro sensor está medindo neste momento. O monitoramento contínuo será retomado em seguida.'
    case 0:
      return 'O sensor está iniciando uma nova medição.'
    default:
      return null
  }
}

// De quanto em quanto tempo a Home confere se começou ou acabou um horário programado
// de atividade. Meio minuto basta: ninguém percebe o modo ligar 30 s depois das 8h.
const CHECAGEM_HORARIO_MS = 30_000
// Quanto esperar, depois de uma posição nova, para gravar o score dela no histórico: o
// tempo de a contagem de crimes do lugar novo chegar (costuma levar menos de 2 s).
const ESPERA_SCORE_DO_LUGAR_MS = 4_000


const TEMA = TemaDaAba['Proteção']
const DIAS_CURTOS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
// Mesmas cores da legenda do mapa de calor, de poucos para muitos registros.
const CORES_DO_CALOR = ['#F6E7A8', '#F2B35A', '#E06A3B', '#B83D53']
// [cor da letra, fundo] de cada pessoa da rede de apoio.
const CORES_DA_REDE = [['#BD5574', '#F7E7EC'], ['#6E5A9E', '#EFEAF5'], ['#3F6A86', '#E9EFF2']]

// Respostas rápidas abaixo da fala da Lia, de acordo com o estado do risco. As que têm
// pergunta abrem a aba da Lia já com ela enviada; "Me sinto insegura" responde aqui
// mesmo, apontando o SOS, porque nessa hora ela não deve precisar trocar de tela.
const INSEGURA = { id: 'insegura', texto: 'Me sinto insegura' }
const SOS = { id: 'sos', texto: 'Como funciona o SOS?', pergunta: 'Como funciona o SOS do Ampara?' }
const RESPOSTAS_RAPIDAS = {
  tranquilo: [
    { id: 'ape', texto: 'É seguro ir a pé agora?', pergunta: 'É seguro eu ir a pé agora, daqui onde estou?' },
    { id: 'trajeto', texto: 'Dicas para meu próximo trajeto', pergunta: 'Que cuidados devo ter no meu próximo trajeto da rotina?' },
    INSEGURA,
  ],
  atencao: [
    INSEGURA,
    { id: 'agora', texto: 'O que faço agora?', pergunta: 'Meu risco está alto agora. O que devo fazer?' },
    SOS,
  ],
  pausado: [
    { id: 'quando', texto: 'Quando ligar o monitoramento?', pergunta: 'Em que momentos é melhor deixar o monitoramento ligado?' },
    SOS,
  ],
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
  const [userId, setUserId] = useState(null)
  const [resumoCrimes, setResumoCrimes] = useState({})
  const [contatos, setContatos] = useState([])
  const [respostaRapida, setRespostaRapida] = useState(null)
  const totalCrimesEntorno = useMemo(
    () => Object.values(resumoCrimes).reduce((soma, n) => soma + n, 0),
    [resumoCrimes],
  )

  const { data, location, riskStatus, phoneMotionWindow, gpsSpeedDeltaMps } = useRiskDetection()
  const smartwatch = useSmartwatch(userId)
  // Camada 1 do score de 3 camadas: faixa do mapa bairro × dia × período (SSP).
  const { contexto: contextoDaRegiao } = useContextLayer({ location, insideSafeZone })
  const motionRisk = useMemo(() => calculateMotionRiskScore({
    phoneMagnitudeG: riskStatus.magnitude,
    watchMotion: smartwatch.watchMotion,
    activityMode,
  }), [riskStatus.magnitude, smartwatch.watchMotion, activityMode])
  const smartwatchConnected = smartwatch.directWatchStatus === 'connected'
  const heartRateIsCurrent = smartwatchConnected
    && smartwatch.measurement?.isDirect
    && smartwatch.measurement?.isRecent
    && !heartRateFreshnessExpired
  const heartRateBaseline = calculateHeartRateBaseline(
    smartwatch.heartRateSamples,
    heartRateIsCurrent ? smartwatch.measurement : null,
  )
  const watchMeasurement = smartwatch.measurement
  const phoneMotionFeatures = extractPhoneMotionFeatures(phoneMotionWindow)
  const phoneMotionInference = phoneMotionFeatures
    ? scoreIsolationForest(phoneMotionFeatures, isolationForestMotionModel)
    : null
  const experimentalMotionScore = phoneMotionInference?.anomalyScore ?? null
  // Camada 2 (corpo): só os sinais que existem agora. Sem relógio ou com BPM velho, o
  // modo cai sozinho para "só celular"; quando o relógio volta, volta para "completo".
  const watchMotionAnomaly = movimentoDoRelogio(smartwatch.watchMotion, { activityMode })
  const corpo = avaliarCorpo({
    heartRateZScore: heartRateBaseline.available ? heartRateBaseline.zScore : null,
    movimentoCelular: experimentalMotionScore,
    movimentoRelogio: watchMotionAnomaly,
    activityMode,
  })
  // Camada 3: matriz 3×3. É o resultado oficial: mostra na tela e abre os alertas.
  const resultadoDoRisco = fundirCamadas({ contexto: contextoDaRegiao, corpo })
  const nivelDoRisco = resultadoDoRisco.nivel
  const watchMotionDetail = watchMotionAnomaly !== null
    ? `RMS ${smartwatch.watchMotion.rms.toFixed(1)} m/s² · ${watchMotionAnomaly === 1 ? 'impacto forte' : watchMotionAnomaly === 0.5 ? 'agitação' : 'normal'}`
    : smartwatchConnected ? 'Sem leitura recente' : 'Desconectado'
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
            title: getHeartRateSignalMessage(smartwatch.heartRateSensorStatus)
              ? 'Sinal do sensor oscilando'
              : 'Sem batimentos recentes',
            message: getHeartRateSignalMessage(smartwatch.heartRateSensorStatus)
              || 'O relógio informa que o monitoramento está ativo, mas o celular ainda não recebeu uma leitura recente.',
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
  const [helpInfo, setHelpInfo] = useState(null)
  // { roubo: 3475, furto: 12738, ... } no raio de RAIO_INICIAL_KM em volta da usuária.
  // Falso até chegar a primeira contagem: antes disso o score não tem o peso dos crimes e
  // mostrar "0/10 Baixo" daria uma falsa sensação de segurança.
  const [resumoPronto, setResumoPronto] = useState(false)
  const [horariosAtividade, setHorariosAtividade] = useState([])
  // Lembra se fomos nós que ligamos o modo atividade pelo horário: só nesse caso ele é
  // desligado sozinho no fim. Se a usuária ligou na mão, ela decide quando desligar.
  const ligadoPeloHorarioRef = useRef(false)
  const dentroDoHorarioRef = useRef(false)
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

  // --- Controle do Cronômetro de Alerta e Feedback SOS ---
  const [countdown, setCountdown] = useState(30)
  const [alertaDisparado, setAlertaDisparado] = useState(false);
  const timerRef = useRef(null);
  const sosHoldTimerRef = useRef(null);
  const lastAlertSentRef = useRef(null);
  const cancelCooldownRef = useRef(null);
  const [sustainedHighRisk, setSustainedHighRisk] = useState(false);
  const [sosHolding, setSosHolding] = useState(false);
  // Instante em que o alerta dispara. A contagem em si fica em SosHoldOverlay: se ela
  // morasse aqui, cada tique de 100 ms redesenharia a Home inteira, mapa incluído.
  const [sosHoldFim, setSosHoldFim] = useState(null)
  const [sosFeedbackVisible, setSosFeedbackVisible] = useState(false);
  const [sosFeedbackData, setSosFeedbackData] = useState({ status: 'enviando', mensagem: '', enviados: [], falhas: [], endereco: '', detalhe: '' });
  const [simpleCheckVisible, setSimpleCheckVisible] = useState(false);
  const [alertType, setAlertType] = useState('moderado');

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
      loadHorariosAtividade();
      loadContatos();
    }, [])
  );

  // Liga o modo atividade no começo de um horário programado e desliga no fim. Age só
  // na virada (entrou/saiu do horário), e não a cada checagem: assim, se a usuária
  // desligar na mão no meio do treino, o app não liga de novo meio minuto depois.
  useEffect(() => {
    const conferir = () => {
      const dentro = Boolean(horarioAtivoAgora(horariosAtividade, new Date()))
      if (dentro === dentroDoHorarioRef.current) return
      dentroDoHorarioRef.current = dentro
      if (dentro && !activityMode) {
        toggleActivity(true)
        ligadoPeloHorarioRef.current = true
      } else if (!dentro && activityMode && ligadoPeloHorarioRef.current) {
        toggleActivity(false)
      }
    }
    conferir()
    const intervalo = setInterval(conferir, CHECAGEM_HORARIO_MS)
    return () => clearInterval(intervalo)
  }, [horariosAtividade, activityMode])

  // Score da tela Proteção para gravar no histórico (coluna risco). Nulo com o
  // monitoramento pausado ou antes de o score ficar pronto: um 0 nessas horas puxaria a
  // média do relatório para baixo sem a usuária ter estado segura.
  const riscoParaHistoricoRef = useRef(null)
  useEffect(() => {
    riscoParaHistoricoRef.current = monitoramentoAtivo && resumoPronto ? riskScore : null
  }, [riskScore, monitoramentoAtivo, resumoPronto])

  // Grava histórico de localização (já throttled a 50m/5min no hook) para alimentar os dashboards.
  //
  // Espera alguns segundos antes de gravar: a posição nova dispara a busca dos crimes em
  // volta dela, e o score só reflete o lugar novo quando essa busca volta. Gravar na hora
  // salvaria o score do lugar anterior.
  useEffect(() => {
    if (!location || !userId) return
    const { latitude, longitude, speed } = location.coords
    setTimeout(() => {
      saveLocationPoint(userId, latitude, longitude, speed, null, "gps", riscoParaHistoricoRef.current)
    }, ESPERA_SCORE_DO_LUGAR_MS)
  }, [location, userId])

  const latestSavedRiskAtRef = useRef(0)
  useEffect(() => {
    latestSavedRiskAtRef.current = Math.max(
      latestSavedRiskAtRef.current,
      smartwatch.latestSavedHeartRateAt || 0,
    )
  }, [smartwatch.latestSavedHeartRateAt])

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
    // Um instante de espera para o score já refletir a mudança (ele é recalculado no
    // render seguinte ao do modo atividade).
    const { latitude, longitude, speed } = location.coords;
    setTimeout(() => {
      saveLocationPoint(userId, latitude, longitude, speed, null, "recalculo", riscoParaHistoricoRef.current);
    }, 1_500);
  }, [insideSafeZone, activityMode])

  // Último resultado para o contexto da Lia (só rótulos: nível, origem e sensores).
  const origemDoContexto = contextoDaRegiao?.origem ?? null
  // Republica a cada 30 s mesmo sem mudança: a Lia só usa leitura de até 2 min.
  useEffect(() => {
    const publicar = () => publicarEstadoDoRisco({
      monitoramentoAtivo,
      nivel: nivelDoRisco,
      estado: resultadoDoRisco.estado,
      origem: origemDoContexto,
      modo: corpo.modo,
    })
    publicar()
    const intervalo = setInterval(publicar, 30_000)
    return () => clearInterval(intervalo)
  }, [monitoramentoAtivo, nivelDoRisco, resultadoDoRisco.estado, origemDoContexto, corpo.modo])

  // Nível alto das 3 camadas só conta depois de ALTO_SUSTENTADO_MS seguidos. Os dois
  // caminhos passam por timer (o falso também, com 0 ms) para não mudar estado direto
  // no corpo do efeito.
  const [altoSustentado, setAltoSustentado] = useState(false)
  useEffect(() => {
    const alto = monitoramentoAtivo && nivelDoRisco === 'alto'
    const timer = setTimeout(() => setAltoSustentado(alto), alto ? ALTO_SUSTENTADO_MS : 0)
    return () => clearTimeout(timer)
  }, [monitoramentoAtivo, nivelDoRisco])

  // Gatilhos do alerta: impacto forte do celular (dispara na hora, como antes) ou nível
  // alto sustentado das 3 camadas.
  useEffect(() => {
    if (!monitoramentoAtivo) {
      setSustainedHighRisk(false);
      return;
    }
    if (isHighRisk || altoSustentado) {
      setSustainedHighRisk(true);
    } else {
      setSustainedHighRisk(false);
    }
  }, [monitoramentoAtivo, isHighRisk, altoSustentado]);

  // Nível moderado: monitoramento reforçado silencioso — a posição vai para o histórico
  // a cada minuto, mesmo parada, sem nenhum aviso na tela.
  const monitoramentoReforcado = monitoramentoAtivo && acaoDoNivel(nivelDoRisco) === 'monitoramento_reforcado'
  const ultimaLocalizacaoRef = useRef(null)
  useEffect(() => { ultimaLocalizacaoRef.current = location }, [location])
  useEffect(() => {
    if (!monitoramentoReforcado || !userId) return
    const intervalo = setInterval(() => {
      const coords = ultimaLocalizacaoRef.current?.coords
      if (!coords) return
      saveLocationPoint(userId, coords.latitude, coords.longitude, coords.speed, null, 'reforcado', riscoParaHistoricoRef.current)
    }, INTERVALO_REFORCADO_MS)
    return () => clearInterval(intervalo)
  }, [monitoramentoReforcado, userId])

  // 1️⃣ GATILHO DO MODAL — o tipo sai do nível das 3 camadas (alto: contagem de 10 s;
  // moderado: confirmação de 30 s; baixo ou sem nível: só "Tudo bem?")
  useEffect(() => {
    if (!monitoramentoAtivo) return;
    if (!sustainedHighRisk || alertaDisparado) return;
    if (modalVisible || simpleCheckVisible) return;

    const agora = Date.now();
    const emCooldownEnvio = lastAlertSentRef.current && (agora - lastAlertSentRef.current) < 60 * 1000;
    const emCooldownCancelamento = cancelCooldownRef.current && agora < cancelCooldownRef.current;
    if (emCooldownEnvio || emCooldownCancelamento) return;

    if (nivelDoRisco === 'alto') {
      setAlertType('critico');
      setCountdown(10);
      setModalVisible(true);
    } else if (nivelDoRisco === 'moderado') {
      setAlertType('moderado');
      setCountdown(30);
      setModalVisible(true);
    } else {
      setAlertType('simples');
      setSimpleCheckVisible(true);
    }
  }, [monitoramentoAtivo, sustainedHighRisk, modalVisible, simpleCheckVisible, alertaDisparado, nivelDoRisco, activityMode, insideSafeZone]);

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
  
  // Só para mostrar a rede de apoio na tela; o envio do SOS busca os contatos de novo.
  async function loadContatos() {
    const user = (await supabase.auth.getUser()).data.user
    if (!user) return
    const { data } = await supabase.from('emergency_contacts').select('id, nome').eq('user_id', user.id)
    setContatos(data ?? [])
  }

  async function loadActivity() {
    const user = (await supabase.auth.getUser()).data.user
    if (!user) return
    const data = await getActivityStatus(user.id)
    if (data) setActivityMode(data.ativo)
  }

  async function loadHorariosAtividade() {
    const user = (await supabase.auth.getUser()).data.user
    if (!user) return
    // O modo atividade liga sozinho nos compromissos de exercício da rotina que têm
    // "Ligar o modo atividade". A chave continua manual para o exercício fora da rotina.
    const compromissos = await listarCompromissos(user.id)
    setHorariosAtividade(comoHorariosDeAtividade(compromissos, new Date()))
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
    // Qualquer mudança tira o controle do horário: quem desligou não quer que o app
    // religue, e quem ligou fora do horário não quer que ele desligue sozinho. Quando a
    // chamada vem do próprio horário, ele marca de novo logo em seguida.
    ligadoPeloHorarioRef.current = false
    setActivityMode(value)
    const user = (await supabase.auth.getUser()).data.user
    if (!user) return
    await updateActivityStatus(user.id, value, "academia")
  }

  const showMonitoringInfo = () => setHelpInfo({
    title: 'Monitoramento',
    message: 'Com o monitoramento ativo, o Ampara acompanha os sinais disponíveis no celular e no relógio para identificar situações que merecem uma checagem. Isso não substitui ajuda de emergência. O SOS pode ser acionado manualmente a qualquer momento.',
  })

  const showActivityInfo = () => setHelpInfo({
    title: 'Modo atividade',
    message: 'Ative só enquanto estiver se exercitando. O Ampara considera esse contexto ao interpretar movimentos e calcular o risco, para não tratar o exercício como um movimento incomum. O monitoramento e o SOS continuam ativos. Desative ao terminar. Para treinos fixos, cadastre um compromisso de Exercício na sua rotina: o modo liga e desliga sozinho.',
  })

  function toggleMonitoramento(value) {
    setMonitoramentoAtivo(value)
    if (!value) {
      if (timerRef.current) clearTimeout(timerRef.current)
      setModalVisible(false)
      setSimpleCheckVisible(false)
      setAlertaDisparado(false)
      setSustainedHighRisk(false)
      cancelCooldownRef.current = Date.now() + 30 * 1000
    }
  }

  function handleSmartwatchPress() {
    if (smartwatch.status === 'connected') smartwatch.refresh()
    else if (smartwatch.status === 'permission_required' || smartwatch.status === 'error') smartwatch.connect()
  }

  // --- Score de pontos antigo (0 a 10) ---
  // Não aparece mais na tela nem abre alertas: o resultado oficial é o de 3 camadas
  // (resultadoDoRisco). Segue calculado só para a coluna risco do histórico, que o
  // Dashboard lê, e para context_score em risk_assessments, até essas telas migrarem.
  // Também é aqui que se descobre se a usuária está num local seguro (80 m).
  useEffect(() => {
    let score = 0

    // Crimes na área
    // Densidade por km², e não contagem bruta: a contagem dependia do raio buscado e
    // vinha truncada em 1.000, então qualquer região urbana batia no teto e somava os
    // mesmos 4 pontos. Os limites são os mesmos que pintam o mapa de calor, para a cor
    // que a usuária vê e o score contarem a mesma história.
    // Os limites são por ano; FRACAO_DO_ANO os ajusta para os 6 meses que a base soma.
    const densidadeCrimes = totalCrimesEntorno / (Math.PI * RAIO_INICIAL_KM ** 2)
    const pontosRegiao = densidadeCrimes > 700 * FRACAO_DO_ANO ? 4 : densidadeCrimes > 250 * FRACAO_DO_ANO ? 2 : 0
    score += pontosRegiao

    // Fator horário
    const hora = new Date().getHours()
    const pontosHorario = hora < 6 ? 3 : hora >= 22 ? 2 : hora >= 18 ? 1 : 0
    score += pontosHorario

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
  }, [totalCrimesEntorno, activityMode, location, safeLocations, motionRisk.total])

  // Uma avaliação a cada 30 s, nos três cenários. Com relógio, cada leitura de BPM
  // também entra (é dela que sai a linha de base da última hora).
  useEffect(() => {
    const measurement = watchMeasurement
    const comBpm = heartRateIsCurrent && measurement?.isDirect && smartwatch.heartRateHistoryReady
    const medidoEm = comBpm ? Date.parse(measurement?.time) : Date.now()
    if (
      !userId
      || !monitoramentoAtivo
      || riskContextScore === null
      || (!comBpm && !corpo.disponivel)
      || !Number.isFinite(medidoEm)
      || medidoEm - latestSavedRiskAtRef.current < RISK_ASSESSMENT_SAMPLE_INTERVAL_MS
    ) return

    latestSavedRiskAtRef.current = medidoEm
    saveRiskAssessment(userId, {
      measuredAt: new Date(medidoEm).toISOString(),
      bpm: comBpm ? measurement.bpm : null,
      baselineMeanBpm: heartRateBaseline.meanBpm,
      baselineStdDevBpm: heartRateBaseline.standardDeviationBpm,
      bpmZScore: heartRateBaseline.zScore,
      contextScore: riskContextScore,
      experimentalRiskLevel: nivelDoRisco,
      sensorMode: corpo.modo,
      bodyScore: corpo.escore,
      bodyBand: corpo.faixa,
      bpmAnomaly: corpo.sinais.bpm,
      watchMotionAnomaly: corpo.sinais.movimentoRelogio,
      contextBand: contextoDaRegiao?.faixa ?? null,
      contextOrigin: contextoDaRegiao?.origem ?? null,
      contextUnavailableReason: contextoDaRegiao ? contextoDaRegiao.motivo : 'calculando',
      hourOfDay: new Date(medidoEm).getHours(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local',
      insideSafeZone,
      activityMode,
      motionRiskScore: experimentalMotionScore === null ? null : Math.round(experimentalMotionScore * 1000) / 100,
      motionAnomalyScore: experimentalMotionScore,
      phoneMotionRiskPoints: motionRisk.phonePoints,
      watchMotionRiskPoints: motionRisk.watchPoints,
      phoneMeanMagnitudeG: phoneMotionWindow?.meanMagnitudeG,
      phoneMagnitudeStdDevG: phoneMotionWindow?.stdDevMagnitudeG,
      phonePeakMagnitudeG: phoneMotionWindow?.peakMagnitudeG,
      phoneJerkGPerSecond: phoneMotionWindow?.jerkGPerSecond,
      phoneMotionSampleCount: phoneMotionWindow?.sampleCount,
      gpsSpeedMps: Number.isFinite(location?.coords?.speed) ? location.coords.speed : null,
      gpsSpeedDeltaMps,
      watchMotionRmsMps2: motionRisk.watchIsRecent ? smartwatch.watchMotion.rms : null,
      watchMotionPeakMps2: motionRisk.watchIsRecent ? smartwatch.watchMotion.peak : null,
      watchMotionJerkMps3: motionRisk.watchIsRecent ? smartwatch.watchMotion.jerk : null,
      modelVersion: `${VERSAO_DO_SCORE}:${isolationForestMotionModel.modelVersion}`,
      source: comBpm ? measurement.source : 'Celular',
    }).catch(error => {
      console.warn('Não foi possível salvar a avaliação de risco:', error.message)
    })
  }, [
    userId,
    monitoramentoAtivo,
    riskContextScore,
    insideSafeZone,
    activityMode,
    smartwatch.heartRateHistoryReady,
    watchMeasurement,
    heartRateIsCurrent,
    heartRateBaseline.meanBpm,
    heartRateBaseline.standardDeviationBpm,
    heartRateBaseline.zScore,
    nivelDoRisco,
    corpo,
    contextoDaRegiao,
    experimentalMotionScore,
    motionRisk.phonePoints,
    motionRisk.watchPoints,
    phoneMotionWindow,
    location,
    gpsSpeedDeltaMps,
    motionRisk.watchIsRecent,
    smartwatch.watchMotion,
  ])

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
      // Prazo curto: o SOS não pode esperar o geocodificador. Sem endereço, vai só o GPS.
      const { enderecos: addressArray } = await buscarEnderecoReverso({ latitude: userLat, longitude: userLon, prioridade: 'protecao', prazoMs: 4_000 });
      if (addressArray && addressArray.length > 0) {
        const a = addressArray[0];
        enderecoFormatado = `${a.street || a.name || ''}${a.streetNumber ? ', ' + a.streetNumber : ''} - ${a.district || a.subregion || ''}, ${a.city || ''}`;
      }
    } catch (e) {
      console.log("Erro ao buscar endereço reverso no SOS:", e);
    }

    const textoMensagem = `🚨 ALERTA AMPARA: ${userName} pode estar em perigo! Risco: ${rotuloDoNivelNoAlerta}. Local: ${enderecoFormatado}. Mapa: ${linkMapa}`;

    setSosFeedbackData({ status: 'enviando', mensagem: textoMensagem, enviados: [], falhas: [], endereco: enderecoFormatado, detalhe: '' });
    setSosFeedbackVisible(true);

    const resultado = await dispararAlerta({
      userId,
      nomeUsuario: userName,
      endereco: enderecoFormatado,
      latitude: userLat,
      longitude: userLon,
      nivelRisco: rotuloDoNivelNoAlerta,
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

  const clearSosHoldTimers = () => {
    if (sosHoldTimerRef.current) clearTimeout(sosHoldTimerRef.current)
    sosHoldTimerRef.current = null
  }

  const beginSosHold = () => {
    if (sosHoldTimerRef.current) return
    setSosHolding(true)
    setSosHoldFim(Date.now() + SOS_HOLD_MS)
    AccessibilityInfo.announceForAccessibility('Segure por três segundos para enviar um alerta SOS.')
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})

    sosHoldTimerRef.current = setTimeout(() => {
      clearSosHoldTimers()
      setSosHolding(false)
      setSosHoldFim(null)
      AccessibilityInfo.announceForAccessibility('Alerta SOS acionado. Enviando para sua rede de apoio.')
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {})
      void executarEnvioDeSocorro()
    }, SOS_HOLD_MS)
  }

  const cancelSosHold = () => {
    if (sosHoldTimerRef.current) clearSosHoldTimers()
    setSosHolding(false)
    setSosHoldFim(null)
  }

  useEffect(() => () => {
    if (sosHoldTimerRef.current) clearTimeout(sosHoldTimerRef.current)
  }, [])

  const handleUserIsSafe = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setModalVisible(false)
    setSimpleCheckVisible(false)
    setCountdown(30)
    setAlertaDisparado(false)
    setSustainedHighRisk(false)
    cancelCooldownRef.current = Date.now() + 30 * 1000
  }

  // Contagem por tipo no entorno da usuária, para o score. Fica presa à posição dela: o
  // risco é de onde ela está.
  useEffect(() => {
    async function carregarResumo() {
      if (!location) return
      const resumo = await buscarResumoCrimes(
        location.coords.latitude, location.coords.longitude, RAIO_INICIAL_KM,
      )
      if (resumo) setResumoCrimes(resumo)
      // Mesmo em falha: o score segue sem o peso dos crimes, em vez de ficar carregando.
      setResumoPronto(true)
    }
    carregarResumo()
  }, [location])

  const handleUseCurrentLocation = async () => {
    setLoadingGPS(true)
    let { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') { Alert.alert('Erro', 'Permissão de GPS negada'); setLoadingGPS(false); return; }
    let loc = await Location.getCurrentPositionAsync({})
    const { latitude, longitude } = loc.coords
    setOccCoords({ latitude, longitude })
    const { enderecos: address } = await buscarEnderecoReverso({ latitude, longitude, prioridade: 'protecao', prazoMs: 8_000 })
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

  // O que a tela mostra é o nível da matriz. Sem uma das camadas não há nível:
  // "calculando" (primeiros segundos) ou "sem dados da região" (bairro fora do mapa).
  const nivelNaTela = monitoramentoAtivo ? nivelDoRisco : null
  const calculandoScore = monitoramentoAtivo && resultadoDoRisco.estado === 'calculando'
  const semDadosDaRegiao = monitoramentoAtivo && resultadoDoRisco.estado === 'sem_contexto'
  // O anel enche um terço por nível.
  const anelDoNivel = { baixo: 10 / 3, moderado: 20 / 3, alto: 10 }[nivelNaTela] ?? null
  const horarioAgora = horarioAtivoAgora(horariosAtividade, new Date())
  const textoAtividade = activityMode
    ? (horarioAgora ? `Até ${horarioAgora.hora_fim.slice(0, 5)} · ${horarioAgora.nome}` : 'Exercício ativo')
    : (descreverProximoHorario(horariosAtividade, new Date()) ?? 'Para exercícios')
  const displayLevel = { baixo: 'Baixo', moderado: 'Moderado', alto: 'Alto' }[nivelNaTela]
    ?? (semDadosDaRegiao ? 'Sem dados da região' : 'Não calculado')
  // A AWS corta o nível em 12 caracteres no SMS.
  const rotuloDoNivelNoAlerta = nivelNaTela ? displayLevel : semDadosDaRegiao ? 'Sem dados' : 'Calculando'
  const riskAccent = { baixo: Brand.green, moderado: Brand.amber, alto: Brand.danger }[nivelNaTela] ?? '#9A8C93'
  const liaReaction = !monitoramentoAtivo
    ? 'ociosa'
    : insideSafeZone
      ? 'seguro'
      : displayLevel === 'Alto'
        ? 'critico'
        : displayLevel === 'Moderado'
          ? 'checagem'
          : 'trajeto'

  const agoraTela = new Date()
  const dataDeHoje = `${DIAS_CURTOS[agoraTela.getDay()]}, ${agoraTela.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`

  // O que a Lia diz no balão, de acordo com o estado do risco.
  const falaDaLia = !monitoramentoAtivo
    ? 'O monitoramento está pausado. Ligue quando sair para eu voltar a acompanhar seu risco.'
    : calculandoScore
      ? 'Estou olhando sua região e o horário. Já te conto como está seu risco.'
      : insideSafeZone
        ? 'Você está em um dos seus locais seguros. Pode ficar tranquila, eu sigo acompanhando.'
        : semDadosDaRegiao
          ? 'Não tenho dados de ocorrências deste bairro agora, então não estimo o risco da região. Sigo de olho no seu movimento, e o SOS funciona normalmente.'
        : displayLevel === 'Alto'
          ? 'Seu risco está alto agora. Procure um lugar iluminado e movimentado. Se precisar, segure o SOS.'
          : displayLevel === 'Moderado'
            ? 'Atenção redobrada por aqui. Prefira ruas movimentadas e mantenha o celular à mão.'
            : agoraTela.getHours() >= 18 || agoraTela.getHours() < 6
              ? 'Já é noite, mas seu risco está baixo. Sigo acompanhando.'
              : 'Tudo tranquilo por aqui. Sigo acompanhando.'

  // A resposta rápida vale só enquanto o estado do risco não muda.
  const estadoDoRisco = `${monitoramentoAtivo}|${calculandoScore}|${insideSafeZone}|${displayLevel}`
  const textoDaResposta = respostaRapida?.estado === estadoDoRisco ? respostaRapida.texto : null

  const respostasRapidas = calculandoScore
    ? []
    : !monitoramentoAtivo
      ? RESPOSTAS_RAPIDAS.pausado
      : nivelNaTela === 'baixo' ? RESPOSTAS_RAPIDAS.tranquilo : RESPOSTAS_RAPIDAS.atencao

  const responderRapido = (resposta) => {
    if (resposta.pergunta) {
      navigation.navigate('Assistente', { pergunta: resposta.pergunta, pedidoEm: Date.now() })
    } else {
      setRespostaRapida({ estado: estadoDoRisco, texto: 'Estou aqui. Se precisar, segure o SOS por 3 segundos para avisar sua rede. Se puder, vá para um lugar iluminado e com gente por perto.' })
    }
  }


  const regiao = resumoPronto ? nivelDaRegiao(resumoCrimes) : null
  // Posição do marcador na barra de cores: a densidade da região entre 0 e 1,5 vez o
  // limite de "muitos registros".
  const densidadeRegiao = ['roubo', 'furto', 'violencia'].reduce((soma, id) => soma + (resumoCrimes[id] ?? 0), 0) / Math.PI
  const posicaoNaRegiao = Math.round(Math.min(densidadeRegiao / (700 * FRACAO_DO_ANO * 1.5), 1) * 92)


  return (
    <View style={styles.container}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>

        {/* ── HEADER: a Lia no anel de risco ── */}
        <HeaderComCurvas aba="Proteção">
          <View style={styles.topoLinha}>
            <TouchableOpacity
              onPress={() => navigation.navigate('Assistente')}
              accessibilityRole="button"
              accessibilityLabel={`Conversar com a Lia. Risco ${calculandoScore ? 'sendo calculado' : monitoramentoAtivo ? displayLevel : 'pausado'}`}
            >
              <AnelDaLia score={anelDoNivel} cor={riskAccent} reacao={liaReaction} />
            </TouchableOpacity>
            <View style={styles.topoTextos}>
              <Text style={styles.topoData}>Proteção · {dataDeHoje}</Text>
              <Text style={[styles.nomeLia, { color: TEMA.forte }]}>Lia</Text>
              {calculandoScore ? (
                <View style={styles.carregandoLinha} accessibilityLiveRegion="polite">
                  <ActivityIndicator size="small" color={TEMA.forte} />
                  <Text style={styles.carregandoTexto}>Calculando seu risco…</Text>
                </View>
              ) : (
                <Text style={styles.topoScore}>
                  {!monitoramentoAtivo ? (
                    <Text style={styles.topoScoreResto}>Alertas pausados</Text>
                  ) : nivelNaTela ? (
                    <>
                      <Text style={styles.topoScoreResto}>Risco </Text>
                      <Text style={[styles.topoScoreNumero, { color: riskAccent }]}>{displayLevel.toLowerCase()}</Text>
                      {contextoDaRegiao?.origem === 'cidade' && <Text style={styles.topoScoreResto}> · estimativa da cidade</Text>}
                    </>
                  ) : (
                    <Text style={styles.topoScoreResto}>Sem dados da região</Text>
                  )}
                </Text>
              )}
            </View>
          </View>
        </HeaderComCurvas>

        {/* ── FALA DA LIA ── */}
        <View style={styles.falaLinha}>
          <LiaAvatar size={34} reaction={liaReaction} showRing={false} showBadge={false} />
          <View style={styles.falaBalao}>
            <Text style={styles.falaTexto}>{textoDaResposta ?? falaDaLia}</Text>
          </View>
        </View>
        <View style={styles.respostas}>
          {respostasRapidas.map((r) => (
            <TouchableOpacity key={r.id} style={styles.resposta} onPress={() => responderRapido(r)} accessibilityRole="button">
              <Text style={[styles.respostaTexto, { color: TEMA.forte }]}>{r.texto}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── CÁLCULO DO RISCO ── */}
        {monitoramentoAtivo && (
          <CamadasDoRisco
            contexto={contextoDaRegiao}
            corpo={corpo}
            resultado={resultadoDoRisco}
            rotuloDoNivel={calculandoScore ? 'calculando' : displayLevel.toLowerCase()}
            corDoNivel={riskAccent}
            corDaAba={TEMA.forte}
            monitoramentoReforcado={monitoramentoReforcado}
          />
        )}

        {/* ── MODOS ── */}
        <View style={styles.secaoLeve}>
          <Text style={styles.secaoTitulo}>Modos</Text>
          <View style={styles.modoLinha}>
            <View style={[styles.modoIcone, { backgroundColor: monitoramentoAtivo ? Brand.mint : '#F3EFF1' }]}>
              <Ionicons name={monitoramentoAtivo ? 'shield-checkmark-outline' : 'shield-outline'} size={17} color={monitoramentoAtivo ? Brand.green : Brand.muted} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.modoTituloLinha}>
                <Text style={styles.modoTitulo}>Monitoramento</Text>
                <TouchableOpacity onPress={showMonitoringInfo} hitSlop={8} accessibilityRole="button" accessibilityLabel="O que é monitoramento?">
                  <Ionicons name="help-circle-outline" size={16} color={TEMA.forte} />
                </TouchableOpacity>
              </View>
              <Text style={styles.modoDetalhe}>{monitoramentoAtivo ? 'Alertas ativos' : 'Alertas pausados'}</Text>
            </View>
            <Switch
              value={monitoramentoAtivo}
              onValueChange={toggleMonitoramento}
              trackColor={{ false: '#E6DCE0', true: Brand.green }}
              thumbColor="#FFF"
              accessibilityLabel="Modo monitoramento"
            />
          </View>
          <View style={styles.modoLinha}>
            <View style={[styles.modoIcone, { backgroundColor: activityMode ? TEMA.fundo : '#F3EFF1' }]}>
              <Ionicons name="fitness-outline" size={17} color={activityMode ? TEMA.forte : Brand.muted} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.modoTituloLinha}>
                <Text style={styles.modoTitulo}>Atividade</Text>
                <TouchableOpacity onPress={showActivityInfo} hitSlop={8} accessibilityRole="button" accessibilityLabel="O que é modo atividade?">
                  <Ionicons name="help-circle-outline" size={16} color={TEMA.forte} />
                </TouchableOpacity>
              </View>
              <Text style={styles.modoDetalhe} numberOfLines={1}>{textoAtividade}</Text>
            </View>
            <Switch
              value={activityMode}
              onValueChange={toggleActivity}
              trackColor={{ false: '#E6DCE0', true: TEMA.forte }}
              thumbColor="#FFF"
              accessibilityLabel="Modo atividade"
            />
          </View>
        </View>

        {/* ── SEU DIA ── */}
        <RoutineToday navigation={navigation} />

        {/* ── SUA REGIÃO ── */}
        {regiao && (
          <TouchableOpacity style={styles.secaoLeve} onPress={() => navigation.navigate('Mapa')} accessibilityRole="button" accessibilityLabel={`Sua região: ${regiao.rotulo.toLowerCase()} num raio de 1 km. Ver no mapa`}>
            <View style={styles.secaoTituloLinha}>
              <Text style={styles.secaoTitulo}>Sua região</Text>
              <Text style={[styles.secaoLink, { color: TEMA.forte }]}>Ver no mapa ›</Text>
            </View>
            <Text style={styles.regiaoTexto}>{regiao.rotulo} num raio de 1 km</Text>
            <View style={styles.regiaoBarra}>
              {CORES_DO_CALOR.map((cor) => <View key={cor} style={[styles.regiaoFaixa, { backgroundColor: cor }]} />)}
              <View style={[styles.regiaoMarcador, { left: `${posicaoNaRegiao}%`, borderColor: regiao.cor }]} />
            </View>
            <View style={styles.regiaoLegenda}>
              <Text style={styles.regiaoLegendaTexto}>poucos registros</Text>
              <Text style={styles.regiaoLegendaTexto}>muitos</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* ── REDE DE APOIO ── */}
        <TouchableOpacity style={styles.secaoLeve} onPress={() => navigation.navigate('EmergencyContacts')} accessibilityRole="button">
          <View style={styles.secaoTituloLinha}>
            <Text style={styles.secaoTitulo}>Rede de apoio</Text>
            <Text style={[styles.secaoLink, { color: TEMA.forte }]}>{contatos.length ? 'Editar ›' : 'Adicionar ›'}</Text>
          </View>
          {contatos.length ? (
            <View style={styles.redeLinha}>
              {contatos.slice(0, 3).map((c, k) => (
                <View key={c.id ?? k} style={styles.redePessoa}>
                  <View style={[styles.redeInicial, { backgroundColor: CORES_DA_REDE[k][1] }]}>
                    <Text style={[styles.redeInicialTexto, { color: CORES_DA_REDE[k][0] }]}>{(c.nome ?? '?').trim().charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={styles.redeNome} numberOfLines={1}>{(c.nome ?? '').split(' ')[0]}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.regiaoTexto}>Cadastre quem deve receber seu alerta SOS.</Text>
          )}
        </TouchableOpacity>

        <>
        <Text style={styles.mapSectionTitle}>Sensores do dispositivo</Text>
        {Platform.OS === 'android' && (
          <>
            <View style={styles.heartRatePanel}>
              <Ionicons
                name={heartRateIsCurrent ? 'heart' : 'heart-outline'}
                size={23}
                color={heartRateIsCurrent ? TEMA.forte : '#9A8C93'}
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
                <Ionicons name="watch-outline" size={22} color={smartwatchConnected ? Brand.green : TEMA.forte} />
              </View>
              <View style={styles.smartwatchConnectionTexts}>
                <Text style={styles.smartwatchConnectionTitle}>
                  {smartwatchConnected ? 'Smartwatch conectado' : 'Smartwatch desconectado'}
                </Text>
                <Text style={styles.smartwatchConnectionSubtitle}>{smartwatchConnectionText}</Text>
              </View>
              {smartwatch.isBusy ? (
                <ActivityIndicator size="small" color={TEMA.forte} />
              ) : (
                <Ionicons
                  name={smartwatchConnected ? 'checkmark-circle' : 'link-outline'}
                  size={23}
                  color={smartwatchConnected ? Brand.green : TEMA.forte}
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
          <Ionicons name="phone-portrait-outline" size={18} color={isHighRisk ? TEMA.forte : Brand.muted} />
          <Text style={[styles.forceValue, { color: isHighRisk ? TEMA.forte : Brand.ink }]}>{magnitude}G</Text>
          <Text style={styles.forceLabel}>Acelerômetro do celular · {experimentalMotionScore == null ? 'aguardando' : `${Math.round(experimentalMotionScore * 100)}% atípico`}</Text>
          {isHighRisk && <View style={styles.forcePill}><Text style={styles.forcePillText}>Alto</Text></View>}
        </View>
        {Platform.OS === 'ios' && (
          <Text style={styles.sensorAvailabilityNote}>A leitura cardíaca e o acelerômetro do relógio ficam disponíveis no Android.</Text>
        )}

        </>


      </ScrollView>

      <View style={[styles.floatingContainer, sosHolding && styles.floatingContainerHolding]} pointerEvents="box-none">
        <Pressable
          style={[styles.fabHelp, sosHolding && styles.fabHelpHolding]}
          onPressIn={beginSosHold}
          onPressOut={cancelSosHold}
          accessibilityRole="button"
          accessibilityLabel="Segure por três segundos para enviar um alerta SOS"
          accessibilityHint="O alerta será enviado à sua rede de apoio com sua localização."
        >
          <View style={styles.quickActionContent}>
            <Ionicons name="alert-circle" size={18} color="#FFF" />
            <Text style={styles.fabText}>SOS</Text>
          </View>
          <Text style={styles.fabHoldHint}>{sosHolding ? 'continue segurando' : 'segure 3 s'}</Text>
        </Pressable>
      </View>

      {sosHolding && sosHoldFim && <SosHoldOverlay fimMs={sosHoldFim} totalMs={SOS_HOLD_MS} />}

      <LiaHelpModal
        visible={Boolean(helpInfo)}
        title={helpInfo?.title}
        message={helpInfo?.message}
        onClose={() => setHelpInfo(null)}
      />

      {/* MODAL FEEDBACK SOS */}
      <Modal transparent visible={sosFeedbackVisible} animationType="fade">
        <View style={styles.overlayCentered}>
          <View style={styles.cardModal}>
            <View style={[styles.modalStrip, { backgroundColor: sosFeedbackData.status === 'enviado' ? Brand.green : sosFeedbackData.status === 'falhou' ? Brand.danger : TEMA.forte }]} />
            <View style={styles.modalInner}>
              {sosFeedbackData.status === 'enviando' && (
                <>
                  <ActivityIndicator size="large" color={TEMA.forte} style={{ marginBottom: 12 }} />
                  <Text style={styles.cardTitle}>Enviando alerta...</Text>
                  <Text style={styles.cardSubtitle}>Avisando sua rede de apoio com sua localização.</Text>
                </>
              )}
              {sosFeedbackData.status === 'enviado' && (
                <>
                  <Text style={[styles.cardTitleCritical, { color: Brand.green }]}>Alerta Enviado</Text>
                  <Text style={styles.cardSubtitle}>
                    Mensagem de WhatsApp com sua localização enviada para {sosFeedbackData.enviados.length} {sosFeedbackData.enviados.length === 1 ? 'contato' : 'contatos'}.
                  </Text>
                </>
              )}
              {sosFeedbackData.status === 'falhou' && (
                <>
                  <Text style={[styles.cardTitleCritical, { color: Brand.danger }]}>Alerta NÃO confirmado</Text>
                  <Text style={styles.cardSubtitle}>
                    Não conseguimos confirmar o envio aos seus contatos. Se estiver em perigo, ligue para a polícia agora.
                  </Text>
                  <Text style={styles.sosFailDetail}>Motivo: {sosFeedbackData.detalhe}</Text>
                  <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: Brand.danger, marginBottom: 12 }]} onPress={() => Linking.openURL('tel:190')}>
                    <Text style={styles.btnPrimaryText}>Ligar 190</Text>
                  </TouchableOpacity>
                </>
              )}

              {sosFeedbackData.status !== 'enviando' && (
                <View style={styles.feedbackBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Ionicons name="location" size={14} color={TEMA.forte} />
                    <Text style={styles.feedbackLabel}>Sua localização</Text>
                  </View>
                  <Text style={styles.feedbackAddressText}>{sosFeedbackData.endereco}</Text>

                  {sosFeedbackData.enviados.length > 0 && (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, marginBottom: 4 }}>
                        <Ionicons name="logo-whatsapp" size={14} color={Brand.green} />
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
                        <Ionicons name="close-circle" size={14} color={Brand.danger} />
                        <Text style={styles.feedbackLabel}>Não foi possível enviar para · toque para ligar</Text>
                      </View>
                      {sosFeedbackData.falhas.map((c) => (
                        <TouchableOpacity key={c} onPress={() => Linking.openURL(`tel:${c}`)}>
                          <Text style={[styles.feedbackContact, { color: Brand.danger }]}>{c}</Text>
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
                    {loadingGPS ? <ActivityIndicator size="small" color={Brand.blue} /> : <Ionicons name="locate" size={18} color={Brand.blue} />}
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
            <View style={[styles.modalStrip, { backgroundColor: Brand.green }]} />
            <View style={styles.modalInner}>
              <View style={{ alignItems: 'center', marginBottom: 8 }}>
                <LiaAvatar size={72} reaction="checagem" />
              </View>
              <Text style={[styles.cardTitleCritical, { color: Brand.green }]}>Tudo bem?</Text>
              <Text style={styles.cardSubtitle}>
                O Ampara está monitorando você. Confirme que está segura.
              </Text>
              <TouchableOpacity style={[styles.btnSafe, { backgroundColor: Brand.green }]} onPress={handleUserIsSafe}>
                <Text style={styles.btnSafeText}>Sim, estou bem</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { marginTop: 10, backgroundColor: TEMA.forte }]}
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
            <View style={[styles.modalStrip, { backgroundColor: alertType === 'critico' ? Brand.danger : Brand.amber }]} />
            <View style={styles.modalInner}>
              <View style={{ alignItems: 'center', marginBottom: 8 }}>
                <LiaAvatar size={72} reaction={alertType === 'critico' ? 'critico' : 'checagem'} />
              </View>
              <Text style={styles.cardTitleCritical}>
                {alertType === 'critico' ? 'Alerta Crítico' : 'Confirma bem-estar?'}
              </Text>
              <Text style={styles.cardSubtitle}>
                {alertType === 'critico'
                  ? 'Risco alto detectado. Seus contatos serão acionados em:'
                  : 'Movimento incomum detectado. Confirme que está segura.'}
              </Text>

              <View style={{alignItems: 'center', marginVertical: 10}}>
                <View style={[styles.timerCircle, { borderColor: alertType === 'critico' ? Brand.danger : Brand.amber }]}>
                  <Text style={[styles.timerCountText, { color: alertType === 'critico' ? Brand.danger : Brand.amber }]}>{countdown}</Text>
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
              <Ionicons name="heart-dis" size={38} color={TEMA.forte} />
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

  // Header com a Lia no anel de risco
  topoLinha: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  topoTextos: { flex: 1 },
  topoData: { fontSize: 12.5, color: '#776C73' },
  nomeLia: { fontFamily: FonteDaLia, fontSize: 28, lineHeight: 34 },
  topoScore: { marginTop: 2 },
  topoScoreNumero: { fontSize: 24, fontWeight: '800' },
  topoScoreResto: { fontSize: 14, color: '#776C73' },

  // Fala da Lia e respostas rápidas
  falaLinha: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginHorizontal: 20, marginTop: 18 },
  falaBalao: { flex: 1, backgroundColor: '#FBF2F5', borderRadius: 18, borderTopLeftRadius: 4, paddingVertical: 11, paddingHorizontal: 14 },
  falaTexto: { fontSize: 14, lineHeight: 20, color: '#4A3540' },
  respostas: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginLeft: 64, marginRight: 20, marginTop: 10 },
  resposta: { backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: TEMA.curva, paddingVertical: 7, paddingHorizontal: 12 },
  respostaTexto: { fontSize: 13, fontWeight: '600' },

  // Seções leves: só título e conteúdo, sem caixa nem divisória
  secaoLeve: { marginHorizontal: 20, marginTop: 20 },
  secaoTituloLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  secaoTitulo: { fontSize: 12, letterSpacing: 0.7, textTransform: 'uppercase', fontWeight: '700', color: '#8A8590', marginBottom: 4 },
  secaoLink: { fontSize: 13, fontWeight: '600' },
  modoLinha: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7 },
  modoIcone: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  modoTituloLinha: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modoTitulo: { fontSize: 15, color: Brand.ink },
  modoDetalhe: { fontSize: 12, color: '#8A8590', marginTop: 1 },
  regiaoTexto: { fontSize: 14, color: Brand.ink, marginTop: 2 },
  regiaoBarra: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'visible', marginTop: 12 },
  regiaoFaixa: { flex: 1, height: 8 },
  regiaoMarcador: { position: 'absolute', top: -4, width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFF', borderWidth: 3 },
  regiaoLegenda: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  regiaoLegendaTexto: { fontSize: 11, color: '#8A8590' },
  redeLinha: { flexDirection: 'row', gap: 16, marginTop: 6 },
  redePessoa: { alignItems: 'center', width: 52 },
  redeInicial: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  redeInicialTexto: { fontSize: 16, fontWeight: '700' },
  redeNome: { fontSize: 12, color: '#8A8590', marginTop: 4 },
  scrollContent: { paddingBottom: 130 },

  headerContainer: { paddingTop: 52, paddingHorizontal: 22, paddingBottom: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerBrandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerLogo: { width: 42, height: 36 },
  header: { fontSize: 29, color: TEMA.forte, fontWeight: '700' },

  topModesRow: { minHeight: 70, marginHorizontal: 22, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Brand.line },
  topModeCell: { flex: 1, minWidth: 0, paddingVertical: 7, paddingHorizontal: 4 },
  topModeHeading: { minHeight: 25, flexDirection: 'row', alignItems: 'center', gap: 6 },
  topModeTitle: { flex: 1, minWidth: 0, color: Brand.ink, fontSize: 11, fontWeight: '700' },
  topModeControlRow: { minHeight: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  topModeSubtitle: { flex: 1, minWidth: 0, color: Brand.green, fontSize: 10 },
  topModeDivider: { width: 1, height: 42, backgroundColor: Brand.line, marginHorizontal: 8 },
  monitoringStatusOff: { color: Brand.muted },

  riskSection: { marginTop: 12, marginBottom: 6, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14, backgroundColor: Brand.surfaceRose, borderTopLeftRadius: 28, borderBottomRightRadius: 28 },
  riskPanel: { paddingHorizontal: 0, paddingVertical: 4, backgroundColor: 'transparent' },
  riskPanelTop: { minHeight: 124, flexDirection: 'row', alignItems: 'center', gap: 14 },
  riskLiaButton: { width: 108, height: 116, alignItems: 'center', justifyContent: 'center' },
  riskContent: { flex: 1, minWidth: 0, justifyContent: 'center', gap: 1 },
  riskRow: { minHeight: 48, flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'baseline' },
  riskSummary: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  riskLabel: { fontSize: 13, color: TEMA.forte, fontWeight: '700', textTransform: 'uppercase' },
  riskBadgeText: { color: TEMA.forte, fontWeight: '700', fontSize: 14 },
  riskCompactRow: { minHeight: 24, flexDirection: 'row', alignItems: 'center' },
  gaugeScoreBig: { fontSize: 52, fontWeight: '800', lineHeight: 56 },
  gaugeScoreMax: { fontSize: 18, fontWeight: '500', color: Brand.muted },
  gaugeDesc: { fontSize: 11, lineHeight: 15, color: Brand.muted },
  timeFactorRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  timeFactorText: { flexShrink: 1, color: Brand.muted, fontSize: 11, lineHeight: 15, fontWeight: '600' },
  safeRiskText: { color: Brand.green },
  scoreTrack: { height: 6, overflow: 'hidden', marginTop: 12, borderRadius: 4, backgroundColor: 'rgba(118,103,112,0.16)' },
  scoreFill: { height: '100%', borderRadius: 4 },

  safeStrip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 22, paddingVertical: 12, backgroundColor: Brand.mint },
  safeStripText: { fontSize: 13, color: Brand.green, fontWeight: '500' },

  mapSectionTitle: { marginHorizontal: 22, marginTop: 20, marginBottom: 14, color: Brand.ink, fontSize: 19, fontWeight: '700' },
  sensorAvailabilityNote: { marginHorizontal: 22, paddingVertical: 14, color: Brand.muted, fontSize: 12, lineHeight: 18, borderBottomWidth: 1, borderBottomColor: Brand.line },

  heartRatePanel: { minHeight: 132, marginHorizontal: 22, marginTop: 2, paddingVertical: 12, paddingHorizontal: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent', borderBottomWidth: 1, borderBottomColor: Brand.line },
  heartRateLabel: { marginTop: 6, color: Brand.muted, fontSize: 11, fontWeight: '700' },
  heartRateValueRow: { minHeight: 58, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' },
  heartRateValue: { color: TEMA.forte, fontSize: 46, lineHeight: 56, fontWeight: '800' },
  heartRateValueUnavailable: { color: Brand.muted },
  heartRateUnit: { marginLeft: 6, color: Brand.muted, fontSize: 18, fontWeight: '600' },
  heartRateDetail: { minHeight: 18, color: Brand.green, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  heartRateBaselineDetail: { minHeight: 16, marginTop: 4, color: Brand.muted, fontSize: 11, textAlign: 'center' },
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
  watchAlertEyebrow: { color: TEMA.forte, fontSize: 11, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
  watchAlertTitle: { color: Brand.ink, fontSize: 26, lineHeight: 32, fontWeight: '800', textAlign: 'center' },
  watchAlertBody: { color: Brand.muted, fontSize: 16, lineHeight: 23, textAlign: 'center', marginTop: 14 },
  watchAlertSteps: { width: '100%', marginTop: 28, padding: 18, backgroundColor: Brand.surface, borderRadius: 20, borderWidth: 1, borderColor: Brand.line, gap: 10 },
  watchAlertStepsTitle: { color: Brand.ink, fontSize: 15, fontWeight: '700', marginBottom: 2 },
  watchAlertStep: { color: Brand.muted, fontSize: 14, lineHeight: 20 },
  watchAlertButton: { width: '100%', minHeight: 54, marginTop: 24, backgroundColor: TEMA.forte, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  watchAlertButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  separator: { height: 1, backgroundColor: Brand.line, marginHorizontal: 22 },


  carregandoLinha: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 8 },
  carregandoTexto: { color: Brand.muted, fontSize: 13, fontWeight: '600' },


  forceRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 22, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Brand.line },
  forceValue: { fontSize: 22, fontWeight: '700' },
  forceLabel: { fontSize: 13, color: '#AAA', flex: 1 },
  forcePill: { backgroundColor: Brand.surfaceRose, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12 },
  forcePillText: { color: TEMA.forte, fontSize: 11, fontWeight: '700' },
  watchMotionRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 22, paddingVertical: 8 },
  watchMotionValue: { minWidth: 82, color: Brand.blue, fontSize: 14, fontWeight: '700' },
  watchMotionTexts: { flex: 1 },
  watchMotionTitle: { color: '#526170', fontSize: 12, fontWeight: '700' },
  watchMotionDetail: { color: '#737B83', fontSize: 10, marginTop: 2 },

  floatingContainer: { position: 'absolute', bottom: 30, right: 20, alignItems: 'flex-end', zIndex: 10 },
  floatingContainerHolding: { zIndex: 30 },
  quickActionContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  fabHelp: { minWidth: 112, minHeight: 58, backgroundColor: Brand.danger, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 30, elevation: 8, alignItems: 'center', justifyContent: 'center' },
  fabHelpHolding: { backgroundColor: '#9F2B40', transform: [{ scale: 1.22 }] },
  fabHoldHint: { color: '#FFF1F4', fontSize: 10, fontWeight: '600', marginTop: 2 },
  fabText: { color: '#FFF', fontWeight: '700', fontSize: 15 },

  overlayCentered: { flex: 1, backgroundColor: 'rgba(42,29,35,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  cardModal: { backgroundColor: '#FFF', borderRadius: 30, overflow: 'hidden', width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 20, elevation: 12 },
  modalStrip: { height: 12, backgroundColor: TEMA.forte, width: '100%' },
  modalInner: { padding: 25 },
  cardTitle: { fontSize: 22, fontWeight: '800', color: TEMA.forte, marginBottom: 5, textAlign: 'center' },
  cardTitleCritical: { fontSize: 22, fontWeight: '800', color: TEMA.forte, marginBottom: 5, textAlign: 'center' },
  cardSubtitle: { fontSize: 14, color: '#776C73', textAlign: 'center', marginBottom: 20, paddingHorizontal: 10, lineHeight: 20 },

  btnPrimary: { backgroundColor: TEMA.forte, paddingVertical: 16, borderRadius: 30, alignItems: 'center', width: '100%' },
  btnPrimaryText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  btnCancelText: { textAlign: 'center', color: TEMA.forte, marginTop: 15, fontWeight: '600', fontSize: 15 },
  btnHelpGuide: { marginTop: 10, paddingVertical: 14, borderRadius: 30, alignItems: 'center', backgroundColor: TEMA.fundo },
  btnHelpGuideText: { color: TEMA.forte, fontWeight: '700', fontSize: 14 },
  btnSafe: { backgroundColor: Brand.green, paddingVertical: 15, width: '100%', borderRadius: 30, alignItems: 'center' },
  btnSafeText: { color: '#FFF', fontWeight: '700', fontSize: 16 },

  feedbackBox: { backgroundColor: TEMA.fundo, padding: 16, borderRadius: 22, marginBottom: 20 },
  feedbackLabel: { fontSize: 12, fontWeight: 'bold', color: TEMA.forte, marginBottom: 5 },
  feedbackAddressText: { fontSize: 15, color: Brand.ink, fontWeight: 'bold', marginBottom: 5 },
  feedbackText: { fontSize: 14, color: '#333', fontStyle: 'italic' },
  sosFailDetail: { fontSize: 11, color: '#999', textAlign: 'center', marginTop: -12, marginBottom: 16 },
  feedbackContact: { fontSize: 15, color: TEMA.forte, fontWeight: '600', marginTop: 3 },

  overlayBottom: { flex: 1, backgroundColor: 'rgba(42,29,35,0.5)', justifyContent: 'flex-end' },
  cardModalBottom: { backgroundColor: '#FFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '90%', overflow: 'hidden', elevation: 20 },
  modalHandle: { width: 40, height: 4, backgroundColor: '#DDD', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 16 },
  btnOrange: { backgroundColor: TEMA.forte, paddingVertical: 16, borderRadius: 30, alignItems: 'center', width: '100%' },

  occScrollContent: { flexGrow: 1, padding: 22, paddingTop: 0 },
  occLabel: { color: TEMA.forte, fontWeight: '700', marginTop: 15, marginBottom: 8, fontSize: 14 },
  inputRow: { flexDirection: 'row', gap: 10 },
  inputFlex: { flex: 1, borderRadius: 18, padding: 14, fontSize: 15, backgroundColor: '#FAF6F7' },
  input: { borderRadius: 18, padding: 14, fontSize: 15, backgroundColor: '#FAF6F7', marginTop: 5 },
  gpsBtn: { backgroundColor: TEMA.fundo, width: 55, justifyContent: 'center', alignItems: 'center', borderRadius: 18 },
  typeContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 5 },
  typeButton: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#F3EFF1' },
  typeSelected: { backgroundColor: TEMA.forte },
  typeText: { color: '#555', fontSize: 13, fontWeight: '500' },
  typeTextSelected: { color: '#FFF', fontWeight: 'bold' },
  suggestionsBox: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#D8D0CC', borderRadius: 12, marginTop: 5, maxHeight: 150 },
  suggestionItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: Brand.line },
  suggestionText: { fontSize: 13, color: '#333' },

  timerCircle: { width: 96, height: 96, borderRadius: 48, borderWidth: 5, borderColor: TEMA.forte, justifyContent: 'center', alignItems: 'center', marginVertical: 10 },
  timerCountText: { fontSize: 32, fontWeight: 'bold', color: TEMA.forte },
  timerSecondsText: { fontSize: 11, color: '#666', fontWeight: '600' },
  alertWarningText: { fontSize: 13, color: '#666', textAlign: 'center', marginVertical: 15, paddingHorizontal: 10 },

})
