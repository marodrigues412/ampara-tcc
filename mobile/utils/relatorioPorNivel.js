// Contas do relatório por nível (score de 3 camadas), a partir de
// public.risk_level_report (data/risk_level_report.sql): avaliações da usuária por
// dia × hora × nível × modo de sensores. Cada avaliação vale ~30 s de monitoramento.
//
// Sem números de 0 a 10: só tempo e porcentagem de tempo em cada nível.

export const SEGUNDOS_POR_AVALIACAO = 30
export const NIVEIS = ['baixo', 'moderado', 'alto']
const ORDEM = { baixo: 0, moderado: 1, alto: 2 }

export const PERIODOS_DO_DIA = [
  { id: 'manha', rotulo: 'Manhã', de: 6, ate: 12 },
  { id: 'tarde', rotulo: 'Tarde', de: 12, ate: 18 },
  { id: 'noite', rotulo: 'Noite', de: 18, ate: 24 },
  { id: 'madrugada', rotulo: 'Madrugada', de: 0, ate: 6 },
]
// A semana começa na segunda, como no resto do relatório.
export const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0]

const pad = (n) => String(n).padStart(2, '0')
export const chaveDoDia = (data) => `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}`
const dataDaChave = (chave) => {
  const [a, m, d] = chave.split('-').map(Number)
  return new Date(a, m - 1, d)
}
export const periodoDaHora = (hora) => PERIODOS_DO_DIA.find((p) => hora >= p.de && hora < p.ate)
export const minutosDe = (avaliacoes) => (avaliacoes * SEGUNDOS_POR_AVALIACAO) / 60

const vazio = () => ({ baixo: 0, moderado: 0, alto: 0, sem_nivel: 0 })

// Linhas do RPC → formato interno. Nível fora da lista conta como sem nível.
export function normalizarLinhas(linhas) {
  return (linhas || []).map((l) => ({
    dia: String(l.dia),
    hora: Number(l.hora),
    nivel: Object.prototype.hasOwnProperty.call(ORDEM, l.nivel) ? l.nivel : 'sem_nivel',
    modo: l.modo_sensores ?? 'desconhecido',
    n: Number(l.avaliacoes) || 0,
  }))
}

function somar(linhas) {
  const contagens = vazio()
  linhas.forEach((l) => { contagens[l.nivel] += l.n })
  const comNivel = contagens.baixo + contagens.moderado + contagens.alto
  return { contagens, total: comNivel + contagens.sem_nivel, comNivel }
}

// Nível com mais tempo; empate fica com o mais alto. Nulo sem nenhum nível calculado.
export function predominante(contagens) {
  let melhor = null
  for (const nivel of NIVEIS) {
    if (contagens[nivel] > 0 && (!melhor || contagens[nivel] >= contagens[melhor])) melhor = nivel
  }
  return melhor
}

// % do tempo monitorado em cada nível (e sem nível), somando 100.
export function porcentagens({ contagens, total }) {
  if (!total) return null
  return Object.fromEntries(Object.entries(contagens).map(([k, v]) => [k, (100 * v) / total]))
}

// Um item por dia do período, do mais antigo a hoje, inclusive dias sem registro.
export function nivelPorDia(linhas, dias, hoje = new Date()) {
  const porChave = {}
  linhas.forEach((l) => { (porChave[l.dia] ??= []).push(l) })
  return Array.from({ length: dias }, (_, i) => {
    const data = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - (dias - 1 - i))
    const soma = somar(porChave[chaveDoDia(data)] ?? [])
    return { data, ...soma, pct: porcentagens(soma), predominante: predominante(soma.contagens) }
  })
}

// grade[periodo][diaDaSemana] = { predominante, pct, total }. pior = a célula com o nível
// predominante mais alto (desempate: maior % do tempo em alto).
export function gradePorNivel(linhas) {
  const grupos = {}
  linhas.forEach((l) => {
    const chave = `${periodoDaHora(l.hora).id}|${dataDaChave(l.dia).getDay()}`
    ;(grupos[chave] ??= []).push(l)
  })
  const grade = {}
  let pior = null
  PERIODOS_DO_DIA.forEach((periodo) => {
    grade[periodo.id] = {}
    ORDEM_SEMANA.forEach((dia) => {
      const soma = somar(grupos[`${periodo.id}|${dia}`] ?? [])
      const celula = { ...soma, pct: porcentagens(soma), predominante: predominante(soma.contagens) }
      grade[periodo.id][dia] = celula
      if (!celula.predominante) return
      const melhor = !pior
        || ORDEM[celula.predominante] > ORDEM[pior.celula.predominante]
        || (ORDEM[celula.predominante] === ORDEM[pior.celula.predominante] && celula.pct.alto > pior.celula.pct.alto)
      if (melhor) pior = { dia, periodo, celula }
    })
  })
  return { grade, pior }
}

// Totais do período para o destaque e o resumo da Lia.
export function resumoPorNivel(linhas) {
  const soma = somar(linhas)
  return {
    ...soma,
    pct: porcentagens(soma),
    minutos: Object.fromEntries(Object.entries(soma.contagens).map(([k, v]) => [k, minutosDe(v)])),
    minutosMonitorados: minutosDe(soma.total),
    diasComRegistro: new Set(linhas.filter((l) => l.n > 0).map((l) => l.dia)).size,
  }
}

// Diferença, em pontos percentuais, do tempo em alto contra o período anterior.
// Nula se algum dos dois períodos não tem tempo monitorado.
export function tendenciaDoAlto(atual, anterior) {
  if (!atual?.total || !anterior?.total) return null
  const pontos = Math.round(atual.pct.alto - anterior.pct.alto)
  return { pontos, melhorou: pontos < 0, igual: pontos === 0 }
}

// % do tempo em cada modo de sensores.
export function porModoDeSensores(linhas) {
  const somas = {}
  let total = 0
  linhas.forEach((l) => { somas[l.modo] = (somas[l.modo] ?? 0) + l.n; total += l.n })
  if (!total) return []
  return Object.entries(somas)
    .map(([modo, n]) => ({ modo, pct: (100 * n) / total, minutos: minutosDe(n) }))
    .sort((a, b) => b.pct - a.pct)
}

// Nível predominante numa janela de horas (ex.: o horário de um trajeto) nos dias da
// semana em que ela acontece. horaDe/horaAte em minutos do dia; conta as horas cheias
// que a janela toca.
export function nivelNaJanela(linhas, diasDaSemana, minutoDe, minutoAte) {
  const horaDe = Math.floor(minutoDe / 60)
  const horaAte = Math.floor(Math.max(minutoDe, minutoAte - 1) / 60)
  const dentro = linhas.filter((l) => diasDaSemana.includes(dataDaChave(l.dia).getDay()) && l.hora >= horaDe && l.hora <= horaAte)
  const soma = somar(dentro)
  return { ...soma, pct: porcentagens(soma), predominante: predominante(soma.contagens) }
}
