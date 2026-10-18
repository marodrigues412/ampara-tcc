import { useEffect, useRef, useState } from 'react'
import * as Location from 'expo-location'
import { buscarCelulaDeContexto } from '../services/contextRiskMapService'
import { avaliarContexto, diaDaSemana, localDoEndereco, periodoDoHorario } from '../utils/contextLayer'
import { distanceKm } from '../utils/geo'

// Só refaz o endereço reverso depois de andar isso: bairro não muda a cada passo, e o
// geocodificador do aparelho tem limite de chamadas.
const DISTANCIA_PARA_REGEOCODIFICAR_KM = 0.15
// A virada de período (ex.: 17h59 → 18h00) precisa trocar a célula mesmo parada.
const CHECAGEM_PERIODO_MS = 60_000

function chaveDoMomento(data) {
  return `${diaDaSemana(data)}|${periodoDoHorario(data)}`
}

// Camada 1 (contexto) para a posição atual. Com `localSimulado` (modo demonstração),
// usa esse município/bairro no lugar do endereço reverso; o GPS real segue intacto para
// o SOS e o mapa. `contexto` é null enquanto ainda não houve
// uma primeira resposta ("calculando"); depois é sempre o resultado de avaliarContexto,
// que pode ser indisponível ("sem dados da região").
export function useContextLayer({ location, insideSafeZone, localSimulado = null }) {
  const [localReal, setLocal] = useState(null)
  const local = localSimulado
    ? { municipio: localSimulado.municipio, bairro: localSimulado.bairro }
    : localReal
  // Guarda a chave junto da célula: resposta de outro bairro/período não conta, e a
  // tela volta a "calculando" até chegar a da posição e do horário atuais.
  const [resposta, setResposta] = useState(null)
  const [momento, setMomento] = useState(() => chaveDoMomento(new Date()))
  const ultimoPontoRef = useRef(null)

  useEffect(() => {
    const intervalo = setInterval(() => setMomento(chaveDoMomento(new Date())), CHECAGEM_PERIODO_MS)
    return () => clearInterval(intervalo)
  }, [])

  useEffect(() => {
    if (!location) return
    const { latitude, longitude } = location.coords
    const anterior = ultimoPontoRef.current
    if (anterior && distanceKm(anterior.latitude, anterior.longitude, latitude, longitude) < DISTANCIA_PARA_REGEOCODIFICAR_KM) return
    ultimoPontoRef.current = { latitude, longitude }

    let cancelado = false
    Location.reverseGeocodeAsync({ latitude, longitude })
      .then((enderecos) => { if (!cancelado) setLocal(localDoEndereco(enderecos)) })
      .catch((erro) => {
        console.log('Camada 1: endereço reverso falhou:', erro?.message)
        // Deixa tentar de novo no próximo ponto, e mostra "sem dados" em vez de travar.
        ultimoPontoRef.current = null
        if (!cancelado) setLocal({ municipio: null, bairro: null })
      })
    return () => { cancelado = true }
  }, [location])

  const temLocal = Boolean(local)
  const municipio = local?.municipio ?? null
  const bairro = local?.bairro ?? null
  const chaveAtual = `${municipio}|${bairro}|${momento}`

  useEffect(() => {
    if (!temLocal) return
    let cancelado = false
    buscarCelulaDeContexto({ municipio, bairro })
      .then(({ celula }) => { if (!cancelado) setResposta({ chave: chaveAtual, celula }) })
    return () => { cancelado = true }
  }, [temLocal, municipio, bairro, chaveAtual])

  const atual = temLocal && resposta?.chave === chaveAtual
  const contexto = atual
    ? avaliarContexto({ municipio, bairro, celula: resposta.celula, emLocalSeguro: insideSafeZone })
    : null

  return { contexto, local, simulado: Boolean(localSimulado) }
}
