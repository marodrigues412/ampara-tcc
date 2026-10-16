const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value))

export function extractPhoneMotionFeatures(window) {
  if (!window || window.sampleCount < 10 || window.durationMs < 1800) return null
  const values = [
    Number(window.meanMagnitudeG),
    Number(window.stdDevMagnitudeG),
    Number(window.peakMagnitudeG),
    Number(window.jerkGPerSecond),
  ]
  return values.every(Number.isFinite) ? values : null
}

function averagePathLength(sampleCount) {
  if (sampleCount <= 1) return 0
  if (sampleCount === 2) return 1
  const eulerGamma = 0.5772156649015329
  return 2 * (Math.log(sampleCount - 1) + eulerGamma) - (2 * (sampleCount - 1)) / sampleCount
}

export function scoreIsolationForest(features, model) {
  if (!Array.isArray(features) || !model?.trees?.length || features.length !== model.featureNames?.length) return null
  if (!features.every(Number.isFinite)) return null

  const normalized = features.map((value, index) => (value - model.scalerMean[index]) / model.scalerScale[index])
  let totalPathLength = 0

  for (const tree of model.trees) {
    let node = 0
    let depth = 0
    while (tree.left[node] !== -1) {
      const featureIndex = tree.feature[node]
      node = normalized[featureIndex] <= tree.threshold[node] ? tree.left[node] : tree.right[node]
      depth += 1
      if (depth > tree.left.length) return null
    }
    totalPathLength += depth + averagePathLength(tree.samples[node])
  }

  const averageDepth = totalPathLength / model.trees.length
  const denominator = averagePathLength(model.maxSamples)
  if (!Number.isFinite(denominator) || denominator <= 0) return null
  const rawAnomalyScore = 2 ** (-averageDepth / denominator)
  const thresholdRange = model.highThreshold - model.moderateThreshold
  if (!Number.isFinite(thresholdRange) || thresholdRange <= 0) return null
  const anomalyScore = clamp((rawAnomalyScore - model.moderateThreshold) / thresholdRange)

  return {
    rawAnomalyScore,
    anomalyScore,
    band: classifyScoreBand(anomalyScore),
  }
}

export function classifyScoreBand(score) {
  const value = Number(score)
  if (!Number.isFinite(value)) return null
  if (value <= 0.33) return 'baixo'
  if (value <= 0.66) return 'medio'
  return 'alto'
}

export function normalizeHeartRateAnomaly(heartRateZScore) {
  const zScore = Number(heartRateZScore)
  if (!Number.isFinite(zScore)) return null
  return clamp((zScore - 0.5) / 2)
}

const FUSION_MATRIX = {
  baixo: { baixo: 'Baixo', medio: 'Baixo', alto: 'Moderado' },
  medio: { baixo: 'Baixo', medio: 'Moderado', alto: 'Alto' },
  alto: { baixo: 'Moderado', medio: 'Alto', alto: 'Alto' },
}

export function fuseExperimentalRiskLayers({ contextScore, heartRateZScore, motionAnomalyScore }) {
  if (contextScore === null || contextScore === undefined || contextScore === '') return null
  const context = Number(contextScore)
  const heartRateAnomaly = normalizeHeartRateAnomaly(heartRateZScore)
  if (!Number.isFinite(context) || heartRateAnomaly === null) return null

  const motion = motionAnomalyScore === null || motionAnomalyScore === undefined || motionAnomalyScore === ''
    ? null
    : Number(motionAnomalyScore)
  const bodyScore = Number.isFinite(motion)
    ? (0.7 * heartRateAnomaly) + (0.3 * clamp(motion))
    : heartRateAnomaly
  const contextBand = classifyScoreBand(clamp(context / 10))
  const bodyBand = classifyScoreBand(bodyScore)

  return {
    bodyScore: Math.round(bodyScore * 1000) / 1000,
    contextBand,
    bodyBand,
    level: FUSION_MATRIX[contextBand][bodyBand],
  }
}
