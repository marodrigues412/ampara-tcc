import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  classifyScoreBand,
  extractPhoneMotionFeatures,
  normalizeHeartRateAnomaly,
  scoreIsolationForest,
} from '../services/isolationForestMotion.js'

const toyModel = {
  featureNames: ['mean', 'std', 'peak', 'jerk'],
  scalerMean: [0, 0, 0, 0],
  scalerScale: [1, 1, 1, 1],
  maxSamples: 4,
  moderateThreshold: 0.2,
  highThreshold: 0.6,
  trees: [{
    left: [1, -1, -1],
    right: [2, -1, -1],
    feature: [0, -2, -2],
    threshold: [0, -2, -2],
    samples: [4, 2, 1],
  }],
}

test('extracts only complete phone windows with the trained feature order', () => {
  assert.equal(extractPhoneMotionFeatures({ sampleCount: 9, durationMs: 2500 }), null)
  assert.deepEqual(extractPhoneMotionFeatures({
    meanMagnitudeG: 1,
    stdDevMagnitudeG: 0.1,
    peakMagnitudeG: 1.4,
    jerkGPerSecond: 2,
    sampleCount: 20,
    durationMs: 2500,
  }), [1, 0.1, 1.4, 2])
})

test('scores a feature vector through exported isolation-forest tree arrays', () => {
  const score = scoreIsolationForest([1, 0, 0, 0], toyModel)
  assert.ok(score.rawAnomalyScore > 0)
  assert.equal(score.anomalyScore, 1)
  assert.equal(score.band, 'alto')
  assert.equal(scoreIsolationForest([NaN, 0, 0, 0], toyModel), null)
})

test('loads the committed UCI model artifact in the app inference format', () => {
  const model = JSON.parse(readFileSync(new URL('../models/isolationForestMotionModel.json', import.meta.url)))
  const score = scoreIsolationForest([1, 0.1, 1.3, 2], model)
  assert.equal(model.trees.length, 100)
  assert.ok(Number.isFinite(score?.rawAnomalyScore))
  assert.ok(score.anomalyScore >= 0 && score.anomalyScore <= 1)
})

test('model v2: jerk on the same scale the app computes (10 Hz, g/s)', () => {
  const model = JSON.parse(readFileSync(new URL('../models/isolationForestMotionModel.json', import.meta.url)))
  assert.equal(model.modelVersion, 'uci-har-motion-if-v2')
  assert.equal(model.featureNames[3], 'max_jerk_g_per_second')
  // A v1 tinha média ~18,8 g/s (×50 a 10 Hz); com ×10 a média de treino fica ~3,8 g/s.
  assert.ok(model.scalerMean[3] > 2 && model.scalerMean[3] < 6, String(model.scalerMean[3]))
  // Uma caminhada típica pelo cálculo do app: degraus de ~0,4 g entre amostras = 4 g/s.
  const window = { sampleCount: 26, durationMs: 2500, meanMagnitudeG: 1.03, stdDevMagnitudeG: 0.2, peakMagnitudeG: 1.5, jerkGPerSecond: 4 }
  const score = scoreIsolationForest(extractPhoneMotionFeatures(window), model)
  assert.ok(score.anomalyScore < 0.33, `caminhada típica não pode cair em médio/alto: ${score.anomalyScore}`)
})

test('uses the professor thresholds for body bands', () => {
  assert.equal(classifyScoreBand(0.33), 'baixo')
  assert.equal(classifyScoreBand(0.34), 'medio')
  assert.equal(classifyScoreBand(0.67), 'alto')
  assert.equal(normalizeHeartRateAnomaly(0.5), 0)
  assert.equal(normalizeHeartRateAnomaly(2.5), 1)
})
