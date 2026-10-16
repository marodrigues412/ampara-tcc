export const PHONE_MOTION_WINDOW_MS = 2_560

export function appendPhoneMotionSample(samples, magnitudeG, timestampMs = Date.now()) {
  const magnitude = Number(magnitudeG)
  if (!Number.isFinite(magnitude) || !Number.isFinite(timestampMs)) return samples || []

  const cutoff = timestampMs - PHONE_MOTION_WINDOW_MS
  return [...(samples || []).filter(sample => sample.timestampMs >= cutoff), { magnitudeG: magnitude, timestampMs }]
}

export function summarizePhoneMotionWindow(samples) {
  const valid = (samples || []).filter(sample => Number.isFinite(sample.magnitudeG) && Number.isFinite(sample.timestampMs))
  if (!valid.length) return null

  const meanMagnitudeG = valid.reduce((sum, sample) => sum + sample.magnitudeG, 0) / valid.length
  const variance = valid.reduce((sum, sample) => sum + ((sample.magnitudeG - meanMagnitudeG) ** 2), 0) / valid.length
  let jerkGPerSecond = 0
  for (let index = 1; index < valid.length; index += 1) {
    const elapsedSeconds = (valid[index].timestampMs - valid[index - 1].timestampMs) / 1000
    if (elapsedSeconds <= 0) continue
    jerkGPerSecond = Math.max(
      jerkGPerSecond,
      Math.abs(valid[index].magnitudeG - valid[index - 1].magnitudeG) / elapsedSeconds,
    )
  }

  return {
    meanMagnitudeG,
    stdDevMagnitudeG: Math.sqrt(variance),
    peakMagnitudeG: Math.max(...valid.map(sample => sample.magnitudeG)),
    jerkGPerSecond,
    sampleCount: valid.length,
    durationMs: Math.max(0, valid.at(-1).timestampMs - valid[0].timestampMs),
  }
}
