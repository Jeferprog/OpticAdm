-- ═══════════════════════════════════════════════════════════════════
--  OPTICADM · multiempresa · 00 — ESTRUTURA ATUAL (fiel ao Mercadão)
-- ───────────────────────────────────────────────────────────────────
--  O QUE É
--  -------
--  Recria, do zero, a estrutura do banco EXATAMENTE como está hoje no
--  sistema em produção (Mercadão dos Óculos): tabelas, colunas, índices,
--  constraints, funções, triggers, a view, as políticas de acesso (RLS)
--  e o balde de arquivos da Cobrança. Nenhum dado de cliente é copiado —
--  só a "planta" da estrutura, mais as configurações padrão do sistema.
--
--  COMO FOI FEITO
--  -------------
--  Montado a partir da leitura direta do banco de produção (consultas só
--  de leitura), e NÃO dos scripts soltos da pasta supabase/ (que foram
--  rodados à mão e se contradizem). Três contradições reais foram
--  RESOLVIDAS aqui (marcadas com "RESOLUÇÃO" no texto):
--
--   1) nosso_numero: produção tinha unicidade GLOBAL e POR FILIAL ao
--      mesmo tempo. Mantida só a POR FILIAL (correta p/ várias lojas).
--   2) Vazamento: cobrancas_boletos e cobrancas_devedores tinham uma
--      política "authenticated_full_access" (libera tudo p/ qualquer
--      usuário) que anulava a proteção por filial. REMOVIDA.
--   3) cobrancas_documentos tinha dois conjuntos de políticas duplicados
--      (doc_* e cobrancas_documentos_*). Consolidado em um só.
--
--  É SEGURO / COMO RODAR
--  --------------------
--  • Não apaga nada. Idempotente (pode rodar de novo sem erro).
--  • Rodar em um projeto Supabase do OpticAdm: SQL Editor → New query →
--    colar tudo → RUN. Conferir a verificação no final.
-- ═══════════════════════════════════════════════════════════════════


-- ───────────────────────────────── 0. EXTENSÃO ──
create extension if not exists pgcrypto;   -- gen_random_uuid()


-- ───────────────────────────────── 1. TABELAS ──

create table if not exists public.filiais (
  id                uuid        not null default gen_random_uuid(),
  nome              text        not null,
  os_numero_inicial integer     not null default 1,
  sequencia_vendas  boolean     not null default true,
  created_at        timestamptz default now(),
  constraint filiais_pkey primary key (id)
);

create table if not exists public.profiles (
  id                  uuid    not null,
  nome                text    not null,
  email               text,
  papel               text    not null default 'vendedor',
  comissao_percentual numeric(5,2) default 0,
  ativo               boolean default true,
  filial_id           uuid,
  created_at          timestamptz default now(),
  constraint profiles_pkey primary key (id),
  constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade,
  constraint profiles_filial_id_fkey foreign key (filial_id) references public.filiais(id)
);

create table if not exists public.configuracoes (
  chave     text not null,
  valor     text,
  descricao text,
  constraint configuracoes_pkey primary key (chave)
);

create table if not exists public.clientes (
  id         uuid        not null default gen_random_uuid(),
  nome       text,
  cpf        text,
  telefone   text,
  endereco   text,
  filial_id  uuid,
  created_at timestamptz default now(),
  constraint clientes_pkey primary key (id),
  constraint clientes_filial_id_fkey foreign key (filial_id) references public.filiais(id)
);

create table if not exists public.vendas (
  id                   uuid        not null default gen_random_uuid(),
  os_numero            integer,
  nota_fiscal          text,
  data_venda           date        not null default current_date,
  vendedor_id          uuid,
  filial_id            uuid,
  tipo_venda           text        not null default 'Grau',
  nome_cliente         text,
  pagador              text,
  valor_bruto          numeric(12,2) default 0,
  desconto             numeric(12,2) default 0,
  valor_final          numeric(12,2) default 0,
  tarifa               numeric       not null default 0,
  valor_financiado     numeric(12,2),
  forma_pagamento      text,
  pagamento_modalidade text,
  pagamento_entrada    text,
  entrada_valor        numeric(12,2),
  entrada_forma        text,
  saldo_valor          numeric(12,2),
  saldo_forma          text,
  num_parcelas         integer     default 1,
  parcelas             jsonb,
  especialista         text,
  conferido            boolean     default false,
  conferido_em         timestamptz,
  efetivada            boolean     default true,
  motivo_nao_efetivada text,
  boleto_emitido_em    date,
  observacoes          text,
  atualizado_em        timestamptz not null default now(),
  created_at           timestamptz default now(),
  constraint vendas_pkey primary key (id),
  constraint vendas_vendedor_id_fkey foreign key (vendedor_id) references public.profiles(id),
  constraint vendas_filial_id_fkey   foreign key (filial_id)   references public.filiais(id)
);

