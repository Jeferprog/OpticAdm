import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { buscarTodos } from '../lib/paginar'
import { logErro } from '../lib/erros'
import { somarFormas, boletoQuitado } from '../lib/indicadores'
import { C, F } from '../lib/ds'
import { CartaoGrafico, GraficoColunas, GraficoBarrasH, SERIE, RAMPA_ORDINAL, fBRL } from '../components/Graficos'
import AbasDashboard from '../components/AbasDashboard'

const todos = montar => buscarTodos(montar, { ordenarPorId: true })
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MESES_LONGOS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function isoLocal(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const chaveMes = iso => String(iso || '').slice(0, 7)

// Lista de meses do período (do mais antigo ao atual).
function mesesDoPeriodo(preset) {
  const hoje = new Date()
  const qtd = preset === '12m' ? 12 : preset === 'ano' ? hoje.getMonth() + 1 : 6
  const out = []
  for (let k = qtd - 1; k >= 0; k--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - k, 1)
    const multiAno = preset === '12m'
    out.push({
      chave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      rotulo: multiAno ? `${MESES_CURTOS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}` : MESES_CURTOS[d.getMonth()],
      rotuloLongo: `${MESES_LONGOS[d.getMonth()]} de ${d.getFullYear()}`,
    })
  }
  return out
}

const FORMAS = [
  { key: 'din',    label: 'Dinheiro e Pix',          cor: SERIE[0] },
  { key: 'cartao', label: 'Cartão',                  cor: SERIE[1] },
  { key: 'mc',     label: 'Crediário MultiCrédito',  cor: SERIE[2] },
  { key: 'cred',   label: 'Crediário Próprio',       cor: SERIE[3] },
]
const BOLETOS = [
  { key: 'vence',    label: 'Vencimentos do mês',   cor: SERIE[0] },
  { key: 'recebido', label: 'Recebido no mês',      cor: SERIE[1] },
]
const FAIXAS = [
  { rotulo: 'Até 30 dias',     de: 1,  ate: 30 },
  { rotulo: '31 a 60 dias',    de: 31, ate: 60 },
  { rotulo: '61 a 90 dias',    de: 61, ate: 90 },
  { rotulo: 'Mais de 90 dias', de: 91, ate: Infinity },
]

