-- Historico privado de leituras e avaliacao experimental BPM + movimento + contexto.
-- Script idempotente: pode ser executado novamente para atualizar a estrutura e o relatorio.
create table if not exists public.risk_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_at timestamptz not null,
  bpm numeric(5, 2) not null check (bpm between 25 and 240),
  baseline_mean_bpm numeric(5, 2),
  baseline_stddev_bpm numeric(5, 2),
  bpm_z_score numeric(7, 3),
  context_score smallint not null check (context_score between 0 and 10),
  experimental_score numeric(3, 1) check (experimental_score between 0 and 10),
  experimental_risk_level text check (experimental_risk_level in ('baixo', 'moderado', 'alto')),
  hour_of_day smallint check (hour_of_day between 0 and 23),
  time_zone text,
  nearby_crime_count integer,
  crime_density_per_km2 numeric(12, 3),
  inside_safe_zone boolean,
  activity_mode boolean,
  motion_risk_score numeric(4, 1),
  motion_anomaly_score numeric(5, 4) check (motion_anomaly_score between 0 and 1),
  phone_motion_risk_points smallint,
  watch_motion_risk_points smallint,
  phone_mean_magnitude_g numeric(9, 5),
  phone_magnitude_stddev_g numeric(9, 5),
  phone_peak_magnitude_g numeric(9, 5),
  phone_jerk_g_per_second numeric(10, 5),
  phone_motion_sample_count integer,
  gps_speed_mps numeric(9, 4),
  gps_speed_delta_mps numeric(9, 4),
  watch_motion_rms_mps2 numeric(9, 4),
  watch_motion_peak_mps2 numeric(9, 4),
  watch_motion_jerk_mps3 numeric(10, 4),
  model_version text not null,
  source text not null default 'Galaxy Watch',
  created_at timestamptz not null default now(),
  constraint risk_assessments_user_measured_unique unique (user_id, measured_at)
);

alter table public.risk_assessments
  alter column experimental_score type numeric(3, 1) using experimental_score::numeric,
  add column if not exists hour_of_day smallint,
  add column if not exists time_zone text,
  add column if not exists nearby_crime_count integer,
  add column if not exists crime_density_per_km2 numeric(12, 3),
  add column if not exists inside_safe_zone boolean,
  add column if not exists activity_mode boolean,
  add column if not exists experimental_risk_level text,
  add column if not exists motion_risk_score numeric(4, 1),
  add column if not exists motion_anomaly_score numeric(5, 4),
  add column if not exists phone_motion_risk_points smallint,
  add column if not exists watch_motion_risk_points smallint,
  add column if not exists phone_mean_magnitude_g numeric(9, 5),
  add column if not exists phone_magnitude_stddev_g numeric(9, 5),
  add column if not exists phone_peak_magnitude_g numeric(9, 5),
  add column if not exists phone_jerk_g_per_second numeric(10, 5),
  add column if not exists phone_motion_sample_count integer,
  add column if not exists gps_speed_mps numeric(9, 4),
  add column if not exists gps_speed_delta_mps numeric(9, 4),
  add column if not exists watch_motion_rms_mps2 numeric(9, 4),
  add column if not exists watch_motion_peak_mps2 numeric(9, 4),
  add column if not exists watch_motion_jerk_mps3 numeric(10, 4);

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'risk_assessments_experimental_risk_level_check'
  ) then
    alter table public.risk_assessments
      add constraint risk_assessments_experimental_risk_level_check
      check (experimental_risk_level in ('baixo', 'moderado', 'alto'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'risk_assessments_motion_anomaly_score_check'
  ) then
    alter table public.risk_assessments
      add constraint risk_assessments_motion_anomaly_score_check
      check (motion_anomaly_score between 0 and 1);
  end if;
end
$constraints$;

create index if not exists risk_assessments_user_measured_idx
  on public.risk_assessments (user_id, measured_at desc);

alter table public.risk_assessments enable row level security;

drop policy if exists "user owns risk assessments" on public.risk_assessments;
create policy "user owns risk assessments"
  on public.risk_assessments
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.risk_assessments to authenticated;

drop function if exists public.risk_assessment_daily_report(timestamptz);
create function public.risk_assessment_daily_report(p_from timestamptz)
returns table (
  day date,
  sample_count bigint,
  average_bpm numeric,
  scored_count bigint,
  average_experimental_score numeric,
  average_context_score numeric,
  motion_sample_count bigint,
  average_motion_risk_score numeric,
  average_crime_density_per_km2 numeric,
  low_risk_count bigint,
  moderate_risk_count bigint,
  high_risk_count bigint
)
language sql
stable
security invoker
set search_path = public
as $function$
  select
    date_trunc('day', measured_at)::date as day,
    count(*) as sample_count,
    round(avg(bpm), 1) as average_bpm,
    count(experimental_score) as scored_count,
    round(avg(experimental_score), 1) as average_experimental_score,
    round(avg(context_score), 1) as average_context_score,
    count(motion_risk_score) as motion_sample_count,
    round(avg(motion_risk_score), 1) as average_motion_risk_score,
    round(avg(crime_density_per_km2), 1) as average_crime_density_per_km2,
    count(*) filter (where experimental_risk_level = 'baixo') as low_risk_count,
    count(*) filter (where experimental_risk_level = 'moderado') as moderate_risk_count,
    count(*) filter (where experimental_risk_level = 'alto') as high_risk_count
  from public.risk_assessments
  where user_id = auth.uid()
    and measured_at >= p_from
  group by 1
  order by 1;
$function$;

revoke all on function public.risk_assessment_daily_report(timestamptz) from public, anon;
grant execute on function public.risk_assessment_daily_report(timestamptz) to authenticated;
