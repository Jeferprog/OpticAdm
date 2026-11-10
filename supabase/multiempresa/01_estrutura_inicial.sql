-- ═══════════════════════════════════════════════════════════════════
--  OPTICADM · multiempresa · 01 — ESTRUTURA INICIAL DO BANCO
-- ───────────────────────────────────────────────────────────────────
--  O QUE ESTE SCRIPT FAZ
--  ---------------------
--  Cria, do zero, TODA a estrutura que o sistema OpticAdm precisa para
--  funcionar em um projeto Supabase novo e vazio: tabelas, funções,
--  gatilhos, índices, regras de acesso (RLS) e o balde de arquivos da
--  Cobrança. Não cria nenhum dado de cliente/venda — só a "casa" onde
--  esses dados vão morar, mais as configurações padrão.
--
--  É SEGURO?
--  ---------
--  • NÃO apaga nada. Só cria o que ainda não existe.
--  • Idempotente: pode rodar de novo sem erro e sem duplicar nada
--    (usa "if not exists", "or replace" e "on conflict do nothing").
--  • Feito para rodar em um projeto NOVO do OpticAdm (nunca no banco do
--    sistema antigo).
--
--  COMO EXECUTAR
--  ------------
--  1. No Supabase do OpticAdm:  SQL Editor → New query
--  2. Cole TODO este arquivo e clique em RUN
--  3. Confira a última tabela de resultado (lista de tabelas e
--     quantidade de políticas) — deve aparecer uma linha por tabela.
--
--  DEPOIS DESTE SCRIPT (passos manuais explicados no PR):
--  • Criar o seu usuário e torná-lo administrador (bloco comentado no fim).
-- ═══════════════════════════════════════════════════════════════════


-- ───────────────────────────────── 0. EXTENSÃO ──
create extension if not exists pgcrypto;   -- gen_random_uuid()


-- ───────────────────────────────── 1. TABELAS BASE ──

-- Filiais (lojas da rede)
create table if not exists public.filiais (
  id                uuid        default gen_random_uuid() primary key,
  nome              text        not null,
  os_numero_inicial integer     not null default 1,
  sequencia_vendas  boolean     not null default true,
  created_at        timestamptz default now()
);

-- Perfis de usuário (ligados ao login do Supabase Auth)
create table if not exists public.profiles (
  id                  uuid    references auth.users on delete cascade primary key,
  nome                text    not null,
  email               text,
  papel               text    not null default 'vendedor',   -- 'admin' | 'vendedor'
  comissao_percentual numeric(5,2) default 0,
  ativo               boolean default true,
  filial_id           uuid    references public.filiais(id),
  created_at          timestamptz default now()
);

-- Parâmetros do sistema (chave/valor)
create table if not exists public.configuracoes (
  chave     text primary key,
  valor     text,
  descricao text
);


-- ───────────────────────────────── 2. FUNÇÕES DE APOIO ──
-- SECURITY DEFINER = rodam com privilégio elevado e ignoram o RLS,
-- evitando recursão quando as políticas consultam a tabela profiles.
-- (Criadas DEPOIS das tabelas porque consultam public.profiles.)

create or replace function public.is_admin()
returns boolean
language sql security definer stable
set search_path = public
as $$
  select coalesce(papel = 'admin', false)
  from public.profiles
  where id = auth.uid()
$$;

create or replace function public.current_filial_id()
returns uuid
language sql security definer stable
set search_path = public
as $$
  select filial_id
  from public.profiles
  where id = auth.uid()
$$;


-- ───────────────────────────────── 3. GATILHO DE NOVO USUÁRIO ──
-- Todo novo usuário do Auth nasce como 'vendedor'. A promoção a admin
-- só é feita por quem já é admin (política mais abaixo).

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
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
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ───────────────────────────────── 4. CLIENTES ──
create table if not exists public.clientes (
  id         uuid        default gen_random_uuid() primary key,
  nome       text,
  cpf        text,
  telefone   text,
  endereco   text,
  filial_id  uuid        references public.filiais(id),
  created_at timestamptz default now()
);


-- ───────────────────────────────── 5. VENDAS ──
create table if not exists public.vendas (
  id                   uuid        default gen_random_uuid() primary key,
  os_numero            integer,
  nota_fiscal          text,
  data_venda           date        not null default current_date,
  vendedor_id          uuid        references public.profiles(id),
  filial_id            uuid        references public.filiais(id),
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
  created_at           timestamptz default now()
);

