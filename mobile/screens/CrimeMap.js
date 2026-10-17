import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Keyboard,
  ActivityIndicator, Platform,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import * as Location from 'expo-location'
import { Ionicons } from '@expo/vector-icons'
import { buscarMapaCalor, buscarPeriodoCrimes } from '../services/crimesService'
import { useAddressSearch } from '../hooks/useAddressSearch'
import { camadasDifusas, CORES_LEGENDA, DENSIDADE_VERMELHO } from '../utils/mapaCalor'
import { distanceKm } from '../utils/geo'
import { Brand, TemaDaAba } from '../constants/brandTheme'
import HeaderComCurvas from '../components/HeaderComCurvas'
import ApoioPorPerto from '../components/ApoioPorPerto'

const TEMA = TemaDaAba.Mapa

// Aba do mapa de ocorrências. Mostra o calor dos crimes e deixa a usuária procurar um
// endereço para ver como está a região antes de ir até lá.

// Raio da primeira busca do calor, antes de o mapa informar a área que está mostrando.
const RAIO_REGIAO_KM = 1
// Teto do raio: o Supabase devolve no máximo 1.000 registros por consulta, então pedir
// uma área muito maior só espalharia os mesmos pontos e deixaria o calor sem sentido.
const RAIO_MAXIMO_KM = 12
// Quanto buscar além da tela. Só o suficiente para cobrir o arredondamento da grade e o
// fato de a área ser um círculo inscrito num retângulo: com margem grande, o recorte
// quadrado da busca aparecia dentro da tela como uma borda reta de cor.
const MARGEM_BUSCA = 1.2

const CENTRO_SP = { latitude: -23.5505, longitude: -46.6333 }
// Raio que a tela cobre mais ou menos no zoom 15, para onde a busca leva o mapa. Perto do
// real, a câmera ao chegar não dispara uma segunda consulta.
const RAIO_DESTINO_KM = 1.2
// Quanto esperar o GPS antes de abrir o mapa no centro de SP.
const ESPERA_GPS_MS = 8_000

const mapLibre = Platform.OS === 'ios' ? null : require('@maplibre/maplibre-react-native')
const nativeMaps = Platform.OS === 'ios' ? require('react-native-maps') : null
const MapLibreMap = mapLibre?.Map
const MapLibreCamera = mapLibre?.Camera
const MapLibreGeoJSONSource = mapLibre?.GeoJSONSource
const MapLibreLayer = mapLibre?.Layer
const MapView = nativeMaps?.default
const { Circle, Marker } = nativeMaps || {}

// A SSP usa dezenas de descrições ("FURTO - OUTROS", "LESÃO CORPORAL DOLOSA"...). O banco
// já agrupa em famílias; estas são as que o mapa oferece como filtro.
const FILTROS_CRIME = [
  { id: 'roubo', rotulo: 'Roubo' },
  { id: 'furto', rotulo: 'Furto' },
  { id: 'violencia', rotulo: 'Violência' },
]

// Grupos que o mapa mostra quando nenhum filtro está marcado. Ficam de fora:
// - trânsito: são acidentes (lesão e homicídio culposos), não um risco de ser atacada na
//   rua, e pintavam de vermelho as avenidas movimentadas;
// - outros: 92% são tráfico, porte e apreensão de droga ou arma. Não têm vítima e o
//   boletim nasce de uma ação policial, então a mancha mostraria onde a polícia atua, e
//   não onde a usuária corre mais risco.
const GRUPOS_NO_MAPA = ['roubo', 'furto', 'violencia']

// Pinos do "Apoio por perto".
const lugaresGeoJSON = (lugares) => ({
  type: 'FeatureCollection',
  features: lugares.map((l, i) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [l.longitude, l.latitude] },
    properties: { numero: String(i + 1) },
  })),
})

const pontoGeoJSON = (ponto) => ({
  type: 'FeatureCollection',
  features: ponto ? [{
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [ponto.longitude, ponto.latitude] },
    properties: {},
  }] : [],
})

