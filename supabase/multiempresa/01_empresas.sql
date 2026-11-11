-- ═══════════════════════════════════════════════════════════════════
--  OPTICADM · multiempresa · 01 — CONCEITO DE EMPRESA
-- ───────────────────────────────────────────────────────────────────
--  O QUE FAZ
--  ---------
--  Cria a ideia de "empresa" (cada ótica cliente do sistema) e prepara
--  todas as tabelas para pertencerem a uma empresa — SEM mudar nada do
--  comportamento atual. As telas continuam iguais e as regras de acesso
--  (por filial/papel) NÃO são tocadas nesta etapa.
--
--  Passos:
--   1) Tabela "empresas" + cadastra "Mercadão dos Óculos" como a 1ª.
--   2) Função current_empresa_id() (igual à current_filial_id()).
--   3) Coluna empresa_id (com índice) nas 16 tabelas do sistema.
--   4) Preenche os registros existentes com a empresa Mercadão.
--   5) Torna a coluna obrigatória e com padrão = current_empresa_id(),
--      para as telas atuais continuarem gravando sem enviar a empresa.
--   6) Ajusta a criação de novo usuário para já nascer com a empresa.
--
--  É SEGURO / idempotente: pode rodar de novo sem erro. Não apaga dados.
--  Rodar DEPOIS do 00_schema_atual.sql.
-- ═══════════════════════════════════════════════════════════════════


-- ───────────────────────────────── 1. TABELA EMPRESAS ──
create table if not exists public.empresas (
  id         uuid        not null default gen_random_uuid(),
  nome       text        not null,
  cnpj       text,
  cidade     text,
  uf         text,
  logo_url   text,
  plano      text,
  ativa      boolean     not null default true,
  created_at timestamptz default now(),
  constraint empresas_pkey primary key (id)
);

-- RLS ligado (segurança), sem política de leitura ainda: a tabela só é
-- usada internamente nesta etapa; a tela de empresas virá depois.
alter table public.empresas enable row level security;

-- A primeira empresa: o Mercadão dos Óculos (id fixo p/ o preenchimento).
insert into public.empresas (id, nome, ativa)
  values ('00000000-0000-0000-0000-0000000000e1', 'Mercadão dos Óculos', true)
  on conflict (id) do nothing;


-- ───────────────────────────────── 2. COLUNA empresa_id + ÍNDICE ──
-- (adiciona em todas as 16 tabelas; ainda permite nulo neste momento)
do $$
declare
  t text;
  tabelas text[] := array[
    'filiais','profiles','configuracoes','clientes','captacao_clientes','vendas',
    'vendas_observacoes','despesas','cobrancas_devedores','cobrancas_boletos',
    'cobrancas_lembretes','cobrancas_documentos','cobrancas_importacoes',
    'agenda','agenda_observacoes','sugestoes'
  ];
begin
  foreach t in array tabelas loop
    execute format('alter table public.%I add column if not exists empresa_id uuid references public.empresas(id)', t);
    execute format('create index if not exists idx_%s_empresa on public.%I (empresa_id)', t, t);
  end loop;
end $$;


-- ───────────────────────────────── 3. FUNÇÃO current_empresa_id() ──
-- Mesma ideia da current_filial_id(): lê a empresa do usuário logado.
-- (criada depois da coluna empresa_id em profiles existir)
create or replace function public.current_empresa_id()
 returns uuid language sql stable security definer set search_path to 'public'
as $function$
  select empresa_id from public.profiles where id = auth.uid()
$function$;


-- ───────────────────────────────── 4. NOVO USUÁRIO JÁ NASCE COM EMPRESA ──
-- Sem isso, criar um vendedor novo quebraria (empresa_id obrigatório).
-- Enquanto houver só uma empresa, o novo usuário entra nela (Mercadão).
create or replace function public.handle_new_user()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, nome, email, papel, empresa_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    new.email,
    'vendedor',
    coalesce(public.current_empresa_id(), (select id from public.empresas order by created_at limit 1))
  );
  return new;
end;
$function$;


-- ───────────────────────────────── 5. PREENCHER + OBRIGAR + PADRÃO ──
do $$
declare
  t text;
  mercadao uuid := '00000000-0000-0000-0000-0000000000e1';
  tabelas text[] := array[
    'filiais','profiles','configuracoes','clientes','captacao_clientes','vendas',
    'vendas_observacoes','despesas','cobrancas_devedores','cobrancas_boletos',
    'cobrancas_lembretes','cobrancas_documentos','cobrancas_importacoes',
    'agenda','agenda_observacoes','sugestoes'
  ];
begin
  foreach t in array tabelas loop
    -- 5a. preenche os registros existentes com a empresa Mercadão
    execute format('update public.%I set empresa_id = %L where empresa_id is null', t, mercadao);
    -- 5b. só depois torna obrigatória
    execute format('alter table public.%I alter column empresa_id set not null', t);
    -- 5c. padrão = empresa do usuário logado (telas atuais não precisam enviar)
    execute format('alter table public.%I alter column empresa_id set default public.current_empresa_id()', t);
  end loop;
end $$;

-- OBS (para o futuro, fora desta etapa): a tabela "configuracoes" tem o
-- "chave" como chave primária global. Quando entrar a 2ª empresa, a chave
-- precisará virar (empresa_id, chave) para cada empresa ter suas próprias
-- configurações. Aqui NÃO alteramos isso (há só uma empresa).


-- ───────────────────────────────── 6. VERIFICAÇÃO ──
select
  c.table_name                                   as tabela,
  (c.is_nullable = 'NO')                          as obrigatoria,
  (c.column_default like '%current_empresa_id%')  as tem_padrao
from information_schema.columns c
where c.table_schema = 'public' and c.column_name = 'empresa_id'
order by c.table_name;
