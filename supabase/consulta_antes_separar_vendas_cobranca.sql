-- ═══════════════════════════════════════════════════════════════════
--  CONSULTA (só leitura) — o que o separar_vendas_cobranca.sql vai REMOVER
--  Mercadão dos Óculos
--
--  Esta consulta NÃO altera nada. Só lista:
--    • PARCELA  → parcelas criadas pela aba Vendas (sem nosso número)
--                 que sairão da aba Cobrança;
--    • DEVEDOR  → devedores que ficarão vazios e sairão da Cobrança.
--
--  Supabase → SQL Editor → New query → cole tudo → RUN.
--  Dica: o resultado pode ser baixado em CSV (botão "Download/Export").
-- ═══════════════════════════════════════════════════════════════════

with parcelas_sair as (
  select b.*
    from public.cobrancas_boletos b
   where b.venda_id is not null
     and b.nosso_numero is null
),
devedores_sair as (
  select d.*
    from public.cobrancas_devedores d
   -- sobra algum boleto depois da limpeza? (do banco ou lançado à mão)
   where not exists (
           select 1 from public.cobrancas_boletos b
            where b.devedor_id = d.id
              and not (b.venda_id is not null and b.nosso_numero is null)
         )
     and not exists (select 1 from public.cobrancas_lembretes  l where l.devedor_id = d.id)
     and not exists (select 1 from public.cobrancas_documentos x where x.devedor_id = d.id)
)
select
  'PARCELA'                                     as tipo,
  d.nome_pagador                                as devedor,
  v.os_numero::text                             as numero_venda,
  v.nome_cliente                                as cliente_venda,
  to_char(v.data_venda::date, 'DD/MM/YYYY')       as data_venda,
  p.numero_doc                                  as parcela,
  to_char(p.data_vencimento, 'DD/MM/YYYY')      as vencimento,
  p.valor                                       as valor,
  case when p.data_liquidacao is not null or p.situacao_atual = 'Liquidada'
       then 'Paga' else 'Em aberto' end         as situacao
from parcelas_sair p
left join public.cobrancas_devedores d on d.id = p.devedor_id
left join public.vendas v              on v.id = p.venda_id

union all

select
  'DEVEDOR', ds.nome_pagador, null, null, null, null, null,
  (select coalesce(sum(p.valor), 0) from parcelas_sair p where p.devedor_id = ds.id),
  (select count(*) from parcelas_sair p where p.devedor_id = ds.id)::text || ' parcela(s) de venda'
from devedores_sair ds

order by 1 desc, 2, 3, 6;
