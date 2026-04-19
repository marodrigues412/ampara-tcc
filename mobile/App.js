// App.js
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRiskDetection } from './hooks/useRiskDetection'; // Importa o seu Hook

export default function App() {
  const { data, location, riskStatus, errorMsg } = useRiskDetection();

  return (
    <View style={styles.container}>
      <Text style={styles.header}>AMPARA - Sensor Lab</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Sensores de Movimento:</Text>
        <Text style={styles.data}>X: {x.toFixed(2)} | Y: {y.toFixed(2)} | Z: {z.toFixed(2)}</Text>
        
        <View style={styles.statusBox}>
          <Text style={styles.magnitudeLabel}>Força G Atual:</Text>
          <Text style={[styles.magnitudeValue, { color: magnitude > 1.8 ? '#FF5252' : '#4CAF50' }]}>
            {magnitude}
          </Text>
        </View>
        <Text style={styles.hint}>
          {riskStatus.isHighRisk ? "⚠️ MOVIMENTO BRUSCO DETECTADO" : "✅ STATUS: ESTÁVEL"}
        </Text>
      </View>

      {/* Card de GPS */}
      <View style={styles.card}>
        <Text style={styles.label}>Geolocalização (GPS):</Text>
        {location ? (
          <Text style={styles.geoText}>
            LAT: {location.coords.latitude.toFixed(6)}{"\n"}
            LON: {location.coords.longitude.toFixed(6)}
          </Text>
        ) : (
          <Text style={{color: '#888'}}>{errorMsg || "Sinal GPS..."}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center', padding: 20 },
  header: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 30 },
  card: { backgroundColor: '#1E1E1E', padding: 20, borderRadius: 15, width: '100%', marginBottom: 20, borderWidth: 1, borderColor: '#333' },
  label: { color: '#BB86FC', fontSize: 14, marginBottom: 10, fontWeight: 'bold', textTransform: 'uppercase' },
  data: { color: '#fff', fontFamily: 'monospace' },
  geoText: { color: '#03DAC6', fontSize: 16, fontFamily: 'monospace', lineHeight: 25 },
  statusBox: { flexDirection: 'row', alignItems: 'center', marginTop: 15 },
  magnitudeLabel: { color: '#fff', fontSize: 18 },
  magnitudeValue: { fontSize: 32, fontWeight: 'bold', marginLeft: 10 },
  hint: { color: '#666', marginTop: 10, fontStyle: 'italic' }
});