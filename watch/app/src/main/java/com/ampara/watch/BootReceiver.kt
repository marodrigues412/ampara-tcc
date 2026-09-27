package com.ampara.watch

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build

class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
    val heartRatePermission = if (Build.VERSION.SDK_INT >= 36) {
      "android.permission.health.READ_HEART_RATE"
    } else {
      android.Manifest.permission.BODY_SENSORS
    }
    val backgroundSensorPermission = if (Build.VERSION.SDK_INT >= 36) {
      "android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND"
    } else {
      android.Manifest.permission.BODY_SENSORS_BACKGROUND
    }
    if (context.checkSelfPermission(heartRatePermission) != PackageManager.PERMISSION_GRANTED) return
    if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(backgroundSensorPermission) != PackageManager.PERMISSION_GRANTED) return
    val service = Intent(context, HeartRateService::class.java).setAction(HeartRateService.ACTION_START)
    if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(service) else context.startService(service)
  }
}
