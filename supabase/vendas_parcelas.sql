-- ═══════════════════════════════════════════════════════════════════
--  VENDAS  ·  Parcelamento
--  Mercadão dos Óculos
--
--  O QUE FAZ
--  ---------
--  Adiciona à venda o número de parcelas e o plano de parcelas (cada
--  parcela com data e valor), guardado em um único campo.
--
--  É SEGURO?  Sim — só adiciona colunas. Não apaga nada. Idempotente.
--  COMO EXECUTAR:  Supabase → SQL Editor → New query → cole tudo → RUN.
-- ═══════════════════════════════════════════════════════════════════

alter table public.vendas
  add column if not exists num_parcelas integer default 1,
  add column if not exists parcelas     jsonb;

-- Verificação
select column_name, data_type
from information_schema.columns
where table_schema='public' and table_name='vendas'
  and column_name in ('num_parcelas','parcelas');
