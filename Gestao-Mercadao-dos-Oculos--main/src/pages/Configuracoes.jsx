import { useState, useEffect, useCallback } from 'react'
import { supabase, createSignupClient } from '../lib/supabase'
import { logErro } from '../lib/erros'
import { useAuth } from '../contexts/AuthContext'
import { useSearchParams } from 'react-router-dom'
import TabBackup from '../components/ConfigBackup'
import { C, F, card as dsCard, inputCss, btnPrimary, btnSecondary } from '../lib/ds'

/* card with marginBottom preserved from original */
const cardMb = { ...dsCard, marginBottom: '1.5rem' }

// Tabela de juros do Boleto MultiCredito por número de parcelas (% total).
const MC_PARCELAS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const MC_TABELA_PADRAO = { 2: 5.05, 3: 6.77, 4: 8.51, 5: 10.27, 6: 12.05, 7: 13.84, 8: 15.65, 9: 17.48, 10: 19.33, 11: 21.20, 12: 23.09 }

// Lista de especialistas salva em configuracoes (JSON; aceita texto separado por vírgula).
function lerListaEspecialistas(valor) {
  if (!valor) return []
  try {
    const l = JSON.parse(valor)
    if (Array.isArray(l)) return l.map(x => String(x).trim()).filter(Boolean)
  } catch { /* formato antigo */ }
  return String(valor).split(',').map(x => x.trim()).filter(Boolean)
}

function Label({ children }) {
  return (
    <label style={{
      display: 'block', fontSize: '0.8rem', fontWeight: '600',
      color: C.onSurfaceVariant, marginBottom: '0.4rem',
      textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: F.body,
    }}>
      {children}
    </label>
  )
}

/* ── Toast ── */
function Toast({ msg }) {
  if (!msg) return null
  const isError = msg.toLowerCase().includes('erro')
  return (
    <div style={{
      position: 'fixed', bottom: '1.5rem', right: '1.5rem',
      padding: '0.875rem 1.25rem',
      background: isError ? C.statusDanger : C.statusSuccess,
      color: C.onPrimary, borderRadius: '0.75rem',
      boxShadow: '0 10px 25px rgba(0,0,0,0.2)', fontSize: '0.875rem',
      fontWeight: '600', fontFamily: F.body, zIndex: 1000,
      display: 'flex', alignItems: 'center', gap: '0.5rem', maxWidth: '340px',
    }}>
      {isError ? '❌' : '✅'} {msg}
    </div>
  )
}

/* ── Modal ── */
function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,45,74,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 500, padding: '1rem',
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: C.surfaceContainerLowest, borderRadius: '1.25rem',
        padding: 'clamp(1rem, 5vw, 2rem)', width: '100%', maxWidth: '480px',
        maxHeight: '90dvh', overflowY: 'auto',
        boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: C.onSurface, fontFamily: F.headline }}>{title}</h3>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.onSurfaceVariant, fontSize: '1.25rem', lineHeight: 1 }}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ── Aba: Sistema ── */
