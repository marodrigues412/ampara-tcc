// mobile/utils/weeklyCalculator.js

import { isInsideAnySafeZone } from './geo';

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

// Compara o score médio do período atual com o do período imediatamente anterior
// (mesmo tamanho de janela). currentScores/previousScores vêm de aggregateDailyScores.
export const compareToPreviousPeriod = (currentScores, previousScores) => {
  if (!currentScores?.length || !previousScores?.length) {
    return { deltaPct: null, trend: 'sem-dados' };
  }
  const avg = (scores) => scores.reduce((a, b) => a + b.score, 0) / scores.length;
  const currentAvg = avg(currentScores);
  const previousAvg = avg(previousScores);
  if (previousAvg === 0) return { deltaPct: null, trend: 'sem-dados' };

  const deltaPct = Math.round(((currentAvg - previousAvg) / previousAvg) * 100);
  const trend = deltaPct > 0 ? 'melhor' : deltaPct < 0 ? 'pior' : 'igual';
  return { deltaPct, trend };
};

// % de pontos do histórico dentro de algum raio de local seguro
export const computeSafeZoneRatio = (locationHistory, safeLocations) => {
  const pontos = (locationHistory || []).filter(p => p.latitude != null && p.longitude != null);
  if (pontos.length === 0 || !safeLocations?.length) return null;

  const dentro = pontos.filter(p => isInsideAnySafeZone(p.latitude, p.longitude, safeLocations)).length;
  return Math.round((dentro / pontos.length) * 100);
};

// Compara o risk_score médio dos pontos registrados durante um período de atividade
// física ativa (user_activity_status) contra os pontos fora desses intervalos.
export const computeActivityRiskComparison = (locationHistory, activityPeriods) => {
  const pontos = (locationHistory || []).filter(p => p.risk_score != null);
  if (pontos.length === 0 || !activityPeriods?.length) return null;

  const duranteAtividade = [];
  const foraAtividade = [];

  pontos.forEach((p) => {
    const t = new Date(p.created_at).getTime();
    const emAtividade = activityPeriods.some((periodo) => {
      const inicio = new Date(periodo.started_at).getTime();
      const fim = periodo.ended_at ? new Date(periodo.ended_at).getTime() : Date.now();
      return t >= inicio && t <= fim;
    });
    (emAtividade ? duranteAtividade : foraAtividade).push(p.risk_score);
  });

  if (duranteAtividade.length === 0 || foraAtividade.length === 0) return null;

  const media = (arr) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  return { duringAvg: media(duranteAtividade), outsideAvg: media(foraAtividade) };
};

const PARADO_MAX_SPEED = 0.3; // m/s
const VEICULO_MIN_SPEED = 2; // m/s
const PARADA_PROLONGADA_MIN_PONTOS = 3; // pontos consecutivos parada, ~15min+ no throttle atual

// Classifica os pontos do histórico por velocidade (parado/caminhando/veículo) e sinaliza
// paradas prolongadas fora de zona segura — proxy simples de comportamento fora do padrão.
export const classifyMovement = (locationHistory, safeLocations) => {
  const pontos = (locationHistory || []).filter(p => p.speed != null);
  if (pontos.length === 0) return null;

  let parado = 0, caminhando = 0, veiculo = 0;
  let prolongedStopsOutsideSafeZone = 0;
  let paradaAtualFora = 0;

  pontos.forEach((p) => {
    const estaParado = p.speed < PARADO_MAX_SPEED;
    if (estaParado) parado++;
    else if (p.speed < VEICULO_MIN_SPEED) caminhando++;
    else veiculo++;

    const foraDeZonaSegura = p.latitude != null && p.longitude != null
      && !isInsideAnySafeZone(p.latitude, p.longitude, safeLocations);

    if (estaParado && foraDeZonaSegura) {
      paradaAtualFora++;
      if (paradaAtualFora === PARADA_PROLONGADA_MIN_PONTOS) prolongedStopsOutsideSafeZone++;
    } else {
      paradaAtualFora = 0;
    }
  });

  const total = pontos.length;
  return {
    paradoPct: Math.round((parado / total) * 100),
    caminhandoPct: Math.round((caminhando / total) * 100),
    veiculoPct: Math.round((veiculo / total) * 100),
    prolongedStopsOutsideSafeZone,
  };
};

// Conta quantas vezes cada contato de emergência aparece em alert_logs.recipient_names
// (telefones separados por vírgula, ver Home.js) e devolve o ranking dos mais acionados.
export const tallyContactAlerts = (alerts, emergencyContacts) => {
  if (!alerts?.length || !emergencyContacts?.length) return [];

  const contagemPorTelefone = {};
  alerts.forEach((alert) => {
    (alert.recipient_names || '').split(',').map(t => t.trim()).filter(Boolean).forEach((telefone) => {
      contagemPorTelefone[telefone] = (contagemPorTelefone[telefone] || 0) + 1;
    });
  });

  return emergencyContacts
    .map((contato) => ({
      nome: contato.nome,
      telefone: contato.telefone,
      count: contagemPorTelefone[contato.telefone] || 0,
    }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
};