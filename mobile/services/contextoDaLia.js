import * as Location from 'expo-location'
import { supabase } from './supabase'
import { getRecentLocationHistory, getLocationHistoryBetween } from './locationService'
import { buscarResumoCrimes } from './crimesService'
import { listarCompromissos, listarLocaisSeguros } from './routineService'
import { riscoMedio, nivelDoRisco, tendencia, horariosExpostos, descreverHorario, nivelDaRegiao } from '../utils/relatorio'
import { linhaDoTempo, proximoNosProximosDias, minutosDoDia, horaDosMinutos } from '../utils/rotina'
import { estadoDoRiscoParaLia } from './estadoDoRisco'

// Contexto da usuária para a Lia, enviado só quando ela liga "Personalizar com meus
// dados" no chat. Usa as mesmas contas do Relatório, do Mapa e da Rotina, para a Lia
// nunca dizer um número diferente do que a usuária vê nas outras telas.
//
// A coordenada vai para a função ampara-chat (que busca lugares próximos com ela), mas a
// função não a repassa para a IA: o modelo recebe só o bairro e os resumos em texto.

// Montar o contexto faz várias consultas; numa conversa, ele quase não muda entre uma
// mensagem e outra.
const VALIDADE_MS = 2 * 60 * 1000
let guardado = null

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
const formatarRisco = (risco) => risco.toFixed(1).replace('.', ',')
// O risco atual e o histórico saem do score de pontos 0–10, que não é mais o que a tela
// Proteção mostra (lá é o nível das 3 camadas). Até o relatório passar para os níveis,
// a Lia não recebe esse número, para não falar de um segundo score. A função
// ampara-chat ignora campos vazios.
const ENVIAR_SCORE_DE_PONTOS = false

async function posicaoAtual() {
  const { status } = await Location.getForegroundPermissionsAsync()
  if (status !== 'granted') return null
  const ultima = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 })
  const posicao = ultima ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
  return posicao ? { latitude: posicao.coords.latitude, longitude: posicao.coords.longitude } : null
}

async function bairroDe({ latitude, longitude }) {
  try {
    const [endereco] = await Location.reverseGeocodeAsync({ latitude, longitude })
    const bairro = endereco?.district || endereco?.subregion
    const cidade = endereco?.city || endereco?.subregion
    return [bairro, cidade].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ') || null
  } catch {
    return null
  }
}

// "8,0 (crítico), registrado há 12 min"
function descreverRiscoAtual(historicoDoDia) {
  const ultimo = [...historicoDoDia].reverse().find((p) => p.risco != null)
  if (!ultimo) return null
  const minutos = Math.round((Date.now() - new Date(ultimo.created_at).getTime()) / 60000)
  if (minutos > 180) return null
  return `${formatarRisco(ultimo.risco)} (${nivelDoRisco(ultimo.risco).rotulo.toLowerCase()}), registrado há ${minutos} min`
}

// "Faculdade, hoje às 08:00 (sair por volta de 07:20)"
function descreverProximoCompromisso(compromissos, casa, agora) {
  if (!compromissos.length) return null
  const minutoAgora = agora.getHours() * 60 + agora.getMinutes()
  const itens = linhaDoTempo(compromissos, agora, casa)
  const doDia = itens.filter((i) => i.tipo === 'compromisso').map((i) => i.compromisso)
  const emAndamento = doDia.find((c) => minutoAgora >= minutosDoDia(c.hora_chegada) && minutoAgora < minutosDoDia(c.hora_saida))
  if (emAndamento) return `${emAndamento.nome} agora, até ${emAndamento.hora_saida.slice(0, 5)}`
  const proximo = doDia.find((c) => minutosDoDia(c.hora_chegada) > minutoAgora)
  if (proximo) {
    const trajeto = itens.find((i) => i.tipo === 'trajeto' && i.compromisso === proximo)
    return `${proximo.nome}, hoje às ${proximo.hora_chegada.slice(0, 5)}${trajeto ? ` (sair por volta de ${horaDosMinutos(trajeto.saida)})` : ''}`
  }
  const futuro = proximoNosProximosDias(compromissos, agora, casa)
  if (!futuro) return null
  const quando = futuro.adiante === 1 ? 'amanhã' : DIAS[futuro.dia.getDay()]
  return `${futuro.compromisso.nome}, ${quando} às ${futuro.compromisso.hora_chegada.slice(0, 5)}`
}

