import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { buscarTodos } from '../lib/paginar'
import { useAuth } from '../contexts/AuthContext'
import { C, F, card as dsCard, inputCss, btnPrimary, btnSecondary } from '../lib/ds'

const Label = ({ children }) => (
  <label style={{
    display: 'block', fontSize: '0.8rem', fontWeight: '600',
    color: C.onSurfaceVariant, marginBottom: '0.4rem', textTransform: 'uppercase',
    letterSpacing: '0.5px', fontFamily: F.body,
  }}>{children}</label>
)

const FORM_INIT = { nome: '', cpf: '', telefone: '', endereco: '', filial_id: '' }

export default function Clientes() {
  const { isAdmin, profile } = useAuth()
  const [clientes, setClientes] = useState([])
  const [filiais, setFiliais] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(FORM_INIT)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [busca, setBusca] = useState('')
  const [toast, setToast] = useState(null)

  function showToast(msg, tipo = 'ok') {
    setToast({ msg, tipo })
    setTimeout(() => setToast(null), 3500)
  }

  const carregar = useCallback(async () => {
    setLoading(true)
    const montar = () => {
      let q = supabase.from('clientes').select('*').order('nome', { nullsFirst: false })
      // Vendedor vê só a própria filial (o RLS também garante isso no banco).
      if (!isAdmin && profile?.filial_id) q = q.eq('filial_id', profile.filial_id)
      return q
    }
    const { data } = await buscarTodos(montar, { ordenarPorId: true })
    setClientes(data || [])
    setLoading(false)
  }, [isAdmin, profile?.filial_id])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    supabase.from('filiais').select('*').order('nome').then(({ data }) => setFiliais(data || []))
  }, [])

  function abrirNovo() {
    // Vendedor já entra com a própria filial; admin com filial única pré-selecionada.
    const filialPadrao = !isAdmin
      ? (profile?.filial_id || '')
      : (filiais.length === 1 ? filiais[0].id : '')
    setForm({ ...FORM_INIT, filial_id: filialPadrao })
    setEditId(null)
    setShowForm(true)
  }

  function abrirEdicao(c) {
    setForm({ nome: c.nome || '', cpf: c.cpf || '', telefone: c.telefone || '', endereco: c.endereco || '', filial_id: c.filial_id || '' })
    setEditId(c.id)
    setShowForm(true)
  }

  async function salvar(e) {
    e.preventDefault()
    // Vendedor sempre grava na própria filial; admin escolhe no formulário.
    const filialFinal = isAdmin ? (form.filial_id || null) : (profile?.filial_id || null)
    if (isAdmin && filiais.length > 1 && !filialFinal) {
      showToast('Selecione a filial do cliente.', 'err'); return
    }
    setSaving(true)
    const payload = {
      nome:     form.nome     || null,
      cpf:      form.cpf      || null,
      telefone: form.telefone || null,
      endereco: form.endereco || null,
      filial_id: filialFinal,
    }
    let error
    if (editId) {
      ;({ error } = await supabase.from('clientes').update(payload).eq('id', editId))
    } else {
      ;({ error } = await supabase.from('clientes').insert(payload))
    }
    setSaving(false)
    if (error) {
      showToast('Erro ao salvar: ' + error.message, 'err')
    } else {
      showToast(editId ? 'Cliente atualizado!' : 'Cliente cadastrado!')
      setShowForm(false)
      carregar()
    }
  }

  async function excluir(id) {
    if (!window.confirm('Confirma exclusão deste cliente?')) return
    const { error } = await supabase.from('clientes').delete().eq('id', id)
    if (error) {
      showToast('Erro ao excluir: ' + error.message, 'err')
    } else {
      showToast('Cliente excluído.')
      carregar()
    }
  }

  const filialMap = Object.fromEntries(filiais.map(f => [f.id, f.nome]))

  const listaFiltrada = clientes.filter(c => {
    if (!busca) return true
    const b = busca.toLowerCase()
    return (
      (c.nome     || '').toLowerCase().includes(b) ||
      (c.cpf      || '').includes(b) ||
      (c.telefone || '').includes(b)
    )
  })

  return (
    <div className="pg">
      {toast && (
        <div style={{
          position: 'fixed', top: '1.25rem', right: '1.25rem', zIndex: 9999,
          padding: '0.75rem 1.25rem', borderRadius: '0.75rem', fontSize: '0.875rem',
          fontWeight: '600', color: C.onPrimary, boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          background: toast.tipo === 'err' ? C.statusDanger : C.statusSuccess,
          maxWidth: '320px', fontFamily: F.body,
        }}>{toast.msg}</div>
      )}

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: '800', color: C.onSurface, margin: 0, letterSpacing: '-0.3px', fontFamily: F.headline }}>
          Cadastro de Clientes
        </h1>
        {!showForm && (
          <button style={btnPrimary} onClick={abrirNovo}>+ Novo Cliente</button>
        )}
      </div>

      {/* Formulário */}
      {showForm && (
        <div style={{ ...dsCard, marginBottom: '1.5rem', borderLeft: `4px solid ${C.primaryContainer}` }}>
          <h2 style={{ fontSize: '1rem', fontWeight: '700', color: C.onSurface, margin: '0 0 1.25rem', fontFamily: F.headline }}>
            {editId ? 'Editar Cliente' : 'Novo Cliente'}
          </h2>
          <form onSubmit={salvar} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <Label>Nome</Label>
                <input style={inputCss} placeholder="Nome do cliente"
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
              </div>
              <div>
                <Label>CPF</Label>
                <input style={inputCss} placeholder="000.000.000-00"
                  value={form.cpf}
                  onChange={e => setForm(f => ({ ...f, cpf: e.target.value }))} />
              </div>
              <div>
                <Label>Telefone</Label>
                <input style={inputCss} placeholder="(00) 00000-0000"
                  value={form.telefone}
                  onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} />
              </div>
              {isAdmin && filiais.length > 1 && (
                <div>
                  <Label>Filial</Label>
                  <select style={inputCss} value={form.filial_id}
                    onChange={e => setForm(f => ({ ...f, filial_id: e.target.value }))}>
                    <option value="">Selecione…</option>
                    {filiais.map(fl => <option key={fl.id} value={fl.id}>{fl.nome}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div>
              <Label>Endereço completo</Label>
              <input style={inputCss} placeholder="Rua, número, bairro, cidade, estado, CEP"
                value={form.endereco}
                onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button type="button" style={btnSecondary} onClick={() => setShowForm(false)}>Cancelar</button>
              <button type="submit" style={btnPrimary} disabled={saving}>
                {saving ? 'Salvando...' : (editId ? 'Atualizar' : 'Cadastrar')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Busca */}
      <div style={{ ...dsCard, marginBottom: '1rem', padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <input
            type="search" placeholder="Buscar por nome, CPF ou telefone…"
            value={busca} onChange={e => setBusca(e.target.value)}
            style={{ ...inputCss, maxWidth: '360px' }}
          />
          {!loading && (
            <span style={{ fontSize: '0.8rem', color: C.onSurfaceVariant, fontFamily: F.body }}>
              {listaFiltrada.length} cliente{listaFiltrada.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Tabela */}
      <div style={dsCard}>
        {loading ? (
          <div style={{ textAlign: 'center', color: C.onSurfaceVariant, padding: '2.5rem 0', fontFamily: F.body }}>Carregando...</div>
        ) : listaFiltrada.length === 0 ? (
          <div style={{ textAlign: 'center', color: C.onSurfaceVariant, padding: '3rem 0' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👥</div>
            <div style={{ fontWeight: '600', fontFamily: F.body }}>
              {clientes.length === 0
                ? 'Nenhum cliente cadastrado. Clique em "+ Novo Cliente" para começar.'
                : 'Nenhum resultado para a busca.'}
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: C.tableHeader, borderBottom: `1.5px solid ${C.borderSubtle}` }}>
                  {['Nome', 'CPF', 'Telefone', 'Endereço', ...(isAdmin ? ['Filial'] : []), 'Ações'].map(h => (
                    <th key={h} style={{
                      padding: '0.6rem 0.875rem', textAlign: 'left', fontSize: '0.7rem',
                      fontWeight: '600', color: C.onSurfaceVariant, textTransform: 'uppercase',
                      letterSpacing: '0.06em', whiteSpace: 'nowrap', fontFamily: F.body,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.map(c => (
                  <tr key={c.id} style={{ borderBottom: `1px solid ${C.borderSubtle}` }}
                    onMouseEnter={e => e.currentTarget.style.background = C.surfaceContainerLow}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '0.7rem 0.875rem', fontWeight: '600', color: C.onSurface, fontFamily: F.body }}>
                      {c.nome || <span style={{ color: C.outlineVariant }}>—</span>}
                    </td>
                    <td style={{ padding: '0.7rem 0.875rem', color: C.onSurfaceVariant, fontFamily: F.mono, fontSize: '0.85rem' }}>
                      {c.cpf || <span style={{ color: C.outlineVariant }}>—</span>}
                    </td>
                    <td style={{ padding: '0.7rem 0.875rem' }}>
                      {c.telefone
                        ? <a href={`tel:${c.telefone}`} style={{ color: C.secondary, textDecoration: 'none', fontWeight: '500', fontFamily: F.body }}>{c.telefone}</a>
                        : <span style={{ color: C.outlineVariant }}>—</span>}
                    </td>
                    <td style={{ padding: '0.7rem 0.875rem', color: C.onSurfaceVariant, fontSize: '0.82rem', maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: F.body }}>
                      {c.endereco || <span style={{ color: C.outlineVariant }}>—</span>}
                    </td>
                    {isAdmin && (
                      <td style={{ padding: '0.7rem 0.875rem', color: C.onSurfaceVariant, fontSize: '0.82rem', whiteSpace: 'nowrap', fontFamily: F.body }}>
                        {filialMap[c.filial_id] || <span style={{ color: C.outlineVariant }}>—</span>}
                      </td>
                    )}
                    <td style={{ padding: '0.7rem 0.875rem' }}>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button onClick={() => abrirEdicao(c)}
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem', fontWeight: '600', borderRadius: '0.4rem', border: `1.5px solid ${C.borderSubtle}`, background: C.surfaceContainerLow, color: C.onSurfaceVariant, cursor: 'pointer', fontFamily: F.body }}>
                          Editar
                        </button>
                        {isAdmin && (
                          <button onClick={() => excluir(c.id)}
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem', fontWeight: '600', borderRadius: '0.4rem', border: `1.5px solid ${C.outlineVariant}`, background: C.statusDangerBg, color: C.statusDanger, cursor: 'pointer', fontFamily: F.body }}>
                            Excluir
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
