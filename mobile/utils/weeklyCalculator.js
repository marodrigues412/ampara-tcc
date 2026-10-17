// mobile/utils/weeklyCalculator.js
//
// Contas de alertas usadas pelo Relatório. As contas de risco e de lugares ficam em
// utils/relatorio.js, na escala da tela Proteção (coluna risco do histórico).

// Conta quantas vezes cada contato de emergência aparece em alert_logs.recipient_names
// (telefones separados por vírgula, ver Home.js) e devolve o ranking dos mais acionados.
export const tallyContactAlerts = (alerts, emergencyContacts) => {
  if (!alerts?.length || !emergencyContacts?.length) return [];

  const contagemPorTelefone = {};
  alerts.forEach((alert) => {
    (alert.recipient_names || '').split(',').map(t => t.trim()).filter(Boolean).forEach((telefone) => {
      contagemPorTelefone[telefone] = (contagemPorTelefone[telefone] || 0) + 1;
    });
  });

  return emergencyContacts
    .map((contato) => ({
      nome: contato.nome,
      telefone: contato.telefone,
      count: contagemPorTelefone[contato.telefone] || 0,
    }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
};