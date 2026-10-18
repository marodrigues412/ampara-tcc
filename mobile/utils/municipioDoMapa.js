// Contornos do IBGE dos 9 municípios do recorte (data/municipios_rmsp.json, gerado de
// data/municipios_rmsp.geojson). Assim a reserva da cidade funciona mesmo quando o
// endereço reverso demora, falha ou não traz a cidade.
import limites from '../data/municipios_rmsp.json'
import { municipioPorCoordenada } from './municipioPorCoordenada'

export const municipioDoMapa = (latitude, longitude) => municipioPorCoordenada(latitude, longitude, limites)
