import { NavLink } from 'react-router-dom'
import { C, F } from '../lib/ds'

// Submenu do Dashboard: Visão geral | Gráficos (somente administrador).
export default function AbasDashboard() {
  const estilo = ({ isActive }) => ({
    padding: '0.6rem 1.1rem', textDecoration: 'none', fontFamily: F.body, fontSize: '0.88rem',
    fontWeight: isActive ? '700' : '500',
    color: isActive ? C.primaryContainer : C.onSurfaceVariant,
    borderBottom: isActive ? `2.5px solid ${C.primaryContainer}` : '2.5px solid transparent',
    whiteSpace: 'nowrap',
  })
  return (
    <div style={{ display: 'flex', borderBottom: `1px solid ${C.borderSubtle}`, marginBottom: '1.25rem', overflowX: 'auto' }}>
      <NavLink to="/dashboard" end style={estilo}>Visão geral</NavLink>
      <NavLink to="/dashboard/graficos" style={estilo}>Gráficos</NavLink>
    </div>
  )
}
