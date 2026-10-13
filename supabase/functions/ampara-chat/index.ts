const PROVIDER_URL = 'https://ia.maua.br/api/v1/chat/completions'
const MODEL = 'google/gemma-3-27b'
const MAX_QUESTION_LENGTH = 1200

const SYSTEM_PROMPT = `Você é Lia, a assistente de IA do aplicativo Ampara. Suas respostas são geradas pelo modelo Google Gemma disponibilizado pela IA da Mauá (Barô). Se perguntarem se você é o Barô, explique brevemente que você é a Lia do Ampara e usa a IA da Mauá para responder. Fale em português brasileiro, com empatia e naturalidade. Responda diretamente ao que foi perguntado, em no máximo 2 a 4 frases; não se reapresente a cada mensagem e não acrescente contexto que não foi pedido. Use listas só quando ajudarem. Ajude com dúvidas sobre o Ampara e orientações gerais de segurança. Não prometa proteção nem atendimento de emergência. Não diagnostique nem dê aconselhamento jurídico definitivo. Em perigo imediato, oriente ligar para 190; para orientação e denúncias de violência contra a mulher, informe o 180. Não peça nem incentive o envio de dados pessoais, endereço preciso, contatos, senhas ou dados de saúde. Se não souber, diga com clareza.`

function json(body: unknown, status: number, origin?: string) {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Vary', 'Origin')
  }
  return new Response(JSON.stringify(body), { status, headers })
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') ?? undefined
  const allowedOrigins = (Deno.env.get('CHATBOT_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  if (origin && !allowedOrigins.includes(origin)) {
    return json({ erro: 'Origem não autorizada.' }, 403)
  }

  if (request.method === 'OPTIONS') {
    if (!origin) return new Response(null, { status: 204 })
    const response = new Response(null, { status: 204 })
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type')
    response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
    response.headers.set('Vary', 'Origin')
    return response
  }

  if (request.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405, origin)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const baroApiKey = Deno.env.get('BARO_API_KEY')
  const authorization = request.headers.get('authorization')

  if (!supabaseUrl || !supabaseAnonKey || !baroApiKey) {
    return json({ erro: 'Assistente indisponível.' }, 503, origin)
  }
  if (!authorization?.startsWith('Bearer ')) {
    return json({ erro: 'Sessão inválida.' }, 401, origin)
  }

  try {
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseAnonKey, authorization },
    })
    if (!authResponse.ok) return json({ erro: 'Sessão inválida.' }, 401, origin)

    const body = await request.json().catch(() => null)
    const pergunta = typeof body?.pergunta === 'string' ? body.pergunta.trim() : ''
    if (!pergunta || pergunta.length > MAX_QUESTION_LENGTH) {
      return json({ erro: `A pergunta deve ter entre 1 e ${MAX_QUESTION_LENGTH} caracteres.` }, 400, origin)
    }

    const providerResponse = await fetch(PROVIDER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${baroApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: pergunta },
        ],
        temperature: 0.5,
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(25000),
    })

    if (!providerResponse.ok) {
      return json({ erro: 'Não consegui acessar a IA agora. Tente novamente.' }, 502, origin)
    }

    const providerBody = await providerResponse.json().catch(() => null)
    const resposta = providerBody?.choices?.[0]?.message?.content
    if (typeof resposta !== 'string' || !resposta.trim()) {
      return json({ erro: 'A IA retornou uma resposta vazia.' }, 502, origin)
    }

    return json({ resposta: resposta.trim().slice(0, 4000) }, 200, origin)
  } catch {
    return json({ erro: 'Não consegui acessar a IA agora. Tente novamente.' }, 502, origin)
  }
})
