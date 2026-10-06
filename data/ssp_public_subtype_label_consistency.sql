-- Read-only check of public-place subtype and robbery label agreement by year.
-- Keyword signals are compared separately; no definitive category is assigned.
-- Outputs yearly aggregates only, without occurrence IDs or precise locations.
with source_signals as (
  select
    ano_estatistica,
    upper(trim(subtipo_local)) as subtipo_normalizado,
    coalesce(rubrica, '') ilike '%roub%' as rubrica_sinal_roubo,
    coalesce(natureza_apurada, '') ilike '%roub%' as natureza_sinal_roubo
  from public.crime_occurrences
  where ano_estatistica is not null
    and upper(trim(subtipo_local)) in ('VIA PÚBLICA', 'VIA PUBLICA')
)
select
  ano_estatistica,
  count(*) as registros_subtipo_via_publica,
  count(*) filter (
    where rubrica_sinal_roubo and natureza_sinal_roubo
  ) as sinal_roubo_em_ambos_campos,
  count(*) filter (
    where rubrica_sinal_roubo and not natureza_sinal_roubo
  ) as sinal_somente_rubrica,
  count(*) filter (
    where natureza_sinal_roubo and not rubrica_sinal_roubo
  ) as sinal_somente_natureza,
  count(*) filter (
    where not rubrica_sinal_roubo and not natureza_sinal_roubo
  ) as sem_sinal_roubo_nesses_campos
from source_signals
group by ano_estatistica
order by ano_estatistica;
