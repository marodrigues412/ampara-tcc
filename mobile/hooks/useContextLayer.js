import { useEffect, useRef, useState } from 'react'
import { buscarCelulaDeContexto } from '../services/contextRiskMapService'
import { buscarEnderecoReverso } from '../services/enderecoReverso'
import { avaliarContexto, localDoEndereco, periodoDoHorario } from '../utils/contextLayer'
import { distanceKm } from '../utils/geo'
import { municipioDoMapa } from '../utils/municipioDoMapa'

// Só refaz o endereço reverso depois de andar isso desde o último bairro que chegou.
const DISTANCIA_PARA_REGEOCODIFICAR_KM = 0.15
// Quanto esperar o bairro antes de usar a estimativa da cidade.
export const PRAZO_DO_BAIRRO_MS = 10_000
// Sem bairro (prazo, erro ou campo vazio), tenta de novo de tempos em tempos. A
// resposta atrasada costuma já estar no cache da fila.
const NOVA_TENTATIVA_MS = 30_000
// A virada de período (ex.: 17h59 → 18h00) precisa trocar a célula mesmo parada.
const CHECAGEM_PERIODO_MS = 60_000
// Erro ao buscar a célula no Supabase: tenta de novo depois disso.
const NOVA_BUSCA_DA_CELULA_MS = 15_000

const registrar = (titulo, dados) => { if (typeof __DEV__ !== 'undefined' && __DEV__) console.log(titulo, JSON.stringify(dados)) }

// Camada 1 (contexto) para a posição atual. `contexto` é null só enquanto o bairro não
// chega e o prazo não venceu ("calculando"); depois é sempre um resultado de
// avaliarContexto: do bairro, a estimativa da cidade ou "sem dados da região".
//
// O município vem dos contornos do IBGE, no próprio aparelho; o bairro, do endereço
// reverso. Antes, uma segunda posição logo depois da primeira (o iPhone manda as duas ao
// assinar o GPS) descartava a resposta do primeiro pedido e não pedia de novo, e a tela
// ficava em "Buscando o bairro…" para sempre.
export function useContextLayer({ location, insideSafeZone }) {
  // { municipio, bairro, estado: 'buscando' | 'pronto' | 'sem_bairro' }
  const [local, setLocal] = useState(null)
  const [resposta, setResposta] = useState(null)
  const [momento, setMomento] = useState(() => periodoDoHorario(new Date()))
  const [tentativa, setTentativa] = useState(0)
  const ultimoBairroRef = useRef(null) // ponto em que o último bairro chegou
  const pedidoRef = useRef(0) // número do pedido mais recente: só ele muda a tela
  const montadoRef = useRef(true)

  useEffect(() => () => { montadoRef.current = false }, [])

  useEffect(() => {
    const intervalo = setInterval(() => setMomento(periodoDoHorario(new Date())), CHECAGEM_PERIODO_MS)
    return () => clearInterval(intervalo)
  }, [])

  const latitude = location?.coords?.latitude
  const longitude = location?.coords?.longitude

  useEffect(() => {
    if (latitude == null || longitude == null) return undefined
    const anterior = ultimoBairroRef.current
    if (anterior && distanceKm(anterior.latitude, anterior.longitude, latitude, longitude) < DISTANCIA_PARA_REGEOCODIFICAR_KM) return undefined

    const numero = ++pedidoRef.current
    const municipio = municipioDoMapa(latitude, longitude)
    let novaTentativa = null
    buscarEnderecoReverso({ latitude, longitude, prioridade: 'protecao', prazoMs: PRAZO_DO_BAIRRO_MS }).then((r) => {
      if (!montadoRef.current || numero !== pedidoRef.current) return
      const doEndereco = r.enderecos ? localDoEndereco(r.enderecos) : { municipio: null, bairro: null }
      // O contorno do IBGE manda no município; o endereço só ajuda na borda.
      const municipioFinal = municipio ?? doEndereco.municipio
      registrar('[camada 1] local', {
        municipioDoContorno: municipio, municipioDoEndereco: doEndereco.municipio, bairro: doEndereco.bairro,
        expirou: r.expirou, erro: r.erro?.message ?? null, deCache: r.deCache,
      })
      if (doEndereco.bairro) {
        ultimoBairroRef.current = { latitude, longitude }
        setLocal({ municipio: municipioFinal, bairro: doEndereco.bairro, estado: 'pronto' })
      } else {
        // Sem bairro, a próxima tentativa não pode ser barrada pela distância.
        ultimoBairroRef.current = null
        setLocal({ municipio: municipioFinal, bairro: null, estado: 'sem_bairro' })
        novaTentativa = setTimeout(() => { if (montadoRef.current) setTentativa((t) => t + 1) }, NOVA_TENTATIVA_MS)
      }
    })
    // Sem "cancelado": a resposta de um pedido nunca é jogada fora por uma posição nova
    // no mesmo lugar; quem decide é o número do pedido.
    return () => { if (novaTentativa) clearTimeout(novaTentativa) }
  }, [latitude, longitude, tentativa])

  const temLocal = Boolean(local)
  const municipio = local?.municipio ?? null
  const bairro = local?.bairro ?? null
  const chaveAtual = `${municipio}|${bairro}|${momento}|${tentativa}`

  useEffect(() => {
    if (!temLocal) return undefined
    let ativo = true
    let novaBusca = null
    buscarCelulaDeContexto({ municipio, bairro }).then(({ celula, celulaDaCidade, erro }) => {
      if (!ativo) return
      setResposta({ chave: chaveAtual, celula, celulaDaCidade })
      if (erro) novaBusca = setTimeout(() => { if (montadoRef.current) setTentativa((t) => t + 1) }, NOVA_BUSCA_DA_CELULA_MS)
    })
    return () => { ativo = false; if (novaBusca) clearTimeout(novaBusca) }
  }, [temLocal, municipio, bairro, chaveAtual])

  const atual = temLocal && resposta?.chave === chaveAtual
  const contexto = atual
    ? avaliarContexto({ municipio, bairro, celula: resposta.celula, celulaDaCidade: resposta.celulaDaCidade, emLocalSeguro: insideSafeZone })
    : null

  return { contexto, local }
}
