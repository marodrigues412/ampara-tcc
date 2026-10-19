package com.ampara.watch

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Handler
import android.os.HandlerThread
import android.os.PowerManager
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import com.google.android.gms.wearable.Wearable
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

class AmparaWatchModule : Module() {
  private var receiver: BroadcastReceiver? = null

  // Monitoramento com o app em segundo plano. Os timers do JS param quando a Activity
  // pausa (JavaTimerManager) e dependem do Choreographer, que não anda com a tela apagada.
  // Então o relógio do caminho crítico (nível sustentado, contagem, envio) vem daqui:
  // um tique por segundo numa thread própria, com wake lock parcial para a CPU não dormir.
  // A headless task que nunca termina mantém os demais timers do JS vivos quando dá.
  // Quem mantém o processo vivo é o serviço em primeiro plano do expo-location.
  private var wakeLock: PowerManager.WakeLock? = null
  private var tickThread: HandlerThread? = null
  private var tickHandler: Handler? = null
  private var headlessTaskId: Int? = null

  private fun startKeepAlive(intervalMs: Long) {
    val context = appContext.reactContext ?: return
    if (tickHandler != null) return

    val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Ampara:Monitoramento").apply {
      setReferenceCounted(false)
      acquire()
    }

    val thread = HandlerThread("AmparaMonitorTick").apply { start() }
    val handler = Handler(thread.looper)
    tickThread = thread
    tickHandler = handler
    val tick = object : Runnable {
      override fun run() {
        sendEvent("onMonitorTick", mapOf("t" to System.currentTimeMillis()))
        handler.postDelayed(this, intervalMs)
      }
    }
    handler.post(tick)

    val reactContext = context as? ReactContext ?: return
    UiThreadUtil.runOnUiThread {
      try {
        headlessTaskId = HeadlessJsTaskContext.getInstance(reactContext)
          .startTask(HeadlessJsTaskConfig(MONITOR_TASK, Arguments.createMap(), 0, true))
      } catch (error: Exception) {
        headlessTaskId = null
      }
    }
  }

  private fun stopKeepAlive() {
    tickHandler?.removeCallbacksAndMessages(null)
    tickThread?.quitSafely()
    tickHandler = null
    tickThread = null
    if (wakeLock?.isHeld == true) wakeLock?.release()
    wakeLock = null

    val taskId = headlessTaskId ?: return
    headlessTaskId = null
    val reactContext = appContext.reactContext as? ReactContext ?: return
    UiThreadUtil.runOnUiThread {
      val tasks = HeadlessJsTaskContext.getInstance(reactContext)
      if (tasks.isTaskRunning(taskId)) tasks.finishTask(taskId)
    }
  }

  companion object {
    // Precisa bater com o AppRegistry.registerHeadlessTask do App.js.
    const val MONITOR_TASK = "AmparaMonitor"
  }

  override fun definition() = ModuleDefinition {
    Name("AmparaWatch")
    Events("onHeartRate", "onMonitorStatus", "onHeartRateStatus", "onWatchMotion", "onMonitorTick")

    Function("startBackgroundKeepAlive") { intervalMs: Int -> startKeepAlive(intervalMs.toLong().coerceAtLeast(250L)) }
    Function("stopBackgroundKeepAlive") { stopKeepAlive() }

    OnDestroy { stopKeepAlive() }

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
          } else if (intent.action == AmparaHeartRateListenerService.ACTION_HEART_RATE_STATUS) {
            sendEvent("onHeartRateStatus", mapOf(
              "status" to intent.getIntExtra("status", 0),
              "timestamp" to intent.getLongExtra("timestamp", 0L),
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
          addAction(AmparaHeartRateListenerService.ACTION_HEART_RATE_STATUS)
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

    AsyncFunction("getHeartRateStatus") {
      val prefs = appContext.reactContext?.getSharedPreferences(AmparaHeartRateListenerService.PREFS, Context.MODE_PRIVATE)
      mapOf(
        "status" to (prefs?.getInt(AmparaHeartRateListenerService.HEART_RATE_STATUS, 0) ?: 0),
        "timestamp" to (prefs?.getLong(AmparaHeartRateListenerService.HEART_RATE_STATUS_TIMESTAMP, 0L) ?: 0L),
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
        .addOnSuccessListener { nodes -> promise.resolve(nodes.any { it.isNearby }) }
        .addOnFailureListener { promise.resolve(false) }
    }
  }
}
