const WATCH_MOTION_FRESH_MS = 5_000

export function calculateMotionRiskScore({ phoneMagnitudeG, watchMotion, activityMode = false, now = Date.now() }) {
  const phoneG = Number(phoneMagnitudeG)
  const phonePoints = !Number.isFinite(phoneG)
    ? 0
    : phoneG >= 4 ? 3 : phoneG >= 2.8 ? 2 : 0

  const watchTime = Date.parse(watchMotion?.time)
  const watchAge = now - watchTime
  const watchIsRecent = Number.isFinite(watchTime)
    && watchAge >= 0
    && watchAge <= WATCH_MOTION_FRESH_MS
    && Number(watchMotion?.samples) >= 10
  const peak = Number(watchMotion?.peak)
  const rms = Number(watchMotion?.rms)
  const jerk = Number(watchMotion?.jerk)
  const validWatchMotion = watchIsRecent
    && Number.isFinite(peak)
    && Number.isFinite(rms)
    && Number.isFinite(jerk)

  // Wrist movement has a higher everyday baseline; require a strong peak and jerk,
  // or sustained intensity, and reduce ordinary-motion weight during exercise.
  const watchPoints = !validWatchMotion
    ? 0
    : peak >= 24 && jerk >= 150
      ? 2
      : !activityMode && peak >= 14 && rms >= 4.5
        ? 1
        : 0

  const corroborationPoints = phonePoints > 0 && watchPoints > 0 ? 1 : 0

  return {
    phonePoints,
    watchPoints,
    corroborationPoints,
    total: phonePoints + watchPoints + corroborationPoints,
    watchIsRecent,
  }
}
