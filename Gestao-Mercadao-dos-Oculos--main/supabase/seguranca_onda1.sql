-- ═══════════════════════════════════════════════════════════════════
--  SEGURANÇA — ONDA 1  (isolamento por filial e por papel no BANCO)
--  Mercadão dos Óculos
--
--  O QUE ESTE SCRIPT FAZ
--  ---------------------
--  Hoje a separação entre filiais e entre perfis acontece só na tela.
--  Este script move essa proteção para o banco de dados (RLS), de modo
--  que um vendedor não consiga mais ler dados de outras filiais nem
--  dados sigilosos (comissões, e-mails) nem mesmo pelo console do
--  navegador.
--
--  É SEGURO?
--  ---------
--  • NÃO apaga nenhum dado. Só cria/atualiza regras de acesso.
--  • Pode ser executado mais de uma vez sem problema (idempotente).
--  • Foi desenhado para NÃO quebrar nenhuma tela do sistema atual.
--
--  COMO EXECUTAR
--  ------------
--  1. Abra o Supabase → SQL Editor → New query
--  2. Cole TODO este arquivo e clique em RUN
--  3. Confira o resultado da última consulta (lista de políticas ativas)
--
--  ANTES DE RODAR, GARANTA QUE:
--  • Todo VENDEDOR tem uma filial atribuída (Configurações → Usuários).
--    Vendedor sem filial não enxergará devedores/boletos.
--  • Registros antigos sem filial_id ficarão visíveis só para o admin.
-- ═══════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────── 0. FUNÇÕES AUXILIARES ──
-- SECURITY DEFINER = rodam com privilégio elevado e IGNORAM o RLS,
-- evitando recursão infinita quando as políticas consultam profiles.

-- Já existe no schema, recriada aqui por garantia.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(papel = 'admin', false)
  from public.profiles
  where id = auth.uid()
$$;

-- Retorna a filial do usuário logado (ou NULL se não tiver).
create or replace function public.current_filial_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select filial_id
  from public.profiles
  where id = auth.uid()
$$;


-- ───────────────────────────────────────── 1. PROFILES ──
-- Antes: qualquer logado lia TODOS os perfis (comissão, e-mail, papel).
-- Agora: cada um lê o próprio; admin lê todos.

drop policy if exists "profiles_select"        on public.profiles;
drop policy if exists "profiles_select_own"     on public.profiles;

create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ( id = auth.uid() or public.is_admin() );

-- Atualização continua restrita ao admin (mantém a regra existente).
drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- ───────────────────────────────────────── 2. TRIGGER DE NOVO USUÁRIO ──
-- Antes: o papel (admin/vendedor) vinha do cadastro e era confiado
--        cegamente → alguém podia se cadastrar já como admin.
-- Agora: TODO novo usuário nasce como 'vendedor'. A promoção a admin
--        só pode ser feita por quem já é admin (política acima).
--        O fluxo de "criar usuário" das Configurações continua
--        funcionando: cria como vendedor e o admin ajusta o papel.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nome, email, papel)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    new.email,
    'vendedor'   -- <<< papel fixo; nunca confiar no metadado do cadastro
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ───────────────────────────────────────── 3. VENDAS ──
-- Leitura por FILIAL (não por vendedor), porque o número da O.S. é
-- calculado a partir do maior número da filial. Se fosse por vendedor,
-- dois vendedores gerariam a mesma O.S. e o cadastro falharia.
-- Escrita: cada vendedor só mexe nas próprias; admin em todas.

drop policy if exists "vendas_authenticated" on public.vendas;

drop policy if exists "vendas_select" on public.vendas;
create policy "vendas_select" on public.vendas
  for select to authenticated
  using ( filial_id = public.current_filial_id() or public.is_admin() );

drop policy if exists "vendas_insert" on public.vendas;
create policy "vendas_insert" on public.vendas
  for insert to authenticated
  with check ( vendedor_id = auth.uid() or public.is_admin() );

drop policy if exists "vendas_update" on public.vendas;
create policy "vendas_update" on public.vendas
  for update to authenticated
  using ( vendedor_id = auth.uid() or public.is_admin() )
  with check ( vendedor_id = auth.uid() or public.is_admin() );

drop policy if exists "vendas_delete" on public.vendas;
create policy "vendas_delete" on public.vendas
  for delete to authenticated
  using ( vendedor_id = auth.uid() or public.is_admin() );


-- ───────────────────────────────────────── 4. DESPESAS ──
-- Despesas são gerenciais: só o admin lê e escreve.
-- (As telas de despesa já são exclusivas do admin.)

drop policy if exists "despesas_select" on public.despesas;
create policy "despesas_select" on public.despesas
  for select to authenticated
  using ( public.is_admin() );

drop policy if exists "despesas_insert" on public.despesas;
create policy "despesas_insert" on public.despesas
  for insert to authenticated
  with check ( public.is_admin() );

drop policy if exists "despesas_update" on public.despesas;
create policy "despesas_update" on public.despesas
  for update to authenticated
  using ( public.is_admin() ) with check ( public.is_admin() );

drop policy if exists "despesas_delete" on public.despesas;
create policy "despesas_delete" on public.despesas
  for delete to authenticated
  using ( public.is_admin() );


-- ───────────────────────────────────────── 5. COBRANÇAS ──
-- Devedores e boletos: vendedor vê só a própria filial; admin vê tudo.
-- Escrita (importação, edição): exclusiva do admin.

