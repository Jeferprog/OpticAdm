-- ═══════════════════════════════════════════════════════════════════
--  VENDAS · Valor Financiado (Boleto MultiCredito)
--  Mercadão dos Óculos
--
--  Valor que é dividido nas parcelas do MultiCredito (informado na venda;
--  sugestão = Valor Final, menos a entrada quando houver).
--
--  Seguro/idempotente.
-- ═══════════════════════════════════════════════════════════════════

alter table public.vendas add column if not exists valor_financiado numeric(12,2);
