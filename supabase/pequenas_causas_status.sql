-- ═══════════════════════════════════════════════════════════════════
--  COBRANÇAS  ·  Status de Pequenas Causas
--  Mercadão dos Óculos
--
--  Adiciona ao devedor o campo de acompanhamento do processo de pequenas
--  causas (encaminhar documentos / documentação enviada / aguardando a
--  audiência / processo concluído). Só é usado quando "Pequenas causas"
--  está marcado.
--
--  Seguro/idempotente. Supabase → SQL Editor → RUN.
-- ═══════════════════════════════════════════════════════════════════

alter table public.cobrancas_devedores
  add column if not exists status_pequenas_causas text;

select column_name from information_schema.columns
where table_schema='public' and table_name='cobrancas_devedores'
  and column_name='status_pequenas_causas';
