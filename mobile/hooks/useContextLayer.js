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

// Camada 1 (contexto) para a posição atual. `contexto` é null enquanto ainda não houve
// uma primeira resposta ("calculando"); depois é sempre o resultado de avaliarContexto,
// que pode ser indisponível ("sem dados da região").
export function useContextLayer({ location, insideSafeZone }) {
  const [local, setLocal] = useState(null)
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
      .then((enderecos) => { if (!cancelado) setLocal(localDoEndereco(enderecos?.[0])) })
      .catch((erro) => {
        console.log('Camada 1: endereço reverso falhou:', erro?.message)
        // Deixa tentar de novo no próximo ponto, e mostra "sem dados" em vez de travar.
        ultimoPontoRef.current = null
        if (!cancelado) setLocal({ municipio: null, bairro: null })
      })
    return () => { cancelado = true }
  }, [location])

  useEffect(() => {
    if (!local) return
    let cancelado = false
    const chave = `${local.municipio}|${local.bairro}|${momento}`
    buscarCelulaDeContexto({ municipio: local.municipio, bairro: local.bairro })
      .then(({ celula }) => { if (!cancelado) setResposta({ chave, celula }) })
    return () => { cancelado = true }
  }, [local, momento])

  const atual = local && resposta?.chave === `${local.municipio}|${local.bairro}|${momento}`
  const contexto = atual
    ? avaliarContexto({ municipio: local.municipio, bairro: local.bairro, celula: resposta.celula, emLocalSeguro: insideSafeZone })
    : null

  return { contexto, local }
}
