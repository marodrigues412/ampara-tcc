-- Tabela principal usada pelo app para crimes próximos.
create table if not exists public.crime_occurrences (
  id bigint generated always as identity not null,
  data_ocorrencia date null,
  hora_ocorrencia time without time zone null,
  periodo text null,
  tipo_local text null,
  subtipo_local text null,
  departamento text null,
  seccional text null,
  delegacia text null,
  cidade text null,
  bairro text null,
  logradouro text null,
  numero_logradouro text null,
  latitude double precision null,
  longitude double precision null,
  rubrica text null,
  conduta text null,
  natureza_apurada text null,
  ano_bo integer null,
  mes_estatistica integer null,
  ano_estatistica integer null,
  created_at timestamp without time zone null default now(),
  constraint crime_occurrences_pkey primary key (id)
);

-- Controle de carga incremental da SSP.
create table if not exists public.ssp_imported_months (
  id bigint generated always as identity primary key,
  base text not null,
  ano_estatistica integer not null,
  mes_estatistica integer not null,
  source_file text not null,
  row_count integer not null,
  imported_at timestamp without time zone not null default now(),
  unique (base, ano_estatistica, mes_estatistica)
);

create index if not exists crime_occurrences_year_month_idx
on public.crime_occurrences (ano_estatistica, mes_estatistica);

create index if not exists crime_occurrences_lat_lon_idx
on public.crime_occurrences (latitude, longitude);