function TabSistema({ showToast }) {
  const [formas, setFormas] = useState([])
  const [novaForma, setNovaForma] = useState('')
  const [categorias, setCategorias] = useState([])
  const [novaCategoria, setNovaCategoria] = useState('')
  const [situacoes, setSituacoes] = useState([])
  const [novaSituacao, setNovaSituacao] = useState('')
  const [tiposVenda, setTiposVenda] = useState([])
  const [novoTipoVenda, setNovoTipoVenda] = useState('')
  const [especialistas, setEspecialistas] = useState([])
  const [novoEspecialista, setNovoEspecialista] = useState('')
  const [parcelasSemJuros, setParcelasSemJuros] = useState('3')
  const [jurosPercent, setJurosPercent] = useState('0')
  const [tabelaMC, setTabelaMC] = useState({ ...MC_TABELA_PADRAO })
  const [comissaoComVenda, setComissaoComVenda] = useState('10')
  const [comissaoSemVenda, setComissaoSemVenda] = useState('5')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadConfig = useCallback(async () => {
    const { data, error } = await supabase.from('configuracoes').select('*')
    if (error) logErro('Carregar configurações', error)
    if (data) {
      const map = Object.fromEntries(data.map(r => [r.chave, r.valor]))
      setFormas((map.formas_pagamento || '').split(',').filter(Boolean))
      setCategorias((map.categorias_despesa || '').split(',').filter(Boolean))
      setSituacoes((map.situacoes_cobranca || '').split(',').filter(Boolean))
      const tipos = (map.tipos_venda || '').split(',').map(t => t.trim()).filter(Boolean)
      setTiposVenda(tipos.length ? tipos : ['Óculos de Grau', 'Solar'])
      setEspecialistas(lerListaEspecialistas(map.especialistas))
      if (map.parcelas_sem_juros != null) setParcelasSemJuros(String(map.parcelas_sem_juros))
      if (map.juros_parcela_percent != null) setJurosPercent(String(map.juros_parcela_percent))
      if (map.juros_multicredito_tabela) {
        try {
          const t = JSON.parse(map.juros_multicredito_tabela)
          if (t && typeof t === 'object') setTabelaMC(prev => ({ ...prev, ...t }))
        } catch { /* mantém o padrão se o valor salvo estiver inválido */ }
      }
      if (map.comissao_captacao_com_venda != null) setComissaoComVenda(String(map.comissao_captacao_com_venda))
      if (map.comissao_captacao_sem_venda != null) setComissaoSemVenda(String(map.comissao_captacao_sem_venda))
    }
    setLoading(false)
  }, [])

  async function salvarParcelamento() {
    setSaving(true)
    const { error } = await supabase.from('configuracoes').upsert([
      { chave: 'parcelas_sem_juros',    valor: String(parseInt(parcelasSemJuros) || 0) },
      { chave: 'juros_parcela_percent', valor: String(parseFloat(String(jurosPercent).replace(',', '.')) || 0) },
    ], { onConflict: 'chave' })
    if (error) logErro('Salvar parcelamento', error)
    showToast(error ? 'Erro ao salvar parcelamento.' : 'Configuração de parcelamento salva!')
    setSaving(false)
  }

  async function salvarMultiCredito() {
    setSaving(true)
    // Normaliza para números antes de salvar.
    const limpo = {}
    MC_PARCELAS.forEach(n => { limpo[n] = parseFloat(String(tabelaMC[n]).replace(',', '.')) || 0 })
    const { error } = await supabase.from('configuracoes').upsert(
      { chave: 'juros_multicredito_tabela', valor: JSON.stringify(limpo) },
      { onConflict: 'chave' })
    if (error) logErro('Salvar tabela MultiCredito', error)
    showToast(error ? 'Erro ao salvar a tabela do MultiCredito.' : 'Tabela do Boleto MultiCredito salva!')
    setSaving(false)
  }
  function setTaxaMC(n, val) { setTabelaMC(prev => ({ ...prev, [n]: val })) }

  async function salvarComissaoCaptacao() {
    setSaving(true)
    const { error } = await supabase.from('configuracoes').upsert([
      { chave: 'comissao_captacao_com_venda', valor: String(parseFloat(String(comissaoComVenda).replace(',', '.')) || 0) },
      { chave: 'comissao_captacao_sem_venda', valor: String(parseFloat(String(comissaoSemVenda).replace(',', '.')) || 0) },
    ], { onConflict: 'chave' })
    if (error) logErro('Salvar comissão de captação', error)
    showToast(error ? 'Erro ao salvar comissão de captação.' : 'Comissão de captação salva!')
    setSaving(false)
  }

  useEffect(() => { loadConfig() }, [loadConfig])

  async function salvarFormas() {
    if (formas.length === 0) return
    setSaving(true)
    const { error } = await supabase
      .from('configuracoes')
      .update({ valor: formas.join(',') })
      .eq('chave', 'formas_pagamento')
    showToast(error ? 'Erro ao salvar formas de pagamento.' : 'Formas de pagamento salvas!')
    setSaving(false)
  }

  function addForma() {
    const f = novaForma.trim()
    if (f && !formas.includes(f)) { setFormas(prev => [...prev, f]); setNovaForma('') }
  }
  function removeForma(f) { setFormas(prev => prev.filter(x => x !== f)) }

  async function salvarCategorias() {
    if (categorias.length === 0) return
    setSaving(true)
    const { error } = await supabase
      .from('configuracoes')
      .update({ valor: categorias.join(',') })
      .eq('chave', 'categorias_despesa')
    showToast(error ? 'Erro ao salvar categorias.' : 'Categorias salvas!')
    setSaving(false)
  }

  function addCategoria() {
    const c = novaCategoria.trim()
    if (c && !categorias.includes(c)) { setCategorias(prev => [...prev, c]); setNovaCategoria('') }
  }
  function removeCategoria(c) { setCategorias(prev => prev.filter(x => x !== c)) }

  async function salvarSituacoes() {
    if (situacoes.length === 0) return
    setSaving(true)
    const { error } = await supabase
      .from('configuracoes')
      .update({ valor: situacoes.join(',') })
      .eq('chave', 'situacoes_cobranca')
    showToast(error ? 'Erro ao salvar situações.' : 'Situações de cobrança salvas!')
    setSaving(false)
  }

  function addSituacao() {
    const s = novaSituacao.trim()
    if (s && !situacoes.includes(s)) { setSituacoes(prev => [...prev, s]); setNovaSituacao('') }
  }
  function removeSituacao(s) { setSituacoes(prev => prev.filter(x => x !== s)) }

  async function salvarTiposVenda() {
    if (tiposVenda.length === 0) return
    setSaving(true)
    const { error } = await supabase
      .from('configuracoes')
      .upsert({ chave: 'tipos_venda', valor: tiposVenda.join(',') }, { onConflict: 'chave' })
    if (error) logErro('Salvar tipos de venda', error)
    showToast(error ? 'Erro ao salvar tipos de venda.' : 'Tipos de venda salvos!')
    setSaving(false)
  }

  function addTipoVenda() {
    const t = novoTipoVenda.trim()
    if (t && !tiposVenda.includes(t)) { setTiposVenda(prev => [...prev, t]); setNovoTipoVenda('') }
  }
  function removeTipoVenda(t) { setTiposVenda(prev => prev.filter(x => x !== t)) }

  // Salva na hora ao adicionar/remover (não depende de clicar em "Salvar").
  async function salvarEspecialistas(lista = especialistas) {
    setSaving(true)
    const { error } = await supabase
      .from('configuracoes')
      .upsert({ chave: 'especialistas', valor: JSON.stringify(lista) }, { onConflict: 'chave' })
    if (error) logErro('Salvar especialistas', error)
    showToast(error ? 'Erro ao salvar especialistas: ' + error.message : 'Especialistas salvos!')
    setSaving(false)
  }
  function addEspecialista() {
    const n = novoEspecialista.trim().replace(/\s+/g, ' ')
    if (n && !especialistas.some(x => x.toLowerCase() === n.toLowerCase())) {
      const lista = [...especialistas, n].sort((a, b) => a.localeCompare(b, 'pt-BR'))
      setEspecialistas(lista)
      setNovoEspecialista('')
      salvarEspecialistas(lista)
    }
  }
  function removeEspecialista(n) {
    const lista = especialistas.filter(x => x !== n)
    setEspecialistas(lista)
    salvarEspecialistas(lista)
  }

  if (loading) return <p style={{ color: C.onSurfaceVariant, fontFamily: F.body }}>Carregando configurações...</p>

  return (
    <>
      {/* Tipos de Venda (Produtos) */}
      <div style={cardMb}>
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: '700', color: C.onSurface, fontFamily: F.headline }}>
          Tipos de Venda (Produtos)
        </h3>
        <p style={{ color: C.onSurfaceVariant, fontSize: '0.82rem', margin: '0 0 1.25rem', lineHeight: '1.5', fontFamily: F.body }}>
          Produtos que aparecem no campo <strong>Tipo de Venda</strong> ao registrar uma venda.
          Tipos que contenham a palavra <strong>"Grau"</strong> usam o <strong>Número da Venda</strong> automático; os demais não.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem', minHeight: '36px' }}>
          {tiposVenda.map(t => (
            <span key={t} style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
              background: C.statusInfoBg, color: C.statusInfo,
              padding: '0.3rem 0.75rem', borderRadius: '999px',
              fontSize: '0.82rem', fontWeight: '500', fontFamily: F.body,
            }}>
              {t}
              <button onClick={() => removeTipoVenda(t)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.statusInfo, fontSize: '1rem', lineHeight: 1, padding: 0, opacity: 0.6 }}
                title={`Remover ${t}`}>×</button>
            </span>
          ))}
          {tiposVenda.length === 0 && (
            <span style={{ color: C.outlineVariant, fontSize: '0.85rem', fontFamily: F.body }}>Nenhum tipo cadastrado.</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <input type="text" value={novoTipoVenda} onChange={e => setNovoTipoVenda(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTipoVenda())}
            placeholder="Ex: Lentes de contato" style={{ ...inputCss, flex: 1 }} />
          <button onClick={addTipoVenda} style={btnSecondary}>+ Adicionar</button>
        </div>
        <button onClick={salvarTiposVenda} disabled={saving || tiposVenda.length === 0} style={btnPrimary}>
          {saving ? 'Salvando...' : 'Salvar Tipos de Venda'}
        </button>
      </div>

      {/* Especialistas (exame de vista) */}
      <div style={cardMb}>
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: '700', color: C.onSurface, fontFamily: F.headline }}>
          Especialistas (Exame de Vista)
        </h3>
        <p style={{ color: C.onSurfaceVariant, fontSize: '0.82rem', margin: '0 0 1.25rem', lineHeight: '1.5', fontFamily: F.body }}>
          Nomes que aparecem na busca do campo <strong>Especialista</strong> ao registrar uma venda.
          O acompanhamento das vendas por especialista fica na aba <strong>Comissões</strong>.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem', minHeight: '36px' }}>
          {especialistas.map(n => (
            <span key={n} style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
              background: C.statusInfoBg, color: C.statusInfo,
              padding: '0.3rem 0.75rem', borderRadius: '999px',
              fontSize: '0.82rem', fontWeight: '500', fontFamily: F.body,
            }}>
              {n}
              <button onClick={() => removeEspecialista(n)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.statusInfo, fontSize: '1rem', lineHeight: 1, padding: 0, opacity: 0.6 }}
                title={`Remover ${n}`}>×</button>
            </span>
          ))}
          {especialistas.length === 0 && (
            <span style={{ color: C.outlineVariant, fontSize: '0.85rem', fontFamily: F.body }}>Nenhum especialista cadastrado.</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <input type="text" value={novoEspecialista} onChange={e => setNovoEspecialista(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addEspecialista())}
            placeholder="Nome do especialista" style={{ ...inputCss, flex: 1 }} />
          <button onClick={addEspecialista} style={btnSecondary}>+ Adicionar</button>
        </div>
        <button onClick={() => salvarEspecialistas()} disabled={saving} style={btnPrimary}>
          {saving ? 'Salvando...' : 'Salvar Especialistas'}
        </button>
      </div>

      {/* Formas de Pagamento */}
      <div style={cardMb}>
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: '700', color: C.onSurface, fontFamily: F.headline }}>
          Formas de Pagamento
        </h3>
        <p style={{ color: C.onSurfaceVariant, fontSize: '0.82rem', margin: '0 0 1.25rem', lineHeight: '1.5', fontFamily: F.body }}>
          Gerencie as opções disponíveis no cadastro de vendas.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem', minHeight: '36px' }}>
          {formas.map(f => (
            <span key={f} style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
              background: C.statusInfoBg, color: C.statusInfo,
              padding: '0.3rem 0.75rem', borderRadius: '999px',
              fontSize: '0.82rem', fontWeight: '500', fontFamily: F.body,
            }}>
              {f}
              <button onClick={() => removeForma(f)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.statusInfo, fontSize: '1rem', lineHeight: 1, padding: 0, opacity: 0.6 }}
                title={`Remover ${f}`}>×</button>
            </span>
          ))}
          {formas.length === 0 && (
            <span style={{ color: C.outlineVariant, fontSize: '0.85rem', fontFamily: F.body }}>Nenhuma forma cadastrada.</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <input type="text" value={novaForma} onChange={e => setNovaForma(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addForma())}
            placeholder="Ex: Transferência" style={{ ...inputCss, flex: 1 }} />
          <button onClick={addForma} style={btnSecondary}>+ Adicionar</button>
        </div>
        <button onClick={salvarFormas} disabled={saving || formas.length === 0} style={btnPrimary}>
          {saving ? 'Salvando...' : 'Salvar Formas de Pagamento'}
        </button>
      </div>

      {/* Categorias de Despesa */}
      <div style={cardMb}>
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: '700', color: C.onSurface, fontFamily: F.headline }}>
          Categorias de Despesa
        </h3>
        <p style={{ color: C.onSurfaceVariant, fontSize: '0.82rem', margin: '0 0 1.25rem', lineHeight: '1.5', fontFamily: F.body }}>
          Gerencie as categorias disponíveis no módulo de Contas a Pagar.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem', minHeight: '36px' }}>
          {categorias.map(c => (
            <span key={c} style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
              background: C.statusDangerBg, color: C.statusDanger,
              padding: '0.3rem 0.75rem', borderRadius: '999px',
              fontSize: '0.82rem', fontWeight: '500', fontFamily: F.body,
            }}>
              {c}
              <button onClick={() => removeCategoria(c)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.statusDanger, fontSize: '1rem', lineHeight: 1, padding: 0, opacity: 0.6 }}
                title={`Remover ${c}`}>×</button>
            </span>
          ))}
          {categorias.length === 0 && (
            <span style={{ color: C.outlineVariant, fontSize: '0.85rem', fontFamily: F.body }}>Nenhuma categoria cadastrada.</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <input type="text" value={novaCategoria} onChange={e => setNovaCategoria(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCategoria())}
            placeholder="Ex: Manutenção" style={{ ...inputCss, flex: 1 }} />
          <button onClick={addCategoria} style={btnSecondary}>+ Adicionar</button>
        </div>
        <button onClick={salvarCategorias} disabled={saving || categorias.length === 0} style={btnPrimary}>
          {saving ? 'Salvando...' : 'Salvar Categorias'}
        </button>
      </div>

      {/* Situações de Cobrança */}
      <div style={cardMb}>
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: '700', color: C.onSurface, fontFamily: F.headline }}>
          Situações de Cobrança
        </h3>
        <p style={{ color: C.onSurfaceVariant, fontSize: '0.82rem', margin: '0 0 1.25rem', lineHeight: '1.5', fontFamily: F.body }}>
          Opções disponíveis no campo "Situação Atual" de cada boleto no módulo de Cobranças.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem', minHeight: '36px' }}>
          {situacoes.map(s => (
            <span key={s} style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
              background: 'rgba(157,5,24,0.08)', color: '#9d0518',
              padding: '0.3rem 0.75rem', borderRadius: '999px',
              fontSize: '0.82rem', fontWeight: '500', fontFamily: F.body,
            }}>
              {s}
              <button onClick={() => removeSituacao(s)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9d0518', fontSize: '1rem', lineHeight: 1, padding: 0, opacity: 0.6 }}
                title={`Remover ${s}`}>×</button>
            </span>
          ))}
          {situacoes.length === 0 && (
            <span style={{ color: C.outlineVariant, fontSize: '0.85rem', fontFamily: F.body }}>Nenhuma situação cadastrada.</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <input type="text" value={novaSituacao} onChange={e => setNovaSituacao(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSituacao())}
            placeholder="Ex: Renegociado" style={{ ...inputCss, flex: 1 }} />
          <button onClick={addSituacao} style={btnSecondary}>+ Adicionar</button>
        </div>
        <button onClick={salvarSituacoes} disabled={saving || situacoes.length === 0} style={btnPrimary}>
          {saving ? 'Salvando...' : 'Salvar Situações de Cobrança'}
        </button>
      </div>

      {/* Parcelamento (juros) */}
      <div style={cardMb}>
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: '700', color: C.onSurface, fontFamily: F.headline }}>
          Parcelamento e Juros
        </h3>
        <p style={{ color: C.onSurfaceVariant, fontSize: '0.82rem', margin: '0 0 1.25rem', lineHeight: '1.5', fontFamily: F.body }}>
          Defina até quantas parcelas são aceitas <strong>sem juros</strong> e o <strong>percentual de juros ao mês</strong> aplicado acima disso.
          No cadastro de venda, as parcelas acima do limite são calculadas automaticamente com juros (tabela Price).
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: C.onSurfaceVariant, marginBottom: '0.3rem', fontFamily: F.body }}>
              Parcelas sem juros (até)
            </label>
            <input type="number" min="1" max="36" step="1" value={parcelasSemJuros}
              onChange={e => setParcelasSemJuros(e.target.value)}
              onFocus={e => e.target.select()}
              style={inputCss} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: C.onSurfaceVariant, marginBottom: '0.3rem', fontFamily: F.body }}>
              Juros ao mês (%) acima do limite
            </label>
            <input type="number" min="0" step="0.1" value={jurosPercent}
              onChange={e => setJurosPercent(e.target.value)}
              onFocus={e => e.target.select()}
              placeholder="Ex: 2,5" style={inputCss} />
          </div>
        </div>
        <button onClick={salvarParcelamento} disabled={saving} style={btnPrimary}>
          {saving ? 'Salvando...' : 'Salvar Parcelamento'}
        </button>
      </div>

      {/* Boleto MultiCredito — Tabela de Juros por parcela */}
      <div style={cardMb}>
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: '700', color: C.onSurface, fontFamily: F.headline }}>
          Boleto MultiCredito — Tabela de Juros
        </h3>
        <p style={{ color: C.onSurfaceVariant, fontSize: '0.82rem', margin: '0 0 1.25rem', lineHeight: '1.5', fontFamily: F.body }}>
          Percentual de juros <strong>por número de parcelas</strong> aplicado ao valor financiado no
          <strong> Boleto MultiCredito</strong>. Ex.: em 3× com 6,77%, o restante é acrescido de 6,77% e dividido em 3.
          Vale só para essa forma de pagamento; as demais parceladas usam o "Parcelamento e Juros" acima.
        </p>
        <div style={{ overflowX: 'auto', marginBottom: '1.25rem' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr>
                {MC_PARCELAS.map(n => (
                  <th key={n} style={{ padding: '0.4rem 0.5rem', textAlign: 'center', fontSize: '0.72rem', fontWeight: '700', color: C.onSurfaceVariant, fontFamily: F.body, borderBottom: `1px solid ${C.borderSubtle}` }}>{n}×</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {MC_PARCELAS.map(n => (
                  <td key={n} style={{ padding: '0.3rem 0.35rem' }}>
                    <input type="number" min="0" step="0.01" value={tabelaMC[n] ?? ''}
                      onChange={e => setTaxaMC(n, e.target.value)}
                      onFocus={e => e.target.select()}
                      style={{ ...inputCss, width: '78px', padding: '0.35rem 0.4rem', textAlign: 'center', fontFamily: F.mono }} />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: '0.75rem', color: C.onSurfaceVariant, fontFamily: F.body, marginBottom: '0.75rem' }}>
          Valores em % (ex.: 6,77). Em 1× não há juros.
        </div>
        <button onClick={salvarMultiCredito} disabled={saving} style={btnPrimary}>
          {saving ? 'Salvando...' : 'Salvar Tabela MultiCredito'}
        </button>
      </div>

      {/* Comissão de Captação */}
      <div style={cardMb}>
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: '700', color: C.onSurface, fontFamily: F.headline }}>
          Comissão de Captação
        </h3>
        <p style={{ color: C.onSurfaceVariant, fontSize: '0.82rem', margin: '0 0 1.25rem', lineHeight: '1.5', fontFamily: F.body }}>
          Valor pago ao vendedor por cada captação registrada na aba Captação de Clientes.
          Quando a captação tem <strong>número da venda</strong> preenchido, vale o primeiro valor;
          quando <strong>não tem</strong>, vale o segundo. Esses totais aparecem na aba Comissões.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: C.onSurfaceVariant, marginBottom: '0.3rem', fontFamily: F.body }}>
              Com número da venda (R$)
            </label>
            <input type="number" min="0" step="0.01" value={comissaoComVenda}
              onChange={e => setComissaoComVenda(e.target.value)}
              onFocus={e => e.target.select()}
              placeholder="Ex: 10" style={inputCss} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: C.onSurfaceVariant, marginBottom: '0.3rem', fontFamily: F.body }}>
              Sem número da venda (R$)
            </label>
            <input type="number" min="0" step="0.01" value={comissaoSemVenda}
              onChange={e => setComissaoSemVenda(e.target.value)}
              onFocus={e => e.target.select()}
              placeholder="Ex: 5" style={inputCss} />
          </div>
        </div>
        <button onClick={salvarComissaoCaptacao} disabled={saving} style={btnPrimary}>
          {saving ? 'Salvando...' : 'Salvar Comissão de Captação'}
        </button>
      </div>
    </>
  )
}

