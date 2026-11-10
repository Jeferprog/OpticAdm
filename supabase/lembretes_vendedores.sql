-- ═══════════════════════════════════════════════════════════════════
--  COBRANÇAS  ·  Lembretes liberados para os vendedores
--  Mercadão dos Óculos
--
--  Antes: só o administrador criava/marcava lembretes.
--  Agora: o vendedor cria e marca como concluído os lembretes dos
--  devedores da PRÓPRIA filial. A exclusão continua só com o admin.
--
--  Seguro/idempotente. Supabase → SQL Editor → New query → cole tudo → RUN.
-- ═══════════════════════════════════════════════════════════════════

drop policy if exists "lembretes_insert" on public.cobrancas_lembretes;
create policy "lembretes_insert" on public.cobrancas_lembretes
  for insert to authenticated
  with check ( filial_id = public.current_filial_id() or public.is_admin() );

drop policy if exists "lembretes_update" on public.cobrancas_lembretes;
create policy "lembretes_update" on public.cobrancas_lembretes
  for update to authenticated
  using      ( filial_id = public.current_filial_id() or public.is_admin() )
  with check ( filial_id = public.current_filial_id() or public.is_admin() );

-- (lembretes_select e lembretes_delete permanecem como estão)

select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'cobrancas_lembretes'
order by cmd;
