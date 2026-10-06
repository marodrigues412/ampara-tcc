-- Read-only annual totals of text-matched candidate labels for review.
-- This counts candidate strings, not validated crime classes or risk scores.
-- No event IDs, locations, addresses, or coordinates are returned.
-- Candidate totals below five are suppressed.

with years as (
  select generate_series(2022, 2026)::integer as ano_estatistica
), categories as (
  select * from (values
    ('feminicídio'::text),
    ('estupro'::text),
    ('lesão corporal dolosa'::text),
    ('ameaça'::text),
    ('roubo em via pública'::text)
  ) as c(grupo_candidato)
), source_rows as (
  select
    ano_estatistica,
    coalesce(rubrica, '') as rubrica,
    coalesce(natureza_apurada, '') as natureza_apurada,
    upper(trim(coalesce(subtipo_local, ''))) as subtipo_local
  from public.crime_occurrences
  where ano_estatistica between 2022 and 2026
), candidate_rows as (
  select
    s.ano_estatistica,
    candidate.grupo_candidato,
    candidate.sinal_na_rubrica,
    candidate.sinal_na_natureza
  from source_rows s
  cross join lateral (values
    (
      'feminicídio'::text,
      s.rubrica ilike '%feminic%' or s.natureza_apurada ilike '%feminic%',
      s.rubrica ilike '%feminic%',
      s.natureza_apurada ilike '%feminic%'
    ),
    (
      'estupro'::text,
      s.rubrica ilike '%estup%' or s.natureza_apurada ilike '%estup%',
      s.rubrica ilike '%estup%',
      s.natureza_apurada ilike '%estup%'
    ),
    (
      'lesão corporal dolosa'::text,
      s.rubrica ilike '%dolosa%' or s.natureza_apurada ilike '%dolosa%',
      s.rubrica ilike '%dolosa%',
      s.natureza_apurada ilike '%dolosa%'
    ),
    (
      'ameaça'::text,
      s.rubrica ilike '%ameac%' or s.rubrica ilike '%ameaça%'
        or s.natureza_apurada ilike '%ameac%' or s.natureza_apurada ilike '%ameaça%',
      s.rubrica ilike '%ameac%' or s.rubrica ilike '%ameaça%',
      s.natureza_apurada ilike '%ameac%' or s.natureza_apurada ilike '%ameaça%'
    ),
    (
      'roubo em via pública'::text,
      (
        s.rubrica ilike '%roub%' or s.natureza_apurada ilike '%roub%'
          or s.natureza_apurada ilike '%latroc%'
      ) and s.subtipo_local in ('VIA PÚBLICA', 'VIA PUBLICA'),
      s.rubrica ilike '%roub%',
      s.natureza_apurada ilike '%roub%' or s.natureza_apurada ilike '%latroc%'
    )
  ) as candidate(grupo_candidato, corresponde, sinal_na_rubrica, sinal_na_natureza)
  where candidate.corresponde
), annual as (
  select
    ano_estatistica,
    grupo_candidato,
    count(*) as registros_candidatos,
    count(*) filter (where sinal_na_rubrica and sinal_na_natureza) as sinal_em_ambos,
    count(*) filter (where sinal_na_rubrica and not sinal_na_natureza) as somente_rubrica,
    count(*) filter (where not sinal_na_rubrica and sinal_na_natureza) as somente_natureza
  from candidate_rows
  group by ano_estatistica, grupo_candidato
)
select
  y.ano_estatistica,
  c.grupo_candidato,
  case
    when a.registros_candidatos is null then 'sem correspondência textual'
    when a.registros_candidatos < 5 then '<5 (suprimido)'
    else a.registros_candidatos::text
  end as registros_candidatos,
  case
    when a.registros_candidatos is null then 'n/a'
    when a.registros_candidatos < 5 then '<5 (suprimido)'
    else a.sinal_em_ambos::text
  end as sinal_em_ambos,
  case
    when a.registros_candidatos is null then 'n/a'
    when a.registros_candidatos < 5 then '<5 (suprimido)'
    else a.somente_rubrica::text
  end as somente_rubrica,
  case
    when a.registros_candidatos is null then 'n/a'
    when a.registros_candidatos < 5 then '<5 (suprimido)'
    else a.somente_natureza::text
  end as somente_natureza
from years y
cross join categories c
left join annual a
  on a.ano_estatistica = y.ano_estatistica
  and a.grupo_candidato = c.grupo_candidato
order by y.ano_estatistica, c.grupo_candidato;