-- Nº da O.S. único por filial (ignora linhas sem número).
create unique index if not exists vendas_filial_os_unique
  on public.vendas (filial_id, os_numero)
  where os_numero is not null;


-- ───────────────────────────────── 6. OBSERVAÇÕES DA VENDA ──
create table if not exists public.vendas_observacoes (
  id         uuid primary key default gen_random_uuid(),
  venda_id   uuid not null references public.vendas(id) on delete cascade,
  texto      text not null,
  autor_id   uuid,
  autor_nome text,
  filial_id  uuid,
  created_at timestamptz not null default now()
);


-- ───────────────────────────────── 7. DESPESAS (Contas a Pagar) ──
create table if not exists public.despesas (
  id              uuid        default gen_random_uuid() primary key,
  descricao       text        not null,
  categoria       text,
  fornecedor      text,
  valor           numeric(12,2) default 0,
  data_vencimento date,
  data_pagamento  date,
  pago            boolean     default false,
  forma_pagamento text,
  observacoes     text,
  filial_id       uuid        references public.filiais(id),
  created_at      timestamptz default now()
);


-- ───────────────────────────────── 8. COBRANÇAS · DEVEDORES ──
create table if not exists public.cobrancas_devedores (
  id                     uuid    default gen_random_uuid() primary key,
  nome_pagador           text    not null,
  nome_normalizado       text    not null,
  pagador                text,
  documento              text,
  telefone               text,
  status_cobranca        text    default 'Novo',
  primeiro_registro      date,
  ultima_atualizacao     date,
  pequenas_causas        boolean default false,
  status_pequenas_causas text,
  data_audiencia         date,
  situacao_audiencia     text,
  observacoes            text,
  filial_id              uuid    references public.filiais(id),
  atualizado_em          timestamptz not null default now(),
  created_at             timestamptz default now(),
  constraint cobrancas_devedores_nome_normalizado_key unique (nome_normalizado)
);


-- ───────────────────────────────── 9. COBRANÇAS · BOLETOS ──
create table if not exists public.cobrancas_boletos (
  id               uuid    default gen_random_uuid() primary key,
  devedor_id       uuid    references public.cobrancas_devedores(id) on delete cascade,
  venda_id         uuid    references public.vendas(id) on delete cascade,
  parcela_num      int,
  filial_id        uuid    references public.filiais(id),
  carteira         text,
  numero_doc       text,
  nosso_numero     text,
  txid             text,
  data_vencimento  date,
  data_liquidacao  date,
  data_emissao     date,
  data_atual       date,
  valor            numeric(12,2),
  valor_liquidacao numeric(12,2),
  valor_atual      numeric(12,2),
  situacao_boleto  text,
  motivo           text,
  created_at       timestamptz default now(),
  constraint cobrancas_boletos_nosso_numero_key unique (nosso_numero)
);


-- ───────────────────────────────── 10. COBRANÇAS · LEMBRETES ──
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


-- ───────────────────────────────── 11. COBRANÇAS · DOCUMENTOS ──
-- (anexos jurídicos dos devedores; o arquivo em si vai no balde Storage)
create table if not exists public.cobrancas_documentos (
  id           uuid        default gen_random_uuid() primary key,
  devedor_id   uuid        references public.cobrancas_devedores(id) on delete cascade,
  nome_arquivo text,
  caminho      text,
  tipo         text,
  tamanho      bigint,
  descricao    text,
  enviado_por  uuid        references public.profiles(id),
  created_at   timestamptz default now()
);


-- ───────────────────────────────── 12. COBRANÇAS · IMPORTAÇÕES ──
-- (histórico de cada importação de planilha de boletos)
create table if not exists public.cobrancas_importacoes (
  id              uuid        default gen_random_uuid() primary key,
  filial_id       uuid        references public.filiais(id),
  periodo_inicio  date,
  periodo_fim     date,
  nome_arquivo    text,
  importado_por   text,
  total_boletos   integer,
  inseridos       integer,
  atualizados     integer,
  novos_devedores integer,
  created_at      timestamptz default now()
);


