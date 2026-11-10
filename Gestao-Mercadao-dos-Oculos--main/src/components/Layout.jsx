import { useState, useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Sidebar from './Sidebar'
import BalaoSugestao from './BalaoSugestao'
import BackupAviso from './BackupAviso'
import { C, F } from '../lib/ds'

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < breakpoint
  )
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [breakpoint])
  return isMobile
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isMobile = useIsMobile()
  const { profile } = useAuth()
  const navigate = useNavigate()

  function close() { setSidebarOpen(false) }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {isMobile && sidebarOpen && (
        <div
          onClick={close}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 40, backdropFilter: 'blur(2px)',
          }}
        />
      )}

      <Sidebar isMobile={isMobile} isOpen={sidebarOpen} onClose={close} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {isMobile ? (
          <header style={{
            background:   C.primary,
            height:       '56px',
            padding:      '0 1rem',
            display:      'flex',
            alignItems:   'center',
            gap:          '0.75rem',
            flexShrink:   0,
            zIndex:       10,
          }}>
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menu"
              style={{
                background:    'rgba(255,255,255,0.15)',
                border:        'none',
                borderRadius:  '0.5rem',
                width:         '38px',
                height:        '38px',
                display:       'flex',
                alignItems:    'center',
                justifyContent:'center',
                cursor:        'pointer',
                color:         '#fff',
                flexShrink:    0,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>menu</span>
            </button>
            <span style={{ color: '#fff', fontWeight: '700', fontSize: '0.95rem', fontFamily: F.headline }}>
              Mercadão dos Óculos
            </span>
          </header>
        ) : (
          <header style={{
            height:        '64px',
            background:    C.surfaceContainerLowest,
            borderBottom:  `1px solid ${C.borderSubtle}`,
            display:       'flex',
            alignItems:    'center',
            padding:       '0 1.5rem',
            gap:           '0.75rem',
            flexShrink:    0,
            zIndex:        10,
          }}>
            <div style={{ flex: 1 }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                onClick={() => navigate('/configuracoes')}
                aria-label="Configurações"
                style={{
                  background:    'transparent',
                  border:        'none',
                  borderRadius:  '0.5rem',
                  width:         '36px',
                  height:        '36px',
                  display:       'flex',
                  alignItems:    'center',
                  justifyContent:'center',
                  cursor:        'pointer',
                  color:         C.onSurfaceVariant,
                  transition:    'background 0.14s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = C.surfaceContainerHigh}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>settings</span>
              </button>

              <div
                title={profile?.nome || 'Usuário'}
                style={{
                  width:         '34px',
                  height:        '34px',
                  borderRadius:  '50%',
                  background:    C.primaryContainer,
                  color:         '#fff',
                  display:       'flex',
                  alignItems:    'center',
                  justifyContent:'center',
                  fontWeight:    '700',
                  fontSize:      '0.875rem',
                  fontFamily:    F.headline,
                  flexShrink:    0,
                  cursor:        'default',
                  userSelect:    'none',
                }}
              >
                {(profile?.nome || 'U')[0].toUpperCase()}
              </div>
            </div>
          </header>
        )}

        <main style={{ flex: 1, overflow: 'auto', background: C.surface }}>
          <BackupAviso />
          <Outlet />
        </main>
      </div>

      <BalaoSugestao />
    </div>
  )
}
