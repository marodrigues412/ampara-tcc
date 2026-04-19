import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRiskDetection } from './hooks/useRiskDetection'; // Importando sua lógica

export default function App() {
  // Usando o seu hook para pegar os dados processados
  const { data, location, riskStatus, errorMsg } = useRiskDetection();
  
  // Facilitando o acesso às variáveis
  const { x, y, z } = data;
  const { magnitude, isHighRisk } = riskStatus;

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.header}>Ampara</Text>
        <Text style={styles.subHeader}>Monitoramento ativo</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Sensores de Movimento:</Text>
        <Text style={styles.data}>
          X: {x.toFixed(2)} | Y: {y.toFixed(2)} | Z: {z.toFixed(2)}
        </Text>
        
        <View style={styles.statusBox}>
          <Text style={styles.magnitudeLabel}>Força G Atual:</Text>
          {/* Cor dinâmica baseada no risco que você calculou */}
          <Text style={[styles.magnitudeValue, { color: isHighRisk ? '#C2185B' : '#4CAF50'}]}>
            {magnitude}
          </Text>
        </View>
        <Text style={styles.hint}>
          {isHighRisk ? "⚠️ Movimento Brusco!" : "✅ Estável"}
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
  container: { 
    flex: 1, 
    backgroundColor: '#F5EFEA', 
    alignItems: 'stretch', 
    justifyContent: 'flex-start', 
    paddingTop: 20, 
    paddingHorizontal: 20 
  },
  headerContainer: {
    width: '100%',
    paddingTop: 60,
    paddingBottom: 16,
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E0DA'
  },
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
  label: { 
    color: '#9C6873', 
    fontSize: 14, 
    marginBottom: 10, 
    fontWeight: 'bold', 
    textTransform: 'uppercase' 
  },
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
  statusBox: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginTop: 15 
  },
  magnitudeLabel: { 
    color: '#555', 
    fontSize: 13 
  },
  magnitudeValue: {
    fontSize: 36,
    fontWeight: '600',
    marginLeft: 10
  },
  hint: {
    color: '#777',
    marginTop: 10,
    fontSize: 13
  }
});