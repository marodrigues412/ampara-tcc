// Fila única de endereço reverso (Location.reverseGeocodeAsync) para o app inteiro.
//
// Por quê: o geocodificador do iPhone (CLGeocoder) é lento e tem cota — a Apple recusa
// pedidos em rajada. O Relatório chegava a pedir 40 endereços de uma vez, competindo com
// a tela Proteção, que precisa do bairro para a Camada 1. Aqui:
// - um pedido por vez; os da Proteção (e do SOS) passam na frente dos do Relatório;
// - os do Relatório esperam enquanto houver pedido da Proteção e saem espaçados;
// - cache por quadradinho de ~150 m, na memória e no aparelho (30 dias);
// - nunca espera para sempre: cada pedido tem prazo; se o prazo vence, a resposta que
//   chegar depois ainda entra no cache para a próxima vez;
// - registra no console do Metro o resultado bruto e qualquer erro (só em
//   desenvolvimento), para ver o que o iOS e o Android devolvem.

export const LADO_DA_CELULA_GRAUS = 0.0015
export const VALIDADE_DO_CACHE_MS = 30 * 24 * 60 * 60 * 1000
export const ESPACO_ENTRE_PEDIDOS_DO_RELATORIO_MS = 1_500
const PREFIXO = 'ampara:enderecoReverso:v1:'
// Só os campos que o app usa; o resto do endereço não fica guardado.
const CAMPOS = ['district', 'city', 'subregion', 'region', 'street', 'streetNumber', 'name', 'formattedAddress', 'isoCountryCode']

export const chaveDoLugar = (latitude, longitude) =>
  `${Math.floor(Number(latitude) / LADO_DA_CELULA_GRAUS)}|${Math.floor(Number(longitude) / LADO_DA_CELULA_GRAUS)}`

const enxugar = (enderecos) => (Array.isArray(enderecos) ? enderecos : [])
  .map((e) => Object.fromEntries(CAMPOS.filter((c) => e?.[c] != null && e[c] !== '').map((c) => [c, e[c]])))

function descreverErro(erro) {
  return { code: erro?.code ?? null, message: erro?.message ?? String(erro), nativeStackIOS: erro?.nativeStackIOS ? 'sim' : undefined }
}

export function criarFilaDeEnderecos({
  geocodificar,
  armazenamento = null,
  agora = () => Date.now(),
  esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms)),
  registrar = () => {},
  plataforma = 'desconhecida',
}) {
  const memoria = new Map()
  const emAndamento = new Map()
  const fila = []
  let ocupada = false
  let ultimoPedidoDoRelatorio = -Infinity
  let contador = 0

  async function lerCache(chave) {
    const naMemoria = memoria.get(chave)
    if (naMemoria && agora() - naMemoria.em < VALIDADE_DO_CACHE_MS) return naMemoria.enderecos
    if (!armazenamento) return null
    try {
      const texto = await armazenamento.getItem(PREFIXO + chave)
      if (!texto) return null
      const salvo = JSON.parse(texto)
      if (agora() - salvo.em >= VALIDADE_DO_CACHE_MS) return null
      memoria.set(chave, salvo)
      return salvo.enderecos
    } catch {
      return null
    }
  }

  function gravarCache(chave, enderecos) {
    const item = { em: agora(), enderecos }
    memoria.set(chave, item)
    if (armazenamento) armazenamento.setItem(PREFIXO + chave, JSON.stringify(item)).catch?.(() => {})
  }

  async function processar() {
    if (ocupada) return
    ocupada = true
    try {
      while (fila.length) {
        // Proteção primeiro; entre iguais, ordem de chegada.
        fila.sort((a, b) => (a.prioridade === b.prioridade ? a.ordem - b.ordem : a.prioridade === 'protecao' ? -1 : 1))
        const pedido = fila.shift()
        if (pedido.prioridade === 'relatorio') {
          const falta = ultimoPedidoDoRelatorio + ESPACO_ENTRE_PEDIDOS_DO_RELATORIO_MS - agora()
          if (falta > 0) {
            fila.unshift(pedido)
            await esperar(falta)
            continue
          }
          ultimoPedidoDoRelatorio = agora()
        }
        const inicio = agora()
        try {
          const brutos = await geocodificar({ latitude: pedido.latitude, longitude: pedido.longitude })
          registrar('[endereço reverso] resultado bruto', { plataforma, prioridade: pedido.prioridade, ms: agora() - inicio, quantidade: Array.isArray(brutos) ? brutos.length : null, enderecos: brutos })
          const enderecos = enxugar(brutos)
          gravarCache(pedido.chave, enderecos)
          pedido.resolver({ enderecos, erro: null })
        } catch (erro) {
          registrar('[endereço reverso] erro', { plataforma, prioridade: pedido.prioridade, ms: agora() - inicio, ...descreverErro(erro) })
          pedido.resolver({ enderecos: null, erro: descreverErro(erro) })
        }
      }
    } finally {
      ocupada = false
    }
  }

  // Devolve { enderecos, erro, deCache, expirou }. enderecos null = não veio (erro ou
  // prazo). Pedidos do mesmo quadradinho em andamento são compartilhados.
  async function buscar({ latitude, longitude, prioridade = 'protecao', prazoMs = 10_000 }) {
    const chave = chaveDoLugar(latitude, longitude)
    const doCache = await lerCache(chave)
    if (doCache) return { enderecos: doCache, erro: null, deCache: true, expirou: false }

    let promessa = emAndamento.get(chave)
    if (!promessa) {
      promessa = new Promise((resolver) => {
        fila.push({ chave, latitude, longitude, prioridade, ordem: contador++, resolver })
      }).finally(() => emAndamento.delete(chave))
      emAndamento.set(chave, promessa)
      processar()
    } else if (prioridade === 'protecao') {
      // Um pedido do Relatório já na fila sobe de prioridade.
      const naFila = fila.find((p) => p.chave === chave)
      if (naFila) naFila.prioridade = 'protecao'
    }

    let temporizador
    const prazo = new Promise((resolver) => {
      temporizador = setTimeout(() => resolver({ enderecos: null, erro: null, deCache: false, expirou: true }), prazoMs)
    })
    const resultado = await Promise.race([promessa.then((r) => ({ ...r, deCache: false, expirou: false })), prazo])
    clearTimeout(temporizador)
    if (resultado.expirou) registrar('[endereço reverso] prazo vencido', { plataforma, prioridade, prazoMs })
    return resultado
  }

  return { buscar, tamanhoDaFila: () => fila.length }
}
