import { supabase } from './supabase'

export async function perguntarAIA(pergunta) {
  const { data, error } = await supabase.functions.invoke('ampara-chat', {
    body: { pergunta },
  })

  if (error) throw error
  if (typeof data?.resposta !== 'string' || !data.resposta.trim()) {
    throw new Error('Resposta inválida do assistente')
  }

  return data.resposta.trim()
}

// Conversa do chat: além da resposta, pode trazer lugares próximos (delegacias,
// hospitais) buscados pela função ampara-chat, para o app mostrar em cartões.
// contexto: o que montarContextoDaLia() devolve, ou null se ela não compartilhou.
// Explica em uma frase por que a conversa falhou, para a mensagem do chat dizer o motivo
// real (e não sempre "não consegui acessar a IA"). A função ampara-chat devolve o campo
// `motivo` nos erros dela; sem resposta da função, o motivo vem do próprio tipo de erro.
async function motivoDaFalha(error) {
  if (error?.name === 'FunctionsFetchError') return 'sem internet, ou o Supabase não respondeu'
  if (error?.name === 'FunctionsRelayError') return 'o Supabase não conseguiu chegar até a função da Lia'
  const resposta = error?.context
  if (resposta && typeof resposta.json === 'function') {
    const corpo = await resposta.clone().json().catch(() => null)
    if (corpo?.motivo) return corpo.motivo
    if (resposta.status === 404) return 'a função ampara-chat não está publicada no Supabase'
    return `a função da Lia respondeu HTTP ${resposta.status}`
  }
  return null
}

export async function conversarComLia(pergunta, contexto = null) {
  const { data, error } = await supabase.functions.invoke('ampara-chat', {
    body: contexto ? { pergunta, contexto } : { pergunta },
  })

  if (error) {
    const falha = new Error(error.message)
    falha.motivo = await motivoDaFalha(error)
    throw falha
  }
  if (typeof data?.resposta !== 'string' || !data.resposta.trim()) {
    throw new Error('Resposta inválida do assistente')
  }

  return {
    resposta: data.resposta.trim(),
    lugares: Array.isArray(data.lugares) ? data.lugares : [],
    tipoLugar: data.tipoLugar ?? null,
  }
}

// "Apoio por perto" do Mapa: lugares de uma categoria (ddm, delegacia, farmacia,
// hospital) perto de um ponto, buscados pela mesma função, sem passar pela IA.
//
// Se a função publicada ainda não tiver o pedido { acao: 'lugares' } (versão antiga no
// ar), cai no caminho do chat da Lia, que também devolve os lugares buscados: mais lento
// e sem coordenadas para os pinos, mas a lista aparece.
const PERGUNTA_DA_CATEGORIA = {
  ddm: 'Onde fica a delegacia da mulher mais perto?',
  delegacia: 'Onde fica a delegacia mais perto?',
  farmacia: 'Onde tem farmácia aberta agora perto de mim?',
  hospital: 'Onde fica o pronto-socorro mais perto?',
}

export async function buscarApoioPorPerto(categoria, latitude, longitude) {
  try {
    const { data, error } = await supabase.functions.invoke('ampara-chat', {
      body: { acao: 'lugares', categoria, latitude, longitude },
    })
    if (!error && Array.isArray(data?.lugares)) return data.lugares
  } catch {
    // segue para o caminho do chat
  }
  const { lugares } = await conversarComLia(PERGUNTA_DA_CATEGORIA[categoria], { latitude, longitude })
  return lugares
}
