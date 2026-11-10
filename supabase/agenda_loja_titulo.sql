-- ═══════════════════════════════════════════════════════════════════
--  AGENDA — Loja e título da promoção
--  Mercadão dos Óculos
--
--  • filial_id: a loja da ação/promoção. Vazio = vale para todas as lojas.
--  • titulo:    o slogan da promoção (a descrição fica no campo "texto").
--
--  Só ADICIONA colunas; não altera nem apaga nada do que já existe.
--  As ações/promoções já cadastradas ficam como "Todas as lojas".
--  Seguro/idempotente: pode rodar mais de uma vez.
--  Supabase → SQL Editor → New query → cole tudo → RUN.
-- ═══════════════════════════════════════════════════════════════════

alter table public.agenda
  add column if not exists filial_id uuid references public.filiais(id) on delete set null;

alter table public.agenda
  add column if not exists titulo text check (titulo is null or char_length(titulo) <= 200);

create index if not exists idx_agenda_filial on public.agenda (filial_id);