create table if not exists public.vendas_observacoes (
  id         uuid        not null default gen_random_uuid(),
  venda_id   uuid        not null,
  texto      text        not null,
  autor_id   uuid,
  autor_nome text,
  filial_id  uuid,
  created_at timestamptz not null default now(),
  constraint vendas_observacoes_pkey primary key (id),
  constraint vendas_observacoes_venda_id_fkey foreign key (venda_id) references public.vendas(id) on delete cascade
);

create table if not exists public.despesas (
  id              uuid        not null default gen_random_uuid(),
  descricao       text        not null,
  categoria       text,
  fornecedor      text,
  valor           numeric(12,2) default 0,
  data_vencimento date,
  data_pagamento  date,
  pago            boolean     default false,
  forma_pagamento text,
  observacoes     text,
  filial_id       uuid,
  created_at      timestamptz default now(),
  constraint despesas_pkey primary key (id),
  constraint despesas_filial_id_fkey foreign key (filial_id) references public.filiais(id)
);

create table if not exists public.cobrancas_devedores (
  id                     uuid        not null default gen_random_uuid(),
  nome_pagador           text        not null,
  nome_normalizado       text        not null,
  pagador                text,
  documento              text,
  telefone               text,
  status_cobranca        text        default 'Novo',
  primeiro_registro      date        default current_date,
  ultima_atualizacao     timestamptz default now(),
  pequenas_causas        boolean     default false,
  status_pequenas_causas text,
  data_audiencia         date,
  situacao_audiencia     text,
  observacoes            text,
  filial_id              uuid,
  atualizado_em          timestamptz not null default now(),
  created_at             timestamptz default now(),
  constraint cobrancas_devedores_pkey primary key (id),
  constraint cobrancas_devedores_nome_normalizado_key unique (nome_normalizado),
  constraint cobrancas_devedores_filial_id_fkey foreign key (filial_id) references public.filiais(id)
);

-- RESOLUÇÃO (1): sem o UNIQUE global de nosso_numero. A unicidade correta,
-- POR FILIAL, fica no índice boletos_filial_nossonumero_unique (seção 4).
create table if not exists public.cobrancas_boletos (
  id               uuid        not null default gen_random_uuid(),
  devedor_id       uuid,
  venda_id         uuid,
  parcela_num      integer,
  filial_id        uuid,
  carteira         text,
  numero_doc       text,
  nosso_numero     text,
  txid             text,
  data_vencimento  date,
  data_liquidacao  date,
  data_emissao     date,
  data_atual       date,
  valor            numeric(12,2) default 0,
  valor_liquidacao numeric(12,2) default 0,
  valor_atual      numeric(12,2),
  situacao_boleto  text,
  situacao_atual   text,
  motivo           text,
  importado_em     timestamptz default now(),
  created_at       timestamptz default now(),
  constraint cobrancas_boletos_pkey primary key (id),
  constraint cobrancas_boletos_devedor_id_fkey foreign key (devedor_id) references public.cobrancas_devedores(id) on delete cascade,
  constraint cobrancas_boletos_filial_id_fkey  foreign key (filial_id)  references public.filiais(id),
  constraint cobrancas_boletos_venda_id_fkey   foreign key (venda_id)   references public.vendas(id) on delete set null
);

create table if not exists public.cobrancas_lembretes (
  id          uuid        not null default gen_random_uuid(),
  devedor_id  uuid,
  filial_id   uuid,
  data        date        not null,
  observacao  text,
  concluido   boolean     not null default false,
  created_by  uuid,
  created_at  timestamptz default now(),
  constraint cobrancas_lembretes_pkey primary key (id),
  constraint cobrancas_lembretes_devedor_id_fkey foreign key (devedor_id) references public.cobrancas_devedores(id) on delete cascade,
  constraint cobrancas_lembretes_filial_id_fkey  foreign key (filial_id)  references public.filiais(id),
  constraint cobrancas_lembretes_created_by_fkey foreign key (created_by) references public.profiles(id)
);

