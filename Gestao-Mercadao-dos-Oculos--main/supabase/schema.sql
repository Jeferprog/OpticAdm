-- ═══════════════════════════════════════════════════════════════════
--  MERCADÃO DOS ÓCULOS — Schema Completo (Etapa 1)
--  Execute este script no editor SQL do Supabase (SQL Editor → New query)
-- ═══════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────── TABELAS ──

-- Perfis de usuários (ligados ao login do Supabase)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  nome text not null,
  email text,
  papel text not null default 'vendedor', -- 'admin' ou 'vendedor'
  comissao_percentual numeric(5,2) default 0,
  ativo boolean default true,
  created_at timestamptz default now()
);

-- Parâmetros do sistema
create table if not exists public.configuracoes (
  chave text primary key,
  valor text,
  descricao text
);

-- Vendas
create table if not exists public.vendas (
  id uuid default gen_random_uuid() primary key,
  os_numero integer unique not null,
  nota_fiscal text,
  data_venda date not null default current_date,
  vendedor_id uuid references public.profiles(id),
  valor_bruto numeric(12,2) default 0,
  desconto numeric(12,2) default 0,
  valor_final numeric(12,2) default 0,
  forma_pagamento text,
  observacoes text,
  created_at timestamptz default now()
);

-- Cobranças: devedores
create table if not exists public.cobrancas_devedores (
  id uuid default gen_random_uuid() primary key,
  nome_pagador text not null,
  documento text,
  pequenas_causas boolean default false,
  data_audiencia date,
  situacao_audiencia text,
  observacoes text,
  status_cobranca text default 'Novo', -- Novo, Em andamento, Negociado, Protestado, Quitado
  primeiro_registro date default current_date,
  ultima_atualizacao timestamptz default now(),
  created_at timestamptz default now()
);

-- Cobranças: boletos
create table if not exists public.cobrancas_boletos (
  id uuid default gen_random_uuid() primary key,
  devedor_id uuid references public.cobrancas_devedores(id) on delete cascade,
  carteira text,
  numero_doc text,
  nosso_numero text unique,
  txid text,
  data_vencimento date,
  data_liquidacao date,
  valor numeric(12,2) default 0,
  valor_liquidacao numeric(12,2) default 0,
  situacao_boleto text,
  motivo text,
  importado_em timestamptz default now(),
  created_at timestamptz default now()
);


-- ───────────────────────────────────────── DADOS INICIAIS ──

insert into public.configuracoes (chave, valor, descricao) values
  ('os_numero_inicial', '1', 'Número inicial da Ordem de Serviço'),
  ('formas_pagamento', 'Dinheiro,PIX,Cartão Débito,Cartão Crédito,Crediário,Cheque',
   'Formas de pagamento separadas por vírgula')
on conflict (chave) do nothing;


-- ───────────────────────────────────────── FUNÇÃO AUXILIAR: is_admin() ──
-- Verifica se o usuário atual é admin, com SECURITY DEFINER para
-- evitar recursão infinita nas políticas RLS da tabela profiles.

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select papel = 'admin'
  from public.profiles
  where id = auth.uid()
$$;


-- ───────────────────────────────────────── TRIGGER: criação automática de perfil ──
-- Quando um novo usuário se cadastra no Supabase Auth, cria automaticamente
-- o registro correspondente na tabela profiles.

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
    coalesce(new.raw_user_meta_data->>'papel', 'vendedor')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ───────────────────────────────────────── ROW LEVEL SECURITY (RLS) ──

alter table public.profiles enable row level security;
alter table public.configuracoes enable row level security;
alter table public.vendas enable row level security;
alter table public.cobrancas_devedores enable row level security;
alter table public.cobrancas_boletos enable row level security;


-- ───────────────────────────────────────── POLÍTICAS ──

-- profiles: todos os usuários autenticados podem ler
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);

-- profiles: somente admin pode atualizar
drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- configuracoes: todos autenticados podem ler
drop policy if exists "configuracoes_select" on public.configuracoes;
create policy "configuracoes_select" on public.configuracoes
  for select to authenticated using (true);

-- configuracoes: somente admin pode escrever
drop policy if exists "configuracoes_admin_write" on public.configuracoes;
create policy "configuracoes_admin_write" on public.configuracoes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- vendas: todos os usuários autenticados têm acesso completo
drop policy if exists "vendas_authenticated" on public.vendas;
create policy "vendas_authenticated" on public.vendas
  for all to authenticated using (true) with check (true);

-- cobrancas_devedores: todos autenticados têm acesso completo
drop policy if exists "cobrancas_devedores_authenticated" on public.cobrancas_devedores;
create policy "cobrancas_devedores_authenticated" on public.cobrancas_devedores
  for all to authenticated using (true) with check (true);

-- cobrancas_boletos: todos autenticados têm acesso completo
drop policy if exists "cobrancas_boletos_authenticated" on public.cobrancas_boletos;
create policy "cobrancas_boletos_authenticated" on public.cobrancas_boletos
  for all to authenticated using (true) with check (true);


-- ═══════════════════════════════════════════════════════════════════
--  PASSO FINAL: Tornar o seu usuário administrador
--  Execute APÓS criar sua conta no app ou no Supabase Auth.
--  Substitua 'seu@email.com' pelo seu e-mail real.
-- ═══════════════════════════════════════════════════════════════════

-- UPDATE public.profiles
-- SET papel = 'admin'
-- WHERE email = 'seu@email.com';
