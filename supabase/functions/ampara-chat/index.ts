const PROVIDER_URL = 'https://ia.maua.br/api/v1/chat/completions'
const MODEL = 'google/gemma-3-27b'
const MAX_QUESTION_LENGTH = 1200
const MAX_CONTEXT_FIELD = 200

const SYSTEM_PROMPT = `Você é Lia, a assistente de IA do aplicativo Ampara. Suas respostas são geradas pelo modelo Google Gemma disponibilizado pela IA da Mauá (Barô). Se perguntarem se você é o Barô, explique brevemente que você é a Lia do Ampara e usa a IA da Mauá para responder. Fale em português brasileiro, com empatia e naturalidade. Responda diretamente ao que foi perguntado, em no máximo 2 a 4 frases; não se reapresente a cada mensagem e não acrescente contexto que não foi pedido. Use listas só quando ajudarem. Ajude com dúvidas sobre o Ampara e orientações gerais de segurança. Não prometa proteção nem atendimento de emergência. Não diagnostique nem dê aconselhamento jurídico definitivo. Em perigo imediato, oriente ligar para 190; para orientação e denúncias de violência contra a mulher, informe o 180. Não peça nem incentive o envio de dados pessoais, endereço preciso, contatos, senhas ou dados de saúde. Se não souber, diga com clareza. Escreva em texto simples, sem Markdown (nada de asteriscos, negrito ou títulos) e sem emojis. Não cumprimente nem se apresente a cada resposta: o app já mostra que é a Lia; vá direto ao ponto. Nunca invente nomes, endereços ou telefones de lugares; lugares só podem vir dos dados que o app enviar.`

// --- Habilidade "lugares próximos" -------------------------------------------------
//
// Recomendação do professor da IA da Mauá: localização se resolve no backend, antes da
// IA. O modelo é um retrato do passado (não sabe de uma delegacia aberta ontem) e erra
// contas de distância; a API de lugares está sempre atualizada e a distância é calculada
// aqui. A IA só escreve a frase em volta dos lugares que recebeu.
//
// Fonte: Google Places API (New), chave em GOOGLE_PLACES_KEY (segredo do Supabase, nunca
// no app). Sem a chave, a habilidade fica desligada e a Lia responde só com o contexto.

// Qualquer pergunta sobre um lugar perto vira uma busca no Google Places, e o resultado
// sempre volta em cartões. A busca de texto do Google entende frases naturais ("farmácia
// aberta perto de mim"), então a própria pergunta serve de busca; só alguns casos têm uma
// busca reforçada, para não cair no lugar errado (DDM não é qualquer delegacia).

type BuscaDeLugar = { busca: string; rotulo: string; abertoAgora: boolean; exclui?: RegExp }

const REFORCOS = [
  // Antes de "delegacia" comum: "delegacia da mulher" tem que cair aqui.
  { combina: /\b(ddms?|delegacias? d[ae] mulher|delegacias? de defesa da mulher)\b/, busca: 'Delegacia de Defesa da Mulher', rotulo: 'Delegacias da Mulher' },
  { combina: /\bcasas? da mulher\b/, busca: 'Casa da Mulher Brasileira', rotulo: 'Casas da Mulher' },
  // "delegacia de polícia" trazia a Corregedoria e batalhões da PM, que não atendem o
  // público para registrar ocorrência (teste de 17/10). O distrito policial é o lugar
  // certo, e o resto é filtrado pelo nome.
  {
    combina: /\b(delegacias?|distritos? policia(l|is))\b/,
    busca: 'distrito policial delegacia da polícia civil',
    rotulo: 'delegacias',
    exclui: /corregedoria|batalh|companhia|\bcia\b|\bbpm|policia militar|\bpm\b|pm-sp|base comunitaria|posto policial|academia de policia|departamento|dhpp|deic|denarc/,
  },
  { combina: /\b(upas?|prontos?[ -]socorros?|pronto atendimento)\b/, busca: 'pronto-socorro UPA', rotulo: 'prontos-socorros' },
  // "Lugar seguro / movimentado" é pedido de ponto de apoio: estabelecimentos 24 h.
  { combina: /\blugar(es)? (seguros?|movimentados?|abertos?|para (me )?esconder|para esperar)\b/, busca: 'farmácia 24 horas', rotulo: 'lugares abertos 24 horas' },
]

