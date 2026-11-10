-- ═══════════════════════════════════════════════════════════════════
--  VENDAS  ·  Campo Tarifa
--  Mercadão dos Óculos
--
--  Tarifa (R$) somada ao valor da venda ANTES de calcular as parcelas.
--  Ex.: valor final R$ 300 + tarifa R$ 20 = base R$ 320 para dividir.
--
--  Seguro/idempotente. Supabase → SQL Editor → New query → cole tudo → RUN.
-- ═══════════════════════════════════════════════════════════════════

alter table public.vendas
  add column if not exists tarifa numeric not null default 0;

-- ── Verificação ──
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'vendas' and column_name = 'tarifa';
