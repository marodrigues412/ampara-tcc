// Locais para o modo demonstração (estande da Eureka, no Instituto Mauá, em São
// Caetano do Sul — que não tem células no mapa de contexto).
//
// Só o lugar é simulado: a faixa sai da tabela context_risk_map para o dia e o
// horário reais, como para qualquer usuária. Os três foram escolhidos por terem
// célula em todos os 28 dias × períodos e por darem faixas diferentes nas manhãs e
// tardes de sexta e sábado (23 e 24/10/2026). Em outros horários a faixa pode mudar.
export const LOCAIS_DE_DEMONSTRACAO = [
  { id: 'bela-vista', rotulo: 'Bela Vista', cidade: 'São Paulo', municipio: 'S.PAULO', bairro: 'BELA VISTA', faixaNaEureka: 'alto' },
  { id: 'pari', rotulo: 'Pari', cidade: 'São Paulo', municipio: 'S.PAULO', bairro: 'PARI', faixaNaEureka: 'medio' },
  { id: 'mandaqui', rotulo: 'Mandaqui', cidade: 'São Paulo', municipio: 'S.PAULO', bairro: 'MANDAQUI', faixaNaEureka: 'baixo' },
]
