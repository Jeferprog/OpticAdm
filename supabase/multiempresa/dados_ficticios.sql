-- ═══════════════════════════════════════════════════════════════════
--  OPTICADM · DADOS FICTÍCIOS (para TESTE / DEMONSTRAÇÃO)
-- ───────────────────────────────────────────────────────────────────
--  ATENÇÃO: só rode em um banco de TESTE. Cria usuários e dados falsos
--  (2 filiais, 2 vendedores, clientes, vendas, despesas, devedores e
--  boletos). NUNCA rode em um banco com dados reais.
--
--  Pré-requisito: rodar antes o 00_schema_atual.sql (a estrutura).
--  O administrador é o seu usuário já existente — este script não o cria.
--
--  Logins de teste criados aqui (senha: Vendedor2026!):
--    • ana@opticadm.teste    (vendedora — Matriz)
--    • bruno@opticadm.teste  (vendedor  — Filial Centro)
--
--  É idempotente: usa IDs fixos + "on conflict do nothing", então rodar
--  de novo não duplica.
-- ═══════════════════════════════════════════════════════════════════


-- ───────────────────────────────── 1. FILIAIS ──
insert into public.filiais (id, nome, os_numero_inicial, sequencia_vendas) values
  ('f1111111-1111-1111-1111-111111111111', 'Matriz',        1, true),
  ('f2222222-2222-2222-2222-222222222222', 'Filial Centro', 1, true)
on conflict (id) do nothing;


-- ───────────────────────────────── 2. VENDEDORES (usuários de login) ──
-- Cria os usuários no Auth. O gatilho handle_new_user cria o profile
-- (como 'vendedor'); depois ajustamos nome e filial.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000', 'aaaa1111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'ana@opticadm.teste',
   crypt('Vendedor2026!', gen_salt('bf', 10)), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"nome":"Ana Souza"}', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'bbbb2222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'bruno@opticadm.teste',
   crypt('Vendedor2026!', gen_salt('bf', 10)), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"nome":"Bruno Lima"}', '', '', '', '')
on conflict (id) do nothing;

-- Ajusta nome, comissão e filial dos vendedores
update public.profiles set nome='Ana Souza',  comissao_percentual=3.0, filial_id='f1111111-1111-1111-1111-111111111111'
  where id='aaaa1111-1111-1111-1111-111111111111';
update public.profiles set nome='Bruno Lima', comissao_percentual=3.0, filial_id='f2222222-2222-2222-2222-222222222222'
  where id='bbbb2222-2222-2222-2222-222222222222';


-- ───────────────────────────────── 3. CLIENTES ──
insert into public.clientes (id, nome, cpf, telefone, filial_id) values
  ('c0000001-0000-0000-0000-000000000001', 'José Almeida',    '111.111.111-11', '(62) 90000-0001', 'f1111111-1111-1111-1111-111111111111'),
  ('c0000002-0000-0000-0000-000000000002', 'Fernanda Costa',  '222.222.222-22', '(62) 90000-0002', 'f1111111-1111-1111-1111-111111111111'),
  ('c0000003-0000-0000-0000-000000000003', 'Ricardo Gomes',   '333.333.333-33', '(62) 90000-0003', 'f2222222-2222-2222-2222-222222222222'),
  ('c0000004-0000-0000-0000-000000000004', 'Patrícia Rocha',  '444.444.444-44', '(62) 90000-0004', 'f2222222-2222-2222-2222-222222222222')
on conflict (id) do nothing;


-- ───────────────────────────────── 4. VENDAS ──
-- Matriz (vendedora Ana) e Filial Centro (vendedor Bruno), neste mês.
insert into public.vendas
  (id, os_numero, data_venda, vendedor_id, filial_id, tipo_venda, nome_cliente,
   valor_final, forma_pagamento, pagamento_modalidade, efetivada) values
  ('d0000001-0000-0000-0000-000000000001', 1, current_date - 1,  'aaaa1111-1111-1111-1111-111111111111', 'f1111111-1111-1111-1111-111111111111', 'Óculos de Grau', 'José Almeida',   850.00, 'PIX',            'a_vista',   true),
  ('d0000002-0000-0000-0000-000000000002', 2, current_date - 2,  'aaaa1111-1111-1111-1111-111111111111', 'f1111111-1111-1111-1111-111111111111', 'Óculos de Grau', 'Fernanda Costa', 1200.00,'Cartão Crédito', 'cartao',    true),
  ('d0000003-0000-0000-0000-000000000003', 3, current_date - 3,  'aaaa1111-1111-1111-1111-111111111111', 'f1111111-1111-1111-1111-111111111111', 'Solar',          'José Almeida',   420.00, 'Dinheiro',       'a_vista',   true),
  ('d0000004-0000-0000-0000-000000000004', 4, current_date - 5,  'aaaa1111-1111-1111-1111-111111111111', 'f1111111-1111-1111-1111-111111111111', 'Óculos de Grau', 'Fernanda Costa', 1650.00,'Crediário',      'crediario', true),
  ('d0000005-0000-0000-0000-000000000005', 5, current_date - 8,  'aaaa1111-1111-1111-1111-111111111111', 'f1111111-1111-1111-1111-111111111111', 'Óculos de Grau', 'José Almeida',   990.00, 'PIX',            'a_vista',   true),
  ('d0000006-0000-0000-0000-000000000006', 6, current_date,      'aaaa1111-1111-1111-1111-111111111111', 'f1111111-1111-1111-1111-111111111111', 'Óculos de Grau', 'Fernanda Costa', 300.00, 'Dinheiro',       'a_vista',   false),
  ('e0000001-0000-0000-0000-000000000001', 1, current_date - 1,  'bbbb2222-2222-2222-2222-222222222222', 'f2222222-2222-2222-2222-222222222222', 'Óculos de Grau', 'Ricardo Gomes',  730.00, 'Cartão Débito',  'cartao',    true),
  ('e0000002-0000-0000-0000-000000000002', 2, current_date - 2,  'bbbb2222-2222-2222-2222-222222222222', 'f2222222-2222-2222-2222-222222222222', 'Óculos de Grau', 'Patrícia Rocha', 2100.00,'Crediário',      'crediario', true),
  ('e0000003-0000-0000-0000-000000000003', 3, current_date - 4,  'bbbb2222-2222-2222-2222-222222222222', 'f2222222-2222-2222-2222-222222222222', 'Solar',          'Ricardo Gomes',  560.00, 'PIX',            'a_vista',   true),
  ('e0000004-0000-0000-0000-000000000004', 4, current_date - 6,  'bbbb2222-2222-2222-2222-222222222222', 'f2222222-2222-2222-2222-222222222222', 'Óculos de Grau', 'Patrícia Rocha', 1380.00,'Cartão Crédito', 'cartao',    true),
  ('e0000005-0000-0000-0000-000000000005', 5, current_date - 9,  'bbbb2222-2222-2222-2222-222222222222', 'f2222222-2222-2222-2222-222222222222', 'Óculos de Grau', 'Ricardo Gomes',  875.00, 'Dinheiro',       'a_vista',   true)
