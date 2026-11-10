-- ═══════════════════════════════════════════════════════════════════
--  VENDAS · "Boleto emitido em" conferido SOMENTE pelo PAGADOR
--  Mercadão dos Óculos
--
--  O arquivo do banco traz o nome de quem paga o boleto (pagador), que
--  pode ser diferente do cliente que comprou. A partir de agora a venda
--  só é marcada como "Boleto emitido" quando existe boleto no nome do
--  PAGADOR da venda (+ valor da parcela + vencimento após a venda).
--  Se a venda não tiver pagador preenchido, vale o nome do cliente.
--
--  Atenção: ao final, recalcula a marcação de todas as vendas. Rode
--  antes a consulta_boleto_emitido_pelo_pagador.sql para ver o que muda.
--  Seguro/idempotente.
-- ═══════════════════════════════════════════════════════════════════

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
           public.nome_comparavel(coalesce(nullif(trim(v.pagador), ''), v.nome_cliente)) as nome_pag
      from public.vendas v
     where v.pagamento_modalidade in ('boleto','boleto_multicredito','boleto_multicredito_sem','crediario_entrada','crediario')
       and v.parcelas is not null
       and coalesce(v.efetivada, true)
  ),
  p as (
    -- parcelas que viram boleto (a entrada é paga na loja)
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

-- Recalcula agora.
select public.atualizar_boletos_emitidos_vendas() as vendas_alteradas;