create table if not exists public.cobrancas_documentos (
  id           uuid        not null default gen_random_uuid(),
  devedor_id   uuid,
  nome_arquivo text        not null,
  caminho      text        not null,
  tipo         text,
  tamanho      bigint,
  descricao    text,
  enviado_por  uuid,
  created_at   timestamptz default now(),
  constraint cobrancas_documentos_pkey primary key (id),
  constraint cobrancas_documentos_devedor_id_fkey foreign key (devedor_id) references public.cobrancas_devedores(id) on delete cascade,
  constraint cobrancas_documentos_enviado_por_fkey foreign key (enviado_por) references public.profiles(id)
);

create table if not exists public.cobrancas_importacoes (
  id              uuid        not null default gen_random_uuid(),
  filial_id       uuid,
  periodo_inicio  date,
  periodo_fim     date,
  nome_arquivo    text,
  importado_por   uuid,
  total_boletos   integer default 0,
  inseridos       integer default 0,
  atualizados     integer default 0,
  novos_devedores integer default 0,
  created_at      timestamptz default now(),
  constraint cobrancas_importacoes_pkey primary key (id),
  constraint cobrancas_importacoes_filial_id_fkey     foreign key (filial_id)     references public.filiais(id),
  constraint cobrancas_importacoes_importado_por_fkey foreign key (importado_por) references public.profiles(id)
);

create table if not exists public.captacao_clientes (
  id            uuid        not null default gen_random_uuid(),
  data_consulta date        not null default current_date,
  nome_cliente  text        not null,
  numero_os     text,
  vendedor_id   uuid,
  filial_id     uuid,
  created_at    timestamptz default now(),
  constraint captacao_clientes_pkey primary key (id),
  constraint captacao_clientes_vendedor_id_fkey foreign key (vendedor_id) references public.profiles(id),
  constraint captacao_clientes_filial_id_fkey   foreign key (filial_id)   references public.filiais(id)
);

create table if not exists public.agenda (
  id          uuid        not null default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  tipo        text        not null,
  data_inicio date        not null,
  data_fim    date        not null,
  texto       text        not null,
  titulo      text,
  filial_id   uuid,
  autor_id    uuid        default auth.uid(),
  autor_nome  text,
  constraint agenda_pkey primary key (id),
  constraint agenda_tipo_check   check (tipo = any (array['acao'::text, 'promocao'::text])),
  constraint agenda_texto_check  check (char_length(trim(texto)) between 1 and 2000),
  constraint agenda_titulo_check check (titulo is null or char_length(titulo) <= 200),
  constraint agenda_periodo_valido check (data_fim >= data_inicio),
  constraint agenda_filial_id_fkey foreign key (filial_id) references public.filiais(id) on delete set null,
  constraint agenda_autor_id_fkey  foreign key (autor_id)  references auth.users(id) on delete set null
);

create table if not exists public.agenda_observacoes (
  id         uuid        not null default gen_random_uuid(),
  agenda_id  uuid        not null,
  dia        date        not null,
  texto      text        not null,
  autor_id   uuid        default auth.uid(),
  autor_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_observacoes_pkey primary key (id),
  constraint agenda_observacoes_unica unique (agenda_id, dia),
  constraint agenda_observacoes_texto_check check (char_length(texto) <= 4000),
  constraint agenda_observacoes_agenda_id_fkey foreign key (agenda_id) references public.agenda(id) on delete cascade,
  constraint agenda_observacoes_autor_id_fkey  foreign key (autor_id)  references auth.users(id) on delete set null
);

create table if not exists public.sugestoes (
  id         uuid        not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  autor_id   uuid        default auth.uid(),
  autor_nome text,
  pagina     text,
  texto      text        not null,
  lida       boolean     not null default false,
  constraint sugestoes_pkey primary key (id),
  constraint sugestoes_texto_check check (char_length(trim(texto)) between 1 and 4000),
  constraint sugestoes_autor_id_fkey foreign key (autor_id) references auth.users(id) on delete set null
);


-- ───────────────────────────────── 2. FUNÇÕES ──
-- (depois das tabelas, pois consultam public.profiles)

create or replace function public.is_admin()
 returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select coalesce(papel = 'admin', false)
  from public.profiles
  where id = auth.uid()
$function$;

create or replace function public.current_filial_id()
 returns uuid language sql stable security definer set search_path to 'public'
as $function$
  select filial_id
  from public.profiles
  where id = auth.uid()
$function$;

-- Novo usuário do Auth nasce como 'vendedor'.
create or replace function public.handle_new_user()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, nome, email, papel)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    new.email,
    'vendedor'
  );
  return new;
