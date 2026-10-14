import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { appendHeartRateSample } from '../services/heartRateBaseline'
import { getRecentHeartRateSamples } from '../services/riskAssessmentService'
import {
  connectHealthConnect,
  readLatestHeartRate,
} from '../services/healthConnectService'
import {
  getDirectWatchStatus,
  getDirectWatchHeartRateStatus,
  getDirectWatchMonitoringStatus,
  readDirectWatchHeartRate,
  readDirectWatchMotion,
  subscribeToDirectWatchHeartRate,
  subscribeToDirectWatchHeartRateStatus,
  subscribeToDirectWatchMotion,
  subscribeToDirectWatchMonitoringStatus,
} from '../services/watchHeartRateService'

const REFRESH_INTERVAL_MS = 15 * 1000
const LIVE_READING_MS = 10 * 1000

function isLive(measurement) {
  return !!measurement && Date.now() - Date.parse(measurement.time) <= LIVE_READING_MS
}

function getNewestMeasurement(...measurements) {
  return measurements.reduce((newest, candidate) => {
    const candidateTime = Date.parse(candidate?.time)
    if (!Number.isFinite(candidateTime)) return newest
    if (!newest || candidateTime > Date.parse(newest.time)) return candidate
    return newest
  }, null)
}

export function useSmartwatch(userId) {
  const [status, setStatus] = useState('checking')
  const [directWatchStatus, setDirectWatchStatus] = useState('checking')
  const [monitoringStatus, setMonitoringStatus] = useState('checking')
  const [heartRateSensorStatus, setHeartRateSensorStatus] = useState(null)
  const [measurement, setMeasurement] = useState(null)
  const [heartRateSamples, setHeartRateSamples] = useState([])
  const [heartRateHistoryUserId, setHeartRateHistoryUserId] = useState(null)
  const [latestSavedHeartRateAt, setLatestSavedHeartRateAt] = useState(0)
  const [watchMotion, setWatchMotion] = useState(null)
  const [isBusy, setIsBusy] = useState(false)
  const mountedRef = useRef(true)
  const refreshInFlightRef = useRef(false)
  const lastDirectReadingRef = useRef(null)
  const heartRateSamplesRef = useRef([])

  const recordHeartRate = useCallback((reading) => {
    if (!reading?.isDirect) return
    const previous = heartRateSamplesRef.current
    const next = appendHeartRateSample(previous, {
      bpm: reading.bpm,
      timestamp: reading.time,
    })
    const changed = next.length !== previous.length
      || next.some((sample, index) => sample.timestampMs !== previous[index]?.timestampMs
        || sample.bpm !== previous[index]?.bpm)
    if (!changed) return
    heartRateSamplesRef.current = next
    setHeartRateSamples(next)
  }, [])

  const applyResult = useCallback((result) => {
    if (!mountedRef.current) return
    setStatus(result.status)
    if ('measurement' in result) {
      setMeasurement(result.measurement)
      recordHeartRate(result.measurement)
    }
  }, [recordHeartRate])

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current) return null

    refreshInFlightRef.current = true
    setIsBusy(true)
    try {
      const [directReading, directMotion, directStatus, watchMonitoringStatus, sensorStatus] = await Promise.all([
        readDirectWatchHeartRate(),
        readDirectWatchMotion(),
        getDirectWatchStatus(),
        getDirectWatchMonitoringStatus(),
        getDirectWatchHeartRateStatus(),
      ])
      if (mountedRef.current) {
        setDirectWatchStatus(directStatus.status)
        setMonitoringStatus(watchMonitoringStatus)
        setHeartRateSensorStatus(sensorStatus)
        setWatchMotion(directMotion)
      }
      if (directStatus.status === 'connected' && directReading && isLive(directReading)) {
        lastDirectReadingRef.current = directReading
        if (mountedRef.current) setMonitoringStatus('active')
        const result = {
          status: 'connected',
          measurement: { ...directReading, isDirect: true, isRecent: true },
        }
        applyResult(result)
        return result
      }

      const fallback = await readLatestHeartRate()
      const currentDirectReading = lastDirectReadingRef.current
      const preferred = getNewestMeasurement(currentDirectReading, fallback.measurement)
      const status = directStatus.status === 'connected' || fallback.status === 'connected'
        ? 'connected'
        : directStatus.status === 'development_build_required'
          ? 'development_build_required'
          : fallback.status
      const result = {
        ...fallback,
        status,
        measurement: preferred
          ? { ...preferred, isRecent: isLive(preferred) }
          : null,
      }
      applyResult(result)
      return result
    } finally {
      refreshInFlightRef.current = false
      if (mountedRef.current) setIsBusy(false)
    }
  }, [applyResult])

  const checkConnection = useCallback(async () => {
    return refresh()
  }, [refresh])

  const connect = useCallback(async () => {
    setIsBusy(true)
    const result = await connectHealthConnect()
    applyResult(result)

    if (result.status === 'connected') {
      await refresh()
    }

    if (mountedRef.current) setIsBusy(false)
    return result
  }, [applyResult, refresh])

  useEffect(() => {
    mountedRef.current = true
    checkConnection()
    const unsubscribe = subscribeToDirectWatchHeartRate((reading) => {
      lastDirectReadingRef.current = reading
      setDirectWatchStatus('connected')
      setMonitoringStatus('active')
      setHeartRateSensorStatus({ status: 1, time: reading.time })
      applyResult({
        status: 'connected',
        measurement: { ...reading, isDirect: true, isRecent: true },
      })
    })
    const unsubscribeHeartRateStatus = subscribeToDirectWatchHeartRateStatus(setHeartRateSensorStatus)
    const unsubscribeMotion = subscribeToDirectWatchMotion(setWatchMotion)
    const unsubscribeMonitorStatus = subscribeToDirectWatchMonitoringStatus(setMonitoringStatus)

    const appStateSubscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') checkConnection()
    })

    return () => {
      mountedRef.current = false
      unsubscribe()
      unsubscribeHeartRateStatus()
      unsubscribeMotion()
      unsubscribeMonitorStatus()
      appStateSubscription.remove()
    }
  }, [applyResult, checkConnection])

  useEffect(() => {
    let active = true
    let savedAt = 0
    heartRateSamplesRef.current = []

    if (!userId) return () => { active = false }

    getRecentHeartRateSamples(userId)
      .then(samples => {
        if (!active) return
        const stored = appendHeartRateSample(samples, null)
        const merged = appendHeartRateSample([...stored, ...heartRateSamplesRef.current], null)
        heartRateSamplesRef.current = merged
        savedAt = stored.at(-1)?.timestampMs || 0
      })
      .catch(error => console.warn('Não foi possível carregar o histórico de BPM:', error.message))
      .finally(() => {
        if (!active) return
        setHeartRateSamples(appendHeartRateSample(heartRateSamplesRef.current, null))
        setLatestSavedHeartRateAt(savedAt)
        setHeartRateHistoryUserId(userId)
      })

    return () => { active = false }
  }, [userId])

  useEffect(() => {
    const freshnessTimer = setInterval(() => {
      setWatchMotion(current => {
        if (!current?.isRecent || Date.now() - Date.parse(current.time) <= 5_000) return current
        return { ...current, isRecent: false }
      })
    }, 1_000)
    return () => clearInterval(freshnessTimer)
  }, [])

  useEffect(() => {
    if (['unsupported', 'development_build_required'].includes(directWatchStatus)) return undefined
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [directWatchStatus, refresh])

  const heartRateHistoryReady = !userId || heartRateHistoryUserId === userId
  const visibleHeartRateSamples = userId && heartRateHistoryUserId === userId ? heartRateSamples : []

  return {
    status,
    directWatchStatus,
    monitoringStatus,
    heartRateSensorStatus,
    measurement,
    heartRateSamples: visibleHeartRateSamples,
    heartRateHistoryReady,
    latestSavedHeartRateAt: userId && heartRateHistoryUserId === userId ? latestSavedHeartRateAt : 0,
    watchMotion,
    isBusy,
    connect,
    refresh,
  }
}
