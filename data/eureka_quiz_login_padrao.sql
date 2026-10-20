-- Quiz da Eureka 2026: login da equipe com usuário e senha padrão.
-- Roda depois do eureka_quiz.sql. Pode rodar mais de uma vez.
-- Usuário: equipe  |  Senha: Ampara@72   (para trocar, veja o fim do arquivo)

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.eureka_acesso (
  usuario text primary key,
  senha_hash text not null
);
alter table public.eureka_acesso enable row level security;
-- Sem políticas: ninguém lê esta tabela pela API, só as funções abaixo.

insert into public.eureka_acesso (usuario, senha_hash)
values ('equipe', extensions.crypt('Ampara@72', extensions.gen_salt('bf')))
on conflict (usuario) do nothing;

create or replace function public.eureka_login(p_usuario text, p_senha text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.eureka_acesso
    where usuario = lower(trim(p_usuario))
      and senha_hash = extensions.crypt(p_senha, senha_hash)
  );
$$;

create or replace function public.eureka_listar(p_usuario text, p_senha text, p_dia text)
returns table (nome text, telefone text, acertos smallint, total smallint, criado_em timestamptz)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.eureka_login(p_usuario, p_senha) then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  return query
    select p.nome, p.telefone, p.acertos, p.total, p.criado_em
    from public.eureka_participantes p
    where p.dia = p_dia
    order by p.criado_em desc;
end;
$$;

create or replace function public.eureka_apagar(p_usuario text, p_senha text, p_dia text)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare n integer;
begin
  if not public.eureka_login(p_usuario, p_senha) then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  delete from public.eureka_participantes where dia = p_dia;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.eureka_login(text, text) from public;
revoke all on function public.eureka_listar(text, text, text) from public;
revoke all on function public.eureka_apagar(text, text, text) from public;
grant execute on function public.eureka_login(text, text) to anon, authenticated;
grant execute on function public.eureka_listar(text, text, text) to anon, authenticated;
grant execute on function public.eureka_apagar(text, text, text) to anon, authenticated;

-- Para trocar a senha depois:
-- update public.eureka_acesso
--   set senha_hash = extensions.crypt('NOVA_SENHA', extensions.gen_salt('bf'))
--   where usuario = 'equipe';