-- ───────────────────────────────── 13. CAPTAÇÃO DE CLIENTES ──
create table if not exists public.captacao_clientes (
  id            uuid        default gen_random_uuid() primary key,
  data_consulta date        not null default current_date,
  nome_cliente  text        not null,
  numero_os     text,
  vendedor_id   uuid        references public.profiles(id),
  filial_id     uuid        references public.filiais(id),
  created_at    timestamptz default now()
);


-- ───────────────────────────────── 14. AGENDA ──
create table if not exists public.agenda (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  tipo        text        not null check (tipo in ('acao', 'promocao')),
  data_inicio date        not null,
  data_fim    date        not null,
  texto       text        not null check (char_length(trim(texto)) between 1 and 2000),
  titulo      text        check (titulo is null or char_length(titulo) <= 200),
  filial_id   uuid        references public.filiais(id) on delete set null,
  autor_id    uuid        default auth.uid() references auth.users(id) on delete set null,
  autor_nome  text,
  constraint agenda_periodo_valido check (data_fim >= data_inicio)
);

create table if not exists public.agenda_observacoes (
  id         uuid        primary key default gen_random_uuid(),
  agenda_id  uuid        not null references public.agenda(id) on delete cascade,
  dia        date        not null,
  texto      text        not null check (char_length(texto) <= 4000),
  autor_id   uuid        default auth.uid() references auth.users(id) on delete set null,
  autor_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_observacoes_unica unique (agenda_id, dia)
);


-- ───────────────────────────────── 15. SUGESTÕES ──
create table if not exists public.sugestoes (
  id         uuid        primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  autor_id   uuid        default auth.uid() references auth.users(id) on delete set null,
  autor_nome text,
  pagina     text,
  texto      text        not null check (char_length(trim(texto)) between 1 and 4000),
  lida       boolean     not null default false
);


-- ───────────────────────────────── 16. LISTA DE VENDEDORES (view) ──
-- Expõe só id, nome e ativo — para escolher vendedor sem revelar
-- comissão/e-mail/papel. A view roda com o dono (ignora o RLS de profiles).
create or replace view public.vendedores_lista as
  select id, nome, ativo from public.profiles;

grant select on public.vendedores_lista to authenticated;


-- ───────────────────────────────── 17. FUNÇÕES DE REGRA DE NEGÓCIO ──

-- Nº da Venda sem repetir, em filiais com numeração automática.
create or replace function public.vendas_numero_automatico()
returns trigger
language plpgsql security definer
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

-- "atualizado_em" para aviso de edição simultânea.
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

-- Nome comparável: maiúsculas, sem acento, espaços simples.
create or replace function public.nome_comparavel(t text)
returns text
language sql immutable
as $$
  select translate(upper(regexp_replace(trim(coalesce(t, '')), '\s+', ' ', 'g')),
                   'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC')
$$;

-- Atualização em lote dos boletos na importação.
create or replace function public.atualizar_boletos_importacao(p_boletos jsonb, p_filial uuid)
returns integer
language plpgsql security invoker
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
end $$;

grant execute on function public.atualizar_boletos_importacao(jsonb, uuid) to authenticated;

-- Marca nas vendas a data de emissão do boleto (confere pelo PAGADOR).
create or replace function public.atualizar_boletos_emitidos_vendas()
returns integer
language plpgsql security definer
set search_path = public
as $$
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
end $$;

grant execute on function public.atualizar_boletos_emitidos_vendas() to authenticated;


