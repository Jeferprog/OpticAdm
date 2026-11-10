-- ═══════════════════════════════════════════════════════════════════
--  COBRANÇAS  ·  Limpar boletos duplicados (mesmo "nosso número")
--  Mercadão dos Óculos
--
--  Alguns boletos apareceram duplicados na aba Cobranças: o mesmo boleto
--  (mesmo nosso número) importado antes SEM filial e depois COM filial
--  virou dois registros, porque a regra de unicidade estava por
--  (filial + nosso número) em vez de só pelo nosso número.
--
--  Este script:
--   1) Apaga os boletos repetidos, mantendo UM por nosso número
--      (preferindo o liquidado, depois o que tem filial, depois a
--       situação atual preenchida, depois o mais recente).
--   2) Corrige a regra: passa a ser único pelo NOSSO NÚMERO.
--
--  Seguro/idempotente. Boletos SEM nosso número (ex.: parcelas de vendas)
--  não são afetados. Supabase → SQL Editor → New query → cole tudo → RUN.
-- ═══════════════════════════════════════════════════════════════════

-- 1) Remove os duplicados, mantendo o "melhor" de cada nosso número.
with ranked as (
  select id,
    row_number() over (
      partition by nosso_numero
      order by
        (data_liquidacao is not null) desc,
        (situacao_atual is not null and situacao_atual <> situacao_boleto) desc,
        (filial_id is not null) desc,
        (situacao_atual is not null) desc,
        id desc
    ) as rn
  from public.cobrancas_boletos
  where nosso_numero is not null and nosso_numero <> ''
)
delete from public.cobrancas_boletos b
using ranked r
where b.id = r.id and r.rn > 1;

-- 2) Regra de unicidade correta: um "nosso número" por boleto.
alter table public.cobrancas_boletos
  drop constraint if exists boletos_filial_nossonumero_unique;
alter table public.cobrancas_boletos
  drop constraint if exists cobrancas_boletos_nosso_numero_key;
alter table public.cobrancas_boletos
  add constraint cobrancas_boletos_nosso_numero_key unique (nosso_numero);

-- ── Verificação: não deve retornar nenhuma linha ──
select nosso_numero, count(*)
from public.cobrancas_boletos
where nosso_numero is not null and nosso_numero <> ''
group by nosso_numero
having count(*) > 1;
