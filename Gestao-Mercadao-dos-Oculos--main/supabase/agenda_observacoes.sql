-- ═══════════════════════════════════════════════════════════════════
--  AGENDA — Observações das ações (como foi a ação em cada dia)
--  Mercadão dos Óculos
--
--  Na "Programação da semana", cada ação tem, em cada dia, um campo
--  para anotar como foi. Qualquer usuário logado pode ver, escrever e
--  alterar a observação. Só o administrador pode excluir.
--  Se a ação for excluída da Agenda, as observações dela também são.
--
--  Seguro/idempotente: pode rodar mais de uma vez.
--  Supabase → SQL Editor → New query → cole tudo → RUN.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.agenda_observacoes (
  id          uuid        primary key default gen_random_uuid(),
  agenda_id   uuid        not null references public.agenda(id) on delete cascade,
  dia         date        not null,
  texto       text        not null check (char_length(texto) <= 4000),
  autor_id    uuid        default auth.uid() references auth.users(id) on delete set null,
  autor_nome  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint agenda_observacoes_unica unique (agenda_id, dia)
);

alter table public.agenda_observacoes enable row level security;

drop policy if exists "agenda_obs_ler" on public.agenda_observacoes;
create policy "agenda_obs_ler" on public.agenda_observacoes
  for select to authenticated using (true);

drop policy if exists "agenda_obs_inserir" on public.agenda_observacoes;
create policy "agenda_obs_inserir" on public.agenda_observacoes
  for insert to authenticated with check (true);

drop policy if exists "agenda_obs_alterar" on public.agenda_observacoes;
create policy "agenda_obs_alterar" on public.agenda_observacoes
  for update to authenticated using (true) with check (true);

drop policy if exists "agenda_obs_admin_excluir" on public.agenda_observacoes;
create policy "agenda_obs_admin_excluir" on public.agenda_observacoes
  for delete to authenticated using (public.is_admin());

grant select, insert, update, delete on public.agenda_observacoes to authenticated;
