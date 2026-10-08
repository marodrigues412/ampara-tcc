import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateExperimentalRiskScore, getExperimentalRiskLevel } from '../services/experimentalRiskScore.js'

test('does not score until personal BPM and context are both available', () => {
  assert.equal(calculateExperimentalRiskScore({ heartRateZScore: null, contextScore: 5 }), null)
  assert.equal(calculateExperimentalRiskScore({ heartRateZScore: 2.3, contextScore: null }), null)
})

test('BPM deviation is the primary signal and context makes only a small adjustment', () => {
  assert.equal(calculateExperimentalRiskScore({ heartRateZScore: 0.4, contextScore: 10 }), 2)
  assert.equal(calculateExperimentalRiskScore({ heartRateZScore: 1.4, contextScore: 0 }), 4)
  assert.equal(calculateExperimentalRiskScore({ heartRateZScore: 2.4, contextScore: 0 }), 7)
})

test('score is bounded and labels use the experimental bands', () => {
  assert.equal(calculateExperimentalRiskScore({ heartRateZScore: -3, contextScore: 0 }), 0)
  assert.equal(calculateExperimentalRiskScore({ heartRateZScore: 8, contextScore: 10 }), 9)
  assert.equal(getExperimentalRiskLevel(3), 'Baixo')
  assert.equal(getExperimentalRiskLevel(5), 'Moderado')
  assert.equal(getExperimentalRiskLevel(8), 'Elevado')
})
