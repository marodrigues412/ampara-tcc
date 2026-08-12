-- criação das tabelas no supabase

-- =========================
-- 🔧 EXTENSÃO (UUID)
-- =========================
create extension if not exists "pgcrypto";

-- =========================
-- perfil da usuaria
-- =========================
create table user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  telefone text,
  data_nascimento date,
  created_at timestamp default now()
);

-- =========================
-- ctts de emergencia
-- =========================
create table emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  nome text not null,
  telefone text not null,
  prioridade int not null check (prioridade between 1 and 3),
  created_at timestamp default now()
);

-- =========================
-- locais seguros
-- =========================
create table safe_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  nome text not null,
  endereco text,
  latitude float,
  longitude float,
  tipo text,
  created_at timestamp default now()
);

-- ==============================
-- contexto /atividade / academia
-- ==============================
create table user_activity_status (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  tipo text,
  ativo boolean,
  started_at timestamp,
  ended_at timestamp
);

-- ==================
-- ocorrencias
-- ==================
create table occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  latitude float,
  longitude float,
  descricao text,
  risk_score float,
  status text check (status in ('normal', 'moderado', 'critico')),
  confirmado boolean,
  created_at timestamp default now()
);

-- ==============================
-- historico localizacoes usuaria
-- ==============================
create table location_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  latitude float,
  longitude float,
  speed float,
  source text,
  created_at timestamp default now()
);

-- =========================
-- segurança
-- =========================

-- USER PROFILES
alter table user_profiles enable row level security;

create policy "user owns profile"
on user_profiles
for all
using (auth.uid() = id)
with check (auth.uid() = id);

-- EMERGENCY CONTACTS
alter table emergency_contacts enable row level security;

create policy "user owns contacts"
on emergency_contacts
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- SAFE LOCATIONS
alter table safe_locations enable row level security;

create policy "user owns safe locations"
on safe_locations
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- ACTIVITY STATUS
alter table user_activity_status enable row level security;

create policy "user owns activity"
on user_activity_status
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- OCCURRENCES
alter table occurrences enable row level security;

create policy "user owns occurrences"
on occurrences
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- LOCATION HISTORY
alter table location_history enable row level security;

create policy "user owns location history"
on location_history
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);



-- alter tables pós criação    

alter table emergency_contacts drop column prioridade;

alter table emergency_contacts
add column relacao text;

-- pontuação de segurança (0-100, mesma escala do calculateSecurityScore)
-- no momento em que o ponto de localização foi gravado, para alimentar os dashboards
alter table location_history
add column risk_score float;

-- log de alertas enviados (SOS automático ou manual) — tabela já existia em produção
-- via dashboard do Supabase, adicionada aqui para ficar versionada
create table if not exists alert_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  message text,
  recipient_names text,
  created_at timestamp default now()
);

alter table alert_logs enable row level security;

create policy "user owns alert logs"
on alert_logs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

