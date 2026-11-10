import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { buscarTodos } from '../lib/paginar'
import { useAuth } from '../contexts/AuthContext'
import { C, F, card as dsCard, inputCss, btnPrimary, btnSecondary } from '../lib/ds'

/* ── helpers ── */
function todayISO() { return new Date().toISOString().slice(0, 10) }
function firstOfMonthISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function fDateBR(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const Label = ({ children }) => (
  <label style={{
    display: 'block', fontSize: '0.8rem', fontWeight: '600', fontFamily: F.body,
    color: C.onSurfaceVariant, marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.5px',
  }}>{children}</label>
)

const FORM_INIT = {
  data_consulta: todayISO(),
  nome_cliente: '',
  numero_os: '',
  vendedor_id: '',
  filial_id: '',
}

/* ════════════════════════════════ COMPONENTE PRINCIPAL ════════════════════════════════ */
export default function CaptacaoClientes() {
  const { profile, isAdmin } = useAuth()

  const [registros,   setRegistros]   = useState([])
  const [filiais,     setFiliais]     = useState([])
  const [vendedores,  setVendedores]  = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [editId,      setEditId]      = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [toast,       setToast]       = useState(null)

  /* filtros */
  const [filtroInicio, setFiltroInicio] = useState(firstOfMonthISO())
  const [filtroFim,    setFiltroFim]    = useState(todayISO())
  const [filtroFilial, setFiltroFilial] = useState('')

  /* formulário */
  const [form, setForm] = useState(FORM_INIT)

  function showToast(msg, tipo = 'ok') {
    setToast({ msg, tipo })
    setTimeout(() => setToast(null), 3500)
  }

  /* ── init: filiais e vendedores ── */
  useEffect(() => {
    async function init() {
      const [{ data: fils }, vendsRes] = await Promise.all([
        supabase.from('filiais').select('*').order('nome'),
        supabase.from('vendedores_lista').select('id, nome, ativo').order('nome'),
      ])
      // Fallback caso a view ainda não exista (SQL não rodado).
      let vends = vendsRes.data
      if (vendsRes.error) {
        const r = await supabase.from('profiles').select('id, nome, ativo').order('nome')
        vends = r.data
      }
      setFiliais(fils || [])
      setVendedores(vends || [])
    }
    init()
  }, [])

  /* ── carregar registros ── */
  const carregar = useCallback(async () => {
    setLoading(true)
    const montar = () => { let q = supabase
      .from('captacao_clientes')
      .select('*')
      .gte('data_consulta', filtroInicio)
      .lte('data_consulta', filtroFim)
      .order('data_consulta', { ascending: false })
      .order('created_at', { ascending: false })

    if (!isAdmin) q = q.eq('filial_id', profile?.filial_id || '')
    if (filtroFilial) q = q.eq('filial_id', filtroFilial)
    return q }

    const { data, error } = await buscarTodos(montar, { ordenarPorId: true })
    if (!error && data) setRegistros(data)
    setLoading(false)
  }, [filtroInicio, filtroFim, filtroFilial, isAdmin, profile?.id])

  useEffect(() => { carregar() }, [carregar])

  /* ── abrir formulário ── */
  function abrirNovo() {
    setForm({
      ...FORM_INIT,
      data_consulta: todayISO(),
      vendedor_id:   profile?.id || '',
      filial_id:     profile?.filial_id || (filiais.length === 1 ? filiais[0].id : ''),
    })
    setEditId(null)
    setShowForm(true)
  }

  function abrirEdicao(r) {
    setForm({
      data_consulta: r.data_consulta,
      nome_cliente:  r.nome_cliente,
      numero_os:     r.numero_os || '',
      vendedor_id:   r.vendedor_id || profile?.id || '',
      filial_id:     r.filial_id || '',
    })
    setEditId(r.id)
    setShowForm(true)
  }

  /* ── salvar ── */
  async function salvar(e) {
    e.preventDefault()
    if (!form.nome_cliente.trim()) return showToast('Nome do cliente é obrigatório.', 'err')

    setSaving(true)
    const payload = {
      data_consulta: form.data_consulta,
      nome_cliente:  form.nome_cliente.trim(),
      numero_os:     form.numero_os?.trim() || null,
      vendedor_id:   form.vendedor_id || null,
      filial_id:     form.filial_id || null,
    }

    let error
    if (editId) {
      ;({ error } = await supabase.from('captacao_clientes').update(payload).eq('id', editId))
    } else {
      ;({ error } = await supabase.from('captacao_clientes').insert(payload))
    }

    setSaving(false)
    if (error) {
      showToast('Erro ao salvar: ' + error.message, 'err')
    } else {
      showToast(editId ? 'Registro atualizado!' : 'Registro adicionado!')
      setShowForm(false)
      carregar()
    }
  }

  /* ── excluir ── */
  async function excluir(id) {
    if (!window.confirm('Confirma exclusão deste registro?')) return
    const { error } = await supabase.from('captacao_clientes').delete().eq('id', id)
    if (error) showToast('Erro ao excluir: ' + error.message, 'err')
    else { showToast('Registro excluído.'); carregar() }
  }

  function podeAlterar(r) {
    return isAdmin || r.filial_id === profile?.filial_id
  }

  const vendedorMap = Object.fromEntries(vendedores.map(v => [v.id, v.nome]))
  // Só ativos aparecem para novos lançamentos.
  const vendedoresAtivos = vendedores.filter(v => v.ativo)
  const filialMap   = Object.fromEntries(filiais.map(f => [f.id, f.nome]))

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
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: '800', fontFamily: F.headline, color: C.onSurface, margin: 0, letterSpacing: '-0.3px' }}>
            Captação de Clientes
          </h1>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', fontFamily: F.body, color: C.onSurfaceVariant }}>
            Registro de consultas e atendimentos
          </p>
        </div>
        {!showForm && (
          <button style={btnPrimary} onClick={abrirNovo}>
            + Novo Registro
          </button>
        )}
      </div>

      {/* Formulário */}
      {showForm && (
        <div style={{ ...dsCard, marginBottom: '1.5rem', borderLeft: `4px solid ${C.primaryContainer}` }}>
          <h2 style={{ fontSize: '1rem', fontWeight: '700', fontFamily: F.headline, color: C.onSurface, margin: '0 0 1.25rem' }}>
            {editId ? 'Editar Registro' : 'Novo Registro'}
          </h2>
          <form onSubmit={salvar} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>

              {/* Data da Consulta */}
              <div>
                <Label>Data da Consulta</Label>
                <input type="date" style={inputCss} required
                  value={form.data_consulta}
                  onChange={e => setForm(f => ({ ...f, data_consulta: e.target.value }))} />
              </div>

              {/* Nome do Cliente */}
              <div style={{ gridColumn: 'span 2' }}>
                <Label>Nome do Cliente</Label>
                <input style={inputCss} required placeholder="Nome completo do cliente"
                  value={form.nome_cliente}
                  onChange={e => setForm(f => ({ ...f, nome_cliente: e.target.value }))} />
              </div>

              {/* Número da Venda */}
              <div>
                <Label>Número da Venda</Label>
                <input style={inputCss} placeholder="Opcional"
                  value={form.numero_os}
                  onChange={e => setForm(f => ({ ...f, numero_os: e.target.value }))} />
              </div>

              {/* Vendedor — qualquer usuário pode lançar para outro vendedor */}
              <div>
                <Label>Vendedor</Label>
                <select style={inputCss}
                  value={form.vendedor_id}
                  onChange={e => setForm(f => ({ ...f, vendedor_id: e.target.value }))}>
                  <option value="">Sem vendedor</option>
                  {vendedoresAtivos.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                </select>
              </div>

              {/* Filial */}
              {(isAdmin || filiais.length > 1) && filiais.length > 0 && (
                <div>
                  <Label>Filial</Label>
                  {isAdmin ? (
                    <select style={inputCss}
                      value={form.filial_id}
                      onChange={e => setForm(f => ({ ...f, filial_id: e.target.value }))}>
                      <option value="">Sem filial</option>
                      {filiais.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                  ) : (
                    <input style={{ ...inputCss, background: C.surfaceContainerLow, color: C.onSurfaceVariant, cursor: 'default' }}
                      value={filialMap[form.filial_id] || '—'}
                      readOnly />
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '0.5rem' }}>
              <button type="button" style={btnSecondary} onClick={() => setShowForm(false)}>Cancelar</button>
              <button type="submit" style={btnPrimary} disabled={saving}>
                {saving ? 'Salvando...' : (editId ? 'Atualizar' : 'Registrar')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filtros */}
      <div style={{ ...dsCard, marginBottom: '1rem', padding: '1rem 1.5rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '0.75rem' }}>
          <div>
            <Label>De</Label>
            <input type="date" value={filtroInicio}
              onChange={e => setFiltroInicio(e.target.value)}
              style={{ ...inputCss, width: 'auto', minWidth: '145px' }} />
          </div>
          <div>
            <Label>Até</Label>
            <input type="date" value={filtroFim}
              onChange={e => setFiltroFim(e.target.value)}
              style={{ ...inputCss, width: 'auto', minWidth: '145px' }} />
          </div>
          {(isAdmin || filiais.length > 1) && filiais.length > 1 && (
            <div>
              <Label>Filial</Label>
              <select value={filtroFilial} onChange={e => setFiltroFilial(e.target.value)}
                style={{ ...inputCss, width: 'auto', minWidth: '160px' }}>
                <option value="">Todas as filiais</option>
                {filiais.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
          )}
          <button onClick={carregar} style={{ ...btnPrimary, alignSelf: 'flex-end' }}>Filtrar</button>
          <button onClick={() => { setFiltroInicio(firstOfMonthISO()); setFiltroFim(todayISO()); setFiltroFilial('') }}
            style={{ ...btnSecondary, alignSelf: 'flex-end' }}>Limpar</button>
          <span style={{ fontSize: '0.8rem', fontFamily: F.body, color: C.onSurfaceVariant, alignSelf: 'flex-end', marginLeft: 'auto' }}>
            {loading ? '…' : `${registros.length} registro${registros.length !== 1 ? 's' : ''}`}
          </span>
        </div>
      </div>

      {/* Tabela */}
      <div style={dsCard}>
        {loading ? (
          <div style={{ textAlign: 'center', color: C.onSurfaceVariant, fontFamily: F.body, padding: '3rem 0' }}>Carregando...</div>
        ) : registros.length === 0 ? (
          <div style={{ textAlign: 'center', color: C.onSurfaceVariant, fontFamily: F.body, padding: '3rem 0' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎯</div>
            <div style={{ fontWeight: '600' }}>Nenhum registro no período</div>
            <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>Clique em "+ Novo Registro" para começar</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: C.tableHeader, borderBottom: `1.5px solid ${C.borderSubtle}` }}>
                  {[
                    'Data da Consulta', 'Nome do Cliente', 'Nº Venda', 'Vendedor',
                    ...(filiais.length > 1 ? ['Filial'] : []),
                    'Ações',
                  ].map(h => (
                    <th key={h} style={{
                      padding: '0.6rem 0.875rem', textAlign: 'left', fontSize: '0.7rem',
                      fontFamily: F.body, fontWeight: '600', color: C.onSurfaceVariant,
                      textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {registros.map(r => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${C.borderSubtle}` }}
                    onMouseEnter={e => e.currentTarget.style.background = C.surfaceContainerLow}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '0.75rem 0.875rem', fontFamily: F.body, color: C.onSurfaceVariant, whiteSpace: 'nowrap', fontWeight: '600' }}>
                      {fDateBR(r.data_consulta)}
                    </td>
                    <td style={{ padding: '0.75rem 0.875rem', fontFamily: F.body, color: C.onSurface, fontWeight: '600' }}>
                      {r.nome_cliente}
                    </td>
                    <td style={{ padding: '0.75rem 0.875rem' }}>
                      {r.numero_os
                        ? <span style={{ background: C.statusInfoBg, color: C.statusInfo, borderRadius: '0.375rem', padding: '0.15rem 0.5rem', fontSize: '0.78rem', fontFamily: F.mono, fontWeight: '600' }}>#{r.numero_os}</span>
                        : <span style={{ color: C.borderSubtle }}>—</span>}
                    </td>
                    <td style={{ padding: '0.75rem 0.875rem', fontFamily: F.body, color: C.onSurfaceVariant }}>
                      {vendedorMap[r.vendedor_id] || <span style={{ color: C.borderSubtle }}>—</span>}
                    </td>
                    {filiais.length > 1 && (
                      <td style={{ padding: '0.75rem 0.875rem', fontFamily: F.body, color: C.onSurfaceVariant, fontSize: '0.82rem' }}>
                        {filialMap[r.filial_id] || <span style={{ color: C.borderSubtle }}>—</span>}
                      </td>
                    )}
                    <td style={{ padding: '0.75rem 0.875rem' }}>
                      {podeAlterar(r) && (
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button onClick={() => abrirEdicao(r)}
                            style={{
                              padding: '0.3rem 0.6rem', fontSize: '0.78rem', fontFamily: F.body, fontWeight: '600',
                              borderRadius: '0.375rem', border: `1.5px solid ${C.borderSubtle}`,
                              background: C.surfaceContainerLow, color: C.onSurfaceVariant, cursor: 'pointer',
                            }}>Editar</button>
                          <button onClick={() => excluir(r.id)}
                            style={{
                              padding: '0.3rem 0.6rem', fontSize: '0.78rem', fontFamily: F.body, fontWeight: '600',
                              borderRadius: '0.375rem', border: `1.5px solid ${C.outlineVariant}`,
                              background: C.statusDangerBg, color: C.statusDanger, cursor: 'pointer',
                            }}>Excluir</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: `2px solid ${C.borderSubtle}`, background: C.tableHeader }}>
                  <td colSpan={2 + (filiais.length > 1 ? 1 : 0) + 2}
                    style={{ padding: '0.65rem 0.875rem', fontFamily: F.body, fontWeight: '700', color: C.onSurface, fontSize: '0.82rem' }}>
                    TOTAL — {registros.length} consulta{registros.length !== 1 ? 's' : ''}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
