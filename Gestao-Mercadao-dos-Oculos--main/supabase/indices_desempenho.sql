-- ═══════════════════════════════════════════════════════════════════
--  ESCALABILIDADE  ·  Índices de desempenho
--  Mercadão dos Óculos
--
--  O QUE FAZ
--  ---------
--  Cria índices nas colunas mais usadas em filtros e ordenações. Isso
--  mantém as telas rápidas à medida que o volume de vendas, despesas e
--  boletos cresce. Ficou ainda mais importante depois do RLS, porque
--  agora quase toda consulta filtra por filial_id.
--
--  É SEGURO?
--  ---------
--  • NÃO altera nem apaga dados. Só cria índices.
--  • Idempotente (create index if not exists) — pode rodar de novo.
--  • O ganho aparece conforme a base cresce; em tabelas pequenas o
--    banco pode até ignorar alguns índices, o que é normal.
--
--  COMO EXECUTAR
--  ------------
--  Supabase → SQL Editor → New query → cole tudo → RUN.
-- ═══════════════════════════════════════════════════════════════════


-- ── VENDAS ──
-- Dashboard/relatórios por filial e período; e por vendedor e período.
create index if not exists idx_vendas_filial_data
  on public.vendas (filial_id, data_venda);
create index if not exists idx_vendas_vendedor_data
  on public.vendas (vendedor_id, data_venda);


-- ── DESPESAS ──
-- "Em aberto" por filial; e vencidas/próximas por data.
create index if not exists idx_despesas_filial_pago
  on public.despesas (filial_id, pago);
create index if not exists idx_despesas_pago_vencimento
  on public.despesas (pago, data_vencimento);


-- ── COBRANÇAS: DEVEDORES ──
create index if not exists idx_devedores_filial
  on public.cobrancas_devedores (filial_id);
create index if not exists idx_devedores_ultima_atualizacao
  on public.cobrancas_devedores (ultima_atualizacao desc);
create index if not exists idx_devedores_audiencia
  on public.cobrancas_devedores (data_audiencia);


-- ── COBRANÇAS: BOLETOS ──
create index if not exists idx_boletos_filial
  on public.cobrancas_boletos (filial_id);
-- Índice parcial: acelera os cartões de inadimplência (só boletos em aberto).
create index if not exists idx_boletos_filial_em_aberto
  on public.cobrancas_boletos (filial_id)
  where data_liquidacao is null;


-- ── CAPTAÇÃO DE CLIENTES ──
create index if not exists idx_captacao_vendedor
  on public.captacao_clientes (vendedor_id);
create index if not exists idx_captacao_filial
  on public.captacao_clientes (filial_id);
create index if not exists idx_captacao_data
  on public.captacao_clientes (data_consulta);


-- ── VERIFICAÇÃO — lista os índices criados ──
select tablename as tabela, indexname as indice
from pg_indexes
where schemaname = 'public'
  and indexname like 'idx_%'
order by tablename, indexname;
