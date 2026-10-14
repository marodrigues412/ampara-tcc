export const EXPERIMENTAL_RISK_SCORE_VERSION = 'bpm-context-motion-v0.2'

const toFiniteNumber = value => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function calculateExperimentalRiskScore({ heartRateZScore, contextScore, motionScore = null }) {
  const zScore = toFiniteNumber(heartRateZScore)
  const context = toFiniteNumber(contextScore)
  if (zScore === null || context === null) return null

  const heartRateRisk = zScore >= 2 ? 10 : zScore >= 1 ? 6 : zScore >= 0.5 ? 3 : 0
  const boundedContext = Math.max(0, Math.min(10, context))
  const motion = toFiniteNumber(motionScore)

  // Keep BPM primary; movement contributes only when a sensor window is available.
  const weightedScore = motion === null
    ? (heartRateRisk * 0.7) + (boundedContext * 0.3)
    : (heartRateRisk * 0.6) + (boundedContext * 0.25) + (Math.max(0, Math.min(10, motion)) * 0.15)
  return Math.round(weightedScore * 10) / 10
}

export function getExperimentalRiskLevel(score) {
  const value = toFiniteNumber(score)
  if (value === null) return null
  if (value >= 7) return 'Elevado'
  if (value >= 4) return 'Moderado'
  return 'Baixo'
}
