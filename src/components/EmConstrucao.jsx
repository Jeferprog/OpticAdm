export default function EmConstrucao({ modulo }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      padding: '2rem',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '4rem', marginBottom: '1.25rem' }}>🚧</div>
      <h2 style={{ fontSize: '1.375rem', fontWeight: '700', color: '#1e293b', margin: '0 0 0.5rem' }}>
        {modulo} — Em construção
      </h2>
      <p style={{ color: '#64748b', margin: 0, maxWidth: '380px', lineHeight: '1.6' }}>
        Este módulo será implementado nas próximas etapas do projeto.
        As funcionalidades já estão planejadas e o banco de dados está preparado.
      </p>
    </div>
  )
}
