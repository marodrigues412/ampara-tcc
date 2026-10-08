export const HEART_RATE_BASELINE_WINDOW_MS = 60 * 60 * 1000
export const HEART_RATE_MAX_AGE_MS = 15 * 1000
export const MIN_HEART_RATE_BASELINE_SAMPLES = 20
const MIN_BASELINE_COVERAGE_MS = HEART_RATE_BASELINE_WINDOW_MS - 60 * 1000

function finiteTimestamp(value) {
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  const timestamp = Number(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function validSample(sample, now) {
  const bpm = Number(sample?.bpm)
  const timestamp = finiteTimestamp(sample?.timestampMs ?? sample?.timestamp ?? sample?.time)
  if (!Number.isFinite(bpm) || bpm < 25 || bpm > 240 || timestamp === null) return null
  if (timestamp > now + 10_000 || timestamp < now - HEART_RATE_BASELINE_WINDOW_MS) return null
  return { bpm, timestampMs: timestamp }
}

export function appendHeartRateSample(samples, reading, now = Date.now()) {
  const cutoff = now - HEART_RATE_BASELINE_WINDOW_MS
  const kept = (samples || [])
    .map(sample => validSample(sample, now))
    .filter(sample => sample && sample.timestampMs >= cutoff)
  const next = validSample(reading, now)
  if (next && !kept.some(sample => sample.timestampMs === next.timestampMs)) kept.push(next)
  kept.sort((a, b) => a.timestampMs - b.timestampMs)
  return kept
}

export function calculateHeartRateBaseline(samples, current, now = Date.now()) {
  const latest = validSample(current, now)
  if (!latest || now - latest.timestampMs > HEART_RATE_MAX_AGE_MS) {
    return { bpm: latest?.bpm ?? null, meanBpm: null, standardDeviationBpm: null, zScore: null, sampleCount: 0, coverageMinutes: 0, available: false }
  }

  const start = latest.timestampMs - HEART_RATE_BASELINE_WINDOW_MS
  const baseline = (samples || [])
    .map(sample => validSample(sample, now))
    .filter(sample => sample && sample.timestampMs >= start && sample.timestampMs < latest.timestampMs)
  const count = baseline.length
  const coverageMs = count ? latest.timestampMs - baseline[0].timestampMs : 0
  const baselineReady = count >= MIN_HEART_RATE_BASELINE_SAMPLES && coverageMs >= MIN_BASELINE_COVERAGE_MS
  if (!baselineReady) {
    return { bpm: latest.bpm, meanBpm: null, standardDeviationBpm: null, zScore: null, sampleCount: count, coverageMinutes: Math.floor(coverageMs / 60_000), baselineReady: false, available: false }
  }

  const meanBpm = baseline.reduce((sum, sample) => sum + sample.bpm, 0) / count
  const variance = baseline.reduce((sum, sample) => sum + ((sample.bpm - meanBpm) ** 2), 0) / count
  const standardDeviationBpm = Math.sqrt(variance)
  const zScore = standardDeviationBpm > 0 ? (latest.bpm - meanBpm) / standardDeviationBpm : null

  return {
    bpm: latest.bpm,
    meanBpm,
    standardDeviationBpm,
    zScore: Number.isFinite(zScore) ? zScore : null,
    sampleCount: count,
    coverageMinutes: Math.floor(coverageMs / 60_000),
    baselineReady: true,
    available: Number.isFinite(zScore),
  }
}
