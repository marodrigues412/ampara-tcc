package com.ampara.watch

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.Handler
import android.os.Looper
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import com.google.android.gms.wearable.Wearable
import com.samsung.android.service.health.tracking.ConnectionListener
import com.samsung.android.service.health.tracking.HealthTracker
import com.samsung.android.service.health.tracking.HealthTrackerException
import com.samsung.android.service.health.tracking.HealthTrackingService
import com.samsung.android.service.health.tracking.data.DataPoint
import com.samsung.android.service.health.tracking.data.HealthTrackerType
import com.samsung.android.service.health.tracking.data.ValueKey
import org.json.JSONObject

class HeartRateService : Service() {
  private var healthService: HealthTrackingService? = null
  private var tracker: HealthTracker? = null
  private var sensorManager: SensorManager? = null
  private var motionSensor: Sensor? = null
  private var motionSensorRegistered = false
  private var motionSource = "linear_acceleration"
  private val gravity = FloatArray(3)
  private var hasGravityEstimate = false
  private var lastMotionVector = FloatArray(3)
  private var lastMotionTimestampNs = 0L
  private var motionWindowStartedAt = 0L
  private var motionSampleCount = 0
  private var motionSquaredSum = 0.0
  private var motionPeak = 0.0
  private var motionJerkPeak = 0.0
  private val flushHandler = Handler(Looper.getMainLooper())
  private val flushTask = object : Runnable {
    override fun run() {
      tracker?.let {
        it.flush()
        sendMonitorStatus(true)
      }
      flushHandler.postDelayed(this, FLUSH_INTERVAL_MS)
    }
  }
  private val motionFlushTask = object : Runnable {
    override fun run() {
      flushMotionWindow()
      flushHandler.postDelayed(this, MOTION_WINDOW_MS)
    }
  }
  private var lastMonitorStatusSentAt = 0L