on conflict (id) do nothing;


-- ───────────────────────────────── 5. DESPESAS (Contas a Pagar) ──
insert into public.despesas (id, descricao, categoria, valor, data_vencimento, data_pagamento, pago, filial_id) values
  ('de000001-0000-0000-0000-000000000001', 'Aluguel da loja',      'Aluguel',    3500.00, current_date - 3,  current_date - 3, true,  'f1111111-1111-1111-1111-111111111111'),
  ('de000002-0000-0000-0000-000000000002', 'Energia elétrica',     'Energia',     680.00, current_date + 5,  null,              false, 'f1111111-1111-1111-1111-111111111111'),
  ('de000003-0000-0000-0000-000000000003', 'Fornecedor de lentes', 'Fornecedores',4200.00,current_date + 10, null,              false, 'f2222222-2222-2222-2222-222222222222'),
  ('de000004-0000-0000-0000-000000000004', 'Internet',             'Telefone/Internet', 150.00, current_date - 1, current_date - 1, true, 'f2222222-2222-2222-2222-222222222222')
on conflict (id) do nothing;


-- ───────────────────────────────── 6. COBRANÇAS · DEVEDORES ──
insert into public.cobrancas_devedores (id, nome_pagador, nome_normalizado, telefone, status_cobranca, filial_id) values
  ('de0ed001-0000-0000-0000-000000000001', 'João da Silva',  'JOAO DA SILVA',  '(62) 98000-0001', 'Em andamento', 'f1111111-1111-1111-1111-111111111111'),
  ('de0ed002-0000-0000-0000-000000000002', 'Maria Oliveira', 'MARIA OLIVEIRA', '(62) 98000-0002', 'Novo',         'f1111111-1111-1111-1111-111111111111'),
  ('de0ed003-0000-0000-0000-000000000003', 'Carlos Pereira', 'CARLOS PEREIRA', '(62) 98000-0003', 'Negociado',    'f2222222-2222-2222-2222-222222222222')
on conflict (id) do nothing;


-- ───────────────────────────────── 7. COBRANÇAS · BOLETOS ──
-- Alguns vencidos (em aberto), um liquidado. nosso_numero único por filial.
insert into public.cobrancas_boletos
  (id, devedor_id, filial_id, nosso_numero, data_vencimento, data_liquidacao, valor, situacao_boleto) values
  ('b0000001-0000-0000-0000-000000000001', 'de0ed001-0000-0000-0000-000000000001', 'f1111111-1111-1111-1111-111111111111', '1001', current_date - 20, null,              320.00, 'Em aberto'),
  ('b0000002-0000-0000-0000-000000000002', 'de0ed001-0000-0000-0000-000000000001', 'f1111111-1111-1111-1111-111111111111', '1002', current_date - 5,  null,              320.00, 'Em aberto'),
  ('b0000003-0000-0000-0000-000000000003', 'de0ed002-0000-0000-0000-000000000002', 'f1111111-1111-1111-1111-111111111111', '1003', current_date - 40, current_date - 35, 450.00, 'Liquidado'),
  ('b0000004-0000-0000-0000-000000000004', 'de0ed003-0000-0000-0000-000000000003', 'f2222222-2222-2222-2222-222222222222', '2001', current_date - 12, null,              600.00, 'Em aberto'),
  ('b0000005-0000-0000-0000-000000000005', 'de0ed003-0000-0000-0000-000000000003', 'f2222222-2222-2222-2222-222222222222', '2002', current_date + 15, null,              600.00, 'Em aberto')
on conflict (id) do nothing;


-- ───────────────────────────────── VERIFICAÇÃO ──
select 'filiais' as tabela, count(*) from public.filiais
union all select 'vendedores (profiles)', count(*) from public.profiles where papel='vendedor'
union all select 'clientes', count(*) from public.clientes
union all select 'vendas',   count(*) from public.vendas
union all select 'despesas', count(*) from public.despesas
union all select 'devedores',count(*) from public.cobrancas_devedores
union all select 'boletos',  count(*) from public.cobrancas_boletos
order by tabela;