-- ───────────────────────────────── 18. ÍNDICES DE DESEMPENHO ──
create index if not exists idx_vendas_filial_data        on public.vendas (filial_id, data_venda);
create index if not exists idx_vendas_vendedor_data      on public.vendas (vendedor_id, data_venda);
create index if not exists idx_vendas_especialista       on public.vendas (especialista) where especialista is not null;
create index if not exists idx_vendas_observacoes_venda  on public.vendas_observacoes (venda_id);
create index if not exists idx_despesas_filial_pago      on public.despesas (filial_id, pago);
create index if not exists idx_despesas_pago_vencimento  on public.despesas (pago, data_vencimento);
create index if not exists idx_devedores_normalizado     on public.cobrancas_devedores (nome_normalizado);
create index if not exists idx_devedores_filial          on public.cobrancas_devedores (filial_id);
create index if not exists idx_devedores_ultima_atualizacao on public.cobrancas_devedores (ultima_atualizacao desc);
create index if not exists idx_devedores_audiencia       on public.cobrancas_devedores (data_audiencia);
create index if not exists idx_boletos_devedor           on public.cobrancas_boletos (devedor_id);
create index if not exists idx_boletos_nosso             on public.cobrancas_boletos (nosso_numero);
create index if not exists idx_boletos_vencimento        on public.cobrancas_boletos (data_vencimento);
create index if not exists idx_boletos_venda             on public.cobrancas_boletos (venda_id);
create index if not exists idx_boletos_filial            on public.cobrancas_boletos (filial_id);
create index if not exists idx_boletos_filial_em_aberto  on public.cobrancas_boletos (filial_id) where data_liquidacao is null;
create index if not exists idx_lembretes_devedor         on public.cobrancas_lembretes (devedor_id);
create index if not exists idx_lembretes_data            on public.cobrancas_lembretes (data);
create index if not exists idx_lembretes_pendentes       on public.cobrancas_lembretes (data) where concluido = false;
create index if not exists idx_captacao_vendedor         on public.captacao_clientes (vendedor_id);
create index if not exists idx_captacao_filial           on public.captacao_clientes (filial_id);
create index if not exists idx_captacao_data             on public.captacao_clientes (data_consulta);
create index if not exists idx_clientes_filial           on public.clientes (filial_id);
create index if not exists idx_agenda_periodo            on public.agenda (data_inicio, data_fim);
create index if not exists idx_agenda_filial             on public.agenda (filial_id);
create index if not exists idx_sugestoes_created         on public.sugestoes (created_at desc);


-- ───────────────────────────────── 19. SEGURANÇA (RLS) ──
alter table public.filiais               enable row level security;
alter table public.profiles              enable row level security;
alter table public.configuracoes         enable row level security;
alter table public.clientes              enable row level security;
alter table public.vendas                enable row level security;
alter table public.vendas_observacoes    enable row level security;
alter table public.despesas              enable row level security;
alter table public.cobrancas_devedores   enable row level security;
alter table public.cobrancas_boletos     enable row level security;
alter table public.cobrancas_lembretes   enable row level security;
alter table public.cobrancas_documentos  enable row level security;
alter table public.cobrancas_importacoes enable row level security;
alter table public.captacao_clientes     enable row level security;
alter table public.agenda                enable row level security;
alter table public.agenda_observacoes    enable row level security;
alter table public.sugestoes             enable row level security;

-- ── filiais ──
drop policy if exists "filiais_select" on public.filiais;
create policy "filiais_select" on public.filiais for select to authenticated using (true);
drop policy if exists "filiais_insert" on public.filiais;
create policy "filiais_insert" on public.filiais for insert to authenticated with check (public.is_admin());
drop policy if exists "filiais_update" on public.filiais;
create policy "filiais_update" on public.filiais for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "filiais_delete" on public.filiais;
create policy "filiais_delete" on public.filiais for delete to authenticated using (public.is_admin());

-- ── profiles ── (cada um vê o próprio; admin vê todos; só admin edita)
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── configuracoes ── (todos leem; só admin escreve)
drop policy if exists "configuracoes_select" on public.configuracoes;
create policy "configuracoes_select" on public.configuracoes for select to authenticated using (true);
drop policy if exists "configuracoes_admin_write" on public.configuracoes;
create policy "configuracoes_admin_write" on public.configuracoes for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── clientes ── (por filial; admin tudo; excluir só admin)
drop policy if exists "clientes_select" on public.clientes;
create policy "clientes_select" on public.clientes for select to authenticated using (filial_id = public.current_filial_id() or public.is_admin());
drop policy if exists "clientes_insert" on public.clientes;
create policy "clientes_insert" on public.clientes for insert to authenticated with check (filial_id = public.current_filial_id() or public.is_admin());
drop policy if exists "clientes_update" on public.clientes;
create policy "clientes_update" on public.clientes for update to authenticated using (filial_id = public.current_filial_id() or public.is_admin()) with check (filial_id = public.current_filial_id() or public.is_admin());
drop policy if exists "clientes_delete" on public.clientes;
create policy "clientes_delete" on public.clientes for delete to authenticated using (public.is_admin());

