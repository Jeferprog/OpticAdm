-- ═══════════════════════════════════════════════════════════════════
--  OPTICADM · multiempresa · 02 — ISOLAMENTO POR EMPRESA (RLS)
-- ───────────────────────────────────────────────────────────────────
--  O QUE FAZ  (etapa mais sensível: separa de vez os dados de cada ótica)
--  ---------
--  Faz o BANCO impedir que uma empresa veja ou altere dados de outra.
--  A regra de empresa SE SOMA às regras atuais (por filial e por papel):
--  cada linha precisa, ALÉM do que já valia, ser da empresa do usuário.
--  Assim is_admin() passa a valer só dentro da própria empresa.
--
--  1) current_empresa_id() passa a exigir empresa ATIVA (empresa inativa,
--     ou usuário sem empresa, => não enxerga nada).
--  2) Política RESTRICTIVE "empresa_isolada" (todas as operações) nas 16
--     tabelas: empresa_id = current_empresa_id(). (As políticas por filial
--     e papel continuam; a nova se soma a elas.)
--  3) Tabela empresas: cada usuário lê só a própria.
--  4) View vendedores_lista: filtrada pela empresa (ela ignora o RLS).
--  5) Funções SECURITY DEFINER / RPC blindadas por empresa.
--  6) Bucket cobrancas-documentos: confere a empresa dona do documento
--     pelo caminho (devedor_id/arquivo) — sem mover arquivos já enviados.
--
--  Sem recursão: as funções que leem profiles são SECURITY DEFINER e
--  ignoram o RLS, então a política de profiles não chama a si mesma.
--  Seguro / idempotente. Rodar DEPOIS do 01_empresas.sql.
-- ═══════════════════════════════════════════════════════════════════


-- ───────────────────────────────── 1. EMPRESA ATIVA (req 6) ──
-- Só devolve a empresa se ela existir E estiver ativa. Caso contrário
-- devolve NULL — e a política de empresa abaixo bloqueia tudo.
create or replace function public.current_empresa_id()
 returns uuid language sql stable security definer set search_path to 'public'
as $function$
  select p.empresa_id
  from public.profiles p
  join public.empresas e on e.id = p.empresa_id
  where p.id = auth.uid() and e.ativa = true
$function$;


-- ───────────────────────────────── 2. POLÍTICA RESTRICTIVE POR EMPRESA (req 1) ──
-- Uma por tabela, válida para SELECT/INSERT/UPDATE/DELETE.
-- (usa (select ...) para o banco avaliar a empresa uma vez só — desempenho)
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
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname='empresa_isolada') then
      execute format(
        'create policy "empresa_isolada" on public.%I as restrictive for all to authenticated '
        || 'using (empresa_id = (select public.current_empresa_id())) '
        || 'with check (empresa_id = (select public.current_empresa_id()))', t);
    end if;
  end loop;
end $$;


-- ───────────────────────────────── 3. EMPRESAS: LER SÓ A PRÓPRIA (req 2) ──
alter table public.empresas enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='empresas' and policyname='empresas_select') then
    create policy "empresas_select" on public.empresas
      for select to authenticated using (id = (select public.current_empresa_id()));
  end if;
end $$;

-- permissão de leitura (a política acima restringe à própria empresa)
grant select on public.empresas to authenticated;


-- ───────────────────────────────── 4. VIEW vendedores_lista (req 3) ──
-- A view roda como dona e ignora o RLS; por isso filtramos aqui pela
-- empresa do usuário, senão listaria vendedores de todas as empresas.
create or replace view public.vendedores_lista as
  select id, nome, ativo
  from public.profiles
  where empresa_id = (select public.current_empresa_id());

grant select on public.vendedores_lista to authenticated;


-- ───────────────────────────────── 5. FUNÇÕES BLINDADAS POR EMPRESA (req 4) ──
-- Revisão de todas as funções:
--  • is_admin(), current_filial_id(), current_empresa_id(): leem APENAS o
--    próprio perfil do usuário (where id = auth.uid()); sem dado de outra
--    empresa. Sem alteração necessária.
--  • marcar_atualizado_em(): só preenche atualizado_em na própria linha.
--  • nome_comparavel(): não acessa tabela nenhuma.
--  • handle_new_user(): insere só o perfil do novo usuário.
--  As 3 abaixo cruzam tabelas e por isso recebem o filtro de empresa.

-- Importação em lote: só mexe nos boletos da empresa do usuário.
create or replace function public.atualizar_boletos_importacao(p_boletos jsonb, p_filial uuid)
 returns integer language plpgsql set search_path to 'public'
as $function$
declare n integer;
begin
  update public.cobrancas_boletos b set
    data_vencimento  = x.data_vencimento,
    data_liquidacao  = x.data_liquidacao,
    valor            = x.valor,
    valor_liquidacao = x.valor_liquidacao,
    situacao_boleto  = coalesce(x.situacao_boleto, b.situacao_boleto),
    motivo           = coalesce(x.motivo, b.motivo),
    data_emissao     = coalesce(x.data_emissao, b.data_emissao),
    filial_id        = coalesce(p_filial, b.filial_id)
  from jsonb_to_recordset(p_boletos) as x(
    nosso_numero text, data_vencimento date, data_liquidacao date, valor numeric,
    valor_liquidacao numeric, situacao_boleto text, motivo text, data_emissao date)
  where b.nosso_numero = x.nosso_numero
    and b.empresa_id = public.current_empresa_id();   -- blindagem por empresa
  get diagnostics n = row_count;
  return n;
