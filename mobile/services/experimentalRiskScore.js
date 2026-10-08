export const EXPERIMENTAL_RISK_SCORE_VERSION = 'bpm-context-v0.1'

const toFiniteNumber = value => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function calculateExperimentalRiskScore({ heartRateZScore, contextScore }) {
  const zScore = toFiniteNumber(heartRateZScore)
  const context = toFiniteNumber(contextScore)
  if (zScore === null || context === null) return null

  const heartRateBand = zScore >= 2 ? 2 : zScore >= 1 ? 1 : 0
  const contextBand = context >= 7 ? 2 : context >= 4 ? 1 : 0

  // BPM is the primary signal; neighborhood/time context adjusts the result by one point.
  const baseScore = [1, 5, 8][heartRateBand]
  const contextAdjustment = [-1, 0, 1][contextBand]
  return Math.max(0, Math.min(10, baseScore + contextAdjustment))
}

export function getExperimentalRiskLevel(score) {
  const value = toFiniteNumber(score)
  if (value === null) return null
  if (value >= 7) return 'Elevado'
  if (value >= 4) return 'Moderado'
  return 'Baixo'
}
