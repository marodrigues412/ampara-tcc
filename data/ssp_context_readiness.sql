-- Read-only readiness audit for the SSP contextual layer.
-- Aggregates only; no event IDs, addresses, or precise coordinates are returned.
-- A usable context row needs municipality, neighborhood, occurrence date, and period.

with source_rows as (
  select
    ano_estatistica,
    mes_estatistica,
    nullif(trim(cidade), '') as municipio,
    nullif(trim(bairro), '') as bairro,
    data_ocorrencia,
    nullif(trim(periodo), '') as periodo_original,
    case
      when trim(hora_ocorrencia::text) ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\.[0-9]+)?)?$'
        then substring(trim(hora_ocorrencia::text) from 1 for 2)::integer
      else null
    end as hora
  from public.crime_occurrences
  where ano_estatistica is not null
    and mes_estatistica between 1 and 12
), resolved as (
  select
    *,
    case
      when upper(periodo_original) like '%HORA INCERTA%' then null
      when upper(periodo_original) like '%MADRUGADA%' then 'madrugada'
      when upper(periodo_original) like '%MANH%' then 'manhã'
      when upper(periodo_original) like '%TARDE%' then 'tarde'
      when upper(periodo_original) like '%NOITE%' then 'noite'
      when periodo_original is not null then null
      when hora between 0 and 5 then 'madrugada'
      when hora between 6 and 11 then 'manhã'
      when hora between 12 and 17 then 'tarde'
      when hora between 18 and 23 then 'noite'
      else null
    end as periodo_resolvido,
    case
      when upper(periodo_original) like '%HORA INCERTA%' then 'hora_incerta'
      when periodo_original is not null and (
        upper(periodo_original) like '%MADRUGADA%'
        or upper(periodo_original) like '%MANH%'
        or upper(periodo_original) like '%TARDE%'
        or upper(periodo_original) like '%NOITE%'
      ) then 'informado'
      when periodo_original is not null then 'rotulo_nao_reconhecido'
      when hora between 0 and 23 then 'derivado_da_hora'
      else 'desconhecido'
    end as origem_periodo
  from source_rows
)
select
  ano_estatistica,
  count(*) as registros,
  count(distinct mes_estatistica) as meses_com_dados,
  count(*) filter (where municipio is not null and bairro is not null) as com_municipio_e_bairro,
  count(*) filter (where data_ocorrencia is not null) as com_data_ocorrencia,
  count(*) filter (where periodo_resolvido is not null) as com_periodo_utilizavel,
  count(*) filter (
    where municipio is not null
      and bairro is not null
      and data_ocorrencia is not null
      and periodo_resolvido is not null
  ) as aptos_para_agregacao_contextual,
  round(
    100.0 * count(*) filter (
      where municipio is not null
        and bairro is not null
        and data_ocorrencia is not null
        and periodo_resolvido is not null
    ) / nullif(count(*), 0),
    2
  ) as percentual_apto,
  count(*) filter (where origem_periodo = 'informado') as periodo_informado,
  count(*) filter (where origem_periodo = 'derivado_da_hora') as periodo_derivado_da_hora,
  count(*) filter (where origem_periodo = 'hora_incerta') as periodo_hora_incerta,
  count(*) filter (
    where origem_periodo in ('desconhecido', 'rotulo_nao_reconhecido')
  ) as periodo_desconhecido_ou_nao_reconhecido
from resolved
group by ano_estatistica
order by ano_estatistica;
