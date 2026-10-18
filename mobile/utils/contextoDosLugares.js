// "Contexto dos lugares por onde você passou": a faixa da Camada 1 (região × período)
// dos pontos de location_history, recalculada com o mapa atual. Não é o nível
// completo, que também usa os sensores — só o mapa da região, e por isso não aplica o
// desconto de local seguro.
//
// Tudo aqui é puro; a busca do bairro (endereço reverso no aparelho) e das células fica
// em services/contextoDosLugaresService.js.

// ~150 m: o mesmo raio dos lugares frequentes. Um endereço reverso por quadradinho.
export const LADO_DA_CELULA_GRAUS = 0.0015
// Limite de endereços reversos por abertura do relatório (o geocodificador do iPhone
// tem cota). Ficam os quadradinhos com mais pontos.
export const MAXIMO_DE_CELULAS = 40

const FAIXAS = ['baixo', 'medio', 'alto']

export function chaveDaCelula(latitude, longitude, lado = LADO_DA_CELULA_GRAUS) {
  return `${Math.floor(Number(latitude) / lado)}|${Math.floor(Number(longitude) / lado)}`
}

// Quadradinhos com seus pontos, do mais visitado ao menos. Ponto sem coordenada fica de fora.
export function agruparPorCelula(pontos, maximo = MAXIMO_DE_CELULAS) {
  const celulas = new Map()
  for (const p of pontos || []) {
    // Number(null) é 0: sem esta checagem, ponto sem coordenada viraria a latitude 0.
    if (p?.latitude == null || p?.longitude == null || !p.created_at) continue
    const lat = Number(p.latitude)
    const lon = Number(p.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const chave = chaveDaCelula(lat, lon)
    if (!celulas.has(chave)) celulas.set(chave, { chave, latitude: lat, longitude: lon, pontos: [] })
    celulas.get(chave).pontos.push(p)
  }
  const ordenadas = [...celulas.values()].sort((a, b) => b.pontos.length - a.pontos.length)
  return { usadas: ordenadas.slice(0, maximo), deFora: ordenadas.slice(maximo).reduce((n, c) => n + c.pontos.length, 0) }
}

// avaliacoes: [{ faixa: 'baixo'|'medio'|'alto'|null, origem: 'bairro'|'cidade'|null }],
// uma por ponto. Devolve a % de pontos em cada faixa (sem dados = sem célula nem
// estimativa da cidade) e quantos vieram da estimativa da cidade.
export function resumirContextos(avaliacoes) {
  const total = avaliacoes.length
  const contagens = { baixo: 0, medio: 0, alto: 0, sem_dados: 0 }
  let daCidade = 0
  for (const a of avaliacoes) {
    if (FAIXAS.includes(a.faixa)) contagens[a.faixa] += 1
    else contagens.sem_dados += 1
    if (a.origem === 'cidade') daCidade += 1
  }
  return {
    total,
    contagens,
    pct: total ? Object.fromEntries(Object.entries(contagens).map(([k, v]) => [k, (100 * v) / total])) : null,
    pctDaCidade: total ? (100 * daCidade) / total : null,
  }
}
