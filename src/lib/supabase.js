import { createClient } from '@supabase/supabase-js'

// Projeto Supabase do OpticAdm.
// A chave "anon public" é feita para ficar no app: o acesso aos dados é
// protegido pelo RLS no banco, e ela já fica visível no site publicado.
// Por isso fica aqui como padrão. Se os secrets VITE_SUPABASE_* existirem
// no build, eles têm prioridade (continuam funcionando normalmente).
const SUPABASE_URL_PADRAO = 'https://vwphnndyusfcgudyujsr.supabase.co'
const SUPABASE_ANON_PADRAO = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3cGhubmR5dXNmY2d1ZHl1anNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0Mzk4NjEsImV4cCI6MjEwODAxNTg2MX0.FoyY3AXUEI2i4Fzi18SogD2rLCBIJ2CzCQuXVvNLuoY'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || SUPABASE_URL_PADRAO
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || SUPABASE_ANON_PADRAO

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Cliente isolado, sem persistir sessão, usado apenas para CRIAR usuários.
// Assim o cadastro de um novo vendedor não substitui (nem desloga) a
// sessão do administrador que está logado na aba.
export function createSignupClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
