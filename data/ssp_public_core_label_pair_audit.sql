-- Read-only cross-check of source-label pairs for public-space safety candidates.
-- Includes violence, property, and traffic-related natures to expose conflicts.
-- Does not classify automatically or assign severity weights.
-- No occurrence IDs, addresses, or precise coordinates are returned.
-- Groups with fewer than five records are suppressed.
select
  ano_estatistica,
  coalesce(nullif(trim(rubrica), ''), '(sem rubrica)') as rubrica,
  coalesce(nullif(trim(natureza_apurada), ''), '(sem natureza apurada)') as natureza_apurada,
  count(*) as registros
from public.crime_occurrences
where ano_estatistica is not null
  and upper(trim(subtipo_local)) in ('VIA PÚBLICA', 'VIA PUBLICA')
  and (
    coalesce(natureza_apurada, '') ilike '%roub%'
    or coalesce(natureza_apurada, '') ilike '%furto%'
    or coalesce(natureza_apurada, '') ilike '%homic%'
    or coalesce(natureza_apurada, '') ilike '%lesão%'
    or coalesce(natureza_apurada, '') ilike '%lesao%'
    or coalesce(natureza_apurada, '') ilike '%extors%'
    or coalesce(natureza_apurada, '') ilike '%estup%'
    or coalesce(natureza_apurada, '') ilike '%ameaça%'
    or coalesce(natureza_apurada, '') ilike '%ameaca%'
    or coalesce(natureza_apurada, '') ilike '%trânsito%'
    or coalesce(natureza_apurada, '') ilike '%transito%'
    or coalesce(natureza_apurada, '') ilike '%acidente%'
    or coalesce(natureza_apurada, '') ilike '%tráfico%'
    or coalesce(natureza_apurada, '') ilike '%trafico%'
    or coalesce(natureza_apurada, '') ilike '%apreensão de entorpecentes%'
    or coalesce(natureza_apurada, '') ilike '%porte de arma%'
  )
group by
  ano_estatistica,
  coalesce(nullif(trim(rubrica), ''), '(sem rubrica)'),
  coalesce(nullif(trim(natureza_apurada), ''), '(sem natureza apurada)')
having count(*) >= 5
order by ano_estatistica, registros desc, natureza_apurada, rubrica;
