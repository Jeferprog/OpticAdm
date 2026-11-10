-- ═══════════════════════════════════════════════════════════════════
--  VENDAS  ·  Pagador e forma de pagamento estruturada
--  Mercadão dos Óculos
--
--  • pagador               → quem paga a venda (pode ser diferente do
--                            cliente comprador). Por padrão repete o
--                            nome do cliente, mas é editável.
--  • pagamento_modalidade  → à vista / entrada + cartão / entrada +
--                            boleto / entrada + crediário / crediário
--  • pagamento_entrada     → Pix ou Dinheiro (a entrada / o à vista)
--
--  Em COBRANÇAS, guardamos também o pagador do devedor — porque o
--  arquivo do banco sempre traz o nome do PAGADOR (e não do comprador).
--
--  Seguro/idempotente. Supabase → SQL Editor → New query → cole tudo → RUN.
-- ═══════════════════════════════════════════════════════════════════

alter table public.vendas
  add column if not exists pagador text;

alter table public.vendas
  add column if not exists pagamento_modalidade text;

alter table public.vendas
  add column if not exists pagamento_entrada text;

alter table public.cobrancas_devedores
  add column if not exists pagador text;

-- ── Verificação ──
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and ( (table_name = 'vendas' and column_name in ('pagador','pagamento_modalidade','pagamento_entrada'))
     or (table_name = 'cobrancas_devedores' and column_name = 'pagador') )
order by table_name, column_name;
