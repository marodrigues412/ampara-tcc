import React, { useState, useEffect, useRef } from 'react'
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity
} from 'react-native'

import MapView, {
  Marker,
  Circle
} from 'react-native-maps'

import { useRiskDetection } from '../hooks/useRiskDetection'
import { buscarCrimes } from '../services/crimesService'

export default function Home() {

  const {
    data,
    location,
    riskStatus,
    errorMsg,
    stepCount
  } = useRiskDetection()

  const [crimeData, setCrimeData] = useState([])
  const [region, setRegion] = useState(null)
  const [userRegion, setUserRegion] = useState(null)
  const [mapMoved, setMapMoved] = useState(false)

  const mapRef = useRef(null)

  const { x, y, z } = data
  const { magnitude, isHighRisk } = riskStatus

  // =========================
  // LOCALIZAÇÃO
  // =========================

  useEffect(() => {

    if (location) {

      const initialRegion = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,

        latitudeDelta: 0.03,
        longitudeDelta: 0.03
      }

      setRegion(initialRegion)
      setUserRegion(initialRegion)
    }

  }, [location])

  // =========================
  // CARREGAR CRIMES
  // =========================

  useEffect(() => {

    async function carregarCrimes() {

      try {

        const crimes = await buscarCrimes()

        if (!location) return

        const userLat = location.coords.latitude
        const userLon = location.coords.longitude

        const crimesFormatados = crimes

          .map((crime) => {

            const lat = Number(crime.latitude)
            const lon = Number(crime.longitude)

            if (
              !Number.isFinite(lat) ||
              !Number.isFinite(lon)
            ) {
              return null
            }

            return {

              id:
                crime.id ||
                Math.random(),

              lat,
              lon,

              tipo:
                crime.natureza_apurada ||
                crime.conduta ||
                'Ocorrência',

              distancia:
                Math.sqrt(
                  Math.pow((lat - userLat) * 111, 2) +
                  Math.pow((lon - userLon) * 111, 2)
                )
            }
          })

          .filter(Boolean)

          // até 20km
          .filter(crime =>
            crime.distancia <= 20
          )

          // mais próximos primeiro
          .sort((a, b) =>
            a.distancia - b.distancia
          )

          // máximo
          .slice(0, 100)

        console.log(
          'CRIMES PRÓXIMOS:',
          crimesFormatados.length
        )

        console.log(
          crimesFormatados.slice(0, 5)
        )

        setCrimeData(crimesFormatados)

      } catch (error) {

        console.error(
          'ERRO AO BUSCAR CRIMES:',
          error
        )
      }
    }

    carregarCrimes()

  }, [location])

  // =========================
  // MAPA
  // =========================

  const handleRegionChange = (
    newRegion
  ) => {

    setRegion(newRegion)

    if (!userRegion) return

    const distance =
      Math.abs(
        newRegion.latitude -
        userRegion.latitude
      ) +

      Math.abs(
        newRegion.longitude -
        userRegion.longitude
      )

    setMapMoved(distance > 0.002)
  }

  const recenterMap = () => {

    if (
      mapRef.current &&
      userRegion
    ) {

      mapRef.current.animateToRegion(
        userRegion,
        500
      )

      setMapMoved(false)
    }
  }

  return (

    <View style={styles.container}>

      <ScrollView
        style={styles.container}
        contentContainerStyle={
          styles.scrollContent
        }
      >

        {/* HEADER */}

        <View style={styles.headerContainer}>

          <Text style={styles.header}>
            Ampara
          </Text>

          <Text style={styles.subHeader}>
            Monitoramento ativo
          </Text>

        </View>

        {/* MAPA */}

        <View style={styles.mapFixedContainer}>

          {location && region ? (

            <>

              <MapView
                ref={mapRef}
                style={styles.map}
                region={region}
                onRegionChangeComplete={
                  handleRegionChange
                }
              >

                {/* VOCÊ */}

                <Marker
                  coordinate={{
                    latitude:
                      location.coords.latitude,

                    longitude:
                      location.coords.longitude
                  }}
                  title="Você"
                  pinColor="blue"
                />

                {/* RAIO */}

                <Circle
                  center={{
                    latitude:
                      location.coords.latitude,

                    longitude:
                      location.coords.longitude
                  }}
                  radius={500}
                  fillColor="rgba(194,24,91,0.10)"
                  strokeColor="#C2185B"
                />

                {/* CRIMES */}

                {crimeData.map(crime => (

                  <Marker
                    key={crime.id}
                    coordinate={{
                      latitude: crime.lat,
                      longitude: crime.lon
                    }}
                    title={crime.tipo}
                    description={`${crime.distancia.toFixed(2)} km`}
                    pinColor="#C2185B"
                  />

                ))}

              </MapView>

              {mapMoved && (

                <TouchableOpacity
                  style={
                    styles.recenterButton
                  }
                  onPress={recenterMap}
                >

                  <Text
                    style={
                      styles.recenterText
                    }
                  >
                    📍 Voltar para mim
                  </Text>

                </TouchableOpacity>

              )}

            </>

          ) : (

            <Text style={{
              padding: 20
            }}>
              {errorMsg || 'Carregando mapa...'}
            </Text>

          )}

        </View>

        {/* ALERTA */}

        <View
          style={[
            styles.crimeAlert,
            {
              backgroundColor:
                crimeData.length > 0
                  ? '#FFEBEE'
                  : '#E8F5E9'
            }
          ]}
        >

          <Text
            style={[
              styles.crimeAlertText,
              {
                color:
                  crimeData.length > 0
                    ? '#C2185B'
                    : '#2E8B57'
              }
            ]}
          >

            {crimeData.length > 0
              ? `⚠️ ${crimeData.length} ocorrências próximas`
              : '✅ Região segura'}

          </Text>

        </View>

        {/* PASSOS */}

        <View style={styles.card}>

          <Text style={styles.label}>
            Monitor de Atividade
          </Text>

          <Text style={styles.data}>
            👣 {stepCount} passos
          </Text>

        </View>

        {/* SENSORES */}

        <View style={styles.card}>

          <Text style={styles.label}>
            Sensores
          </Text>

          <Text style={styles.data}>
            X: {x.toFixed(2)} |
            Y: {y.toFixed(2)} |
            Z: {z.toFixed(2)}
          </Text>

          <View style={styles.statusBox}>

            <Text style={styles.magnitudeLabel}>
              Força G:
            </Text>

            <Text
              style={[
                styles.magnitudeValue,
                {
                  color:
                    isHighRisk
                      ? '#B91C1C'
                      : '#2E8B57'
                }
              ]}
            >
              {magnitude}
            </Text>

          </View>

          <Text style={styles.hint}>
            {isHighRisk
              ? '⚠️ Movimento brusco'
              : '✅ Estável'}
          </Text>

        </View>

      </ScrollView>

    </View>
  )
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#F5EFEA'
  },

  scrollContent: {
    padding: 20,
    paddingBottom: 120
  },

  headerContainer: {
    paddingTop: 40,
    marginBottom: 20
  },

  header: {
    fontSize: 42,
    color: '#025382',
    fontWeight: '700'
  },

  subHeader: {
    color: '#3A7FA6',
    fontSize: 18
  },

  mapFixedContainer: {
    height: 420,
    borderRadius: 25,
    overflow: 'hidden',
    backgroundColor: '#FFF',
    marginBottom: 14
  },

  map: {
    flex: 1
  },

  recenterButton: {
    position: 'absolute',
    bottom: 15,
    alignSelf: 'center',
    backgroundColor: '#025382',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 20
  },

  recenterText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 15
  },

  crimeAlert: {
    padding: 14,
    borderRadius: 16,
    marginBottom: 16
  },

  crimeAlertText: {
    fontWeight: '700',
    fontSize: 16
  },

  card: {
    backgroundColor: '#FFF',
    padding: 20,
    borderRadius: 24,
    marginBottom: 16
  },

  label: {
    color: '#3A7FA6',
    fontWeight: '700',
    fontSize: 22
  },

  data: {
    color: '#333',
    marginTop: 10,
    fontSize: 18
  },

  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18
  },

  magnitudeLabel: {
    color: '#555',
    fontSize: 20
  },

  magnitudeValue: {
    fontSize: 56,
    marginLeft: 12
  },

  hint: {
    marginTop: 12,
    fontSize: 18
  }

})