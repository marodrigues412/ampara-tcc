-- Read-only check of reported SSP periods against valid occurrence hours.
-- Aggregates by month only; no event IDs, addresses, or coordinates are returned.
-- Explicit "hora incerta", missing periods, and unrecognized labels are excluded.

with source_rows as (
  select
    ano_estatistica,
    mes_estatistica,
    case
      when upper(trim(coalesce(periodo, ''))) like '%MADRUGADA%' then 'madrugada'
      when upper(trim(coalesce(periodo, ''))) like '%MANH%' then 'manhã'
      when upper(trim(coalesce(periodo, ''))) like '%TARDE%' then 'tarde'
      when upper(trim(coalesce(periodo, ''))) like '%NOITE%' then 'noite'
      else null
    end as periodo_informado,
    case
      when trim(hora_ocorrencia::text) ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\.[0-9]+)?)?$'
        then substring(trim(hora_ocorrencia::text) from 1 for 2)::integer
      else null
    end as hora
  from public.crime_occurrences
  where ano_estatistica is not null
    and mes_estatistica between 1 and 12
    and upper(trim(coalesce(periodo, ''))) not like '%HORA INCERTA%'
), comparable as (
  select
    ano_estatistica,
    mes_estatistica,
    periodo_informado,
    case
      when hora between 0 and 5 then 'madrugada'
      when hora between 6 and 11 then 'manhã'
      when hora between 12 and 17 then 'tarde'
      when hora between 18 and 23 then 'noite'
      else null
    end as periodo_pela_hora
  from source_rows
  where periodo_informado is not null
    and hora between 0 and 23
)
select
  ano_estatistica,
  mes_estatistica,
  count(*) as pares_validos,
  count(*) filter (where periodo_informado = periodo_pela_hora) as concordam,
  count(*) filter (where periodo_informado <> periodo_pela_hora) as divergem,
  round(
    100.0 * count(*) filter (where periodo_informado = periodo_pela_hora)
      / nullif(count(*), 0),
    2
  ) as percentual_concordancia
from comparable
group by ano_estatistica, mes_estatistica
order by ano_estatistica, mes_estatistica;