// "risco médio 3,2 (baixo) nos últimos 7 dias, 26% menor que na semana anterior; horário mais exposto: sexta à noite"
function descreverHistorico(semana, semanaAnterior) {
  const media = riscoMedio(semana)
  if (media == null) return null
  const partes = [`risco médio ${formatarRisco(media)} (${nivelDoRisco(media).rotulo.toLowerCase()}) nos últimos 7 dias`]
  const variacao = tendencia(semana, semanaAnterior)
  if (variacao && !variacao.igual) partes[0] += `, ${Math.abs(variacao.variacao)}% ${variacao.melhorou ? 'menor' : 'maior'} que na semana anterior`
  const { pior } = horariosExpostos(semana)
  if (pior) partes.push(`horário mais exposto: ${descreverHorario(pior).toLowerCase()}`)
  return partes.join('; ')
}

// O nível atual muda a qualquer momento: é lido a cada mensagem, fora do guardado.
// Só rótulos (nível, origem, sensores); nota da célula e bairro não entram.
function comEstadoAtual(contexto) {
  const estado = estadoDoRiscoParaLia()
  return {
    ...contexto,
    nivelAtual: estado?.nivelAtual ?? null,
    origemDoContexto: estado?.origemDoContexto ?? null,
    modoDosSensores: estado?.modoDosSensores ?? null,
  }
}

export async function montarContextoDaLia() {
  if (guardado && Date.now() - guardado.em < VALIDADE_MS) return comEstadoAtual(guardado.contexto)

  const { data } = await supabase.auth.getUser()
  const userId = data?.user?.id
  if (!userId) return null

  const agora = new Date()
  const umaSemanaAtras = new Date(agora.getTime() - 7 * 86400000)
  const duasSemanasAtras = new Date(agora.getTime() - 14 * 86400000)

  const [posicao, semana, semanaAnterior, compromissos, locais] = await Promise.all([
    posicaoAtual().catch(() => null),
    getRecentLocationHistory(userId, 7),
    getLocationHistoryBetween(userId, duasSemanasAtras, umaSemanaAtras),
    listarCompromissos(userId),
    listarLocaisSeguros(userId),
  ])
  const casa = locais.find((l) => String(l.tipo).toLowerCase() === 'casa') ?? null

  const [bairro, resumoDaRegiao] = posicao
    ? await Promise.all([bairroDe(posicao), buscarResumoCrimes(posicao.latitude, posicao.longitude, 1)])
    : [null, null]
  const doDia = semana.filter((p) => new Date(p.created_at).toDateString() === agora.toDateString())

  const contexto = {
    latitude: posicao?.latitude ?? null,
    longitude: posicao?.longitude ?? null,
    bairro,
    regiao: nivelDaRegiao(resumoDaRegiao)?.rotulo.toLowerCase() ?? null,
    riscoAtual: ENVIAR_SCORE_DE_PONTOS ? descreverRiscoAtual(doDia) : null,
    proximoCompromisso: descreverProximoCompromisso(compromissos, casa, agora),
    historico: ENVIAR_SCORE_DE_PONTOS ? descreverHistorico(semana, semanaAnterior) : null,
    dataHora: `${DIAS[agora.getDay()]}, ${agora.toLocaleDateString('pt-BR')} às ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
  }
  guardado = { em: Date.now(), contexto }
  return comEstadoAtual(contexto)
}

// Quando ela desliga o compartilhamento, o contexto guardado não pode ser reaproveitado.
export function esquecerContextoDaLia() {
  guardado = null
}
