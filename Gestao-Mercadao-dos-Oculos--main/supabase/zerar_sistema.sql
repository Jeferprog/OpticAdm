-- ═══════════════════════════════════════════════════════════════════
--  ZERAR O SISTEMA  (limpeza dos dados de teste)
--  Mercadão dos Óculos
--
--  O QUE FAZ
--  ---------
--  Apaga TODOS os dados de teste e os cadastros de vendedores, deixando
--  o sistema pronto para a operação real:
--    • APAGA: vendas, despesas, clientes, captações, cobranças
--             (devedores, boletos, documentos e histórico de importação)
--    • APAGA: os vendedores (inclusive o login deles)
--    • MANTÉM: os administradores, as filiais e as configurações
--
--  ⚠️  ISSO É IRREVERSÍVEL. NÃO DÁ PARA DESFAZER.
--  ────────────────────────────────────────────
--  ANTES de rodar, faça um BACKUP no Supabase:
--    Dashboard → Database → Backups  (ou exporte os dados que quiser guardar).
--
--  COMO RODAR (em DOIS passos, um de cada vez)
--  -------------------------------------------
--  1) Rode primeiro o PASSO 1 e CONFIRA a lista: quem é admin fica,
--     quem é vendedor será apagado. Confira também quantos registros
--     serão removidos.
--  2) Só depois, rode o PASSO 2 para executar a limpeza de verdade.
--
--  Dica: no SQL Editor, você pode SELECIONAR só o trecho do passo que
--  quer rodar (com o mouse) e clicar em RUN — assim roda um por vez.
-- ═══════════════════════════════════════════════════════════════════



-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  PASSO 1 — PRÉVIA (não apaga nada; só mostra o que vai acontecer)  ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- 1a) Usuários: quem fica (admin) e quem sai (vendedores)
select
  case when papel is distinct from 'admin'
       then '❌ SERÁ APAGADO'
       else '✅ mantido (admin)'
  end                              as acao,
  nome, email, papel
from public.profiles
order by acao desc, nome;

-- 1b) Quantidade de registros que serão apagados em cada tabela
--     (rode separadamente se quiser ver este número)
-- select 'vendas'                as tabela, count(*) from public.vendas
-- union all select 'despesas',              count(*) from public.despesas
-- union all select 'clientes',              count(*) from public.clientes
-- union all select 'captacao_clientes',     count(*) from public.captacao_clientes
-- union all select 'cobrancas_devedores',   count(*) from public.cobrancas_devedores
-- union all select 'cobrancas_boletos',     count(*) from public.cobrancas_boletos
-- union all select 'cobrancas_documentos',  count(*) from public.cobrancas_documentos
-- union all select 'cobrancas_importacoes', count(*) from public.cobrancas_importacoes;



-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  PASSO 2 — EXECUTAR A LIMPEZA  (apaga de verdade)                  ║
-- ║  Rode só depois de conferir o PASSO 1.                            ║
-- ╚═══════════════════════════════════════════════════════════════════╝

begin;

  -- Trava de segurança: se por acaso NÃO existir nenhum admin, cancela tudo
  -- (evita o sistema ficar sem ninguém para acessar).
  do $$
  begin
    if (select count(*) from public.profiles where papel = 'admin') = 0 then
      raise exception 'Nenhum administrador encontrado. Limpeza CANCELADA por segurança.';
    end if;
  end $$;

  -- Apaga os dados das tabelas que existirem (ignora as que não existem).
  do $$
  declare t text;
  begin
    foreach t in array array[
      'cobrancas_boletos', 'cobrancas_documentos', 'cobrancas_importacoes',
      'cobrancas_devedores', 'captacao_clientes', 'clientes',
      'despesas', 'vendas'
    ] loop
      if to_regclass('public.' || t) is not null then
        execute format('delete from public.%I', t);
      end if;
    end loop;
  end $$;

  -- OBS.: os ARQUIVOS de documentos (bucket 'cobrancas-documentos') NÃO
  -- podem ser apagados por SQL — o Supabase bloqueia isso por segurança.
  -- Esvazie o bucket pela tela: Storage → cobrancas-documentos →
  -- selecionar tudo → Delete. (Os registros no banco já foram removidos acima.)

  -- Apaga os vendedores (todos que NÃO são admin). O login some junto,
  -- pois o perfil é removido em cascata ao apagar o usuário.
  delete from auth.users
   where id in (select id from public.profiles where papel is distinct from 'admin');

commit;



-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  PASSO 3 — CONFERÊNCIA (opcional; deve dar tudo 0, só admins)      ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- select 'vendas' as tabela, count(*) from public.vendas
-- union all select 'despesas',              count(*) from public.despesas
-- union all select 'clientes',              count(*) from public.clientes
-- union all select 'captacao_clientes',     count(*) from public.captacao_clientes
-- union all select 'cobrancas_devedores',   count(*) from public.cobrancas_devedores
-- union all select 'cobrancas_boletos',     count(*) from public.cobrancas_boletos
-- union all select 'usuarios (perfis)',     count(*) from public.profiles;
