-- Camada 1 do score (contexto), gerada por data-processing/build_context_risk_map.py a
-- partir dos dados públicos da SSP:
--   context_risk_map         município × bairro × período (como na orientação do TCC)
--   context_risk_map_cidade  reserva município × período, para bairro sem célula
-- Só agregados (mínimo de 5 registros por célula, DDM suprimido abaixo de 5): nenhuma
-- coordenada, endereço ou identificador. Por isso a leitura é liberada a qualquer sessão
-- do app; a escrita fica só com o importador (conexão direta).
--
-- Idempotente. Os dados entram por data-processing/importar_context_risk_map.py.

-- A primeira versão separava também o dia da semana. Se a tabela ainda tiver essa
-- estrutura, é recriada: o conteúdo é todo reimportado pelo importador.
do $migracao$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'context_risk_map' and column_name = 'dia_semana'
  ) then
    drop table public.context_risk_map;
  end if;
end
$migracao$;

create table if not exists public.context_risk_map (
  municipio text not null,
  bairro text not null,
  periodo text not null check (periodo in ('madrugada', 'manha', 'tarde', 'noite')),
  registros_com_peso integer not null check (registros_com_peso >= 5),
  -- Quantos tinham o período no rótulo da SSP e quantos o tiveram derivado da hora exata.
  registros_periodo_informado integer not null,
  registros_periodo_derivado integer not null,
  -- Texto porque contagens abaixo de 5 são publicadas como "<5 (suprimido)".
  registros_ddm text not null,
  total_ponderado integer not null,
  escore_contexto double precision not null check (escore_contexto between 0 and 1),
  nivel_contexto text not null check (nivel_contexto in ('baixo', 'medio', 'alto')),
  percentil_33 double precision not null,
  percentil_66 double precision not null,
  importado_em timestamptz not null default now(),
  primary key (municipio, periodo, bairro),
  check (registros_periodo_informado + registros_periodo_derivado = registros_com_peso)
);

create table if not exists public.context_risk_map_cidade (
  municipio text not null,
  periodo text not null check (periodo in ('madrugada', 'manha', 'tarde', 'noite')),
  registros_com_peso integer not null check (registros_com_peso >= 5),
  registros_periodo_informado integer not null,
  registros_periodo_derivado integer not null,
  registros_ddm text not null,
  total_ponderado integer not null,
  bairros_com_registro integer not null check (bairros_com_registro > 0),
  -- Total da cidade ÷ bairros com registro: o "bairro típico", na régua do mapa de bairros.
  total_medio_por_bairro double precision not null,
  escore_contexto double precision not null check (escore_contexto between 0 and 1),
  nivel_contexto text not null check (nivel_contexto in ('baixo', 'medio', 'alto')),
  percentil_33 double precision not null,
  percentil_66 double precision not null,
  importado_em timestamptz not null default now(),
  primary key (municipio, periodo),
  check (registros_periodo_informado + registros_periodo_derivado = registros_com_peso)
);

comment on table public.context_risk_map is
  'Camada 1 (contexto) do score do Ampara: agregados SSP por município, bairro e período. Célula ausente = usar a reserva da cidade.';
comment on table public.context_risk_map_cidade is
  'Reserva da Camada 1: bairro típico do município por período, na escala de context_risk_map. Mostrada no app como estimativa da cidade.';

alter table public.context_risk_map enable row level security;
alter table public.context_risk_map_cidade enable row level security;

drop policy if exists "context_risk_map leitura" on public.context_risk_map;
create policy "context_risk_map leitura"
  on public.context_risk_map for select to anon, authenticated using (true);

drop policy if exists "context_risk_map_cidade leitura" on public.context_risk_map_cidade;
create policy "context_risk_map_cidade leitura"
  on public.context_risk_map_cidade for select to anon, authenticated using (true);

grant select on public.context_risk_map, public.context_risk_map_cidade to anon, authenticated;
