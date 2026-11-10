-- ═══════════════════════════════════════════════════════════════════
--  COBRANÇAS — Execute no SQL Editor do Supabase
--  (Database → SQL Editor → New Query → cole e clique em Run)
-- ═══════════════════════════════════════════════════════════════════

-- 1. Tabela de devedores
create table if not exists public.cobrancas_devedores (
  id                 uuid    default gen_random_uuid() primary key,
  nome_pagador       text    not null,
  nome_normalizado   text    not null,
  status_cobranca    text    default 'Novo',  -- Novo | Em andamento | Negociado | Protestado | Quitado
  primeiro_registro  date,
  ultima_atualizacao date,
  pequenas_causas    boolean default false,
  data_audiencia     date,
  situacao_audiencia text,
  observacoes        text,
  created_at         timestamptz default now(),
  constraint cobrancas_devedores_nome_normalizado_key unique (nome_normalizado)
);

-- 2. Tabela de boletos
create table if not exists public.cobrancas_boletos (
  id               uuid    default gen_random_uuid() primary key,
  devedor_id       uuid    references public.cobrancas_devedores(id) on delete cascade,
  carteira         text,
  numero_doc       text,
  nosso_numero     text,
  txid             text,
  data_vencimento  date,
  data_liquidacao  date,
  valor            numeric(12,2),
  valor_liquidacao numeric(12,2),
  situacao_boleto  text,
  motivo           text,
  created_at       timestamptz default now(),
  constraint cobrancas_boletos_nosso_numero_key unique (nosso_numero)
);

-- 3. Índices
create index if not exists idx_cobrancas_devedores_normalizado
  on public.cobrancas_devedores (nome_normalizado);
create index if not exists idx_cobrancas_boletos_devedor
  on public.cobrancas_boletos (devedor_id);
create index if not exists idx_cobrancas_boletos_nosso
  on public.cobrancas_boletos (nosso_numero);
create index if not exists idx_cobrancas_boletos_vencimento
  on public.cobrancas_boletos (data_vencimento);

-- 4. RLS — habilitar
alter table public.cobrancas_devedores enable row level security;
alter table public.cobrancas_boletos    enable row level security;

-- ── cobrancas_devedores ──────────────────────────────────────────
drop policy if exists "cobrancas_devedores_select" on public.cobrancas_devedores;
create policy "cobrancas_devedores_select" on public.cobrancas_devedores
  for select to authenticated using (true);

drop policy if exists "cobrancas_devedores_insert" on public.cobrancas_devedores;
create policy "cobrancas_devedores_insert" on public.cobrancas_devedores
  for insert to authenticated with check (public.is_admin());

drop policy if exists "cobrancas_devedores_update" on public.cobrancas_devedores;
create policy "cobrancas_devedores_update" on public.cobrancas_devedores
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "cobrancas_devedores_delete" on public.cobrancas_devedores;
create policy "cobrancas_devedores_delete" on public.cobrancas_devedores
  for delete to authenticated using (public.is_admin());

-- ── cobrancas_boletos ────────────────────────────────────────────
drop policy if exists "cobrancas_boletos_select" on public.cobrancas_boletos;
create policy "cobrancas_boletos_select" on public.cobrancas_boletos
  for select to authenticated using (true);

drop policy if exists "cobrancas_boletos_insert" on public.cobrancas_boletos;
create policy "cobrancas_boletos_insert" on public.cobrancas_boletos
  for insert to authenticated with check (public.is_admin());

drop policy if exists "cobrancas_boletos_update" on public.cobrancas_boletos;
create policy "cobrancas_boletos_update" on public.cobrancas_boletos
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "cobrancas_boletos_delete" on public.cobrancas_boletos;
create policy "cobrancas_boletos_delete" on public.cobrancas_boletos
  for delete to authenticated using (public.is_admin());
