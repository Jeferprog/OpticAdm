// Indicadores compartilhados entre o Dashboard e a tela de Gráficos.

export function semAcentoUp(t) { return String(t || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') }

// Situações do banco tratadas como quitadas (liquidado, baixa por solicitação, rejeitado).
export function situacaoBaixa(situacao) {
  const s = semAcentoUp(situacao)
  if (s.includes('LIQUIDAD') && !s.includes('NAO LIQUIDAD')) return true
  return s.includes('BAIXADO POR SOLICITACAO') || s.includes('REJEITADO')
}
// Mesma regra da aba Cobranças.
export function boletoQuitado(b) {
  return !!b.data_liquidacao || b.situacao_atual === 'Liquidada'
    || situacaoBaixa(b.situacao_boleto) || situacaoBaixa(b.situacao_atual)
}

/* ── Vendas por forma de pagamento ──
   Grupos: Dinheiro e Pix · Cartão · Crediário MultiCrédito · Crediário próprio.
   Em vendas com entrada, a ENTRADA vai para a forma em que foi paga
   (dinheiro, pix ou cartão) e o RESTANTE vai para a modalidade da venda. */
export function grupoDaForma(txt) {
  const t = semAcentoUp(txt)
  if (!t) return null
  if (t.includes('MULTICRED')) return 'mc'
  if (t.includes('CREDIARIO') || t.includes('BOLETO')) return 'cred'
  if (t.includes('CART')) return 'cartao'
  if (t.includes('PIX')) return 'pix'
  if (t.includes('DINHEIRO') || t.includes('VISTA')) return 'dinheiro'
  return null
}
const GRUPO_MODALIDADE = {
  cartao_credito: 'cartao', cartao_debito: 'cartao', cartao: 'cartao',
  boleto_multicredito: 'mc', boleto_multicredito_sem: 'mc',
  crediario: 'cred', crediario_entrada: 'cred', boleto: 'cred',
}
export function somarFormas(vendas) {
  const r = { dinheiro: 0, pix: 0, cartao: 0, mc: 0, cred: 0, outros: 0 }
  const add = (g, v) => { r[g || 'outros'] += v }
  ;(vendas || []).forEach(v => {
    const total = Number(v.valor_final) || 0
    const m = v.pagamento_modalidade
    if (!m) { add(grupoDaForma(v.forma_pagamento), total); return }            // vendas antigas
    if (m === 'avista') { add(grupoDaForma(v.pagamento_entrada) || 'dinheiro', total); return }
    const entrada = Math.min(Math.max(Number(v.entrada_valor) || 0, 0), total)
    if (entrada > 0) add(grupoDaForma(v.pagamento_entrada) || 'dinheiro', entrada)
    add(GRUPO_MODALIDADE[m] || grupoDaForma(v.forma_pagamento), total - entrada)
  })
  return r
}

