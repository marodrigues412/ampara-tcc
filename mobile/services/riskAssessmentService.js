import { supabase } from './supabase'

export const RISK_ASSESSMENT_SAMPLE_INTERVAL_MS = 30_000

export async function getRecentHeartRateSamples(userId, now = Date.now()) {
  if (!userId) return []

  const { data, error } = await supabase
    .from('risk_assessments')
    .select('bpm, measured_at')
    .eq('user_id', userId)
    .gte('measured_at', new Date(now - 60 * 60 * 1000).toISOString())
    .lte('measured_at', new Date(now + 10_000).toISOString())
    .order('measured_at', { ascending: true })
    .limit(200)

  if (error) throw error
  return (data || []).map(row => ({
    bpm: Number(row.bpm),
    timestamp: Date.parse(row.measured_at),
  }))
}

export async function saveRiskAssessment(userId, assessment) {
  if (!userId || !assessment?.measuredAt) return

  const { error } = await supabase
    .from('risk_assessments')
    .upsert({
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
      nearby_crime_count: assessment.nearbyCrimeCount,
      crime_density_per_km2: assessment.crimeDensityPerKm2,
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
    }, { onConflict: 'user_id,measured_at' })

  if (error) throw error
}

export async function getDailyRiskAssessmentReport(days = 7) {
  const from = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase.rpc('risk_assessment_daily_report', { p_from: from })
  if (error) throw error
  return data || []
}
