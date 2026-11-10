import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { logErro } from '../lib/erros'
import { C, F, btnPrimary, btnGhost } from '../lib/ds'
import { lerConfigBackup, backupVencido, fmtDataHora, TIPOS_BACKUP } from '../lib/backup'
import { useBackup } from '../lib/useBackup'
import BackupResultado from './BackupResultado'

const CHAVE_ADIAR = 'backup-aviso-adiado'

// Faixa no topo do sistema (só administrador) quando passa do prazo do backup.
export default function BackupAviso() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [cfg, setCfg] = useState(null)
  const [adiado, setAdiado] = useState(() => { try { return sessionStorage.getItem(CHAVE_ADIAR) === '1' } catch { return false } })
  const { executar, rodando, progresso, resultado, erro, limpar } = useBackup()

  const carregar = useCallback(async () => {
    const { cfg, error } = await lerConfigBackup()
    if (error) logErro('Aviso de backup', error)
    setCfg(cfg)
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    carregar()
    window.addEventListener('backup-atualizado', carregar)
    return () => window.removeEventListener('backup-atualizado', carregar)
  }, [isAdmin, carregar])

  if (!isAdmin || !cfg) return null

  const tipo = backupVencido(cfg.completo.ultimo?.em, cfg.completo.freq) ? 'completo'
    : backupVencido(cfg.leve.ultimo?.em, cfg.leve.freq) ? 'leve' : null

  if (resultado || erro) {
    return <div style={{ padding: '0.75rem 1.5rem 0' }}><BackupResultado resultado={resultado} erro={erro} onFechar={limpar} /></div>
  }
  if (!tipo || adiado) return null

  const meta = TIPOS_BACKUP[tipo]
  const ultimo = cfg[tipo].ultimo

  function adiar() {
    try { sessionStorage.setItem(CHAVE_ADIAR, '1') } catch { /* só esconde nesta tela */ }
    setAdiado(true)
  }

  return (
    <div style={{ padding: '0.75rem 1.5rem 0' }}>
      <div role="alert" style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.6rem 1rem',
        background: C.statusWarningBg, border: `1px solid ${C.statusWarning}33`, borderRadius: '0.5rem',
        padding: '0.65rem 0.9rem', fontFamily: F.body, color: C.statusWarning,
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>backup</span>
        <div style={{ flex: '1 1 260px', minWidth: 0, fontSize: '0.86rem', lineHeight: 1.4 }}>
          <strong>Está na hora de fazer o {meta.rotulo.toLowerCase()} ({meta.detalhe}).</strong>{' '}
          {rodando ? progresso : ultimo ? `Último: ${fmtDataHora(ultimo.em)}.` : 'Nenhum foi feito ainda.'}
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => executar(tipo)} disabled={!!rodando}
            style={{ ...btnPrimary, padding: '0.4rem 0.85rem', fontSize: '0.82rem', opacity: rodando ? 0.6 : 1 }}>
            <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>download</span>
            {rodando ? 'Fazendo backup…' : 'Fazer backup agora'}
          </button>
          {!rodando && (
            <>
              <button type="button" onClick={() => navigate('/configuracoes?aba=backup')}
                style={{ ...btnGhost, padding: '0.4rem 0.6rem', fontSize: '0.82rem', color: C.statusWarning }}>Configurar</button>
              <button type="button" onClick={adiar}
                style={{ ...btnGhost, padding: '0.4rem 0.6rem', fontSize: '0.82rem', color: C.statusWarning }}>Lembrar mais tarde</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
