-- ═══════════════════════════════════════════════════════════════════
--  SEPARAR VENDAS  ×  COBRANÇA
--  Mercadão dos Óculos
--
--  A partir de agora a aba Vendas é só controle de vendas. A aba
--  Cobrança recebe SOMENTE o que vem do arquivo do banco.
--
--  Este SQL limpa o que a aba Vendas já tinha criado na Cobrança:
--
--    1) Boletos que JÁ foram casados com o banco (têm "nosso número")
--       são MANTIDOS — só perdem a ligação com a venda. Assim, excluir
--       uma venda nunca mais apaga um boleto do banco.
--    2) Parcelas criadas pela venda que NÃO vieram do banco (sem
--       "nosso número") são removidas da Cobrança.
--    3) Devedores que ficaram vazios (sem nenhum boleto, lembrete ou
--       documento) — criados só por causa das vendas — são removidos.
--
--  As VENDAS não são alteradas (as parcelas continuam na venda).
--
--  Supabase → SQL Editor → New query → cole tudo → RUN.
-- ═══════════════════════════════════════════════════════════════════


-- ── 1. Mantém os boletos do banco, soltando a ligação com a venda ──
update public.cobrancas_boletos
   set venda_id = null, parcela_num = null
 where venda_id is not null
   and nosso_numero is not null;

-- Exclusão de venda não apaga mais nada na Cobrança.
-- (remove qualquer ligação antiga venda_id → vendas, seja qual for o nome)
do $$
declare r record;
begin
  for r in
    select c.conname
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
     where c.conrelid = 'public.cobrancas_boletos'::regclass
       and c.contype = 'f'
       and a.attname = 'venda_id'
  loop
    execute format('alter table public.cobrancas_boletos drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.cobrancas_boletos
  add constraint cobrancas_boletos_venda_id_fkey
  foreign key (venda_id) references public.vendas(id) on delete set null;


-- ── 2. Remove as parcelas geradas pela aba Vendas (sem nosso número) ──
delete from public.cobrancas_boletos
 where venda_id is not null
   and nosso_numero is null;


-- ── 3. Remove devedores vazios (sem boleto, lembrete ou documento) ──
delete from public.cobrancas_devedores d
 where not exists (select 1 from public.cobrancas_boletos    b where b.devedor_id = d.id)
   and not exists (select 1 from public.cobrancas_lembretes  l where l.devedor_id = d.id)
   and not exists (select 1 from public.cobrancas_documentos x where x.devedor_id = d.id);


-- ── Verificação (deve mostrar 0) ──
select 'parcelas_de_venda_na_cobranca' as item, count(*)
  from public.cobrancas_boletos where venda_id is not null;
