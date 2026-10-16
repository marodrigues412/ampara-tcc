-- Read-only check for historical availability of the SSP place-type field.
-- Outputs yearly aggregates only; 2026 is partial through the latest import.
select
  ano_estatistica,
  count(*) as registros,
  count(*) filter (
    where nullif(trim(tipo_local), '') is null
  ) as sem_tipo_local,
  count(*) filter (
    where nullif(trim(tipo_local), '') is not null
  ) as com_tipo_local,
  count(*) filter (
    where tipo_local ilike '%via pública%' or tipo_local ilike '%via publica%'
  ) as via_publica,
  round(
    100.0 * count(*) filter (where nullif(trim(tipo_local), '') is null)
      / nullif(count(*), 0),
    1
  ) as percentual_sem_tipo_local
from public.crime_occurrences
where ano_estatistica is not null
group by ano_estatistica
order by ano_estatistica;
