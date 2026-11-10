-- ═══════════════════════════════════════════════════════════════════
--  COBRANÇAS — MIGRAÇÃO (tabelas já existiam no banco)
--  Execute no SQL Editor do Supabase se cobrancas.sql der erro.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Adicionar colunas que podem não existir em cobrancas_devedores ──
ALTER TABLE public.cobrancas_devedores
  ADD COLUMN IF NOT EXISTS nome_normalizado   text,
  ADD COLUMN IF NOT EXISTS status_cobranca    text    DEFAULT 'Novo',
  ADD COLUMN IF NOT EXISTS primeiro_registro  date,
  ADD COLUMN IF NOT EXISTS ultima_atualizacao date,
  ADD COLUMN IF NOT EXISTS pequenas_causas    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_audiencia     date,
  ADD COLUMN IF NOT EXISTS situacao_audiencia text,
  ADD COLUMN IF NOT EXISTS observacoes        text;

-- ── 2. Preencher nome_normalizado para registros existentes ──
UPDATE public.cobrancas_devedores
  SET nome_normalizado = upper(trim(regexp_replace(nome_pagador, '\s+', ' ', 'g')))
  WHERE nome_normalizado IS NULL OR nome_normalizado = '';

-- ── 3. Tornar NOT NULL depois de preencher ──
ALTER TABLE public.cobrancas_devedores
  ALTER COLUMN nome_normalizado SET NOT NULL;

-- ── 4. Unique constraint em nome_normalizado ──
ALTER TABLE public.cobrancas_devedores
  DROP CONSTRAINT IF EXISTS cobrancas_devedores_nome_normalizado_key;
ALTER TABLE public.cobrancas_devedores
  ADD CONSTRAINT cobrancas_devedores_nome_normalizado_key UNIQUE (nome_normalizado);

-- ── 5. Criar tabela de boletos se não existir ──
CREATE TABLE IF NOT EXISTS public.cobrancas_boletos (
  id               uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  devedor_id       uuid    REFERENCES public.cobrancas_devedores(id) ON DELETE CASCADE,
  carteira         text,
  numero_doc       text,
  nosso_numero     text,
  txid             text,
  data_vencimento  date,
  data_liquidacao  date,
  valor            numeric(12,2),
  valor_liquidacao numeric(12,2),
  situacao_boleto  text,
  motivo           text,
  created_at       timestamptz DEFAULT now()
);

-- unique em nosso_numero (permite vários NULL — PostgreSQL aceita isso)
ALTER TABLE public.cobrancas_boletos
  DROP CONSTRAINT IF EXISTS cobrancas_boletos_nosso_numero_key;
ALTER TABLE public.cobrancas_boletos
  ADD CONSTRAINT cobrancas_boletos_nosso_numero_key UNIQUE (nosso_numero);

-- ── 6. Índices ──
CREATE INDEX IF NOT EXISTS idx_cobrancas_devedores_normalizado
  ON public.cobrancas_devedores (nome_normalizado);
CREATE INDEX IF NOT EXISTS idx_cobrancas_boletos_devedor
  ON public.cobrancas_boletos (devedor_id);
CREATE INDEX IF NOT EXISTS idx_cobrancas_boletos_nosso
  ON public.cobrancas_boletos (nosso_numero);

-- ── 7. RLS — habilitar ──
ALTER TABLE public.cobrancas_devedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cobrancas_boletos    ENABLE ROW LEVEL SECURITY;

-- ── cobrancas_devedores ──────────────────────────────────────────
DROP POLICY IF EXISTS "cobrancas_devedores_select" ON public.cobrancas_devedores;
CREATE POLICY "cobrancas_devedores_select" ON public.cobrancas_devedores
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "cobrancas_devedores_insert" ON public.cobrancas_devedores;
CREATE POLICY "cobrancas_devedores_insert" ON public.cobrancas_devedores
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "cobrancas_devedores_update" ON public.cobrancas_devedores;
CREATE POLICY "cobrancas_devedores_update" ON public.cobrancas_devedores
  FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "cobrancas_devedores_delete" ON public.cobrancas_devedores;
CREATE POLICY "cobrancas_devedores_delete" ON public.cobrancas_devedores
  FOR DELETE TO authenticated USING (public.is_admin());

-- ── cobrancas_boletos ────────────────────────────────────────────
DROP POLICY IF EXISTS "cobrancas_boletos_select" ON public.cobrancas_boletos;
CREATE POLICY "cobrancas_boletos_select" ON public.cobrancas_boletos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "cobrancas_boletos_insert" ON public.cobrancas_boletos;
CREATE POLICY "cobrancas_boletos_insert" ON public.cobrancas_boletos
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "cobrancas_boletos_update" ON public.cobrancas_boletos;
CREATE POLICY "cobrancas_boletos_update" ON public.cobrancas_boletos
  FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "cobrancas_boletos_delete" ON public.cobrancas_boletos;
CREATE POLICY "cobrancas_boletos_delete" ON public.cobrancas_boletos
  FOR DELETE TO authenticated USING (public.is_admin());
