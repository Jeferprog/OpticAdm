-- ═══════════════════════════════════════════════════════════════════
--  AGENDA — Ações e Promoções
--  Mercadão dos Óculos
--
--  Qualquer usuário logado pode VER e CADASTRAR ações/promoções.
--  Só administradores podem EDITAR ou EXCLUIR.
--  No período cadastrado (de/até) aparece um card no início do Dashboard.
--
--  Seguro/idempotente: pode rodar mais de uma vez.
--  Supabase → SQL Editor → New query → cole tudo → RUN.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.agenda (
  id           uuid        primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  tipo         text        not null check (tipo in ('acao', 'promocao')),
  data_inicio  date        not null,
  data_fim     date        not null,
  texto        text        not null check (char_length(trim(texto)) between 1 and 2000),
  autor_id     uuid        default auth.uid() references auth.users(id) on delete set null,
  autor_nome   text,
  constraint agenda_periodo_valido check (data_fim >= data_inicio)
);

create index if not exists idx_agenda_periodo on public.agenda (data_inicio, data_fim);

alter table public.agenda enable row level security;

drop policy if exists "agenda_ler" on public.agenda;
create policy "agenda_ler" on public.agenda
  for select to authenticated using (true);

drop policy if exists "agenda_inserir" on public.agenda;
create policy "agenda_inserir" on public.agenda
  for insert to authenticated
  with check (autor_id = auth.uid());

drop policy if exists "agenda_admin_alterar" on public.agenda;
create policy "agenda_admin_alterar" on public.agenda
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "agenda_admin_excluir" on public.agenda;
create policy "agenda_admin_excluir" on public.agenda
  for delete to authenticated using (public.is_admin());

grant select, insert, update, delete on public.agenda to authenticated;
