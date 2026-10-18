-- Camada 1 do score (contexto): mapa município × bairro × dia da semana × período,
-- gerado por data-processing/build_context_risk_map.py a partir dos dados públicos da SSP.
-- Só agregados (mínimo de 5 registros por célula, DDM suprimido abaixo de 5): nenhuma
-- coordenada, endereço ou identificador. Por isso a leitura é liberada a qualquer sessão
-- do app; a escrita fica só com o importador (service role / conexão direta).
--
-- Script idempotente. Os dados entram por data-processing/importar_context_risk_map.py.
create table if not exists public.context_risk_map (
  municipio text not null,
  bairro text not null,
  dia_semana text not null check (dia_semana in ('segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo')),
  periodo text not null check (periodo in ('madrugada', 'manha', 'tarde', 'noite')),
  registros_com_peso integer not null check (registros_com_peso >= 5),
  -- Texto porque contagens abaixo de 5 são publicadas como "<5 (suprimido)".
  registros_ddm text not null,
  total_ponderado integer not null,
  escore_contexto double precision not null check (escore_contexto between 0 and 1),
  nivel_contexto text not null check (nivel_contexto in ('baixo', 'medio', 'alto')),
  percentil_33 double precision not null,
  percentil_66 double precision not null,
  importado_em timestamptz not null default now(),
  primary key (municipio, dia_semana, periodo, bairro)
);

comment on table public.context_risk_map is
  'Camada 1 (contexto) do score do Ampara: agregados SSP por município, bairro, dia da semana e período. Célula ausente = contexto indisponível, nunca baixo.';

alter table public.context_risk_map enable row level security;

drop policy if exists "context_risk_map leitura" on public.context_risk_map;
create policy "context_risk_map leitura"
  on public.context_risk_map
  for select
  to anon, authenticated
  using (true);

grant select on public.context_risk_map to anon, authenticated;
