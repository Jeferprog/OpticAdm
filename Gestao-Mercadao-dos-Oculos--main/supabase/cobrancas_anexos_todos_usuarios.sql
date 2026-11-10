-- ═══════════════════════════════════════════════════════════════════
--  COBRANÇAS  ·  Anexos (documentos) liberados para todos os usuários
--  Mercadão dos Óculos
--
--  Antes, só o administrador podia ver e anexar documentos no devedor.
--  Agora QUALQUER usuário autenticado pode VER e INCLUIR anexos.
--  A EXCLUSÃO continua restrita ao administrador.
--
--  Ajusta a tabela public.cobrancas_documentos e o bucket de arquivos
--  'cobrancas-documentos'. Seguro/idempotente.
--  Supabase → SQL Editor → New query → cole tudo → RUN.
-- ═══════════════════════════════════════════════════════════════════

-- ── Tabela de registros dos documentos ──
alter table public.cobrancas_documentos enable row level security;

drop policy if exists "cobrancas_documentos_admin"  on public.cobrancas_documentos;
drop policy if exists "cobrancas_documentos_select" on public.cobrancas_documentos;
drop policy if exists "cobrancas_documentos_insert" on public.cobrancas_documentos;
drop policy if exists "cobrancas_documentos_update" on public.cobrancas_documentos;
drop policy if exists "cobrancas_documentos_delete" on public.cobrancas_documentos;

create policy "cobrancas_documentos_select" on public.cobrancas_documentos
  for select to authenticated using ( true );
create policy "cobrancas_documentos_insert" on public.cobrancas_documentos
  for insert to authenticated with check ( true );
create policy "cobrancas_documentos_update" on public.cobrancas_documentos
  for update to authenticated using ( true ) with check ( true );
create policy "cobrancas_documentos_delete" on public.cobrancas_documentos
  for delete to authenticated using ( public.is_admin() );

-- ── Bucket de arquivos (storage) ──
-- Continua privado (acesso por link assinado), mas todos podem ler/enviar.
drop policy if exists "cobrancas_docs_bucket_admin"   on storage.objects;
drop policy if exists "cobrancas_docs_bucket_select"  on storage.objects;
drop policy if exists "cobrancas_docs_bucket_insert"  on storage.objects;
drop policy if exists "cobrancas_docs_bucket_update"  on storage.objects;
drop policy if exists "cobrancas_docs_bucket_delete"  on storage.objects;

create policy "cobrancas_docs_bucket_select" on storage.objects
  for select to authenticated
  using ( bucket_id = 'cobrancas-documentos' );
create policy "cobrancas_docs_bucket_insert" on storage.objects
  for insert to authenticated
  with check ( bucket_id = 'cobrancas-documentos' );
create policy "cobrancas_docs_bucket_delete" on storage.objects
  for delete to authenticated
  using ( bucket_id = 'cobrancas-documentos' and public.is_admin() );

-- ── Verificação ──
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'cobrancas_documentos'
order by cmd, policyname;