-- ── vendas ── (por filial; admin tudo)
drop policy if exists "vendas_select" on public.vendas;
create policy "vendas_select" on public.vendas for select to authenticated using (filial_id = public.current_filial_id() or public.is_admin());
drop policy if exists "vendas_insert" on public.vendas;
create policy "vendas_insert" on public.vendas for insert to authenticated with check (filial_id = public.current_filial_id() or public.is_admin());
drop policy if exists "vendas_update" on public.vendas;
create policy "vendas_update" on public.vendas for update to authenticated using (filial_id = public.current_filial_id() or public.is_admin()) with check (filial_id = public.current_filial_id() or public.is_admin());
drop policy if exists "vendas_delete" on public.vendas;
create policy "vendas_delete" on public.vendas for delete to authenticated using (filial_id = public.current_filial_id() or public.is_admin());

-- ── vendas_observacoes ── (por filial; admin tudo)
drop policy if exists "vendas_obs_select" on public.vendas_observacoes;
create policy "vendas_obs_select" on public.vendas_observacoes for select to authenticated using (filial_id = public.current_filial_id() or public.is_admin());
drop policy if exists "vendas_obs_insert" on public.vendas_observacoes;
create policy "vendas_obs_insert" on public.vendas_observacoes for insert to authenticated with check (filial_id = public.current_filial_id() or public.is_admin());
drop policy if exists "vendas_obs_update" on public.vendas_observacoes;
create policy "vendas_obs_update" on public.vendas_observacoes for update to authenticated using (filial_id = public.current_filial_id() or public.is_admin()) with check (filial_id = public.current_filial_id() or public.is_admin());
drop policy if exists "vendas_obs_delete" on public.vendas_observacoes;
create policy "vendas_obs_delete" on public.vendas_observacoes for delete to authenticated using (filial_id = public.current_filial_id() or public.is_admin());

-- ── despesas ── (gerencial: só admin)
drop policy if exists "despesas_select" on public.despesas;
create policy "despesas_select" on public.despesas for select to authenticated using (public.is_admin());
drop policy if exists "despesas_insert" on public.despesas;
create policy "despesas_insert" on public.despesas for insert to authenticated with check (public.is_admin());
drop policy if exists "despesas_update" on public.despesas;
create policy "despesas_update" on public.despesas for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "despesas_delete" on public.despesas;
create policy "despesas_delete" on public.despesas for delete to authenticated using (public.is_admin());

-- ── cobrancas_devedores ── (lê por filial; escreve só admin)
drop policy if exists "cobrancas_devedores_select" on public.cobrancas_devedores;
create policy "cobrancas_devedores_select" on public.cobrancas_devedores for select to authenticated using (filial_id = public.current_filial_id() or public.is_admin());
drop policy if exists "cobrancas_devedores_insert" on public.cobrancas_devedores;
create policy "cobrancas_devedores_insert" on public.cobrancas_devedores for insert to authenticated with check (public.is_admin());
drop policy if exists "cobrancas_devedores_update" on public.cobrancas_devedores;
create policy "cobrancas_devedores_update" on public.cobrancas_devedores for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "cobrancas_devedores_delete" on public.cobrancas_devedores;
create policy "cobrancas_devedores_delete" on public.cobrancas_devedores for delete to authenticated using (public.is_admin());

-- ── cobrancas_boletos ── (lê por filial; escreve só admin)
drop policy if exists "cobrancas_boletos_select" on public.cobrancas_boletos;
create policy "cobrancas_boletos_select" on public.cobrancas_boletos for select to authenticated using (filial_id = public.current_filial_id() or public.is_admin());
drop policy if exists "cobrancas_boletos_insert" on public.cobrancas_boletos;
create policy "cobrancas_boletos_insert" on public.cobrancas_boletos for insert to authenticated with check (public.is_admin());
drop policy if exists "cobrancas_boletos_update" on public.cobrancas_boletos;
create policy "cobrancas_boletos_update" on public.cobrancas_boletos for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "cobrancas_boletos_delete" on public.cobrancas_boletos;
create policy "cobrancas_boletos_delete" on public.cobrancas_boletos for delete to authenticated using (public.is_admin());

