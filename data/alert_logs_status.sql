-- Registro de entrega dos alertas.
--
-- Até aqui alert_logs só guardava que o app TENTOU avisar os contatos, nunca se a AWS
-- confirmou o envio — e o Dashboard contava tudo como "alerta enviado".
--
--   pendente -> gravado antes de chamar a AWS (se o app cair no meio, fica assim)
--   enviado  -> a Lambda confirmou o envio
--   falhou   -> sem contatos, erro de rede ou a Lambda recusou; o motivo vai em detalhe
--   legado   -> registros anteriores a esta migração, sem como saber o que aconteceu

alter table public.alert_logs
  add column if not exists status text,
  add column if not exists detalhe text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists nivel_risco text;

update public.alert_logs set status = 'legado' where status is null;

alter table public.alert_logs
  alter column status set default 'pendente',
  alter column status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'alert_logs_status_check'
  ) then
    alter table public.alert_logs
      add constraint alert_logs_status_check
      check (status in ('pendente', 'enviado', 'falhou', 'legado'));
  end if;
end $$;

create index if not exists alert_logs_user_created_idx
  on public.alert_logs (user_id, created_at desc);

-- O app grava o log como "pendente" e depois atualiza o status com a resposta da AWS,
-- então a usuária precisa de permissão de UPDATE nos próprios registros. A policy
-- "user owns alert logs" de criacaoTabelas.sql é "for all" e já cobre isso; esta
-- consulta só serve para conferir depois de rodar:
--
-- select policyname, cmd, qual, with_check
-- from pg_policies where tablename = 'alert_logs';
