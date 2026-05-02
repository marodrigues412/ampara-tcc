import React, { useState, useEffect, useRef } from 'react'
import { StyleSheet, Text, View, Modal, TouchableOpacity, ScrollView } from 'react-native'
import { useRiskDetection } from '../hooks/useRiskDetection'
import MapView, { Marker, Circle } from 'react-native-maps'
import crimeData from '../data/crimes_mock.json'

export default function Home() {
  const { data, location, riskStatus, errorMsg, stepCount, nearbyCrimes } = useRiskDetection()
  const [modalVisible, setModalVisible] = useState(false)

  const [region, setRegion] = useState(null)
  const [userRegion, setUserRegion] = useState(null)
  const [mapMoved, setMapMoved] = useState(false)

  const mapRef = useRef(null)

  const { x, y, z } = data
  const { magnitude, isHighRisk } = riskStatus

  useEffect(() => {
    if (isHighRisk && !modalVisible) {
      setModalVisible(true)
    }
  }, [isHighRisk])

  useEffect(() => {
    if (location) {
      const initialRegion = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      }

      setRegion(initialRegion)
      setUserRegion(initialRegion)
    }
  }, [location])

  const handleRegionChange = (newRegion) => {
    setRegion(newRegion)

    if (!userRegion) return

    const distance =
      Math.abs(newRegion.latitude - userRegion.latitude) +
      Math.abs(newRegion.longitude - userRegion.longitude)

    if (distance > 0.002) {
      setMapMoved(true)
    } else {
      setMapMoved(false)
    }
  }

  const recenterMap = () => {
    if (mapRef.current && userRegion) {
      mapRef.current.animateToRegion(userRegion, 500)
      setMapMoved(false)
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      
      <View style={styles.headerContainer}>
        <Text style={styles.header}>Ampara</Text>
        <Text style={styles.subHeader}>Monitoramento ativo</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Monitor de Atividade:</Text>
        <Text style={styles.data}>👣 {stepCount} passos</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Sensores:</Text>
        <Text style={styles.data}>
          X: {x.toFixed(2)} | Y: {y.toFixed(2)} | Z: {z.toFixed(2)}
        </Text>

        <View style={styles.statusBox}>
          <Text style={styles.magnitudeLabel}>Força G:</Text>
          <Text style={[
            styles.magnitudeValue,
            { color: isHighRisk ? '#C2185B' : '#4CAF50' }
          ]}>
            {magnitude}
          </Text>
        </View>

        <Text style={styles.hint}>
          {isHighRisk ? "⚠️ Movimento brusco" : "✅ Estável"}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Localização:</Text>

        {location && region ? (
          <>
            <Text style={styles.geoText}>
              LAT: {location.coords.latitude.toFixed(6)}
            </Text>

            <View style={styles.mapContainer}>
              <MapView
                ref={mapRef}
                style={styles.map}
                region={region}
                onRegionChangeComplete={handleRegionChange}
              >
                <Marker coordinate={location.coords} title="Você" />

                <Circle
                  center={location.coords}
                  radius={500}
                  fillColor="rgba(107, 43, 56, 0.15)"
                  strokeColor="#6B2B38"
                />

                {crimeData.map((crime, i) => (
                  <Marker
                    key={i}
                    coordinate={{ latitude: crime.lat, longitude: crime.lon }}
                    title={crime.tipo}
                    pinColor="#C2185B"
                  />
                ))}
              </MapView>

              {mapMoved && (
                <TouchableOpacity
                  style={styles.recenterButton}
                  onPress={recenterMap}
                >
                  <Text style={styles.recenterText}>📍 Voltar para mim</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={{
              marginTop: 10,
              padding: 8,
              backgroundColor: nearbyCrimes > 0 ? '#FFEBEE' : '#E8F5E9',
              borderRadius: 10
            }}>
              <Text style={{
                fontWeight: 'bold',
                color: nearbyCrimes > 0 ? '#C2185B' : '#2E7D32'
              }}>
                {nearbyCrimes > 0
                  ? `⚠️ ${nearbyCrimes} crimes na região`
                  : "✅ Região segura"}
              </Text>
            </View>
          </>
        ) : (
          <Text>{errorMsg || "Carregando..."}</Text>
        )}
      </View>

      <Modal transparent visible={modalVisible}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.alertTitle}>🚨 ALERTA</Text>
            <Text style={styles.alertText}>
              Detectamos {magnitude}G. Você está bem?
            </Text>

            <TouchableOpacity
              style={styles.button}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.buttonText}>Estou bem</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5EFEA' },
  scrollContent: { padding: 20 },

  headerContainer: {
    paddingTop: 40,
    marginBottom: 20
  },

  header: {
    fontSize: 30,
    color: '#6b2b38',
    fontWeight: '600'
  },

  subHeader: {
    color: '#9C6873'
  },

  card: {
    backgroundColor: '#FFF',
    padding: 20,
    borderRadius: 20,
    marginBottom: 16
  },

  label: { color: '#9C6873', fontWeight: 'bold' },
  data: { color: '#333' },

  geoText: { color: '#555' },

  statusBox: { flexDirection: 'row', marginTop: 10 },

  magnitudeLabel: { color: '#555' },

  magnitudeValue: {
    fontSize: 30,
    marginLeft: 10
  },

  hint: { marginTop: 5 },

  mapContainer: {
    height: 200,
    borderRadius: 15,
    overflow: 'hidden',
    marginTop: 10
  },

  map: { flex: 1 },

  recenterButton: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    backgroundColor: '#6B2B38',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    elevation: 5
  },

  recenterText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 13
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center'
  },

  modalContent: {
    backgroundColor: '#FFF',
    padding: 20,
    borderRadius: 20,
    width: '80%'
  },

  button: {
    backgroundColor: '#4CAF50',
    padding: 15,
    borderRadius: 10,
    marginTop: 10
  },

  buttonText: {
    color: '#FFF',
    textAlign: 'center'
  }
})