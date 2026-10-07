-- Busca ocorrências próximas usando o índice GiST do PostGIS.
-- Rode no SQL Editor do Supabase. A RPC mantém o contrato consumido pelo app e
-- retorna no máximo os registros mais próximos dentro do raio e do ano escolhido.

-- ---------------------------------------------------------------------------
-- PARTE 1 — Índice
-- ---------------------------------------------------------------------------
-- O índice atual é composto: (latitude, longitude). Num filtro 2D o Postgres só consegue
-- usar a PRIMEIRA coluna para delimitar a varredura — a faixa de latitude — e aplica a
-- longitude como filtro linha a linha. Uma faixa de ±0,027° de latitude atravessa o
-- estado de São Paulo inteiro de leste a oeste, o que explica por que consultas de
-- contagem nessa tabela estouram o statement timeout.
--
-- Dois índices separados deixam o planner combinar os dois via bitmap index scan, que é
-- bem mais seletivo do que varrer a faixa inteira de latitude.
create index if not exists crime_occurrences_latitude_idx
  on public.crime_occurrences (latitude);

create index if not exists crime_occurrences_longitude_idx
  on public.crime_occurrences (longitude);

-- Recorte por recência é o filtro mais usado pelo app junto com a posição.
create index if not exists crime_occurrences_ano_idx
  on public.crime_occurrences (ano_estatistica);

-- Índice espacial usado pela busca KNN abaixo. A expressão e o predicado precisam
-- corresponder aos usados pela função para o planner conseguir aproveitar o GiST.
create index if not exists crime_occurrences_geography_gix
  on public.crime_occurrences using gist (
    (extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography)
  )
  where latitude is not null
    and longitude is not null
    and latitude between -90 and 90
    and longitude between -180 and 180;

-- ---------------------------------------------------------------------------
-- PARTE 2 — Busca KNN indexada por proximidade
-- ---------------------------------------------------------------------------

-- A ordenação KNN (<->) deixa o GiST percorrer os pontos mais próximos primeiro.
-- Só depois de limitar os candidatos calculamos a distância geodésica exata e ordenamos
-- o resultado final. Isso evita calcular ST_Distance para toda a vizinhança (que pode
-- conter centenas de milhares de ocorrências quando ano é NULL).
create or replace function public.nearby_crimes(
  user_lat double precision,
  user_lon double precision,
  raio_km double precision default 3,
  max_resultados integer default 200,
  ano integer default null
)
returns table (
  id bigint,
  latitude double precision,
  longitude double precision,
  natureza_apurada text,
  conduta text,
  bairro text,
  cidade text,
  ano_estatistica integer,
  distancia_km double precision
)
language sql
stable
as $$
  with ponto_usuario as (
    select extensions.st_setsrid(
      extensions.st_makepoint(user_lon, user_lat), 4326
    )::extensions.geography as ponto
  ),
  candidatos as (
    select
      c.id,
      c.latitude,
      c.longitude,
      c.natureza_apurada,
      c.conduta,
      c.bairro,
      c.cidade,
      c.ano_estatistica,
      extensions.st_setsrid(
        extensions.st_makepoint(c.longitude::double precision, c.latitude::double precision),
        4326
      )::extensions.geography as geom,
      p.ponto
    from public.crime_occurrences c
    cross join ponto_usuario p
    where c.latitude between -90 and 90
      and c.longitude between -180 and 180
      and extensions.st_dwithin(
        extensions.st_setsrid(
          extensions.st_makepoint(c.longitude::double precision, c.latitude::double precision),
          4326
        )::extensions.geography,
        p.ponto,
        raio_km * 1000.0
      )
      and (ano is null or c.ano_estatistica = ano)
    order by extensions.st_setsrid(
      extensions.st_makepoint(c.longitude::double precision, c.latitude::double precision),
      4326
    )::extensions.geography <-> p.ponto
    limit greatest(max_resultados, 0) * 2
  ),
  medidos as (
    select
      c.id,
      c.latitude,
      c.longitude,
      c.natureza_apurada,
      c.conduta,
      c.bairro,
      c.cidade,
      c.ano_estatistica,
      extensions.st_distance(c.geom, c.ponto) / 1000.0 as distancia_km
    from candidatos c
  )
  select
    m.id,
    m.latitude,
    m.longitude,
    m.natureza_apurada,
    m.conduta,
    m.bairro,
    m.cidade,
    m.ano_estatistica,
    m.distancia_km
  from medidos m
  order by m.distancia_km
  limit max_resultados;
$$;

-- nearby_occurrences fica em rls_comunidade.sql: ela precisa rodar como security
-- definer para expor os relatos da comunidade sem revelar quem registrou.


grant execute on function public.nearby_crimes(double precision, double precision, double precision, integer, integer) to anon, authenticated;
