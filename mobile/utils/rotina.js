// Regras da rotina da usuária (tabela routine_commitments).
//
// Este arquivo é a "fonte da verdade" de onde ela deveria estar a cada momento. A tela de
// rotina usa linhaDoTempo() para desenhar o dia; a detecção de desvio (score) deve usar
// estadoEsperado(), para as duas contarem a mesma história. Ver docs/rotina.md.
//
// Horas chegam do banco como "HH:MM:SS"; datas como "AAAA-MM-DD". Dias seguem
// Date.getDay(): 0 = domingo ... 6 = sábado.

import { distanceKm } from './geo'
import { DIAS_SEMANA, descreverDias } from './activitySchedule'

export const TIPOS_COMPROMISSO = [
  { id: 'estudo', rotulo: 'Estudo', icone: 'school-outline' },
  { id: 'trabalho', rotulo: 'Trabalho', icone: 'briefcase-outline' },
  { id: 'exercicio', rotulo: 'Exercício', icone: 'barbell-outline' },
  { id: 'saude', rotulo: 'Saúde', icone: 'medkit-outline' },
  { id: 'lazer', rotulo: 'Lazer', icone: 'restaurant-outline' },
  { id: 'outro', rotulo: 'Outro', icone: 'location-outline' },
]

// Velocidade média porta a porta em São Paulo, já contando espera e trânsito. São
// estimativas: sem um serviço de rotas, o app não conhece o caminho real.
export const TRANSPORTES = [
  { id: 'pe', rotulo: 'A pé', icone: 'walk-outline', kmh: 4.5, esperaMin: 0 },
  { id: 'bike', rotulo: 'Bike', icone: 'bicycle-outline', kmh: 13, esperaMin: 0 },
  { id: 'onibus', rotulo: 'Ônibus ou metrô', icone: 'bus-outline', kmh: 15, esperaMin: 10 },
  { id: 'carro', rotulo: 'Carro ou app', icone: 'car-outline', kmh: 20, esperaMin: 5 },
]

// A distância em linha reta subestima o caminho pelas ruas; 1,3 é a correção usual para
// malha urbana.
const FATOR_RUAS = 1.3
// Nenhum trajeto é estimado em menos que isso: sair, descer o elevador, atravessar a rua.
const TRAJETO_MINIMO_MIN = 5

// Modelos do "+ Novo compromisso": abrem o formulário já preenchido.
export const MODELOS_COMPROMISSO = [
  { nome: 'Faculdade', tipo: 'estudo', dias: [1, 2, 3, 4, 5], hora_chegada: '08:00', hora_saida: '12:00', transporte: 'onibus' },
  { nome: 'Trabalho', tipo: 'trabalho', dias: [1, 2, 3, 4, 5], hora_chegada: '09:00', hora_saida: '18:00', transporte: 'onibus' },
  { nome: 'Academia', tipo: 'exercicio', dias: [1, 3, 5], hora_chegada: '18:00', hora_saida: '19:00', transporte: 'pe', liga_modo_atividade: true },
]

export const COMPROMISSO_VAZIO = {
  nome: '',
  tipo: 'outro',
  local_nome: '',
  endereco: null,
  latitude: null,
  longitude: null,
  safe_location_id: null,
  dias: [1, 2, 3, 4, 5],
  data: null,
  hora_chegada: '08:00',
  hora_saida: '09:00',
  transporte: 'onibus',
  avisar_atraso: true,
  tolerancia_min: 20,
  liga_modo_atividade: false,
  ativo: true,
}

export const minutosDoDia = (hora) => {
  const [h, m] = String(hora).split(':').map(Number)
  return h * 60 + m
}

