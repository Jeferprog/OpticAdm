-- ═══════════════════════════════════════════════════════════════════
--  COBRANÇAS  ·  Remover gatilho de "última atualização" (se existir)
--  Mercadão dos Óculos
--
--  Rode ISTO SÓ SE você chegou a rodar o cobrancas_trigger_atualizacao.sql.
--  A regra passou a ser: a data de atualização muda apenas em edições
--  feitas diretamente no sistema — NÃO na importação de arquivo do banco.
--  O gatilho mexia na data em qualquer alteração de boleto (inclusive na
--  importação), por isso deve ser removido.
--
--  Seguro/idempotente. Supabase → SQL Editor → RUN.
-- ═══════════════════════════════════════════════════════════════════

drop trigger if exists trg_bump_boletos     on public.cobrancas_boletos;
drop trigger if exists trg_bump_lembretes   on public.cobrancas_lembretes;
drop trigger if exists trg_bump_documentos  on public.cobrancas_documentos;
drop function if exists public.bump_devedor_atualizacao();
