-- ═══════════════════════════════════════════════════════════════════
--  ATUALIZAÇÕES — Execute no SQL Editor do Supabase
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Coluna nome_cliente na tabela vendas ──
ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS nome_cliente text;

-- ── 2. Coluna telefone em cobrancas_devedores ──
ALTER TABLE public.cobrancas_devedores
  ADD COLUMN IF NOT EXISTS telefone text;

-- ── 3. Tabela de clientes ──
CREATE TABLE IF NOT EXISTS public.clientes (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  nome       text,
  cpf        text,
  telefone   text,
  endereco   text,
  created_at timestamptz DEFAULT now()
);

-- ── 4. RLS para clientes ──
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clientes_select" ON public.clientes;
CREATE POLICY "clientes_select" ON public.clientes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "clientes_insert" ON public.clientes;
CREATE POLICY "clientes_insert" ON public.clientes
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "clientes_update" ON public.clientes;
CREATE POLICY "clientes_update" ON public.clientes
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "clientes_delete" ON public.clientes;
CREATE POLICY "clientes_delete" ON public.clientes
  FOR DELETE TO authenticated USING (public.is_admin());
