-- ═══════════════════════════════════════════════════════════════════
--  SUGESTÕES DE MELHORIA (balãozinho no canto da tela)
--  Mercadão dos Óculos
--
--  Qualquer usuário logado pode ENVIAR uma sugestão.
--  Só administradores podem LER, marcar como lida ou excluir
--  (Configurações → Sugestões).
--
--  Seguro/idempotente.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.sugestoes (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  autor_id    uuid        default auth.uid() references auth.users(id) on delete set null,
  autor_nome  text,
  pagina      text,
  texto       text        not null check (char_length(trim(texto)) between 1 and 4000),
  lida        boolean     not null default false
);

create index if not exists idx_sugestoes_created on public.sugestoes (created_at desc);

alter table public.sugestoes enable row level security;

drop policy if exists "sugestoes_inserir" on public.sugestoes;
create policy "sugestoes_inserir" on public.sugestoes
  for insert to authenticated
  with check (autor_id = auth.uid());

drop policy if exists "sugestoes_admin_ler" on public.sugestoes;
create policy "sugestoes_admin_ler" on public.sugestoes
  for select to authenticated using (public.is_admin());

drop policy if exists "sugestoes_admin_alterar" on public.sugestoes;
create policy "sugestoes_admin_alterar" on public.sugestoes
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "sugestoes_admin_excluir" on public.sugestoes;
create policy "sugestoes_admin_excluir" on public.sugestoes
  for delete to authenticated using (public.is_admin());

grant select, insert, update, delete on public.sugestoes to authenticated;
