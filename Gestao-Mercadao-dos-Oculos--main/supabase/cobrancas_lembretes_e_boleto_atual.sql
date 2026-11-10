-- ═══════════════════════════════════════════════════════════════════
--  COBRANÇAS  ·  Lembretes (tarefas) + controle atual do boleto
--  Mercadão dos Óculos
--
--  O QUE FAZ
--  ---------
--  1) Adiciona aos boletos os campos "data atual" e "valor atual" — para
--     o controle interno, ao lado da situação atual (separado dos dados
--     do banco).
--  2) Cria a tabela de LEMBRETES: cada devedor pode ter lembretes com
--     data e observação, que aparecem como tarefas pendentes no Dashboard.
--
--  É SEGURO?  Sim — só adiciona colunas/tabela. Não apaga nada. Idempotente.
--  Rode DEPOIS de seguranca_onda1.sql (usa is_admin e current_filial_id).
--
--  COMO EXECUTAR:  Supabase → SQL Editor → New query → cole tudo → RUN.
-- ═══════════════════════════════════════════════════════════════════


-- ── 1. Colunas de controle atual no boleto ──
alter table public.cobrancas_boletos
  add column if not exists data_atual  date,
  add column if not exists valor_atual numeric(12,2);


-- ── 2. Tabela de lembretes (tarefas por devedor) ──
create table if not exists public.cobrancas_lembretes (
  id          uuid        default gen_random_uuid() primary key,
  devedor_id  uuid        references public.cobrancas_devedores(id) on delete cascade,
  filial_id   uuid        references public.filiais(id),
  data        date        not null,
  observacao  text,
  concluido   boolean     not null default false,
  created_by  uuid        references public.profiles(id),
  created_at  timestamptz default now()
);

create index if not exists idx_lembretes_devedor    on public.cobrancas_lembretes (devedor_id);
create index if not exists idx_lembretes_data        on public.cobrancas_lembretes (data);
create index if not exists idx_lembretes_pendentes   on public.cobrancas_lembretes (data) where concluido = false;


-- ── 3. Segurança (RLS) dos lembretes ──
alter table public.cobrancas_lembretes enable row level security;

-- Leitura: própria filial ou admin (mesma regra dos devedores).
drop policy if exists "lembretes_select" on public.cobrancas_lembretes;
create policy "lembretes_select" on public.cobrancas_lembretes
  for select to authenticated
  using ( filial_id = public.current_filial_id() or public.is_admin() );

-- Escrita: apenas admin (cobranças é gerenciada pelo admin).
drop policy if exists "lembretes_insert" on public.cobrancas_lembretes;
create policy "lembretes_insert" on public.cobrancas_lembretes
  for insert to authenticated with check ( public.is_admin() );

drop policy if exists "lembretes_update" on public.cobrancas_lembretes;
create policy "lembretes_update" on public.cobrancas_lembretes
  for update to authenticated
  using ( public.is_admin() ) with check ( public.is_admin() );

drop policy if exists "lembretes_delete" on public.cobrancas_lembretes;
create policy "lembretes_delete" on public.cobrancas_lembretes
  for delete to authenticated using ( public.is_admin() );


-- ── Verificação ──
select 'colunas boleto' as item, string_agg(column_name, ', ') as detalhe
  from information_schema.columns
  where table_schema='public' and table_name='cobrancas_boletos'
    and column_name in ('data_atual','valor_atual')
union all
select 'políticas lembretes', string_agg(policyname, ', ')
  from pg_policies where schemaname='public' and tablename='cobrancas_lembretes';
