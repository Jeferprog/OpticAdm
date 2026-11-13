-- ═══════════════════════════════════════════════════════════════════
--  OPTICADM · TESTE DE ISOLAMENTO ENTRE EMPRESAS
-- ───────────────────────────────────────────────────────────────────
--  Serve para PROVAR que uma empresa não vê os dados de outra.
--  Rodar DEPOIS de 00, 01 e 02. Use em um banco de TESTE.
--
--  É dividido em duas partes:
--    PARTE A — cria a empresa "Ótica Teste 2" com 1 administrador e 1
--              filial (e um pouquinho de dado), para o teste nas telas.
--    PARTE B — conferência automática, tabela por tabela, de que cada
--              administrador só enxerga a própria empresa.
--
--  ─────────────────────────────────────────────────────────────────
--  ROTEIRO DE TESTE NAS TELAS (manual)
--  ─────────────────────────────────────────────────────────────────
--  1. Rode a PARTE A (abaixo).
--  2. Abra o sistema em DUAS janelas anônimas separadas:
--     • Janela 1 — entre como o admin do Mercadão (seu usuário de sempre).
--     • Janela 2 — entre como o admin da Ótica Teste 2:
--         e-mail: admin.teste2@opticadm.teste   senha: Teste2026!
--  3. Confira, tela por tela, que cada um só vê a PRÓPRIA empresa:
--     • Dashboard: o Mercadão mostra as vendas/filiais do Mercadão; a
--       Ótica Teste 2 mostra só a "Loja Teste 2" e a venda de teste dela.
--     • Vendas: cada um vê só as próprias vendas.
--     • Cobranças, Clientes, Contas a Pagar, Comissões, Captação, Agenda:
--       idem — nada de uma aparece na outra.
--     • Em Comissões/Vendedores e no seletor de filial, a Ótica Teste 2
--       NÃO deve ver os vendedores nem as filiais do Mercadão.
--  4. Rode a PARTE B para a conferência objetiva (de_outra_empresa = 0).
-- ═══════════════════════════════════════════════════════════════════


-- ═══════════════════════ PARTE A — CRIAR "ÓTICA TESTE 2" ═══════════════════════

-- Empresa
insert into public.empresas (id, nome, cidade, uf, ativa)
  values ('00000000-0000-0000-0000-0000000000e2', 'Ótica Teste 2', 'Goiânia', 'GO', true)
  on conflict (id) do nothing;

-- Administrador da Ótica Teste 2 (login próprio)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-0000000000bb',
  'authenticated', 'authenticated', 'admin.teste2@opticadm.teste',
  crypt('Teste2026!', gen_salt('bf', 10)), now(), now(), now(),
  '{"provider":"email","providers":["email"]}', '{"nome":"Admin Teste 2"}', '', '', '', ''
) on conflict (id) do nothing;

-- O gatilho cria o perfil (como vendedor da 1ª empresa). Corrige para
-- admin da Ótica Teste 2:
update public.profiles
  set papel = 'admin', empresa_id = '00000000-0000-0000-0000-0000000000e2'
  where id = 'bbbbbbbb-0000-0000-0000-0000000000bb';

-- Filial da Ótica Teste 2
insert into public.filiais (id, nome, empresa_id) values
  ('ffffffff-0000-0000-0000-0000000000fb', 'Loja Teste 2', '00000000-0000-0000-0000-0000000000e2')
  on conflict (id) do nothing;
-- deixa o admin com essa filial
update public.profiles set filial_id = 'ffffffff-0000-0000-0000-0000000000fb'
  where id = 'bbbbbbbb-0000-0000-0000-0000000000bb';

-- Um cliente e uma venda de teste só da Ótica Teste 2
insert into public.clientes (id, nome, filial_id, empresa_id) values
  ('cccc0000-0000-0000-0000-0000000000bb', 'Cliente Teste 2', 'ffffffff-0000-0000-0000-0000000000fb', '00000000-0000-0000-0000-0000000000e2')
  on conflict (id) do nothing;
insert into public.vendas (id, os_numero, data_venda, vendedor_id, filial_id, tipo_venda, nome_cliente, valor_final, forma_pagamento, empresa_id) values
  ('dddd0000-0000-0000-0000-0000000000bb', 1, current_date, 'bbbbbbbb-0000-0000-0000-0000000000bb', 'ffffffff-0000-0000-0000-0000000000fb', 'Óculos de Grau', 'Cliente Teste 2', 999.00, 'PIX', '00000000-0000-0000-0000-0000000000e2')
  on conflict (id) do nothing;


-- ═══════════════════════ PARTE B — CONFERÊNCIA AUTOMÁTICA ═══════════════════════
-- Importante: o SQL Editor roda como "dono" e IGNORA o RLS. Para enxergar
-- como um usuário de verdade, cada bloco abaixo se faz passar pelo usuário
-- (set role authenticated + o id do usuário no "sub" do token) e conta, em
-- cada tabela, quantas linhas ele vê e quantas são de OUTRA empresa.
-- O resultado correto é: "de_outra_empresa" = 0 em TODAS as tabelas.

-- ── Troque, se precisar, pelo id do seu admin do Mercadão: ──
-- (o padrão abaixo é o usuário liaejefer2@gmail.com)

