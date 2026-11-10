import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { logErro } from '../lib/erros'
import { C, F, card, inputCss, btnPrimary, btnGhost, btnSecondary } from '../lib/ds'
import { TIPOS_AGENDA, hojeISO, fmtData, textoPeriodo } from '../lib/agenda'

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

const paraData = iso => new Date(iso + 'T12:00:00')
function paraISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function somarDias(iso, n) { const d = paraData(iso); d.setDate(d.getDate() + n); return paraISO(d) }
function segundaDaSemana(iso) { const d = paraData(iso); return somarDias(iso, -((d.getDay() + 6) % 7)) }

// Grade da semana: ações de cada dia (com observação de como foi) e,
// em cima, as promoções ativas na semana. Sem onFechar, fica embutida na página.
function EtiquetaLoja({ nome, cor }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontFamily: F.body, fontSize: '0.7rem', fontWeight: '700', color: cor || C.onSurfaceVariant, marginTop: '0.25rem' }}>
      <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>storefront</span>
      {nome}
    </span>
  )
}

export default function ProgramacaoSemana({ onFechar, filialId = '' }) {
  const navigate = useNavigate()
  const [filiais, setFiliais] = useState([])
  useEffect(() => {
    supabase.from('filiais').select('id, nome').order('nome').then(({ data, error }) => {
      if (error) logErro('Programação da semana: lojas', error)
      setFiliais(data || [])
    })
  }, [])
  // Só mostra a loja quando há mais de uma.
  const nomeLoja = id => filiais.length < 2 ? null : (id ? filiais.find(f => f.id === id)?.nome || 'Loja removida' : 'Todas as lojas')
  const hoje = hojeISO()
  const [segunda, setSegunda] = useState(() => segundaDaSemana(hoje))
  const domingo = somarDias(segunda, 6)
  const [itens, setItens] = useState([])
  const [obs, setObs] = useState({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    const { data, error } = await supabase.from('agenda').select('id, tipo, data_inicio, data_fim, titulo, texto, filial_id')
      .lte('data_inicio', domingo).gte('data_fim', segunda).order('data_inicio')
    if (error) { logErro('Programação da semana', error); setErro(error.message); setCarregando(false); return }
    const lista = data || []
    const ids = lista.filter(i => i.tipo === 'acao').map(i => i.id)
    let mapa = {}
    if (ids.length) {
      const r = await supabase.from('agenda_observacoes').select('id, agenda_id, dia, texto, autor_nome, updated_at')
        .in('agenda_id', ids).gte('dia', segunda).lte('dia', domingo)
      if (r.error) { logErro('Programação da semana: observações', r.error); setErro(r.error.message) } else setErro('')
      mapa = Object.fromEntries((r.data || []).map(o => [`${o.agenda_id}|${o.dia}`, o]))
    } else setErro('')
    setItens(lista)
    setObs(mapa)
    setCarregando(false)
  }, [segunda, domingo])
  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    if (!onFechar) return
    const esc = e => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onFechar])

  const daLoja = itens.filter(i => !filialId || !i.filial_id || i.filial_id === filialId)
  const acoes = daLoja.filter(i => i.tipo === 'acao')
  const promocoes = daLoja.filter(i => i.tipo === 'promocao')
  const acoesDoDia = dia => acoes.filter(a => a.data_inicio <= dia && a.data_fim >= dia)

  // Segunda a sábado sempre; domingo só se houver ação.
  const dias = Array.from({ length: 7 }, (_, k) => somarDias(segunda, k))
    .filter((dia, k) => k < 6 || acoesDoDia(dia).length > 0)

  function salvouObs(o) { setObs(prev => ({ ...prev, [`${o.agenda_id}|${o.dia}`]: o })) }
  function excluiuObs(chave) { setObs(prev => { const n = { ...prev }; delete n[chave]; return n }) }

  const navBtn = { ...btnGhost, padding: '0.4rem 0.6rem', border: `1px solid ${C.borderSubtle}`, background: C.surfaceContainerLowest }
  const metaP = TIPOS_AGENDA.promocao
  const metaA = TIPOS_AGENDA.acao

  const painel = (
      <div role={onFechar ? 'dialog' : 'region'} aria-label="Programação da semana" onClick={e => e.stopPropagation()}
        style={onFechar
          ? { ...card, width: '100%', maxWidth: '1200px', padding: 0, overflow: 'hidden', margin: 'auto' }
          : { ...card, padding: 0, overflow: 'hidden', marginBottom: '1.25rem' }}>

        {/* Cabeçalho */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', padding: '1rem 1.25rem', borderBottom: `1px solid ${C.borderSubtle}`, background: C.surfaceContainerLow }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: '800', color: C.onSurface, fontSize: '1.1rem', fontFamily: F.headline }}>Programação da semana</div>
            <div style={{ fontFamily: F.body, fontSize: '0.82rem', color: C.onSurfaceVariant, fontVariantNumeric: 'tabular-nums' }}>
              {fmtData(segunda)} a {fmtData(domingo)}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: 'auto' }}>
            <button type="button" onClick={() => setSegunda(s => somarDias(s, -7))} style={navBtn} aria-label="Semana anterior" title="Semana anterior">
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>chevron_left</span>
            </button>
            <button type="button" onClick={() => setSegunda(segundaDaSemana(hoje))} disabled={segunda === segundaDaSemana(hoje)}
              style={{ ...navBtn, fontSize: '0.8rem', fontWeight: '600', opacity: segunda === segundaDaSemana(hoje) ? 0.5 : 1 }}>
              Esta semana
            </button>
            <button type="button" onClick={() => setSegunda(s => somarDias(s, 7))} style={navBtn} aria-label="Próxima semana" title="Próxima semana">
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>chevron_right</span>
            </button>
            {onFechar && (
              <button type="button" onClick={onFechar} aria-label="Fechar"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.onSurfaceVariant, marginLeft: '0.4rem', padding: '0.2rem', lineHeight: 1 }}>
                <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>close</span>
              </button>
            )}
          </div>
        </div>

        <div style={{ padding: '1.1rem 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {erro && (
            <div style={{ background: C.statusDangerBg, color: C.statusDanger, borderRadius: '0.5rem', padding: '0.7rem 0.9rem', fontFamily: F.body, fontSize: '0.84rem' }}>
              Não foi possível carregar tudo: {erro}
            </div>
          )}

          {/* Promoções ativas na semana */}
          <div style={{ borderRadius: '0.5rem', background: metaP.fundo, borderLeft: `4px solid ${metaP.cor}`, padding: '0.8rem 1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: metaP.cor, fontFamily: F.headline, fontWeight: '800', fontSize: '0.92rem', marginBottom: promocoes.length ? '0.55rem' : 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: '19px' }}>{metaP.icone}</span>
              Promoções da semana
              {!carregando && promocoes.length === 0 && (
                <span style={{ fontFamily: F.body, fontWeight: '500', fontSize: '0.82rem', color: C.onSurfaceVariant, marginLeft: '0.3rem' }}>— nenhuma promoção ativa nesta semana</span>
              )}
            </div>
            {promocoes.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: '0.5rem' }}>
                {promocoes.map(p => (
                  <div key={p.id} style={{ background: C.surfaceContainerLowest, borderRadius: '0.4rem', padding: '0.55rem 0.75rem' }}>
                    {p.titulo && (
                      <div style={{ fontFamily: F.headline, fontSize: '1rem', fontWeight: '800', color: metaP.cor, lineHeight: 1.3, marginBottom: '0.15rem' }}>{p.titulo}</div>
                    )}
                    <div style={{ fontFamily: F.body, fontSize: p.titulo ? '0.84rem' : '0.88rem', fontWeight: p.titulo ? '400' : '600', color: C.onSurface, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{p.texto}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.2rem 0.75rem' }}>
                      <span style={{ fontFamily: F.body, fontSize: '0.72rem', color: C.onSurfaceVariant, marginTop: '0.25rem', fontVariantNumeric: 'tabular-nums' }}>{textoPeriodo(p)}</span>
                      {nomeLoja(p.filial_id) && <EtiquetaLoja nome={nomeLoja(p.filial_id)} cor={metaP.cor} />}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Grade de ações por dia */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: '0.6rem' }}>
            {dias.map(dia => {
              const ehHoje = dia === hoje
              const lista = acoesDoDia(dia)
              return (
                <div key={dia} style={{
                  border: `1px solid ${ehHoje ? metaA.cor : C.borderSubtle}`, borderRadius: '0.5rem',
                  background: ehHoje ? metaA.fundo : C.surfaceContainerLow, display: 'flex', flexDirection: 'column', minHeight: '150px',
                }}>
                  <div style={{ padding: '0.55rem 0.7rem', borderBottom: `1px solid ${ehHoje ? metaA.cor : C.borderSubtle}`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.4rem' }}>
                    <span style={{ fontFamily: F.headline, fontWeight: '800', fontSize: '0.9rem', color: ehHoje ? metaA.cor : C.onSurface }}>
                      {DIAS_SEMANA[paraData(dia).getDay()]}
                    </span>
                    <span style={{ fontFamily: F.body, fontSize: '0.75rem', fontWeight: '600', color: C.onSurfaceVariant, fontVariantNumeric: 'tabular-nums' }}>
                      {ehHoje ? 'Hoje · ' : ''}{fmtData(dia).slice(0, 5)}
                    </span>
                  </div>
                  <div style={{ padding: '0.55rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                    {carregando ? (
                      <span style={{ fontFamily: F.body, fontSize: '0.8rem', color: C.onSurfaceVariant }}>Carregando…</span>
                    ) : lista.length === 0 ? (
                      <span style={{ fontFamily: F.body, fontSize: '0.8rem', color: C.onSurfaceVariant }}>Nenhuma ação programada.</span>
                    ) : lista.map(a => (
                      <CartaoAcao key={a.id} acao={a} dia={dia} hoje={hoje} loja={nomeLoja(a.filial_id)}
                        obs={obs[`${a.id}|${dia}`]} onSalvou={salvouObs} onExcluiu={() => excluiuObs(`${a.id}|${dia}`)} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => { onFechar?.(); navigate('/agenda') }} style={btnSecondary}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>edit_calendar</span>
              Cadastrar ações e promoções
            </button>
          </div>
        </div>
      </div>
  )

  if (!onFechar) return painel
  return (
    <div onClick={onFechar}
      style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(15,45,74,0.50)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1.25rem', overflowY: 'auto' }}>
      {painel}
    </div>
  )
}

function CartaoAcao({ acao, dia, hoje, loja, obs, onSalvou, onExcluiu }) {
  const { profile, isAdmin } = useAuth()
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  function abrir() { setTexto(obs?.texto || ''); setErro(''); setEditando(true) }

  async function salvar() {
    const t = texto.trim()
    if (!t) return
    setSalvando(true)
    const { data, error } = await supabase.from('agenda_observacoes')
      .upsert({ agenda_id: acao.id, dia, texto: t.slice(0, 4000), autor_nome: profile?.nome || null, updated_at: new Date().toISOString() },
        { onConflict: 'agenda_id,dia' })
      .select('id, agenda_id, dia, texto, autor_nome, updated_at').single()
    setSalvando(false)
    if (error) { logErro('Salvar observação da ação', error); return setErro('Não foi possível salvar: ' + error.message) }
    onSalvou(data)
    setEditando(false)
  }

  async function excluir() {
    if (!window.confirm('Excluir esta observação?')) return
    const { error } = await supabase.from('agenda_observacoes').delete().eq('id', obs.id)
    if (error) { logErro('Excluir observação da ação', error); return setErro('Não foi possível excluir: ' + error.message) }
    onExcluiu()
  }

  const linkCss = { background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: F.body, fontSize: '0.76rem', fontWeight: '600', color: C.secondary }

  return (
    <div style={{ background: C.surfaceContainerLowest, border: `1px solid ${C.borderSubtle}`, borderRadius: '0.45rem', padding: '0.55rem 0.65rem' }}>
      <div style={{ fontFamily: F.body, fontSize: '0.86rem', fontWeight: '600', color: C.onSurface, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{acao.texto}</div>
      {acao.data_inicio !== acao.data_fim && (
        <div style={{ fontFamily: F.body, fontSize: '0.7rem', color: C.onSurfaceVariant, marginTop: '0.15rem', fontVariantNumeric: 'tabular-nums' }}>{textoPeriodo(acao)}</div>
      )}
      {loja && <div><EtiquetaLoja nome={loja} cor={TIPOS_AGENDA.acao.cor} /></div>}

      <div style={{ marginTop: '0.45rem', paddingTop: '0.45rem', borderTop: `1px dashed ${C.borderSubtle}` }}>
        {editando ? (
          <>
            <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={3} maxLength={4000} autoFocus
              placeholder="Como foi a ação? O que foi feito?"
              style={{ ...inputCss, fontSize: '0.82rem', padding: '0.45rem 0.55rem', resize: 'vertical' }} />
            {erro && <div style={{ color: C.error, fontFamily: F.body, fontSize: '0.75rem', marginTop: '0.3rem' }}>{erro}</div>}
            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
              <button type="button" onClick={salvar} disabled={salvando || !texto.trim()}
                style={{ ...btnPrimary, padding: '0.35rem 0.75rem', fontSize: '0.78rem', opacity: salvando || !texto.trim() ? 0.6 : 1 }}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
              <button type="button" onClick={() => setEditando(false)} style={{ ...btnGhost, padding: '0.35rem 0.6rem', fontSize: '0.78rem' }}>Cancelar</button>
            </div>
          </>
        ) : obs ? (
          <>
            <div style={{ fontFamily: F.body, fontSize: '0.7rem', fontWeight: '700', color: C.statusSuccess, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '0.15rem' }}>Observação</div>
            <div style={{ fontFamily: F.body, fontSize: '0.82rem', color: C.onSurface, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{obs.texto}</div>
            <div style={{ fontFamily: F.body, fontSize: '0.68rem', color: C.onSurfaceVariant, marginTop: '0.2rem' }}>
              {obs.autor_nome || '—'} · {new Date(obs.updated_at).toLocaleDateString('pt-BR')}
            </div>
            {erro && <div style={{ color: C.error, fontFamily: F.body, fontSize: '0.75rem', marginTop: '0.3rem' }}>{erro}</div>}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.3rem' }}>
              <button type="button" onClick={abrir} style={linkCss}>Editar</button>
              {isAdmin && <button type="button" onClick={excluir} style={{ ...linkCss, color: C.statusDanger }}>Excluir</button>}
            </div>
          </>
        ) : (
          <button type="button" onClick={abrir} style={{ ...linkCss, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>edit_note</span>
            {dia <= hoje ? 'Anotar como foi' : 'Adicionar observação'}
          </button>
        )}
      </div>
    </div>
  )
}