// Sinais de que a pergunta pede um lugar perto dela. "Onde" sozinho não basta: "onde
// estou é perigoso?" é sobre a região, não um pedido de lugar.
const PEDE_PERTO = /\b(perto|proxim[oa]s?|mais perto|por aqui|aqui perto|nas proximidades|ao redor|arredores|nesta regiao|nessa regiao|no bairro|onde (fica|ficam|tem|tenho|encontro|acho|posso (ir|encontrar|achar))|aberto agora|abertos agora|aberta agora|abertas agora)\b/
const NOMES_DE_LUGAR = /\b(delegacias?|ddms?|policia|guarda|bombeiros?|hospita(l|is)|upas?|ubs|prontos?[ -]socorros?|clinicas?|farmacias?|drogarias?|postos?|metro|estac(ao|oes)|terminal|terminais|pontos? de onibus|onibus|trem|mercados?|supermercados?|padarias?|restaurantes?|lanchonetes?|bares?|cafes?|shoppings?|bancos?|caixas? eletronicos?|hoteis|hotel|igrejas?|escolas?|pracas?|parques?|lojas?|academias?|lugar(es)?|abrigos?|casas? da mulher|cras|creas)\b/

const semAcento = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

function buscaDeLugarPedida(pergunta: string): BuscaDeLugar | null {
  const texto = semAcento(pergunta)
  const abertoAgora = /\babert[oa]s? agora\b/.test(texto)
  const reforco = REFORCOS.find((r) => r.combina.test(texto))
  // Um nome de lugar reforçado (DDM, delegacia...) já basta, mesmo sem "perto".
  if (reforco) return { busca: reforco.busca, rotulo: reforco.rotulo, abertoAgora, exclui: reforco.exclui }
  if (!PEDE_PERTO.test(texto) || !NOMES_DE_LUGAR.test(texto)) return null
  // Sem reforço, a própria pergunta é a busca; tira o "?" e limita o tamanho.
  return { busca: pergunta.replace(/[?!.]+/g, ' ').trim().slice(0, 150), rotulo: 'lugares', abertoAgora }
}

function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLon = rad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

type Lugar = {
  nome: string
  endereco: string | null
  distanciaKm: number
  telefone: string | null
  abertoAgora: boolean | null
  mapsUrl: string | null
  latitude: number
  longitude: number
}

// Lugares a mais de 30 km provavelmente são outro lugar com o mesmo nome.
const DISTANCIA_MAXIMA_KM = 30

