// Contas do relatório (aba Relatório).
//
// Tudo aqui usa a coluna risco do histórico (data/historico_risco.sql): a mesma escala
// de 0 a 10 da tela Proteção, em que MAIOR = MAIS RISCO. Os pontos antigos, que só têm
// risk_score (outra escala), ficam de fora.

import { Brand } from '../constants/brandTheme'
import { DIAS_SEMANA } from './activitySchedule'
import { linhaDoTempo } from './rotina'
import { distanceKm } from './geo'
import { FRACAO_DO_ANO } from './mapaCalor'

// Mesmas faixas da tela Proteção (Home.js): > 8 crítico, >= 5 moderado.
export function nivelDoRisco(risco) {
  if (risco == null) return { rotulo: 'Sem dados', cor: Brand.muted, fundo: '#F3EFF1' }
  if (risco > 8) return { rotulo: 'Crítico', cor: Brand.danger, fundo: '#FBE3E7' }
  if (risco >= 5) return { rotulo: 'Moderado', cor: Brand.amber, fundo: Brand.amberSoft }
  return { rotulo: 'Baixo', cor: Brand.green, fundo: Brand.mint }
}

const comRisco = (pontos) => (pontos || []).filter((p) => p.risco != null)
const media = (valores) => (valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null)
const chaveDoDia = (data) => `${data.getFullYear()}-${data.getMonth()}-${data.getDate()}`

export function riscoMedio(pontos) {
  return media(comRisco(pontos).map((p) => p.risco))
}

// Um item por dia do período, do mais antigo ao de hoje, inclusive os dias sem registro
// (risco nulo): sem eles, a barra de terça encostaria na de sexta e o gráfico mentiria.
export function riscoPorDia(pontos, dias) {
  const porDia = {}
  comRisco(pontos).forEach((p) => {
    const chave = chaveDoDia(new Date(p.created_at))
    if (!porDia[chave]) porDia[chave] = []
    porDia[chave].push(p.risco)
  })
  const hoje = new Date()
  return Array.from({ length: dias }, (_, i) => {
    const data = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - (dias - 1 - i))
    return { data, rotulo: DIAS_SEMANA[data.getDay()].curto, risco: media(porDia[chaveDoDia(data)] ?? []) }
  })
}

// Compara com o período anterior do mesmo tamanho. Risco menor é melhor.
export function tendencia(pontosAtuais, pontosAnteriores) {
  const atual = riscoMedio(pontosAtuais)
  const anterior = riscoMedio(pontosAnteriores)
  if (atual == null || anterior == null || anterior === 0) return null
  const variacao = Math.round(((atual - anterior) / anterior) * 100)
  return { variacao, melhorou: variacao < 0, igual: variacao === 0 }
}

const PERIODOS_DO_DIA = [
  { id: 'manha', rotulo: 'Manhã', de: 6, ate: 12 },
  { id: 'tarde', rotulo: 'Tarde', de: 12, ate: 18 },
  { id: 'noite', rotulo: 'Noite', de: 18, ate: 24 },
  { id: 'madrugada', rotulo: 'Madrugada', de: 0, ate: 6 },
]

export function diasMonitorados(pontos) {
  return new Set(comRisco(pontos).map((p) => chaveDoDia(new Date(p.created_at)))).size
}

// Os trajetos da rotina (origem → destino, num horário), com o risco médio dos registros
// feitos nesse horário nos dias em que o trajeto acontece. Sem registro no horário, o
// risco vem nulo: o app só sabe do que mediu.
export function riscoDosTrajetos(compromissos, casa, pontos) {
  const validos = comRisco(pontos)
  const trajetos = new Map()
  const hoje = new Date()

  // Uma semana basta para achar todos os trajetos semanais.
  for (let i = 0; i < 7; i += 1) {
    const dia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + i)
    linhaDoTempo(compromissos, dia, casa)
      .filter((item) => item.tipo === 'trajeto')
      .forEach((item) => {
        const chave = `${item.origem}→${item.destino}@${item.saida}`
        if (!trajetos.has(chave)) trajetos.set(chave, { ...item, diasDaSemana: new Set() })
        trajetos.get(chave).diasDaSemana.add(dia.getDay())
      })
  }

  return [...trajetos.values()]
    .map((t) => {
      const valores = validos
        .filter((p) => {
          const data = new Date(p.created_at)
          const minuto = data.getHours() * 60 + data.getMinutes()
          return t.diasDaSemana.has(data.getDay()) && minuto >= t.saida && minuto <= t.chegada
        })
        .map((p) => p.risco)
      return {
        chave: `${t.origem}→${t.destino}@${t.saida}`,
        origem: t.origem,
        destino: t.destino,
        transporte: t.transporte,
        saida: t.saida,
        risco: media(valores),
        registros: valores.length,
      }
    })
    .sort((a, b) => a.saida - b.saida)
}