export default function DashboardGraficos() {
  const [preset, setPreset] = useState('6m')
  const [filtroFilial, setFiltroFilial] = useState('')
  const [filiais, setFiliais] = useState([])
  const [vendedores, setVendedores] = useState({})
  const [vendas, setVendas] = useState([])
  const [boletos, setBoletos] = useState([])
  const [carregando, setCarregando] = useState(true)

  const meses = mesesDoPeriodo(preset)
  const ini = `${meses[0].chave}-01`
  const fim = isoLocal(new Date())

  useEffect(() => {
    supabase.from('filiais').select('id, nome').order('nome').then(({ data }) => setFiliais(data || []))
    supabase.from('vendedores_lista').select('id, nome').then(async ({ data, error }) => {
      let lista = data
      if (error) lista = (await supabase.from('profiles').select('id, nome')).data
      setVendedores(Object.fromEntries((lista || []).map(v => [v.id, v.nome])))
    })
  }, [])

  useEffect(() => {
    let ativo = true
    setCarregando(true)
    Promise.all([
      todos(() => {
        let q = supabase.from('vendas')
          .select('data_venda, valor_final, filial_id, vendedor_id, pagamento_modalidade, pagamento_entrada, entrada_valor, forma_pagamento')
          .gte('data_venda', ini).lte('data_venda', fim).eq('efetivada', true)
        if (filtroFilial) q = q.eq('filial_id', filtroFilial)
        return q
      }),
      todos(() => {
        let q = supabase.from('cobrancas_boletos')
          .select('valor, valor_liquidacao, data_vencimento, data_liquidacao, situacao_atual, situacao_boleto, filial_id')
        if (filtroFilial) q = q.eq('filial_id', filtroFilial)
        return q
      }),
    ]).then(([rV, rB]) => {
      if (!ativo) return
      if (rV.error) logErro('Gráficos: vendas', rV.error)
      if (rB.error) logErro('Gráficos: boletos', rB.error)
      setVendas(rV.data || [])
      setBoletos(rB.data || [])
      setCarregando(false)
    })
    return () => { ativo = false }
  }, [ini, fim, filtroFilial])

  /* ── 1. Vendas por mês + ticket médio ── */
  const porMes = Object.fromEntries(meses.map(m => [m.chave, []]))
  vendas.forEach(v => { const k = chaveMes(v.data_venda); if (porMes[k]) porMes[k].push(v) })
  const catVendas = meses.map(m => {
    const vs = porMes[m.chave]
    const total = vs.reduce((s, v) => s + (Number(v.valor_final) || 0), 0)
    return { ...m, qtd: vs.length, valores: { total }, ticket: vs.length ? total / vs.length : 0 }
  })
  const totalPeriodo = catVendas.reduce((s, c) => s + c.valores.total, 0)
  const qtdPeriodo = catVendas.reduce((s, c) => s + c.qtd, 0)
  const ultimo = meses.length - 1

  /* ── 2. Formas de pagamento por mês ── */
  let outros = 0
  const catFormas = meses.map(m => {
    const f = somarFormas(porMes[m.chave])
    outros += f.outros || 0
    return { ...m, valores: { din: (f.dinheiro || 0) + (f.pix || 0), cartao: f.cartao || 0, mc: f.mc || 0, cred: f.cred || 0 } }
  })
  const totFormas = FORMAS.map(fm => ({ ...fm, total: catFormas.reduce((s, c) => s + c.valores[fm.key], 0) }))

  /* ── 3. Ranking de vendedores ── */
  const rank = {}
  vendas.forEach(v => {
    const id = v.vendedor_id || '—'
    if (!rank[id]) rank[id] = { total: 0, qtd: 0 }
    rank[id].total += Number(v.valor_final) || 0
    rank[id].qtd++
  })
  const itensRanking = Object.entries(rank)
    .map(([id, r]) => ({ rotulo: vendedores[id] || 'Sem vendedor', valor: r.total, detalhe: `${r.qtd} venda${r.qtd !== 1 ? 's' : ''}` }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10)

  /* ── 4. Boletos: vencimentos x recebido por mês ── */
  const catBoletos = meses.map(m => ({ ...m, valores: { vence: 0, recebido: 0 } }))
  const idxMes = Object.fromEntries(meses.map((m, i) => [m.chave, i]))
  boletos.forEach(b => {
    const iv = idxMes[chaveMes(b.data_vencimento)]
    if (iv !== undefined) catBoletos[iv].valores.vence += Number(b.valor) || 0
    if (b.data_liquidacao) {
      const il = idxMes[chaveMes(b.data_liquidacao)]
      if (il !== undefined) catBoletos[il].valores.recebido += Number(b.valor_liquidacao ?? b.valor) || 0
    }
  })

  /* ── 5. Inadimplência por tempo de atraso (hoje) ── */
  const hojeD = new Date(); hojeD.setHours(0, 0, 0, 0)
  const faixas = FAIXAS.map(f => ({ ...f, valor: 0, qtd: 0 }))
  boletos.forEach(b => {
    if (boletoQuitado(b) || !b.data_vencimento) return
    const dias = Math.round((hojeD - new Date(String(b.data_vencimento).slice(0, 10) + 'T00:00:00')) / 86400000)
    if (dias < 1) return
    const f = faixas.find(x => dias >= x.de && dias <= x.ate)
    if (f) { f.valor += Number(b.valor) || 0; f.qtd++ }
  })
  const totalVencido = faixas.reduce((s, f) => s + f.valor, 0)

  const nomePeriodo = preset === '12m' ? 'últimos 12 meses' : preset === 'ano' ? `${hojeD.getFullYear()} (ano atual)` : 'últimos 6 meses'
  const botaoPreset = (v, rotulo) => (
    <button key={v} type="button" onClick={() => setPreset(v)}
      style={{
        padding: '0.4rem 0.85rem', borderRadius: '999px', cursor: 'pointer', fontFamily: F.body, fontSize: '0.8rem',
        fontWeight: preset === v ? '700' : '500',
        border: `1.5px solid ${preset === v ? C.primaryContainer : C.borderSubtle}`,
        background: preset === v ? C.primaryContainer : C.surfaceContainerLowest,
        color: preset === v ? C.onPrimary : C.onSurfaceVariant,
      }}>{rotulo}</button>
  )

  return (
    <div className="pg">
      <h1 style={{ fontSize: '1.4rem', fontWeight: '800', fontFamily: F.headline, color: C.onSurface, margin: '0 0 0.75rem', letterSpacing: '-0.3px' }}>
        Dashboard
      </h1>
      <AbasDashboard />

      {/* Filtros: uma linha, acima de todos os gráficos */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', margin: '0 0 1.25rem' }}>
        {botaoPreset('6m', 'Últimos 6 meses')}
        {botaoPreset('12m', 'Últimos 12 meses')}
        {botaoPreset('ano', 'Este ano')}
        {filiais.length > 1 && (
          <select value={filtroFilial} onChange={e => setFiltroFilial(e.target.value)}
            style={{ marginLeft: '0.5rem', padding: '0.4rem 0.6rem', borderRadius: '0.5rem', border: `1.5px solid ${C.borderSubtle}`, fontFamily: F.body, fontSize: '0.82rem', color: C.onSurface, background: C.surfaceContainerLowest }}>
            <option value="">Todas as filiais</option>
            {filiais.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        )}
        <span style={{ marginLeft: 'auto', fontFamily: F.body, fontSize: '0.8rem', color: C.onSurfaceVariant }}>
          {carregando ? 'Carregando…' : `${qtdPeriodo} vendas · ${fBRL(totalPeriodo)} nos ${nomePeriodo.startsWith('últimos') ? nomePeriodo : `meses de ${nomePeriodo}`}`}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))', gap: '1rem' }}>
        <CartaoGrafico
          titulo="Vendas por mês"
          subtitulo={`Valor total vendido (vendas efetivadas) · ${nomePeriodo}`}
          carregando={carregando}
          tabela={{ colunas: ['Mês', 'Vendas', 'Total'], linhas: catVendas.map(c => [c.rotuloLongo, c.qtd, fBRL(c.valores.total)]) }}>
          <GraficoColunas categorias={catVendas} series={[{ key: 'total', label: 'Total vendido', cor: SERIE[0] }]} destacar={[ultimo]} />
        </CartaoGrafico>

        <CartaoGrafico
          titulo="Ticket médio por mês"
          subtitulo="Valor médio de cada venda"
          carregando={carregando}
          tabela={{ colunas: ['Mês', 'Vendas', 'Ticket médio'], linhas: catVendas.map(c => [c.rotuloLongo, c.qtd, fBRL(c.ticket)]) }}>
          <GraficoColunas categorias={catVendas.map(c => ({ ...c, valores: { ticket: c.ticket } }))}
            series={[{ key: 'ticket', label: 'Ticket médio', cor: SERIE[0] }]} destacar={[ultimo]} />
        </CartaoGrafico>

        <CartaoGrafico
          titulo="Vendas por forma de pagamento"
          subtitulo={`Quanto de cada mês entrou em cada forma${outros > 0 ? ` · ${fBRL(outros)} sem forma identificada` : ''}`}
          legenda={FORMAS}
          carregando={carregando}
          tabela={{
            colunas: ['Mês', ...FORMAS.map(f => f.label), 'Total'],
            linhas: [
              ...catFormas.map(c => [c.rotuloLongo, ...FORMAS.map(f => fBRL(c.valores[f.key])), fBRL(FORMAS.reduce((s, f) => s + c.valores[f.key], 0))]),
              ['Período', ...totFormas.map(f => fBRL(f.total)), fBRL(totFormas.reduce((s, f) => s + f.total, 0))],
            ],
          }}>
          <GraficoColunas categorias={catFormas} series={FORMAS} modo="empilhado" destacar={[ultimo]} />
        </CartaoGrafico>

        <CartaoGrafico
          titulo="Ranking de vendedores"
          subtitulo={`Total vendido no período (${nomePeriodo}) · 10 maiores`}
          carregando={carregando}
          tabela={{ colunas: ['Vendedor', 'Vendas', 'Total'], linhas: itensRanking.map(i => [i.rotulo, i.detalhe, fBRL(i.valor)]) }}>
          <GraficoBarrasH itens={itensRanking} />
        </CartaoGrafico>

        <CartaoGrafico
          titulo="Boletos: vencimentos x recebido"
          subtitulo="Por mês: valor dos boletos que venceram e valor recebido (liquidado), conforme o arquivo do banco"
          legenda={BOLETOS}
          carregando={carregando}
          tabela={{
            colunas: ['Mês', ...BOLETOS.map(b => b.label)],
            linhas: catBoletos.map(c => [c.rotuloLongo, ...BOLETOS.map(b => fBRL(c.valores[b.key]))]),
          }}>
          <GraficoColunas categorias={catBoletos} series={BOLETOS} modo="agrupado" destacar={[ultimo]} />
        </CartaoGrafico>

        <CartaoGrafico
          titulo="Inadimplência por tempo de atraso"
          subtitulo={`Boletos em aberto vencidos, hoje · total ${fBRL(totalVencido)}`}
          carregando={carregando}
          tabela={{ colunas: ['Atraso', 'Boletos', 'Valor'], linhas: faixas.map(f => [f.rotulo, f.qtd, fBRL(f.valor)]) }}>
          <GraficoBarrasH
            itens={faixas.map((f, i) => ({ rotulo: f.rotulo, valor: f.valor, cor: RAMPA_ORDINAL[i], detalhe: `${f.qtd} boleto${f.qtd !== 1 ? 's' : ''}` }))}
            vazio="Nenhum boleto vencido em aberto." />
        </CartaoGrafico>
      </div>
    </div>
  )
}
