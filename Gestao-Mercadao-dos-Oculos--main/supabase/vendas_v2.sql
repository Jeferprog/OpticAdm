-- vendas_v2.sql — Fase 2: Conferido, Entrada/Saldo, Efetivada, Período
-- Execute no Supabase SQL Editor (Dashboard → SQL Editor → New query)

alter table public.vendas add column if not exists conferido              boolean     default false;
alter table public.vendas add column if not exists conferido_em           timestamptz;
alter table public.vendas add column if not exists entrada_valor          numeric(12,2);
alter table public.vendas add column if not exists entrada_forma          text;
alter table public.vendas add column if not exists saldo_valor            numeric(12,2);
alter table public.vendas add column if not exists saldo_forma            text;
alter table public.vendas add column if not exists efetivada              boolean     default true;
alter table public.vendas add column if not exists motivo_nao_efetivada  text;

-- Garante que vendas existentes sejam consideradas efetivadas
update public.vendas set efetivada = true where efetivada is null;
