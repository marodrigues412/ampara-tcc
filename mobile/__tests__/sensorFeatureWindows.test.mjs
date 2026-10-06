import assert from 'node:assert/strict'
import test from 'node:test'
import { extractSensorWindowFeatures, SENSOR_WINDOW_FEATURES } from '../services/sensorFeatureWindows.js'

const startMs = 2_000_000
const endMs = startMs + 10_000

test('returns the seven agreed features without storing samples', () => {
  const features = extractSensorWindowFeatures({ startMs, endMs })
  assert.deepEqual(Object.keys(features), [...SENSOR_WINDOW_FEATURES])
  assert.ok(Object.values(features).every(value => value === null))
})

test('subtracts gravity and computes movement mean, variability, and peak', () => {
  const features = extractSensorWindowFeatures({
    startMs,
    endMs,
    accelerometerSamples: [
      { x: 0.1, y: 0, z: 1, timestampMs: startMs + 2_000 },
      { x: -0.1, y: 0, z: 1, timestampMs: startMs + 4_000 },
      { x: 0.2, y: 0, z: 1, timestampMs: startMs + 6_000 },
      { x: -0.2, y: 0, z: 1, timestampMs: startMs + 8_000 },
    ],
  })

  assert.ok(Math.abs(features.movementMeanMps2 - 1.4709975) < 1e-9)
  assert.ok(Math.abs(features.movementVariabilityMps2 - 0.4903325) < 1e-9)
  assert.ok(Math.abs(features.movementPeakMps2 - 1.96133) < 1e-9)
})

test('a stationary device has no dynamic movement after gravity removal', () => {
  const features = extractSensorWindowFeatures({
    startMs,
    endMs,
    accelerometerSamples: Array.from({ length: 10 }, (_, index) => ({
      x: 0,
      y: 0,
      z: 1,
      timestampMs: startMs + index * 900,
    })),
  })
  assert.equal(features.movementMeanMps2, 0)
  assert.equal(features.movementVariabilityMps2, 0)
  assert.equal(features.movementPeakMps2, 0)
})

test('computes personal heart-rate deviation only with at least 20 prior samples', () => {
  const heartRateSamples = Array.from({ length: 20 }, (_, index) => ({
    bpm: index % 2 === 0 ? 60 : 80,
    timestampMs: startMs - (20 - index) * 60_000,
  }))
  heartRateSamples.push({ bpm: 100, timestampMs: endMs - 1_000 })

  const features = extractSensorWindowFeatures({ startMs, endMs, heartRateSamples })
  assert.equal(features.heartRateBpm, 100)
  assert.equal(features.heartRateZScore, 3)

  const insufficient = extractSensorWindowFeatures({
    startMs,
    endMs,
    heartRateSamples: heartRateSamples.slice(-10),
  })
  assert.equal(insufficient.heartRateZScore, null)
})

test('leaves stale or missing GPS and heart rate values null instead of imputing', () => {
  const features = extractSensorWindowFeatures({
    startMs,
    endMs,
    heartRateSamples: [
      { bpm: 90, timestampMs: endMs - 20_000 },
      { bpm: null, timestampMs: endMs - 500 },
    ],
    gpsSamples: [
      { speedMps: 3, timestampMs: endMs - 60_000 },
      { speedMps: null, timestampMs: endMs - 500 },
    ],
  })
  assert.equal(features.heartRateBpm, null)
  assert.equal(features.heartRateZScore, null)
  assert.equal(features.speedMps, null)
  assert.equal(features.speedDeltaMps, null)
})

test('computes speed delta only from a fresh prior sample', () => {
  const features = extractSensorWindowFeatures({
    startMs,
    endMs,
    gpsSamples: [{ speedMps: 4, timestampMs: endMs - 1_000 }],
    previousGpsSample: { speedMps: 1.5, timestampMs: endMs - 12_000 },
  })
  assert.equal(features.speedMps, 4)
  assert.equal(features.speedDeltaMps, 2.5)

  const sameWindow = extractSensorWindowFeatures({
    startMs,
    endMs,
    gpsSamples: [{ speedMps: 4, timestampMs: endMs - 1_000 }],
    previousGpsSample: { speedMps: 1.5, timestampMs: endMs - 5_000 },
  })
  assert.equal(sameWindow.speedDeltaMps, null)
})

test('rejects invalid windows', () => {
  assert.throws(() => extractSensorWindowFeatures({ startMs, endMs: startMs }))
})
