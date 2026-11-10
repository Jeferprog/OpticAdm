-- ═══════════════════════════════════════════════════════════════════
--  FILIAIS  ·  Numeração do Nº da Venda (sequência automática ou manual)
--  Mercadão dos Óculos
--
--  Adiciona à filial a marcação de como o Nº da Venda é preenchido:
--   • sequencia_vendas = true  → sistema sugere o próximo número (padrão)
--   • sequencia_vendas = false → número em branco para digitação livre
--
--  Seguro/idempotente. Supabase → SQL Editor → RUN.
-- ═══════════════════════════════════════════════════════════════════

alter table public.filiais
  add column if not exists sequencia_vendas boolean not null default true;

select nome, sequencia_vendas from public.filiais order by nome;
