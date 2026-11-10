-- ═══════════════════════════════════════════════════════════════════
--  VENDAS PARCELADAS  →  COBRANÇAS  (controle de parcelas em aberto)
--  Mercadão dos Óculos
--
--  Quando uma venda parcelada é registrada, o sistema cria na aba
--  Cobranças um boleto para cada parcela (entrada + demais), ligado à
--  venda. Estas duas colunas fazem essa ligação:
--
--    • venda_id     → de qual venda o boleto veio
--    • parcela_num  → número da parcela (1 = entrada, 2, 3, ...)
--
--  O "on delete cascade" faz com que, ao excluir uma venda, os boletos
--  gerados por ela sejam removidos automaticamente da aba Cobranças.
--  Boletos importados do banco (sem venda_id) NÃO são afetados.
--
--  Seguro/idempotente. Supabase → SQL Editor → New query → cole tudo → RUN.
-- ═══════════════════════════════════════════════════════════════════

alter table public.cobrancas_boletos
  add column if not exists venda_id uuid references public.vendas(id) on delete cascade;

alter table public.cobrancas_boletos
  add column if not exists parcela_num int;

create index if not exists idx_cobrancas_boletos_venda
  on public.cobrancas_boletos(venda_id);

-- ── Verificação ──
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'cobrancas_boletos'
  and column_name in ('venda_id', 'parcela_num')
order by column_name;
