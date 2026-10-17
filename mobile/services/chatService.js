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
export async function conversarComLia(pergunta, contexto = null) {
  const { data, error } = await supabase.functions.invoke('ampara-chat', {
    body: contexto ? { pergunta, contexto } : { pergunta },
  })

  if (error) throw error
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
