// Desenho do mapa de calor no iOS, onde não existe camada nativa: o Apple Maps não
// suporta, e o Heatmap do react-native-maps exige Google Maps, que o projeto não usa
// desde a migração para o MapLibre.
//
// A soma por célula é feita no banco (data/mapa_calor.sql); aqui só traduzimos densidade
// em cor e em anéis difusos.

// Gradiente de calor convencional: verde, amarelo, laranja, vermelho. Foge da paleta da
// marca de propósito — essa sequência é lida como intensidade sem precisar de legenda,
// enquanto tons de rosa exigiriam explicar qual é o "mais grave". A opacidade é baixa
// para os nomes das ruas continuarem legíveis sob a mancha.
//
// Os limites são ABSOLUTOS, em ocorrências por km² no ano, e não relativos ao que está na
// tela. Escala relativa pintava de vermelho a pior célula de qualquer região, inclusive
// de um bairro tranquilo, e a mesma esquina trocava de cor conforme a usuária arrastava o
// mapa — sugerindo uma piora que não existe.
//
// Calibragem medida na grade de 2026 (roubo e furto, 109 mil células): a mediana fica em
// 204 ocorrências por km² no ano, o percentil 90 em 818 e o 95 em 1.431.
//
// O mapa agora soma só os últimos 6 meses, que acumulam metade das ocorrências de um ano.
// Os limites continuam escritos "por ano" e são multiplicados por esta fração; sem isso, o
// mapa inteiro desceria uma faixa de cor sem que nada tivesse melhorado.
export const FRACAO_DO_ANO = 0.5

const ESCALA = [
  { limite: 250 * FRACAO_DO_ANO, cor: '56, 165, 70', opacidade: 0.40 },
  { limite: 700 * FRACAO_DO_ANO, cor: '255, 235, 59', opacidade: 0.42 },
  { limite: 1500 * FRACAO_DO_ANO, cor: '255, 152, 0', opacidade: 0.50 },
  { limite: Infinity, cor: '230, 30, 30', opacidade: 0.62 },
]

// Cores das faixas, sem transparência, para a barra da legenda: mostra a mesma escala que
// pinta o mapa, do menor para o maior número de ocorrências.
export const CORES_LEGENDA = ESCALA.map((faixa) => `rgb(${faixa.cor})`)

// Círculo tem borda dura, e borda dura denuncia a grade. Por isso cada célula vira quatro
// anéis concêntricos e largos, todos fracos: onde só o anel de fora alcança, a cor quase
// não aparece; no centro, os quatro se somam. Como os anéis passam bem da célula, os das
// vizinhas se misturam e a mancha vira uma área contínua, sem contorno visível.
//
// A opacidade de cada anel é baixa porque, numa região densa, cada ponto do mapa fica
// coberto por uns 30 anéis. Somados, dão perto de 65% no vermelho e 50% no verde: cor
// forte o bastante para ler a intensidade, ainda com as ruas aparecendo por baixo.
export const ESCALAS_RAIO_CALOR = [2.6, 2.0, 1.5, 1.0]
export const OPACIDADE_CAMADA_CALOR = 0.054

const CAMADAS = ESCALAS_RAIO_CALOR.map((escalaRaio) => ({
  escalaRaio,
  escalaOpacidade: OPACIDADE_CAMADA_CALOR,
}))

// raioBase vem de quem chama, porque o tamanho da célula muda com o zoom: a grade do
// banco é dimensionada pela área visível para caber no limite de linhas do Supabase.
export function camadasDifusas(celula, areaCelulaKm2, raioBase) {
  return CAMADAS.map((camada, indice) => ({
    id: `${celula.chave}-${indice}`,
    raio: raioBase * camada.escalaRaio,
    cor: corDaCelula(celula.peso, areaCelulaKm2, camada.escalaOpacidade),
  }))
}

// Dividir pela área é o que torna a cor comparável entre zooms: a célula do mapa afastado
// é maior e naturalmente acumula mais ocorrências, então a contagem crua mudaria de faixa
// só por causa do zoom.
export function corDaCelula(peso, areaCelulaKm2, escalaOpacidade = 1) {
  const densidade = peso / Math.max(areaCelulaKm2, 1e-6)
  const faixa = ESCALA.find((f) => densidade <= f.limite) ?? ESCALA[ESCALA.length - 1]
  return `rgba(${faixa.cor}, ${(faixa.opacidade * escalaOpacidade).toFixed(4)})`
}
