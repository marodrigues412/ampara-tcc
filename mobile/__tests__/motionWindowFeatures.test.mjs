import test from 'node:test'
import assert from 'node:assert/strict'
import { appendPhoneMotionSample, summarizePhoneMotionWindow } from '../utils/motionWindowFeatures.js'

test('keeps only the trailing motion window', () => {
  const samples = [
    { magnitudeG: 1, timestampMs: 1_000 },
    { magnitudeG: 1.5, timestampMs: 10_000 },
  ]
  assert.deepEqual(appendPhoneMotionSample(samples, 2, 12_000), [
    { magnitudeG: 1.5, timestampMs: 10_000 },
    { magnitudeG: 2, timestampMs: 12_000 },
  ])
})

test('summarizes intensity, variability, peak, and jerk from sensor samples', () => {
  const result = summarizePhoneMotionWindow([
    { magnitudeG: 1, timestampMs: 0 },
    { magnitudeG: 3, timestampMs: 1_000 },
  ])
  assert.equal(result.meanMagnitudeG, 2)
  assert.equal(result.stdDevMagnitudeG, 1)
  assert.equal(result.peakMagnitudeG, 3)
  assert.equal(result.jerkGPerSecond, 2)
  assert.equal(result.sampleCount, 2)
})
