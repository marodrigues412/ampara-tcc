-- Read-only taxonomy audit for the Ampara contextual-risk study.
-- Aggregates source labels by year; no occurrence IDs, locations, or addresses.
-- The traffic flag is only a keyword-based review aid, not a final classification.
-- Groups with fewer than five records are suppressed.
with grouped_labels as (
  select
    ano_estatistica,
    coalesce(nullif(trim(rubrica), ''), '(sem rubrica)') as rubrica,
    coalesce(nullif(trim(natureza_apurada), ''), '(sem natureza apurada)') as natureza_apurada,
    count(*) as registros
  from public.crime_occurrences
  where ano_estatistica is not null
  group by
    ano_estatistica,
    coalesce(nullif(trim(rubrica), ''), '(sem rubrica)'),
    coalesce(nullif(trim(natureza_apurada), ''), '(sem natureza apurada)')
)
select
  ano_estatistica,
  rubrica,
  natureza_apurada,
  case
    when rubrica ilike '%trânsito%' or rubrica ilike '%transito%'
      or natureza_apurada ilike '%trânsito%' or natureza_apurada ilike '%transito%'
      or rubrica ilike '%acidente%' or natureza_apurada ilike '%acidente%'
      or rubrica ilike '%atropel%' or natureza_apurada ilike '%atropel%'
      or rubrica ilike '%colisão%' or rubrica ilike '%colisao%'
      or natureza_apurada ilike '%colisão%' or natureza_apurada ilike '%colisao%'
      then 'possível sinal de trânsito: revisar'
    else 'sem sinal de trânsito por palavra-chave'
  end as triagem_transito,
  registros
from grouped_labels
where registros >= 5
order by ano_estatistica, registros desc, rubrica, natureza_apurada;
