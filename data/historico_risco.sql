-- Risco salvo no histórico de localização, na mesma escala da tela Proteção.
--
-- A coluna antiga risk_score guarda outra conta (useRiskDetection: 0 a 100, maior = mais
-- seguro, com crimes de uma lista de exemplo). Misturar as duas estragaria as médias do
-- relatório, então a escala nova fica numa coluna própria e o relatório lê só ela:
--
--   risco   0 a 10, MAIOR = MAIS RISCO. O mesmo número que a usuária vê na tela Proteção
--           (score > 8 crítico, >= 5 moderado). Nulo quando o monitoramento estava
--           pausado ou o score ainda estava sendo calculado.
--
-- Só adiciona a coluna: risk_score e os dados antigos continuam como estão.

alter table public.location_history
  add column if not exists risco real;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'location_history_risco_faixa'
  ) then
    alter table public.location_history
      add constraint location_history_risco_faixa check (risco is null or (risco >= 0 and risco <= 10));
  end if;
end $$;
