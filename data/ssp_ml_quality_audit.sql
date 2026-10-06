-- Read-only data-quality audit for the ML context layer.
-- Outputs monthly aggregates only; never returns addresses or exact coordinates.

select
  ano_estatistica,
  mes_estatistica,
  count(*) as registros,
  count(*) filter (where nullif(trim(coalesce(bairro, '')), '') is null) as sem_bairro,
  count(*) filter (where nullif(trim(coalesce(periodo, '')), '') is null) as sem_periodo,
  count(*) filter (
    where latitude is null or longitude is null or latitude = 0 or longitude = 0
  ) as sem_coordenada_utilizavel,
  count(*) filter (
    where coalesce(rubrica, '') ilike '%feminic%'
       or coalesce(natureza_apurada, '') ilike '%feminic%'
  ) as feminicidio,
  count(*) filter (
    where coalesce(rubrica, '') ilike '%estupro%'
       or coalesce(natureza_apurada, '') ilike '%estupro%'
  ) as estupro,
  count(*) filter (
    where coalesce(natureza_apurada, '') ilike '%lesão corporal dolosa%'
       or coalesce(natureza_apurada, '') ilike '%lesao corporal dolosa%'
  ) as lesao_corporal_dolosa,
  count(*) filter (
    where coalesce(rubrica, '') ilike '%ameaça%'
       or coalesce(rubrica, '') ilike '%ameaca%'
       or coalesce(natureza_apurada, '') ilike '%ameaça%'
       or coalesce(natureza_apurada, '') ilike '%ameaca%'
  ) as ameaca,
  count(*) filter (
    where (
      coalesce(rubrica, '') ilike '%roubo%'
      or coalesce(natureza_apurada, '') ilike '%roubo%'
    )
      and coalesce(tipo_local, '') ilike '%via pública%'
  ) as roubo_via_publica,
  count(*) filter (where coalesce(delegacia, '') ilike '%ddm%') as registros_ddm
from public.crime_occurrences
where ano_estatistica is not null
  and mes_estatistica between 1 and 12
group by ano_estatistica, mes_estatistica
order by ano_estatistica, mes_estatistica;

-- Normalize broad period labels and inspect completeness by month.
-- Missing period and "hora incerta" remain separate unknown categories.
select
  ano_estatistica,
  mes_estatistica,
  case
    when nullif(trim(periodo), '') is null then '(sem período)'
    when upper(trim(periodo)) like '%HORA INCERTA%' then '(hora incerta)'
    when upper(trim(periodo)) like '%MADRUGADA%' then 'madrugada'
    when upper(trim(periodo)) like '%MANH%' then 'manhã'
    when upper(trim(periodo)) like '%TARDE%' then 'tarde'
    when upper(trim(periodo)) like '%NOITE%' then 'noite'
    else 'outro: ' || upper(trim(periodo))
  end as periodo_normalizado,
  count(*) as registros
from public.crime_occurrences
where ano_estatistica is not null and mes_estatistica between 1 and 12
group by ano_estatistica, mes_estatistica, periodo_normalizado
having count(*) >= 5
order by ano_estatistica, mes_estatistica, registros desc, periodo_normalizado;

-- Compare category-word signals in the two source fields independently.
-- A disagreement is for manual taxonomy review, not an automatic label.
with field_signals as (
  select
    ano_estatistica,
    coalesce(nullif(trim(rubrica), ''), '(sem rubrica)') as rubrica,
    coalesce(nullif(trim(natureza_apurada), ''), '(sem natureza apurada)') as natureza_apurada,
    coalesce(nullif(trim(tipo_local), ''), '(sem tipo local)') as tipo_local,
    coalesce(rubrica, '') ilike '%feminic%' as r_feminicidio,
    coalesce(natureza_apurada, '') ilike '%feminic%' as n_feminicidio,
    coalesce(rubrica, '') ilike '%estup%' as r_estupro,
    coalesce(natureza_apurada, '') ilike '%estup%' as n_estupro,
    coalesce(rubrica, '') ilike '%roub%' as r_roubo,
    coalesce(natureza_apurada, '') ilike '%roub%' as n_roubo,
    coalesce(rubrica, '') ilike '%ameac%' or coalesce(rubrica, '') ilike '%ameaça%' as r_ameaca,
    coalesce(natureza_apurada, '') ilike '%ameac%' or coalesce(natureza_apurada, '') ilike '%ameaça%' as n_ameaca
  from public.crime_occurrences
  where ano_estatistica is not null
), comparisons as (
  select year, category, rubric_match, nature_match
  from field_signals
  cross join lateral (values
    (ano_estatistica, 'feminicídio', r_feminicidio, n_feminicidio),
    (ano_estatistica, 'estupro', r_estupro, n_estupro),
    (ano_estatistica, 'roubo', r_roubo, n_roubo),
    (ano_estatistica, 'ameaça', r_ameaca, n_ameaca)
  ) as signal(year, category, rubric_match, nature_match)
)
select
  year as ano_estatistica,
  category as categoria,
  count(*) filter (where rubric_match) as sinal_em_rubrica,
  count(*) filter (where nature_match) as sinal_em_natureza,
  count(*) filter (where rubric_match and nature_match) as sinal_em_ambos,
  count(*) filter (where rubric_match and not nature_match) as somente_rubrica,
  count(*) filter (where nature_match and not rubric_match) as somente_natureza
from comparisons
group by year, category
having count(*) filter (where rubric_match or nature_match) >= 5
order by year, category;

-- Examples of disagreements, using only aggregate label combinations.
with mismatches as (
  select
    ano_estatistica,
    coalesce(nullif(trim(rubrica), ''), '(sem rubrica)') as rubrica,
    coalesce(nullif(trim(natureza_apurada), ''), '(sem natureza apurada)') as natureza_apurada,
    coalesce(rubrica, '') ilike '%feminic%' as r_feminicidio,
    coalesce(natureza_apurada, '') ilike '%feminic%' as n_feminicidio,
    coalesce(rubrica, '') ilike '%estup%' as r_estupro,
    coalesce(natureza_apurada, '') ilike '%estup%' as n_estupro,
    coalesce(rubrica, '') ilike '%roub%' as r_roubo,
    coalesce(natureza_apurada, '') ilike '%roub%' as n_roubo,
    coalesce(rubrica, '') ilike '%ameac%' or coalesce(rubrica, '') ilike '%ameaça%' as r_ameaca,
    coalesce(natureza_apurada, '') ilike '%ameac%' or coalesce(natureza_apurada, '') ilike '%ameaça%' as n_ameaca
  from public.crime_occurrences
  where ano_estatistica is not null
), disagreement_labels as (
  select ano_estatistica, category, rubrica, natureza_apurada
  from mismatches
  cross join lateral (values
    ('feminicídio', r_feminicidio, n_feminicidio),
    ('estupro', r_estupro, n_estupro),
    ('roubo', r_roubo, n_roubo),
    ('ameaça', r_ameaca, n_ameaca)
  ) as signal(category, rubric_match, nature_match)
  where rubric_match <> nature_match
)
select ano_estatistica, category as categoria, rubrica, natureza_apurada, count(*) as registros
from disagreement_labels
group by ano_estatistica, category, rubrica, natureza_apurada
having count(*) >= 5
order by ano_estatistica, category, registros desc, rubrica, natureza_apurada;
