-- Quiz da Eureka 2026: participantes do sorteio e acesso da equipe.
-- Rodar uma vez no SQL Editor do Supabase.
--
-- Regras:
-- - Qualquer visitante (anon) só consegue INSERIR a própria participação. Não lê nada.
-- - Só quem está em public.eureka_equipe, logada, consegue ver, sortear e apagar.
-- - Telefone repetido no mesmo dia não entra duas vezes.

create table if not exists public.eureka_equipe (
  email text primary key
);

-- Troque/complete com os e-mails das contas que vão entrar na área da equipe.
-- Essas contas precisam existir em Authentication > Users (podem ser as mesmas do app).
insert into public.eureka_equipe (email) values
  ('maduda.rodrigues@gmail.com')
  -- , ('email-da-amanda@exemplo.com')
on conflict do nothing;

create table if not exists public.eureka_participantes (
  id uuid primary key default gen_random_uuid(),
  dia text not null check (dia in ('sexta', 'sabado')),
  nome text not null check (char_length(nome) between 2 and 80),
  telefone text not null check (telefone ~ '^[0-9]{10,11}$'),
  acertos smallint not null check (acertos between 0 and 20),
  total smallint not null check (total between 1 and 20),
  consentimento boolean not null check (consentimento),
  criado_em timestamptz not null default now(),
  unique (dia, telefone)
);

alter table public.eureka_equipe enable row level security;
alter table public.eureka_participantes enable row level security;

-- Função usada nas políticas: a pessoa logada é da equipe?
create or replace function public.eh_equipe_eureka()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.eureka_equipe
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.eh_equipe_eureka() from public;
grant execute on function public.eh_equipe_eureka() to anon, authenticated;

-- Equipe: só a própria equipe enxerga a lista de e-mails.
drop policy if exists "equipe le equipe" on public.eureka_equipe;
create policy "equipe le equipe" on public.eureka_equipe
  for select to authenticated using (public.eh_equipe_eureka());

-- Participantes: qualquer um insere; só a equipe lê e apaga.
drop policy if exists "visitante participa" on public.eureka_participantes;
create policy "visitante participa" on public.eureka_participantes
  for insert to anon, authenticated with check (true);

drop policy if exists "equipe le participantes" on public.eureka_participantes;
create policy "equipe le participantes" on public.eureka_participantes
  for select to authenticated using (public.eh_equipe_eureka());

drop policy if exists "equipe apaga participantes" on public.eureka_participantes;
create policy "equipe apaga participantes" on public.eureka_participantes
  for delete to authenticated using (public.eh_equipe_eureka());

grant insert on public.eureka_participantes to anon, authenticated;
grant select, delete on public.eureka_participantes to authenticated;
grant select on public.eureka_equipe to authenticated;