end;
$function$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Nº da Venda sem repetir, por filial (numeração automática).
create or replace function public.vendas_numero_automatico()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
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

  perform pg_advisory_xact_lock(hashtext('vendas_os_' || new.filial_id::text));

  if exists (select 1 from public.vendas v
             where v.filial_id = new.filial_id and v.os_numero = new.os_numero) then
    select coalesce(max(v.os_numero), 0) into v_max
      from public.vendas v where v.filial_id = new.filial_id;
    new.os_numero := greatest(v_max + 1, v_ini);
  end if;

  return new;
end $function$;

drop trigger if exists trg_vendas_numero_automatico on public.vendas;
create trigger trg_vendas_numero_automatico
  before insert on public.vendas
  for each row execute function public.vendas_numero_automatico();

create or replace function public.marcar_atualizado_em()
 returns trigger language plpgsql
as $function$
begin
  new.atualizado_em := now();
  return new;
end $function$;

drop trigger if exists trg_vendas_atualizado_em on public.vendas;
create trigger trg_vendas_atualizado_em
  before update on public.vendas
  for each row execute function public.marcar_atualizado_em();

drop trigger if exists trg_devedores_atualizado_em on public.cobrancas_devedores;
create trigger trg_devedores_atualizado_em
  before update on public.cobrancas_devedores
  for each row execute function public.marcar_atualizado_em();

create or replace function public.nome_comparavel(t text)
 returns text language sql immutable
as $function$
  select translate(upper(regexp_replace(trim(coalesce(t, '')), '\s+', ' ', 'g')),
                   'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC')
$function$;

create or replace function public.atualizar_boletos_importacao(p_boletos jsonb, p_filial uuid)
 returns integer language plpgsql set search_path to 'public'
as $function$
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
    data_emissao     = coalesce(x.data_emissao, b.data_emissao),
    filial_id        = coalesce(p_filial, b.filial_id)
  from jsonb_to_recordset(p_boletos) as x(
    nosso_numero     text,
    data_vencimento  date,
    data_liquidacao  date,
    valor            numeric,
    valor_liquidacao numeric,
    situacao_boleto  text,
    motivo           text,
    data_emissao     date
  )
  where b.nosso_numero = x.nosso_numero;
  get diagnostics n = row_count;
  return n;
end $function$;

grant execute on function public.atualizar_boletos_importacao(jsonb, uuid) to authenticated;

create or replace function public.atualizar_boletos_emitidos_vendas()
 returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare
  n integer;
begin
  with v as (
    select v.id, v.data_venda::date as dv, v.pagamento_modalidade as m, v.parcelas,
           public.nome_comparavel(coalesce(nullif(trim(v.pagador), ''), v.nome_cliente)) as nome_pag
      from public.vendas v
     where v.pagamento_modalidade in ('boleto','boleto_multicredito','boleto_multicredito_sem','crediario_entrada','crediario')
       and v.parcelas is not null
       and coalesce(v.efetivada, true)
  ),
  p as (
    select v.*, (x->>'valor')::numeric as pv
      from v, jsonb_array_elements(v.parcelas) x
     where not ((x->>'n')::int = 1 and v.m in ('boleto','boleto_multicredito','crediario_entrada'))
  ),
  achados as (
    select p.id, min(coalesce(b.data_emissao, b.created_at::date)) as emitido
      from p
      join public.cobrancas_devedores d on public.nome_comparavel(d.nome_pagador) = p.nome_pag
      join public.cobrancas_boletos b on b.devedor_id = d.id
       and abs(b.valor - p.pv) <= 0.10
       and b.data_vencimento between p.dv and p.dv + 400
     group by p.id
  ),
  alvo as (
    select v.id, a.emitido from v left join achados a on a.id = v.id
  )
  update public.vendas t
     set boleto_emitido_em = alvo.emitido
    from alvo
   where t.id = alvo.id
     and t.boleto_emitido_em is distinct from alvo.emitido;
  get diagnostics n = row_count;
  return n;
end $function$;

grant execute on function public.atualizar_boletos_emitidos_vendas() to authenticated;


-- ───────────────────────────────── 3. VIEW ──
create or replace view public.vendedores_lista as
  select id, nome, ativo from public.profiles;

grant select on public.vendedores_lista to authenticated;


