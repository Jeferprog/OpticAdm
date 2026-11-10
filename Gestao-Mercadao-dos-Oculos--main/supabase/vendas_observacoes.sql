-- ═══════════════════════════════════════════════════════════════════
--  OBSERVAÇÕES DA VENDA
--  Mercadão dos Óculos
--
--  Permite anotar observações em cada venda (várias por venda). Cada
--  observação guarda o texto, quem escreveu e a data/hora automática.
--  Aparece no detalhamento da venda (aba Vendas).
--
--  Seguro/idempotente. Supabase → SQL Editor → New query → cole tudo → RUN.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.vendas_observacoes (
  id         uuid primary key default gen_random_uuid(),
  venda_id   uuid not null references public.vendas(id) on delete cascade,
  texto      text not null,
  autor_id   uuid,
  autor_nome text,
  filial_id  uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_vendas_observacoes_venda
  on public.vendas_observacoes(venda_id);

alter table public.vendas_observacoes enable row level security;

-- Mesma regra das vendas: cada filial vê/edita as suas; admin vê tudo.
drop policy if exists "vendas_obs_select" on public.vendas_observacoes;
create policy "vendas_obs_select" on public.vendas_observacoes
  for select to authenticated
  using ( filial_id = public.current_filial_id() or public.is_admin() );

drop policy if exists "vendas_obs_insert" on public.vendas_observacoes;
create policy "vendas_obs_insert" on public.vendas_observacoes
  for insert to authenticated
  with check ( filial_id = public.current_filial_id() or public.is_admin() );

drop policy if exists "vendas_obs_update" on public.vendas_observacoes;
create policy "vendas_obs_update" on public.vendas_observacoes
  for update to authenticated
  using ( filial_id = public.current_filial_id() or public.is_admin() )
  with check ( filial_id = public.current_filial_id() or public.is_admin() );

drop policy if exists "vendas_obs_delete" on public.vendas_observacoes;
create policy "vendas_obs_delete" on public.vendas_observacoes
  for delete to authenticated
  using ( filial_id = public.current_filial_id() or public.is_admin() );

-- ── Verificação ──
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'vendas_observacoes'
order by ordinal_position;
