import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { C, F } from '../lib/ds'

const NAV_ITEMS = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: 'dashboard',
  },
  {
    to: '/dashboard/graficos',
    label: 'Gráficos',
    icon: 'bar_chart',
    adminOnly: true,
    sub: true,
  },
  {
    to: '/vendas',
    label: 'Vendas',
    icon: 'receipt_long',
  },
  {
    to: '/resumo',
    label: 'Contas a Pagar',
    icon: 'account_balance_wallet',
    adminOnly: true,
  },
  {
    to: '/vendedores',
    label: 'Comissões',
    icon: 'groups',
  },
  {
    to: '/cobrancas',
    label: 'Cobranças',
    icon: 'credit_card_off',
  },
  {
    to: '/clientes',
    label: 'Clientes',
    icon: 'contacts',
  },
  {
    to: '/captacao',
    label: 'Captação',
    icon: 'person_search',
  },
  {
    to: '/agenda',
    label: 'Agenda',
    icon: 'event',
  },
  {
    to: '/configuracoes',
    label: 'Configurações',
    icon: 'settings',
    adminOnly: true,
  },
]

export default function Sidebar({ isMobile = false, isOpen = false, onClose = () => {} }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  const isAdmin = profile?.papel === 'admin'
  const navItems = NAV_ITEMS.filter(item => !item.adminOnly || isAdmin)

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const asideStyle = isMobile
    ? {
        position:  'fixed',
        top:       0,
        left:      0,
        height:    '100vh',
        width:     '260px',
        zIndex:    50,
        transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition:'transform 0.24s ease',
      }
    : {
        width:    '240px',
        minWidth: '240px',
        height:   '100vh',
        position: 'sticky',
        top:      0,
        flexShrink: 0,
      }

  return (
    <aside style={{
      ...asideStyle,
      background:   C.surfaceContainerLow,
      borderRight:  `1px solid ${C.borderSubtle}`,
      display:      'flex',
      flexDirection:'column',
      boxShadow:    isMobile ? '4px 0 24px rgba(0,0,0,0.1)' : 'none',
    }}>

      {/* Logo */}
      <div style={{
        padding:      '1.125rem 1rem',
        borderBottom: `1px solid ${C.borderSubtle}`,
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="Logo"
            style={{ width: '36px', height: '36px', objectFit: 'contain', borderRadius: '6px', flexShrink: 0 }}
            onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex' }}
          />
          <div style={{
            width: '36px', height: '36px', borderRadius: '8px',
            background: C.primaryContainer, display: 'none',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: '20px' }}>storefront</span>
          </div>
          <div>
            <div style={{ color: C.onSurface, fontWeight: '700', fontSize: '0.82rem', lineHeight: '1.2', fontFamily: F.headline }}>
              Mercadão dos Óculos
            </div>
            <div style={{ color: C.onSurfaceVariant, fontSize: '0.68rem', marginTop: '1px', fontFamily: F.body }}>
              Sistema de Gestão
            </div>
          </div>
        </div>

        {isMobile && (
          <button
            onClick={onClose}
            aria-label="Fechar menu"
            style={{
              background:   C.surfaceContainerHigh,
              border:       'none',
              borderRadius: '0.375rem',
              width:        '30px',
              height:       '30px',
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'center',
              cursor:       'pointer',
              color:        C.onSurfaceVariant,
              flexShrink:   0,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>close</span>
          </button>
        )}
      </div>

      {/* Botão Novo Lançamento */}
      <div style={{ padding: '0.875rem 1rem 0.625rem' }}>
        <button
          onClick={() => { navigate('/vendas'); if (isMobile) onClose() }}
          style={{
            width:        '100%',
            padding:      '0.6rem 1rem',
            background:   C.primaryContainer,
            color:        '#fff',
            border:       'none',
            borderRadius: '0.375rem',
            fontSize:     '0.85rem',
            fontFamily:   F.body,
            fontWeight:   '600',
            cursor:       'pointer',
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
            gap:          '0.375rem',
            transition:   'opacity 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
          Novo Lançamento
        </button>
      </div>

      {/* Navegação */}
      <nav style={{ flex: 1, padding: '0.25rem 0.625rem', overflowY: 'auto' }}>
        {navItems.map(({ to, label, icon, sub }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/dashboard'}
            onClick={isMobile ? onClose : undefined}
            style={({ isActive }) => ({
              display:     'flex',
              alignItems:  'center',
              gap:         '0.625rem',
              padding:     sub ? '0.4rem 0.75rem 0.4rem 2.1rem' : '0.55rem 0.75rem',
              borderRadius:'0.375rem',
              marginBottom:'0.125rem',
              color:       isActive ? C.onSecondaryContainer : C.onSurfaceVariant,
              background:  isActive ? C.secondaryContainer   : 'transparent',
              textDecoration: 'none',
              fontWeight:  isActive ? '600' : '400',
              fontSize:    sub ? '0.82rem' : '0.875rem',
              fontFamily:  F.body,
              transition:  'all 0.14s',
            })}
            onMouseEnter={e => {
              const active = e.currentTarget.getAttribute('aria-current') === 'page'
              if (!active) e.currentTarget.style.background = C.surfaceContainerHigh
            }}
            onMouseLeave={e => {
              const active = e.currentTarget.getAttribute('aria-current') === 'page'
              if (!active) e.currentTarget.style.background = 'transparent'
            }}
          >
            {({ isActive }) => (
              <>
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: sub ? '17px' : '20px',
                    color: isActive ? C.onSecondaryContainer : C.onSurfaceVariant,
                    fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0",
                    flexShrink: 0,
                  }}
                >
                  {icon}
                </span>
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Usuário + Sair */}
      <div style={{
        padding:    '0.875rem 1rem',
        borderTop:  `1px solid ${C.borderSubtle}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.625rem' }}>
          <div style={{
            width:        '32px',
            height:       '32px',
            borderRadius: '50%',
            background:   C.secondaryContainer,
            color:        C.onSecondaryContainer,
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
            fontWeight:   '700',
            fontSize:     '0.875rem',
            fontFamily:   F.headline,
            flexShrink:   0,
          }}>
            {(profile?.nome || 'U')[0].toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: C.onSurface, fontWeight: '600', fontSize: '0.82rem', fontFamily: F.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile?.nome || 'Usuário'}
            </div>
            <div style={{ color: C.onSurfaceVariant, fontSize: '0.72rem', fontFamily: F.body }}>
              {profile?.papel === 'admin' ? 'Administrador' : 'Vendedor'}
            </div>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          style={{
            width:        '100%',
            padding:      '0.5rem',
            background:   'transparent',
            color:        C.onSurfaceVariant,
            border:       `1px solid ${C.borderSubtle}`,
            borderRadius: '0.375rem',
            cursor:       'pointer',
            fontSize:     '0.82rem',
            fontFamily:   F.body,
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
            gap:          '0.375rem',
            transition:   'all 0.14s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = C.surfaceContainerHigh; e.currentTarget.style.color = C.onSurface }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.onSurfaceVariant }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>logout</span>
          Sair
        </button>
      </div>
    </aside>
  )
}
