-- ═══════════════════════════════════════════════════════════════════
--  BACKUP · Permissão para o ADMINISTRADOR restaurar um backup
--  Mercadão dos Óculos
--
--  A restauração (Configurações → Backup → Restaurar) grava os dados de
--  volta em cada tabela. Algumas tabelas só deixam gravar o próprio
--  autor (ex.: Agenda e Sugestões), o que impediria o administrador de
--  restaurar o que outras pessoas cadastraram.
--
--  Este SQL só ACRESCENTA uma regra "o administrador pode tudo" em cada
--  tabela do backup. Não remove nem muda nenhuma regra existente, não
--  altera dados e não dá nada a quem não é administrador.
--  (A tabela de usuários "profiles" NÃO é incluída: usuários e senhas
--  continuam sendo gerenciados em Configurações → Vendedores.)
--
--  Seguro/idempotente. Supabase → SQL Editor → New query → cole → RUN.
-- ═══════════════════════════════════════════════════════════════════

do $$
declare
  t text;
begin
  foreach t in array array[
    'filiais','configuracoes','clientes','captacao_clientes','vendas','vendas_observacoes',
    'despesas','cobrancas_devedores','cobrancas_boletos','cobrancas_lembretes',
    'cobrancas_documentos','cobrancas_importacoes','agenda','agenda_observacoes','sugestoes'
  ] loop
    if to_regclass('public.' || t) is not null
       and not exists (select 1 from pg_policies
                        where schemaname = 'public' and tablename = t and policyname = t || '_admin_restaurar') then
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
        t || '_admin_restaurar', t);
      execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    end if;
  end loop;
end $$;

-- Conferência: deve listar uma linha por tabela.
select tablename, policyname
  from pg_policies
 where schemaname = 'public' and policyname like '%\_admin\_restaurar' escape '\'
 order by tablename;
