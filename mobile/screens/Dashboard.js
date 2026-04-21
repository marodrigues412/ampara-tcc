import React, { useState } from 'react';
import { 
  StyleSheet, Text, View, Dimensions, ScrollView, TouchableOpacity, Platform, StatusBar 
} from 'react-native';
import { ProgressChart, LineChart, BarChart, PieChart } from 'react-native-chart-kit';
import { calculateWeeklyMetrics } from '../utils/weeklyCalculator';
import weeklyData from '../data/weekly_history.json';

const screenWidth = Dimensions.get("window").width;
const CHART_INNER_WIDTH = screenWidth - 80;

// Paleta para o Histograma (Tons pastel para não pesar)
const BAR_COLORS_PASTEL = {
  green: 'rgba(165, 214, 167, 0.5)',
  yellow: 'rgba(255, 236, 179, 0.5)',
  risk: 'rgba(231, 188, 197, 0.5)',
};

const getScoreRGB = (score) => {
  if (score >= 80) return '76, 175, 80';
  if (score >= 50) return '255, 193, 7';
  return '107, 43, 56';
};

export default function Dashboard({ onBack }) {
  const metrics = calculateWeeklyMetrics(weeklyData.weekly_scores);
  const dynamicRGB = getScoreRGB(metrics.averageScore);
  const [selectedBar, setSelectedBar] = useState(null);

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
  };

  const calculatedBarWidth = (weeklyData.hourly_risk_score.length / 4.5) * screenWidth;

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        
        <View style={styles.headerRow}>
          <Text style={styles.header}>Relatório Ampara</Text>
          <TouchableOpacity style={styles.miniBackButton} onPress={onBack}>
            <Text style={styles.miniBackText}>Sair</Text>
          </TouchableOpacity>
        </View>

        {/* 1. MÉDIA SEMANAL */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Segurança Média</Text>
          <View style={styles.chartCenterer}>
            <ProgressChart
              data={{ data: [metrics.averageScore / 100] }}
              width={screenWidth - 40}
              height={180}
              strokeWidth={18}
              radius={75}
              hideLegend={true}
              chartConfig={{
                ...chartConfigBase,
                color: (opacity = 1) => `rgba(${dynamicRGB}, ${opacity})`,
              }}
            />
            <View style={styles.absoluteLabel}>
              <Text style={[styles.scoreNumber, { color: `rgb(${dynamicRGB})` }]}>{metrics.averageScore}%</Text>
              <Text style={styles.scoreSubLabel}>SCORE</Text>
            </View>
          </View>
        </View>

        {/* 2. EVOLUÇÃO DIÁRIA (VALORES SOBRE OS PONTOS) */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Variação de Risco (7 dias)</Text>
          <View style={{ paddingRight: 20 }}>
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
              renderDotContent={({ x, y, indexData }) => (
                <Text
                  key={indexData + Math.random()}
                  style={{
                    position: 'absolute',
                    top: y - 22,
                    left: x - 10,
                    fontSize: 10,
                    fontWeight: 'bold',
                    color: '#6B2B38',
                  }}>
                  {indexData}%
                </Text>
              )}
              style={styles.chartStyle}
            />
          </View>
        </View>

        {/* 3. MANCHA HORÁRIA (HISTOGRAMA COM ZOOM E VALORES VINHO) */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Segurança por Horário</Text>
          <View style={styles.yAxisLegendContainer}>
            <Text style={styles.axisLabel}>Score (0-100)</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View>
              <BarChart
                data={{
                  labels: weeklyData.hourly_risk_score.map(h => h.hora),
                  datasets: [{ 
                    data: weeklyData.hourly_risk_score.map(h => h.score),
                    colors: weeklyData.hourly_risk_score.map(h => () => {
                        if (h.score >= 80) return BAR_COLORS_PASTEL.green;
                        if (h.score >= 50) return BAR_COLORS_PASTEL.yellow;
                        return BAR_COLORS_PASTEL.risk;
                    })
                  }]
                }}
                width={calculatedBarWidth} 
                height={260}
                fromZero
                withCustomBarColorFromData={true}
                flatColor={true}
                showValuesOnTopOfBars={true} 
                chartConfig={{
                  ...chartConfigBase,
                  color: () => `#6B2B38`, // Cor vinho para os valores sobre as barras
                  barPercentage: 0.95, // Barras quase encostadas (5% de espaço)
                  paddingLeft: 15,
                }}
                style={{ marginVertical: 8, borderRadius: 16, paddingRight: 60 }}
              />
              <Text style={styles.xAxisLabel}>Horário (24h) - Deslize para o lado</Text>
            </View>
          </ScrollView>
        </View>

        {/* 4. DISTRIBUIÇÃO DE ALERTAS (CORES DE ALTO CONTRASTE) */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Eficácia dos Alertas</Text>
          <PieChart
            data={weeklyData.alerts_distribution.map((item, index) => {
              // Paleta de Alto Contraste seguindo a identidade
              const highContrastPalette = [
                '#6B2B38', // Alertas Reais (Perigo confirmado)
                '#A5D6A7', // Falsos Positivo (O sistema filtrou o risco e você está bem)
                '#FFC107', // Cancelamentos (A usuária interveio antes da análise)
              ];
              return {
                ...item,
                color: highContrastPalette[index] || item.color,
                legendFontColor: "#6B2B38",
                legendFontSize: 12,
              };
            })}
            width={CHART_INNER_WIDTH + 40}
            height={180}
            chartConfig={chartConfigBase}
            accessor={"count"}
            backgroundColor={"transparent"}
            paddingLeft={"15"}
            absolute
          />
        </View>

        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>VOLTAR PARA SENSORES</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F3EF', paddingTop: Platform.OS === 'android' ? 40 : 50 },
  scrollContainer: { paddingHorizontal: 20, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
  header: { fontSize: 26, fontWeight: 'bold', color: '#6B2B38' },
  miniBackButton: { padding: 10, backgroundColor: '#D7D7D7', borderRadius: 12 },
  miniBackText: { fontSize: 12, color: '#6B2B38', fontWeight: 'bold' },
  card: { 
    backgroundColor: '#FFF', width: '100%', borderRadius: 30, padding: 20, marginBottom: 20,
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 10,
    alignItems: 'center'
  },
  cardTitle: { fontSize: 16, color: '#6B2B38', fontWeight: 'bold', marginBottom: 15, alignSelf: 'flex-start' },
  chartCenterer: { justifyContent: 'center', alignItems: 'center', width: '100%', height: 180 },
  absoluteLabel: { position: 'absolute', alignItems: 'center' },
  scoreNumber: { fontSize: 42, fontWeight: '900' },
  scoreSubLabel: { fontSize: 10, color: '#9C6873', fontWeight: 'bold', letterSpacing: 2 },
  chartStyle: { marginVertical: 8, borderRadius: 16 },
  yAxisLegendContainer: { alignSelf: 'flex-start', marginLeft: 10, marginBottom: -5 },
  axisLabel: { fontSize: 11, color: '#6B2B38', fontWeight: 'bold' },
  xAxisLabel: { textAlign: 'center', fontSize: 11, color: '#6B2B38', fontWeight: 'bold', marginTop: 5 },
  backButton: { marginTop: 10, padding: 18, backgroundColor: '#6B2B38', borderRadius: 20, width: '100%', alignItems: 'center' },
  backButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 }
});