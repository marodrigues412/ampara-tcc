-- Grade pré-calculada para o mapa de calor.
--
-- O mapa não precisa de ocorrências individuais: precisa saber quantas aconteceram em
-- cada pedaço do território. Calcular isso a cada arrasto do mapa custava de 1 a 3,5
-- segundos, porque obrigava o banco a ler dezenas de milhares de linhas da tabela de 2,2
-- milhões — e a função nearby_crimes ainda ordenava tudo por distância, trabalho jogado
-- fora quando o destino é uma mancha de cor.
--
-- Aqui a soma é feita uma vez só, e a consulta do app vira uma leitura indexada de
-- algumas centenas de linhas.
--
-- Depois de cada importação da SSP, atualize com:
--   refresh materialized view concurrently public.crime_grid;

-- ~70 m: fino o bastante para o calor acompanhar o traçado das ruas.
-- Mudar este valor exige recriar a view inteira.
drop materialized view if exists public.crime_grid;

create materialized view public.crime_grid as
select
  ano_estatistica as ano,
  case
    when natureza_apurada like 'ROUBO%%' or natureza_apurada like 'LATROC%%' then 'roubo'
    when natureza_apurada like 'FURTO%%' then 'furto'
    when natureza_apurada like '%%CULPOS%%' or natureza_apurada like '%%TRANSITO%%' then 'transito'
    when natureza_apurada like 'HOMIC%%' or natureza_apurada like 'ESTUPRO%%'
      or natureza_apurada like 'LES%%O CORPORAL DOLOSA%%' then 'violencia'
    else 'outros'
  end as grupo,
  round((latitude / 0.00063)::numeric)::double precision * 0.00063 as lat,
  round((longitude / 0.00063)::numeric)::double precision * 0.00063 as lon,
  count(*)::integer as peso
from public.crime_occurrences
where latitude is not null
  and longitude is not null
  and ano_estatistica is not null
group by 1, 2, 3, 4;

-- O índice único é exigência do refresh concurrently, que evita travar a leitura do app
-- enquanto a grade é recalculada.
create unique index crime_grid_chave_idx on public.crime_grid (ano, grupo, lat, lon);
create index crime_grid_lat_lon_idx on public.crime_grid (lat, lon);

analyze public.crime_grid;

-- Devolve as células dentro da área visível do mapa.
--
-- Os parâmetros terminam em _filtro de propósito: nomeá-los "ano" e "grupo", igual às
-- colunas, faz o Postgres resolver "g.ano = ano" como a coluna comparada consigo mesma —
-- a condição vira sempre verdadeira e o filtro é silenciosamente ignorado.
--
-- celula_graus junta células vizinhas quando o mapa está afastado. Sem isso, uma visão de
-- 12 km devolveria 87 mil células, que o aplicativo não tem como desenhar nem receber.
--
-- A janela de longitude corrige pelo cosseno da latitude: sem isso ela sai ~9% estreita
-- em São Paulo e corta as bordas.
create or replace function public.crimes_mapa_calor(
  user_lat double precision,
  user_lon double precision,
  raio_km double precision default 3,
  ano_filtro integer default null,
  grupos_filtro text[] default null,
  celula_graus double precision default 0.00063
)
returns table (lat double precision, lon double precision, peso integer)
language sql
stable
as $$
  select
    round((g.lat / celula_graus)::numeric)::double precision * celula_graus,
    round((g.lon / celula_graus)::numeric)::double precision * celula_graus,
    sum(g.peso)::integer
  from public.crime_grid g
  where g.lat between user_lat - (raio_km / 111.0)
                  and user_lat + (raio_km / 111.0)
    and g.lon between user_lon - (raio_km / (111.0 * cos(radians(user_lat))))
                  and user_lon + (raio_km / (111.0 * cos(radians(user_lat))))
    and (ano_filtro is null or g.ano = ano_filtro)
    and (grupos_filtro is null or g.grupo = any(grupos_filtro))
  group by 1, 2;
$$;

grant select on public.crime_grid to anon, authenticated;
grant execute on function public.crimes_mapa_calor(double precision, double precision, double precision, integer, text[], double precision) to anon, authenticated;
