const GRAVITY_MPS2 = 9.80665
const HEART_RATE_BASELINE_MS = 60 * 60 * 1000
const HEART_RATE_MAX_AGE_MS = 15 * 1000
const GPS_MAX_AGE_MS = 15 * 1000
const GPS_DELTA_MAX_GAP_MS = 30 * 1000
const MIN_HEART_RATE_BASELINE_SAMPLES = 20

export const DEFAULT_SENSOR_WINDOW_MS = 10 * 1000

export const SENSOR_WINDOW_FEATURES = Object.freeze([
  'heartRateBpm',
  'heartRateZScore',
  'movementMeanMps2',
  'movementVariabilityMps2',
  'movementPeakMps2',
  'speedMps',
  'speedDeltaMps',
])

function finiteNumber(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function timestampMs(sample) {
  const value = sample?.timestampMs ?? sample?.timestamp
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return finiteNumber(value)
}

function isInWindow(sample, startMs, endMs) {
  const time = timestampMs(sample)
  return time !== null && time >= startMs && time < endMs
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

function populationStdDev(values, mean) {
  if (!values.length || mean === null) return null
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length
  return Math.sqrt(variance)
}

function getHeartRateFeatures(samples, startMs, endMs) {
  const valid = samples
    .map(sample => ({ bpm: finiteNumber(sample?.bpm), time: timestampMs(sample) }))
    .filter(sample => sample.bpm !== null && sample.bpm > 0 && sample.time !== null)

  const current = valid
    .filter(sample => sample.time >= endMs - HEART_RATE_MAX_AGE_MS && sample.time < endMs)
    .sort((a, b) => b.time - a.time)[0]

  const baseline = valid
    .filter(sample => sample.time >= startMs - HEART_RATE_BASELINE_MS && sample.time < startMs)
    .map(sample => sample.bpm)

  const baselineMean = baseline.length >= MIN_HEART_RATE_BASELINE_SAMPLES ? average(baseline) : null
  const baselineStdDev = baselineMean === null ? null : populationStdDev(baseline, baselineMean)
  const zScore = current && baselineStdDev > 0
    ? (current.bpm - baselineMean) / baselineStdDev
    : null

  return {
    heartRateBpm: current?.bpm ?? null,
    heartRateZScore: Number.isFinite(zScore) ? zScore : null,
  }
}

function getMovementFeatures(samples, startMs, endMs) {
  const axes = samples
    .filter(sample => isInWindow(sample, startMs, endMs))
    .map(sample => {
      const x = finiteNumber(sample.x)
      const y = finiteNumber(sample.y)
      const z = finiteNumber(sample.z)
      if (x === null || y === null || z === null) return null
      return [x, y, z]
    })
    .filter(value => value !== null)

  // Center each axis within the window to remove its approximately constant gravity component.
  const axisMeans = [0, 1, 2].map(axis => average(axes.map(sample => sample[axis])))
  const magnitudes = axes.map(sample => Math.sqrt(
    (sample[0] - axisMeans[0]) ** 2
      + (sample[1] - axisMeans[1]) ** 2
      + (sample[2] - axisMeans[2]) ** 2
  ) * GRAVITY_MPS2)
  const mean = average(magnitudes)
  return {
    movementMeanMps2: mean,
    movementVariabilityMps2: populationStdDev(magnitudes, mean),
    movementPeakMps2: magnitudes.length ? Math.max(...magnitudes) : null,
  }
}

function getSpeedFeatures(samples, previousSample, startMs, endMs) {
  const valid = samples
    .map(sample => ({ speed: finiteNumber(sample?.speedMps), time: timestampMs(sample) }))
    .filter(sample => sample.speed !== null && sample.speed >= 0 && sample.time !== null)

  const current = valid
    .filter(sample => sample.time >= endMs - GPS_MAX_AGE_MS && sample.time < endMs)
    .sort((a, b) => b.time - a.time)[0]
  if (!current) return { speedMps: null, speedDeltaMps: null }

  const previousTime = timestampMs(previousSample)
  const previousSpeed = finiteNumber(previousSample?.speedMps)
  const hasRecentPrevious = previousTime !== null
    && previousSpeed !== null
    && previousSpeed >= 0
    && previousTime < startMs
    && current.time > previousTime
    && current.time - previousTime <= GPS_DELTA_MAX_GAP_MS

  return {
    speedMps: current.speed,
    speedDeltaMps: hasRecentPrevious ? current.speed - previousSpeed : null,
  }
}

/**
 * Extract one half-open time window. Inputs and output stay in caller memory;
 * this function performs no persistence, telemetry, logging, or network access.
 * Acceleration axes use Expo's g unit; GPS speed is meters per second. Movement
 * magnitude is a window-centered proxy, not a calibrated clinical measurement.
 */
export function extractSensorWindowFeatures({
  startMs,
  endMs,
  accelerometerSamples = [],
  heartRateSamples = [],
  gpsSamples = [],
  previousGpsSample = null,
}) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new TypeError('A sensor window needs finite startMs and endMs, with endMs after startMs.')
  }

  return {
    ...getHeartRateFeatures(heartRateSamples, startMs, endMs),
    ...getMovementFeatures(accelerometerSamples, startMs, endMs),
    ...getSpeedFeatures(gpsSamples, previousGpsSample, startMs, endMs),
  }
}
