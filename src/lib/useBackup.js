import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { logErro } from './erros'
import { executarBackup } from './backup'

export function useBackup() {
  const { profile } = useAuth()
  const [rodando, setRodando] = useState(null)
  const [progresso, setProgresso] = useState('')
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState('')

  async function executar(tipo) {
    if (rodando) return
    setRodando(tipo); setResultado(null); setErro(''); setProgresso('Preparando…')
    try {
      setResultado({ tipo, ...(await executarBackup(tipo, { feitoPor: profile?.nome, onProgresso: setProgresso })) })
    } catch (e) {
      if (e?.name === 'AbortError') setErro('Backup cancelado.')
      else { logErro('Fazer backup', e); setErro('Não foi possível fazer o backup: ' + (e?.message || e)) }
    } finally {
      setRodando(null); setProgresso('')
    }
  }

  return { executar, rodando, progresso, resultado, erro, limpar: () => { setResultado(null); setErro('') } }
}
