-- Read-only review of robbery-like label pairs within public-place subtypes.
-- Keeps rubric/nature disagreements visible; does not assign severity weights.
-- No occurrence IDs, addresses, or precise coordinates are returned.
-- Groups with fewer than five records are suppressed.
select
  ano_estatistica,
  coalesce(nullif(trim(rubrica), ''), '(sem rubrica)') as rubrica,
  coalesce(nullif(trim(natureza_apurada), ''), '(sem natureza apurada)') as natureza_apurada,
  case
    when coalesce(rubrica, '') ilike '%roub%'
      and coalesce(natureza_apurada, '') ilike '%roub%'
      then 'sinal de roubo em ambos'
    when coalesce(rubrica, '') ilike '%roub%'
      then 'sinal somente na rubrica'
    else 'sinal somente na natureza'
  end as concordancia,
  count(*) as registros
from public.crime_occurrences
where ano_estatistica is not null
  and upper(trim(subtipo_local)) in ('VIA PÚBLICA', 'VIA PUBLICA')
  and (
    coalesce(rubrica, '') ilike '%roub%'
    or coalesce(natureza_apurada, '') ilike '%roub%'
  )
group by
  ano_estatistica,
  coalesce(nullif(trim(rubrica), ''), '(sem rubrica)'),
  coalesce(nullif(trim(natureza_apurada), ''), '(sem natureza apurada)'),
  case
    when coalesce(rubrica, '') ilike '%roub%'
      and coalesce(natureza_apurada, '') ilike '%roub%'
      then 'sinal de roubo em ambos'
    when coalesce(rubrica, '') ilike '%roub%'
      then 'sinal somente na rubrica'
    else 'sinal somente na natureza'
  end
having count(*) >= 5
order by ano_estatistica, registros desc, rubrica, natureza_apurada;
