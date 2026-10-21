// Ponte entre o Perfil e a Raiz: o Perfil pede para as telas serem desenhadas de novo
// (depois de trocar o tamanho do texto) e a Raiz, que monta o App, faz isso.
let ouvinte = null

export function aoReiniciarTelas(funcao) {
  ouvinte = funcao
  return () => { if (ouvinte === funcao) ouvinte = null }
}

let secaoParaReabrir = null

export function reiniciarTelas(opcoes) {
  secaoParaReabrir = opcoes?.reabrirSecao ?? null
  ouvinte?.(opcoes)
}

// O Perfil pergunta, ao montar, se deve abrir alguma seção (uma vez só).
export function consumirSecaoParaReabrir() {
  const secao = secaoParaReabrir
  secaoParaReabrir = null
  return secao
}