async function buscarLugares(tipo: BuscaDeLugar, latitude: number, longitude: number, chave: string, limite = 3): Promise<Lugar[] | null> {
  try {
    const resposta = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': chave,
        // Só os campos usados: cada campo a mais pode mudar a faixa de preço da API.
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.nationalPhoneNumber,places.currentOpeningHours.openNow,places.googleMapsUri',
      },
      body: JSON.stringify({
        textQuery: tipo.busca,
        languageCode: 'pt-BR',
        regionCode: 'BR',
        maxResultCount: 10,
        ...(tipo.abertoAgora ? { openNow: true } : {}),
        locationBias: { circle: { center: { latitude, longitude }, radius: 15000 } },
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (!resposta.ok) return null
    const dados = await resposta.json()
    return (dados.places ?? [])
      .filter((p: any) => Number.isFinite(p.location?.latitude) && Number.isFinite(p.location?.longitude))
      .map((p: any) => ({
        nome: p.displayName?.text ?? 'Sem nome',
        endereco: p.formattedAddress ?? null,
        distanciaKm: Math.round(distanciaKm(latitude, longitude, p.location.latitude, p.location.longitude) * 10) / 10,
        telefone: p.nationalPhoneNumber ?? null,
        abertoAgora: typeof p.currentOpeningHours?.openNow === 'boolean' ? p.currentOpeningHours.openNow : null,
        mapsUrl: p.googleMapsUri ?? null,
        latitude: p.location.latitude,
        longitude: p.location.longitude,
      }))
      .filter((l: Lugar) => l.distanciaKm <= DISTANCIA_MAXIMA_KM)
      .filter((l: Lugar) => !tipo.exclui || !tipo.exclui.test(semAcento(l.nome)))
      .sort((a: Lugar, b: Lugar) => a.distanciaKm - b.distanciaKm)
      .slice(0, limite)
  } catch {
    return null
  }
}

// --- Contexto da usuária -----------------------------------------------------------
//
// Montado no app com as mesmas contas do Relatório e do Mapa, e enviado só quando ela
// liga "Personalizar com meus dados" no chat. A coordenada exata fica aqui (serve para a
// busca de lugares) e nunca vai para a IA: o modelo recebe só o bairro e os resumos.

const texto = (valor: unknown) =>
  typeof valor === 'string' && valor.trim() ? valor.trim().replace(/\s+/g, ' ').slice(0, MAX_CONTEXT_FIELD) : null

// Nível da matriz, origem do contexto e sensores: só os rótulos que o app produz
// (mobile/services/estadoDoRisco.js). Qualquer outro texto é descartado, para não
// entrar nota de célula, bairro ou instrução no prompt por esses campos.
const NIVEIS_ACEITOS = new Set([
  'baixo', 'moderado', 'alto', 'calculando (ainda sem leitura suficiente)',
  'sem dados da região (o app não estima o nível agora)', 'monitoramento pausado',
])
const ORIGENS_ACEITAS = new Set(['bairro', 'estimativa da cidade'])
const MODOS_ACEITOS = new Set(['completo (relógio e celular)', 'só celular', 'relógio parcial e celular', 'só relógio'])
const daLista = (lista: Set<string>, valor: unknown) => {
  const t = texto(valor)
  return t && lista.has(t) ? t : null
}

function lerContexto(bruto: any) {
  if (!bruto || typeof bruto !== 'object') return null
  const latitude = Number(bruto.latitude)
  const longitude = Number(bruto.longitude)
  return {
    latitude: Number.isFinite(latitude) && Math.abs(latitude) <= 90 ? latitude : null,
    longitude: Number.isFinite(longitude) && Math.abs(longitude) <= 180 ? longitude : null,
    bairro: texto(bruto.bairro),
    regiao: texto(bruto.regiao),
    riscoAtual: texto(bruto.riscoAtual),
    nivelAtual: daLista(NIVEIS_ACEITOS, bruto.nivelAtual),
    origemDoContexto: daLista(ORIGENS_ACEITAS, bruto.origemDoContexto),
    modoDosSensores: daLista(MODOS_ACEITOS, bruto.modoDosSensores),
    proximoCompromisso: texto(bruto.proximoCompromisso),
    historico: texto(bruto.historico),
    dataHora: texto(bruto.dataHora),
  }
}

function blocoDeContexto(contexto: ReturnType<typeof lerContexto>) {
  if (!contexto) return null
  const linhas = [
    contexto.dataHora && `- Agora: ${contexto.dataHora}`,
    contexto.bairro && `- Onde ela está: ${contexto.bairro}`,
    contexto.regiao && `- Ocorrências registradas na região (raio de 1 km, últimos 6 meses): ${contexto.regiao}`,
    contexto.riscoAtual && `- Risco atual no app (0 a 10, maior = mais risco): ${contexto.riscoAtual}`,
    contexto.nivelAtual && `- Nível de risco atual no app (cruza a região e o horário com os sensores do corpo; baixo, moderado ou alto): ${contexto.nivelAtual}`,
    contexto.origemDoContexto && `- Base da parte da região: ${contexto.origemDoContexto === 'bairro' ? 'dados do bairro' : 'estimativa da cidade (o bairro não tem registros suficientes)'}`,
    contexto.modoDosSensores && `- Sensores usados agora: ${contexto.modoDosSensores}`,
    contexto.proximoCompromisso && `- Próximo compromisso da rotina: ${contexto.proximoCompromisso}`,
    contexto.historico && `- Histórico recente: ${contexto.historico}`,
  ].filter(Boolean)
  if (!linhas.length) return null
  return [
    'Dados da usuária vindos do app Ampara, compartilhados com o consentimento dela.',
    'Use-os só quando ajudarem a responder a pergunta; não os repita sem necessidade.',
    'São registros e estimativas do app: nunca diga que um lugar é seguro ou garantido.',
    ...linhas,
  ].join('\n')
}

function blocoDeLugares(tipo: BuscaDeLugar, lugares: Lugar[] | null, temLocalizacao: boolean, temChave: boolean) {
  if (!temChave) return `A usuária perguntou por ${tipo.rotulo.toLowerCase()}, mas a busca de lugares ainda não está disponível. Diga isso com clareza, sem inventar nomes ou endereços, e sugira procurar no mapa do celular.`
  if (!temLocalizacao) return `A usuária perguntou por ${tipo.rotulo.toLowerCase()}, mas não compartilhou a localização. Explique que, para buscar lugares próximos, ela precisa ligar "Personalizar com meus dados" no chat. Não invente nomes ou endereços.`
  if (!lugares) return `A busca por ${tipo.rotulo.toLowerCase()} falhou agora. Diga isso e sugira tentar de novo, sem inventar nomes ou endereços.`
  if (!lugares.length) return `Nenhum resultado de ${tipo.rotulo.toLowerCase()} foi encontrado perto dela. Diga isso, sem inventar nomes.`
  const linhas = lugares.map((l) =>
    `- ${l.nome} — ${l.distanciaKm.toString().replace('.', ',')} km${l.abertoAgora === true ? ', aberto agora' : l.abertoAgora === false ? ', fechado agora' : ''}`)
  return [
    `Resultado da busca por ${tipo.rotulo.toLowerCase()} perto dela (dados do Google, distâncias calculadas pelo app; podem não corresponder exatamente ao pedido):`,
    ...linhas,
    'Responda em 1 ou 2 frases curtas, citando no máximo o mais próximo. Fale só destes lugares, sem inventar outros nem mudar as distâncias. Os detalhes (endereço, telefone e mapa) aparecem em cartões abaixo da sua resposta: não repita endereços nem telefones e não faça lista.',
  ].join('\n')
}

// "Apoio por perto" do Mapa: categorias fixas, buscadas direto no Google Places, sem IA.
const CATEGORIAS_DE_APOIO: Record<string, BuscaDeLugar> = {
  ddm: { busca: 'Delegacia de Defesa da Mulher', rotulo: 'Delegacias da Mulher', abertoAgora: false },
  delegacia: { ...REFORCOS.find((r) => r.rotulo === 'delegacias')!, abertoAgora: false },
  farmacia: { busca: 'farmácia 24 horas', rotulo: 'farmácias 24 horas', abertoAgora: false },
  hospital: { busca: 'pronto-socorro hospital', rotulo: 'hospitais', abertoAgora: false },
}

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
  const placesKey = Deno.env.get('GOOGLE_PLACES_KEY') ?? ''
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

    if (body?.acao === 'lugares') {
      const categoria = CATEGORIAS_DE_APOIO[String(body.categoria)]
      const latitude = Number(body.latitude)
      const longitude = Number(body.longitude)
      if (!categoria || !Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
        return json({ erro: 'Pedido de lugares inválido.' }, 400, origin)
      }
      if (!placesKey) return json({ erro: 'Busca de lugares indisponível.' }, 503, origin)
      const lugares = await buscarLugares(categoria, latitude, longitude, placesKey, 5)
      if (!lugares) return json({ erro: 'A busca de lugares falhou agora.' }, 502, origin)
      return json({ lugares }, 200, origin)
    }

    const pergunta = typeof body?.pergunta === 'string' ? body.pergunta.trim() : ''
    if (!pergunta || pergunta.length > MAX_QUESTION_LENGTH) {
      return json({ erro: `A pergunta deve ter entre 1 e ${MAX_QUESTION_LENGTH} caracteres.` }, 400, origin)
    }

    const contexto = lerContexto(body?.contexto)
    const temLocalizacao = contexto?.latitude != null && contexto?.longitude != null

    // Habilidade de lugares: resolvida aqui, antes da IA.
    const tipo = buscaDeLugarPedida(pergunta)
    const lugares = tipo && temLocalizacao && placesKey
      ? await buscarLugares(tipo, contexto!.latitude!, contexto!.longitude!, placesKey)
      : null

    const sistema = [
      SYSTEM_PROMPT,
      blocoDeContexto(contexto),
      tipo && blocoDeLugares(tipo, lugares, temLocalizacao, Boolean(placesKey)),
    ].filter(Boolean).join('\n\n')

    const providerResponse = await fetch(PROVIDER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${baroApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: sistema },
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

    // Os lugares voltam em separado para o app mostrar em cartões (mapa e telefone),
    // sem depender de a IA repetir os dados corretamente.
    return json({
      resposta: resposta.trim().slice(0, 4000),
      lugares: lugares?.length ? lugares : undefined,
      tipoLugar: lugares?.length ? tipo!.rotulo : undefined,
    }, 200, origin)
  } catch {
    return json({ erro: 'Não consegui acessar a IA agora. Tente novamente.' }, 502, origin)
  }
})
