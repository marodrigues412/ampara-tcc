import React from 'react'
import {
  StyleSheet,
  Text,
  View,
  Dimensions,
  ScrollView,
} from 'react-native'

import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ProgressChart,
  LineChart,
  BarChart,
  PieChart,
} from 'react-native-chart-kit'

import { calculateWeeklyMetrics } from '../utils/weeklyCalculator'
import weeklyData from '../data/weekly_history.json'

const screenWidth = Dimensions.get("window").width
const CHART_INNER_WIDTH = screenWidth - 80

const BAR_COLORS_PASTEL = {
  green: 'rgba(165, 214, 167, 0.5)',
  yellow: 'rgba(255, 236, 179, 0.5)',
  risk: 'rgba(231, 188, 197, 0.5)',
}

const getScoreRGB = (score) => {
  if (score >= 80) return '76, 175, 80'
  if (score >= 50) return '255, 193, 7'
  return '107, 43, 56'
}

export default function Dashboard() {

  const insets = useSafeAreaInsets() // ✅ CORRETO

  const metrics = calculateWeeklyMetrics(weeklyData.weekly_scores)
  const dynamicRGB = getScoreRGB(metrics.averageScore)

  const chartConfigBase = {
    backgroundGradientFrom: "#FFF",
    backgroundGradientTo: "#FFF",
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(107, 43, 56, ${opacity})`,
    labelColor: () => `#6B2B38`,
    style: { borderRadius: 16 },
    propsForBackgroundLines: {
      strokeWidth: 1,
      stroke: "rgba(215, 215, 215, 0.2)",
    }
  }

  const calculatedBarWidth =
    (weeklyData.hourly_risk_score.length / 4.5) * screenWidth

  return (
    <SafeAreaView
      style={[
        styles.container,
        { paddingTop: Math.max(insets.top - 30, 10) } // 
      ]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >

        <Text style={styles.header}>Relatório Ampara</Text>

        {/* MÉDIA */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Segurança Média</Text>

          <View style={styles.chartCenterer}>
            <ProgressChart
              data={{ data: [metrics.averageScore / 100] }}
              width={screenWidth - 40}
              height={180}
              strokeWidth={18}
              radius={75}
              hideLegend
              chartConfig={{
                ...chartConfigBase,
                color: (opacity = 1) => `rgba(${dynamicRGB}, ${opacity})`,
              }}
            />

            <View style={styles.absoluteLabel}>
              <Text style={[styles.scoreNumber, { color: `rgb(${dynamicRGB})` }]}>
                {metrics.averageScore}%
              </Text>
              <Text style={styles.scoreSubLabel}>SCORE</Text>
            </View>
          </View>
        </View>

        {/* LINHA */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Variação de Risco (7 dias)</Text>

          <LineChart
            data={{
              labels: weeklyData.weekly_scores.map(d => d.dia),
              datasets: [{ data: weeklyData.weekly_scores.map(d => d.score) }]
            }}
            width={CHART_INNER_WIDTH + 20}
            height={180}
            chartConfig={{
              ...chartConfigBase,
              fillShadowGradient: `rgb(${dynamicRGB})`,
              fillShadowGradientOpacity: 0.1,
            }}
            bezier
            style={styles.chartStyle}
          />
        </View>

        {/* BARRAS */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Segurança por Horário</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <BarChart
              data={{
                labels: weeklyData.hourly_risk_score.map(h => h.hora),
                datasets: [{
                  data: weeklyData.hourly_risk_score.map(h => h.score),
                  colors: weeklyData.hourly_risk_score.map(h => () => {
                    if (h.score >= 80) return BAR_COLORS_PASTEL.green
                    if (h.score >= 50) return BAR_COLORS_PASTEL.yellow
                    return BAR_COLORS_PASTEL.risk
                  })
                }]
              }}
              width={calculatedBarWidth}
              height={260}
              fromZero
              withCustomBarColorFromData
              flatColor
              showValuesOnTopOfBars
              chartConfig={{
                ...chartConfigBase,
                color: () => `#6B2B38`,
                barPercentage: 0.95,
              }}
              style={styles.chartStyle}
            />
          </ScrollView>
        </View>

        {/* PIE */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Eficácia dos Alertas</Text>

          <PieChart
            data={weeklyData.alerts_distribution.map((item, index) => {
              const palette = ['#6B2B38', '#A5D6A7', '#FFC107']
              return {
                ...item,
                color: palette[index],
                legendFontColor: "#6B2B38",
                legendFontSize: 12,
              }
            })}
            width={CHART_INNER_WIDTH + 40}
            height={180}
            chartConfig={chartConfigBase}
            accessor="count"
            backgroundColor="transparent"
            paddingLeft="15"
            absolute
          />
        </View>

      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5EFEA',
  },

  scrollContainer: {
    paddingHorizontal: 20,
    paddingBottom: 120, // 🔥 evita navbar tapar conteúdo
  },

  header: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#6B2B38',
    marginBottom: 20,
  },

  card: {
    backgroundColor: '#FFF',
    borderRadius: 25,
    padding: 20,
    marginBottom: 20,
    elevation: 3,
  },

  cardTitle: {
    fontSize: 16,
    color: '#6B2B38',
    fontWeight: 'bold',
    marginBottom: 15,
  },

  chartCenterer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 180,
  },

  absoluteLabel: {
    position: 'absolute',
    alignItems: 'center',
  },

  scoreNumber: {
    fontSize: 42,
    fontWeight: '900',
  },

  scoreSubLabel: {
    fontSize: 10,
    color: '#9C6873',
    fontWeight: 'bold',
  },

  chartStyle: {
    borderRadius: 16,
  },
})