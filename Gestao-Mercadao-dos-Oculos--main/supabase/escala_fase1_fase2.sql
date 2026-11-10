-- ═══════════════════════════════════════════════════════════════════
--  ESCALA · Fases 1 e 2 do plano de crescimento
--  Mercadão dos Óculos
--
--  1) Importação do banco: atualização dos boletos EM LOTE (uma chamada
--     para centenas de boletos, em vez de uma por boleto).
--  2) Número da Venda sem repetir: se dois vendedores salvarem ao mesmo
--     tempo na mesma filial (numeração automática), o banco dá o próximo
--     número livre para o segundo, em vez de dar erro.
--  3) Aviso de edição simultânea: vendas e devedores ganham a coluna
--     "atualizado_em". O sistema usa isso para avisar quando outra pessoa
--     alterou o registro enquanto você editava (em vez de sobrescrever).
--
--  Seguro/idempotente. Supabase → SQL Editor → New query → cole tudo → RUN.
-- ═══════════════════════════════════════════════════════════════════


-- ───────────────────────── 1. Atualização em lote da importação ──
-- Roda com as permissões de quem chama (RLS continua valendo).
create or replace function public.atualizar_boletos_importacao(p_boletos jsonb, p_filial uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  n integer;
begin
  update public.cobrancas_boletos b set
    data_vencimento  = x.data_vencimento,
    data_liquidacao  = x.data_liquidacao,
    valor            = x.valor,
    valor_liquidacao = x.valor_liquidacao,
    situacao_boleto  = coalesce(x.situacao_boleto, b.situacao_boleto),
    motivo           = coalesce(x.motivo, b.motivo),
    filial_id        = coalesce(p_filial, b.filial_id)
  from jsonb_to_recordset(p_boletos) as x(
    nosso_numero     text,
    data_vencimento  date,
    data_liquidacao  date,
    valor            numeric,
    valor_liquidacao numeric,
    situacao_boleto  text,
    motivo           text
  )
  where b.nosso_numero = x.nosso_numero;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function public.atualizar_boletos_importacao(jsonb, uuid) to authenticated;


-- ───────────────────────── 2. Número da Venda sem repetir ──
-- Só atua em filiais com numeração AUTOMÁTICA. Numeração manual continua
-- como está (o sistema avisa se o número digitado já existir).
create or replace function public.vendas_numero_automatico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auto boolean;
  v_ini  integer;
  v_max  integer;
begin
  if new.os_numero is null or new.filial_id is null then
    return new;
  end if;

  select coalesce(f.sequencia_vendas, true), coalesce(f.os_numero_inicial, 1)
    into v_auto, v_ini
    from public.filiais f where f.id = new.filial_id;

  if not coalesce(v_auto, true) then
    return new;
  end if;

  -- Uma venda por vez por filial (fila curta), para não colidir número.
  perform pg_advisory_xact_lock(hashtext('vendas_os_' || new.filial_id::text));

  if exists (select 1 from public.vendas v
             where v.filial_id = new.filial_id and v.os_numero = new.os_numero) then
    select coalesce(max(v.os_numero), 0) into v_max
      from public.vendas v where v.filial_id = new.filial_id;
    new.os_numero := greatest(v_max + 1, v_ini);
  end if;

  return new;
end $$;

drop trigger if exists trg_vendas_numero_automatico on public.vendas;
create trigger trg_vendas_numero_automatico
  before insert on public.vendas
  for each row execute function public.vendas_numero_automatico();


-- ───────────────────────── 3. Aviso de edição simultânea ──
alter table public.vendas              add column if not exists atualizado_em timestamptz not null default now();
alter table public.cobrancas_devedores add column if not exists atualizado_em timestamptz not null default now();

create or replace function public.marcar_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists trg_vendas_atualizado_em on public.vendas;
create trigger trg_vendas_atualizado_em
  before update on public.vendas
  for each row execute function public.marcar_atualizado_em();

drop trigger if exists trg_devedores_atualizado_em on public.cobrancas_devedores;
create trigger trg_devedores_atualizado_em
  before update on public.cobrancas_devedores
  for each row execute function public.marcar_atualizado_em();


-- ── Verificação ──
select 'funcao_lote' as item, count(*) from pg_proc where proname = 'atualizar_boletos_importacao'
union all
select 'gatilho_numero', count(*) from pg_trigger where tgname = 'trg_vendas_numero_automatico'
union all
select 'col_vendas_atualizado_em', count(*) from information_schema.columns
  where table_name = 'vendas' and column_name = 'atualizado_em'
union all
select 'col_devedores_atualizado_em', count(*) from information_schema.columns
  where table_name = 'cobrancas_devedores' and column_name = 'atualizado_em';
