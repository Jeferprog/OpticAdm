import { Fragment, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { buscarTodos } from '../lib/paginar'
import { useAuth } from '../contexts/AuthContext'
import { C, F, card as dsCard, inputCss } from '../lib/ds'

/* ── helpers ── */
function fBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}
function fDateBR(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function firstOfMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function lastOfMonth() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
}

const Label = ({ children }) => (
  <label style={{
    display: 'block', fontSize: '0.8rem', fontWeight: '600', fontFamily: F.body,
    color: C.onSurfaceVariant, marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.5px',
  }}>{children}</label>
)

const TH = {
  padding: '0.65rem 0.875rem', textAlign: 'left', fontSize: '0.7rem',
  fontFamily: F.body, fontWeight: '600', color: C.onSurfaceVariant,
  textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap',
}

/* ── componente principal ── */
export default function Vendedores() {
  const { profile, isAdmin } = useAuth()

  const [dataInicio, setDataInicio] = useState(firstOfMonth())
  const [dataFim, setDataFim] = useState(lastOfMonth())
  const [vendedores, setVendedores] = useState([])
  const [vendas, setVendas] = useState([])
  const [captacoes, setCaptacoes] = useState([])
  const [comissaoComVenda, setComissaoComVenda] = useState(10)
  const [comissaoSemVenda, setComissaoSemVenda] = useState(5)
  const [filiais, setFiliais] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [filtroVendedor, setFiltroVendedor] = useState('')
  const [filtroFilial, setFiltroFilial] = useState('')
  const [loading, setLoading] = useState(true)
  const [vendasEsp, setVendasEsp] = useState([])       // vendas com especialista registrado
  const [espSelecionado, setEspSelecionado] = useState(null)

  /* carrega perfis, vendas do período e filiais */
  const carregar = useCallback(async () => {
    setLoading(true)
    const montarVendas = () => { let qVendas = supabase
      .from('vendas')
      .select('id, os_numero, tipo_venda, data_venda, vendedor_id, filial_id, valor_final, forma_pagamento')
      .gte('data_venda', dataInicio)
      .lte('data_venda', dataFim)
      .eq('efetivada', true)
    if (filtroFilial) qVendas = qVendas.eq('filial_id', filtroFilial)
    return qVendas }

    const montarCapt = () => { let qCapt = supabase
      .from('captacao_clientes')
      .select('id, numero_os, vendedor_id, filial_id, data_consulta')
      .gte('data_consulta', dataInicio)
      .lte('data_consulta', dataFim)
    if (filtroFilial) qCapt = qCapt.eq('filial_id', filtroFilial)
    return qCapt }

    // Vendas com Especialista (exame de vista) — inclui as não efetivadas,
    // para ver quantas consultas viraram venda. Consulta separada: se a
    // coluna ainda não existir (SQL não rodado), o resto da tela funciona.
    const montarEsp = () => { let q = supabase
      .from('vendas')
      .select('id, os_numero, tipo_venda, data_venda, vendedor_id, filial_id, valor_final, efetivada, nome_cliente, especialista')
      .gte('data_venda', dataInicio)
      .lte('data_venda', dataFim)
      .not('especialista', 'is', null)
    if (filtroFilial) q = q.eq('filial_id', filtroFilial)
    return q }
    buscarTodos(montarEsp, { ordenarPorId: true })
      .then(({ data }) => setVendasEsp((data || []).filter(v => (v.especialista || '').trim())))
      .catch(() => setVendasEsp([]))

    const [{ data: perfis }, { data: vendasData }, { data: captData }, { data: fils }, { data: cfg }] = await Promise.all([
      supabase.from('profiles').select('id, nome, comissao_percentual, ativo').eq('ativo', true).order('nome'),
      buscarTodos(montarVendas, { ordenarPorId: true }),
      buscarTodos(montarCapt, { ordenarPorId: true }),
      supabase.from('filiais').select('*').order('nome'),
      supabase.from('configuracoes').select('chave, valor').in('chave', ['comissao_captacao_com_venda', 'comissao_captacao_sem_venda']),
    ])
    setVendedores(perfis || [])
    setVendas(vendasData || [])
    setCaptacoes(captData || [])
    setFiliais(fils || [])
    const cfgMap = Object.fromEntries((cfg || []).map(r => [r.chave, r.valor]))
    if (cfgMap.comissao_captacao_com_venda != null) setComissaoComVenda(parseFloat(String(cfgMap.comissao_captacao_com_venda).replace(',', '.')) || 0)
    if (cfgMap.comissao_captacao_sem_venda != null) setComissaoSemVenda(parseFloat(String(cfgMap.comissao_captacao_sem_venda).replace(',', '.')) || 0)
    setLoading(false)
  }, [dataInicio, dataFim, filtroFilial])

  useEffect(() => { carregar() }, [carregar])

  /* ── dados derivados ── */
  const statsMap = {}
  vendas.forEach(v => {
    if (!statsMap[v.vendedor_id]) statsMap[v.vendedor_id] = { qtd: 0, total: 0 }
    statsMap[v.vendedor_id].qtd++
    statsMap[v.vendedor_id].total += v.valor_final || 0
  })

  // Captações por vendedor: quantidade e comissão (R$ com/sem número da venda).
  const captMap = {}
  captacoes.forEach(c => {
    if (!captMap[c.vendedor_id]) captMap[c.vendedor_id] = { qtd: 0, comissao: 0 }
    captMap[c.vendedor_id].qtd++
    captMap[c.vendedor_id].comissao += c.numero_os ? comissaoComVenda : comissaoSemVenda
  })

  const linhas = (isAdmin ? vendedores : vendedores.filter(v => v.id === profile?.id))
    .filter(v => !filtroVendedor || v.id === filtroVendedor)
    .map(v => {
      const s = statsMap[v.id] || { qtd: 0, total: 0 }
      const cap = captMap[v.id] || { qtd: 0, comissao: 0 }
      const pct = v.comissao_percentual || 0
      return {
        id: v.id,
        nome: v.nome,
        pct,
        qtd: s.qtd,
        totalVendido: s.total,
        comissao: s.total * (pct / 100),
        captQtd: cap.qtd,
        captComissao: cap.comissao,
      }
    })

  const totVendido = linhas.reduce((s, r) => s + r.totalVendido, 0)
  const totComissao = linhas.reduce((s, r) => s + r.comissao, 0)
  const totQtd = linhas.reduce((s, r) => s + r.qtd, 0)
  const totCaptQtd = linhas.reduce((s, r) => s + r.captQtd, 0)
  const totCaptComissao = linhas.reduce((s, r) => s + r.captComissao, 0)

  const selectedVendedor = vendedores.find(v => v.id === selectedId)
  const selectedVendas = selectedId
    ? vendas
        .filter(v => v.vendedor_id === selectedId)
        .sort((a, b) => (a.os_numero || 0) - (b.os_numero || 0))
    : []

  // Acompanhamento por Especialista (respeita os filtros; vendedor vê só as suas).
  const espVisiveis = vendasEsp.filter(v =>
    (isAdmin || v.vendedor_id === profile?.id) && (!filtroVendedor || v.vendedor_id === filtroVendedor))
  const espMap = {}
  espVisiveis.forEach(v => {
    const nome = v.especialista.trim()
    if (!espMap[nome]) espMap[nome] = { nome, efetivadas: 0, naoEfetivadas: 0, total: 0, vendas: [] }
    const e = espMap[nome]
    if (v.efetivada === false) e.naoEfetivadas++
    else { e.efetivadas++; e.total += v.valor_final || 0 }
    e.vendas.push(v)
  })
  const linhasEsp = Object.values(espMap).sort((a, b) => b.efetivadas - a.efetivadas || a.nome.localeCompare(b.nome, 'pt-BR'))
  const espTotEf = linhasEsp.reduce((s, r) => s + r.efetivadas, 0)
  const espTotNao = linhasEsp.reduce((s, r) => s + r.naoEfetivadas, 0)
  const espTotValor = linhasEsp.reduce((s, r) => s + r.total, 0)
  const nomeVendedor = id => vendedores.find(v => v.id === id)?.nome || '—'

  function toggleSelecao(id) {
    setSelectedId(prev => (prev === id ? null : id))
  }

  return (
    <div className="pg">
      {/* Cabeçalho */}
      <h1 style={{ fontSize: '1.4rem', fontWeight: '800', fontFamily: F.headline, color: C.onSurface, margin: '0 0 1.5rem', letterSpacing: '-0.3px' }}>
        Vendedores e Comissões
      </h1>

      {/* Filtro de período */}
      <div style={{ ...dsCard, marginBottom: '1rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
          <div>
            <Label>De</Label>
            <input type="date" style={{ ...inputCss, width: 'auto', minWidth: '140px' }}
              value={dataInicio} onChange={e => { setDataInicio(e.target.value); setSelectedId(null) }} />
          </div>
          <div>
            <Label>Até</Label>
            <input type="date" style={{ ...inputCss, width: 'auto', minWidth: '140px' }}
              value={dataFim} onChange={e => { setDataFim(e.target.value); setSelectedId(null) }} />
          </div>
          {isAdmin && filiais.length > 1 && (
            <div>
              <Label>Filial</Label>
              <select style={{ ...inputCss, width: 'auto', minWidth: '160px' }}
                value={filtroFilial}
                onChange={e => { setFiltroFilial(e.target.value); setSelectedId(null) }}>
                <option value="">Todas</option>
                {filiais.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
          )}
          {isAdmin && vendedores.length > 1 && (
            <div>
              <Label>Vendedor</Label>
              <select
                style={{ ...inputCss, width: 'auto', minWidth: '160px' }}
                value={filtroVendedor}
                onChange={e => { setFiltroVendedor(e.target.value); setSelectedId(null) }}
              >
                <option value="">Todos</option>
                {vendedores.map(v => (
                  <option key={v.id} value={v.id}>{v.nome}</option>
                ))}
              </select>
            </div>
          )}
          <div style={{ color: C.onSurfaceVariant, fontFamily: F.body, fontSize: '0.82rem', alignSelf: 'flex-end', paddingBottom: '0.7rem' }}>
            {!loading && `${vendas.length} venda${vendas.length !== 1 ? 's' : ''} no período`}
          </div>
        </div>
      </div>

      {/* Tabela principal */}
      <div style={{ ...dsCard, marginBottom: '1rem' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: C.onSurfaceVariant, fontFamily: F.body, padding: '2.5rem 0' }}>Carregando...</div>
        ) : linhas.length === 0 ? (
          <div style={{ textAlign: 'center', color: C.onSurfaceVariant, fontFamily: F.body, padding: '3rem 0' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👤</div>
            <div style={{ fontWeight: '600' }}>Nenhum vendedor ativo encontrado</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: C.tableHeader, borderBottom: `1.5px solid ${C.borderSubtle}` }}>
                  {['Vendedor', 'Qtd. Vendas', 'Total Vendido', '% Comissão', 'Comissão a Receber', 'Captações', 'Comissão Captação'].map(h => (
                    <th key={h} style={{
                      padding: '0.65rem 0.875rem', textAlign: 'left', fontSize: '0.7rem',
                      fontFamily: F.body, fontWeight: '600', color: C.onSurfaceVariant,
                      textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map(row => {
                  const isSelected = selectedId === row.id
                  return (
                    <tr
                      key={row.id}
                      onClick={() => toggleSelecao(row.id)}
                      style={{
                        borderBottom: `1px solid ${C.borderSubtle}`,
                        cursor: 'pointer',
                        borderLeft: isSelected ? `4px solid ${C.primaryContainer}` : '4px solid transparent',
                        background: isSelected ? C.statusDangerBg : 'transparent',
                        transition: 'background 0.12s',
                      }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = C.surfaceContainerLow }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                      title="Clique para ver as vendas do período"
                    >
                      <td style={{ padding: '0.8rem 0.875rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{
                            width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                            background: isSelected ? C.primaryContainer : C.surfaceContainerHigh,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.82rem', fontFamily: F.headline, fontWeight: '700',
                            color: isSelected ? '#fff' : C.onSurfaceVariant,
                          }}>
                            {row.nome.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: '700', fontFamily: F.body, color: C.onSurface, fontSize: '0.9rem' }}>{row.nome}</div>
                            {isSelected && (
                              <div style={{ fontSize: '0.72rem', fontFamily: F.body, color: C.primaryContainer, fontWeight: '600', marginTop: '1px' }}>
                                ▼ ver vendas
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '0.8rem 0.875rem', fontFamily: F.mono, color: row.qtd === 0 ? C.borderSubtle : C.statusInfo, fontWeight: '700', fontSize: '1rem' }}>
                        {row.qtd}
                      </td>
                      <td style={{ padding: '0.8rem 0.875rem', fontFamily: F.mono, fontWeight: '700', color: row.totalVendido === 0 ? C.borderSubtle : C.onSurface, whiteSpace: 'nowrap' }}>
                        {fBRL(row.totalVendido)}
                      </td>
                      <td style={{ padding: '0.8rem 0.875rem', fontFamily: F.body, color: C.onSurfaceVariant }}>
                        {row.pct > 0 ? `${row.pct}%` : <span style={{ color: C.borderSubtle }}>—</span>}
                      </td>
                      <td style={{ padding: '0.8rem 0.875rem', fontFamily: F.mono, fontWeight: '800', color: row.comissao > 0 ? C.statusDanger : C.borderSubtle, whiteSpace: 'nowrap', fontSize: '0.95rem' }}>
                        {row.pct > 0 ? fBRL(row.comissao) : '—'}
                      </td>
                      <td style={{ padding: '0.8rem 0.875rem', fontFamily: F.mono, color: row.captQtd === 0 ? C.borderSubtle : C.statusInfo, fontWeight: '700', fontSize: '1rem' }}>
                        {row.captQtd}
                      </td>
                      <td style={{ padding: '0.8rem 0.875rem', fontFamily: F.mono, fontWeight: '800', color: row.captComissao > 0 ? C.statusDanger : C.borderSubtle, whiteSpace: 'nowrap', fontSize: '0.95rem' }}>
                        {row.captComissao > 0 ? fBRL(row.captComissao) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>

              {/* Rodapé totais */}
              {linhas.length > 1 && (
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${C.borderSubtle}`, background: C.tableHeader }}>
                    <td style={{ padding: '0.75rem 0.875rem', fontFamily: F.body, fontWeight: '700', color: C.onSurface, fontSize: '0.82rem' }}>
                      TOTAL GERAL
                    </td>
                    <td style={{ padding: '0.75rem 0.875rem', fontFamily: F.mono, fontWeight: '700', color: C.onSurface }}>
                      {totQtd}
                    </td>
                    <td style={{ padding: '0.75rem 0.875rem', fontFamily: F.mono, fontWeight: '800', color: C.onSurface, whiteSpace: 'nowrap' }}>
                      {fBRL(totVendido)}
                    </td>
                    <td style={{ padding: '0.75rem 0.875rem' }} />
                    <td style={{ padding: '0.75rem 0.875rem', fontFamily: F.mono, fontWeight: '800', color: C.statusDanger, whiteSpace: 'nowrap' }}>
                      {fBRL(totComissao)}
                    </td>
                    <td style={{ padding: '0.75rem 0.875rem', fontFamily: F.mono, fontWeight: '700', color: C.onSurface }}>
                      {totCaptQtd}
                    </td>
                    <td style={{ padding: '0.75rem 0.875rem', fontFamily: F.mono, fontWeight: '800', color: C.statusDanger, whiteSpace: 'nowrap' }}>
                      {fBRL(totCaptComissao)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* Detalhe do vendedor selecionado */}
      {selectedId && (
        <div style={{ ...dsCard, borderLeft: `4px solid ${C.primaryContainer}` }}>
          {/* cabeçalho do detalhe */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <div style={{ fontWeight: '800', fontFamily: F.headline, color: C.onSurface, fontSize: '1rem' }}>
                {selectedVendedor?.nome}
              </div>
              <div style={{ fontSize: '0.8rem', fontFamily: F.body, color: C.onSurfaceVariant, marginTop: '2px' }}>
                {fDateBR(dataInicio)} a {fDateBR(dataFim)}
                {selectedVendas.length > 0 && ` · ${selectedVendas.length} venda${selectedVendas.length !== 1 ? 's' : ''}`}
              </div>
            </div>
            <button
              onClick={() => setSelectedId(null)}
              style={{
                background: 'none', border: `1.5px solid ${C.borderSubtle}`, borderRadius: '0.375rem',
                padding: '0.35rem 0.75rem', fontSize: '0.82rem', fontFamily: F.body, color: C.onSurfaceVariant,
                cursor: 'pointer', fontWeight: '600',
              }}
            >
              ✕ Fechar
            </button>
          </div>

          {selectedVendas.length === 0 ? (
            <div style={{ textAlign: 'center', color: C.onSurfaceVariant, fontFamily: F.body, padding: '2rem 0' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.4rem' }}>📋</div>
              <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>Nenhuma venda neste período</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ background: C.tableHeader, borderBottom: `1.5px solid ${C.borderSubtle}` }}>
                    {['Tipo', 'Nº Venda', 'Data', 'Valor Final', 'Forma de Pagamento'].map(h => (
                      <th key={h} style={{
                        padding: '0.55rem 0.75rem', textAlign: 'left', fontSize: '0.7rem',
                        fontFamily: F.body, fontWeight: '600', color: C.onSurfaceVariant,
                        textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedVendas.map(v => (
                    <tr key={v.id} style={{ borderBottom: `1px solid ${C.borderSubtle}` }}
                      onMouseEnter={e => e.currentTarget.style.background = C.surfaceContainerLow}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '0.6rem 0.75rem' }}>
                        <span style={{ background: v.tipo_venda === 'Solar' ? C.statusWarningBg : C.statusInfoBg, color: v.tipo_venda === 'Solar' ? C.statusWarning : C.statusInfo, borderRadius: '0.375rem', padding: '0.2rem 0.5rem', fontSize: '0.75rem', fontFamily: F.body, fontWeight: '600' }}>
                          {v.tipo_venda || 'Grau'}
                        </span>
                      </td>
                      <td style={{ padding: '0.6rem 0.75rem', fontFamily: F.mono, fontWeight: '700', color: C.statusInfo }}>
                        {v.os_numero ? `#${v.os_numero}` : '—'}
                      </td>
                      <td style={{ padding: '0.6rem 0.75rem', fontFamily: F.body, color: C.onSurfaceVariant, whiteSpace: 'nowrap' }}>
                        {fDateBR(v.data_venda)}
                      </td>
                      <td style={{ padding: '0.6rem 0.75rem', fontFamily: F.mono, fontWeight: '700', color: C.statusSuccess, whiteSpace: 'nowrap' }}>
                        {fBRL(v.valor_final)}
                      </td>
                      <td style={{ padding: '0.6rem 0.75rem', fontFamily: F.body, color: C.onSurfaceVariant }}>
                        {v.forma_pagamento
                          ? <span style={{ background: C.surfaceContainerHigh, borderRadius: '0.375rem', padding: '0.2rem 0.55rem', fontSize: '0.78rem', fontWeight: '600' }}>{v.forma_pagamento}</span>
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* subtotal do vendedor selecionado */}
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${C.borderSubtle}`, background: C.tableHeader }}>
                    <td colSpan={3} style={{ padding: '0.6rem 0.75rem', fontFamily: F.body, fontWeight: '700', color: C.onSurface, fontSize: '0.82rem' }}>
                      SUBTOTAL — {selectedVendas.length} venda{selectedVendas.length !== 1 ? 's' : ''}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', fontFamily: F.mono, fontWeight: '800', color: C.statusSuccess, whiteSpace: 'nowrap' }}>
                      {fBRL(selectedVendas.reduce((s, v) => s + (v.valor_final || 0), 0))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Acompanhamento por Especialista (exame de vista) */}
      <div style={{ ...dsCard, marginTop: '1rem' }}>
        <h2 style={{ fontSize: '1.05rem', fontWeight: '800', fontFamily: F.headline, color: C.onSurface, margin: '0 0 0.25rem' }}>
          Vendas por Especialista
        </h2>
        <p style={{ color: C.onSurfaceVariant, fontSize: '0.82rem', margin: '0 0 1rem', fontFamily: F.body, lineHeight: 1.5 }}>
          Vendas do período em que foi registrado o especialista que atendeu no exame de vista.
          Clique em um especialista para ver as vendas.
        </p>
        {loading ? (
          <div style={{ textAlign: 'center', color: C.onSurfaceVariant, fontFamily: F.body, padding: '1.5rem 0' }}>Carregando...</div>
        ) : linhasEsp.length === 0 ? (
          <div style={{ textAlign: 'center', color: C.onSurfaceVariant, fontFamily: F.body, padding: '1.5rem 0' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.4rem' }}>👁️</div>
            <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>Nenhuma venda com especialista neste período</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: C.tableHeader, borderBottom: `1.5px solid ${C.borderSubtle}` }}>
                  {['Especialista', 'Vendas', 'Não efetivadas', 'Total Vendido', 'Ticket Médio'].map(h => (
                    <th key={h} style={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhasEsp.map(r => {
                  const aberto = espSelecionado === r.nome
                  return (
                    <Fragment key={r.nome}>
                      <tr onClick={() => setEspSelecionado(aberto ? null : r.nome)}
                        style={{ borderBottom: `1px solid ${C.borderSubtle}`, cursor: 'pointer', background: aberto ? C.surfaceContainerLow : 'transparent' }}>
                        <td style={{ padding: '0.75rem 0.875rem', fontFamily: F.body, fontWeight: '700', color: C.onSurface }}>
                          <span style={{ marginRight: '0.4rem', color: C.onSurfaceVariant }}>{aberto ? '▾' : '▸'}</span>{r.nome}
                        </td>
                        <td style={{ padding: '0.75rem 0.875rem', fontFamily: F.mono, fontWeight: '800', color: C.statusInfo }}>{r.efetivadas}</td>
                        <td style={{ padding: '0.75rem 0.875rem', fontFamily: F.mono, color: r.naoEfetivadas ? C.statusWarning : C.borderSubtle }}>{r.naoEfetivadas || '—'}</td>
                        <td style={{ padding: '0.75rem 0.875rem', fontFamily: F.mono, fontWeight: '700', color: C.statusSuccess, whiteSpace: 'nowrap' }}>{fBRL(r.total)}</td>
                        <td style={{ padding: '0.75rem 0.875rem', fontFamily: F.mono, color: C.onSurfaceVariant, whiteSpace: 'nowrap' }}>{r.efetivadas ? fBRL(r.total / r.efetivadas) : '—'}</td>
                      </tr>
                      {aberto && (
                        <tr>
                          <td colSpan={5} style={{ padding: '0.5rem 0.875rem 1rem', background: C.surfaceContainerLow }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                              <thead>
                                <tr>
                                  {['Data', 'Nº Venda', 'Cliente', 'Vendedor', 'Valor', 'Situação'].map(h => (
                                    <th key={h} style={{ ...TH, padding: '0.4rem 0.6rem' }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {[...r.vendas].sort((a, b) => String(a.data_venda).localeCompare(String(b.data_venda))).map(v => (
                                  <tr key={v.id} style={{ borderTop: `1px solid ${C.borderSubtle}` }}>
                                    <td style={{ padding: '0.4rem 0.6rem', fontFamily: F.body, whiteSpace: 'nowrap' }}>{fDateBR(v.data_venda)}</td>
                                    <td style={{ padding: '0.4rem 0.6rem', fontFamily: F.mono, color: C.statusInfo }}>{v.os_numero ? `#${v.os_numero}` : '—'}</td>
                                    <td style={{ padding: '0.4rem 0.6rem', fontFamily: F.body }}>{v.nome_cliente || '—'}</td>
                                    <td style={{ padding: '0.4rem 0.6rem', fontFamily: F.body }}>{nomeVendedor(v.vendedor_id)}</td>
                                    <td style={{ padding: '0.4rem 0.6rem', fontFamily: F.mono, whiteSpace: 'nowrap' }}>{fBRL(v.valor_final)}</td>
                                    <td style={{ padding: '0.4rem 0.6rem', fontFamily: F.body, color: v.efetivada === false ? C.statusWarning : C.statusSuccess, fontWeight: '600' }}>
                                      {v.efetivada === false ? 'Não efetivada' : 'Efetivada'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
              {linhasEsp.length > 1 && (
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${C.borderSubtle}`, background: C.tableHeader }}>
                    <td style={{ padding: '0.75rem 0.875rem', fontFamily: F.body, fontWeight: '700', color: C.onSurface, fontSize: '0.82rem' }}>TOTAL</td>
                    <td style={{ padding: '0.75rem 0.875rem', fontFamily: F.mono, fontWeight: '800', color: C.statusInfo }}>{espTotEf}</td>
                    <td style={{ padding: '0.75rem 0.875rem', fontFamily: F.mono, color: C.onSurface }}>{espTotNao || '—'}</td>
                    <td style={{ padding: '0.75rem 0.875rem', fontFamily: F.mono, fontWeight: '800', color: C.statusSuccess, whiteSpace: 'nowrap' }}>{fBRL(espTotValor)}</td>
                    <td style={{ padding: '0.75rem 0.875rem', fontFamily: F.mono, color: C.onSurfaceVariant, whiteSpace: 'nowrap' }}>{espTotEf ? fBRL(espTotValor / espTotEf) : '—'}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
