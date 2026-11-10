-- captacao_clientes.sql
-- Execute no Supabase → SQL Editor → New Query

create table if not exists public.captacao_clientes (
  id            uuid        default gen_random_uuid() primary key,
  data_consulta date        not null default current_date,
  nome_cliente  text        not null,
  numero_os     text,
  vendedor_id   uuid        references profiles(id),
  filial_id     uuid        references filiais(id),
  created_at    timestamptz default now()
);

alter table public.captacao_clientes enable row level security;

-- Todos os usuários autenticados podem ler
create policy "captacao_select"
  on public.captacao_clientes for select
  to authenticated
  using (true);

-- Cada usuário insere com o próprio vendedor_id (admin pode inserir com qualquer vendedor)
create policy "captacao_insert"
  on public.captacao_clientes for insert
  to authenticated
  with check (vendedor_id = auth.uid() or is_admin());

-- Cada usuário atualiza os próprios registros; admin atualiza todos
create policy "captacao_update"
  on public.captacao_clientes for update
  to authenticated
  using  (vendedor_id = auth.uid() or is_admin())
  with check (vendedor_id = auth.uid() or is_admin());

-- Cada usuário exclui os próprios registros; admin exclui todos
create policy "captacao_delete"
  on public.captacao_clientes for delete
  to authenticated
  using (vendedor_id = auth.uid() or is_admin());
