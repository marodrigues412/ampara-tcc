-- Score de 3 camadas (contexto × corpo → matriz 3×3) em risk_assessments.
-- Depois de data/score_bpm.sql. Idempotente.
--
-- Muda duas coisas na tabela:
-- 1. bpm e context_score passam a aceitar nulo: nos cenários sem relógio (iPhone e
--    Android sem Galaxy Watch) a avaliação é só com o celular, e o context_score antigo
--    (pontos 0–10) deixa de ser o contexto oficial.
-- 2. Colunas para reportar cada camada e o modo de sensores separadamente no artigo.
alter table public.risk_assessments
  alter column bpm drop not null,
  alter column context_score drop not null,
  add column if not exists sensor_mode text,
  add column if not exists body_score numeric(4, 3),
  add column if not exists body_band text,
  add column if not exists bpm_anomaly numeric(4, 3),
  add column if not exists watch_motion_anomaly numeric(3, 2),
  add column if not exists context_band text,
  add column if not exists context_cell_score double precision,
  add column if not exists context_unavailable_reason text;

do $constraints$
begin
  if not exists (select 1 from pg_constraint where conname = 'risk_assessments_sensor_mode_check') then
    alter table public.risk_assessments
      add constraint risk_assessments_sensor_mode_check
      check (sensor_mode in ('completo', 'so_celular', 'parcial', 'so_relogio'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'risk_assessments_body_band_check') then
    alter table public.risk_assessments
      add constraint risk_assessments_body_band_check
      check (body_band in ('baixo', 'medio', 'alto'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'risk_assessments_context_band_check') then
    alter table public.risk_assessments
      add constraint risk_assessments_context_band_check
      check (context_band in ('baixo', 'medio', 'alto'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'risk_assessments_body_score_check') then
    alter table public.risk_assessments
      add constraint risk_assessments_body_score_check
      check (body_score between 0 and 1);
  end if;
end
$constraints$;

comment on column public.risk_assessments.sensor_mode is
  'Sinais do corpo disponíveis na leitura: completo (BPM + relógio + celular), so_celular, parcial ou so_relogio.';
comment on column public.risk_assessments.experimental_risk_level is
  'Resultado da matriz 3×3 (baixo/moderado/alto); nulo quando alguma camada estava indisponível.';