-- ───────────────────────────────── 4. ÍNDICES ──
create index if not exists idx_agenda_periodo            on public.agenda (data_inicio, data_fim);
create index if not exists idx_agenda_filial             on public.agenda (filial_id);
create index if not exists idx_captacao_filial           on public.captacao_clientes (filial_id);
create index if not exists idx_captacao_data             on public.captacao_clientes (data_consulta);
create index if not exists idx_captacao_vendedor         on public.captacao_clientes (vendedor_id);
create index if not exists idx_clientes_filial           on public.clientes (filial_id);
create index if not exists idx_cobrancas_boletos_venda   on public.cobrancas_boletos (venda_id);
create index if not exists idx_boletos_filial            on public.cobrancas_boletos (filial_id);
create index if not exists idx_boletos_filial_em_aberto  on public.cobrancas_boletos (filial_id) where (data_liquidacao is null);
create index if not exists idx_cobrancas_boletos_nosso   on public.cobrancas_boletos (nosso_numero);
create index if not exists idx_cobrancas_boletos_devedor on public.cobrancas_boletos (devedor_id);
-- RESOLUÇÃO (1): unicidade de nosso_numero POR FILIAL (ignora nulos).
create unique index if not exists boletos_filial_nossonumero_unique
  on public.cobrancas_boletos (filial_id, nosso_numero) where (nosso_numero is not null);
create index if not exists idx_devedores_filial            on public.cobrancas_devedores (filial_id);
create index if not exists idx_cobrancas_devedores_normalizado on public.cobrancas_devedores (nome_normalizado);
create index if not exists idx_devedores_ultima_atualizacao on public.cobrancas_devedores (ultima_atualizacao desc);
create index if not exists idx_devedores_audiencia         on public.cobrancas_devedores (data_audiencia);
create index if not exists idx_lembretes_devedor           on public.cobrancas_lembretes (devedor_id);
create index if not exists idx_lembretes_pendentes         on public.cobrancas_lembretes (data) where (concluido = false);
create index if not exists idx_lembretes_data              on public.cobrancas_lembretes (data);
create index if not exists idx_despesas_pago_vencimento    on public.despesas (pago, data_vencimento);
create index if not exists idx_despesas_filial_pago        on public.despesas (filial_id, pago);
create index if not exists idx_sugestoes_created           on public.sugestoes (created_at desc);
create unique index if not exists vendas_filial_os_unique  on public.vendas (filial_id, os_numero) where (os_numero is not null);
create index if not exists idx_vendas_filial_data          on public.vendas (filial_id, data_venda);
create index if not exists idx_vendas_vendedor_data        on public.vendas (vendedor_id, data_venda);
create index if not exists idx_vendas_especialista         on public.vendas (especialista) where (especialista is not null);
create index if not exists idx_vendas_observacoes_venda    on public.vendas_observacoes (venda_id);


-- ───────────────────────────────── 5. RLS — LIGAR ──
alter table public.agenda                enable row level security;
alter table public.agenda_observacoes    enable row level security;
alter table public.captacao_clientes     enable row level security;
alter table public.clientes              enable row level security;
alter table public.cobrancas_boletos     enable row level security;
alter table public.cobrancas_devedores   enable row level security;
alter table public.cobrancas_documentos  enable row level security;
alter table public.cobrancas_importacoes enable row level security;
alter table public.cobrancas_lembretes   enable row level security;
alter table public.configuracoes         enable row level security;
alter table public.despesas              enable row level security;
alter table public.filiais               enable row level security;
alter table public.profiles              enable row level security;
alter table public.sugestoes             enable row level security;
alter table public.vendas                enable row level security;
alter table public.vendas_observacoes    enable row level security;


-- ───────────────────────────────── 6. POLÍTICAS (RLS) ──
-- (resolvidas: sem authenticated_full_access e sem políticas duplicadas)

-- agenda
drop policy if exists "agenda_ler" on public.agenda;
create policy "agenda_ler" on public.agenda for select to authenticated using (true);
drop policy if exists "agenda_inserir" on public.agenda;
create policy "agenda_inserir" on public.agenda for insert to authenticated with check (autor_id = auth.uid());
drop policy if exists "agenda_admin_alterar" on public.agenda;
create policy "agenda_admin_alterar" on public.agenda for update to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "agenda_admin_excluir" on public.agenda;
create policy "agenda_admin_excluir" on public.agenda for delete to authenticated using (is_admin());

