-- ═══════════════════════════════════════════════════════════════════
--  CONSULTA (só leitura) — o que muda ao conferir "Boleto emitido"
--  SOMENTE pelo nome do PAGADOR
--  Mercadão dos Óculos
--
--  Esta consulta NÃO altera nada. Lista as vendas cuja marcação vai
--  mudar quando a conferência deixar de aceitar o nome do cliente:
--    • PERDE  → hoje está "Boleto emitido", mas o boleto achado é no
--               nome do cliente, não do pagador → passa a "Sem boleto";
--    • GANHA / MUDA → casos em que a data muda.
--
--  Supabase → SQL Editor → New query → cole tudo → RUN.
-- ═══════════════════════════════════════════════════════════════════

with v as (
  select v.id, v.os_numero, v.nome_cliente, v.pagador, v.boleto_emitido_em as atual,
         v.data_venda::date as dv, v.pagamento_modalidade as m, v.parcelas,
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
)
select case when a.emitido is null then 'PERDE'
            when v.atual is null   then 'GANHA'
            else 'MUDA' end                         as mudanca,
       v.os_numero                                  as numero_venda,
       to_char(v.dv, 'DD/MM/YYYY')                  as data_venda,
       v.nome_cliente                               as cliente,
       coalesce(nullif(trim(v.pagador), ''), v.nome_cliente) as pagador,
       to_char(v.atual, 'DD/MM/YYYY')               as emitido_hoje,
       to_char(a.emitido, 'DD/MM/YYYY')             as emitido_depois
  from v left join achados a on a.id = v.id
 where v.atual is distinct from a.emitido
 order by 1, v.dv;