// Para ordenar e para o rótulo "dia de maior risco".
export function diaDeMaiorRisco(porDia) {
  const comDado = porDia.filter((d) => d.risco != null)
  if (!comDado.length) return null
  return comDado.reduce((pior, d) => (d.risco > pior.risco ? d : pior))
}


// --- Horários mais expostos (grade dia da semana × período do dia) ---

// A semana começa na segunda, como o calendário brasileiro costuma mostrar.
export const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0]
export const PERIODOS_GRADE = PERIODOS_DO_DIA

// grade[periodo.id][diaDaSemana] = risco médio (ou nulo). pior = a célula de maior risco.
export function horariosExpostos(pontos) {
  const somas = {}
  comRisco(pontos).forEach((p) => {
    const data = new Date(p.created_at)
    const hora = data.getHours()
    const periodo = PERIODOS_DO_DIA.find((pd) => hora >= pd.de && hora < pd.ate)
    const chave = `${periodo.id}|${data.getDay()}`
    if (!somas[chave]) somas[chave] = []
    somas[chave].push(p.risco)
  })

  const grade = {}
  let pior = null
  PERIODOS_DO_DIA.forEach((periodo) => {
    grade[periodo.id] = {}
    ORDEM_SEMANA.forEach((dia) => {
      const risco = media(somas[`${periodo.id}|${dia}`] ?? [])
      grade[periodo.id][dia] = risco
      if (risco != null && (!pior || risco > pior.risco)) pior = { risco, dia, periodo }
    })
  })
  return { grade, pior }
}

// "Sexta à noite", "Segunda de manhã"
const NOMES_DIA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const NO_PERIODO = { manha: 'de manhã', tarde: 'à tarde', noite: 'à noite', madrugada: 'de madrugada' }
export const descreverHorario = ({ dia, periodo }) => `${NOMES_DIA[dia]} ${NO_PERIODO[periodo.id]}`

// --- Lugares frequentes ---

// Pontos a menos disso uns dos outros contam como o mesmo lugar.
const RAIO_LUGAR_KM = 0.15
// O GPS grava a cada 50 m ou 5 min. Entre dois pontos seguidos no mesmo lugar, o tempo
// conta como "ficou lá"; acima disso, provavelmente o app ficou fechado no meio.
const INTERVALO_MAXIMO_MIN = 30
const TEMPO_MINIMO_MIN = 15

// Agrupa o histórico em lugares e estima quanto tempo ela passou em cada um.
// Devolve os mais frequentes, do maior tempo para o menor:
//   { latitude, longitude, minutos, pontos }
export function lugaresFrequentes(pontos, limite = 4) {
  const ordenados = (pontos || [])
    .filter((p) => p.latitude != null && p.longitude != null)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  const lugares = []
  let anterior = null
  ordenados.forEach((p) => {
    let lugar = lugares.find((l) => distanceKm(l.latitude, l.longitude, p.latitude, p.longitude) <= RAIO_LUGAR_KM)
    if (!lugar) {
      lugar = { latitude: p.latitude, longitude: p.longitude, minutos: 0, pontos: 0 }
      lugares.push(lugar)
    }
    // O centro acompanha a média dos pontos, para não ficar preso no primeiro registro.
    lugar.latitude = (lugar.latitude * lugar.pontos + p.latitude) / (lugar.pontos + 1)
    lugar.longitude = (lugar.longitude * lugar.pontos + p.longitude) / (lugar.pontos + 1)
    lugar.pontos += 1
    if (anterior && anterior.lugar === lugar) {
      const minutos = (new Date(p.created_at) - new Date(anterior.created_at)) / 60000
      lugar.minutos += Math.min(minutos, INTERVALO_MAXIMO_MIN)
    }
    anterior = { lugar, created_at: p.created_at }
  })

  return lugares
    .filter((l) => l.minutos >= TEMPO_MINIMO_MIN)
    .sort((a, b) => b.minutos - a.minutos)
    .slice(0, limite)
}

// Faixa da região pela densidade de crimes em 1 km (mesmos limites do score e do mapa).
// Fala em quantidade de registros, e não em "seguro": é o que os dados permitem afirmar.
export function nivelDaRegiao(resumoCrimes) {
  if (!resumoCrimes) return null
  const total = ['roubo', 'furto', 'violencia'].reduce((soma, id) => soma + (resumoCrimes[id] ?? 0), 0)
  const densidade = total / Math.PI
  if (densidade <= 250 * FRACAO_DO_ANO) return { rotulo: 'Poucos registros', cor: Brand.green, fundo: Brand.mint }
  if (densidade <= 700 * FRACAO_DO_ANO) return { rotulo: 'Registros moderados', cor: Brand.amber, fundo: Brand.amberSoft }
  return { rotulo: 'Muitos registros', cor: Brand.danger, fundo: '#FBE3E7' }
}

export const descreverTempo = (minutos) => {
  if (minutos < 60) return `${Math.round(minutos)} min`
  const horas = minutos / 60
  return horas < 10 ? `${horas.toFixed(1).replace('.', ',')} h` : `${Math.round(horas)} h`
}