export const horaDosMinutos = (minutos) => {
  const total = ((Math.round(minutos) % 1440) + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

// "AAAA-MM-DD" da data local (toISOString usaria UTC e trocaria o dia depois das 21h).
export const dataLocal = (data) =>
  `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`

export function valeNoDia(compromisso, dia) {
  if (!compromisso.ativo) return false
  if (compromisso.data) return compromisso.data === dataLocal(dia)
  return (compromisso.dias || []).includes(dia.getDay())
}

export function compromissosDoDia(lista, dia) {
  return lista
    .filter((c) => valeNoDia(c, dia))
    .sort((a, b) => minutosDoDia(a.hora_chegada) - minutosDoDia(b.hora_chegada))
}

// Tempo estimado entre dois pontos, em minutos.
export function estimarTrajetoMin(origem, destino, transporte) {
  const meio = TRANSPORTES.find((t) => t.id === transporte) ?? TRANSPORTES[2]
  const km = distanceKm(origem.latitude, origem.longitude, destino.latitude, destino.longitude) * FATOR_RUAS
  return Math.max(TRAJETO_MINIMO_MIN, Math.round((km / meio.kmh) * 60 + meio.esperaMin))
}

const pontoDe = (c) => ({ nome: c.local_nome, latitude: c.latitude, longitude: c.longitude })

// O dia como sequência de itens: trajeto → compromisso → trajeto → ... → trajeto para casa.
//
// casa é o local seguro do tipo "Casa" (ou null). Sem ela, o primeiro trajeto do dia e a
// volta não podem ser estimados e ficam de fora; os trajetos entre compromissos continuam.
//
// Cada trajeto traz:
//   saida      quando ela precisa sair (ou quando saiu do compromisso anterior)
//   chegada    quando deveria chegar (o hora_chegada do destino; para casa, a estimativa)
//   minutos    duração estimada
//   apertado   true se o tempo entre um compromisso e outro é menor que o trajeto
export function linhaDoTempo(lista, dia, casa) {
  const doDia = compromissosDoDia(lista, dia)
  const itens = []

  doDia.forEach((compromisso, indice) => {
    const anterior = doDia[indice - 1]
    const origem = anterior ? pontoDe(anterior) : casa && { nome: casa.nome, latitude: casa.latitude, longitude: casa.longitude }
    if (origem) {
      const minutos = estimarTrajetoMin(origem, compromisso, compromisso.transporte)
      const chegada = minutosDoDia(compromisso.hora_chegada)
      const saidaIdeal = chegada - minutos
      const saidaAnterior = anterior ? minutosDoDia(anterior.hora_saida) : null
      itens.push({
        tipo: 'trajeto',
        chave: `t-${compromisso.id ?? indice}`,
        origem: origem.nome,
        destino: compromisso.local_nome,
        transporte: compromisso.transporte,
        minutos,
        // Entre dois compromissos, ela sai quando o anterior acaba; antes do primeiro,
        // no horário que dá para chegar a tempo.
        saida: saidaAnterior ?? saidaIdeal,
        chegada,
        apertado: saidaAnterior !== null && saidaAnterior > saidaIdeal,
        compromisso,
      })
    }
    itens.push({ tipo: 'compromisso', chave: `c-${compromisso.id ?? indice}`, compromisso })
  })

  const ultimo = doDia[doDia.length - 1]
  if (ultimo && casa) {
    const minutos = estimarTrajetoMin(ultimo, casa, ultimo.transporte)
    const saida = minutosDoDia(ultimo.hora_saida)
    itens.push({
      tipo: 'trajeto',
      chave: 'volta',
      origem: ultimo.local_nome,
      destino: casa.nome,
      transporte: ultimo.transporte,
      minutos,
      saida,
      chegada: saida + minutos,
      apertado: false,
      volta: true,
      compromisso: null,
    })
  }

  return itens
}

// Onde a usuária deveria estar agora, segundo a rotina. É o ponto de partida da
// detecção de desvio (score), que fica fora daqui.
//
// Retorna um de:
//   { tipo: 'compromisso', compromisso }            entre chegada e saída
//   { tipo: 'trajeto', trajeto, limiteChegada }     entre a saída e a chegada + tolerância;
//                                                   limiteChegada em minutos do dia
//   { tipo: 'livre' }                               nada previsto agora
//
// O trajeto vem antes do compromisso de propósito: entre hora_chegada e
// hora_chegada + tolerancia_min ela ainda pode estar a caminho, e só depois disso o
// atraso deve ser estranhado.
export function estadoEsperado(lista, agora, casa) {
  const minutoAgora = agora.getHours() * 60 + agora.getMinutes()
  const itens = linhaDoTempo(lista, agora, casa)

  for (const item of itens) {
    if (item.tipo !== 'trajeto') continue
    const tolerancia = item.compromisso?.tolerancia_min ?? 20
    const limiteChegada = item.chegada + tolerancia
    if (minutoAgora >= item.saida && minutoAgora < limiteChegada) {
      return { tipo: 'trajeto', trajeto: item, limiteChegada }
    }
  }
  for (const item of itens) {
    if (item.tipo !== 'compromisso') continue
    const inicio = minutosDoDia(item.compromisso.hora_chegada)
    const fim = minutosDoDia(item.compromisso.hora_saida)
    if (minutoAgora >= inicio && minutoAgora < fim) return { tipo: 'compromisso', compromisso: item.compromisso }
  }
  return { tipo: 'livre' }
}

// Compromissos de exercício que ligam o modo atividade, no formato que a Home já usa para
// os horários de atividade (utils/activitySchedule.js). Um compromisso de data única só
// vale no próprio dia.
export function comoHorariosDeAtividade(lista, hoje) {
  return lista
    .filter((c) => c.ativo && c.tipo === 'exercicio' && c.liga_modo_atividade)
    .map((c) => ({
      ativo: true,
      nome: c.nome,
      dias: c.data ? (c.data === dataLocal(hoje) ? [hoje.getDay()] : []) : c.dias,
      hora_inicio: c.hora_chegada,
      hora_fim: c.hora_saida,
    }))
}

// Abre a aba Mapa centrada no local do compromisso, para ver como está a região.
// pedidoEm faz o mapa reagir mesmo quando o mesmo lugar é pedido duas vezes.
export function abrirNoMapa(navigation, compromisso) {
  navigation.navigate('Tabs', {
    screen: 'Mapa',
    params: {
      ponto: { latitude: compromisso.latitude, longitude: compromisso.longitude, nome: compromisso.local_nome },
      pedidoEm: Date.now(),
    },
  })
}

// Primeiro compromisso dos próximos 7 dias (sem contar hoje), com o trajeto até ele.
// Usado quando o dia de hoje já acabou ou está vazio. Nulo se a semana não tem nada.
export function proximoNosProximosDias(lista, hoje, casa) {
  for (let adiante = 1; adiante <= 7; adiante += 1) {
    const dia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + adiante)
    const itens = linhaDoTempo(lista, dia, casa)
    const item = itens.find((i) => i.tipo === 'compromisso')
    if (item) {
      const trajeto = itens.find((i) => i.tipo === 'trajeto' && i.compromisso === item.compromisso) ?? null
      return { dia, adiante, compromisso: item.compromisso, trajeto }
    }
  }
  return null
}

// "Seg a sex", "Sáb, 18/10"...
export function descreverRecorrencia(compromisso) {
  if (compromisso.data) {
    const [ano, mes, dia] = compromisso.data.split('-').map(Number)
    const data = new Date(ano, mes - 1, dia)
    return `${DIAS_SEMANA[data.getDay()].nome}, ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`
  }
  return descreverDias(compromisso.dias || [])
}
