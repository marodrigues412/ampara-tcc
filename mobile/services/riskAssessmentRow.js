// Linha gravada em risk_assessments, separada do serviço para dar para testar sem o
// Supabase.
//
// Do contexto, só vão a faixa (baixo/médio/alto), a origem (bairro ou cidade) e o motivo
// de indisponibilidade. A nota exata da célula (escore_contexto) fica só no cálculo
// dentro do app: cruzada com o mapa público, ela apontaria o bairro da usuária.
// Pelo mesmo motivo, nearby_crime_count e crime_density_per_km2 (crimes num raio de
// 1 km) não são mais gravados. As colunas e os dados antigos continuam no banco:
// apagar fica para depois da Eureka (docs/PENDENCIAS_POS_EUREKA.md).

// Colunas do score de 3 camadas (data/score_3_camadas.sql). Enquanto a migração não
// estiver no banco, o PostgREST recusa a linha inteira por causa delas; aí o app passa
// a gravar no formato antigo, que só aceita linhas com BPM.
export const COLUNAS_3_CAMADAS = [
  'sensor_mode', 'body_score', 'body_band', 'bpm_anomaly', 'watch_motion_anomaly',
  'context_band', 'context_origin', 'context_unavailable_reason',
]

// Lista fechada: campo que não está aqui não vai para o banco, mesmo que venha em
// `assessment` (ex.: contextCellScore).
export function montarLinhaDaAvaliacao(userId, assessment) {
  return {
    user_id: userId,
    measured_at: assessment.measuredAt,
    bpm: assessment.bpm,
    baseline_mean_bpm: assessment.baselineMeanBpm,
    baseline_stddev_bpm: assessment.baselineStdDevBpm,
    bpm_z_score: assessment.bpmZScore,
    context_score: assessment.contextScore,
    experimental_score: assessment.experimentalScore,
    experimental_risk_level: assessment.experimentalRiskLevel,
    hour_of_day: assessment.hourOfDay,
    time_zone: assessment.timeZone,
    inside_safe_zone: assessment.insideSafeZone,
    activity_mode: assessment.activityMode,
    motion_risk_score: assessment.motionRiskScore,
    motion_anomaly_score: assessment.motionAnomalyScore,
    phone_motion_risk_points: assessment.phoneMotionRiskPoints,
    watch_motion_risk_points: assessment.watchMotionRiskPoints,
    phone_mean_magnitude_g: assessment.phoneMeanMagnitudeG,
    phone_magnitude_stddev_g: assessment.phoneMagnitudeStdDevG,
    phone_peak_magnitude_g: assessment.phonePeakMagnitudeG,
    phone_jerk_g_per_second: assessment.phoneJerkGPerSecond,
    phone_motion_sample_count: assessment.phoneMotionSampleCount,
    gps_speed_mps: assessment.gpsSpeedMps,
    gps_speed_delta_mps: assessment.gpsSpeedDeltaMps,
    watch_motion_rms_mps2: assessment.watchMotionRmsMps2,
    watch_motion_peak_mps2: assessment.watchMotionPeakMps2,
    watch_motion_jerk_mps3: assessment.watchMotionJerkMps3,
    model_version: assessment.modelVersion,
    source: assessment.source || 'Galaxy Watch',
    sensor_mode: assessment.sensorMode,
    body_score: assessment.bodyScore,
    body_band: assessment.bodyBand,
    bpm_anomaly: assessment.bpmAnomaly,
    watch_motion_anomaly: assessment.watchMotionAnomaly,
    context_band: assessment.contextBand,
    context_origin: assessment.contextOrigin,
    context_unavailable_reason: assessment.contextUnavailableReason,
  }
}

export function linhaNoFormatoAntigo(linha) {
  const antiga = { ...linha }
  for (const coluna of COLUNAS_3_CAMADAS) delete antiga[coluna]
  return antiga
}
