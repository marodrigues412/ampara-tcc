import * as Location from 'expo-location'
import { buscarCelulaDeContexto } from './contextRiskMapService'
import { avaliarContexto, localDoEndereco } from '../utils/contextLayer'
import { agruparPorCelula, resumirContextos } from '../utils/contextoDosLugares'

// Endereço reverso por quadradinho, guardado só na memória desta sessão do app.
const locaisPorCelula = new Map()

async function localDaCelula(celula) {
  if (locaisPorCelula.has(celula.chave)) return locaisPorCelula.get(celula.chave)
  let local = { municipio: null, bairro: null }
  try {
    local = localDoEndereco(await Location.reverseGeocodeAsync({ latitude: celula.latitude, longitude: celula.longitude }))
  } catch {
    // Sem endereço, os pontos desse quadradinho ficam "sem dados".
  }
  locaisPorCelula.set(celula.chave, local)
  return local
}

// Faixa do mapa (Camada 1) de cada ponto do histórico, no período do horário dele.
// O bairro sai do endereço reverso no aparelho, como na tela Proteção; nada é gravado.
export async function contextoDosLugares(pontos) {
  const { usadas, deFora } = agruparPorCelula(pontos)
  const avaliacoes = []
  for (const celula of usadas) {
    const local = await localDaCelula(celula)
    for (const ponto of celula.pontos) {
      const { celula: doBairro, celulaDaCidade } = await buscarCelulaDeContexto({ ...local, data: new Date(ponto.created_at) })
      const r = avaliarContexto({ ...local, celula: doBairro, celulaDaCidade })
      avaliacoes.push({ faixa: r.disponivel ? r.faixaDoMapa : null, origem: r.origem })
    }
  }
  return { ...resumirContextos(avaliacoes), pontosDeFora: deFora }
}