end $function$;
grant execute on function public.atualizar_boletos_importacao(jsonb, uuid) to authenticated;

-- Marcação do "boleto emitido": roda como dona (ignora RLS), por isso
-- filtra explicitamente pela empresa do usuário em vendas, devedores e boletos.
create or replace function public.atualizar_boletos_emitidos_vendas()
 returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare n integer; emp uuid := public.current_empresa_id();
begin
  with v as (
    select v.id, v.data_venda::date as dv, v.pagamento_modalidade as m, v.parcelas,
           public.nome_comparavel(coalesce(nullif(trim(v.pagador), ''), v.nome_cliente)) as nome_pag
      from public.vendas v
     where v.empresa_id = emp                         -- blindagem por empresa
       and v.pagamento_modalidade in ('boleto','boleto_multicredito','boleto_multicredito_sem','crediario_entrada','crediario')
       and v.parcelas is not null and coalesce(v.efetivada, true)
  ),
  p as (select v.*, (x->>'valor')::numeric as pv from v, jsonb_array_elements(v.parcelas) x
     where not ((x->>'n')::int = 1 and v.m in ('boleto','boleto_multicredito','crediario_entrada'))),
  achados as (
    select p.id, min(coalesce(b.data_emissao, b.created_at::date)) as emitido from p
      join public.cobrancas_devedores d on public.nome_comparavel(d.nome_pagador) = p.nome_pag
       and d.empresa_id = emp                         -- blindagem por empresa
      join public.cobrancas_boletos b on b.devedor_id = d.id and b.empresa_id = emp  -- idem
       and abs(b.valor - p.pv) <= 0.10
       and b.data_vencimento between p.dv and p.dv + 400
     group by p.id),
  alvo as (select v.id, a.emitido from v left join achados a on a.id = v.id)
  update public.vendas t set boleto_emitido_em = alvo.emitido from alvo
   where t.id = alvo.id and t.empresa_id = emp        -- blindagem por empresa
     and t.boleto_emitido_em is distinct from alvo.emitido;
  get diagnostics n = row_count; return n;
end $function$;
grant execute on function public.atualizar_boletos_emitidos_vendas() to authenticated;

-- Numeração automática da O.S.: só considera vendas/filial da mesma empresa.
create or replace function public.vendas_numero_automatico()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare v_auto boolean; v_ini integer; v_max integer;
begin
  if new.os_numero is null or new.filial_id is null then return new; end if;
  select coalesce(f.sequencia_vendas, true), coalesce(f.os_numero_inicial, 1) into v_auto, v_ini
    from public.filiais f where f.id = new.filial_id and f.empresa_id = new.empresa_id;
  if not coalesce(v_auto, true) then return new; end if;
  perform pg_advisory_xact_lock(hashtext('vendas_os_' || new.filial_id::text));
  if exists (select 1 from public.vendas v
             where v.filial_id = new.filial_id and v.empresa_id = new.empresa_id and v.os_numero = new.os_numero) then
    select coalesce(max(v.os_numero), 0) into v_max
      from public.vendas v where v.filial_id = new.filial_id and v.empresa_id = new.empresa_id;
    new.os_numero := greatest(v_max + 1, v_ini);
  end if;
  return new;
end $function$;


-- ───────────────────────────────── 6. BUCKET POR EMPRESA (req 5) ──
-- O arquivo fica em "<devedor_id>/<arquivo>". A empresa do documento é a
-- empresa do devedor. Mantemos as regras atuais do bucket e SOMAMOS uma
-- regra RESTRICTIVE de empresa (sem apagar nada e sem mover arquivos):
-- o acesso ao documento exige que o devedor dono seja da empresa do usuário.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='cobrancas_docs_empresa') then
    create policy "cobrancas_docs_empresa" on storage.objects
      as restrictive for all to authenticated
      using ( bucket_id <> 'cobrancas-documentos'
              or exists (select 1 from public.cobrancas_devedores d
                         where d.id = ((storage.foldername(name))[1])::uuid
                           and d.empresa_id = (select public.current_empresa_id())) )
      with check ( bucket_id <> 'cobrancas-documentos'
              or exists (select 1 from public.cobrancas_devedores d
                         where d.id = ((storage.foldername(name))[1])::uuid
                           and d.empresa_id = (select public.current_empresa_id())) );
  end if;
end $$;


-- ───────────────────────────────── 7. VERIFICAÇÃO ──
-- Deve listar, para as 16 tabelas, a política "empresa_isolada" (restrictive).
select tablename as tabela, policyname as politica, permissive
from pg_policies
where schemaname='public' and policyname='empresa_isolada'
order by tablename;
