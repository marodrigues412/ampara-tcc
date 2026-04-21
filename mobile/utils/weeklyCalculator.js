// mobile/utils/weeklyCalculator.js

export const calculateWeeklyMetrics = (history) => {
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