-- ── cobrancas_lembretes ── (por filial; excluir só admin)
drop policy if exists "lembretes_select" on public.cobrancas_lembretes;
create policy "lembretes_select" on public.cobrancas_lembretes for select to authenticated using (filial_id = public.current_filial_id() or public.is_admin());
drop policy if exists "lembretes_insert" on public.cobrancas_lembretes;
create policy "lembretes_insert" on public.cobrancas_lembretes for insert to authenticated with check (filial_id = public.current_filial_id() or public.is_admin());
drop policy if exists "lembretes_update" on public.cobrancas_lembretes;
create policy "lembretes_update" on public.cobrancas_lembretes for update to authenticated using (filial_id = public.current_filial_id() or public.is_admin()) with check (filial_id = public.current_filial_id() or public.is_admin());
drop policy if exists "lembretes_delete" on public.cobrancas_lembretes;
create policy "lembretes_delete" on public.cobrancas_lembretes for delete to authenticated using (public.is_admin());

-- ── cobrancas_documentos ── (todos veem/incluem; excluir só admin)
drop policy if exists "cobrancas_documentos_select" on public.cobrancas_documentos;
create policy "cobrancas_documentos_select" on public.cobrancas_documentos for select to authenticated using (true);
drop policy if exists "cobrancas_documentos_insert" on public.cobrancas_documentos;
create policy "cobrancas_documentos_insert" on public.cobrancas_documentos for insert to authenticated with check (true);
drop policy if exists "cobrancas_documentos_update" on public.cobrancas_documentos;
create policy "cobrancas_documentos_update" on public.cobrancas_documentos for update to authenticated using (true) with check (true);
drop policy if exists "cobrancas_documentos_delete" on public.cobrancas_documentos;
create policy "cobrancas_documentos_delete" on public.cobrancas_documentos for delete to authenticated using (public.is_admin());

-- ── cobrancas_importacoes ── (lê por filial; escreve só admin)
drop policy if exists "cobrancas_importacoes_select" on public.cobrancas_importacoes;
create policy "cobrancas_importacoes_select" on public.cobrancas_importacoes for select to authenticated using (filial_id = public.current_filial_id() or public.is_admin());
drop policy if exists "cobrancas_importacoes_insert" on public.cobrancas_importacoes;
create policy "cobrancas_importacoes_insert" on public.cobrancas_importacoes for insert to authenticated with check (public.is_admin());
drop policy if exists "cobrancas_importacoes_delete" on public.cobrancas_importacoes;
create policy "cobrancas_importacoes_delete" on public.cobrancas_importacoes for delete to authenticated using (public.is_admin());

-- ── captacao_clientes ── (por filial; admin tudo)
drop policy if exists "captacao_select" on public.captacao_clientes;
create policy "captacao_select" on public.captacao_clientes for select to authenticated using (filial_id = public.current_filial_id() or public.is_admin());
drop policy if exists "captacao_insert" on public.captacao_clientes;
create policy "captacao_insert" on public.captacao_clientes for insert to authenticated with check (filial_id = public.current_filial_id() or public.is_admin());
drop policy if exists "captacao_update" on public.captacao_clientes;
create policy "captacao_update" on public.captacao_clientes for update to authenticated using (filial_id = public.current_filial_id() or public.is_admin()) with check (filial_id = public.current_filial_id() or public.is_admin());
drop policy if exists "captacao_delete" on public.captacao_clientes;
create policy "captacao_delete" on public.captacao_clientes for delete to authenticated using (filial_id = public.current_filial_id() or public.is_admin());

-- ── agenda ── (todos leem/incluem; só admin altera/exclui)
drop policy if exists "agenda_ler" on public.agenda;
create policy "agenda_ler" on public.agenda for select to authenticated using (true);
drop policy if exists "agenda_inserir" on public.agenda;
create policy "agenda_inserir" on public.agenda for insert to authenticated with check (autor_id = auth.uid());
drop policy if exists "agenda_admin_alterar" on public.agenda;
create policy "agenda_admin_alterar" on public.agenda for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "agenda_admin_excluir" on public.agenda;
create policy "agenda_admin_excluir" on public.agenda for delete to authenticated using (public.is_admin());