-- ── cobrancas_devedores ──
drop policy if exists "cobrancas_devedores_authenticated" on public.cobrancas_devedores;

drop policy if exists "cobrancas_devedores_select" on public.cobrancas_devedores;
create policy "cobrancas_devedores_select" on public.cobrancas_devedores
  for select to authenticated
  using ( filial_id = public.current_filial_id() or public.is_admin() );

drop policy if exists "cobrancas_devedores_insert" on public.cobrancas_devedores;
create policy "cobrancas_devedores_insert" on public.cobrancas_devedores
  for insert to authenticated with check ( public.is_admin() );

drop policy if exists "cobrancas_devedores_update" on public.cobrancas_devedores;
create policy "cobrancas_devedores_update" on public.cobrancas_devedores
  for update to authenticated
  using ( public.is_admin() ) with check ( public.is_admin() );

drop policy if exists "cobrancas_devedores_delete" on public.cobrancas_devedores;
create policy "cobrancas_devedores_delete" on public.cobrancas_devedores
  for delete to authenticated using ( public.is_admin() );

-- ── cobrancas_boletos ──
drop policy if exists "cobrancas_boletos_authenticated" on public.cobrancas_boletos;

drop policy if exists "cobrancas_boletos_select" on public.cobrancas_boletos;
create policy "cobrancas_boletos_select" on public.cobrancas_boletos
  for select to authenticated
  using ( filial_id = public.current_filial_id() or public.is_admin() );

drop policy if exists "cobrancas_boletos_insert" on public.cobrancas_boletos;
create policy "cobrancas_boletos_insert" on public.cobrancas_boletos
  for insert to authenticated with check ( public.is_admin() );

drop policy if exists "cobrancas_boletos_update" on public.cobrancas_boletos;
create policy "cobrancas_boletos_update" on public.cobrancas_boletos
  for update to authenticated
  using ( public.is_admin() ) with check ( public.is_admin() );

drop policy if exists "cobrancas_boletos_delete" on public.cobrancas_boletos;
create policy "cobrancas_boletos_delete" on public.cobrancas_boletos
  for delete to authenticated using ( public.is_admin() );


-- ───────────────────────────────────────── 6. CAPTAÇÃO DE CLIENTES ──
-- Cada vendedor vê e mexe só nas próprias captações; admin vê todas.

drop policy if exists "captacao_select" on public.captacao_clientes;
create policy "captacao_select" on public.captacao_clientes
  for select to authenticated
  using ( vendedor_id = auth.uid() or public.is_admin() );

drop policy if exists "captacao_insert" on public.captacao_clientes;
create policy "captacao_insert" on public.captacao_clientes
  for insert to authenticated
  with check ( vendedor_id = auth.uid() or public.is_admin() );

drop policy if exists "captacao_update" on public.captacao_clientes;
create policy "captacao_update" on public.captacao_clientes
  for update to authenticated
  using ( vendedor_id = auth.uid() or public.is_admin() )
  with check ( vendedor_id = auth.uid() or public.is_admin() );

drop policy if exists "captacao_delete" on public.captacao_clientes;
create policy "captacao_delete" on public.captacao_clientes
  for delete to authenticated
  using ( vendedor_id = auth.uid() or public.is_admin() );


-- ───────────────────────────────────────── 7. DOCUMENTOS DE COBRANÇA ──
-- Arquivos jurídicos dos devedores. Recurso usado só pelo admin.
-- Protege a TABELA (metadados). O bucket de arquivos é tratado no passo 8.
-- Envolvido em DO/EXCEPTION porque a tabela pode não existir em todos
-- os ambientes — se não existir, o bloco é ignorado sem erro.

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'cobrancas_documentos'
  ) then
    execute 'alter table public.cobrancas_documentos enable row level security';

    execute 'drop policy if exists "cobrancas_documentos_admin" on public.cobrancas_documentos';
    execute $p$
      create policy "cobrancas_documentos_admin" on public.cobrancas_documentos
        for all to authenticated
        using ( public.is_admin() )
        with check ( public.is_admin() )
    $p$;
  end if;
end $$;


-- ───────────────────────────────────────── 8. BUCKET DE ARQUIVOS ──
-- Torna o bucket privado e restringe todo acesso aos arquivos ao admin.
-- (O sistema já usa "link assinado" temporário; isto fecha o resto.)
-- Se o bucket ainda não existir, o UPDATE não afeta nada (0 linhas).

update storage.buckets
  set public = false
  where id = 'cobrancas-documentos';

drop policy if exists "cobrancas_docs_bucket_admin" on storage.objects;
create policy "cobrancas_docs_bucket_admin" on storage.objects
  for all to authenticated
  using ( bucket_id = 'cobrancas-documentos' and public.is_admin() )
  with check ( bucket_id = 'cobrancas-documentos' and public.is_admin() );


-- ═══════════════════════════════════════════════════════════════════
--  VERIFICAÇÃO — a consulta abaixo lista as políticas ativas.
--  Confira se cada tabela aparece com as regras esperadas.
-- ═══════════════════════════════════════════════════════════════════

select
  tablename                         as tabela,
  policyname                        as politica,
  cmd                               as operacao
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles','vendas','despesas',
    'cobrancas_devedores','cobrancas_boletos',
    'captacao_clientes','cobrancas_documentos'
  )
order by tablename, cmd, policyname;
