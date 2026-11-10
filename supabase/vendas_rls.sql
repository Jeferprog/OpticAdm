-- Atualização das políticas RLS da tabela vendas
-- Execute este script no SQL Editor do Supabase

-- Remove política antiga (permissiva demais)
DROP POLICY IF EXISTS "vendas_authenticated" ON public.vendas;

-- SELECT: todos os autenticados podem ver todas as vendas
CREATE POLICY "vendas_select" ON public.vendas
  FOR SELECT TO authenticated
  USING (true);

-- INSERT: vendedor só pode inserir com seu próprio ID; admin pode inserir qualquer
CREATE POLICY "vendas_insert" ON public.vendas
  FOR INSERT TO authenticated
  WITH CHECK (vendedor_id = auth.uid() OR public.is_admin());

-- UPDATE: vendedor edita só as próprias; admin edita todas
CREATE POLICY "vendas_update" ON public.vendas
  FOR UPDATE TO authenticated
  USING (vendedor_id = auth.uid() OR public.is_admin())
  WITH CHECK (vendedor_id = auth.uid() OR public.is_admin());

-- DELETE: vendedor exclui só as próprias; admin exclui todas
CREATE POLICY "vendas_delete" ON public.vendas
  FOR DELETE TO authenticated
  USING (vendedor_id = auth.uid() OR public.is_admin());