-- ── agenda_observacoes ── (todos leem/escrevem; só admin exclui)
drop policy if exists "agenda_obs_ler" on public.agenda_observacoes;
create policy "agenda_obs_ler" on public.agenda_observacoes for select to authenticated using (true);
drop policy if exists "agenda_obs_inserir" on public.agenda_observacoes;
create policy "agenda_obs_inserir" on public.agenda_observacoes for insert to authenticated with check (true);
drop policy if exists "agenda_obs_alterar" on public.agenda_observacoes;
create policy "agenda_obs_alterar" on public.agenda_observacoes for update to authenticated using (true) with check (true);
drop policy if exists "agenda_obs_admin_excluir" on public.agenda_observacoes;
create policy "agenda_obs_admin_excluir" on public.agenda_observacoes for delete to authenticated using (public.is_admin());

-- ── sugestoes ── (qualquer um envia; só admin lê/gerencia)
drop policy if exists "sugestoes_inserir" on public.sugestoes;
create policy "sugestoes_inserir" on public.sugestoes for insert to authenticated with check (autor_id = auth.uid());
drop policy if exists "sugestoes_admin_ler" on public.sugestoes;
create policy "sugestoes_admin_ler" on public.sugestoes for select to authenticated using (public.is_admin());
drop policy if exists "sugestoes_admin_alterar" on public.sugestoes;
create policy "sugestoes_admin_alterar" on public.sugestoes for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "sugestoes_admin_excluir" on public.sugestoes;
create policy "sugestoes_admin_excluir" on public.sugestoes for delete to authenticated using (public.is_admin());

grant select, insert, update, delete on
  public.filiais, public.clientes, public.vendas, public.vendas_observacoes,
  public.despesas, public.cobrancas_devedores, public.cobrancas_boletos,
  public.cobrancas_lembretes, public.cobrancas_documentos, public.cobrancas_importacoes,
  public.captacao_clientes, public.agenda, public.agenda_observacoes, public.sugestoes,
  public.configuracoes, public.profiles
  to authenticated;


-- ───────────────────────────────── 20. BALDE DE ARQUIVOS (Storage) ──
-- Balde privado onde ficam os documentos anexados na Cobrança.
insert into storage.buckets (id, name, public)
  values ('cobrancas-documentos', 'cobrancas-documentos', false)
  on conflict (id) do nothing;

-- Todos os usuários podem ver e enviar; só admin exclui.
drop policy if exists "cobrancas_docs_bucket_select" on storage.objects;
create policy "cobrancas_docs_bucket_select" on storage.objects
  for select to authenticated using (bucket_id = 'cobrancas-documentos');
drop policy if exists "cobrancas_docs_bucket_insert" on storage.objects;
create policy "cobrancas_docs_bucket_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'cobrancas-documentos');
drop policy if exists "cobrancas_docs_bucket_delete" on storage.objects;
create policy "cobrancas_docs_bucket_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'cobrancas-documentos' and public.is_admin());


-- ───────────────────────────────── 21. DADOS INICIAIS (configurações) ──
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


-- ═══════════════════════════════════════════════════════════════════
--  PASSO MANUAL (rode DEPOIS de criar seu usuário no app):
--  torne o seu e-mail administrador. Tire o "--" das 3 linhas e troque
--  o e-mail pelo seu.
-- ═══════════════════════════════════════════════════════════════════
-- update public.profiles
--   set papel = 'admin'
--   where email = 'seu@email.com';


-- ───────────────────────────────── 22. VERIFICAÇÃO FINAL ──
-- Deve listar uma linha por tabela, com a quantidade de políticas (RLS)
-- e se o RLS está ligado.
select
  t.tablename                               as tabela,
  t.rowsecurity                             as rls_ligado,
  count(p.policyname)                        as qtd_politicas
from pg_tables t
left join pg_policies p
  on p.schemaname = t.schemaname and p.tablename = t.tablename
where t.schemaname = 'public'
  and t.tablename in (
    'filiais','profiles','configuracoes','clientes','vendas','vendas_observacoes',
    'despesas','cobrancas_devedores','cobrancas_boletos','cobrancas_lembretes',
    'cobrancas_documentos','cobrancas_importacoes','captacao_clientes',
    'agenda','agenda_observacoes','sugestoes'
  )
group by t.tablename, t.rowsecurity
order by t.tablename;
