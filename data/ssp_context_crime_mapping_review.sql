-- Read-only review of SSP label pairs matching the professor's candidate groups.
-- Keyword matches are candidates for manual review, not final classification.
-- Aggregates only; no event IDs, neighborhoods, addresses, or coordinates returned.
-- Label combinations with fewer than five records are suppressed.

with label_pairs as (
  select
    ano_estatistica,
    coalesce(nullif(trim(rubrica), ''), '(sem rubrica)') as rubrica,
    coalesce(nullif(trim(natureza_apurada), ''), '(sem natureza apurada)') as natureza_apurada,
    coalesce(nullif(trim(tipo_local), ''), '(sem tipo local)') as tipo_local,
    coalesce(nullif(trim(subtipo_local), ''), '(sem subtipo local)') as subtipo_local,
    count(*) as registros
  from public.crime_occurrences
  where ano_estatistica is not null
  group by
    ano_estatistica,
    coalesce(nullif(trim(rubrica), ''), '(sem rubrica)'),
    coalesce(nullif(trim(natureza_apurada), ''), '(sem natureza apurada)'),
    coalesce(nullif(trim(tipo_local), ''), '(sem tipo local)'),
    coalesce(nullif(trim(subtipo_local), ''), '(sem subtipo local)')
), candidates as (
  select
    p.*,
    candidate.grupo_candidato,
    candidate.sinal_na_rubrica,
    candidate.sinal_na_natureza
  from label_pairs p
  cross join lateral (values
    (
      'feminicídio',
      p.rubrica ilike '%feminic%' or p.natureza_apurada ilike '%feminic%',
      p.rubrica ilike '%feminic%',
      p.natureza_apurada ilike '%feminic%'
    ),
    (
      'estupro',
      p.rubrica ilike '%estup%' or p.natureza_apurada ilike '%estup%',
      p.rubrica ilike '%estup%',
      p.natureza_apurada ilike '%estup%'
    ),
    (
      'lesão corporal dolosa',
      p.rubrica ilike '%dolosa%' or p.natureza_apurada ilike '%dolosa%',
      p.rubrica ilike '%dolosa%',
      p.natureza_apurada ilike '%dolosa%'
    ),
    (
      'ameaça',
      p.rubrica ilike '%ameac%' or p.rubrica ilike '%ameaça%'
        or p.natureza_apurada ilike '%ameac%' or p.natureza_apurada ilike '%ameaça%',
      p.rubrica ilike '%ameac%' or p.rubrica ilike '%ameaça%',
      p.natureza_apurada ilike '%ameac%' or p.natureza_apurada ilike '%ameaça%'
    ),
    (
      'roubo em via pública',
      (
        p.rubrica ilike '%roub%' or p.natureza_apurada ilike '%roub%'
          or p.natureza_apurada ilike '%latroc%'
      ) and upper(p.subtipo_local) in ('VIA PÚBLICA', 'VIA PUBLICA'),
      p.rubrica ilike '%roub%',
      p.natureza_apurada ilike '%roub%' or p.natureza_apurada ilike '%latroc%'
    )
  ) as candidate(grupo_candidato, corresponde, sinal_na_rubrica, sinal_na_natureza)
  where candidate.corresponde
)
select
  ano_estatistica,
  grupo_candidato,
  rubrica,
  natureza_apurada,
  tipo_local,
  subtipo_local,
  sinal_na_rubrica,
  sinal_na_natureza,
  sum(registros) as registros
from candidates
group by
  ano_estatistica,
  grupo_candidato,
  rubrica,
  natureza_apurada,
  tipo_local,
  subtipo_local,
  sinal_na_rubrica,
  sinal_na_natureza
having sum(registros) >= 5
order by ano_estatistica, grupo_candidato, registros desc, natureza_apurada, rubrica;
