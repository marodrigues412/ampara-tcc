// mobile/utils/weeklyCalculator.js

export const calculateWeeklyMetrics = (history) => {
  if (!history || history.length === 0) {
    return { averageScore: 0, criticalDay: null, riskLevel: 'SEM DADOS', color: '#9AA0A6' };
  }

  const totalScore = history.reduce((acc, curr) => acc + curr.score, 0);
  const averageScore = Math.round(totalScore / history.length);

  // Encontrar o dia com menor score (maior risco)
  const criticalDay = history.reduce((prev, curr) => (prev.score < curr.score) ? prev : curr);

  return {
    averageScore,
    criticalDay: criticalDay.dia,
    riskLevel: averageScore > 70 ? 'SEGURO' : averageScore > 40 ? 'ALERTA' : 'CRÍTICO',
    color: averageScore > 70 ? '#4CAF50' : averageScore > 40 ? '#FFC107' : '#F44336'
  };
};

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

// Agrupa o histórico de localização (com risk_score) por dia da semana,
// na ordem em que os dias aparecem nos dados (mais antigo → mais recente).
export const aggregateDailyScores = (locationHistory) => {
  const buckets = {};
  (locationHistory || []).forEach(point => {
    if (point.risk_score == null) return;
    const label = DIAS_SEMANA[new Date(point.created_at).getDay()];
    if (!buckets[label]) buckets[label] = [];
    buckets[label].push(point.risk_score);
  });

  return Object.entries(buckets).map(([dia, scores]) => ({
    dia,
    score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
  }));
};

// Mesma janela de período usada em Home.js (getTimeLabel): madrugada, diurno, noite, noite avançada
const periodoDoDia = (hour) => {
  if (hour >= 0 && hour < 6) return 'Madrugada';
  if (hour >= 22) return 'Noite avançada';
  if (hour >= 18) return 'Noite';
  return 'Diurno';
};

export const aggregateHourlyScores = (locationHistory) => {
  const ordem = ['Madrugada', 'Diurno', 'Noite', 'Noite avançada'];
  const buckets = {};
  (locationHistory || []).forEach(point => {
    if (point.risk_score == null) return;
    const label = periodoDoDia(new Date(point.created_at).getHours());
    if (!buckets[label]) buckets[label] = [];
    buckets[label].push(point.risk_score);
  });

  return ordem
    .filter(label => buckets[label])
    .map(label => ({
      hora: label,
      score: Math.round(buckets[label].reduce((a, b) => a + b, 0) / buckets[label].length)
    }));
};