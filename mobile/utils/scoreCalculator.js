/**
 * Lógica central de cálculo de risco do Projeto Ampara
 */
export const calculateSecurityScore = ({ magnitudeG, isNearCrimeZone, currentHour, bpmPanico }) => {
  let score = 100;

  // 1. Impacto Cinético (Acelerômetro)
  // Se a magnitude G for maior que 1.8 (limite que definimos no Step 0)
  if (magnitudeG > 1.8) {
    const intensity = (magnitudeG - 1.8) * 15; 
    score -= Math.min(40, intensity); // Máximo de 40 pontos de perda por movimento
  }

  // 2. Contexto de Localização (SSP)
  if (isNearCrimeZone) {
    score -= 30; // Estar em área de risco reduz 30 pontos
  }

  // 3. Janela de Vulnerabilidade (Horário)
  // Noite/Madrugada (21h às 05h)
  if (currentHour >= 21 || currentHour <= 5) {
    score -= 15;
  }

  // 4. Biometria (Simulada para o protótipo)
  if (bpmPanico) {
    score -= 25;
  }

  const finalScore = Math.max(0, Math.round(score));

  // Retornamos um objeto completo para facilitar o gráfico e a UI
  return {
    score: finalScore,
    level: finalScore > 70 ? 'Seguro' : finalScore > 40 ? 'Atenção' : 'Crítico',
    color: finalScore > 70 ? '#4CAF50' : finalScore > 40 ? '#FFC107' : '#F44336'
  };
};