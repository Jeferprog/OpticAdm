-- ═══════════════════════════════════════════════════════════════════
--  CONTAS A PAGAR — Execute no SQL Editor do Supabase
--  (Database → SQL Editor → New Query → cole e clique em Run)
-- ═══════════════════════════════════════════════════════════════════

-- 1. Tabela de despesas
create table if not exists public.despesas (
  id uuid default gen_random_uuid() primary key,
  descricao text not null,
  categoria text,
  fornecedor text,
  valor numeric(12,2) default 0,
  data_vencimento date,
  data_pagamento date,
  pago boolean default false,
  forma_pagamento text,
  observacoes text,
  created_at timestamptz default now()
);

-- 2. Configuração inicial das categorias de despesa
insert into public.configuracoes (chave, valor, descricao) values
  ('categorias_despesa',
   'Fornecedores,Aluguel,Salários,Energia,Água,Telefone/Internet,Impostos,Marketing,Manutenção,Outros',
   'Categorias de despesa separadas por vírgula')
on conflict (chave) do nothing;

-- 3. Ativa RLS na tabela
alter table public.despesas enable row level security;

-- 4. Políticas RLS

-- Todos os autenticados podem visualizar
drop policy if exists "despesas_select" on public.despesas;
create policy "despesas_select" on public.despesas
  for select to authenticated
  using (true);

-- Somente admin pode inserir
drop policy if exists "despesas_insert" on public.despesas;
create policy "despesas_insert" on public.despesas
  for insert to authenticated
  with check (public.is_admin());

-- Somente admin pode atualizar
drop policy if exists "despesas_update" on public.despesas;
create policy "despesas_update" on public.despesas
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Somente admin pode excluir
drop policy if exists "despesas_delete" on public.despesas;
create policy "despesas_delete" on public.despesas
  for delete to authenticated
  using (public.is_admin());
