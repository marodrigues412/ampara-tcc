import { Platform } from 'react-native'

const HEART_RATE_PERMISSION = { accessType: 'read', recordType: 'HeartRate' }
const HEART_RATE_LOOKBACK_MS = 6 * 60 * 60 * 1000
const RECENT_READING_MS = 60 * 1000

let healthConnectModulePromise = null

function loadHealthConnectModule() {
  if (!healthConnectModulePromise) {
    healthConnectModulePromise = import('react-native-health-connect')
  }
  return healthConnectModulePromise
}

function hasHeartRatePermission(permissions = []) {
  return permissions.some(
    permission => permission.accessType === 'read' && permission.recordType === 'HeartRate'
  )
}

function isNativeModuleMissing(error) {
  const message = String(error?.message || error || '').toLowerCase()
  return message.includes("doesn't seem to be linked") ||
    message.includes('could not be found') ||
    message.includes('expo go') ||
    message.includes('healthconnect') && message.includes('native module')
}

function getSourceLabel(record) {
  const device = record?.metadata?.device
  const deviceLabel = [device?.manufacturer, device?.model].filter(Boolean).join(' ')
  if (deviceLabel) return deviceLabel

  const dataOrigin = record?.metadata?.dataOrigin || ''
  if (dataOrigin.includes('shealth')) return 'Samsung Health'
  if (dataOrigin.includes('google')) return 'Health Connect'
  return 'Smartwatch'
}

export async function getHealthConnectStatus() {
  if (Platform.OS !== 'android') {
    return { status: 'unsupported' }
  }

  try {
    const healthConnect = await loadHealthConnectModule()
    const sdkStatus = await healthConnect.getSdkStatus()

    if (sdkStatus === healthConnect.SdkAvailabilityStatus.SDK_UNAVAILABLE) {
      return { status: 'unavailable' }
    }

    if (sdkStatus === healthConnect.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
      return { status: 'update_required' }
    }

    const initialized = await healthConnect.initialize()
    if (!initialized) return { status: 'unavailable' }

    const permissions = await healthConnect.getGrantedPermissions()
    return {
      status: hasHeartRatePermission(permissions) ? 'connected' : 'permission_required',
    }
  } catch (error) {
    if (isNativeModuleMissing(error)) {
      return { status: 'development_build_required' }
    }
    return { status: 'error', error }
  }
}

export async function connectHealthConnect() {
  const currentStatus = await getHealthConnectStatus()
  if (currentStatus.status !== 'permission_required') return currentStatus

  try {
    const healthConnect = await loadHealthConnectModule()
    const grantedPermissions = await healthConnect.requestPermission([HEART_RATE_PERMISSION])
    return {
      status: hasHeartRatePermission(grantedPermissions) ? 'connected' : 'permission_required',
    }
  } catch (error) {
    if (isNativeModuleMissing(error)) {
      return { status: 'development_build_required' }
    }
    return { status: 'error', error }
  }
}

export async function readLatestHeartRate() {
  const connection = await getHealthConnectStatus()
  if (connection.status !== 'connected') {
    return { ...connection, measurement: null }
  }

  try {
    const healthConnect = await loadHealthConnectModule()
    const endTime = new Date()
    const startTime = new Date(endTime.getTime() - HEART_RATE_LOOKBACK_MS)
    const { records = [] } = await healthConnect.readRecords('HeartRate', {
      timeRangeFilter: {
        operator: 'between',
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      },
      ascendingOrder: false,
      pageSize: 1000,
    })

    const samples = records.flatMap(record =>
      (record.samples || []).map(sample => ({
        bpm: Number(sample.beatsPerMinute),
        time: sample.time,
        source: getSourceLabel(record),
      }))
    )
      .filter(sample => Number.isFinite(sample.bpm) && !Number.isNaN(Date.parse(sample.time)))
      .sort((a, b) => Date.parse(b.time) - Date.parse(a.time))

    const measurement = samples[0] || null
    return {
      status: 'connected',
      measurement: measurement
        ? {
            ...measurement,
            isRecent: endTime.getTime() - Date.parse(measurement.time) <= RECENT_READING_MS,
          }
        : null,
    }
  } catch (error) {
    return { status: 'error', error, measurement: null }
  }
}
