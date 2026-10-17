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
