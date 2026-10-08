import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { appendHeartRateSample, calculateHeartRateBaseline } from '../services/heartRateBaseline.js'

const now = Date.UTC(2026, 9, 7, 12)

describe('heart-rate baseline', () => {
  it('keeps only valid readings in the trailing hour and deduplicates timestamps', () => {
    const old = { bpm: 80, timestamp: now - 60 * 60 * 1000 - 1 }
    const recent = { bpm: 72, timestamp: now - 5_000 }
    const result = appendHeartRateSample([old, recent], recent, now)
    assert.deepEqual(result, [{ bpm: 72, timestampMs: now - 5_000 }])
  })

  it('returns unavailable until it has 20 prior samples', () => {
    const samples = Array.from({ length: 19 }, (_, index) => ({ bpm: 70, timestamp: now - (20 - index) * 1_000 }))
    const result = calculateHeartRateBaseline(samples, { bpm: 90, timestamp: now }, now)
    assert.equal(result.sampleCount, 19)
    assert.equal(result.available, false)
    assert.equal(result.zScore, null)
  })

  it('does not call a short startup history a one-hour baseline', () => {
    const samples = Array.from({ length: 30 }, (_, index) => ({
      bpm: 70 + (index % 2),
      timestamp: now - (30 - index) * 1_000,
    }))
    const result = calculateHeartRateBaseline(samples, { bpm: 80, timestamp: now }, now)
    assert.equal(result.sampleCount, 30)
    assert.equal(result.available, false)
    assert.equal(result.coverageMinutes, 0)
  })

  it('calculates the personal z-score from prior readings only', () => {
    const samples = Array.from({ length: 20 }, (_, index) => ({
      bpm: index % 2 === 0 ? 70 : 72,
      timestamp: now - 60 * 60 * 1000 + index * (59 * 60 * 1000 / 19),
    }))
    const result = calculateHeartRateBaseline(samples, { bpm: 80, timestamp: now }, now)
    assert.equal(result.available, true)
    assert.equal(result.meanBpm, 71)
    assert.ok(result.zScore > 8)
  })

  it('does not manufacture a z-score when the baseline has no variation', () => {
    const samples = Array.from({ length: 20 }, (_, index) => ({
      bpm: 70,
      timestamp: now - 60 * 60 * 1000 + index * (59 * 60 * 1000 / 19),
    }))
    const result = calculateHeartRateBaseline(samples, { bpm: 70, timestamp: now }, now)
    assert.equal(result.available, false)
    assert.equal(result.zScore, null)
    assert.equal(result.baselineReady, true)
  })
})
