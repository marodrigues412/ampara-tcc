// Ponto único entre o app e o envio real do alerta (SOS manual ou automático).
//
// No estande da Eureka, com o modo apresentação ou a simulação de bairro ligados, o
// fluxo aparece inteiro na tela — contagem, "enviando…", resultado —, mas nada sai do
// celular: nem a mensagem aos contatos (AWS), nem o registro em alert_logs.
export const MENSAGEM_DO_ENVIO_SIMULADO = 'Envio simulado — nenhuma mensagem foi enviada'

// enviar: a função que envia de verdade (alertService.dispararAlerta), chamada só fora da
// simulação. Devolve o mesmo formato de dispararAlerta, mais `simulado`.
export async function enviarAlertaOuSimular({ simular, enviar, dados }) {
  if (simular) {
    return { simulado: true, enviado: false, enviados: [], falhas: [], detalhe: MENSAGEM_DO_ENVIO_SIMULADO }
  }
  const resultado = await enviar(dados)
  return { simulado: false, enviados: [], falhas: [], ...resultado }
}