-- agenda_observacoes
drop policy if exists "agenda_obs_ler" on public.agenda_observacoes;
create policy "agenda_obs_ler" on public.agenda_observacoes for select to authenticated using (true);
drop policy if exists "agenda_obs_inserir" on public.agenda_observacoes;
create policy "agenda_obs_inserir" on public.agenda_observacoes for insert to authenticated with check (true);
drop policy if exists "agenda_obs_alterar" on public.agenda_observacoes;
create policy "agenda_obs_alterar" on public.agenda_observacoes for update to authenticated using (true) with check (true);
drop policy if exists "agenda_obs_admin_excluir" on public.agenda_observacoes;
create policy "agenda_obs_admin_excluir" on public.agenda_observacoes for delete to authenticated using (is_admin());

-- captacao_clientes
drop policy if exists "captacao_select" on public.captacao_clientes;
create policy "captacao_select" on public.captacao_clientes for select to authenticated using (filial_id = current_filial_id() or is_admin());
drop policy if exists "captacao_insert" on public.captacao_clientes;
create policy "captacao_insert" on public.captacao_clientes for insert to authenticated with check (filial_id = current_filial_id() or is_admin());
drop policy if exists "captacao_update" on public.captacao_clientes;
create policy "captacao_update" on public.captacao_clientes for update to authenticated using (filial_id = current_filial_id() or is_admin()) with check (filial_id = current_filial_id() or is_admin());
drop policy if exists "captacao_delete" on public.captacao_clientes;
create policy "captacao_delete" on public.captacao_clientes for delete to authenticated using (filial_id = current_filial_id() or is_admin());

-- clientes
drop policy if exists "clientes_select" on public.clientes;
create policy "clientes_select" on public.clientes for select to authenticated using (filial_id = current_filial_id() or is_admin());
drop policy if exists "clientes_insert" on public.clientes;
create policy "clientes_insert" on public.clientes for insert to authenticated with check (filial_id = current_filial_id() or is_admin());
drop policy if exists "clientes_update" on public.clientes;
create policy "clientes_update" on public.clientes for update to authenticated using (filial_id = current_filial_id() or is_admin()) with check (filial_id = current_filial_id() or is_admin());
drop policy if exists "clientes_delete" on public.clientes;
create policy "clientes_delete" on public.clientes for delete to authenticated using (is_admin());

-- cobrancas_boletos  (RESOLUÇÃO (2): sem "authenticated_full_access")
drop policy if exists "authenticated_full_access" on public.cobrancas_boletos;
drop policy if exists "cobrancas_boletos_select" on public.cobrancas_boletos;
create policy "cobrancas_boletos_select" on public.cobrancas_boletos for select to authenticated using (filial_id = current_filial_id() or is_admin());
drop policy if exists "cobrancas_boletos_insert" on public.cobrancas_boletos;
create policy "cobrancas_boletos_insert" on public.cobrancas_boletos for insert to authenticated with check (is_admin());
drop policy if exists "cobrancas_boletos_update" on public.cobrancas_boletos;
create policy "cobrancas_boletos_update" on public.cobrancas_boletos for update to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "cobrancas_boletos_delete" on public.cobrancas_boletos;
create policy "cobrancas_boletos_delete" on public.cobrancas_boletos for delete to authenticated using (is_admin());

-- cobrancas_devedores  (RESOLUÇÃO (2): sem "authenticated_full_access")
drop policy if exists "authenticated_full_access" on public.cobrancas_devedores;
drop policy if exists "cobrancas_devedores_select" on public.cobrancas_devedores;
create policy "cobrancas_devedores_select" on public.cobrancas_devedores for select to authenticated using (filial_id = current_filial_id() or is_admin());
drop policy if exists "cobrancas_devedores_insert" on public.cobrancas_devedores;
create policy "cobrancas_devedores_insert" on public.cobrancas_devedores for insert to authenticated with check (is_admin());
drop policy if exists "cobrancas_devedores_update" on public.cobrancas_devedores;
create policy "cobrancas_devedores_update" on public.cobrancas_devedores for update to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "cobrancas_devedores_delete" on public.cobrancas_devedores;
create policy "cobrancas_devedores_delete" on public.cobrancas_devedores for delete to authenticated using (is_admin());

-- cobrancas_documentos  (RESOLUÇÃO (3): só um conjunto; sem doc_* duplicados)
drop policy if exists "doc_read"   on public.cobrancas_documentos;
drop policy if exists "doc_insert" on public.cobrancas_documentos;
drop policy if exists "doc_delete" on public.cobrancas_documentos;
drop policy if exists "cobrancas_documentos_select" on public.cobrancas_documentos;
create policy "cobrancas_documentos_select" on public.cobrancas_documentos for select to authenticated using (true);
drop policy if exists "cobrancas_documentos_insert" on public.cobrancas_documentos;
create policy "cobrancas_documentos_insert" on public.cobrancas_documentos for insert to authenticated with check (true);
drop policy if exists "cobrancas_documentos_update" on public.cobrancas_documentos;
create policy "cobrancas_documentos_update" on public.cobrancas_documentos for update to authenticated using (true) with check (true);
drop policy if exists "cobrancas_documentos_delete" on public.cobrancas_documentos;
create policy "cobrancas_documentos_delete" on public.cobrancas_documentos for delete to authenticated using (is_admin());

