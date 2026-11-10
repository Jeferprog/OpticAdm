import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('⚠️  Variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY não configuradas no arquivo .env')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Cliente isolado, sem persistir sessão, usado apenas para CRIAR usuários.
// Assim o cadastro de um novo vendedor não substitui (nem desloga) a
// sessão do administrador que está logado na aba.
export function createSignupClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
