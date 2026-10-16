import { useEffect, useRef, useState } from 'react'
import { buscarEnderecos, ESPERA_DIGITACAO_MS } from '../services/addressSearch'

// Campo de busca com autocompletar: guarda o texto, busca enquanto a usuária digita e
// devolve as sugestões. Usado pela aba Mapa e pelo cadastro de compromissos.
//
// perto: ponto opcional para priorizar resultados próximos dela.
export function useAddressSearch(perto) {
  const [busca, setBusca] = useState('')
  const [sugestoes, setSugestoes] = useState([])
  const espera = useRef(null)
  // Cada letra pode disparar uma busca, e elas podem voltar fora de ordem. Só a resposta
  // do texto mais recente é mostrada; sem isso, "Rua Aug" podia sobrescrever "Rua Augusta".
  const ultimaBusca = useRef('')

  useEffect(() => () => clearTimeout(espera.current), [])

  const procurar = (texto) => {
    setBusca(texto)
    clearTimeout(espera.current)
    ultimaBusca.current = texto
    if (texto.trim().length < 3) { setSugestoes([]); return }
    espera.current = setTimeout(async () => {
      const resultado = await buscarEnderecos(texto, perto ?? undefined)
      if (ultimaBusca.current === texto) setSugestoes(resultado)
    }, ESPERA_DIGITACAO_MS)
  }

  const limpar = (textoFinal = '') => {
    clearTimeout(espera.current)
    ultimaBusca.current = textoFinal
    setBusca(textoFinal)
    setSugestoes([])
  }

  return { busca, sugestoes, procurar, limpar }
}