-- cobrancas_importacoes  (normalizado para is_admin(); mesma regra efetiva)
drop policy if exists "importacoes_read"   on public.cobrancas_importacoes;
create policy "importacoes_read" on public.cobrancas_importacoes for select to authenticated using (true);
drop policy if exists "importacoes_insert" on public.cobrancas_importacoes;
create policy "importacoes_insert" on public.cobrancas_importacoes for insert to authenticated with check (is_admin());

-- cobrancas_lembretes
drop policy if exists "lembretes_select" on public.cobrancas_lembretes;
create policy "lembretes_select" on public.cobrancas_lembretes for select to authenticated using (filial_id = current_filial_id() or is_admin());
drop policy if exists "lembretes_insert" on public.cobrancas_lembretes;
create policy "lembretes_insert" on public.cobrancas_lembretes for insert to authenticated with check (filial_id = current_filial_id() or is_admin());
drop policy if exists "lembretes_update" on public.cobrancas_lembretes;
create policy "lembretes_update" on public.cobrancas_lembretes for update to authenticated using (filial_id = current_filial_id() or is_admin()) with check (filial_id = current_filial_id() or is_admin());
drop policy if exists "lembretes_delete" on public.cobrancas_lembretes;
create policy "lembretes_delete" on public.cobrancas_lembretes for delete to authenticated using (is_admin());

-- configuracoes
drop policy if exists "configuracoes_select" on public.configuracoes;
create policy "configuracoes_select" on public.configuracoes for select to authenticated using (true);
drop policy if exists "configuracoes_admin_write" on public.configuracoes;
create policy "configuracoes_admin_write" on public.configuracoes for all to authenticated using (is_admin()) with check (is_admin());

-- despesas
drop policy if exists "despesas_select" on public.despesas;
create policy "despesas_select" on public.despesas for select to authenticated using (is_admin());
drop policy if exists "despesas_insert" on public.despesas;
create policy "despesas_insert" on public.despesas for insert to authenticated with check (is_admin());
drop policy if exists "despesas_update" on public.despesas;
create policy "despesas_update" on public.despesas for update to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "despesas_delete" on public.despesas;
create policy "despesas_delete" on public.despesas for delete to authenticated using (is_admin());

-- filiais
drop policy if exists "filiais_select" on public.filiais;
create policy "filiais_select" on public.filiais for select to authenticated using (true);
drop policy if exists "filiais_insert" on public.filiais;
create policy "filiais_insert" on public.filiais for insert to authenticated with check (is_admin());
drop policy if exists "filiais_update" on public.filiais;
create policy "filiais_update" on public.filiais for update to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "filiais_delete" on public.filiais;
create policy "filiais_delete" on public.filiais for delete to authenticated using (is_admin());

-- profiles
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated using (id = auth.uid() or is_admin());
drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles for update to authenticated using (is_admin()) with check (is_admin());

-- sugestoes
drop policy if exists "sugestoes_inserir" on public.sugestoes;
create policy "sugestoes_inserir" on public.sugestoes for insert to authenticated with check (autor_id = auth.uid());
drop policy if exists "sugestoes_admin_ler" on public.sugestoes;
create policy "sugestoes_admin_ler" on public.sugestoes for select to authenticated using (is_admin());
drop policy if exists "sugestoes_admin_alterar" on public.sugestoes;
create policy "sugestoes_admin_alterar" on public.sugestoes for update to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "sugestoes_admin_excluir" on public.sugestoes;
create policy "sugestoes_admin_excluir" on public.sugestoes for delete to authenticated using (is_admin());

-- vendas
drop policy if exists "vendas_select" on public.vendas;
create policy "vendas_select" on public.vendas for select to authenticated using (filial_id = current_filial_id() or is_admin());
drop policy if exists "vendas_insert" on public.vendas;
create policy "vendas_insert" on public.vendas for insert to authenticated with check (filial_id = current_filial_id() or is_admin());
drop policy if exists "vendas_update" on public.vendas;
create policy "vendas_update" on public.vendas for update to authenticated using (filial_id = current_filial_id() or is_admin()) with check (filial_id = current_filial_id() or is_admin());
drop policy if exists "vendas_delete" on public.vendas;
create policy "vendas_delete" on public.vendas for delete to authenticated using (filial_id = current_filial_id() or is_admin());

