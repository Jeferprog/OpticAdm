-- ═══════════════════════════════════════════════════════════════════
--  VENDAS · "Boleto emitido em" (vem da importação do arquivo do banco)
--  Mercadão dos Óculos
--
--  1) cobrancas_boletos.data_emissao → data de emissão que vem no
--     arquivo do banco (coluna "Emissão", quando o arquivo tiver).
--  2) vendas.boleto_emitido_em → data em que o boleto da venda foi
--     emitido no banco. Fica em branco se ainda não foi emitido.
--  3) Função que liga cada venda parcelada (boleto/crediário) aos
--     boletos do banco pelo NOME (pagador ou cliente) + VALOR da
--     parcela, com vencimento a partir da data da venda. Roda ao fim
--     de cada importação.
--     Data usada: a emissão do arquivo; se o arquivo não trouxer essa
--     coluna, a data em que o boleto apareceu pela 1ª vez na importação.
--
--  Seguro/idempotente.
-- ═══════════════════════════════════════════════════════════════════

alter table public.cobrancas_boletos add column if not exists data_emissao date;
alter table public.vendas            add column if not exists boleto_emitido_em date;

-- Importação em lote passa a gravar também a data de emissão.
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

-- Nome comparável: maiúsculas, sem acento, espaços simples.
create or replace function public.nome_comparavel(t text)
returns text
language sql
immutable
as $$
  select translate(upper(regexp_replace(trim(coalesce(t, '')), '\s+', ' ', 'g')),
                   'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC')
$$;

-- Marca nas vendas a data de emissão do boleto no banco.
create or replace function public.atualizar_boletos_emitidos_vendas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  with v as (
    select v.id, v.data_venda::date as dv, v.pagamento_modalidade as m, v.parcelas,
           public.nome_comparavel(coalesce(nullif(v.pagador, ''), v.nome_cliente)) as nome_pag,
           public.nome_comparavel(v.nome_cliente) as nome_cli
      from public.vendas v
     where v.pagamento_modalidade in ('boleto','boleto_multicredito','boleto_multicredito_sem','crediario_entrada','crediario')
       and v.parcelas is not null
       and coalesce(v.efetivada, true)
  ),
  p as (
    -- parcelas que viram boleto (a entrada é paga na loja)
    select v.*, (x->>'valor')::numeric as pv, (x->>'n')::int as n
      from v, jsonb_array_elements(v.parcelas) x
     where not ((x->>'n')::int = 1 and v.m in ('boleto','boleto_multicredito','crediario_entrada'))
  ),
  devs as (
    select d.id, public.nome_comparavel(d.nome_pagador) as nome from public.cobrancas_devedores d
  ),
  achados as (
    select p.id, min(coalesce(b.data_emissao, b.created_at::date)) as emitido
      from p
      join devs d on d.nome in (p.nome_pag, p.nome_cli)
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

-- Preenche agora com o que já foi importado.
select public.atualizar_boletos_emitidos_vendas() as vendas_marcadas;
