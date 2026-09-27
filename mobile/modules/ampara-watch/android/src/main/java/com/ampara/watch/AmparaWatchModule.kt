package com.ampara.watch

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import androidx.core.content.ContextCompat
import com.google.android.gms.wearable.Wearable
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

class AmparaWatchModule : Module() {
  private var receiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("AmparaWatch")
    Events("onHeartRate", "onMonitorStatus", "onWatchMotion")

    OnStartObserving {
      val context = appContext.reactContext ?: return@OnStartObserving
      if (receiver != null) return@OnStartObserving
      receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
          if (intent.action == AmparaHeartRateListenerService.ACTION_HEART_RATE) {
            val bpm = intent.getIntExtra("bpm", 0)
            val timestamp = intent.getLongExtra("timestamp", 0L)
            if (bpm > 0 && timestamp > 0) sendEvent("onHeartRate", mapOf(
              "bpm" to bpm,
              "timestamp" to timestamp,
              "source" to "Galaxy Watch 5",
            ))
          } else if (intent.action == AmparaHeartRateListenerService.ACTION_MONITOR_STATUS) {
            sendEvent("onMonitorStatus", mapOf(
              "active" to intent.getBooleanExtra("active", false),
              "receivedAt" to intent.getLongExtra("receivedAt", 0L),
            ))
          } else if (intent.action == AmparaHeartRateListenerService.ACTION_WATCH_MOTION) {
            sendEvent("onWatchMotion", mapOf(
              "peak" to intent.getDoubleExtra("peak", 0.0),
              "rms" to intent.getDoubleExtra("rms", 0.0),
              "jerk" to intent.getDoubleExtra("jerk", 0.0),
              "samples" to intent.getIntExtra("samples", 0),
              "timestamp" to intent.getLongExtra("timestamp", 0L),
              "source" to (intent.getStringExtra("source") ?: "Galaxy Watch 5"),
            ))
          }
        }
      }
      ContextCompat.registerReceiver(
        context,
        receiver,
        IntentFilter().apply {
          addAction(AmparaHeartRateListenerService.ACTION_HEART_RATE)
          addAction(AmparaHeartRateListenerService.ACTION_MONITOR_STATUS)
          addAction(AmparaHeartRateListenerService.ACTION_WATCH_MOTION)
        },
        ContextCompat.RECEIVER_NOT_EXPORTED,
      )
    }

    OnStopObserving {
      val context = appContext.reactContext
      receiver?.let { context?.unregisterReceiver(it) }
      receiver = null
    }

    AsyncFunction("getLatestHeartRate") {
      val prefs = appContext.reactContext?.getSharedPreferences(AmparaHeartRateListenerService.PREFS, Context.MODE_PRIVATE)
      val bpm = prefs?.getInt("bpm", 0) ?: 0
      val timestamp = prefs?.getLong("timestamp", 0L) ?: 0L
      if (bpm <= 0 || timestamp <= 0) null else mapOf(
        "bpm" to bpm,
        "timestamp" to timestamp,
        "source" to "Galaxy Watch 5",
      )
    }

    AsyncFunction("getMonitorStatus") {
      val prefs = appContext.reactContext?.getSharedPreferences(AmparaHeartRateListenerService.PREFS, Context.MODE_PRIVATE)
      mapOf(
        "active" to (prefs?.getBoolean(AmparaHeartRateListenerService.MONITORING_ACTIVE, false) ?: false),
        "receivedAt" to (prefs?.getLong(AmparaHeartRateListenerService.MONITOR_STATUS_RECEIVED_AT, 0L) ?: 0L),
      )
    }

    AsyncFunction("getLatestWatchMotion") {
      val prefs = appContext.reactContext?.getSharedPreferences(AmparaHeartRateListenerService.PREFS, Context.MODE_PRIVATE)
      val timestamp = prefs?.getLong(AmparaHeartRateListenerService.MOTION_TIMESTAMP, 0L) ?: 0L
      if (timestamp <= 0L) null else mapOf(
        "peak" to (prefs?.getFloat(AmparaHeartRateListenerService.MOTION_PEAK, 0f) ?: 0f),
        "rms" to (prefs?.getFloat(AmparaHeartRateListenerService.MOTION_RMS, 0f) ?: 0f),
        "jerk" to (prefs?.getFloat(AmparaHeartRateListenerService.MOTION_JERK, 0f) ?: 0f),
        "samples" to (prefs?.getInt(AmparaHeartRateListenerService.MOTION_SAMPLES, 0) ?: 0),
        "timestamp" to timestamp,
        "source" to (prefs?.getString(AmparaHeartRateListenerService.MOTION_SOURCE, "Galaxy Watch 5") ?: "Galaxy Watch 5"),
      )
    }

    AsyncFunction("getConnectionStatus") { promise: expo.modules.kotlin.Promise ->
      val context = appContext.reactContext ?: run {
        promise.resolve(false)
        return@AsyncFunction
      }
      Wearable.getNodeClient(context).connectedNodes
        .addOnSuccessListener { promise.resolve(it.isNotEmpty()) }
        .addOnFailureListener { promise.resolve(false) }
    }
  }
}
