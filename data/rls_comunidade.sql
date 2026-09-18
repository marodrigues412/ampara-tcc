-- Visibilidade dos registros da comunidade.
--
-- occurrences ("Registrar ocorrência") alimenta o mapa colaborativo: toda usuária logada
-- enxerga os relatos de todas, mas SEM saber quem registrou. Por isso a tabela em si só
-- mostra à usuária os próprios relatos (tela "Meus relatos"), e o mapa lê pela função
-- nearby_occurrences, que roda como dona da tabela e devolve só campos públicos — nunca
-- user_id.
--
-- alert_logs (SOS) segue privado: cada usuária só vê os próprios alertas.

-- occurrences: tabela restrita à autora -------------------------------------------------
drop policy if exists "user owns occurrences" on public.occurrences;
drop policy if exists "comunidade le ocorrencias" on public.occurrences;
drop policy if exists "autora le ocorrencia" on public.occurrences;
drop policy if exists "autora cria ocorrencia" on public.occurrences;
drop policy if exists "autora edita ocorrencia" on public.occurrences;
drop policy if exists "autora apaga ocorrencia" on public.occurrences;

create policy "autora le ocorrencia"
  on public.occurrences for select
  to authenticated
  using (auth.uid() = user_id);

create policy "autora cria ocorrencia"
  on public.occurrences for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "autora edita ocorrencia"
  on public.occurrences for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "autora apaga ocorrencia"
  on public.occurrences for delete
  to authenticated
  using (auth.uid() = user_id);

-- occurrences: leitura anônima da comunidade -------------------------------------------
-- security definer ignora a RLS acima, então a própria função impõe os limites: só
-- usuária logada, raio e quantidade com teto (senão um raio gigante vira "baixe a tabela
-- inteira") e nenhuma coluna que identifique a autora.
create or replace function public.nearby_occurrences(
  user_lat double precision,
  user_lon double precision,
  raio_km double precision default 3,
  max_resultados integer default 200
)
returns table (
  id uuid,
  latitude double precision,
  longitude double precision,
  tipo_crime text,
  descricao text,
  address text,
  horario text,
  distancia_km double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with limites as (
    select least(greatest(raio_km, 0), 10) as raio,
           least(greatest(max_resultados, 0), 500) as maximo
  ),
  vizinhanca as (
    select
      o.id,
      o.latitude,
      o.longitude,
      o.tipo_crime,
      o.descricao,
      o.address,
      o.horario,
      sqrt(
        power((o.latitude - user_lat) * 111, 2) +
        power((o.longitude - user_lon) * 111 * cos(radians(user_lat)), 2)
      ) as dist_km
    from public.occurrences o, limites l
    where auth.uid() is not null
      and o.latitude between user_lat - (l.raio / 111.0)
                         and user_lat + (l.raio / 111.0)
      and o.longitude between user_lon - (l.raio / (111.0 * cos(radians(user_lat))))
                          and user_lon + (l.raio / (111.0 * cos(radians(user_lat))))
  )
  select v.id, v.latitude, v.longitude, v.tipo_crime, v.descricao, v.address, v.horario, v.dist_km
  from vizinhanca v, limites l
  where v.dist_km <= l.raio
  order by v.dist_km
  limit (select maximo from limites);
$$;

revoke all on function public.nearby_occurrences(double precision, double precision, double precision, integer) from public, anon;
grant execute on function public.nearby_occurrences(double precision, double precision, double precision, integer) to authenticated;

-- alert_logs ---------------------------------------------------------------------------
-- Policies se somam com OR. Esta tinha "with check (true)" e deixava qualquer usuária
-- logada gravar um alerta em nome de outra (user_id arbitrário), o que falsificaria o
-- histórico de SOS e o Dashboard da vítima. "user owns alert logs" já cobre o insert
-- legítimo.
drop policy if exists "Permitir insert para usuarios autenticados" on public.alert_logs;
