import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Location from 'expo-location'
import { Platform } from 'react-native'
import { criarFilaDeEnderecos } from './filaDeEnderecos'

// Instância única da fila de endereço reverso (ver filaDeEnderecos.js). Use sempre esta,
// nunca Location.reverseGeocodeAsync direto: senão a cota do iPhone volta a ser disputada.
const fila = criarFilaDeEnderecos({
  geocodificar: (coordenadas) => Location.reverseGeocodeAsync(coordenadas),
  armazenamento: AsyncStorage,
  plataforma: Platform.OS,
  registrar: (titulo, dados) => { if (__DEV__) console.log(titulo, JSON.stringify(dados)) },
})

// prioridade: 'protecao' (tela Proteção e SOS) ou 'relatorio' (Relatório, Lia).
export function buscarEnderecoReverso({ latitude, longitude, prioridade = 'protecao', prazoMs = 10_000 }) {
  return fila.buscar({ latitude, longitude, prioridade, prazoMs })
}
