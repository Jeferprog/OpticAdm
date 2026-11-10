import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { buscarTodos } from '../lib/paginar'
import { useAuth } from '../contexts/AuthContext'
import { C, F, card as dsCard, inputCss, btnPrimary, btnSecondary } from '../lib/ds'

/* ── helpers ── */
function fBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}
function fDateBR(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function todayISO() {
  return new Date().toISOString().slice(0, 10)
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

const FORM_INIT = {
  descricao: '',
  categoria: '',
  fornecedor: '',
  filial_id: '',
  valor: '',
  data_vencimento: todayISO(),
  pago: false,
  data_pagamento: todayISO(),
  forma_pagamento: '',
  observacoes: '',
}

/* ── Card de resumo ── */
function SummaryCard({ label, value, color, alert }) {
  return (
    <div style={{
      ...dsCard,
      border: alert ? `1px solid ${C.outlineVariant}` : `1px solid ${C.borderSubtle}`,
      padding: '1.25rem 1.5rem',
    }}>
      <div style={{ fontSize: '0.72rem', fontWeight: '700', fontFamily: F.body, color: C.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.25rem', fontFamily: F.headline, fontWeight: '800', color }}>
        {value}
      </div>
    </div>
  )
}

/* ── Componente principal ── */
export default function Resumo() {
  const { isAdmin, loading: authLoading } = useAuth()

  const [dataInicio, setDataInicio] = useState(firstOfMonth())
  const [dataFim, setDataFim] = useState(lastOfMonth())
  const [despesas, setDespesas] = useState([])
  const [categorias, setCategorias] = useState([])
  const [formasPagamento, setFormasPagamento] = useState([])
  const [filiais, setFiliais] = useState([])
  const [filtroStatus, setFiltroStatus] = useState('todas')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroFilial, setFiltroFilial] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(FORM_INIT)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  function showToast(msg, tipo = 'ok') {
    setToast({ msg, tipo })
    setTimeout(() => setToast(null), 3500)
  }

  /* carrega categorias, formas de pagamento e filiais uma vez */
  useEffect(() => {
    async function init() {
      const [{ data: cfgRows }, { data: fils }] = await Promise.all([
        supabase.from('configuracoes').select('*'),
        supabase.from('filiais').select('*').order('nome'),
      ])
      if (cfgRows) {
        const map = Object.fromEntries(cfgRows.map(r => [r.chave, r.valor]))
        setCategorias((map.categorias_despesa || '').split(',').filter(Boolean))
        setFormasPagamento((map.formas_pagamento || '').split(',').filter(Boolean))
      }
      if (fils) setFiliais(fils)
    }
    init()
  }, [])

  /* carrega despesas do período */
  const carregarDespesas = useCallback(async () => {
    setLoading(true)
    const montar = () => { let q = supabase
      .from('despesas')
      .select('*')
      .gte('data_vencimento', dataInicio)
      .lte('data_vencimento', dataFim)
      .order('data_vencimento')
    if (filtroFilial) q = q.eq('filial_id', filtroFilial)
    return q }
    const { data, error } = await buscarTodos(montar, { ordenarPorId: true })
    if (!error && data) setDespesas(data)
    setLoading(false)
  }, [dataInicio, dataFim, filtroFilial])

  useEffect(() => { carregarDespesas() }, [carregarDespesas])

  /* ── lógica derivada ── */
  const hoje = todayISO()

  function isAtrasada(d) {
    return !d.pago && d.data_vencimento && d.data_vencimento < hoje
  }

  function getStatusBadge(d) {
    if (d.pago) return { label: 'Paga', bg: C.statusSuccessBg, color: C.statusSuccess }
    if (isAtrasada(d)) return { label: 'Atrasada', bg: C.statusDangerBg, color: C.statusDanger }
    return { label: 'Em aberto', bg: C.statusWarningBg, color: C.statusWarning }
  }

  const filteredDespesas = despesas.filter(d => {
    if (filtroCategoria && d.categoria !== filtroCategoria) return false
    if (filtroStatus === 'pagas') return d.pago
    if (filtroStatus === 'aberto') return !d.pago
    if (filtroStatus === 'atrasadas') return isAtrasada(d)
    return true
  })

  const filialMap = Object.fromEntries(filiais.map(f => [f.id, f.nome]))

  /* totais do período inteiro (independente dos filtros de status/categoria) */
  const totLancado = despesas.reduce((s, d) => s + (d.valor || 0), 0)
  const totAberto = despesas.filter(d => !d.pago).reduce((s, d) => s + (d.valor || 0), 0)
  const totPago = despesas.filter(d => d.pago).reduce((s, d) => s + (d.valor || 0), 0)
  const totAtrasado = despesas.filter(isAtrasada).reduce((s, d) => s + (d.valor || 0), 0)

  /* breakdown por categoria */
  const catMap = {}
  despesas.forEach(d => {
    const cat = d.categoria || 'Sem categoria'
    catMap[cat] = (catMap[cat] || 0) + (d.valor || 0)
  })
  const catEntries = Object.entries(catMap).sort((a, b) => b[1] - a[1])

  /* ── ações ── */
  function abrirNova() {
    setForm({ ...FORM_INIT, data_vencimento: hoje })
    setEditId(null)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function abrirEdicao(d) {
    setForm({
      descricao: d.descricao,
      categoria: d.categoria || '',
      fornecedor: d.fornecedor || '',
      filial_id: d.filial_id || '',
      valor: d.valor,
      data_vencimento: d.data_vencimento || hoje,
      pago: d.pago || false,
      data_pagamento: d.data_pagamento || hoje,
      forma_pagamento: d.forma_pagamento || '',
      observacoes: d.observacoes || '',
    })
    setEditId(d.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function setField(key, val) {
    setForm(p => ({ ...p, [key]: val }))
  }

  async function salvar(e) {
    e.preventDefault()
    const valor = parseFloat(String(form.valor).replace(',', '.')) || 0
    if (!form.descricao.trim()) return showToast('Informe a descrição.', 'err')
    if (valor <= 0) return showToast('Valor deve ser maior que zero.', 'err')

    setSaving(true)
    const payload = {
      descricao: form.descricao.trim(),
      categoria: form.categoria || null,
      fornecedor: form.fornecedor.trim() || null,
      filial_id: form.filial_id || null,
      valor,
      data_vencimento: form.data_vencimento || null,
      pago: form.pago,
      data_pagamento: form.pago ? (form.data_pagamento || null) : null,
      forma_pagamento: form.pago ? (form.forma_pagamento || null) : null,
      observacoes: form.observacoes.trim() || null,
    }

    let error
    if (editId) {
      ;({ error } = await supabase.from('despesas').update(payload).eq('id', editId))
    } else {
      ;({ error } = await supabase.from('despesas').insert(payload))
    }

    setSaving(false)
    if (error) {
      showToast('Erro ao salvar: ' + error.message, 'err')
    } else {
      showToast(editId ? 'Conta atualizada!' : 'Conta registrada!')
      setShowForm(false)
      carregarDespesas()
    }
  }

  async function marcarPaga(d) {
    const { error } = await supabase
      .from('despesas')
      .update({ pago: true, data_pagamento: hoje })
      .eq('id', d.id)
    if (error) {
      showToast('Erro: ' + error.message, 'err')
    } else {
      showToast('Conta marcada como paga!')
      carregarDespesas()
    }
  }

  async function excluir(id) {
    if (!window.confirm('Confirma exclusão desta conta?')) return
    const { error } = await supabase.from('despesas').delete().eq('id', id)
    if (error) {
      showToast('Erro ao excluir: ' + error.message, 'err')
    } else {
      showToast('Conta excluída.')
      carregarDespesas()
    }
  }

  /* ── verificação de acesso ── */
  if (authLoading) return null

  if (!isAdmin) {
    return (
      <div style={{ padding: '2rem' }}>
        <div style={{
          background: C.statusDangerBg, border: `1px solid ${C.outlineVariant}`,
          borderRadius: '0.5rem', padding: '2rem', textAlign: 'center',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔒</div>
          <h2 style={{ margin: '0 0 0.5rem', fontFamily: F.headline, fontSize: '1.1rem', color: C.statusDanger }}>Acesso Restrito</h2>
          <p style={{ margin: 0, fontFamily: F.body, color: C.statusDanger, fontSize: '0.875rem' }}>
            Apenas administradores podem acessar Contas a Pagar.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="pg">
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '1.25rem', right: '1.25rem', zIndex: 9999,
          padding: '0.75rem 1.25rem', borderRadius: '0.5rem', fontSize: '0.875rem',
          fontFamily: F.body, fontWeight: '600', color: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          background: toast.tipo === 'err' ? C.statusDanger : C.statusSuccess, maxWidth: '320px',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: '800', fontFamily: F.headline, color: C.onSurface, margin: 0, letterSpacing: '-0.3px' }}>
          Contas a Pagar
        </h1>
        {!showForm && (
          <button style={btnPrimary} onClick={abrirNova}>+ Nova Conta</button>
        )}
      </div>

      {/* Formulário Nova / Editar */}
      {showForm && (
        <div style={{ ...dsCard, marginBottom: '1.5rem', borderLeft: `4px solid ${C.primaryContainer}` }}>
          <h2 style={{ fontSize: '1rem', fontWeight: '700', fontFamily: F.headline, color: C.onSurface, margin: '0 0 1.25rem' }}>
            {editId ? 'Editar Conta' : 'Nova Conta'}
          </h2>
          <form onSubmit={salvar} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* linha 1 */}
            <div>
              <Label>Descrição *</Label>
              <input style={inputCss} required placeholder="Ex: Aluguel de agosto"
                value={form.descricao} onChange={e => setField('descricao', e.target.value)} />
            </div>

            {/* linha 2 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '1rem' }}>
              <div>
                <Label>Categoria</Label>
                <select style={inputCss} value={form.categoria} onChange={e => setField('categoria', e.target.value)}>
                  <option value="">Sem categoria</option>
                  {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <Label>Fornecedor</Label>
                <input style={inputCss} placeholder="Opcional"
                  value={form.fornecedor} onChange={e => setField('fornecedor', e.target.value)} />
              </div>
              {filiais.length > 0 && (
                <div>
                  <Label>Filial</Label>
                  <select style={inputCss} value={form.filial_id} onChange={e => setField('filial_id', e.target.value)}>
                    <option value="">Sem filial</option>
                    {filiais.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </select>
                </div>
              )}
              <div>
                <Label>Valor (R$) *</Label>
                <input style={inputCss} type="number" min="0.01" step="0.01" required placeholder="0,00"
                  value={form.valor} onChange={e => setField('valor', e.target.value)} />
              </div>
              <div>
                <Label>Vencimento</Label>
                <input type="date" style={inputCss}
                  value={form.data_vencimento} onChange={e => setField('data_vencimento', e.target.value)} />
              </div>
            </div>

            {/* checkbox pago */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.125rem 0' }}>
              <input
                type="checkbox" id="cbPago" checked={form.pago}
                onChange={e => {
                  const pago = e.target.checked
                  setForm(p => ({ ...p, pago, data_pagamento: p.data_pagamento || hoje }))
                }}
                style={{ width: '1rem', height: '1rem', cursor: 'pointer', accentColor: C.primaryContainer }}
              />
              <label htmlFor="cbPago" style={{ fontSize: '0.9rem', fontFamily: F.body, fontWeight: '600', color: C.onSurface, cursor: 'pointer' }}>
                Conta paga
              </label>
            </div>

            {/* campos de pagamento — só aparecem quando pago */}
            {form.pago && (
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
                gap: '1rem', padding: '1rem', background: C.statusSuccessBg,
                borderRadius: '0.5rem', border: `1px solid ${C.statusSuccess}30`,
              }}>
                <div>
                  <Label>Data de Pagamento</Label>
                  <input type="date" style={inputCss}
                    value={form.data_pagamento} onChange={e => setField('data_pagamento', e.target.value)} />
                </div>
                <div>
                  <Label>Forma de Pagamento</Label>
                  <select style={inputCss}
                    value={form.forma_pagamento} onChange={e => setField('forma_pagamento', e.target.value)}>
                    <option value="">Selecione...</option>
                    {formasPagamento.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* observações */}
            <div>
              <Label>Observações</Label>
              <textarea
                style={{ ...inputCss, minHeight: '68px', resize: 'vertical' }}
                placeholder="Opcional"
                value={form.observacoes}
                onChange={e => setField('observacoes', e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button type="button" style={btnSecondary} onClick={() => setShowForm(false)}>Cancelar</button>
              <button type="submit" style={btnPrimary} disabled={saving}>
                {saving ? 'Salvando...' : (editId ? 'Atualizar' : 'Registrar Conta')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filtros de período + status + categoria */}
      <div style={{ ...dsCard, marginBottom: '1rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
          <div>
            <Label>De</Label>
            <input type="date" style={{ ...inputCss, width: 'auto', minWidth: '140px' }}
              value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
          </div>
          <div>
            <Label>Até</Label>
            <input type="date" style={{ ...inputCss, width: 'auto', minWidth: '140px' }}
              value={dataFim} onChange={e => setDataFim(e.target.value)} />
          </div>
          <div>
            <Label>Status</Label>
            <select style={{ ...inputCss, width: 'auto', minWidth: '140px' }}
              value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
              <option value="todas">Todas</option>
              <option value="aberto">Em aberto</option>
              <option value="pagas">Pagas</option>
              <option value="atrasadas">Atrasadas</option>
            </select>
          </div>
          <div>
            <Label>Categoria</Label>
            <select style={{ ...inputCss, width: 'auto', minWidth: '160px' }}
              value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}>
              <option value="">Todas</option>
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {filiais.length > 1 && (
            <div>
              <Label>Filial</Label>
              <select style={{ ...inputCss, width: 'auto', minWidth: '160px' }}
                value={filtroFilial} onChange={e => setFiltroFilial(e.target.value)}>
                <option value="">Todas</option>
                {filiais.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
          )}
          <button style={{ ...btnSecondary, alignSelf: 'flex-end' }}
            onClick={() => { setFiltroStatus('todas'); setFiltroCategoria(''); setFiltroFilial('') }}>
            Limpar filtros
          </button>
        </div>
      </div>

      {/* Cards de resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.875rem', marginBottom: '1rem' }}>
        <SummaryCard label="Total Lançado" value={fBRL(totLancado)} color={C.onSurface} />
        <SummaryCard label="Em Aberto" value={fBRL(totAberto)} color={C.statusWarning} />
        <SummaryCard label="Total Pago" value={fBRL(totPago)} color={C.statusSuccess} />
        <SummaryCard label="Atrasado" value={fBRL(totAtrasado)} color={C.statusDanger} alert={totAtrasado > 0} />
      </div>

      {/* Breakdown por categoria */}
      {catEntries.length > 0 && (
        <div style={{ ...dsCard, marginBottom: '1rem' }}>
          <div style={{ fontWeight: '700', fontFamily: F.headline, color: C.onSurface, fontSize: '0.9rem', marginBottom: '1rem' }}>
            Por Categoria — {fDateBR(dataInicio)} a {fDateBR(dataFim)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {catEntries.map(([cat, total]) => {
              const pct = totLancado > 0 ? Math.round((total / totLancado) * 100) : 0
              return (
                <div key={cat}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.82rem', fontFamily: F.body, color: C.onSurfaceVariant, fontWeight: '600' }}>{cat}</span>
                    <span style={{ fontSize: '0.82rem', fontFamily: F.mono, color: C.onSurface, fontWeight: '700' }}>
                      {fBRL(total)} <span style={{ color: C.onSurfaceVariant, fontWeight: '400', fontFamily: F.body }}>({pct}%)</span>
                    </span>
                  </div>
                  <div style={{ background: C.surfaceContainerHigh, borderRadius: '999px', height: '6px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, background: C.primaryContainer, height: '100%', borderRadius: '999px', transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tabela */}
      <div style={{ ...dsCard }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ fontWeight: '700', fontFamily: F.headline, color: C.onSurface, fontSize: '0.95rem' }}>
            Contas
            {filteredDespesas.length > 0 && (
              <span style={{ marginLeft: '0.5rem', color: C.onSurfaceVariant, fontFamily: F.body, fontWeight: '400', fontSize: '0.85rem' }}>
                — {filteredDespesas.length} {filteredDespesas.length === 1 ? 'registro' : 'registros'}
              </span>
            )}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', color: C.onSurfaceVariant, fontFamily: F.body, padding: '2.5rem 0' }}>Carregando...</div>
        ) : filteredDespesas.length === 0 ? (
          <div style={{ textAlign: 'center', color: C.onSurfaceVariant, fontFamily: F.body, padding: '3rem 0' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>💳</div>
            <div style={{ fontWeight: '600' }}>Nenhuma conta encontrada</div>
            <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>Ajuste os filtros ou clique em "+ Nova Conta"</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: C.tableHeader, borderBottom: `1.5px solid ${C.borderSubtle}` }}>
                  {['Descrição', 'Categoria', 'Fornecedor', 'Vencimento', 'Valor', 'Status', 'Ações'].map(h => (
                    <th key={h} style={{
                      padding: '0.6rem 0.75rem', textAlign: 'left', fontSize: '0.7rem',
                      fontFamily: F.body, fontWeight: '600', color: C.onSurfaceVariant,
                      textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredDespesas.map(d => {
                  const atrasada = isAtrasada(d)
                  const badge = getStatusBadge(d)
                  return (
                    <tr key={d.id}
                      style={{ borderBottom: `1px solid ${C.borderSubtle}`, background: atrasada ? C.statusDangerBg + '66' : 'transparent' }}
                      onMouseEnter={e => e.currentTarget.style.background = atrasada ? C.statusDangerBg : C.surfaceContainerLow}
                      onMouseLeave={e => e.currentTarget.style.background = atrasada ? C.statusDangerBg + '66' : 'transparent'}>
                      <td style={{ padding: '0.65rem 0.75rem', fontFamily: F.body, fontWeight: '600', color: C.onSurface, maxWidth: '220px' }}>
                        {d.descricao}
                        {d.observacoes && (
                          <div style={{ fontSize: '0.75rem', color: C.onSurfaceVariant, fontWeight: '400', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
                            {d.observacoes}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        {d.categoria
                          ? <span style={{ background: C.surfaceContainerHigh, borderRadius: '0.375rem', padding: '0.2rem 0.55rem', fontSize: '0.78rem', fontFamily: F.body, fontWeight: '600', color: C.onSurfaceVariant }}>{d.categoria}</span>
                          : <span style={{ color: C.borderSubtle }}>—</span>
                        }
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', fontFamily: F.body, color: C.onSurfaceVariant, fontSize: '0.85rem' }}>
                        {d.fornecedor || '—'}
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', fontFamily: F.body, whiteSpace: 'nowrap', fontWeight: atrasada ? '700' : '400', color: atrasada ? C.statusDanger : C.onSurfaceVariant }}>
                        {fDateBR(d.data_vencimento)}
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', fontFamily: F.mono, fontWeight: '700', color: C.onSurface, whiteSpace: 'nowrap' }}>
                        {fBRL(d.valor)}
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        <span style={{
                          background: badge.bg, color: badge.color,
                          borderRadius: '0.375rem', padding: '0.2rem 0.6rem',
                          fontSize: '0.78rem', fontFamily: F.body, fontWeight: '700',
                        }}>{badge.label}</span>
                        {d.pago && d.data_pagamento && (
                          <div style={{ fontSize: '0.72rem', fontFamily: F.body, color: C.onSurfaceVariant, marginTop: '2px' }}>
                            {fDateBR(d.data_pagamento)}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          {!d.pago && (
                            <button onClick={() => marcarPaga(d)}
                              style={{
                                padding: '0.3rem 0.6rem', fontSize: '0.78rem', fontFamily: F.body, fontWeight: '600',
                                borderRadius: '0.375rem', border: `1.5px solid ${C.statusSuccess}40`,
                                background: C.statusSuccessBg, color: C.statusSuccess, cursor: 'pointer',
                              }}>Pagar</button>
                          )}
                          <button onClick={() => abrirEdicao(d)}
                            style={{
                              padding: '0.3rem 0.6rem', fontSize: '0.78rem', fontFamily: F.body, fontWeight: '600',
                              borderRadius: '0.375rem', border: `1.5px solid ${C.borderSubtle}`,
                              background: C.surfaceContainerLow, color: C.onSurfaceVariant, cursor: 'pointer',
                            }}>Editar</button>
                          <button onClick={() => excluir(d.id)}
                            style={{
                              padding: '0.3rem 0.6rem', fontSize: '0.78rem', fontFamily: F.body, fontWeight: '600',
                              borderRadius: '0.375rem', border: `1.5px solid ${C.outlineVariant}`,
                              background: C.statusDangerBg, color: C.statusDanger, cursor: 'pointer',
                            }}>Excluir</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
