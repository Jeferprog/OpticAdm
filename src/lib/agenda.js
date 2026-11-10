export const TIPOS_AGENDA = {
  acao:     { titulo: 'Ações',     singular: 'ação',     icone: 'campaign', cor: '#2a78d6', fundo: '#e8f1fc' },
  promocao: { titulo: 'Promoções', singular: 'promoção', icone: 'sell',     cor: '#c0272d', fundo: '#fdecec' },
}

export function hojeISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function fmtData(iso) {
  const [a, m, d] = String(iso || '').slice(0, 10).split('-')
  return a ? `${d}/${m}/${a}` : ''
}

export function textoPeriodo(item) {
  return item.data_inicio === item.data_fim
    ? fmtData(item.data_inicio)
    : `${fmtData(item.data_inicio)} a ${fmtData(item.data_fim)}`
}

export function situacaoAgenda(item, hoje = hojeISO()) {
  if (item.data_fim < hoje) return 'encerrada'
  if (item.data_inicio > hoje) return 'programada'
  return 'andamento'
}
