// Município do mapa (nome da SSP) a partir da coordenada, sem rede, por contornos
// oficiais do IBGE. Puro: o app usa utils/municipioDoMapa.js, que carrega os contornos.

// Raio par-ímpar num anel [[lon, lat], ...].
function dentroDoAnel(lon, lat, anel) {
  let dentro = false
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i]
    const [xj, yj] = anel[j]
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro
  }
  return dentro
}

// Polígono = [anel externo, ...buracos].
const dentroDoPoligono = (lon, lat, [externo, ...buracos]) =>
  dentroDoAnel(lon, lat, externo) && !buracos.some((b) => dentroDoAnel(lon, lat, b))

export function municipioPorCoordenada(latitude, longitude, dados) {
  if (!dados || latitude == null || longitude == null) return null
  const lat = Number(latitude)
  const lon = Number(longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  const achado = dados.municipios.find((m) => m.poligonos.some((p) => dentroDoPoligono(lon, lat, p)))
  return achado?.municipio ?? null
}
