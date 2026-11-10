// Registro leve de erros no navegador.
// Sem serviço externo: guarda os últimos erros no console e no localStorage,
// para ajudar a diagnosticar um problema em produção.

const CHAVE = 'mo_erros'
const MAX = 30

export function logErro(contexto, erro) {
  const detalhe = erro?.message || String(erro || 'erro desconhecido')
  // Sempre no console do navegador (F12 → Console).
  console.error(`[Mercadão] ${contexto}:`, erro)
  // E num histórico curto no próprio navegador.
  try {
    const lista = JSON.parse(localStorage.getItem(CHAVE) || '[]')
    lista.unshift({ quando: new Date().toISOString(), contexto, detalhe })
    localStorage.setItem(CHAVE, JSON.stringify(lista.slice(0, MAX)))
  } catch {
    /* localStorage indisponível (aba anônima, etc.) — ignora */
  }
}

// Lê o histórico de erros (para conferência/diagnóstico).
export function lerErros() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) || '[]')
  } catch {
    return []
  }
}
