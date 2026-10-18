import { buscarEnderecoReverso } from './enderecoReverso'
import { buscarCelulaDeContexto } from './contextRiskMapService'
import { avaliarContexto, localDoEndereco } from '../utils/contextLayer'
import { agruparPorCelula, resumirContextos } from '../utils/contextoDosLugares'
import { municipioDoMapa } from '../utils/municipioDoMapa'

// Bairro por quadradinho, nesta sessão. O endereço em si fica no cache da fila
// (enderecoReverso.js), que também sobrevive a fechar o app.
const locaisPorCelula = new Map()

async function localDaCelula(celula) {
  if (locaisPorCelula.has(celula.chave)) return locaisPorCelula.get(celula.chave)
  // Prioridade do Relatório: espera a tela Proteção e sai espaçado (cota do iPhone).
  const { enderecos } = await buscarEnderecoReverso({ latitude: celula.latitude, longitude: celula.longitude, prioridade: 'relatorio', prazoMs: 20_000 })
  const doEndereco = enderecos ? localDoEndereco(enderecos) : { municipio: null, bairro: null }
  // Município pelo contorno do IBGE, como na tela Proteção; sem bairro, vale a cidade.
  const local = { municipio: municipioDoMapa(celula.latitude, celula.longitude) ?? doEndereco.municipio, bairro: doEndereco.bairro }
  // Só guarda quando o endereço veio: sem ele, tenta de novo na próxima abertura.
  if (enderecos) locaisPorCelula.set(celula.chave, local)
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
