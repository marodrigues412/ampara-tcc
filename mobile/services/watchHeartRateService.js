import { Platform } from 'react-native'
import { EventEmitter } from 'expo-modules-core'
import { getWatchHeartRateModule } from '../modules/ampara-watch'

const MONITOR_STATUS_FRESH_MS = 75 * 1000

let eventEmitter

function getEmitter() {
  const module = getWatchHeartRateModule()
  if (!module) return null
  if (!eventEmitter) eventEmitter = new EventEmitter(module)
  return eventEmitter
}

function normalizeReading(reading) {
  if (!reading) return null
  const bpm = Number(reading.bpm)
  const timestamp = Number(reading.timestamp)
  if (!Number.isFinite(bpm) || bpm <= 0 || !Number.isFinite(timestamp)) return null
  return {
    bpm,
    time: new Date(timestamp).toISOString(),
    source: reading.source || 'Galaxy Watch',
    isDirect: true,
  }
}

function normalizeMotion(reading) {
  if (!reading) return null
  const peak = Number(reading.peak)
  const rms = Number(reading.rms)
  const jerk = Number(reading.jerk)
  const samples = Number(reading.samples)
  const timestamp = Number(reading.timestamp)
  if (![peak, rms, jerk, samples, timestamp].every(Number.isFinite) || timestamp <= 0) return null
  return {
    peak,
    rms,
    jerk,
    samples,
    time: new Date(timestamp).toISOString(),
    source: reading.source || 'Galaxy Watch 5',
    isRecent: Date.now() - timestamp <= 5_000,
  }
}

export async function getDirectWatchStatus() {
  if (Platform.OS !== 'android') return { status: 'unsupported' }
  try {
    const module = getWatchHeartRateModule()
    if (!module) return { status: 'unsupported' }
    return { status: (await module.getConnectionStatus()) ? 'connected' : 'disconnected' }
  } catch (error) {
    const message = String(error?.message || error || '').toLowerCase()
    if (message.includes('native module') || message.includes('could not be found')) {
      return { status: 'development_build_required' }
    }
    return { status: 'error', error }
  }
}

export async function readDirectWatchHeartRate() {
  if (Platform.OS !== 'android') return null
  try {
    const reading = await getWatchHeartRateModule()?.getLatestHeartRate()
    return normalizeReading(reading)
  } catch {
    return null
  }
}

export async function readDirectWatchMotion() {
  if (Platform.OS !== 'android') return null
  try {
    return normalizeMotion(await getWatchHeartRateModule()?.getLatestWatchMotion())
  } catch {
    return null
  }
}

export async function getDirectWatchMonitoringStatus() {
  if (Platform.OS !== 'android') return 'unsupported'
  try {
    const monitorStatus = await getWatchHeartRateModule()?.getMonitorStatus()
    const receivedAt = Number(monitorStatus?.receivedAt)
    const isFresh = Number.isFinite(receivedAt) && Date.now() - receivedAt <= MONITOR_STATUS_FRESH_MS
    return monitorStatus?.active && isFresh ? 'active' : 'inactive'
  } catch {
    return 'inactive'
  }
}

export function subscribeToDirectWatchHeartRate(listener) {
  try {
    const emitter = getEmitter()
    if (!emitter) return () => {}
    const subscription = emitter.addListener('onHeartRate', reading => {
      const normalized = normalizeReading(reading)
      if (normalized) listener(normalized)
    })
    return () => subscription.remove()
  } catch {
    return () => {}
  }
}

export function subscribeToDirectWatchMotion(listener) {
  try {
    const emitter = getEmitter()
    if (!emitter) return () => {}
    const subscription = emitter.addListener('onWatchMotion', reading => {
      const normalized = normalizeMotion(reading)
      if (normalized) listener(normalized)
    })
    return () => subscription.remove()
  } catch {
    return () => {}
  }
}

export function subscribeToDirectWatchMonitoringStatus(listener) {
  try {
    const emitter = getEmitter()
    if (!emitter) return () => {}
    const subscription = emitter.addListener('onMonitorStatus', event => {
      listener(event?.active ? 'active' : 'inactive')
    })
    return () => subscription.remove()
  } catch {
    return () => {}
  }
}
