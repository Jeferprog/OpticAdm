import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { logErro } from '../lib/erros'
import { C, F, inputCss, btnPrimary } from '../lib/ds'

// Balãozinho no canto inferior direito para os usuários enviarem sugestões
// de melhoria. Fica gravado no sistema (tabela "sugestoes") e o administrador
// lê em Configurações → Sugestões.
export default function BalaoSugestao() {
  const { profile } = useAuth()
  const location = useLocation()
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [status, setStatus] = useState(null)  // 'ok' | 'erro' | null

  async function enviar() {
    const t = texto.trim()
    if (!t) return
    setEnviando(true)
    setStatus(null)
    const { error } = await supabase.from('sugestoes').insert({
      texto: t.slice(0, 4000),
      autor_nome: profile?.nome || null,
      pagina: location.pathname || null,
    })
    setEnviando(false)
    if (error) {
      logErro('Enviar sugestão', error)
      setStatus('erro')
      return
    }
    setTexto('')
    setStatus('ok')
  }

  function fechar() {
    setAberto(false)
    setStatus(null)
  }

  return (
    <>
      {aberto && (
        <div role="dialog" aria-label="Sugestão de melhoria" style={{
          position: 'fixed', right: '1.25rem', bottom: '5.25rem', zIndex: 60,
          width: 'min(340px, calc(100vw - 2.5rem))',
          background: C.surfaceContainerLowest, border: `1px solid ${C.borderSubtle}`,
          borderRadius: '0.75rem', boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
          padding: '1rem', fontFamily: F.body,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.6rem' }}>
            <p style={{ margin: 0, fontSize: '0.875rem', color: C.onSurface, lineHeight: 1.45 }}>
              Você tem alguma sugestão de melhoria ou algo que poderia melhorar no sistema? Nos conte por aqui.
            </p>
            <button onClick={fechar} aria-label="Fechar"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.onSurfaceVariant, padding: 0, lineHeight: 1 }}>
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
            </button>
          </div>

          {status === 'ok' ? (
            <div style={{ background: C.statusSuccessBg, color: C.statusSuccess, borderRadius: '0.5rem', padding: '0.75rem', fontSize: '0.85rem', fontWeight: '600' }}>
              Obrigado! Sua sugestão foi enviada.
            </div>
          ) : (
            <>
              <textarea
                value={texto}
                onChange={e => setTexto(e.target.value)}
                rows={5}
                maxLength={4000}
                placeholder="Escreva aqui..."
                style={{ ...inputCss, resize: 'vertical', minHeight: '100px' }}
              />
              {status === 'erro' && (
                <div style={{ color: C.error, fontSize: '0.8rem', marginTop: '0.4rem' }}>
                  Não foi possível enviar agora. Tente de novo em instantes.
                </div>
              )}
              <button onClick={enviar} disabled={enviando || !texto.trim()}
                style={{ ...btnPrimary, width: '100%', marginTop: '0.6rem', opacity: enviando || !texto.trim() ? 0.6 : 1 }}>
                {enviando ? 'Enviando...' : 'Enviar'}
              </button>
            </>
          )}
        </div>
      )}

      <button
        onClick={() => (aberto ? fechar() : setAberto(true))}
        aria-label="Enviar sugestão de melhoria"
        title="Sugestões de melhoria"
        style={{
          position: 'fixed', right: '1.25rem', bottom: '1.25rem', zIndex: 60,
          width: '52px', height: '52px', borderRadius: '50%', border: 'none',
          background: C.primaryContainer, color: C.onPrimary, cursor: 'pointer',
          boxShadow: '0 6px 18px rgba(0,0,0,0.22)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '26px' }}>{aberto ? 'close' : 'chat'}</span>
      </button>
    </>
  )
}
