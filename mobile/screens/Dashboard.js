import React, { useMemo, useState } from 'react'
import {
  StyleSheet,
  Text,
  View,
  Image,
  Dimensions,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from 'react-native'

import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { LineChart } from 'react-native-chart-kit'
import { Svg, Path } from 'react-native-svg'
import MapView, { Circle } from 'react-native-maps'
import {
  calculateWeeklyMetrics,
  aggregateDailyScores,
  aggregateHourlyScores,
  compareToPreviousPeriod,
  computeSafeZoneRatio,
  computeActivityRiskComparison,
  classifyMovement,
  tallyContactAlerts,
} from '../utils/weeklyCalculator'
import { supabase } from '../services/supabase'
import { getRecentLocationHistory, getLocationHistoryBetween, getSafeLocations } from '../services/locationService'
import { getRecentAlerts } from '../services/alertService'
import { getRecentActivityPeriods } from '../services/activityService'

const screenWidth = Dimensions.get('window').width
const CHART_WIDTH = screenWidth - 80
const PERIODS = [7, 30, 90]

const getScoreRGB = (score) => {
  if (score >= 80) return '39, 174, 96'
  if (score >= 50) return '230, 162, 0'
  return '211, 47, 47'
}

const getScoreLabel = (score) => {
  if (score >= 80) return 'Excelente · semana segura'
  if (score >= 50) return 'Moderado · atenção às rotas'
  return 'Crítico · evite áreas de risco'
}

const barColor = (score) => {
  if (score >= 80) return '#27AE60'
  if (score >= 50) return '#E6A200'
  return '#D32F2F'
}

const MOVEMENT_COLORS = { parado: '#5A8FAF', caminhando: '#27AE60', veiculo: '#E6A200' }

function formatDateTime(iso) {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function computeMapRegion(points) {
  if (!points.length) return null
  const lats = points.map(p => p.latitude)
  const lons = points.map(p => p.longitude)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max(maxLat - minLat, 0.01) * 1.4,
    longitudeDelta: Math.max(maxLon - minLon, 0.01) * 1.4,
  }
}

function GaugeChart({ score, rgbColor }) {
  const cx = 100, cy = 100, r = 70, sw = 20
  const viewH = 112
  const svgWidth = CHART_WIDTH
  const svgHeight = svgWidth * viewH / 200

  const bgPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`
  let fgPath = null
  if (score > 0) {
    const angleRad = Math.PI * (1 - score / 100)
    const xEnd = cx + r * Math.cos(angleRad)
    const yEnd = cy - r * Math.sin(angleRad)
    fgPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${xEnd.toFixed(2)} ${yEnd.toFixed(2)}`
  }

  return (
    <Svg width={svgWidth} height={svgHeight} viewBox={`0 0 200 ${viewH}`}>
      <Path d={bgPath} stroke="rgba(27,58,107,0.1)" strokeWidth={sw} fill="none" strokeLinecap="round" />
      {fgPath && (
        <Path d={fgPath} stroke={`rgb(${rgbColor})`} strokeWidth={sw} fill="none" strokeLinecap="round" />
      )}
    </Svg>
  )
}

function HBar({ label, score, maxScore, color }) {
  const pct = Math.max(3, (score / maxScore) * 100)
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ fontSize: 13, color: '#1B3A6B', fontWeight: '600' }}>{label}</Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color }}>{score}</Text>
      </View>
      <View style={{ height: 8, backgroundColor: 'rgba(27,58,107,0.08)', borderRadius: 4 }}>
        <View style={{ height: 8, width: `${pct}%`, backgroundColor: color, borderRadius: 4 }} />
      </View>
    </View>
  )
}

function EmptyState({ text }) {
  return (
    <View style={{ paddingVertical: 10 }}>
      <Text style={{ fontSize: 13, color: '#999', textAlign: 'center' }}>{text}</Text>
    </View>
  )
}

