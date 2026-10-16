-- Rotina da usuária: compromissos com local e horário (faculdade, trabalho, academia,
-- um jantar no sábado). Serve para o app saber onde ela deveria estar e quando, e assim
-- deduzir os horários de locomoção e perceber quando algo foge da rotina.
--
-- Só cria objetos novos: não altera nem apaga nenhuma tabela existente.
--
-- Recorrência: um compromisso tem "dias" (semanal) OU "data" (uma vez só), nunca os dois.
-- dias segue Date.getDay() do JavaScript: 0 = domingo ... 6 = sábado.
--
-- O local fica guardado no próprio compromisso (nome, endereço e coordenadas). Ele não
-- precisa ser um local seguro: um restaurante entra na rotina sem passar a reduzir o
-- score. Quando o compromisso foi criado a partir de um local seguro, safe_location_id
-- aponta para ele; se aquele local seguro for apagado, o compromisso continua com as
-- coordenadas copiadas.

create table if not exists public.routine_commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  -- estudo, trabalho, exercicio, saude, lazer, outro
  tipo text not null default 'outro',

  local_nome text not null,
  endereco text,
  latitude double precision not null,
  longitude double precision not null,
  safe_location_id uuid references public.safe_locations(id) on delete set null,

  dias smallint[],
  data date,
  hora_chegada time not null,
  hora_saida time not null,

  -- pe, onibus, carro, bike: usado para estimar o tempo do trajeto até aqui
  transporte text not null default 'onibus',
  -- Se o app deve estranhar quando ela não chega até hora_chegada + tolerancia_min.
  avisar_atraso boolean not null default true,
  tolerancia_min smallint not null default 20,
  -- Só para tipo exercicio: liga o modo atividade durante o compromisso.
  liga_modo_atividade boolean not null default false,
  ativo boolean not null default true,
  created_at timestamp with time zone not null default now(),

  constraint routine_tipo_valido check (tipo in ('estudo', 'trabalho', 'exercicio', 'saude', 'lazer', 'outro')),
  constraint routine_transporte_valido check (transporte in ('pe', 'onibus', 'carro', 'bike')),
  constraint routine_recorrencia check (
    (dias is not null and data is null and cardinality(dias) between 1 and 7
      and dias <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[])
    or (dias is null and data is not null)
  ),
  constraint routine_horario check (hora_chegada <> hora_saida),
  constraint routine_tolerancia check (tolerancia_min between 5 and 120)
);

create index if not exists routine_commitments_user_idx on public.routine_commitments (user_id);

alter table public.routine_commitments enable row level security;

-- Cria a regra só se ela ainda não existir, para o arquivo poder rodar mais de uma vez.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'routine_commitments'
      and policyname = 'user owns routine commitments'
  ) then
    create policy "user owns routine commitments"
    on public.routine_commitments
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;
end $$;
