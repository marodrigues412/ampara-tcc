-- Contagem de ocorrências por tipo na região, para o score de risco, os números dos
-- botões de filtro e a faixa de status.
--
-- Antes isso vinha de nearby_crimes, que traz ocorrência por ocorrência (até 1.000) e
-- ordena por distância. Para contar, era desperdício: a consulta levava 4,3 segundos e
-- estourava o limite de tempo do banco. Lendo a mesma informação da grade já somada, cai
-- para 150 ms.
--
-- Um ganho adicional: nearby_crimes vinha truncada em 1.000 registros, então o score via
-- no máximo mil ocorrências por mais densa que fosse a região. Aqui o total é real.

create or replace function public.crimes_resumo(
  user_lat double precision,
  user_lon double precision,
  raio_km double precision default 3,
  ano_filtro integer default null
)
returns table (grupo text, total integer)
language sql
stable
as $$
  select g.grupo, sum(g.peso)::integer
  from public.crime_grid g
  where g.lat between user_lat - (raio_km / 111.0)
                  and user_lat + (raio_km / 111.0)
    -- A janela de longitude encolhe com o cosseno da latitude; sem isso ela sai ~9%
    -- estreita em São Paulo.
    and g.lon between user_lon - (raio_km / (111.0 * cos(radians(user_lat))))
                  and user_lon + (raio_km / (111.0 * cos(radians(user_lat))))
    and (ano_filtro is null or g.ano = ano_filtro)
  group by g.grupo;
$$;

grant execute on function public.crimes_resumo(double precision, double precision, double precision, integer) to anon, authenticated;
