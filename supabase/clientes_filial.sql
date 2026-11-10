-- ═══════════════════════════════════════════════════════════════════
--  SEGURANÇA — ONDA 2  ·  Isolamento da tabela CLIENTES por filial
--  Mercadão dos Óculos
--
--  O QUE FAZ
--  ---------
--  Adiciona a coluna filial_id à tabela de clientes e aplica regras de
--  acesso (RLS) por filial: cada vendedor passa a ver e cadastrar apenas
--  os clientes da própria filial; o admin vê e gerencia todos.
--
--  É SEGURO?
--  ---------
--  • NÃO apaga dados. Só adiciona uma coluna e ajusta regras.
--  • Idempotente (pode rodar mais de uma vez).
--  • Registros antigos ficam com filial em branco → visíveis só ao admin,
--    que pode atribuir a filial correta editando cada cliente na tela.
--
--  COMO EXECUTAR
--  ------------
--  Supabase → SQL Editor → New query → cole tudo → RUN.
--  Rode DEPOIS do arquivo seguranca_onda1.sql (usa is_admin e
--  current_filial_id criados lá).
-- ═══════════════════════════════════════════════════════════════════


-- ── 1. Coluna filial_id ──
alter table public.clientes
  add column if not exists filial_id uuid references public.filiais(id);

create index if not exists idx_clientes_filial on public.clientes (filial_id);


-- ── 2. RLS por filial ──
alter table public.clientes enable row level security;

-- Leitura: própria filial ou admin.
drop policy if exists "clientes_select" on public.clientes;
create policy "clientes_select" on public.clientes
  for select to authenticated
  using ( filial_id = public.current_filial_id() or public.is_admin() );

-- Inserção: o registro precisa nascer na filial do usuário (admin: qualquer).
drop policy if exists "clientes_insert" on public.clientes;
create policy "clientes_insert" on public.clientes
  for insert to authenticated
  with check ( filial_id = public.current_filial_id() or public.is_admin() );

-- Atualização: só na própria filial (admin: qualquer).
drop policy if exists "clientes_update" on public.clientes;
create policy "clientes_update" on public.clientes
  for update to authenticated
  using ( filial_id = public.current_filial_id() or public.is_admin() )
  with check ( filial_id = public.current_filial_id() or public.is_admin() );

-- Exclusão: apenas admin (mantém a regra atual).
drop policy if exists "clientes_delete" on public.clientes;
create policy "clientes_delete" on public.clientes
  for delete to authenticated
  using ( public.is_admin() );


-- ── 3. Verificação ──
select policyname as politica, cmd as operacao
from pg_policies
where schemaname = 'public' and tablename = 'clientes'
order by cmd, policyname;
