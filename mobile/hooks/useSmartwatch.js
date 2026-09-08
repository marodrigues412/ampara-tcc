import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import {
  connectHealthConnect,
  getHealthConnectStatus,
  readLatestHeartRate,
} from '../services/healthConnectService'

const REFRESH_INTERVAL_MS = 5 * 1000

export function useSmartwatch() {
  const [status, setStatus] = useState('checking')
  const [measurement, setMeasurement] = useState(null)
  const [isBusy, setIsBusy] = useState(false)
  const mountedRef = useRef(true)
  const refreshInFlightRef = useRef(false)

  const applyResult = useCallback((result) => {
    if (!mountedRef.current) return
    setStatus(result.status)
    if ('measurement' in result) setMeasurement(result.measurement)
  }, [])

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current) return null

    refreshInFlightRef.current = true
    setIsBusy(true)
    try {
      const result = await readLatestHeartRate()
      applyResult(result)
      return result
    } finally {
      refreshInFlightRef.current = false
      if (mountedRef.current) setIsBusy(false)
    }
  }, [applyResult])

  const checkConnection = useCallback(async () => {
    const result = await getHealthConnectStatus()
    applyResult(result)
    if (result.status === 'connected') {
      return refresh()
    }
    return result
  }, [applyResult, refresh])

  const connect = useCallback(async () => {
    setIsBusy(true)
    const result = await connectHealthConnect()
    applyResult(result)

    if (result.status === 'connected') {
      const reading = await readLatestHeartRate()
      applyResult(reading)
    }

    if (mountedRef.current) setIsBusy(false)
    return result
  }, [applyResult])

  useEffect(() => {
    mountedRef.current = true
    checkConnection()

    const appStateSubscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') checkConnection()
    })

    return () => {
      mountedRef.current = false
      appStateSubscription.remove()
    }
  }, [checkConnection])

  useEffect(() => {
    if (status !== 'connected') return undefined
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refresh, status])

  return { status, measurement, isBusy, connect, refresh }
}
