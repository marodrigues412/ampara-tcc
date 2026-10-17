import AsyncStorage from '@react-native-async-storage/async-storage'
import { perguntarAIA } from './chatService'

// Resumo do relatório escrito pela Lia (IA da Mauá).
//
// É gerado no máximo uma vez por dia para cada período (7 ou 30 dias) e guardado no
// aparelho: abrir o relatório várias vezes não gasta várias chamadas à IA. Só números e
// rótulos vão para a IA — nenhum endereço, nome de lugar ou contato.

const chaveDoCache = (userId, dias) => {
  const hoje = new Date()
  return `ampara:resumoLia:${userId}:${dias}:${hoje.getFullYear()}-${hoje.getMonth() + 1}-${hoje.getDate()}`
}

// dados: { dias, riscoMedio, faixa, variacao, horarioMaisExposto, diasMonitorados, alertas, preparo }
const montarPergunta = (d) => [
  'Escreva um resumo curto (no máximo 2 frases) do período de segurança de uma usuária do app Ampara,',
  'em tom acolhedor e sem alarmismo, falando diretamente com ela ("você").',
  'Se fizer sentido, termine com uma sugestão prática e simples. Não invente nenhum dado além destes:',
  `- período: últimos ${d.dias} dias`,
  `- risco médio: ${d.riscoMedio} de 10 (faixa ${d.faixa}; quanto maior, mais risco)`,
  d.variacao ? `- em relação ao período anterior: ${d.variacao}` : null,
  d.horarioMaisExposto ? `- horário mais exposto: ${d.horarioMaisExposto}` : null,
  `- dias com o monitoramento ativo: ${d.diasMonitorados} de ${d.dias}`,
  `- alertas SOS enviados: ${d.alertas}`,
  d.preparo ? `- itens de preparo pendentes: ${d.preparo}` : null,
].filter(Boolean).join('\n')

// Devolve o texto guardado de hoje ou pede um novo à Lia. Nulo se a IA não responder.
export async function resumoDaLia(userId, dados) {
  const chave = chaveDoCache(userId, dados.dias)
  try {
    const guardado = await AsyncStorage.getItem(chave)
    if (guardado) return guardado
  } catch {
    // Sem acesso ao armazenamento, segue e pede à IA mesmo assim.
  }

  try {
    const texto = await perguntarAIA(montarPergunta(dados))
    try { await AsyncStorage.setItem(chave, texto) } catch { /* só perde o cache */ }
    return texto
  } catch {
    return null
  }
}
