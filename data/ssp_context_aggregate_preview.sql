-- Read-only preview of the SSP contextual layer.
-- Outputs aggregates only: no event IDs, addresses, or exact coordinates.
-- Cells with fewer than five rows are suppressed.
-- natureza_apurada is retained as a source label; this query does not assign
-- severity weights or claim that the labels have already been validated.
with source_rows as (
  select
    ano_estatistica,
    mes_estatistica,
    coalesce(nullif(trim(cidade), ''), '(sem município)') as municipio,
    coalesce(nullif(trim(bairro), ''), '(sem bairro)') as bairro,
    coalesce(nullif(trim(natureza_apurada), ''), '(sem natureza apurada)') as natureza_ssp,
    nullif(trim(periodo), '') as periodo_original,
    case
      when trim(hora_ocorrencia::text) ~ '^([01][0-9]|2[0-3]):'
        then substring(trim(hora_ocorrencia::text) from 1 for 2)::integer
      else null
    end as hora
  from public.crime_occurrences
  where ano_estatistica is not null
    and mes_estatistica between 1 and 12
), perioded as (
  select
    ano_estatistica,
    mes_estatistica,
    municipio,
    bairro,
    natureza_ssp,
    case
      when upper(periodo_original) like '%HORA INCERTA%' then '(hora incerta)'
      when upper(periodo_original) like '%MADRUGADA%' then 'madrugada'
      when upper(periodo_original) like '%MANH%' then 'manhã'
      when upper(periodo_original) like '%TARDE%' then 'tarde'
      when upper(periodo_original) like '%NOITE%' then 'noite'
      when periodo_original is not null then '(rótulo não reconhecido)'
      when hora between 0 and 5 then 'madrugada'
      when hora between 6 and 11 then 'manhã'
      when hora between 12 and 17 then 'tarde'
      when hora between 18 and 23 then 'noite'
      else '(desconhecido)'
    end as periodo,
    case
      when upper(periodo_original) like '%HORA INCERTA%' then 'hora_incerta'
      when upper(periodo_original) like '%MADRUGADA%'
        or upper(periodo_original) like '%MANH%'
        or upper(periodo_original) like '%TARDE%'
        or upper(periodo_original) like '%NOITE%' then 'informado'
      when periodo_original is not null then 'rotulo_nao_reconhecido'
      when hora between 0 and 23 then 'derivado_da_hora'
      else 'desconhecido'
    end as periodo_origem
  from source_rows
)
select
  ano_estatistica,
  mes_estatistica,
  municipio,
  bairro,
  periodo,
  periodo_origem,
  natureza_ssp,
  count(*) as ocorrencias
from perioded
group by
  ano_estatistica,
  mes_estatistica,
  municipio,
  bairro,
  periodo,
  periodo_origem,
  natureza_ssp
having count(*) >= 5
order by ano_estatistica, mes_estatistica, municipio, bairro, periodo, natureza_ssp;
