-- ═══════════════════════════════════════════════════════════════════
--  VENDAS · Especialista do exame de vista (campo opcional)
--  Mercadão dos Óculos
--
--  Cria a coluna "especialista" na tabela de vendas. A lista de nomes
--  fica em Configurações (não precisa de tabela nova).
--
--  Seguro/idempotente. Supabase → SQL Editor → New query → cole tudo → RUN.
-- ═══════════════════════════════════════════════════════════════════

alter table public.vendas add column if not exists especialista text;

create index if not exists idx_vendas_especialista
  on public.vendas (especialista) where especialista is not null;

-- ── Verificação (deve mostrar 1 linha) ──
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'vendas' and column_name = 'especialista';
