import { C, F } from '../lib/ds'
import { TIPOS_BACKUP } from '../lib/backup'

// Mensagem depois do backup: onde foi salvo e se faltou algo.
export default function BackupResultado({ resultado, erro, onFechar }) {
  if (!resultado && !erro) return null
  const comFalha = erro || resultado.erros.length > 0
  return (
    <div role="status" style={{
      display: 'flex', gap: '0.6rem', alignItems: 'flex-start', borderRadius: '0.5rem', padding: '0.7rem 0.9rem',
      background: comFalha ? C.statusWarningBg : C.statusSuccessBg, color: comFalha ? C.statusWarning : C.statusSuccess,
      fontFamily: F.body, fontSize: '0.84rem', lineHeight: 1.45,
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: '20px', flexShrink: 0 }}>{comFalha ? 'warning' : 'check_circle'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {erro ? <strong>{erro}</strong> : (
          <>
            <strong>{TIPOS_BACKUP[resultado.tipo].rotulo} salvo na {resultado.local}.</strong>
            <div style={{ wordBreak: 'break-all' }}>{resultado.nome} · {resultado.tamanhoTexto}</div>
            {resultado.erros.length > 0 && (
              <div style={{ marginTop: '0.35rem' }}>
                Alguns itens não puderam ser copiados (veja o resumo.txt dentro do arquivo). Por isso este backup não
                foi registrado como feito — tente de novo.
                <ul style={{ margin: '0.3rem 0 0', paddingLeft: '1.1rem' }}>
                  {resultado.erros.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                  {resultado.erros.length > 5 && <li>…e mais {resultado.erros.length - 5}</li>}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
      {onFechar && (
        <button type="button" onClick={onFechar} aria-label="Fechar"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1 }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>close</span>
        </button>
      )}
    </div>
  )
}
