-- Relatório por nível do score de 3 camadas, para o Dashboard.
-- Depois de data/score_bpm.sql e data/score_3_camadas.sql. Idempotente.
--
-- Conta as avaliações da usuária logada por dia × hora (fuso informado) × nível ×
-- modo de sensores. Cada avaliação vale ~30 s de monitoramento (o app grava uma a cada
-- 30 s), então o app converte contagem em tempo e em % do tempo.
--
-- - Só as avaliações do score de 3 camadas (model_version 'contexto-ssp+corpo-3camadas…'):
--   as 397 da fusão antiga ficam de fora.
-- - nivel 'sem_nivel' = leitura sem nível (calculando ou sem dados da região).
-- - security invoker + auth.uid(): cada usuária só vê as próprias linhas (a RLS de
--   risk_assessments vale também aqui). Nada de coordenada, bairro ou nota de célula.
drop function if exists public.risk_level_report(timestamptz, timestamptz, text);
create function public.risk_level_report(
  p_from timestamptz,
  p_to timestamptz default now(),
  p_tz text default 'America/Sao_Paulo'
)
returns table (
  dia date,
  hora smallint,
  nivel text,
  modo_sensores text,
  avaliacoes bigint
)
language sql
stable
security invoker
set search_path = public
as $function$
  select
    (measured_at at time zone p_tz)::date as dia,
    extract(hour from measured_at at time zone p_tz)::smallint as hora,
    coalesce(experimental_risk_level, 'sem_nivel') as nivel,
    coalesce(sensor_mode, 'desconhecido') as modo_sensores,
    count(*) as avaliacoes
  from public.risk_assessments
  where user_id = auth.uid()
    and measured_at >= p_from
    and measured_at < p_to
    and model_version like 'contexto-ssp+corpo-3camadas%'
  group by 1, 2, 3, 4
  order by 1, 2, 3, 4;
$function$;

revoke all on function public.risk_level_report(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.risk_level_report(timestamptz, timestamptz, text) to authenticated;

comment on function public.risk_level_report(timestamptz, timestamptz, text) is
  'Dashboard: avaliações do score de 3 camadas da usuária por dia × hora × nível × modo de sensores. Cada avaliação ≈ 30 s.';
