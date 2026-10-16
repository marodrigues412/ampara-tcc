// Busca de endereço e lugares, usada pela aba Mapa e pelo cadastro de compromissos.
//
// Usa o Photon (photon.komoot.io), feito para autocompletar enquanto se digita: acha
// "Rua Aug" e "mcdonalds paul" com a palavra pela metade, o que o Nominatim não faz. Os
// dois usam os dados do OpenStreetMap e não pedem chave.

// Só dentro da área coberta pelos dados de crime (Grande SP): sugerir um endereço fora
// dela levaria a um mapa sem cor, como se lá não houvesse crime.
// Ordem do Photon: oeste, sul, leste, norte.
const AREA_BUSCA = '-47.05,-23.85,-46.15,-23.25'
const CENTRO_SP = { latitude: -23.5505, longitude: -46.6333 }

// Curto o bastante para parecer instantâneo, longo o bastante para não buscar a cada
// letra de quem digita rápido.
export const ESPERA_DIGITACAO_MS = 300

// Uma sugestão já no formato que as telas usam:
//   { id, nome, endereco, latitude, longitude }
const paraSugestao = (feature) => {
  const p = feature.properties || {}
  const [longitude, latitude] = feature.geometry?.coordinates || []
  const rua = [p.street, p.housenumber].filter(Boolean).join(', ')
  const bairro = p.district || p.locality
  const cidade = p.city || p.county
  const nome = p.name || rua || bairro || cidade || 'Local'
  const endereco = [rua !== nome ? rua : null, bairro, cidade].filter(Boolean).join(' · ')
  return { id: `${p.osm_type}${p.osm_id}`, nome, endereco, latitude, longitude }
}

// perto: ponto opcional para priorizar resultados próximos (a posição da usuária).
export async function buscarEnderecos(texto, perto = CENTRO_SP) {
  const parametros = new URLSearchParams({
    q: texto,
    limit: '6',
    lat: String(perto.latitude),
    lon: String(perto.longitude),
    bbox: AREA_BUSCA,
  })
  try {
    const resposta = await fetch(`https://photon.komoot.io/api/?${parametros}`, {
      headers: { 'User-Agent': 'ampara-tcc-app' },
    })
    const dados = await resposta.json()
    const vistos = new Set()
    // O OpenStreetMap divide uma rua longa em vários trechos com o mesmo nome; mostrar
    // "Rua Augusta · Consolação" três vezes só confunde.
    return (dados.features || []).map(paraSugestao).filter((s) => {
      const chave = `${s.nome}|${s.endereco}`
      if (vistos.has(chave) || !Number.isFinite(s.latitude)) return false
      vistos.add(chave)
      return true
    })
  } catch {
    return []
  }
}
