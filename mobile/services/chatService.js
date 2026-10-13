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
