import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import DashboardGraficos from './pages/DashboardGraficos'
import Vendas from './pages/Vendas'
import Resumo from './pages/Resumo'
import Vendedores from './pages/Vendedores'
import Cobrancas from './pages/Cobrancas'
import Clientes from './pages/Clientes'
import CaptacaoClientes from './pages/CaptacaoClientes'
import Configuracoes from './pages/Configuracoes'
import Agenda from './pages/Agenda'

function Loading() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f0f4f8',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>👓</div>
        <p style={{ color: '#64748b', fontSize: '0.95rem' }}>Carregando...</p>
      </div>
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <Loading />
  if (!session) return <Navigate to="/login" replace />
  return children
}

// Rota exclusiva de administradores. Vendedor é redirecionado à tela inicial.
function AdminRoute({ children }) {
  const { session, isAdmin, loading } = useAuth()
  if (loading) return <Loading />
  if (!session) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/vendas" replace />
  return children
}

// Tela inicial por papel: admin abre no Dashboard; vendedor abre em Vendas.
function HomeRedirect() {
  const { isAdmin } = useAuth()
  return <Navigate to={isAdmin ? '/dashboard' : '/vendas'} replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<HomeRedirect />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="dashboard/graficos" element={<AdminRoute><DashboardGraficos /></AdminRoute>} />
        <Route path="vendas" element={<Vendas />} />
        <Route path="resumo" element={<AdminRoute><Resumo /></AdminRoute>} />
        <Route path="vendedores" element={<Vendedores />} />
        <Route path="cobrancas" element={<Cobrancas />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="captacao" element={<CaptacaoClientes />} />
        <Route path="agenda" element={<Agenda />} />
        <Route path="configuracoes" element={<AdminRoute><Configuracoes /></AdminRoute>} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  )
}
