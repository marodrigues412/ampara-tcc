// App.js
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRiskDetection } from './hooks/useRiskDetection'; // Importa o seu Hook

export default function App() {
  const { data, location, riskStatus, errorMsg } = useRiskDetection();

  return (
    <View style={styles.container}>
      <Text style={styles.header}>AMPARA - Sensor Lab</Text>

      {/* Card de Movimento */}
      <View style={styles.card}>
        <Text style={styles.label}>Monitor de Movimento:</Text>
        <Text style={[styles.magnitudeValue, { color: riskStatus.isHighRisk ? '#FF5252' : '#4CAF50' }]}>
          {riskStatus.magnitude} G
        </Text>
        <Text style={styles.hint}>
          {riskStatus.isHighRisk ? "⚠️ MOVIMENTO BRUSCO DETECTADO" : "✅ STATUS: ESTÁVEL"}
        </Text>
      </View>

      {/* Card de GPS */}
      <View style={styles.card}>
        <Text style={styles.label}>Geolocalização:</Text>
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
  card: { backgroundColor: '#1E1E1E', padding: 20, borderRadius: 15, width: '100%', marginBottom: 20 },
  label: { color: '#BB86FC', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 10 },
  magnitudeValue: { fontSize: 48, fontWeight: 'bold', textAlign: 'center' },
  geoText: { color: '#03DAC6', fontSize: 16, fontFamily: 'monospace' },
  hint: { color: '#fff', textAlign: 'center', marginTop: 10, fontWeight: 'bold' }
});