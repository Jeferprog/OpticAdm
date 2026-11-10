import { createClient } from '@supabase/supabase-js'

// Conexão com o projeto Supabase do OpticAdm — FIXA no código, de propósito.
// Assim a conexão não depende de secrets no build (que podem ficar com valor
// trocado e apontar o app para o lugar errado). A chave "anon public" é feita
// para ficar no app: o acesso aos dados é protegido pelo RLS no banco, e ela
// já fica visível no site publicado de qualquer forma.
const supabaseUrl = 'https://vwphnndyusfcgudyujsr.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3cGhubmR5dXNmY2d1ZHl1anNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0Mzk4NjEsImV4cCI6MjEwODAxNTg2MX0.FoyY3AXUEI2i4Fzi18SogD2rLCBIJ2CzCQuXVvNLuoY'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Cliente isolado, sem persistir sessão, usado apenas para CRIAR usuários.
// Assim o cadastro de um novo vendedor não substitui (nem desloga) a
// sessão do administrador que está logado na aba.
export function createSignupClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
