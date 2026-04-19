import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Dimensions } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import * as Location from 'expo-location';

export default function App() {
  // Estados para sensores e GPS
  const [{ x, y, z }, setData] = useState({ x: 0, y: 0, z: 0 });
  const [location, setLocation] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    // 1. Configurar Acelerómetro
    Accelerometer.setUpdateInterval(100);
    const subscription = Accelerometer.addListener(setData);

    // 2. Configurar GPS e Permissões
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permissão de GPS negada!');
        return;
      }
      let loc = await Location.getCurrentPositionAsync({});
      setLocation(loc);
    })();

    return () => subscription.remove();
  }, []);

  // Cálculo de Magnitude G (Fundamental para detecção de risco no TCC)
  const magnitude = Math.sqrt(x**2 + y**2 + z**2).toFixed(2);

  return (
    <View style={styles.container}>
    <View style={styles.headerContainer}>
      <Text style={styles.header}>Ampara</Text>
      <Text style={styles.subHeader}>Monitoramento ativo</Text>
    </View>
      <View style={styles.card}>
        <Text style={styles.label}>Sensores de Movimento:</Text>
        <Text style={styles.data}>X: {x.toFixed(2)} | Y: {y.toFixed(2)} | Z: {z.toFixed(2)}</Text>
        
        <View style={styles.statusBox}>
          <Text style={styles.magnitudeLabel}>Força G Atual:</Text>
          <Text style={[styles.magnitudeValue, { color: magnitude > 1.8 ? '#C2185B' : '#4CAF50'}]}>
            {magnitude}
          </Text>
        </View>
        <Text style={styles.hint}>
          {magnitude > 1.8 ? "⚠️ Movimento Brusco!" : "✅ Estável"}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Geolocalização atual (GPS):</Text>
        {location ? (
          <Text style={styles.geoText}>
            LAT: {location.coords.latitude.toFixed(6)} {"\n"}
            LON: {location.coords.longitude.toFixed(6)}
          </Text>
        ) : (
          <Text style={{color: '#888'}}>{errorMsg || "A carregar sinal..."}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({

  container: { flex: 1, backgroundColor: '#F5EFEA', alignItems: 'stretch', justifyContent: 'flex-start', paddingTop: 20, paddingHorizontal: 20 },

  header: {
    color: '#6b2b38',
    fontSize: 30,
    fontWeight: '600'
  },

  subHeader: {
    color: '#9C6873',
    fontSize: 20,
    marginTop: 4
  },

  card: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 20,
    width: '100%',
    marginBottom: 16,
    shadowColor: '#C2185B',
    shadowOpacity: 0.08,
    shadowRadius: 15,
    elevation: 3
  }, 

    label: { color: '#9C6873', fontSize: 14, marginBottom: 10, fontWeight: 'bold', textTransform: 'uppercase' },

  data: {
    color: '#333',
    fontSize: 14,
    marginBottom: 10
  },

  geoText: {
    color: '#555',
    fontSize: 14,
    lineHeight: 22
  },

  statusBox: { flexDirection: 'row', alignItems: 'center', marginTop: 15 },

    magnitudeLabel: { color: '#555', fontSize: 13 },

  magnitudeValue: {
    fontSize: 36,
    fontWeight: '600',
    marginLeft: 10
  },

  hint: {
    color: '#777',
    marginTop: 10,
    fontSize: 13
  },

  headerContainer: {
    width: '100%',
    paddingTop: 60,
    paddingBottom: 16,
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E0DA'
  }

  });