-- ═══════════════════════════════════════════════════════════════════
--  CONFIGURAÇÕES  ·  Parcelamento e Juros
--  Mercadão dos Óculos
--
--  Cria as chaves de configuração usadas pelo cálculo de parcelas:
--   • parcelas_sem_juros     → até quantas parcelas sem juros (padrão 3)
--   • juros_parcela_percent  → juros ao mês (%) acima do limite (padrão 0)
--
--  Padrão seguro: juros = 0 (não cobra até você definir a sua taxa em
--  Configurações → Sistema → Parcelamento e Juros).
--
--  Seguro/idempotente. Supabase → SQL Editor → RUN.
-- ═══════════════════════════════════════════════════════════════════

insert into public.configuracoes (chave, valor, descricao) values
  ('parcelas_sem_juros',    '3', 'Número máximo de parcelas sem juros'),
  ('juros_parcela_percent', '0', 'Juros ao mês (%) aplicado acima do limite sem juros')
on conflict (chave) do nothing;

select chave, valor from public.configuracoes
where chave in ('parcelas_sem_juros', 'juros_parcela_percent');
