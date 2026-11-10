import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) {
      setError('E-mail ou senha inválidos. Verifique suas credenciais.')
    } else {
      navigate('/')
    }
    setLoading(false)
  }

  const inputStyle = {
    width: '100%',
    padding: '0.7rem 0.875rem',
    border: '1.5px solid #e2e8f0',
    borderRadius: '0.625rem',
    fontSize: '0.95rem',
    outline: 'none',
    boxSizing: 'border-box',
    color: '#1e293b',
    background: '#f8fafc',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(145deg, #0f2d4a 0%, #7a1010 60%, #C0272D 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
    }}>
      {/* Card */}
      <div style={{
        background: '#fff',
        borderRadius: '1.5rem',
        padding: '2.5rem 2.25rem',
        width: '100%',
        maxWidth: '420px',
        boxShadow: '0 32px 64px -12px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.05)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="Logo"
              style={{ width: '80px', height: '80px', objectFit: 'contain' }}
              onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'block' }}
            />
            <div style={{ fontSize: '3.25rem', lineHeight: 1, display: 'none' }}>👓</div>
          </div>
          <h1 style={{
            fontSize: '1.4rem',
            fontWeight: '800',
            color: '#0f2d4a',
            margin: '0 0 0.3rem',
            letterSpacing: '-0.3px',
          }}>
            Mercadão dos Óculos
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>
            Sistema de Gestão
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.1rem' }}>
            <label style={{
              display: 'block',
              fontSize: '0.82rem',
              fontWeight: '600',
              color: '#475569',
              marginBottom: '0.4rem',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="seu@email.com"
              style={inputStyle}
              onFocus={e => {
                e.target.style.borderColor = '#C0272D'
                e.target.style.boxShadow = '0 0 0 3px rgba(192,39,45,0.12)'
                e.target.style.background = '#fff'
              }}
              onBlur={e => {
                e.target.style.borderColor = '#e2e8f0'
                e.target.style.boxShadow = 'none'
                e.target.style.background = '#f8fafc'
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block',
              fontSize: '0.82rem',
              fontWeight: '600',
              color: '#475569',
              marginBottom: '0.4rem',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              style={inputStyle}
              onFocus={e => {
                e.target.style.borderColor = '#C0272D'
                e.target.style.boxShadow = '0 0 0 3px rgba(192,39,45,0.12)'
                e.target.style.background = '#fff'
              }}
              onBlur={e => {
                e.target.style.borderColor = '#e2e8f0'
                e.target.style.boxShadow = 'none'
                e.target.style.background = '#f8fafc'
              }}
            />
          </div>

          {error && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '0.625rem',
              padding: '0.7rem 0.875rem',
              color: '#dc2626',
              fontSize: '0.85rem',
              marginBottom: '1.1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <span>⚠️</span> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.8rem',
              background: loading
                ? '#e88a8d'
                : 'linear-gradient(135deg, #a01f24, #C0272D)',
              color: '#fff',
              border: 'none',
              borderRadius: '0.625rem',
              fontSize: '0.95rem',
              fontWeight: '700',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.15s, transform 0.1s',
              letterSpacing: '0.2px',
            }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.opacity = '0.92' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
