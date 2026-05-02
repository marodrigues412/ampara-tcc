import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  Keyboard
} from 'react-native'
import * as Location from 'expo-location'
import MapView, { Marker, Circle } from 'react-native-maps'
import { supabase } from '../services/supabase'

export default function SafeLocations({ navigation }) {
  const [locations, setLocations] = useState([])
  const [user, setUser] = useState(null)

  const [modalVisible, setModalVisible] = useState(false)
  const [mode, setMode] = useState(null)

  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState('')
  const [endereco, setEndereco] = useState('')
  const [suggestions, setSuggestions] = useState([])

  const [latitude, setLatitude] = useState(null)
  const [longitude, setLongitude] = useState(null)
  const [currentLocation, setCurrentLocation] = useState(null)

  const [editingLocation, setEditingLocation] = useState(null)

  const mapRef = useRef(null)
  const searchTimeout = useRef(null)

  const tipos = ['Casa', 'Trabalho', 'Academia', 'Faculdade', 'Outro']

  useEffect(() => {
    loadData()
    getUserLocation()
  }, [])

  const loadData = async () => {
    const { data: userData } = await supabase.auth.getUser()
    const currentUser = userData?.user

    if (!currentUser) return

    setUser(currentUser)

    const { data, error } = await supabase
      .from('safe_locations')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: true })

    if (error) {
      console.log(error)
      Alert.alert('Erro', 'Não foi possível carregar os locais seguros.')
      return
    }

    setLocations(data || [])
  }

  const getUserLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync()

    if (status !== 'granted') return

    const loc = await Location.getCurrentPositionAsync({})
    setCurrentLocation(loc.coords)
  }

  const formatAddressFromExpo = (address) => {
    if (!address || address.length === 0) return ''

    const a = address[0]

    const street = a.street || ''
    const streetNumber = a.streetNumber || ''
    const district = a.district || ''
    const city = a.city || ''
    const region = a.region || ''

    return [streetNumber ? `${street}, ${streetNumber}` : street, district, city, region]
      .filter(Boolean)
      .join(', ')
  }

  const recenterMap = () => {
    if (!mapRef.current || !currentLocation) return

    mapRef.current.animateToRegion(
      {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01
      },
      500
    )
  }

  const goToLocation = (item) => {
    if (!mapRef.current) return

    mapRef.current.animateToRegion(
      {
        latitude: Number(item.latitude),
        longitude: Number(item.longitude),
        latitudeDelta: 0.006,
        longitudeDelta: 0.006
      },
      500
    )
  }

  const openGPSMode = async () => {
    resetForm(false)
    setMode('gps')

    const { status } = await Location.requestForegroundPermissionsAsync()

    if (status !== 'granted') {
      Alert.alert('Permissão negada', 'Precisamos da localização para salvar este local.')
      return
    }

    const loc = await Location.getCurrentPositionAsync({})
    const lat = loc.coords.latitude
    const lng = loc.coords.longitude

    setLatitude(lat)
    setLongitude(lng)
    setCurrentLocation(loc.coords)

    const address = await Location.reverseGeocodeAsync({
      latitude: lat,
      longitude: lng
    })

    setEndereco(formatAddressFromExpo(address))
    setModalVisible(true)
  }

  const openManualMode = () => {
    resetForm(false)
    setMode('manual')
    setModalVisible(true)
  }

  const searchAddress = (text) => {
    setEndereco(text)
    setLatitude(null)
    setLongitude(null)

    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current)
    }

    if (text.trim().length < 3) {
      setSuggestions([])
      return
    }

    searchTimeout.current = setTimeout(async () => {
      try {
        const query = encodeURIComponent(`${text}, São Paulo, Brasil`)

        let url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=5&countrycodes=br&addressdetails=1`

        if (currentLocation) {
          const lat = currentLocation.latitude
          const lng = currentLocation.longitude

          url += `&viewbox=${lng - 0.25},${lat + 0.25},${lng + 0.25},${lat - 0.25}`
        }

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'ampara-tcc-app'
          }
        })

        const data = await response.json()
        setSuggestions(data || [])
      } catch (error) {
        console.log(error)
        setSuggestions([])
      }
    }, 600)
  }

  const selectSuggestion = (item) => {
    setEndereco(item.display_name)
    setLatitude(Number(item.lat))
    setLongitude(Number(item.lon))
    setSuggestions([])
    Keyboard.dismiss()
  }

  const handleSave = async () => {
    if (!nome.trim()) {
      Alert.alert('Atenção', 'Informe como você chama esse lugar.')
      return
    }

    if (!tipo) {
      Alert.alert('Atenção', 'Selecione o tipo do local.')
      return
    }

    if (!endereco.trim()) {
      Alert.alert('Atenção', 'Informe o endereço.')
      return
    }

    let finalLatitude = latitude
    let finalLongitude = longitude
    let finalEndereco = endereco

    if (mode === 'manual' && (!finalLatitude || !finalLongitude)) {
      const geo = await Location.geocodeAsync(`${endereco}, São Paulo, Brasil`)

      if (!geo || geo.length === 0) {
        Alert.alert('Endereço não encontrado', 'Selecione uma sugestão ou tente digitar um endereço mais completo.')
        return
      }

      finalLatitude = geo[0].latitude
      finalLongitude = geo[0].longitude
    }

    const payload = {
      user_id: user.id,
      nome: nome.trim(),
      tipo,
      endereco: finalEndereco.trim(),
      latitude: finalLatitude,
      longitude: finalLongitude
    }

    const { error } = editingLocation
      ? await supabase
          .from('safe_locations')
          .update(payload)
          .eq('id', editingLocation.id)
      : await supabase
          .from('safe_locations')
          .insert(payload)

    if (error) {
      console.log(error)
      Alert.alert('Erro', 'Não foi possível salvar o local.')
      return
    }

    resetForm()
    loadData()

    setTimeout(() => {
      goToLocation({
        latitude: finalLatitude,
        longitude: finalLongitude
      })
    }, 400)
  }

  const handleEdit = (item) => {
    setEditingLocation(item)
    setNome(item.nome || '')
    setTipo(item.tipo || '')
    setEndereco(item.endereco || '')
    setLatitude(Number(item.latitude))
    setLongitude(Number(item.longitude))
    setSuggestions([])
    setMode('manual')
    setModalVisible(true)
  }

  const handleDelete = (id) => {
    Alert.alert(
      'Excluir local',
      'Tem certeza que deseja remover este local seguro?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('safe_locations')
              .delete()
              .eq('id', id)

            if (error) {
              Alert.alert('Erro', 'Não foi possível excluir o local.')
              return
            }

            loadData()
          }
        }
      ]
    )
  }

  const resetForm = (closeModal = true) => {
    setNome('')
    setTipo('')
    setEndereco('')
    setLatitude(null)
    setLongitude(null)
    setSuggestions([])
    setEditingLocation(null)
    setMode(null)

    if (closeModal) {
      setModalVisible(false)
    }
  }

  const renderLocation = ({ item }) => (
    <TouchableOpacity
      activeOpacity={0.85}
      style={styles.locationCard}
      onPress={() => goToLocation(item)}
    >
      <View style={styles.locationInfo}>
        <Text style={styles.locationName}>{item.nome}</Text>
        <Text style={styles.locationType}>{item.tipo}</Text>
        <Text style={styles.locationAddress}>{item.endereco}</Text>
      </View>

      <View style={styles.locationActions}>
        <TouchableOpacity onPress={() => handleEdit(item)}>
          <Text style={styles.icon}>✏️</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity onPress={() => handleDelete(item.id)}>
          <Text style={styles.icon}>🗑️</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  )

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.back}>←</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Locais Seguros</Text>
      <Text style={styles.subtitle}>Salve lugares importantes para você</Text>

      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={{
            latitude: currentLocation?.latitude || -23.585181,
            longitude: currentLocation?.longitude || -46.517431,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01
          }}
        >
          {currentLocation && (
            <Marker
              coordinate={{
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude
              }}
              title="Você"
              pinColor="#6B2B38"
            />
          )}

          {locations.map((loc) => (
            <React.Fragment key={loc.id}>
              <Marker
                coordinate={{
                  latitude: Number(loc.latitude),
                  longitude: Number(loc.longitude)
                }}
                title={loc.nome}
                description={loc.tipo}
              />

              <Circle
                center={{
                  latitude: Number(loc.latitude),
                  longitude: Number(loc.longitude)
                }}
                radius={80}
                strokeColor="#6B2B38"
                fillColor="rgba(107, 43, 56, 0.14)"
              />
            </React.Fragment>
          ))}
        </MapView>

        <TouchableOpacity style={styles.recenterButton} onPress={recenterMap}>
          <Text style={styles.recenterIcon}>📍</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.primaryButton} onPress={openGPSMode}>
        <Text style={styles.primaryText}>📍 Usar minha localização</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondaryButton} onPress={openManualMode}>
        <Text style={styles.secondaryText}>✏️ Inserir manualmente</Text>
      </TouchableOpacity>

      <FlatList
        data={locations}
        keyExtractor={(item) => item.id}
        renderItem={renderLocation}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            Você ainda não cadastrou locais seguros
          </Text>
        }
      />

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>
                {editingLocation ? 'Editar local' : 'Novo local'}
              </Text>

              <Text style={styles.label}>Como você chama esse lugar?</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: Minha casa, Trabalho, Academia"
                value={nome}
                onChangeText={setNome}
              />

              <Text style={styles.label}>Endereço</Text>

              {mode === 'gps' ? (
                <View style={styles.gpsAddressBox}>
                  <Text style={styles.gpsAddressText}>
                    {endereco || 'Buscando endereço...'}
                  </Text>
                </View>
              ) : (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Ex: Rua Alfredo Silveira, 379"
                    value={endereco}
                    onChangeText={searchAddress}
                    autoCorrect={false}
                  />

                  {suggestions.length > 0 && (
                    <View style={styles.suggestionsBox}>
                      {suggestions.map((item) => (
                        <TouchableOpacity
                          key={item.place_id}
                          style={styles.suggestionItem}
                          onPress={() => selectSuggestion(item)}
                        >
                          <Text style={styles.suggestionText}>
                            {item.display_name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}

              <Text style={styles.label}>Tipo</Text>

              <View style={styles.typeContainer}>
                {tipos.map((item) => (
                  <TouchableOpacity
                    key={item}
                    onPress={() => setTipo(item)}
                    style={[
                      styles.typeButton,
                      tipo === item && styles.typeSelected
                    ]}
                  >
                    <Text
                      style={[
                        styles.typeText,
                        tipo === item && styles.typeTextSelected
                      ]}
                    >
                      {item}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.saveText}>
                  {editingLocation ? 'Salvar alterações' : 'Salvar'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => resetForm()}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5EFEA',
    padding: 20
  },

  back: {
    marginTop: 40,
    fontSize: 28,
    color: '#6B2B38'
  },

  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#6B2B38',
    marginTop: 8
  },

  subtitle: {
    color: '#9C6873',
    marginBottom: 14
  },

  mapContainer: {
    height: 210,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 18,
    backgroundColor: '#FFF'
  },

  map: {
    flex: 1
  },

  recenterButton: {
    position: 'absolute',
    right: 14,
    top: 14,
    backgroundColor: '#FFF',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5
  },

  recenterIcon: {
    fontSize: 22
  },

  primaryButton: {
    backgroundColor: '#6B2B38',
    padding: 15,
    borderRadius: 14,
    marginBottom: 10
  },

  primaryText: {
    color: '#FFF',
    textAlign: 'center',
    fontWeight: 'bold'
  },

  secondaryButton: {
    borderWidth: 1,
    borderColor: '#6B2B38',
    padding: 15,
    borderRadius: 14,
    marginBottom: 18
  },

  secondaryText: {
    color: '#6B2B38',
    textAlign: 'center',
    fontWeight: '600'
  },

  listContent: {
    paddingBottom: 80
  },

  locationCard: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 18,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },

  locationInfo: {
    flex: 1,
    paddingRight: 12
  },

  locationName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111'
  },

  locationType: {
    fontSize: 15,
    color: '#6B2B38',
    marginTop: 2
  },

  locationAddress: {
    fontSize: 14,
    color: '#666',
    marginTop: 2
  },

  locationActions: {
    flexDirection: 'row',
    alignItems: 'center'
  },

  icon: {
    fontSize: 20
  },

  divider: {
    width: 1,
    height: 22,
    backgroundColor: '#D8D0CC',
    marginHorizontal: 10
  },

  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 18
  },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20
  },

  modal: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 20,
    maxHeight: '85%'
  },

  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 8
  },

  label: {
    color: '#6B2B38',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 14,
    marginBottom: 6
  },

  input: {
    borderWidth: 1,
    borderColor: '#D8D0CC',
    borderRadius: 14,
    padding: 14,
    fontSize: 16
  },

  gpsAddressBox: {
    backgroundColor: '#F5EFEA',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E1D7D2'
  },

  gpsAddressText: {
    color: '#555',
    fontSize: 15
  },

  suggestionsBox: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E1D7D2',
    borderRadius: 14,
    marginTop: 8,
    overflow: 'hidden'
  },

  suggestionItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE'
  },

  suggestionText: {
    color: '#333',
    fontSize: 14
  },

  typeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },

  typeButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D8D0CC'
  },

  typeSelected: {
    backgroundColor: '#6B2B38',
    borderColor: '#6B2B38'
  },

  typeText: {
    color: '#333',
    fontWeight: '500'
  },

  typeTextSelected: {
    color: '#FFF'
  },

  saveButton: {
    backgroundColor: '#6B2B38',
    padding: 15,
    borderRadius: 14,
    marginTop: 22,
    alignItems: 'center'
  },

  saveText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16
  },

  cancelText: {
    textAlign: 'center',
    color: '#9C6873',
    fontSize: 16,
    marginTop: 14
  }
})