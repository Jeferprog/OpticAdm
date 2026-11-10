-- ═══════════════════════════════════════════════════════════════════
--  SEGURANÇA (RLS)  ·  Vendas e Captação por FILIAL
--  Mercadão dos Óculos
--
--  Passa a permitir que os vendedores de uma filial vejam e editem as
--  vendas e as captações da MESMA filial (antes: só as próprias).
--  Admin continua com acesso a tudo.
--
--  Seguro/idempotente. Rode DEPOIS de seguranca_onda1.sql (usa is_admin e
--  current_filial_id). Supabase → SQL Editor → New query → cole tudo → RUN.
-- ═══════════════════════════════════════════════════════════════════


-- ───────────────────────────── VENDAS ──
-- (o SELECT já era por filial; ajustamos insert/update/delete p/ filial)

drop policy if exists "vendas_select" on public.vendas;
create policy "vendas_select" on public.vendas
  for select to authenticated
  using ( filial_id = public.current_filial_id() or public.is_admin() );

drop policy if exists "vendas_insert" on public.vendas;
create policy "vendas_insert" on public.vendas
  for insert to authenticated
  with check ( filial_id = public.current_filial_id() or public.is_admin() );

drop policy if exists "vendas_update" on public.vendas;
create policy "vendas_update" on public.vendas
  for update to authenticated
  using ( filial_id = public.current_filial_id() or public.is_admin() )
  with check ( filial_id = public.current_filial_id() or public.is_admin() );

drop policy if exists "vendas_delete" on public.vendas;
create policy "vendas_delete" on public.vendas
  for delete to authenticated
  using ( filial_id = public.current_filial_id() or public.is_admin() );


-- ───────────────────────────── CAPTAÇÃO DE CLIENTES ──

drop policy if exists "captacao_select" on public.captacao_clientes;
create policy "captacao_select" on public.captacao_clientes
  for select to authenticated
  using ( filial_id = public.current_filial_id() or public.is_admin() );

drop policy if exists "captacao_insert" on public.captacao_clientes;
create policy "captacao_insert" on public.captacao_clientes
  for insert to authenticated
  with check ( filial_id = public.current_filial_id() or public.is_admin() );

drop policy if exists "captacao_update" on public.captacao_clientes;
create policy "captacao_update" on public.captacao_clientes
  for update to authenticated
  using ( filial_id = public.current_filial_id() or public.is_admin() )
  with check ( filial_id = public.current_filial_id() or public.is_admin() );

drop policy if exists "captacao_delete" on public.captacao_clientes;
create policy "captacao_delete" on public.captacao_clientes
  for delete to authenticated
  using ( filial_id = public.current_filial_id() or public.is_admin() );


-- ── Verificação ──
select tablename as tabela, policyname as politica, cmd as operacao
from pg_policies
where schemaname = 'public' and tablename in ('vendas', 'captacao_clientes')
order by tablename, cmd, policyname;