-- vendas_observacoes
drop policy if exists "vendas_obs_select" on public.vendas_observacoes;
create policy "vendas_obs_select" on public.vendas_observacoes for select to authenticated using (filial_id = current_filial_id() or is_admin());
drop policy if exists "vendas_obs_insert" on public.vendas_observacoes;
create policy "vendas_obs_insert" on public.vendas_observacoes for insert to authenticated with check (filial_id = current_filial_id() or is_admin());
drop policy if exists "vendas_obs_update" on public.vendas_observacoes;
create policy "vendas_obs_update" on public.vendas_observacoes for update to authenticated using (filial_id = current_filial_id() or is_admin()) with check (filial_id = current_filial_id() or is_admin());
drop policy if exists "vendas_obs_delete" on public.vendas_observacoes;
create policy "vendas_obs_delete" on public.vendas_observacoes for delete to authenticated using (filial_id = current_filial_id() or is_admin());

grant select, insert, update, delete on
  public.agenda, public.agenda_observacoes, public.captacao_clientes, public.clientes,
  public.cobrancas_boletos, public.cobrancas_devedores, public.cobrancas_documentos,
  public.cobrancas_importacoes, public.cobrancas_lembretes, public.configuracoes,
  public.despesas, public.filiais, public.profiles, public.sugestoes,
  public.vendas, public.vendas_observacoes
  to authenticated;


-- ───────────────────────────────── 7. BALDE DE ARQUIVOS (Storage) ──
-- Balde privado dos documentos da Cobrança (public=false, sem limites —
-- o tamanho/tipo é validado na tela do app).
insert into storage.buckets (id, name, public)
  values ('cobrancas-documentos', 'cobrancas-documentos', false)
  on conflict (id) do nothing;

-- Todos os autenticados veem e enviam; só admin exclui.
drop policy if exists "cobrancas_docs_bucket_select" on storage.objects;
create policy "cobrancas_docs_bucket_select" on storage.objects
  for select to authenticated using (bucket_id = 'cobrancas-documentos');
drop policy if exists "cobrancas_docs_bucket_insert" on storage.objects;
create policy "cobrancas_docs_bucket_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'cobrancas-documentos');
drop policy if exists "cobrancas_docs_bucket_delete" on storage.objects;
create policy "cobrancas_docs_bucket_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'cobrancas-documentos' and is_admin());


-- ───────────────────────────────── 8. CONFIGURAÇÕES PADRÃO ──
-- Valores padrão do sistema (NÃO são os dados do Mercadão; o admin ajusta
-- em Configurações). Sem isso, algumas listas das telas nascem vazias.
insert into public.configuracoes (chave, valor, descricao) values
  ('os_numero_inicial', '1', 'Número inicial da Ordem de Serviço'),
  ('formas_pagamento',  'Dinheiro,PIX,Cartão Débito,Cartão Crédito,Crediário,Cheque',
     'Formas de pagamento separadas por vírgula'),
  ('categorias_despesa',
     'Fornecedores,Aluguel,Salários,Energia,Água,Telefone/Internet,Impostos,Marketing,Manutenção,Outros',
     'Categorias de despesa separadas por vírgula'),
  ('parcelas_sem_juros',    '3', 'Número máximo de parcelas sem juros'),
  ('juros_parcela_percent', '0', 'Juros ao mês (%) aplicado acima do limite sem juros')
on conflict (chave) do nothing;


-- ───────────────────────────────── 9. VERIFICAÇÃO ──
select
  t.tablename                   as tabela,
  t.rowsecurity                 as rls_ligado,
  count(p.policyname)           as qtd_politicas
from pg_tables t
left join pg_policies p on p.schemaname = t.schemaname and p.tablename = t.tablename
where t.schemaname = 'public'
  and t.tablename in (
    'filiais','profiles','configuracoes','clientes','vendas','vendas_observacoes',
    'despesas','cobrancas_devedores','cobrancas_boletos','cobrancas_lembretes',
    'cobrancas_documentos','cobrancas_importacoes','captacao_clientes',
    'agenda','agenda_observacoes','sugestoes'
  )
group by t.tablename, t.rowsecurity
order by t.tablename;
