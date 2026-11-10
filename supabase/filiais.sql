-- =============================================================
-- FILIAIS — estrutura de sucursais para o Mercadão dos Óculos
-- Execute este script no SQL Editor do Supabase
-- =============================================================

-- 1. Tabela de filiais
CREATE TABLE IF NOT EXISTS public.filiais (
  id               uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  nome             text    NOT NULL,
  os_numero_inicial integer NOT NULL DEFAULT 1,
  created_at       timestamptz DEFAULT now()
);

-- 2. RLS na tabela filiais
ALTER TABLE public.filiais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "filiais_select"
  ON public.filiais FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "filiais_insert"
  ON public.filiais FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "filiais_update"
  ON public.filiais FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "filiais_delete"
  ON public.filiais FOR DELETE
  TO authenticated USING (public.is_admin());

-- 3. Adicionar filial_id aos profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS filial_id uuid REFERENCES public.filiais(id);

-- 4. Adicionar colunas à tabela vendas
ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS filial_id  uuid REFERENCES public.filiais(id);

ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS tipo_venda text NOT NULL DEFAULT 'Grau';

-- Tornar os_numero opcional (apenas Grau gera OS)
ALTER TABLE public.vendas
  ALTER COLUMN os_numero DROP NOT NULL;

-- Remover constraint global única de os_numero (se existir)
ALTER TABLE public.vendas
  DROP CONSTRAINT IF EXISTS vendas_os_numero_key;

-- Índice único por filial + os_numero (ignora NULL)
CREATE UNIQUE INDEX IF NOT EXISTS vendas_filial_os_unique
  ON public.vendas (filial_id, os_numero)
  WHERE os_numero IS NOT NULL;

-- 5. Adicionar filial_id à tabela despesas
ALTER TABLE public.despesas
  ADD COLUMN IF NOT EXISTS filial_id uuid REFERENCES public.filiais(id);

-- 6. Adicionar filial_id a cobranças
ALTER TABLE public.cobrancas_devedores
  ADD COLUMN IF NOT EXISTS filial_id uuid REFERENCES public.filiais(id);

ALTER TABLE public.cobrancas_boletos
  ADD COLUMN IF NOT EXISTS filial_id uuid REFERENCES public.filiais(id);

-- Remover constraint global única de nosso_numero (se existir)
ALTER TABLE public.cobrancas_boletos
  DROP CONSTRAINT IF EXISTS cobrancas_boletos_nosso_numero_key;

-- Índice único por filial + nosso_numero (ignora NULL)
CREATE UNIQUE INDEX IF NOT EXISTS boletos_filial_nossonumero_unique
  ON public.cobrancas_boletos (filial_id, nosso_numero)
  WHERE nosso_numero IS NOT NULL;
