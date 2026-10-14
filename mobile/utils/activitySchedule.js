// Regras dos horários programados de atividade (tabela activity_schedules).
//
// dias segue Date.getDay(): 0 = domingo ... 6 = sábado. Horas chegam do banco como
// "HH:MM:SS".

export const DIAS_SEMANA = [
  { id: 0, curto: 'D', nome: 'Dom' },
  { id: 1, curto: 'S', nome: 'Seg' },
  { id: 2, curto: 'T', nome: 'Ter' },
  { id: 3, curto: 'Q', nome: 'Qua' },
  { id: 4, curto: 'Q', nome: 'Qui' },
  { id: 5, curto: 'S', nome: 'Sex' },
  { id: 6, curto: 'S', nome: 'Sáb' },
]

const minutosDoDia = (hora) => {
  const [h, m] = String(hora).split(':').map(Number)
  return h * 60 + m
}

// Devolve o horário que está valendo agora, ou null.
//
// Um horário que termina antes de começar (23:00 às 01:00) atravessa a meia-noite: depois
// da meia-noite ele ainda vale, mas pertence ao dia anterior. Sem essa conta, o treino de
// sexta à noite seria encerrado à meia-noite, ou ligaria sozinho no sábado.
export function horarioAtivoAgora(horarios, agora) {
  const minutoAgora = agora.getHours() * 60 + agora.getMinutes()
  const hoje = agora.getDay()
  const ontem = (hoje + 6) % 7

  return horarios.find((h) => {
    if (!h.ativo) return false
    const inicio = minutosDoDia(h.hora_inicio)
    const fim = minutosDoDia(h.hora_fim)
    if (inicio < fim) {
      return h.dias.includes(hoje) && minutoAgora >= inicio && minutoAgora < fim
    }
    return (h.dias.includes(hoje) && minutoAgora >= inicio)
      || (h.dias.includes(ontem) && minutoAgora < fim)
  }) ?? null
}

// Texto curto para a Home: "Hoje 08:00", "Amanhã 08:00" ou "Seg 08:00".
// Nulo quando não há horário ativo nos próximos 7 dias.
export function descreverProximoHorario(horarios, agora) {
  const minutoAgora = agora.getHours() * 60 + agora.getMinutes()
  let melhor = null

  for (const h of horarios) {
    if (!h.ativo) continue
    const inicio = minutosDoDia(h.hora_inicio)
    for (let adiante = 0; adiante < 7; adiante += 1) {
      const dia = (agora.getDay() + adiante) % 7
      if (!h.dias.includes(dia)) continue
      if (adiante === 0 && inicio <= minutoAgora) continue
      const distancia = adiante * 1440 + inicio
      if (!melhor || distancia < melhor.distancia) melhor = { distancia, adiante, dia, h }
      break
    }
  }

  if (!melhor) return null
  const quando = melhor.adiante === 0 ? 'Hoje'
    : melhor.adiante === 1 ? 'Amanhã'
      : DIAS_SEMANA[melhor.dia].nome
  return `${quando} ${melhor.h.hora_inicio.slice(0, 5)}`
}

// "Seg a sex", "Todos os dias", "Sáb, dom"...
export function descreverDias(dias) {
  const ordenados = [...dias].sort((a, b) => a - b)
  const chave = ordenados.join(',')
  if (chave === '0,1,2,3,4,5,6') return 'Todos os dias'
  if (chave === '1,2,3,4,5') return 'Seg a sex'
  if (chave === '0,6') return 'Fim de semana'
  // Começa a lista na segunda, como o calendário brasileiro costuma mostrar.
  return [1, 2, 3, 4, 5, 6, 0]
    .filter((d) => ordenados.includes(d))
    .map((d) => DIAS_SEMANA[d].nome)
    .join(', ')
}
