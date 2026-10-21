-- Eureka 2026 · experiência no óculos (VR) com quiz.
-- Rodar no SQL Editor do Supabase DEPOIS de eureka_quiz.sql e eureka_quiz_login_padrao.sql.
-- Pode rodar mais de uma vez.
--
-- Como funciona:
-- 1. A equipe, logada com o usuário padrão, cadastra quem vai usar o óculos (nome, telefone, aceite).
-- 2. O óculos pega a próxima pessoa da fila, roda a experiência e o quiz.
-- 3. No fim, a pontuação fica na sessão e a pessoa entra na lista do sorteio do dia (eureka_participantes).
-- O óculos (visitante anônimo) só consegue ver o PRIMEIRO NOME da próxima pessoa e atualizar a sessão em andamento.

create table if not exists public.eureka_vr_sessao (
  id uuid primary key default gen_random_uuid(),
  dia text not null check (dia in ('sexta', 'sabado')),
  nome text not null check (char_length(nome) between 2 and 80),
  telefone text not null check (telefone ~ '^[0-9]{10,11}$'),
  consentimento boolean not null default false,
  status text not null default 'aguardando' check (status in ('aguardando', 'jogando', 'concluido', 'cancelado')),
  pergunta smallint not null default 0,
  acertos smallint,
  total smallint,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.eureka_vr_sessao enable row level security;
-- Sem políticas: só as funções abaixo mexem nesta tabela.

-- ---------- equipe (usuário e senha padrão) ----------
create or replace function public.eureka_vr_liberar(p_usuario text, p_senha text, p_dia text, p_nome text, p_telefone text, p_consentimento boolean)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  if not public.eureka_login(p_usuario, p_senha) then raise exception 'acesso negado' using errcode = '42501'; end if;
  update public.eureka_vr_sessao set status = 'cancelado', atualizado_em = now() where status = 'aguardando';
  insert into public.eureka_vr_sessao (dia, nome, telefone, consentimento)
    values (p_dia, trim(p_nome), regexp_replace(p_telefone, '\D', '', 'g'), coalesce(p_consentimento, false))
    returning id into v_id;
  return v_id;
end; $$;

create or replace function public.eureka_vr_status(p_usuario text, p_senha text)
returns table (id uuid, dia text, nome text, telefone text, status text, pergunta smallint, acertos smallint, total smallint, criado_em timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not public.eureka_login(p_usuario, p_senha) then raise exception 'acesso negado' using errcode = '42501'; end if;
  return query select s.id, s.dia, s.nome, s.telefone, s.status, s.pergunta, s.acertos, s.total, s.criado_em
    from public.eureka_vr_sessao s where s.criado_em > now() - interval '14 hours' order by s.criado_em desc limit 40;
end; $$;

create or replace function public.eureka_vr_cancelar(p_usuario text, p_senha text, p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.eureka_login(p_usuario, p_senha) then raise exception 'acesso negado' using errcode = '42501'; end if;
  update public.eureka_vr_sessao set status = 'cancelado', atualizado_em = now() where id = p_id and status in ('aguardando', 'jogando');
end; $$;

-- ---------- óculos (anônimo) ----------
drop function if exists public.eureka_vr_proxima();
create or replace function public.eureka_vr_proxima()
returns table (id uuid, primeiro_nome text, consentimento boolean)
language sql stable security definer set search_path = public as $$
  select s.id, split_part(s.nome, ' ', 1), s.consentimento
  from public.eureka_vr_sessao s
  where s.status = 'aguardando' and s.criado_em > now() - interval '30 minutes'
  order by s.criado_em desc limit 1;
$$;

create or replace function public.eureka_vr_comecar(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.eureka_vr_sessao set status = 'jogando', pergunta = 0, atualizado_em = now() where id = p_id and status = 'aguardando';
  get diagnostics n = row_count; return n = 1;
end; $$;

create or replace function public.eureka_vr_progresso(p_id uuid, p_pergunta int, p_acertos int)
returns void language sql security definer set search_path = public as $$
  update public.eureka_vr_sessao set pergunta = least(greatest(p_pergunta, 0), 20), acertos = least(greatest(p_acertos, 0), 20), atualizado_em = now()
  where id = p_id and status = 'jogando';
$$;

create or replace function public.eureka_vr_concluir(p_id uuid, p_acertos int, p_total int)
returns boolean language plpgsql security definer set search_path = public as $$
declare s public.eureka_vr_sessao;
begin
  update public.eureka_vr_sessao set status = 'concluido', acertos = least(greatest(p_acertos, 0), 20), total = least(greatest(p_total, 1), 20), atualizado_em = now()
    where id = p_id and status = 'jogando' returning * into s;
  if s.id is null then return false; end if;
  if s.consentimento then
    insert into public.eureka_participantes (dia, nome, telefone, acertos, total, consentimento)
      values (s.dia, s.nome, s.telefone, s.acertos, s.total, true)
      on conflict (dia, telefone) do nothing;
  end if;
  return true;
end; $$;

revoke all on function public.eureka_vr_liberar(text, text, text, text, text, boolean) from public;
revoke all on function public.eureka_vr_status(text, text) from public;
revoke all on function public.eureka_vr_cancelar(text, text, uuid) from public;
revoke all on function public.eureka_vr_proxima() from public;
revoke all on function public.eureka_vr_comecar(uuid) from public;
revoke all on function public.eureka_vr_progresso(uuid, int, int) from public;
revoke all on function public.eureka_vr_concluir(uuid, int, int) from public;
grant execute on function public.eureka_vr_liberar(text, text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.eureka_vr_status(text, text) to anon, authenticated;
grant execute on function public.eureka_vr_cancelar(text, text, uuid) to anon, authenticated;
grant execute on function public.eureka_vr_proxima() to anon, authenticated;
grant execute on function public.eureka_vr_comecar(uuid) to anon, authenticated;
grant execute on function public.eureka_vr_progresso(uuid, int, int) to anon, authenticated;
grant execute on function public.eureka_vr_concluir(uuid, int, int) to anon, authenticated;
