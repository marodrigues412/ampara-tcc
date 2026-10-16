-- Read-only audit of the subtype field for robbery-like source labels.
-- DESCR_TIPOLOCAL is absent from the 2022-2024 source workbooks, but
-- DESCR_SUBTIPOLOCAL is present. This checks what detail remains available.
-- Keyword matches are exploratory; conflicting labels are not resolved here.
-- Groups with fewer than five records are suppressed.
select
  ano_estatistica,
  coalesce(nullif(trim(subtipo_local), ''), '(sem subtipo local)') as subtipo_local,
  count(*) as registros
from public.crime_occurrences
where ano_estatistica is not null
  and (
    coalesce(rubrica, '') ilike '%roub%'
    or coalesce(natureza_apurada, '') ilike '%roub%'
  )
group by
  ano_estatistica,
  coalesce(nullif(trim(subtipo_local), ''), '(sem subtipo local)')
having count(*) >= 5
order by ano_estatistica, registros desc, subtipo_local;
