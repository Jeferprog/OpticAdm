-- ═══════════════════════════════════════════════════════════════════
--  LISTA DE VENDEDORES (para seleção em Vendas e Captação)
--  Mercadão dos Óculos
--
--  Por segurança, cada usuário só enxerga o PRÓPRIO perfil (a comissão,
--  o e-mail e o papel de cada um ficam protegidos). Mas para lançar uma
--  venda/captação em nome de outro vendedor, todos precisam ver a LISTA
--  DE NOMES. Esta "view" expõe SOMENTE id, nome e ativo — nada sensível.
--
--  Seguro/idempotente. Supabase → SQL Editor → New query → cole tudo → RUN.
-- ═══════════════════════════════════════════════════════════════════

create or replace view public.vendedores_lista as
  select id, nome, ativo
  from public.profiles;

-- A view roda com o dono (ignora o filtro "só o próprio perfil"), então
-- todos os autenticados podem ler a lista de nomes — e nada além disso.
grant select on public.vendedores_lista to authenticated;

-- ── Verificação ──
select id, nome, ativo from public.vendedores_lista order by nome;
