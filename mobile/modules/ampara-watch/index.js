import { Platform } from 'react-native'
import { requireNativeModule } from 'expo-modules-core'

let nativeModule

function getNativeModule() {
  if (Platform.OS !== 'android') return null
  if (!nativeModule) nativeModule = requireNativeModule('AmparaWatch')
  return nativeModule
}

export function getWatchHeartRateModule() {
  return getNativeModule()
}
