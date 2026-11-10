// Busca TODAS as linhas de uma consulta, em páginas.
//
// O Supabase devolve no máximo 1.000 linhas por consulta e corta o resto
// sem avisar. Este utilitário pede página por página até acabar.
//
// Uso: recebe uma FUNÇÃO que monta a consulta (precisa ser nova a cada
// página), e devolve { data, error } — igual a uma consulta normal.
//
//   const { data, error } = await buscarTodos(() =>
//     supabase.from('clientes').select('*').order('nome'))
//
// A consulta deve ter um .order() para a paginação ser estável; se não
// tiver, ordenamos por "id".
const TAM_PAGINA = 1000

export async function buscarTodos(montarConsulta, { ordenarPorId = false } = {}) {
  const todos = []
  for (let de = 0; ; de += TAM_PAGINA) {
    let q = montarConsulta()
    if (ordenarPorId) q = q.order('id', { ascending: true })
    const { data, error } = await q.range(de, de + TAM_PAGINA - 1)
    if (error) return { data: todos.length ? todos : null, error }
    if (data?.length) todos.push(...data)
    if (!data || data.length < TAM_PAGINA) break
  }
  return { data: todos, error: null }
}
