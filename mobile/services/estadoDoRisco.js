// Último resultado do score de 3 camadas, publicado pela tela Proteção e lido pelo
// contexto da Lia. Guarda só rótulos de listas fechadas — nível, origem do contexto e
// modo de sensores —, nunca a nota da célula, o bairro ou a posição.

// Mais velho que isso, a Lia não fala do risco "atual".
export const VALIDADE_DO_ESTADO_MS = 2 * 60 * 1000

const NIVEIS = {
  baixo: 'baixo',
  moderado: 'moderado',
  alto: 'alto',
  calculando: 'calculando (ainda sem leitura suficiente)',
  sem_contexto: 'sem dados da região (o app não estima o nível agora)',
  pausado: 'monitoramento pausado',
}
const ORIGENS = { bairro: 'bairro', cidade: 'estimativa da cidade' }
const MODOS = {
  completo: 'completo (relógio e celular)',
  so_celular: 'só celular',
  parcial: 'relógio parcial e celular',
  so_relogio: 'só relógio',
}

let atual = null
const tem = (lista, chave) => typeof chave === 'string' && Object.prototype.hasOwnProperty.call(lista, chave)

// nivel: 'baixo' | 'moderado' | 'alto' | null; estado: o de fundirCamadas
// ('pronto' | 'calculando' | 'sem_contexto'); origem: 'bairro' | 'cidade' | null;
// modo: o de avaliarCorpo. Qualquer outro valor vira null.
export function publicarEstadoDoRisco({ monitoramentoAtivo = true, nivel, estado, origem, modo }, agora = Date.now()) {
  const chaveDoNivel = !monitoramentoAtivo ? 'pausado' : estado === 'pronto' ? nivel : estado
  atual = {
    nivel: tem(NIVEIS, chaveDoNivel) ? chaveDoNivel : null,
    origem: tem(ORIGENS, origem) ? origem : null,
    modo: tem(MODOS, modo) ? modo : null,
    em: agora,
  }
}

// Campos de texto para o contexto da Lia, ou null se não há leitura recente.
export function estadoDoRiscoParaLia(agora = Date.now()) {
  if (!atual || agora - atual.em > VALIDADE_DO_ESTADO_MS || !atual.nivel) return null
  const pronto = ['baixo', 'moderado', 'alto'].includes(atual.nivel)
  return {
    nivelAtual: NIVEIS[atual.nivel],
    // Origem e sensores só fazem sentido com um nível calculado.
    origemDoContexto: pronto && atual.origem ? ORIGENS[atual.origem] : null,
    modoDosSensores: atual.nivel !== 'pausado' && atual.modo ? MODOS[atual.modo] : null,
  }
}

export function limparEstadoDoRisco() {
  atual = null
}
