-- Funções RPC para buscar ocorrências próximas já ORDENADAS por distância.
--
-- Motivo: filtrar por bounding box e aplicar LIMIT sem ORDER BY faz o Postgres devolver
-- os registros em ordem física arbitrária, e o corte do LIMIT descarta candidatos que
-- estavam mais perto da usuária do que alguns que sobraram. Pior: o Supabase impõe um
-- teto de 1.000 linhas por requisição (db-max-rows), então em área densa o cliente nunca
-- enxerga a vizinhança inteira. Calculando e ordenando a distância dentro do banco, o
-- LIMIT passa a cortar sempre pelos mais distantes.
--
-- Rode no SQL Editor do Supabase. As PARTES 1 e 2 já resolvem; a PARTE 3 é opcional.

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

-- ---------------------------------------------------------------------------
-- PARTE 2 — Funções de busca por proximidade
-- ---------------------------------------------------------------------------
-- Duas correções em relação à primeira versão destas funções:
--
--   1. A janela de longitude também precisa do cosseno da latitude. Um grau de latitude
--      são ~111 km em qualquer lugar, mas um grau de longitude encolhe conforme se
--      afasta do equador — em São Paulo vale ~102 km. Dividir por 111 nos dois eixos
--      deixa a janela leste-oeste ~9% estreita e descarta registros de borda ANTES da
--      ordenação, que é justamente onde eles fariam falta.
--
--   2. A caixa é quadrada, mas "raio" sugere círculo. Sem o recorte final, um registro
--      no canto da caixa aparece a até 4,24 km numa busca anunciada como de 3 km.

-- O "create or replace" não renomeia parâmetro (a versão anterior chamava-se ano_minimo)
-- nem muda as colunas devolvidas, então a função precisa ser removida antes de recriada.
drop function if exists public.nearby_crimes(double precision, double precision, double precision, integer, integer);

-- ano: filtra um ano específico (null = todos). Filtrar aqui, e não no app, é o que faz
-- diferença: o corte de max_resultados passa a valer dentro do ano escolhido, senão o
-- app receberia os mais próximos de qualquer ano e sobraria quase nada do ano filtrado.
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
  -- O nome interno é dist_km, e não distancia_km, de propósito: distancia_km já existe
  -- como parâmetro de saída do RETURNS TABLE, e num corpo "language sql" o mesmo
  -- identificador valendo como coluna e como parâmetro é ambiguidade pedindo para dar
  -- errado. As referências saem qualificadas por v. pelo mesmo motivo.
  with vizinhanca as (
    select
      c.id,
      c.latitude,
      c.longitude,
      c.natureza_apurada,
      c.conduta,
      c.bairro,
      c.cidade,
      c.ano_estatistica,
      sqrt(
        power((c.latitude - user_lat) * 111, 2) +
        power((c.longitude - user_lon) * 111 * cos(radians(user_lat)), 2)
      ) as dist_km
    from public.crime_occurrences c
    -- BETWEEN já descarta NULL (a comparação não resulta em TRUE), então não é preciso
    -- checar "is not null" à parte.
    where c.latitude between user_lat - (raio_km / 111.0)
                         and user_lat + (raio_km / 111.0)
      and c.longitude between user_lon - (raio_km / (111.0 * cos(radians(user_lat))))
                          and user_lon + (raio_km / (111.0 * cos(radians(user_lat))))
      and (ano is null or c.ano_estatistica = ano)
  )
  select
    v.id,
    v.latitude,
    v.longitude,
    v.natureza_apurada,
    v.conduta,
    v.bairro,
    v.cidade,
    v.ano_estatistica,
    v.dist_km
  from vizinhanca v
  where v.dist_km <= raio_km
  order by v.dist_km
  limit max_resultados;
$$;

-- nearby_occurrences fica em rls_comunidade.sql: ela precisa rodar como security
-- definer para expor os relatos da comunidade sem revelar quem registrou.


grant execute on function public.nearby_crimes(double precision, double precision, double precision, integer, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- PARTE 3 (OPCIONAL) — PostGIS
-- ---------------------------------------------------------------------------
-- A PARTE 2 ainda ordena por uma expressão, o que obriga o Postgres a calcular a
-- distância de todas as linhas da caixa antes de ordenar. Com PostGIS a busca vira uma
-- varredura KNN sobre índice GiST: o banco caminha do ponto mais próximo para fora e
-- para assim que junta max_resultados, sem caixa nenhuma e sem tocar no resto da tabela.
-- Também troca a aproximação plana por distância geodésica de verdade.
--
-- ATENÇÃO antes de rodar: adicionar coluna gerada reescreve a tabela inteira. São ~2
-- milhões de linhas, então isso leva alguns minutos e segura lock de escrita — faça fora
-- da janela de uso e não no meio de uma importação da SSP.
--
-- create extension if not exists postgis;
--
-- alter table public.crime_occurrences
--   add column if not exists geom geography(Point, 4326)
--   generated always as (
--     st_setsrid(st_makepoint(longitude, latitude), 4326)::geography
--   ) stored;
--
-- create index if not exists crime_occurrences_geom_idx
--   on public.crime_occurrences using gist (geom);
--
-- create or replace function public.nearby_crimes(
--   user_lat double precision,
--   user_lon double precision,
--   raio_km double precision default 3,
--   max_resultados integer default 200,
--   ano_minimo integer default null
-- )
-- returns table (
--   id bigint,
--   latitude double precision,
--   longitude double precision,
--   natureza_apurada text,
--   conduta text,
--   bairro text,
--   cidade text,
--   distancia_km double precision
-- )
-- language sql
-- stable
-- as $$
--   select
--     c.id,
--     c.latitude,
--     c.longitude,
--     c.natureza_apurada,
--     c.conduta,
--     c.bairro,
--     c.cidade,
--     st_distance(c.geom, p.ponto) / 1000.0 as distancia_km
--   from public.crime_occurrences c
--   cross join (
--     select st_setsrid(st_makepoint(user_lon, user_lat), 4326)::geography as ponto
--   ) p
--   where st_dwithin(c.geom, p.ponto, raio_km * 1000)
--     and (ano_minimo is null or c.ano_estatistica >= ano_minimo)
--   order by c.geom <-> p.ponto
--   limit max_resultados;
-- $$;
