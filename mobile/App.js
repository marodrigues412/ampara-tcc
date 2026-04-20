import React, { useState, useEffect } from 'react'; 
import { StyleSheet, Text, View, Modal, TouchableOpacity } from 'react-native';
import { useRiskDetection } from './hooks/useRiskDetection'; // Importando sua lógica

export default function App() {
  const { data, location, riskStatus, errorMsg, stepCount, nearbyCrimes } = useRiskDetection();
  const [modalVisible, setModalVisible] = useState(false); 
  const { x, y, z } = data;
  
  // Para evitar que o modal abra toda hora, criamos uma trava
  useEffect(() => {
    if (riskStatus.isHighRisk && !modalVisible) {
      setModalVisible(true);
    }
  }, [riskStatus.isHighRisk]);

  const { magnitude, isHighRisk } = riskStatus;

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.header}>Ampara</Text>
        <Text style={styles.subHeader}>Monitoramento ativo</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Monitor de Atividade:</Text>
        <Text style={styles.data}>👣 {stepCount} passos contados</Text>
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
          <>
            <Text style={styles.geoText}>
              LAT: {location.coords.latitude.toFixed(6)} | LON: {location.coords.longitude.toFixed(6)}
            </Text>
            
            {/* NOVO BLOCO SSP */}
            <View style={{ marginTop: 10, padding: 8, backgroundColor: nearbyCrimes > 0 ? '#FFEBEE' : '#E8F5E9', borderRadius: 10 }}>
              <Text style={{ fontWeight: 'bold', color: nearbyCrimes > 0 ? '#C2185B' : '#2E7D32' }}>
                {nearbyCrimes > 0 ? `⚠️ ${nearbyCrimes} crimes registrados na região` : "✅ Região estável"}
              </Text>
            </View>
          </>
        ) : (
          <Text style={{color: '#888'}}>{errorMsg || "A carregar sinal..."}</Text>
        )}
      </View>

      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.alertTitle}>🚨 ANOMALIA DETECTADA</Text>
            <Text style={styles.alertText}>
              Detetámos um impacto brusco de {magnitude}G durante o movimento. 
              Estás em segurança?
            </Text>
            <TouchableOpacity 
              style={styles.button} 
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.buttonText}>ESTOU BEM</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)', // Fundo escurecido
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalContent: {
    backgroundColor: 'white',
    padding: 30,
    borderRadius: 25,
    width: '85%',
    alignItems: 'center',
    elevation: 10
  },
  alertTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#6b2b38',
    marginBottom: 10
  },
  alertText: {
    textAlign: 'center',
    color: '#555',
    marginBottom: 20
  },
  button: {
    backgroundColor: '#4CAF50',
    padding: 15,
    borderRadius: 12,
    width: '100%'
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center'
  }
});