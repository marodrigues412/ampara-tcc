-- Read-only inventory of occurrence natures in public-place subtypes.
-- Reports source labels by year and how many different rubrics they pair with.
-- No occurrence IDs, addresses, or precise coordinates are returned.
-- Groups with fewer than five records are suppressed.
select
  ano_estatistica,
  coalesce(nullif(trim(natureza_apurada), ''), '(sem natureza apurada)') as natureza_apurada,
  count(*) as registros,
  count(distinct nullif(trim(rubrica), '')) as rubricas_distintas
from public.crime_occurrences
where ano_estatistica is not null
  and upper(trim(subtipo_local)) in ('VIA PÚBLICA', 'VIA PUBLICA')
group by
  ano_estatistica,
  coalesce(nullif(trim(natureza_apurada), ''), '(sem natureza apurada)')
having count(*) >= 5
order by ano_estatistica, registros desc, natureza_apurada;