/* ── Aba: Filiais ── */
const FILIAL_INIT = { nome: '', os_numero_inicial: '1', sequencia_vendas: true }

function TabFiliais({ showToast }) {
  const [filiais, setFiliais] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(FILIAL_INIT)
  const [saving, setSaving] = useState(false)

  const loadFiliais = useCallback(async () => {
    const { data, error } = await supabase.from('filiais').select('*').order('nome')
    if (error) logErro('Carregar filiais (configurações)', error)
    setFiliais(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadFiliais() }, [loadFiliais])

  function openAdd() { setForm(FILIAL_INIT); setModal('add') }
  function openEdit(f) {
    setForm({ nome: f.nome, os_numero_inicial: String(f.os_numero_inicial || 1), sequencia_vendas: f.sequencia_vendas !== false })
    setModal({ type: 'edit', data: f })
  }

  async function handleSave() {
    if (!form.nome.trim()) return showToast('Erro: informe o nome da filial.')
    setSaving(true)
    const payload = { nome: form.nome.trim(), os_numero_inicial: parseInt(form.os_numero_inicial) || 1, sequencia_vendas: !!form.sequencia_vendas }
    let error
    if (modal === 'add') {
      ;({ error } = await supabase.from('filiais').insert(payload))
    } else {
      ;({ error } = await supabase.from('filiais').update(payload).eq('id', modal.data.id))
    }
    setSaving(false)
    if (error) {
      showToast('Erro ao salvar: ' + error.message)
    } else {
      showToast(modal === 'add' ? 'Filial criada!' : 'Filial atualizada!')
      setModal(null)
      await loadFiliais()
    }
  }

  async function excluir(f) {
    if (!window.confirm(`Excluir filial "${f.nome}"? Dados vinculados perderão a referência.`)) return
    const { error } = await supabase.from('filiais').delete().eq('id', f.id)
    if (error) {
      showToast('Erro ao excluir: ' + error.message)
    } else {
      showToast('Filial excluída.')
      await loadFiliais()
    }
  }

  if (loading) return <p style={{ color: C.onSurfaceVariant, fontFamily: F.body }}>Carregando filiais...</p>

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <p style={{ margin: 0, color: C.onSurfaceVariant, fontSize: '0.875rem', fontFamily: F.body }}>
          {filiais.length} {filiais.length === 1 ? 'filial cadastrada' : 'filiais cadastradas'}
        </p>
        <button onClick={openAdd} style={btnPrimary}>+ Nova Filial</button>
      </div>

      <div style={{
        background: C.surfaceContainerLowest, borderRadius: '0.5rem',
        border: `1px solid ${C.borderSubtle}`, overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: C.tableHeader, borderBottom: `1px solid ${C.borderSubtle}` }}>
              {['Nome', 'N.º Venda Inicial', 'Sequência', 'Ações'].map(col => (
                <th key={col} style={{
                  textAlign: 'left', padding: '0.875rem 1rem',
                  fontSize: '0.7rem', fontWeight: '600', color: C.onSurfaceVariant,
                  textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: F.body,
                }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filiais.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: '2.5rem', textAlign: 'center', color: C.outlineVariant, fontSize: '0.9rem', fontFamily: F.body }}>
                  Nenhuma filial cadastrada. Clique em "+ Nova Filial" para começar.
                </td>
              </tr>
            )}
            {filiais.map((f, i) => (
              <tr key={f.id}
                style={{ borderBottom: i < filiais.length - 1 ? `1px solid ${C.borderSubtle}` : 'none' }}
                onMouseEnter={e => e.currentTarget.style.background = C.surfaceContainerLow}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ padding: '0.875rem 1rem', fontWeight: '600', color: C.onSurface, fontFamily: F.body }}>{f.nome}</td>
                <td style={{ padding: '0.875rem 1rem', color: C.onSurfaceVariant, fontFamily: F.mono }}>{f.os_numero_inicial}</td>
                <td style={{ padding: '0.875rem 1rem' }}>
                  <span style={{
                    display: 'inline-block', padding: '0.2rem 0.625rem', borderRadius: '999px',
                    fontSize: '0.75rem', fontWeight: '600', fontFamily: F.body,
                    background: f.sequencia_vendas !== false ? C.statusSuccessBg : C.surfaceContainerLow,
                    color: f.sequencia_vendas !== false ? C.statusSuccess : C.onSurfaceVariant,
                  }}>
                    {f.sequencia_vendas !== false ? 'Automática' : 'Manual'}
                  </span>
                </td>
                <td style={{ padding: '0.875rem 1rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => openEdit(f)}
                      style={{ padding: '0.3rem 0.75rem', background: 'none', border: `1.5px solid ${C.borderSubtle}`, borderRadius: '0.5rem', color: C.onSurfaceVariant, fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer', fontFamily: F.body }}>
                      Editar
                    </button>
                    <button onClick={() => excluir(f)}
                      style={{ padding: '0.3rem 0.75rem', background: 'none', border: `1.5px solid ${C.outlineVariant}`, borderRadius: '0.5rem', color: C.statusDanger, fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer', fontFamily: F.body }}>
                      Excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '1rem', background: C.statusInfoBg, border: `1px solid ${C.secondaryContainer}`, borderRadius: '0.75rem', padding: '0.875rem 1.25rem', fontSize: '0.8rem', color: C.statusInfo, lineHeight: '1.5', fontFamily: F.body }}>
        ℹ️ O <strong>N.º O.S. Inicial</strong> define a partir de qual número as ordens de serviço de <strong>Óculos de Grau</strong> são geradas para cada filial.
        Vendas do tipo <strong>Solar</strong> não recebem número de O.S.
      </div>

      {modal && (
        <Modal title={modal === 'add' ? 'Nova Filial' : 'Editar Filial'} onClose={() => setModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <Label>Nome da Filial *</Label>
              <input type="text" style={inputCss} autoFocus
                value={form.nome}
                onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
                placeholder="Ex: Filial Centro" />
            </div>
            <div>
              <Label>N.º O.S. Inicial</Label>
              <input type="number" min="1" style={{ ...inputCss, width: '130px' }}
                value={form.os_numero_inicial}
                onChange={e => setForm(p => ({ ...p, os_numero_inicial: e.target.value }))} />
              <p style={{ margin: '0.3rem 0 0', color: C.onSurfaceVariant, fontSize: '0.75rem', fontFamily: F.body }}>
                Usado quando a numeração é automática: próximo número = maior já registrado + 1 (ou este valor se não houver nenhum).
              </p>
            </div>
            <div>
              <Label>Numeração do Nº da Venda</Label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox"
                  checked={!!form.sequencia_vendas}
                  onChange={e => setForm(p => ({ ...p, sequencia_vendas: e.target.checked }))}
                  style={{ width: '1rem', height: '1rem', accentColor: '#9d0518' }} />
                <span style={{ fontSize: '0.88rem', fontFamily: F.body, color: C.onSurface }}>
                  Seguir sequência automática
                </span>
              </label>
              <p style={{ margin: '0.3rem 0 0', color: C.onSurfaceVariant, fontSize: '0.75rem', fontFamily: F.body }}>
                Marcado: o sistema sugere o próximo número (você ainda pode alterar). Desmarcado: o número fica em branco para digitação livre.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button onClick={() => setModal(null)} style={{ ...btnSecondary, flex: 1 }}>Cancelar</button>
              <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, flex: 1, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

/* ── Aba: Vendedores ── */
const PAPEL_LABEL = { admin: 'Administrador', vendedor: 'Vendedor' }
const FORM_INITIAL = { nome: '', email: '', senha: '', papel: 'vendedor', comissao_percentual: '0', filial_id: '' }

function TabVendedores({ showToast }) {
  const [vendedores, setVendedores] = useState([])
  const [filiais, setFiliais] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(FORM_INITIAL)
  const [modalError, setModalError] = useState('')
  const [saving, setSaving] = useState(false)
  const [mostrarInativos, setMostrarInativos] = useState(false)

  const loadVendedores = useCallback(async () => {
    const [{ data: perfis }, { data: fils }] = await Promise.all([
      supabase.from('profiles').select('*').order('nome'),
      supabase.from('filiais').select('*').order('nome'),
    ])
    setVendedores(perfis || [])
    setFiliais(fils || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadVendedores() }, [loadVendedores])

  function openAdd() { setForm(FORM_INITIAL); setModalError(''); setModal('add') }
  function openEdit(v) {
    setForm({ id: v.id, nome: v.nome, email: v.email || '', senha: '', papel: v.papel, comissao_percentual: String(v.comissao_percentual ?? 0), filial_id: v.filial_id || '' })
    setModalError('')
    setModal({ type: 'edit', data: v })
  }
  function fecharModal() { setModal(null); setModalError('') }
  function setField(key, value) { setForm(prev => ({ ...prev, [key]: value })) }

  async function handleAdd() {
    if (!form.nome.trim() || !form.email.trim() || !form.senha) {
      setModalError('Preencha nome, e-mail e senha.'); return
    }
    if (form.senha.length < 6) { setModalError('A senha deve ter pelo menos 6 caracteres.'); return }
    setSaving(true); setModalError('')
    // Cria o usuário num cliente isolado, para não substituir a sessão do admin.
    const signupClient = createSignupClient()
    const { data, error } = await signupClient.auth.signUp({
      email: form.email.trim(), password: form.senha,
      options: { data: { nome: form.nome.trim() } },
    })
    if (error) { setModalError('Erro ao criar usuário: ' + error.message); setSaving(false); return }
    if (data.user) {
      // O papel/comissão/filial são definidos pelo admin (cliente principal),
      // pois só o admin tem permissão para gravar esses campos.
      const { error: upErr } = await supabase.from('profiles').update({
        nome: form.nome.trim(), papel: form.papel,
        comissao_percentual: parseFloat(form.comissao_percentual) || 0,
        filial_id: form.filial_id || null,
      }).eq('id', data.user.id)
      if (upErr) { setModalError('Usuário criado, mas houve erro ao definir o perfil: ' + upErr.message); setSaving(false); await loadVendedores(); return }
    }
    setSaving(false); fecharModal(); await loadVendedores()
    showToast('Vendedor criado com sucesso!')
  }

  async function handleEdit() {
    if (!form.nome.trim()) { setModalError('O nome não pode estar vazio.'); return }
    setSaving(true); setModalError('')
    const { error } = await supabase.from('profiles').update({
      nome: form.nome.trim(), papel: form.papel,
      comissao_percentual: parseFloat(form.comissao_percentual) || 0,
      filial_id: form.filial_id || null,
    }).eq('id', form.id)
    if (error) { setModalError('Erro ao atualizar: ' + error.message); setSaving(false); return }
    setSaving(false); fecharModal(); await loadVendedores()
    showToast('Vendedor atualizado com sucesso!')
  }

  async function toggleAtivo(v) {
    await supabase.from('profiles').update({ ativo: !v.ativo }).eq('id', v.id)
    await loadVendedores()
    showToast(v.ativo ? 'Vendedor desativado.' : 'Vendedor ativado!')
  }

  const filialMap = Object.fromEntries(filiais.map(f => [f.id, f.nome]))
  const qtdInativos = vendedores.filter(v => !v.ativo).length
  const vendedoresVisiveis = mostrarInativos ? vendedores : vendedores.filter(v => v.ativo)

  if (loading) return <p style={{ color: C.onSurfaceVariant, fontFamily: F.body }}>Carregando vendedores...</p>

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <p style={{ margin: 0, color: C.onSurfaceVariant, fontSize: '0.875rem', fontFamily: F.body }}>
            {vendedoresVisiveis.length} {vendedoresVisiveis.length === 1 ? 'pessoa' : 'pessoas'}
          </p>
          {qtdInativos > 0 && (
            <button onClick={() => setMostrarInativos(v => !v)}
              style={{ padding: '0.3rem 0.7rem', background: 'none', border: `1.5px solid ${C.borderSubtle}`, borderRadius: '0.5rem', color: C.onSurfaceVariant, fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer', fontFamily: F.body }}>
              {mostrarInativos ? 'Mostrar só ativos' : `Mostrar inativos (${qtdInativos})`}
            </button>
          )}
        </div>
        <button onClick={openAdd} style={btnPrimary}>+ Adicionar Vendedor</button>
      </div>

      <div style={{
        background: C.surfaceContainerLowest, borderRadius: '0.5rem',
        border: `1px solid ${C.borderSubtle}`, overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: C.tableHeader, borderBottom: `1px solid ${C.borderSubtle}` }}>
                {['Nome', 'E-mail', 'Papel', 'Filial', 'Comissão', 'Status', 'Ações'].map(col => (
                  <th key={col} style={{
                    textAlign: 'left', padding: '0.875rem 1rem',
                    fontSize: '0.7rem', fontWeight: '600', color: C.onSurfaceVariant,
                    textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', fontFamily: F.body,
                  }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vendedoresVisiveis.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: '2.5rem', textAlign: 'center', color: C.outlineVariant, fontSize: '0.9rem', fontFamily: F.body }}>
                    Nenhum vendedor cadastrado ainda.
                  </td>
                </tr>
              )}
              {vendedoresVisiveis.map((v, i) => (
                <tr key={v.id}
                  style={{ borderBottom: i < vendedoresVisiveis.length - 1 ? `1px solid ${C.borderSubtle}` : 'none', transition: 'background 0.1s', opacity: v.ativo ? 1 : 0.6 }}
                  onMouseEnter={e => e.currentTarget.style.background = C.surfaceContainerLow}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '0.875rem 1rem', fontWeight: '600', color: C.onSurface, fontSize: '0.875rem', fontFamily: F.body }}>{v.nome}</td>
                  <td style={{ padding: '0.875rem 1rem', color: C.onSurfaceVariant, fontSize: '0.875rem', fontFamily: F.body }}>{v.email || '—'}</td>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    <span style={{
                      display: 'inline-block', padding: '0.2rem 0.625rem', borderRadius: '999px',
                      fontSize: '0.75rem', fontWeight: '600', fontFamily: F.body,
                      background: v.papel === 'admin' ? '#faf5ff' : C.statusInfoBg,
                      color: v.papel === 'admin' ? '#7c3aed' : C.statusInfo,
                    }}>
                      {PAPEL_LABEL[v.papel] || v.papel}
                    </span>
                  </td>
                  <td style={{ padding: '0.875rem 1rem', color: C.onSurfaceVariant, fontSize: '0.875rem', fontFamily: F.body }}>
                    {filialMap[v.filial_id] || '—'}
                  </td>
                  <td style={{ padding: '0.875rem 1rem', color: C.onSurfaceVariant, fontSize: '0.875rem', fontFamily: F.mono }}>
                    {v.comissao_percentual ?? 0}%
                  </td>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    <span style={{
                      display: 'inline-block', padding: '0.2rem 0.625rem', borderRadius: '999px',
                      fontSize: '0.75rem', fontWeight: '600', fontFamily: F.body,
                      background: v.ativo ? C.statusSuccessBg : C.surfaceContainerLow,
                      color: v.ativo ? C.statusSuccess : C.onSurfaceVariant,
                    }}>
                      {v.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button onClick={() => openEdit(v)}
                        style={{ padding: '0.3rem 0.75rem', background: 'none', border: `1.5px solid ${C.borderSubtle}`, borderRadius: '0.5rem', color: C.onSurfaceVariant, fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer', fontFamily: F.body }}>
                        Editar
                      </button>
                      <button onClick={() => toggleAtivo(v)}
                        style={{ padding: '0.3rem 0.75rem', background: 'none', border: `1.5px solid ${v.ativo ? C.outlineVariant : C.statusSuccessBg}`, borderRadius: '0.5rem', color: v.ativo ? C.statusDanger : C.statusSuccess, fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer', fontFamily: F.body }}>
                        {v.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: '1rem', background: C.statusWarningBg, border: `1px solid ${C.outlineVariant}`, borderRadius: '0.75rem', padding: '0.875rem 1.25rem', fontSize: '0.8rem', color: C.statusWarning, lineHeight: '1.5', fontFamily: F.body }}>
        ⚠️ <strong>Atenção:</strong> Ao adicionar um novo vendedor, ele receberá um e-mail de confirmação para ativar a conta.
      </div>

      {modal && (
        <Modal
          title={modal === 'add' ? 'Adicionar Vendedor' : 'Editar Vendedor'}
          onClose={fecharModal}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <Label>Nome completo *</Label>
              <input type="text" value={form.nome} onChange={e => setField('nome', e.target.value)}
                style={inputCss} placeholder="João da Silva" autoFocus />
            </div>
            {modal === 'add' && (
              <>
                <div>
                  <Label>E-mail *</Label>
                  <input type="email" value={form.email} onChange={e => setField('email', e.target.value)}
                    style={inputCss} placeholder="joao@exemplo.com" />
                </div>
                <div>
                  <Label>Senha inicial *</Label>
                  <input type="password" value={form.senha} onChange={e => setField('senha', e.target.value)}
                    style={inputCss} placeholder="Mínimo 6 caracteres" />
                  <p style={{ margin: '0.3rem 0 0', color: C.onSurfaceVariant, fontSize: '0.75rem', fontFamily: F.body }}>
                    O vendedor poderá trocar a senha depois de confirmar o e-mail.
                  </p>
                </div>
              </>
            )}
            <div>
              <Label>Papel</Label>
              <select value={form.papel} onChange={e => setField('papel', e.target.value)} style={inputCss}>
                <option value="vendedor">Vendedor</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <div>
              <Label>Filial</Label>
              <select value={form.filial_id} onChange={e => setField('filial_id', e.target.value)} style={inputCss}>
                <option value="">Sem filial</option>
                {filiais.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
            <div>
              <Label>Comissão (%)</Label>
              <input type="number" value={form.comissao_percentual}
                onChange={e => setField('comissao_percentual', e.target.value)}
                style={{ ...inputCss, width: '130px' }} min="0" max="100" step="0.5" />
            </div>
            {modalError && (
              <div style={{ background: C.statusDangerBg, border: `1px solid ${C.outlineVariant}`, borderRadius: '0.5rem', padding: '0.625rem 0.875rem', color: C.statusDanger, fontSize: '0.82rem', fontFamily: F.body }}>
                {modalError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button onClick={fecharModal} style={{ ...btnSecondary, flex: 1 }}>Cancelar</button>
              <button onClick={modal === 'add' ? handleAdd : handleEdit} disabled={saving}
                style={{ ...btnPrimary, flex: 1, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

/* ── Aba Sugestões (enviadas pelo balãozinho) ── */
function TabSugestoes({ showToast }) {
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [mostrarLidas, setMostrarLidas] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('sugestoes').select('*').order('created_at', { ascending: false }).limit(500)
    if (error) { logErro('Carregar sugestões', error); setErro(error.message) } else setErro('')
    setLista(data || [])
    setLoading(false)
  }, [])
  useEffect(() => { carregar() }, [carregar])

  async function marcar(s, lida) {
    const { error } = await supabase.from('sugestoes').update({ lida }).eq('id', s.id)
    if (error) return showToast('Erro: ' + error.message)
    setLista(prev => prev.map(x => x.id === s.id ? { ...x, lida } : x))
  }
  async function excluir(s) {
    if (!window.confirm('Excluir esta sugestão?')) return
    const { error } = await supabase.from('sugestoes').delete().eq('id', s.id)
    if (error) return showToast('Erro: ' + error.message)
    setLista(prev => prev.filter(x => x.id !== s.id))
  }

  const naoLidas = lista.filter(s => !s.lida).length
  const visiveis = lista.filter(s => mostrarLidas || !s.lida)

  if (loading) return <p style={{ color: C.onSurfaceVariant, fontFamily: F.body }}>Carregando sugestões...</p>

  return (
    <div style={cardMb}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: C.onSurface, fontFamily: F.headline }}>
          Sugestões de melhoria {naoLidas > 0 && <span style={{ color: C.primaryContainer }}>· {naoLidas} nova{naoLidas !== 1 ? 's' : ''}</span>}
        </h3>
        <label style={{ fontSize: '0.82rem', color: C.onSurfaceVariant, fontFamily: F.body, display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={mostrarLidas} onChange={e => setMostrarLidas(e.target.checked)} />
          Mostrar as já lidas
        </label>
      </div>
      {erro && (
        <p style={{ color: C.error, fontSize: '0.85rem', fontFamily: F.body }}>Não foi possível carregar as sugestões: {erro}</p>
      )}
      {!erro && visiveis.length === 0 && (
        <p style={{ color: C.outlineVariant, fontSize: '0.9rem', fontFamily: F.body, margin: 0 }}>
          {lista.length === 0 ? 'Nenhuma sugestão recebida ainda.' : 'Nenhuma sugestão nova.'}
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {visiveis.map(s => (
          <div key={s.id} style={{
            border: `1px solid ${C.borderSubtle}`, borderRadius: '0.5rem', padding: '0.85rem 1rem',
            background: s.lida ? C.surfaceContainerLow : C.surfaceContainerLowest,
          }}>
            <div style={{ fontSize: '0.75rem', color: C.onSurfaceVariant, fontFamily: F.body, marginBottom: '0.4rem' }}>
              {new Date(s.created_at).toLocaleString('pt-BR')} · <strong>{s.autor_nome || 'Usuário'}</strong>
              {s.pagina && <> · tela {s.pagina}</>}
            </div>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem', color: C.onSurface, fontFamily: F.body, lineHeight: 1.5 }}>{s.texto}</div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
              <button onClick={() => marcar(s, !s.lida)} style={{ ...btnSecondary, padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}>
                {s.lida ? 'Marcar como nova' : 'Marcar como lida'}
              </button>
              <button onClick={() => excluir(s)} style={{ ...btnSecondary, padding: '0.3rem 0.75rem', fontSize: '0.8rem', color: C.statusDanger }}>
                Excluir
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Página principal ── */
export default function Configuracoes() {
  const { isAdmin, loading } = useAuth()
  const [params] = useSearchParams()
  const [activeTab, setActiveTab] = useState(() => params.get('aba') || 'sistema')
  useEffect(() => { const a = params.get('aba'); if (a) setActiveTab(a) }, [params])
  const [toast, setToast] = useState('')

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  if (loading) return null

  if (!isAdmin) {
    return (
      <div style={{ padding: '2rem' }}>
        <div style={{
          background: C.statusDangerBg, border: `1px solid ${C.outlineVariant}`,
          borderRadius: '1rem', padding: '2rem', textAlign: 'center', color: C.statusDanger,
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔒</div>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', fontFamily: F.headline }}>Acesso Restrito</h2>
          <p style={{ margin: 0, color: C.statusDanger, fontSize: '0.875rem', fontFamily: F.body }}>
            Apenas administradores podem acessar as Configurações.
          </p>
        </div>
      </div>
    )
  }

  const tabStyle = (active) => ({
    padding: '0.75rem 1.5rem', border: 'none', background: 'none', cursor: 'pointer',
    fontSize: '0.9rem', fontFamily: F.body,
    fontWeight: active ? '700' : '500',
    color: active ? C.primaryContainer : C.onSurfaceVariant,
    borderBottom: active ? `2.5px solid ${C.primaryContainer}` : '2.5px solid transparent',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap', flexShrink: 0,
  })

  return (
    <div className="pg">
      <h1 style={{ fontSize: '1.4rem', fontWeight: '800', color: C.onSurface, margin: '0 0 1.5rem', letterSpacing: '-0.3px', fontFamily: F.headline }}>
        Configurações
      </h1>

      {/* Tabs */}
      <div style={{ borderBottom: `1px solid ${C.borderSubtle}`, marginBottom: '1.75rem', display: 'flex', overflowX: 'auto' }}>
        <button onClick={() => setActiveTab('sistema')} style={tabStyle(activeTab === 'sistema')}>
          ⚙️ Sistema
        </button>
        <button onClick={() => setActiveTab('filiais')} style={tabStyle(activeTab === 'filiais')}>
          🏪 Filiais
        </button>
        <button onClick={() => setActiveTab('vendedores')} style={tabStyle(activeTab === 'vendedores')}>
          👥 Vendedores
        </button>
        <button onClick={() => setActiveTab('sugestoes')} style={tabStyle(activeTab === 'sugestoes')}>
          💡 Sugestões
        </button>
        <button onClick={() => setActiveTab('backup')} style={tabStyle(activeTab === 'backup')}>
          🗄️ Backup
        </button>
      </div>

      {activeTab === 'sistema'    && <TabSistema    showToast={showToast} />}
      {activeTab === 'filiais'    && <TabFiliais    showToast={showToast} />}
      {activeTab === 'vendedores' && <TabVendedores showToast={showToast} />}
      {activeTab === 'sugestoes'  && <TabSugestoes  showToast={showToast} />}
      {activeTab === 'backup'     && <TabBackup     showToast={showToast} />}

      <Toast msg={toast} />
    </div>
  )
}
