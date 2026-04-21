import React, { useState, useEffect } from 'react'; 
import { StyleSheet, Text, View, Modal, TouchableOpacity, ScrollView, SafeAreaView } from 'react-native';
import { useRiskDetection } from './hooks/useRiskDetection'; 
import MapView, { Marker, Circle } from 'react-native-maps';
import crimeData from './data/crimes_mock.json';
import Dashboard from './screens/Dashboard'; // Importando sua nova tela

export default function App() {
  const { data, location, riskStatus, errorMsg, stepCount, nearbyCrimes, currentScore, statusColor } = useRiskDetection();
  const [modalVisible, setModalVisible] = useState(false); 
  const [currentScreen, setCurrentScreen] = useState('Home'); // Estado para controlar a tela
  const { x, y, z } = data;
  const { magnitude, isHighRisk } = riskStatus;

  // Lógica do Modal de Alerta
  useEffect(() => {
    if (riskStatus.isHighRisk && !modalVisible) {
      setModalVisible(true);
    }
  }, [riskStatus.isHighRisk]);

  // SE a tela atual for Dashboard, renderiza apenas ela
  if (currentScreen === 'Dashboard') {
    return <Dashboard onBack={() => setCurrentScreen('Home')} />;
  }

  // CASO CONTRÁRIO, renderiza a tela de sensores (Home)
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5EFEA' }}>
      <ScrollView 
        style={styles.container} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerContainer}>
          <Text style={styles.header}>Ampara</Text>
          <Text style={styles.subHeader}>Laboratório de Sensores</Text>
        </View>

        {/* --- NOVO BOTÃO PARA O DASHBOARD --- */}
        <TouchableOpacity 
          style={styles.navButton} 
          onPress={() => setCurrentScreen('Dashboard')}
        >
          <Text style={styles.navButtonText}>📊 VER DASHBOARD REALTIME</Text>
        </TouchableOpacity>

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
            <Text style={styles.magnitudeLabel}>Magnitude G:</Text>
            <Text style={[styles.magnitudeValue, { color: isHighRisk ? '#C2185B' : '#4CAF50'}]}>
              {magnitude}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Mapa de Risco (SSP Mock):</Text>
          {location ? (
            <>
              <View style={styles.mapContainer}>
                <MapView
                  style={styles.map}
                  initialRegion={{
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                    latitudeDelta: 0.008,
                    longitudeDelta: 0.008,
                  }}
                >
                  <Marker coordinate={location.coords} title="Você" pinColor="blue" />
                  <Circle
                    center={location.coords}
                    radius={500}
                    fillColor="rgba(107, 43, 56, 0.15)"
                    strokeColor="#6B2B38"
                    strokeWidth={2}
                  />
                  {crimeData.map((crime, index) => (
                    <Marker
                      key={index}
                      coordinate={{ latitude: crime.lat, longitude: crime.lon }}
                      title={crime.tipo}
                      pinColor="#C2185B"
                    />
                  ))}
                </MapView>
              </View>
              <View style={{ marginTop: 10, padding: 8, backgroundColor: nearbyCrimes > 0 ? '#FFEBEE' : '#E8F5E9', borderRadius: 10 }}>
                <Text style={{ fontWeight: 'bold', color: nearbyCrimes > 0 ? '#C2185B' : '#2E7D32', textAlign: 'center' }}>
                  {nearbyCrimes > 0 ? `⚠️ ${nearbyCrimes} crimes na região` : "✅ Região estável"}
                </Text>
              </View>
            </>
          ) : (
            <Text style={{color: '#888'}}>{errorMsg || "Aguardando GPS..."}</Text>
          )}
        </View>

        {/* Modal de Alerta mantido aqui para funcionar em ambas as telas se necessário */}
        <Modal animationType="fade" transparent={true} visible={modalVisible}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.alertTitle}>🚨 ANOMALIA DETECTADA</Text>
              <Text style={styles.alertText}>Detectamos um impacto de {magnitude}G. Estás bem?</Text>
              <TouchableOpacity style={styles.alertButton} onPress={() => setModalVisible(false)}>
                <Text style={styles.buttonText}>ESTOU BEM</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

      </ScrollView>
    </SafeAreaView>
  );
}

// Estilos adicionais para o botão de navegação
const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#F5EFEA', // Seu fundo off-white original
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 20,
  },
  headerContainer: {
    width: '100%',
    paddingTop: 40, // Ajustado para SafeArea
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
    fontSize: 18,
    marginTop: 4
  },
  navButton: {
    backgroundColor: '#6B2B38',
    padding: 18, // Botão mais robusto
    borderRadius: 20,
    marginBottom: 25,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
  },
  navButtonText: { 
    color: 'white', 
    fontWeight: 'bold', 
    fontSize: 16,
    letterSpacing: 1
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 25, // Aumentado para o card não parecer "mirrado"
    borderRadius: 25,
    width: '100%',
    marginBottom: 20,
    shadowColor: '#C2185B',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4
  }, 
  label: { 
    color: '#9C6873', 
    fontSize: 14, 
    marginBottom: 12, 
    fontWeight: 'bold', 
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  data: {
    color: '#333',
    fontSize: 16,
    marginBottom: 10,
    fontFamily: 'System' // Ou a fonte que preferir
  },
  statusBox: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginTop: 15,
    backgroundColor: '#F9F9F9', // Um fundinho leve para o valor
    padding: 10,
    borderRadius: 15
  },
  magnitudeLabel: { 
    color: '#555', 
    fontSize: 14 
  },
  magnitudeValue: {
    fontSize: 42, // Valor bem grande para impacto visual
    fontWeight: 'bold',
    marginLeft: 15
  },
  mapContainer: {
    height: 250, // Mapa com tamanho bom
    width: '100%',
    marginVertical: 15,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EEE',
  },
  map: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalContent: {
    backgroundColor: 'white',
    padding: 35,
    borderRadius: 30,
    width: '85%',
    alignItems: 'center',
    elevation: 20
  },
  alertTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#6b2b38',
    marginBottom: 15
  },
  alertText: {
    textAlign: 'center',
    color: '#555',
    fontSize: 16,
    marginBottom: 25,
    lineHeight: 22
  },
  alertButton: {
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 15,
    width: '100%'
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 16
  }
});