// O MapLibre (Android) e o Apple Maps (iOS) movem a câmera com funções diferentes.
const moverCamera = (camera, latitude, longitude) => {
  if (!camera) return
  if (Platform.OS !== 'ios') {
    camera.easeTo({ center: [longitude, latitude], zoom: 15, duration: 600 })
  } else {
    camera.animateToRegion({ latitude, longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 600)
  }
}


export default function CrimeMap({ route }) {
  const [minhaPosicao, setMinhaPosicao] = useState(null)
  const [lugaresDeApoio, setLugaresDeApoio] = useState([])
  const [erroLocalizacao, setErroLocalizacao] = useState(null)
  // Prioriza resultados perto dela; sem posição, o centro de SP.
  const { busca, sugestoes, procurar, limpar: resetarBusca } = useAddressSearch(minhaPosicao)
  // Onde o mapa abre. Fica nulo até o GPS responder, e o mapa só é montado depois disso:
  // as duas bibliotecas de mapa só leem a posição inicial uma vez, e mover a câmera logo
  // depois de montar nem sempre funcionava, então o mapa ficava parado no centro de SP.
  const [centroInicial, setCentroInicial] = useState(null)
  // Endereço escolhido na busca, marcado com um ponto rosa no mapa.
  const [pontoBuscado, setPontoBuscado] = useState(null)
  const [periodoCrimes, setPeriodoCrimes] = useState(null)


  const [areaVisivel, setAreaVisivel] = useState(null)
  const [celulasCalor, setCelulasCalor] = useState([])
  const [celulaGraus, setCelulaGraus] = useState(0.00063)
  const [calorCarregando, setCalorCarregando] = useState(true)
  // O aviso de "Calculando" cobre três momentos, e não só a consulta: enquanto a usuária
  // arrasta (o calor da área nova ainda não foi pedido), enquanto o banco responde e logo
  // depois, enquanto o celular desenha as cores novas. No iPhone esse desenho são milhares
  // de círculos e leva quase um segundo; sem cobrir esse trecho, o aviso sumia e o mapa
  // ficava um tempo com as cores antigas.
  const [mapaArrastando, setMapaArrastando] = useState(false)
  const [desenhandoCalor, setDesenhandoCalor] = useState(false)
  const arrastandoRef = useRef(false)
  const fimDesenhoRef = useRef(null)
  // Roubo e furto respondem pela maior parte das ocorrências e são o que afeta quem anda
  // na rua. Abrir com os dois mantém a mancha de calor legível em vez de cobrir tudo.
  const [tiposSelecionados, setTiposSelecionados] = useState(['roubo', 'furto'])
  const [mapaMovido, setMapaMovido] = useState(false)
  const cameraRef = useRef(null)

  const gruposAtivos = tiposSelecionados.length ? tiposSelecionados : GRUPOS_NO_MAPA

  // A posição é lida ao abrir a aba, e não acompanhada o tempo todo: aqui ela só serve de
  // ponto de partida do mapa. O monitoramento contínuo é trabalho da Home.
  useFocusEffect(useCallback(() => {
    let ativo = true
    // Sem localização (negada, erro ou GPS demorando demais), o mapa abre no centro de SP
    // para a busca continuar funcionando.
    const abrirNoCentro = () => { if (ativo) setCentroInicial((atual) => atual ?? CENTRO_SP) }
    const desistirDoGps = setTimeout(abrirNoCentro, ESPERA_GPS_MS)
    const usarPosicao = (coords) => {
      if (!ativo) return
      const posicao = { latitude: coords.latitude, longitude: coords.longitude }
      setMinhaPosicao(posicao)
      setCentroInicial((atual) => atual ?? posicao)
    }
    ;(async () => {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        if (ativo) setErroLocalizacao('Permita o acesso à localização para ver o mapa da sua região. Você ainda pode buscar um endereço.')
        abrirNoCentro()
        return
      }
      // A última posição conhecida responde na hora; a atual, mais precisa, vem depois.
      const ultima = await Location.getLastKnownPositionAsync()
      if (ultima) usarPosicao(ultima.coords)
      const atual = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      usarPosicao(atual.coords)
    })().catch(() => {
      if (ativo) setErroLocalizacao('Não foi possível obter sua localização. Você ainda pode buscar um endereço.')
      abrirNoCentro()
    })
    return () => { ativo = false; clearTimeout(desistirDoGps) }
  }, []))

  useEffect(() => { buscarPeriodoCrimes().then(setPeriodoCrimes) }, [])
  useEffect(() => () => clearTimeout(fimDesenhoRef.current), [])

  // Grade do mapa de calor: acompanha a área visível e o filtro de tipo.
  useEffect(() => {
    let cancelado = false
    async function carregarCalor() {
      const alvo = areaVisivel ?? (centroInicial && { ...centroInicial, raioKm: RAIO_REGIAO_KM })
      if (!alvo) return
      // Busca além da borda da tela: sem essa margem, a região que entra ao arrastar
      // chega sem cor e o calor parece ir "aparecendo" conforme a usuária move o mapa.
      const raioBusca = Math.min(alvo.raioKm * MARGEM_BUSCA, RAIO_MAXIMO_KM)
      setCalorCarregando(true)
      const { celulas, celulaGraus: tamanho } = await buscarMapaCalor(alvo.latitude, alvo.longitude, raioBusca, gruposAtivos)
      if (cancelado) return
      setCalorCarregando(false)
      // Em falha, celulas vem nulo e o mapa mantém o que já estava desenhado.
      if (celulas) {
        setCelulasCalor(celulas)
        setCelulaGraus(tamanho)
        // Tempo estimado de desenho: cresce com o número de células. O Android usa a camada
        // nativa de calor e desenha quase na hora.
        const esperaMs = Platform.OS === 'ios' ? Math.min(300 + celulas.length * 0.8, 1500) : 250
        setDesenhandoCalor(true)
        clearTimeout(fimDesenhoRef.current)
        fimDesenhoRef.current = setTimeout(() => setDesenhandoCalor(false), esperaMs)
      }
    }
    carregarCalor()
    return () => { cancelado = true }
    // gruposAtivos deriva de tiposSelecionados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaVisivel, centroInicial, tiposSelecionados])

  // Leva o mapa até um ponto e o marca de rosa: vale para a busca e para quem chega de
  // outra tela (um compromisso da rotina, por exemplo).
  const irParaPonto = (ponto) => {
    setPontoBuscado(ponto)
    resetarBusca(ponto.nome)
    // Se o mapa ainda não abriu (GPS respondendo), ele já abre direto no ponto.
    setCentroInicial((atual) => atual ?? ponto)
    // Já pede o calor do destino em vez de esperar a câmera chegar lá: a animação e a
    // consulta correm ao mesmo tempo, e o aviso de "Calculando" aparece na hora.
    setAreaVisivel({ latitude: ponto.latitude, longitude: ponto.longitude, raioKm: RAIO_DESTINO_KM })
    moverCamera(cameraRef.current, ponto.latitude, ponto.longitude)
  }

  const escolherSugestao = (item) => {
    Keyboard.dismiss()
    irParaPonto({ latitude: item.latitude, longitude: item.longitude, nome: item.nome })
  }

  // Outra tela pode abrir o mapa num lugar: navigate('Tabs', { screen: 'Mapa', params:
  // { ponto, pedidoEm } }). pedidoEm muda a cada pedido, para o mesmo lugar poder ser
  // aberto de novo depois de a usuária ter arrastado o mapa.
  const pedido = route?.params?.ponto
  const pedidoEm = route?.params?.pedidoEm
  useFocusEffect(useCallback(() => {
    if (pedido) irParaPonto(pedido)
    // Só um pedido novo deve mover o mapa, e não cada volta à aba.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoEm]))

  const limparBusca = () => {
    resetarBusca()
    setPontoBuscado(null)
    if (minhaPosicao) moverCamera(cameraRef.current, minhaPosicao.latitude, minhaPosicao.longitude)
  }

  const voltarParaMim = () => {
    setPontoBuscado(null)
    resetarBusca()
    if (minhaPosicao) moverCamera(cameraRef.current, minhaPosicao.latitude, minhaPosicao.longitude)
    setMapaMovido(false)
  }

  // Só vale a pena rebuscar quando a área nova é de fato outra: sem esse corte, cada
  // quadro da animação de arrastar dispararia uma consulta.
  // Chamado a cada quadro do arraste: o ref evita redesenhar a tela em todos eles.
  const comecarArraste = () => {
    if (arrastandoRef.current) return
    arrastandoRef.current = true
    setMapaArrastando(true)
  }

  const atualizarAreaVisivel = (latitude, longitude, raioKm) => {
    arrastandoRef.current = false
    setMapaArrastando(false)
    const limitado = Math.min(Math.max(raioKm, 0.5), RAIO_MAXIMO_KM)
    setAreaVisivel((atual) => {
      if (atual) {
        const deslocamentoKm = distanceKm(atual.latitude, atual.longitude, latitude, longitude)
        const mudouPouco = deslocamentoKm < atual.raioKm * 0.15
        const zoomParecido = Math.abs(limitado - atual.raioKm) < atual.raioKm * 0.2
        if (mudouPouco && zoomParecido) return atual
      }
      return { latitude, longitude, raioKm: limitado }
    })
    if (minhaPosicao) setMapaMovido(distanceKm(latitude, longitude, minhaPosicao.latitude, minhaPosicao.longitude) > 0.08)
  }

  const aoMudarRegiaoMapLibre = (evento) => {
    const [longitude, latitude] = evento.nativeEvent.center
    const limites = evento.nativeEvent.visibleBounds
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return
    // visibleBounds vem como [[lonNE, latNE], [lonSO, latSO]]: metade da diagonal é o
    // raio que cobre a tela inteira.
    const raioKm = limites
      ? distanceKm(limites[1][1], limites[1][0], limites[0][1], limites[0][0]) / 2
      : RAIO_REGIAO_KM
    atualizarAreaVisivel(latitude, longitude, raioKm)
  }

  const alternarTipo = (id) =>
    setTiposSelecionados((atual) => atual.includes(id) ? atual.filter((t) => t !== id) : [...atual, id])

  // --- Desenho do calor (mesmas regras de cor da Home) ---
  const crimesGeoJSON = useMemo(() => ({
    type: 'FeatureCollection',
    features: celulasCalor.map((celula) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [Number(celula.lon), Number(celula.lat)] },
      properties: { peso: Number(celula.peso) },
    })).filter((f) => f.geometry.coordinates.every(Number.isFinite)),
  }), [celulasCalor])
  // Área da célula em km²: o divisor que torna a cor comparável entre zooms e regiões.
  const areaCelulaKm2 = useMemo(() => (celulaGraus * 111) ** 2, [celulaGraus])
  const pesoVermelho = useMemo(() => Math.max(DENSIDADE_VERMELHO * areaCelulaKm2, 1), [areaCelulaKm2])
  // O Apple Maps não tem camada de calor, então no iPhone a densidade vira círculos por
  // célula. São milhares de elementos; memorizados, não são refeitos a cada digitação na
  // busca ou troca de outro estado da tela.
  const circulosCalorIOS = useMemo(() => (Platform.OS !== 'ios' ? null : celulasCalor.flatMap((celula, indice) =>
    camadasDifusas({ ...celula, chave: `c${indice}` }, areaCelulaKm2, celulaGraus * 111000 * 0.85).map((camada) => (
      <Circle
        key={`calor-${camada.id}`}
        center={{ latitude: Number(celula.lat), longitude: Number(celula.lon) }}
        radius={camada.raio}
        fillColor={camada.cor}
        strokeColor="transparent"
        strokeWidth={0}
      />
    ))
  )), [celulasCalor, areaCelulaKm2, celulaGraus])

  return (
    <View style={styles.container}>
      <HeaderComCurvas aba="Mapa" style={styles.topo}>
        <Text style={styles.titulo}>Mapa de ocorrências</Text>

        <View style={styles.buscaCaixa}>
          <Ionicons name="search" size={18} color={TEMA.forte} />
          <TextInput
            style={styles.buscaInput}
            value={busca}
            onChangeText={procurar}
            placeholder="Buscar endereço ou bairro"
            placeholderTextColor={Brand.muted}
            returnKeyType="search"
            accessibilityLabel="Buscar endereço"
          />
          {busca.length > 0 && (
            <TouchableOpacity onPress={limparBusca} hitSlop={8} accessibilityLabel="Limpar busca">
              <Ionicons name="close-circle" size={18} color={Brand.muted} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtroRow}>
          {FILTROS_CRIME.map((filtro) => {
            const ativo = tiposSelecionados.includes(filtro.id)
            return (
              <TouchableOpacity
                key={filtro.id}
                style={[styles.filtroChip, ativo && styles.filtroChipAtivo]}
                onPress={() => alternarTipo(filtro.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: ativo }}
              >
                <Text style={[styles.filtroTexto, ativo && styles.filtroTextoAtivo]}>{filtro.rotulo}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
        <Text style={styles.periodoTexto}>
          Últimos 6 meses{periodoCrimes ? ` (${periodoCrimes})` : ''} · SSP-SP
        </Text>
      </HeaderComCurvas>

      <View style={styles.mapaArea}>
        {!centroInicial ? (
          <View style={styles.localizando}>
            <View style={styles.carregando} accessibilityLiveRegion="polite">
              <ActivityIndicator size="small" color={TEMA.forte} />
              <Text style={styles.carregandoTexto}>Calculando mapa de calor…</Text>
            </View>
          </View>
        ) : Platform.OS !== 'ios' ? (
          <MapLibreMap
            style={styles.mapa}
            mapStyle="https://tiles.openfreemap.org/styles/liberty"
            attribution
            attributionPosition={{ bottom: 8, right: 8 }}
            logo
            logoPosition={{ bottom: 8, left: 8 }}
            onRegionWillChange={(evento) => { if (evento.nativeEvent.userInteraction) comecarArraste() }}
            onRegionDidChange={aoMudarRegiaoMapLibre}
          >
            <MapLibreCamera
              ref={cameraRef}
              initialViewState={{ center: [centroInicial.longitude, centroInicial.latitude], zoom: 14.5 }}
              minZoom={3}
              maxZoom={20}
            />
            <MapLibreGeoJSONSource id="ampara-crimes" data={crimesGeoJSON}>
              <MapLibreLayer
                id="ampara-crimes-heat"
                type="heatmap"
                paint={{
                  // O divisor é fixo (densidade que corresponde ao vermelho), não o máximo
                  // da tela: assim a mesma rua mantém a cor quando a usuária arrasta o mapa.
                  'heatmap-weight': ['min', 1, ['/', ['get', 'peso'], pesoVermelho]],
                  'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 11, 20, 15, 45, 18, 90],
                  'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 18, 1],
                  'heatmap-opacity': 0.85,
                  'heatmap-color': [
                    'interpolate', ['linear'], ['heatmap-density'],
                    0, 'rgba(76, 175, 80, 0)',
                    0.1, 'rgba(56, 165, 70, 0.45)',
                    0.3, 'rgba(120, 190, 80, 0.50)',
                    0.5, 'rgba(255, 235, 59, 0.52)',
                    0.65, 'rgba(255, 183, 77, 0.56)',
                    0.8, 'rgba(255, 120, 0, 0.64)',
                    1, 'rgba(230, 30, 30, 0.72)',
                  ],
                }}
              />
            </MapLibreGeoJSONSource>
            <MapLibreGeoJSONSource id="ampara-apoio" data={lugaresGeoJSON(lugaresDeApoio)}>
              <MapLibreLayer
                id="ampara-apoio-layer"
                type="circle"
                paint={{ 'circle-radius': 11, 'circle-color': TEMA.forte, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 3 }}
              />
            </MapLibreGeoJSONSource>
            <MapLibreGeoJSONSource id="ampara-minha-posicao" data={pontoGeoJSON(minhaPosicao)}>
              <MapLibreLayer
                id="ampara-minha-posicao-layer"
                type="circle"
                paint={{ 'circle-radius': 9, 'circle-color': Brand.blue, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 3 }}
              />
            </MapLibreGeoJSONSource>
            <MapLibreGeoJSONSource id="ampara-ponto-buscado" data={pontoGeoJSON(pontoBuscado)}>
              <MapLibreLayer
                id="ampara-ponto-buscado-layer"
                type="circle"
                paint={{ 'circle-radius': 10, 'circle-color': Brand.rose, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 3 }}
              />
            </MapLibreGeoJSONSource>
          </MapLibreMap>
        ) : (
          <MapView
            ref={cameraRef}
            style={styles.mapa}
            initialRegion={{ ...centroInicial, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
            showsUserLocation
            showsMyLocationButton={false}
            onPanDrag={comecarArraste}
            onRegionChangeComplete={(regiao) => {
              // latitudeDelta é a altura da tela em graus; metade dela, em km, é o raio
              // que cobre o que está visível.
              atualizarAreaVisivel(regiao.latitude, regiao.longitude, (regiao.latitudeDelta * 111) / 2)
            }}
          >
            {circulosCalorIOS}
            {pontoBuscado && (
              <Marker coordinate={pontoBuscado} pinColor={Brand.rose} title={pontoBuscado.nome} />
            )}
            {lugaresDeApoio.map((l) => (
              <Marker key={`${l.nome}${l.distanciaKm}`} coordinate={{ latitude: l.latitude, longitude: l.longitude }} pinColor={TEMA.forte} title={l.nome} />
            ))}
          </MapView>
        )}

        {/* Fica por cima do mapa, logo abaixo da busca. */}
        {sugestoes.length > 0 && (
          <View style={styles.sugestoes}>
            {sugestoes.map((item) => (
              <TouchableOpacity key={item.id} style={styles.sugestao} onPress={() => escolherSugestao(item)}>
                <Ionicons name="location-outline" size={16} color={Brand.rose} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.sugestaoNome} numberOfLines={1}>{item.nome}</Text>
                  {!!item.endereco && <Text style={styles.sugestaoTexto} numberOfLines={1}>{item.endereco}</Text>}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.legenda}>
          <View style={styles.legendaItem}>
            <View style={[styles.legendaPonto, { backgroundColor: Brand.blue }]} />
            <Text style={styles.legendaTexto}>Você</Text>
          </View>
          {pontoBuscado && (
            <View style={styles.legendaItem}>
              <View style={[styles.legendaPonto, { backgroundColor: Brand.rose }]} />
              <Text style={styles.legendaTexto}>Endereço buscado</Text>
            </View>
          )}
          {/* Barra com a escala do próprio mapa, como nas legendas de mapa de calor. */}
          <Text style={styles.legendaTexto}>Ocorrências de crimes</Text>
          <View style={styles.legendaEscala} accessibilityLabel="Escala de cores: verde para menos ocorrências, vermelho para mais">
            {CORES_LEGENDA.map((cor) => <View key={cor} style={[styles.legendaFaixa, { backgroundColor: cor }]} />)}
          </View>
          <View style={styles.legendaExtremos}>
            <Text style={styles.legendaExtremoTexto}>Menos</Text>
            <Text style={styles.legendaExtremoTexto}>Mais</Text>
          </View>
        </View>

        {/* No centro do mapa, e não num canto: logo depois da busca o calor leva alguns
            segundos, e sem um aviso visível o mapa parece não ter crime nenhum ali. */}
        {(calorCarregando || mapaArrastando || desenhandoCalor) && centroInicial && (
          <View style={styles.carregandoCamada} pointerEvents="none">
            <View style={styles.carregando} accessibilityLiveRegion="polite">
              <ActivityIndicator size="small" color={TEMA.forte} />
              <Text style={styles.carregandoTexto}>Calculando mapa de calor…</Text>
            </View>
          </View>
        )}

        {(mapaMovido || pontoBuscado) && minhaPosicao && (
          <TouchableOpacity style={styles.botaoVoltar} onPress={voltarParaMim}>
            <Ionicons name="locate" size={16} color="#FFF" />
            <Text style={styles.botaoVoltarTexto}>Voltar para mim</Text>
          </TouchableOpacity>
        )}

        {centroInicial && (
          <ApoioPorPerto
            centro={pontoBuscado ?? minhaPosicao ?? centroInicial}
            onLugares={(lista) => setLugaresDeApoio(lista.filter((l) => Number.isFinite(l.latitude) && Number.isFinite(l.longitude)))}
            // Lugares vindos do caminho antigo não têm coordenada: aí o toque só não move o mapa.
            onEscolher={(l) => { if (Number.isFinite(l.latitude) && Number.isFinite(l.longitude)) moverCamera(cameraRef.current, l.latitude, l.longitude) }}
          />
        )}

        {/* Sem localização, o mapa abre no centro de SP; este aviso diz por quê. */}
        {erroLocalizacao && (
          <View style={styles.aviso}>
            <Ionicons name="information-circle-outline" size={18} color={TEMA.forte} />
            <Text style={styles.avisoTexto}>{erroLocalizacao}</Text>
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  topo: { paddingBottom: 14 },
  titulo: { fontSize: 22, color: TEMA.forte, fontWeight: '800', marginBottom: 10 },

  buscaCaixa: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 23, paddingHorizontal: 16, height: 46, backgroundColor: '#FFFFFF', marginBottom: 10 },
  buscaInput: { flex: 1, fontSize: 15, color: Brand.ink },

  filtroRow: { gap: 8, paddingRight: 20 },
  filtroChip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#FFF' },
  filtroChipAtivo: { backgroundColor: TEMA.forte },
  filtroTexto: { fontSize: 13, color: TEMA.forte, fontWeight: '600' },
  filtroTextoAtivo: { color: '#FFF' },
  periodoTexto: { color: '#776C73', fontSize: 12, marginTop: 8 },

  mapaArea: { flex: 1, marginHorizontal: 12, marginTop: 10, marginBottom: 8, borderRadius: 28, overflow: 'hidden' },
  mapa: { flex: 1 },
  localizando: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: TEMA.fundo },

  sugestoes: { position: 'absolute', top: 8, left: 8, right: 8, backgroundColor: '#FFF', borderRadius: 20, paddingVertical: 4, elevation: 8, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, zIndex: 10 },
  sugestao: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14 },
  sugestaoNome: { fontSize: 14, color: Brand.ink, fontWeight: '600' },
  sugestaoTexto: { fontSize: 12, color: Brand.muted, marginTop: 1 },

  legenda: { position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 18, paddingVertical: 8, paddingHorizontal: 12, gap: 6 },
  legendaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendaPonto: { width: 10, height: 10, borderRadius: 5 },
  legendaTexto: { fontSize: 11, color: Brand.ink, fontWeight: '600' },
  legendaEscala: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: -2 },
  legendaFaixa: { flex: 1 },
  legendaExtremos: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },
  legendaExtremoTexto: { fontSize: 10, color: Brand.muted },

  carregandoCamada: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  carregando: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 20, paddingVertical: 11, paddingHorizontal: 16, elevation: 4, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  carregandoTexto: { color: Brand.ink, fontSize: 13, fontWeight: '600' },

  botaoVoltar: { position: 'absolute', right: 12, bottom: 112, backgroundColor: TEMA.forte, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20 },
  botaoVoltarTexto: { color: '#FFF', fontWeight: '600', fontSize: 13 },

  aviso: { position: 'absolute', left: 10, right: 10, bottom: 160, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF', borderRadius: 20, padding: 12, elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  avisoTexto: { flex: 1, color: Brand.ink, fontSize: 13, lineHeight: 18 },

})
