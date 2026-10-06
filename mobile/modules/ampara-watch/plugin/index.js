const { withAndroidManifest } = require('@expo/config-plugins')

const SERVICE_NAME = 'com.ampara.watch.AmparaHeartRateListenerService'

module.exports = function withAmparaWatch(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest
    const application = manifest.application?.[0]
    if (!application) return mod

    const service = application.service || (application.service = [])
    if (!service.some(item => item.$?.['android:name'] === SERVICE_NAME)) {
      service.push({
        $: {
          'android:name': SERVICE_NAME,
          'android:exported': 'true',
        },
        'intent-filter': [{
          category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
          action: [
            { $: { 'android:name': 'com.google.android.gms.wearable.MESSAGE_RECEIVED' } },
          ],
          data: [{ $: { 'android:scheme': 'wear', 'android:host': '*', 'android:pathPrefix': '/ampara/' } }],
        }],
      })
    }

    const permission = manifest['uses-permission'] || (manifest['uses-permission'] = [])
    if (!permission.some(item => item.$?.['android:name'] === 'android.permission.WAKE_LOCK')) {
      permission.push({ $: { 'android:name': 'android.permission.WAKE_LOCK' } })
    }
    return mod
  })
}
