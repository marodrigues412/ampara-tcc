// Nome do contato da rede de apoio a partir do telefone devolvido pelo envio do alerta.
// O envio devolve o número normalizado (+5511942174470); o cadastro pode ter outro
// formato ("(11) 94217-4470"). Compara pelos 11 últimos dígitos (DDD + celular) e, se
// algum lado for mais curto, pelos 8 últimos.
const digitos = (telefone) => String(telefone ?? '').replace(/\D/g, '')

export function nomeDoTelefone(telefone, contatos) {
  const alvo = digitos(telefone)
  if (alvo.length < 8) return null
  const achado = (contatos || []).find((c) => {
    const d = digitos(c?.telefone)
    if (d.length < 8) return false
    const n = Math.min(11, alvo.length, d.length) >= 11 ? 11 : 8
    return d.slice(-n) === alvo.slice(-n)
  })
  return achado?.nome?.trim() || null
}
