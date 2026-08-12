import React, { useEffect, useState } from 'react'
import {
  StyleSheet,
  Text,
  View,
  Image,
  Dimensions,
  ScrollView,
  ActivityIndicator,
} from 'react-native'

import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { LineChart } from 'react-native-chart-kit'
import { Svg, Path } from 'react-native-svg'
import { calculateWeeklyMetrics, aggregateDailyScores, aggregateHourlyScores } from '../utils/weeklyCalculator'
import { supabase } from '../services/supabase'
import { getRecentLocationHistory } from '../services/locationService'
import { getRecentAlerts } from '../services/alertService'

const screenWidth = Dimensions.get('window').width
const CHART_WIDTH = screenWidth - 80

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

export default function Dashboard() {
  const insets = useSafeAreaInsets()
  const [loading, setLoading] = useState(true)
  const [dailyScores, setDailyScores] = useState([])
  const [hourlyScores, setHourlyScores] = useState([])
  const [alertCount, setAlertCount] = useState(0)

  useEffect(() => {
    loadDashboardData()
  }, [])

  async function loadDashboardData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const [history, alerts] = await Promise.all([
      getRecentLocationHistory(user.id, 7),
      getRecentAlerts(user.id, 7),
    ])

    setDailyScores(aggregateDailyScores(history))
    setHourlyScores(aggregateHourlyScores(history))
    setAlertCount(alerts.length)
    setLoading(false)
  }

  const metrics = calculateWeeklyMetrics(dailyScores)
  const dynamicRGB = getScoreRGB(metrics.averageScore)
  const riskColor = `rgb(${dynamicRGB})`

  const scores = dailyScores.map(d => d.score)
  const bestScore = scores.length > 0 ? Math.max(...scores) : 0
  const worstScore = scores.length > 0 ? Math.min(...scores) : 0

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
            <Text style={styles.headerSub}>Últimos 7 dias</Text>
            <Text style={styles.headerTitle}>Relatório Ampara</Text>
          </View>
          <Image source={require('../assets/images/maos-ampara-rosa.png')} style={{ width: 40, height: 40 }} resizeMode="contain" />
        </View>

        {/* Gauge + stats */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Índice de Segurança Semanal</Text>
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

        {/* Alerts */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Alertas Enviados</Text>
          <Text style={styles.cardSubtitle}>Total nos últimos 7 dias</Text>
          <View style={{ alignItems: 'center', paddingVertical: 6 }}>
            <Text style={[styles.statValue, { fontSize: 40, color: alertCount > 0 ? '#C4687A' : '#2E8B57' }]}>{alertCount}</Text>
            <Text style={styles.statLabel}>{alertCount === 1 ? 'alerta enviado' : 'alertas enviados'}</Text>
          </View>
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
})
