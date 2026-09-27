package com.ampara.watch

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.BroadcastReceiver
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat

class MainActivity : Activity() {
  private lateinit var statusText: TextView
  private lateinit var heartText: TextView
  private lateinit var monitorButton: Button
  private var waitingForBackgroundPermission = false
  private val heartRateReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: android.content.Context, intent: Intent) {
      val bpm = intent.getIntExtra("bpm", 0)
      if (bpm > 0) {
        heartText.text = "$bpm"
        statusText.text = "Leitura recebida agora"
        monitorButton.text = "MONITORAMENTO ATIVO"
        monitorButton.background = roundedBackground(COLOR_SURFACE_ACTIVE, dp(24))
        monitorButton.setTextColor(COLOR_GREEN)
      }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    window.statusBarColor = COLOR_BACKGROUND
    window.navigationBarColor = COLOR_BACKGROUND
    window.decorView.setBackgroundColor(COLOR_BACKGROUND)

    statusText = TextView(this).apply {
      text = "Ative para iniciar a leitura"
      textSize = 10f
      setTextColor(COLOR_MUTED)
      gravity = Gravity.CENTER
      maxLines = 2
      includeFontPadding = false
    }
    heartText = TextView(this).apply {
      text = "--"
      textSize = 40f
      setTextColor(COLOR_BLUE)
      typeface = Typeface.create("sans-serif", Typeface.NORMAL)
      gravity = Gravity.CENTER
      includeFontPadding = false
      contentDescription = "Frequência cardíaca"
    }
    val title = TextView(this).apply {
      text = "AMPARA"
      textSize = 12f
      setTextColor(COLOR_BLUE)
      typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
      gravity = Gravity.CENTER
    }
    val brandLogo = ImageView(this).apply {
      setImageResource(R.drawable.ampara_brand)
      scaleType = ImageView.ScaleType.FIT_CENTER
      contentDescription = "Logo Ampara"
    }
    val brand = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
      addView(brandLogo, LinearLayout.LayoutParams(dp(52), dp(38)))
      addView(title, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(38)).apply {
        leftMargin = dp(5)
      })
    }
    val heartIcon = TextView(this).apply {
      text = "\u2665\uFE0E"
      textSize = 20f
      setTextColor(COLOR_ROSE)
      gravity = Gravity.CENTER
      contentDescription = ""
    }
    val unit = TextView(this).apply {
      text = "bpm"
      textSize = 13f
      setTextColor(COLOR_MUTED)
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(3), dp(12), 0, 0)
    }
    val reading = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
      addView(heartIcon, LinearLayout.LayoutParams(dp(25), dp(44)))
      addView(heartText, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(46)))
      addView(unit, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(42)))
    }
    val caption = TextView(this).apply {
      text = "FREQUÊNCIA CARDÍACA"
      textSize = 8f
      setTextColor(COLOR_MUTED)
      gravity = Gravity.CENTER
    }
    monitorButton = Button(this).apply {
      text = "ATIVAR MONITORAMENTO"
      textSize = 10f
      isAllCaps = false
      isSingleLine = true
      typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
      setTextColor(COLOR_WHITE)
      minWidth = 0
      minimumWidth = 0
      minHeight = dp(34)
      minimumHeight = dp(34)
      setPadding(dp(5), 0, dp(5), 0)
      background = roundedBackground(COLOR_BLUE, dp(22))
      stateListAnimator = null
      setOnClickListener { requestSensorPermissions() }
    }
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(dp(36), dp(4), dp(36), dp(4))
      addView(brand, centeredParams(dp(40), dp(0)))
      addView(reading, centeredParams(dp(46), dp(3)))
      addView(caption, centeredParams(dp(13), dp(0)))
      addView(statusText, centeredParams(dp(24), dp(3)))
      addView(monitorButton, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(36)).apply {
        topMargin = dp(4)
      })
    }
    setContentView(root)
  }

  override fun onStart() {
    super.onStart()
    ContextCompat.registerReceiver(
      this,
      heartRateReceiver,
      IntentFilter(HeartRateService.ACTION_HEART_RATE),
      ContextCompat.RECEIVER_NOT_EXPORTED,
    )
  }

  override fun onStop() {
    unregisterReceiver(heartRateReceiver)
    super.onStop()
  }

  private fun requestSensorPermissions() {
    if (checkSelfPermission(heartRatePermission()) == PackageManager.PERMISSION_GRANTED) {
      requestBackgroundPermission()
    } else {
      requestPermissions(arrayOf(heartRatePermission()), SENSOR_PERMISSION_REQUEST)
    }
  }

  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode == SENSOR_PERMISSION_REQUEST && grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
      requestBackgroundPermission()
    } else if (requestCode == SENSOR_PERMISSION_REQUEST) {
      statusText.text = "Permita os sensores corporais para monitorar."
    } else if (requestCode == BACKGROUND_PERMISSION_REQUEST && grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
      startMonitoring()
    } else if (requestCode == BACKGROUND_PERMISSION_REQUEST) {
      showBackgroundPermissionSettings()
    }
  }

  private fun requestBackgroundPermission() {
    if (Build.VERSION.SDK_INT < 33 || checkSelfPermission(backgroundSensorPermission()) == PackageManager.PERMISSION_GRANTED) {
      startMonitoring()
      return
    }

    if (Build.VERSION.SDK_INT >= 36) {
      requestPermissions(arrayOf(backgroundSensorPermission()), BACKGROUND_PERMISSION_REQUEST)
      return
    }

    showBackgroundPermissionSettings()
  }

  private fun showBackgroundPermissionSettings() {
    AlertDialog.Builder(this)
      .setTitle("Permitir monitoramento contínuo")
      .setMessage("Para continuar lendo os batimentos com a tela apagada, abra as permissões do Ampara e permita sensores corporais em segundo plano.")
      .setPositiveButton("Abrir permissões") { _, _ ->
        waitingForBackgroundPermission = true
        startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
      }
      .setNegativeButton("Agora não", null)
      .show()
  }

  override fun onResume() {
    super.onResume()
    if (!waitingForBackgroundPermission) return
    waitingForBackgroundPermission = false
    if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(backgroundSensorPermission()) == PackageManager.PERMISSION_GRANTED) {
      startMonitoring()
    } else {
      statusText.text = "Permita sensores em segundo plano para manter a leitura com a tela apagada."
    }
  }

  private fun heartRatePermission() = if (Build.VERSION.SDK_INT >= 36) {
    HEALTH_READ_HEART_RATE
  } else {
    Manifest.permission.BODY_SENSORS
  }

  private fun backgroundSensorPermission() = if (Build.VERSION.SDK_INT >= 36) {
    HEALTH_READ_BACKGROUND
  } else {
    Manifest.permission.BODY_SENSORS_BACKGROUND
  }

  private fun startMonitoring() {
    val service = Intent(this, HeartRateService::class.java).setAction(HeartRateService.ACTION_START)
    if (Build.VERSION.SDK_INT >= 26) startForegroundService(service) else startService(service)
    statusText.text = "Monitoramento automático ativo"
    monitorButton.text = "AGUARDANDO LEITURA"
    monitorButton.background = roundedBackground(COLOR_SURFACE_ACTIVE, dp(22))
    monitorButton.setTextColor(COLOR_GREEN)
  }

  private fun centeredParams(height: Int, topMargin: Int) = LinearLayout.LayoutParams(
    ViewGroup.LayoutParams.WRAP_CONTENT,
    height,
  ).apply {
    gravity = Gravity.CENTER_HORIZONTAL
    this.topMargin = topMargin
  }

  private fun roundedBackground(color: Int, radius: Int) = GradientDrawable().apply {
    setColor(color)
    cornerRadius = radius.toFloat()
  }

  private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

  companion object {
    private const val COLOR_BACKGROUND = 0xFFF5F7FA.toInt()
    private const val COLOR_BLUE = 0xFF1B3A6B.toInt()
    private const val COLOR_WHITE = 0xFFFFFFFF.toInt()
    private const val COLOR_SURFACE_ACTIVE = 0xFFEAF5EC.toInt()
    private const val COLOR_GREEN = 0xFF218739.toInt()
    private const val COLOR_ROSE = 0xFFC4687A.toInt()
    private const val COLOR_MUTED = 0xFF526170.toInt()
    private const val SENSOR_PERMISSION_REQUEST = 42
    private const val BACKGROUND_PERMISSION_REQUEST = 43
    private const val HEALTH_READ_HEART_RATE = "android.permission.health.READ_HEART_RATE"
    private const val HEALTH_READ_BACKGROUND = "android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND"
  }
}
