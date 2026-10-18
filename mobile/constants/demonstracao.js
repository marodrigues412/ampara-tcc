// Locais para o modo demonstração (estande da Eureka, no Instituto Mauá, em São
// Caetano do Sul — onde o bairro Mauá dá contexto "alto" nos quatro períodos).
//
// Só o lugar é simulado: a faixa sai da tabela context_risk_map para o período real,
// como para qualquer usuária. Escolhidos no mapa de 18/10/2026 (município × bairro ×
// período) para mostrar as três faixas no horário do estande (manhã e tarde):
// - Bela Vista: alto nos quatro períodos;
// - Jardim Aeroporto: médio de manhã, à tarde e à noite (baixo de madrugada);
// - Parada de Taipas: baixo nos quatro períodos;
// - Barcelona (São Caetano): varia — baixo de madrugada, médio de manhã e à tarde,
//   alto à noite. A SSP também tem "VILA BARCELONA" como célula separada (grafias
//   duplicadas, pendência pós-Eureka).
// Se o mapa for regerado, conferir de novo.
export const LOCAIS_DE_DEMONSTRACAO = [
  { id: 'bela-vista', rotulo: 'Bela Vista', cidade: 'São Paulo', municipio: 'S.PAULO', bairro: 'BELA VISTA', faixaNaEureka: 'alto' },
  { id: 'jardim-aeroporto', rotulo: 'Jardim Aeroporto', cidade: 'São Paulo', municipio: 'S.PAULO', bairro: 'JARDIM AEROPORTO', faixaNaEureka: 'medio' },
  { id: 'parada-de-taipas', rotulo: 'Parada de Taipas', cidade: 'São Paulo', municipio: 'S.PAULO', bairro: 'PARADA DE TAIPAS', faixaNaEureka: 'baixo' },
  { id: 'barcelona', rotulo: 'Barcelona', cidade: 'São Caetano do Sul', municipio: 'S.CAETANO DO SUL', bairro: 'BARCELONA', faixaNaEureka: 'medio' },
]
