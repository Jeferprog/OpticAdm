import { Component } from 'react'
import { logErro } from '../lib/erros'

// "Rede de proteção": se qualquer tela travar, mostra uma mensagem amigável
// com o detalhe técnico do erro (em vez de uma tela branca sem explicação).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { erro: null, copiado: false }
  }

  static getDerivedStateFromError(erro) {
    return { erro }
  }

  componentDidCatch(erro, info) {
    logErro('Falha na tela', erro)
    this.stackComponentes = info?.componentStack || ''
  }

  copiar = () => {
    const texto = `Erro: ${this.state.erro?.message || ''}\n\n` +
      `${this.state.erro?.stack || ''}\n\nComponentes:${this.stackComponentes || ''}`
    try {
      navigator.clipboard?.writeText(texto)
      this.setState({ copiado: true })
      setTimeout(() => this.setState({ copiado: false }), 2500)
    } catch { /* clipboard indisponível */ }
  }

  render() {
    if (!this.state.erro) return this.props.children

    const msg = this.state.erro?.message || 'Erro inesperado'

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.5rem', background: '#f7f4f4',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>
        <div style={{
          background: '#fff', borderRadius: '1rem', maxWidth: '520px', width: '100%',
          padding: '2rem 2rem 1.75rem', boxShadow: '0 20px 50px -12px rgba(0,0,0,0.25)',
          borderTop: '5px solid #9d0518',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>😕</div>
          <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.35rem', color: '#1a0a0e', fontWeight: 800 }}>
            Algo deu errado nesta tela
          </h1>
          <p style={{ margin: '0 0 1.25rem', color: '#6e4c54', fontSize: '0.92rem', lineHeight: 1.6 }}>
            Não se preocupe — seus dados estão seguros. Tente recarregar. Se o problema
            continuar, tire um print desta tela (ou copie o detalhe abaixo) e envie ao suporte.
          </p>

          <div style={{
            background: '#f3ecec', border: '1px solid #e2d0d3', borderRadius: '0.5rem',
            padding: '0.7rem 0.85rem', marginBottom: '1.25rem',
          }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#9a7880', marginBottom: '0.25rem' }}>
              Detalhe técnico
            </div>
            <div style={{ fontSize: '0.82rem', color: '#8a1020', fontFamily: 'monospace', wordBreak: 'break-word' }}>
              {msg}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
            <button onClick={() => window.location.reload()} style={{
              flex: '1 1 auto', padding: '0.7rem 1rem', borderRadius: '0.6rem', border: 'none',
              background: 'linear-gradient(135deg, #a01f24, #C0272D)', color: '#fff',
              fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer',
            }}>
              🔄 Recarregar
            </button>
            <button onClick={this.copiar} style={{
              padding: '0.7rem 1rem', borderRadius: '0.6rem', border: '1.5px solid #e2d0d3',
              background: '#fff', color: '#6e4c54', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer',
            }}>
              {this.state.copiado ? '✓ Copiado' : 'Copiar erro'}
            </button>
          </div>
        </div>
      </div>
    )
  }
}
