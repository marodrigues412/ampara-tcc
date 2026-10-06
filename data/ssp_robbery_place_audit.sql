-- Read-only audit of robbery labels and reported place type by year.
-- Used to investigate the zero-to-thousands change in the existing
-- "robbery on public roads" keyword count. No event IDs or precise locations.
-- Groups with fewer than five records are suppressed.
select
  ano_estatistica,
  coalesce(nullif(trim(rubrica), ''), '(sem rubrica)') as rubrica,
  coalesce(nullif(trim(natureza_apurada), ''), '(sem natureza apurada)') as natureza_apurada,
  coalesce(nullif(trim(tipo_local), ''), '(sem tipo local)') as tipo_local,
  count(*) as registros
from public.crime_occurrences
where ano_estatistica is not null
  and (
    coalesce(rubrica, '') ilike '%roub%'
    or coalesce(natureza_apurada, '') ilike '%roub%'
  )
group by
  ano_estatistica,
  coalesce(nullif(trim(rubrica), ''), '(sem rubrica)'),
  coalesce(nullif(trim(natureza_apurada), ''), '(sem natureza apurada)'),
  coalesce(nullif(trim(tipo_local), ''), '(sem tipo local)')
having count(*) >= 5
order by ano_estatistica, registros desc, rubrica, natureza_apurada, tipo_local;