function PeriodSelector({ value, onChange }) {
  return (
    <View style={styles.periodSelector}>
      {PERIODS.map((p) => (
        <Pressable
          key={p}
          onPress={() => onChange(p)}
          style={[styles.periodOption, value === p && styles.periodOptionActive]}
        >
          <Text style={[styles.periodOptionText, value === p && styles.periodOptionTextActive]}>{p}d</Text>
        </Pressable>
      ))}
    </View>
  )
}

function TrendBadge({ trend }) {
  if (trend.deltaPct == null) return null
  const isUp = trend.trend === 'melhor'
  const isDown = trend.trend === 'pior'
  const color = isUp ? '#27AE60' : isDown ? '#D32F2F' : '#5A8FAF'
  const arrow = isUp ? '▲' : isDown ? '▼' : '—'
  return (
    <Text style={[styles.trendBadge, { color }]}>
      {arrow} {Math.abs(trend.deltaPct)}% vs. período anterior
    </Text>
  )
}

export default function Dashboard() {
  const insets = useSafeAreaInsets()
  const [loading, setLoading] = useState(true)
  const [periodDays, setPeriodDays] = useState(7)

  const [locationHistory, setLocationHistory] = useState([])
  const [dailyScores, setDailyScores] = useState([])
  const [previousDailyScores, setPreviousDailyScores] = useState([])
  const [hourlyScores, setHourlyScores] = useState([])
  const [recentAlerts, setRecentAlerts] = useState([])
  const [safeLocations, setSafeLocations] = useState([])
  const [activityPeriods, setActivityPeriods] = useState([])
  const [emergencyContacts, setEmergencyContacts] = useState([])

  // useFocusEffect (não useEffect simples) porque as telas ficam montadas em segundo plano
  // na tab navigation: sem isso, disparar um SOS ou mudar um local seguro em outra aba não
  // aparecia aqui até o app reiniciar — o Dashboard só recarregava no primeiro mount.
  useFocusEffect(
    React.useCallback(() => {
      loadDashboardData(periodDays)
    }, [periodDays])
  )

  async function loadDashboardData(days) {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const previousStart = new Date()
    previousStart.setDate(previousStart.getDate() - days * 2)
    const previousEnd = new Date()
    previousEnd.setDate(previousEnd.getDate() - days)

    const [history, previousHistory, alerts, safeLocs, activity, contactsResult] = await Promise.all([
      getRecentLocationHistory(user.id, days),
      getLocationHistoryBetween(user.id, previousStart, previousEnd),
      getRecentAlerts(user.id, days),
      getSafeLocations(user.id),
      getRecentActivityPeriods(user.id, days),
      supabase.from('emergency_contacts').select('nome, telefone').eq('user_id', user.id),
    ])

    setLocationHistory(history)
    setDailyScores(aggregateDailyScores(history))
    setPreviousDailyScores(aggregateDailyScores(previousHistory))
    setHourlyScores(aggregateHourlyScores(history))
    setRecentAlerts(alerts)
    setSafeLocations(safeLocs)
    setActivityPeriods(activity)
    setEmergencyContacts(contactsResult.data || [])
    setLoading(false)
  }

  const metrics = calculateWeeklyMetrics(dailyScores)
  const dynamicRGB = getScoreRGB(metrics.averageScore)
  const riskColor = `rgb(${dynamicRGB})`
  const trend = compareToPreviousPeriod(dailyScores, previousDailyScores)

  const scores = dailyScores.map(d => d.score)
  const bestScore = scores.length > 0 ? Math.max(...scores) : 0
  const worstScore = scores.length > 0 ? Math.min(...scores) : 0

  const mapPoints = useMemo(
    () => locationHistory
      .filter(p => p.latitude != null && p.longitude != null && p.risk_score != null)
      .slice(-300),
    [locationHistory]
  )
  const mapRegion = useMemo(() => computeMapRegion(mapPoints), [mapPoints])

  const contactNameByPhone = useMemo(() => {
    const map = {}
    emergencyContacts.forEach(c => { map[c.telefone] = c.nome })
    return map
  }, [emergencyContacts])

  const safeZoneRatio = computeSafeZoneRatio(locationHistory, safeLocations)
  const activityRisk = computeActivityRiskComparison(locationHistory, activityPeriods)
  const movement = classifyMovement(locationHistory, safeLocations)
  const contactsRanking = tallyContactAlerts(recentAlerts, emergencyContacts)
  const alertCount = recentAlerts.length

  const chartConfig = {
    backgroundGradientFrom: '#FFF',
    backgroundGradientTo: '#FFF',
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(27, 58, 107, ${opacity})`,
    labelColor: () => '#5A8FAF',
    style: { borderRadius: 16 },
    propsForBackgroundLines: {
      strokeWidth: 1,
      stroke: 'rgba(27, 58, 107, 0.06)',
      strokeDasharray: '',
    },
    fillShadowGradient: `rgb(${dynamicRGB})`,
    fillShadowGradientOpacity: 0.12,
    propsForDots: {
      r: '4',
      strokeWidth: '2',
      stroke: `rgb(${dynamicRGB})`,
    },
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#1B3A6B" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { paddingTop: Math.max(insets.top - 30, 10) }]}>
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>

        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerSub}>Últimos {periodDays} dias</Text>
            <Text style={styles.headerTitle}>Relatório Ampara</Text>
          </View>
          <Image source={require('../assets/images/maos-ampara-rosa.png')} style={{ width: 40, height: 40 }} resizeMode="contain" />
        </View>

        <PeriodSelector value={periodDays} onChange={setPeriodDays} />

        {/* Gauge + stats */}
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.cardTitle}>Índice de Segurança Semanal</Text>
            <TrendBadge trend={trend} />
          </View>
          {dailyScores.length === 0 ? (
            <EmptyState text="Ainda não há dados suficientes. Use o app com o monitoramento ativo por alguns dias para ver seu histórico aqui." />
          ) : (
            <>
              <View style={{ alignItems: 'center' }}>
                <View>
                  <GaugeChart score={metrics.averageScore} rgbColor={dynamicRGB} />
                  <View style={styles.gaugeOverlay}>
                    <Text style={[styles.gaugeBig, { color: riskColor }]}>
                      {Math.round(metrics.averageScore / 10)}
                      <Text style={styles.gaugeMax}>/10</Text>
                    </Text>
                  </View>
                </View>
                <Text style={[styles.gaugeLabel, { color: riskColor }]}>{getScoreLabel(metrics.averageScore)}</Text>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: '#1B3A6B' }]}>{Math.round(metrics.averageScore / 10)}</Text>
                  <Text style={styles.statLabel}>Média</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: '#2E8B57' }]}>{Math.round(bestScore / 10)}</Text>
                  <Text style={styles.statLabel}>Melhor dia</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: '#D32F2F' }]}>{Math.round(worstScore / 10)}</Text>
                  <Text style={styles.statLabel}>Pior dia</Text>
                </View>
              </View>
            </>
          )}
        </View>

        {/* Line chart */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Variação de Segurança</Text>
          <Text style={styles.cardSubtitle}>Pontuação diária de segurança</Text>
          {dailyScores.length === 0 ? (
            <EmptyState text="Sem pontos de localização registrados ainda." />
          ) : (
            <>
              <LineChart
                data={{
                  labels: dailyScores.map(d => d.dia),
                  datasets: [{ data: scores }],
                }}
                width={CHART_WIDTH}
                height={140}
                chartConfig={chartConfig}
                bezier
                withInnerLines={false}
                withOuterLines={false}
                withHorizontalLabels={false}
                withVerticalLabels={false}
                style={styles.chartStyle}
              />
              {/* Rótulos dos dias desenhados à parte: o LineChart da lib sempre encosta
                  o último ponto na borda do SVG e corta o rótulo dele no clipping do próprio SVG. */}
              <View style={styles.chartLabelsRow}>
                {dailyScores.map(d => (
                  <Text key={d.dia} style={styles.chartLabelText}>{d.dia}</Text>
                ))}
              </View>
            </>
          )}
        </View>

        {/* Period bars */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Segurança por Período</Text>
          <Text style={styles.cardSubtitle}>Índice de segurança por período do dia</Text>
          {hourlyScores.length === 0 ? (
            <EmptyState text="Sem dados suficientes ainda." />
          ) : (
            hourlyScores.map((h) => (
              <HBar key={h.hora} label={h.hora} score={h.score} maxScore={100} color={barColor(h.score)} />
            ))
          )}
        </View>

        {/* Mapa de risco */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Mapa de Risco por Localização</Text>
          <Text style={styles.cardSubtitle}>Pontos monitorados coloridos pelo índice de segurança</Text>
          {!mapRegion ? (
            <EmptyState text="Sem pontos de localização registrados ainda." />
          ) : (
            <>
              <View style={styles.riskMapContainer}>
                <MapView
                  style={styles.riskMap}
                  region={mapRegion}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  rotateEnabled={false}
                  pitchEnabled={false}
                >
                  {mapPoints.map((p, idx) => (
                    <Circle
                      key={idx}
                      center={{ latitude: p.latitude, longitude: p.longitude }}
                      radius={40}
                      fillColor={`rgba(${getScoreRGB(p.risk_score)}, 0.35)`}
                      strokeColor="transparent"
                    />
                  ))}
                </MapView>
              </View>
              <View style={styles.mapLegendRow}>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#27AE60' }]} /><Text style={styles.legendText}>Baixo risco</Text></View>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#E6A200' }]} /><Text style={styles.legendText}>Moderado</Text></View>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#D32F2F' }]} /><Text style={styles.legendText}>Alto risco</Text></View>
              </View>
            </>
          )}
        </View>

        {/* Locais seguros */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Locais Seguros</Text>
          <Text style={styles.cardSubtitle}>Tempo monitorado dentro dos seus locais seguros cadastrados</Text>
          {safeZoneRatio == null ? (
            <EmptyState text="Cadastre locais seguros para acompanhar esta métrica." />
          ) : (
            <HBar label="Dentro de zona segura" score={safeZoneRatio} maxScore={100} color={barColor(safeZoneRatio)} />
          )}
        </View>

        {/* Atividade física x risco */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Atividade Física x Risco</Text>
          <Text style={styles.cardSubtitle}>Índice de segurança médio dentro e fora do modo atividade</Text>
          {!activityRisk ? (
            <EmptyState text="Sem dados de atividade suficientes ainda." />
          ) : (
            <>
              <HBar label="Durante atividade física" score={activityRisk.duringAvg} maxScore={100} color={barColor(activityRisk.duringAvg)} />
              <HBar label="Fora de atividade" score={activityRisk.outsideAvg} maxScore={100} color={barColor(activityRisk.outsideAvg)} />
            </>
          )}
        </View>

        {/* Padrão de deslocamento */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Padrão de Deslocamento</Text>
          <Text style={styles.cardSubtitle}>Como você se moveu no período</Text>
          {!movement ? (
            <EmptyState text="Dados de velocidade não disponíveis ainda." />
          ) : (
            <>
              <HBar label="Parado" score={movement.paradoPct} maxScore={100} color={MOVEMENT_COLORS.parado} />
              <HBar label="Caminhando" score={movement.caminhandoPct} maxScore={100} color={MOVEMENT_COLORS.caminhando} />
              <HBar label="Em veículo" score={movement.veiculoPct} maxScore={100} color={MOVEMENT_COLORS.veiculo} />
              {movement.prolongedStopsOutsideSafeZone > 0 && (
                <Text style={styles.warningText}>
                  ⚠ {movement.prolongedStopsOutsideSafeZone} parada(s) prolongada(s) fora de local seguro
                </Text>
              )}
            </>
          )}
        </View>

        {/* Alerts count */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Alertas Enviados</Text>
          <Text style={styles.cardSubtitle}>Total no período selecionado</Text>
          <View style={{ alignItems: 'center', paddingVertical: 6 }}>
            <Text style={[styles.statValue, { fontSize: 40, color: alertCount > 0 ? '#C4687A' : '#2E8B57' }]}>{alertCount}</Text>
            <Text style={styles.statLabel}>{alertCount === 1 ? 'alerta enviado' : 'alertas enviados'}</Text>
          </View>
        </View>

        {/* Histórico de alertas */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Histórico de Alertas</Text>
          <Text style={styles.cardSubtitle}>Últimos disparos e quem foi notificado</Text>
          {recentAlerts.length === 0 ? (
            <EmptyState text="Nenhum alerta enviado no período." />
          ) : (
            recentAlerts.slice(-10).reverse().map((alert) => (
              <View key={alert.id} style={styles.alertRow}>
                <Text style={styles.alertDate}>{formatDateTime(alert.created_at)}</Text>
                <Text style={styles.alertMessage} numberOfLines={2}>
                  {alert.message?.length > 80 ? `${alert.message.slice(0, 80)}…` : alert.message}
                </Text>
                {!!alert.recipient_names && (
                  <Text style={styles.alertRecipients}>
                    Notificados: {alert.recipient_names.split(',').map(t => t.trim()).filter(Boolean).map(tel => contactNameByPhone[tel] || tel).join(', ')}
                  </Text>
                )}
              </View>
            ))
          )}
        </View>

        {/* Contatos mais acionados */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Contatos Mais Acionados</Text>
          <Text style={styles.cardSubtitle}>Quem mais recebeu seus alertas no período</Text>
          {contactsRanking.length === 0 ? (
            <EmptyState text="Nenhum contato acionado no período." />
          ) : (
            contactsRanking.map((c) => (
              <HBar
                key={c.telefone}
                label={c.nome}
                score={c.count}
                maxScore={contactsRanking[0].count}
                color="#C4687A"
              />
            ))
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5EFE6' },
  scrollContainer: { paddingHorizontal: 20, paddingBottom: 120 },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerSub: {
    fontSize: 12,
    color: '#5A8FAF',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerTitle: { fontSize: 26, fontWeight: 'bold', color: '#1B3A6B' },

  periodSelector: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
    elevation: 1,
  },
  periodOption: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  periodOptionActive: { backgroundColor: '#1B3A6B' },
  periodOptionText: { fontSize: 13, fontWeight: '600', color: '#5A8FAF' },
  periodOptionTextActive: { color: '#FFF' },

  trendBadge: { fontSize: 12, fontWeight: '700' },

  card: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#1B3A6B',
    shadowOpacity: 0.07,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 10,
  },
  cardTitle: { fontSize: 15, color: '#1B3A6B', fontWeight: '700', marginBottom: 2 },
  cardSubtitle: { fontSize: 12, color: '#5A8FAF', marginBottom: 16 },

  gaugeOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center' },
  gaugeBig: { fontSize: 42, fontWeight: '900', lineHeight: 48 },
  gaugeMax: { fontSize: 18, fontWeight: '400', color: '#BBB' },
  gaugeLabel: { fontSize: 12, fontWeight: '600', marginTop: 10, marginBottom: 4 },

  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(27,58,107,0.07)',
  },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 26, fontWeight: '800' },
  statLabel: { fontSize: 11, color: '#5A8FAF', fontWeight: '600', marginTop: 2 },
  statDivider: { width: 1, backgroundColor: 'rgba(27,58,107,0.1)', marginVertical: 4 },

  chartStyle: { borderRadius: 12, paddingRight: 10, paddingTop: 10 },
  chartLabelsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6, marginTop: -6 },
  chartLabelText: { fontSize: 11, color: '#5A8FAF', fontWeight: '600' },

  riskMapContainer: { height: 180, borderRadius: 16, overflow: 'hidden' },
  riskMap: { flex: 1 },
  mapLegendRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: '#333', fontWeight: '600' },

  warningText: { fontSize: 12, color: '#D32F2F', fontWeight: '600', marginTop: 4 },

  alertRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(27,58,107,0.07)' },
  alertDate: { fontSize: 11, color: '#5A8FAF', fontWeight: '700', marginBottom: 2 },
  alertMessage: { fontSize: 13, color: '#1B3A6B' },
  alertRecipients: { fontSize: 11, color: '#999', marginTop: 2 },
})
