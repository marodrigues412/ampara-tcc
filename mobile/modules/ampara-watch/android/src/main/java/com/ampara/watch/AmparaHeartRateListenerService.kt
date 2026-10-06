package com.ampara.watch

import android.content.Intent
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import org.json.JSONObject

class AmparaHeartRateListenerService : WearableListenerService() {
  override fun onMessageReceived(messageEvent: MessageEvent) {
    if (messageEvent.path == MONITOR_STATUS_PATH) {
      try {
        val data = JSONObject(String(messageEvent.data, Charsets.UTF_8))
        saveMonitorStatus(data.optBoolean("active", false))
      } catch (_: Exception) {
        // Ignore malformed monitor-status messages.
      }
      return
    }
    if (messageEvent.path == MOTION_PATH) {
      try {
        val data = JSONObject(String(messageEvent.data, Charsets.UTF_8))
        val peak = data.optDouble("peak", -1.0)
        val rms = data.optDouble("rms", -1.0)
        val jerk = data.optDouble("jerk", -1.0)
        val samples = data.optInt("samples", 0)
        val timestamp = data.optLong("timestamp", 0L)
        val source = data.optString("source", "watch_accelerometer")
        val now = System.currentTimeMillis()
        if (peak !in 0.0..100.0 || rms !in 0.0..100.0 || jerk !in 0.0..3000.0 || samples !in 1..1000) return
        if (timestamp <= 0 || timestamp > now + 10_000 || now - timestamp > MOTION_MAX_AGE_MS) return

        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
          .putFloat(MOTION_PEAK, peak.toFloat())
          .putFloat(MOTION_RMS, rms.toFloat())
          .putFloat(MOTION_JERK, jerk.toFloat())
          .putInt(MOTION_SAMPLES, samples)
          .putLong(MOTION_TIMESTAMP, timestamp)
          .putString(MOTION_SOURCE, source)
          .apply()
        sendBroadcast(Intent(ACTION_WATCH_MOTION).setPackage(packageName)
          .putExtra("peak", peak)
          .putExtra("rms", rms)
          .putExtra("jerk", jerk)
          .putExtra("samples", samples)
          .putExtra("timestamp", timestamp)
          .putExtra("source", source))
      } catch (_: Exception) {
        // Ignore malformed motion windows.
      }
      return
    }
    if (messageEvent.path != HEART_RATE_PATH) return
    try {
      val data = JSONObject(String(messageEvent.data, Charsets.UTF_8))
      val bpm = data.optInt("bpm", 0)
      val timestamp = data.optLong("timestamp", 0L)
      val now = System.currentTimeMillis()
      if (bpm !in 25..240 || timestamp <= 0 || timestamp > now + 10_000 || now - timestamp > 30_000) return

      saveHeartRate(bpm, timestamp)
    } catch (_: Exception) {
      // Ignore malformed or incomplete wearable payloads.
    }
  }

  private fun saveMonitorStatus(active: Boolean) {
    val receivedAt = System.currentTimeMillis()
    getSharedPreferences(PREFS, MODE_PRIVATE).edit()
      .putBoolean(MONITORING_ACTIVE, active)
      .putLong(MONITOR_STATUS_RECEIVED_AT, receivedAt)
      .apply()
    sendBroadcast(Intent(ACTION_MONITOR_STATUS).setPackage(packageName)
      .putExtra("active", active)
      .putExtra("receivedAt", receivedAt))
  }

  private fun saveHeartRate(bpm: Int, timestamp: Long) {
    val now = System.currentTimeMillis()
    if (bpm !in 25..240 || timestamp <= 0 || timestamp > now + 10_000 || now - timestamp > 30_000) return
    getSharedPreferences(PREFS, MODE_PRIVATE).edit()
      .putInt("bpm", bpm)
      .putLong("timestamp", timestamp)
      .apply()
    sendBroadcast(Intent(ACTION_HEART_RATE).setPackage(packageName)
      .putExtra("bpm", bpm)
      .putExtra("timestamp", timestamp))
  }

  companion object {
    const val HEART_RATE_PATH = "/ampara/heart-rate"
    const val MONITOR_STATUS_PATH = "/ampara/monitor-status"
    const val MOTION_PATH = "/ampara/watch-motion"
    const val ACTION_HEART_RATE = "com.ampara.watch.HEART_RATE"
    const val ACTION_MONITOR_STATUS = "com.ampara.watch.MONITOR_STATUS"
    const val ACTION_WATCH_MOTION = "com.ampara.watch.MOTION"
    const val PREFS = "ampara_watch_heart_rate"
    const val MONITORING_ACTIVE = "monitoring_active"
    const val MONITOR_STATUS_RECEIVED_AT = "monitor_status_received_at"
    const val MOTION_PEAK = "motion_peak"
    const val MOTION_RMS = "motion_rms"
    const val MOTION_JERK = "motion_jerk"
    const val MOTION_SAMPLES = "motion_samples"
    const val MOTION_TIMESTAMP = "motion_timestamp"
    const val MOTION_SOURCE = "motion_source"
    const val MOTION_MAX_AGE_MS = 15_000L
  }
}
