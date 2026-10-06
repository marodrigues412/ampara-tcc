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
// 204 ocorrências por km², o percentil 90 em 818 e o 95 em 1.431.
const ESCALA = [
  { limite: 250, cor: '76, 175, 80', opacidade: 0.22 },
  { limite: 700, cor: '255, 235, 59', opacidade: 0.28 },
  { limite: 1500, cor: '255, 152, 0', opacidade: 0.34 },
  { limite: Infinity, cor: '211, 47, 47', opacidade: 0.42 },
]

// Usado também pelo mapa do Android, para converter a contagem da célula no peso que a
// camada nativa espera (0 a 1).
export const DENSIDADE_VERMELHO = 1500

// Círculo tem borda dura, e borda dura denuncia a grade. Desenhar três anéis
// concêntricos com opacidade decrescente imita o esfumado da camada nativa do Android:
// o de fora é largo e quase transparente, o de dentro é pequeno e mais forte.
const CAMADAS = [
  { escalaRaio: 1.8, escalaOpacidade: 0.30 },
  { escalaRaio: 1.3, escalaOpacidade: 0.55 },
  { escalaRaio: 1.0, escalaOpacidade: 1.0 },
]

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
  return `rgba(${faixa.cor}, ${(faixa.opacidade * escalaOpacidade).toFixed(3)})`
}