  override fun onCreate() {
    super.onCreate()
    startForeground(NOTIFICATION_ID, createNotification())
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopTracking()
      stopSelf()
      return START_NOT_STICKY
    }
    connectSensor()
    return START_STICKY
  }

  private fun connectSensor() {
    if (healthService != null) return
    healthService = HealthTrackingService(object : ConnectionListener {
      override fun onConnectionSuccess() {
        try {
          val capability = healthService?.trackingCapability
          if (capability?.supportHealthTrackerTypes?.contains(HealthTrackerType.HEART_RATE_CONTINUOUS) != true) {
            sendMonitorStatus(false)
            updateNotification("Sensor contínuo indisponível")
            return
          }
          tracker = healthService?.getHealthTracker(HealthTrackerType.HEART_RATE_CONTINUOUS)?.also {
            it.setEventListener(trackerListener)
          }
          if (tracker == null) {
            sendMonitorStatus(false)
            updateNotification("Não foi possível iniciar o sensor")
            return
          }
          startMotionTracking()
          sendMonitorStatus(true)
          flushHandler.removeCallbacks(flushTask)
          flushHandler.postDelayed(flushTask, FLUSH_INTERVAL_MS)
          updateNotification("Monitoramento automático ativo")
        } catch (_: HealthTrackerException) {
          updateNotification("Verifique o Samsung Health Monitor")
        } catch (_: Exception) {
          updateNotification("Não foi possível iniciar o sensor")
        }
      }

      override fun onConnectionEnded() {
        stopMotionTracking()
        tracker?.unsetEventListener()
        tracker = null
        healthService = null
        sendMonitorStatus(false)
        updateNotification("Reconectando ao sensor")
      }

      override fun onConnectionFailed(exception: HealthTrackerException) {
        sendMonitorStatus(false)
        updateNotification("Abra o Samsung Health Monitor")
      }
    }, this).also { it.connectService() }
  }

  private val motionListener = object : SensorEventListener {
    override fun onSensorChanged(event: SensorEvent) {
      val values = event.values
      val linear = FloatArray(3)
      if (event.sensor.type == Sensor.TYPE_LINEAR_ACCELERATION) {
        for (axis in 0..2) linear[axis] = values[axis]
      } else {
        if (!hasGravityEstimate) {
          for (axis in 0..2) gravity[axis] = values[axis]
          hasGravityEstimate = true
          return
        }
        for (axis in 0..2) {
          gravity[axis] = GRAVITY_FILTER_ALPHA * gravity[axis] + (1f - GRAVITY_FILTER_ALPHA) * values[axis]
          linear[axis] = values[axis] - gravity[axis]
        }
      }

      val magnitude = kotlin.math.sqrt(
        (linear[0] * linear[0] + linear[1] * linear[1] + linear[2] * linear[2]).toDouble(),
      )
      val previousTimestampNs = lastMotionTimestampNs
      if (previousTimestampNs > 0L && event.timestamp > previousTimestampNs) {
        val deltaSeconds = (event.timestamp - previousTimestampNs) / 1_000_000_000.0
        val deltaX = linear[0] - lastMotionVector[0]
        val deltaY = linear[1] - lastMotionVector[1]
        val deltaZ = linear[2] - lastMotionVector[2]
        val jerk = kotlin.math.sqrt((deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ).toDouble()) / deltaSeconds
        motionJerkPeak = maxOf(motionJerkPeak, jerk)
      }
      for (axis in 0..2) lastMotionVector[axis] = linear[axis]
      lastMotionTimestampNs = event.timestamp

      val now = System.currentTimeMillis()
      if (motionWindowStartedAt == 0L) motionWindowStartedAt = now
      if (now - motionWindowStartedAt >= MOTION_WINDOW_MS) flushMotionWindow()
      motionSampleCount += 1
      motionSquaredSum += magnitude * magnitude
      motionPeak = maxOf(motionPeak, magnitude)
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
  }

  private fun startMotionTracking() {
    if (motionSensorRegistered) return
    val manager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
    val sensor = manager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)
      ?: manager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
      ?: return
    sensorManager = manager
    motionSensor = sensor
    motionSource = if (sensor.type == Sensor.TYPE_LINEAR_ACCELERATION) "linear_acceleration" else "accelerometer_gravity_filtered"
    hasGravityEstimate = false
    lastMotionTimestampNs = 0L
    motionWindowStartedAt = System.currentTimeMillis()
    motionSensorRegistered = manager.registerListener(motionListener, sensor, SensorManager.SENSOR_DELAY_GAME)
    if (motionSensorRegistered) flushHandler.postDelayed(motionFlushTask, MOTION_WINDOW_MS)
  }

  private fun stopMotionTracking() {
    flushHandler.removeCallbacks(motionFlushTask)
    if (motionSensorRegistered) sensorManager?.unregisterListener(motionListener)
    motionSensorRegistered = false
    motionSensor = null
    sensorManager = null
    motionWindowStartedAt = 0L
    motionSampleCount = 0
    motionSquaredSum = 0.0
    motionPeak = 0.0
    motionJerkPeak = 0.0
    lastMotionTimestampNs = 0L
  }

  private fun flushMotionWindow() {
    val count = motionSampleCount
    if (count > 0) {
      sendMotionWindow(
        peak = motionPeak,
        rms = kotlin.math.sqrt(motionSquaredSum / count),
        jerkPeak = motionJerkPeak,
        sampleCount = count,
        timestamp = System.currentTimeMillis(),
        source = motionSource,
      )
    }
    motionWindowStartedAt = System.currentTimeMillis()
    motionSampleCount = 0
    motionSquaredSum = 0.0
    motionPeak = 0.0
    motionJerkPeak = 0.0
  }

  private fun sendMotionWindow(peak: Double, rms: Double, jerkPeak: Double, sampleCount: Int, timestamp: Long, source: String) {
    val client = Wearable.getNodeClient(this)
    client.connectedNodes.addOnSuccessListener { nodes ->
      val payload = JSONObject()
        .put("peak", peak)
        .put("rms", rms)
        .put("jerk", jerkPeak)
        .put("samples", sampleCount)
        .put("timestamp", timestamp)
        .put("source", source)
        .toString()
        .toByteArray(Charsets.UTF_8)
      nodes.forEach { node -> Wearable.getMessageClient(this).sendMessage(node.id, MOTION_PATH, payload) }
    }
  }

  private val trackerListener = object : HealthTracker.TrackerEventListener {
    override fun onDataReceived(data: List<DataPoint>) {
      data.forEach { point ->
        val bpm = point.getValue(ValueKey.HeartRateSet.HEART_RATE) ?: 0
        val timestamp = point.timestamp
        if (bpm in 25..240 && timestamp > 0) {
          sendBroadcast(Intent(ACTION_HEART_RATE).setPackage(packageName).putExtra("bpm", bpm))
          sendToPhone(bpm, timestamp)
        }
      }
    }

    override fun onFlushCompleted() = Unit

    override fun onError(error: HealthTracker.TrackerError) {
      stopTracking()
      val message = if (error == HealthTracker.TrackerError.SDK_POLICY_ERROR) {
        "Ative o modo de desenvolvedor do Sensor Service"
      } else {
        "Permita sensores corporais no relogio"
      }
      updateNotification(message)
    }
  }

  private fun sendToPhone(bpm: Int, timestamp: Long) {
    val client = Wearable.getNodeClient(this)
    client.connectedNodes.addOnSuccessListener { nodes ->
      val payload = JSONObject().put("bpm", bpm).put("timestamp", timestamp).toString().toByteArray(Charsets.UTF_8)
      nodes.forEach { node -> Wearable.getMessageClient(this).sendMessage(node.id, HEART_RATE_PATH, payload) }
    }
  }

  private fun sendMonitorStatus(active: Boolean) {
    val now = System.currentTimeMillis()
    if (active) {
      if (now - lastMonitorStatusSentAt < STATUS_HEARTBEAT_MS) return
      lastMonitorStatusSentAt = now
    } else {
      lastMonitorStatusSentAt = 0L
    }
    val client = Wearable.getNodeClient(this)
    client.connectedNodes.addOnSuccessListener { nodes ->
      val payload = JSONObject().put("active", active).toString().toByteArray(Charsets.UTF_8)
      nodes.forEach { node -> Wearable.getMessageClient(this).sendMessage(node.id, MONITOR_STATUS_PATH, payload) }
    }
  }

  private fun createNotification(): Notification {
    if (Build.VERSION.SDK_INT >= 26) {
      val manager = getSystemService(NotificationManager::class.java)
      manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Monitoramento cardíaco", NotificationManager.IMPORTANCE_LOW))
    }
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL_ID) else Notification.Builder(this)
    return builder.setContentTitle("Ampara")
      .setContentText("Iniciando monitoramento cardíaco")
      .setSmallIcon(android.R.drawable.ic_lock_idle_charging)
      .setOngoing(true)
      .build()
  }

  private fun updateNotification(text: String) {
    createNotification()
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL_ID) else Notification.Builder(this)
    val notification = builder.setContentTitle("Ampara").setContentText(text)
      .setSmallIcon(android.R.drawable.ic_lock_idle_charging).setOngoing(true).build()
    getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification)
  }

  private fun stopTracking() {
    sendMonitorStatus(false)
    stopMotionTracking()
    flushHandler.removeCallbacks(flushTask)
    tracker?.unsetEventListener()
    tracker = null
    healthService?.disconnectService()
    healthService = null
  }

  override fun onDestroy() {
    stopTracking()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  companion object {
    const val ACTION_START = "com.ampara.watch.START"
    const val ACTION_STOP = "com.ampara.watch.STOP"
    const val ACTION_HEART_RATE = "com.ampara.watch.HEART_RATE"
    const val HEART_RATE_PATH = "/ampara/heart-rate"
    const val MONITOR_STATUS_PATH = "/ampara/monitor-status"
    const val MOTION_PATH = "/ampara/watch-motion"
    private const val CHANNEL_ID = "ampara-heart-rate"
    private const val NOTIFICATION_ID = 57
    private const val FLUSH_INTERVAL_MS = 5_000L
    private const val STATUS_HEARTBEAT_MS = 30_000L
    private const val MOTION_WINDOW_MS = 1_000L
    private const val GRAVITY_FILTER_ALPHA = 0.8f
  }
}