-- VISÃO DO ADMIN DO MERCADÃO ------------------------------------------------
begin;
  set local role authenticated;
  set local "request.jwt.claim.sub" = '0cbb5a2f-c337-4cde-91a8-33295829c1f3';

  select 'MERCADÃO' as quem, coalesce(public.current_empresa_id()::text,'(sem empresa)') as empresa_do_usuario;

  select tabela, visiveis, de_outra_empresa from (
    select 'filiais'               as tabela, count(*) visiveis, count(*) filter (where empresa_id <> public.current_empresa_id()) de_outra_empresa from public.filiais
    union all select 'profiles',              count(*), count(*) filter (where empresa_id <> public.current_empresa_id()) from public.profiles
    union all select 'configuracoes',         count(*), count(*) filter (where empresa_id <> public.current_empresa_id()) from public.configuracoes
    union all select 'clientes',              count(*), count(*) filter (where empresa_id <> public.current_empresa_id()) from public.clientes
    union all select 'captacao_clientes',     count(*), count(*) filter (where empresa_id <> public.current_empresa_id()) from public.captacao_clientes
    union all select 'vendas',                count(*), count(*) filter (where empresa_id <> public.current_empresa_id()) from public.vendas
    union all select 'vendas_observacoes',    count(*), count(*) filter (where empresa_id <> public.current_empresa_id()) from public.vendas_observacoes
    union all select 'despesas',              count(*), count(*) filter (where empresa_id <> public.current_empresa_id()) from public.despesas
    union all select 'cobrancas_devedores',   count(*), count(*) filter (where empresa_id <> public.current_empresa_id()) from public.cobrancas_devedores
    union all select 'cobrancas_boletos',     count(*), count(*) filter (where empresa_id <> public.current_empresa_id()) from public.cobrancas_boletos
    union all select 'cobrancas_lembretes',   count(*), count(*) filter (where empresa_id <> public.current_empresa_id()) from public.cobrancas_lembretes
    union all select 'cobrancas_documentos',  count(*), count(*) filter (where empresa_id <> public.current_empresa_id()) from public.cobrancas_documentos
    union all select 'cobrancas_importacoes', count(*), count(*) filter (where empresa_id <> public.current_empresa_id()) from public.cobrancas_importacoes
    union all select 'agenda',                count(*), count(*) filter (where empresa_id <> public.current_empresa_id()) from public.agenda
    union all select 'agenda_observacoes',    count(*), count(*) filter (where empresa_id <> public.current_empresa_id()) from public.agenda_observacoes
    union all select 'sugestoes',             count(*), count(*) filter (where empresa_id <> public.current_empresa_id()) from public.sugestoes
  ) x order by tabela;
rollback;

-- VISÃO DO ADMIN DA ÓTICA TESTE 2 -------------------------------------------
begin;
  set local role authenticated;
  set local "request.jwt.claim.sub" = 'bbbbbbbb-0000-0000-0000-0000000000bb';

  select 'ÓTICA TESTE 2' as quem, coalesce(public.current_empresa_id()::text,'(sem empresa)') as empresa_do_usuario;

  select tabela, visiveis, de_outra_empresa from (
    select 'filiais'               as tabela, count(*) visiveis, count(*) filter (where empresa_id <> public.current_empresa_id()) de_outra_empresa from public.filiais
    union all select 'profiles',              count(*), count(*) filter (where empresa_id <> public.current_empresa_id()) from public.profiles
    union all select 'configuracoes',         count(*), count(*) filter (where empresa_id <> public.current_empresa_id()) from public.configuracoes
    union all select 'clientes',              count(*), count(*) filter (where empresa_id <> public.current_empresa_id()) from public.clientes
    union all select 'captacao_clientes',     count(*), count(*) filter (where empresa_id <> public.current_empresa_id()) from public.captacao_clientes
    union all select 'vendas',                count(*), count(*) filter (where empresa_id <> public.current_empresa_id()) from public.vendas
    union all select 'vendas_observacoes',    count(*), count(*) filter (where empresa_id <> public.current_empresa_id()) from public.vendas_observacoes
    union all select 'despesas',              count(*), count(*) filter (where empresa_id <> public.current_empresa_id()) from public.despesas
    union all select 'cobrancas_devedores',   count(*), count(*) filter (where empresa_id <> public.current_empresa_id()) from public.cobrancas_devedores
    union all select 'cobrancas_boletos',     count(*), count(*) filter (where empresa_id <> public.current_empresa_id()) from public.cobrancas_boletos
    union all select 'cobrancas_lembretes',   count(*), count(*) filter (where empresa_id <> public.current_empresa_id()) from public.cobrancas_lembretes
    union all select 'cobrancas_documentos',  count(*), count(*) filter (where empresa_id <> public.current_empresa_id()) from public.cobrancas_documentos
    union all select 'cobrancas_importacoes', count(*), count(*) filter (where empresa_id <> public.current_empresa_id()) from public.cobrancas_importacoes
    union all select 'agenda',                count(*), count(*) filter (where empresa_id <> public.current_empresa_id()) from public.agenda
    union all select 'agenda_observacoes',    count(*), count(*) filter (where empresa_id <> public.current_empresa_id()) from public.agenda_observacoes
    union all select 'sugestoes',             count(*), count(*) filter (where empresa_id <> public.current_empresa_id()) from public.sugestoes
  ) x order by tabela;
rollback;

-- ─────────────────────────────────────────────────────────────────
-- COMO LER: para cada admin, "de_outra_empresa" deve ser 0 em todas as
-- linhas. "visiveis" mostra quantas linhas daquela empresa existem.
-- Se qualquer "de_outra_empresa" for maior que 0, há vazamento.
-- ─────────────────────────────────────────────────────────────────
