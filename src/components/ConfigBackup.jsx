import { useState, useEffect, useCallback } from 'react'
import { logErro } from '../lib/erros'
import { C, F, card, inputCss, btnPrimary, btnSecondary, btnGhost } from '../lib/ds'
import {
  FREQUENCIAS, TIPOS_BACKUP, lerConfigBackup, salvarFrequencias, proximoBackup, backupVencido, fmtDataHora,
  pastaSuportada, lerPasta, escolherPasta, esquecerPasta,
} from '../lib/backup'
import { useBackup } from '../lib/useBackup'
import BackupResultado from './BackupResultado'
import RestaurarBackup from './RestaurarBackup'

const cardMb = { ...card, marginBottom: '1.25rem' }
const titulo = { margin: '0 0 0.3rem', fontSize: '1rem', fontWeight: '800', fontFamily: F.headline, color: C.onSurface }
const ajuda = { margin: '0 0 1rem', fontSize: '0.84rem', color: C.onSurfaceVariant, fontFamily: F.body, lineHeight: 1.5 }
const fmtDia = iso => iso ? iso.split('-').reverse().join('/') : ''

export default function TabBackup({ showToast }) {
  const [cfg, setCfg] = useState(null)
  const [pasta, setPasta] = useState(null)
  const { executar, rodando, progresso, resultado, erro, limpar } = useBackup()

  const carregar = useCallback(async () => {
    const { cfg, error } = await lerConfigBackup()
    if (error) logErro('Carregar configuração de backup', error)
    setCfg(cfg)
  }, [])

  useEffect(() => {
    carregar()
    lerPasta().then(setPasta)
    window.addEventListener('backup-atualizado', carregar)
    return () => window.removeEventListener('backup-atualizado', carregar)
  }, [carregar])

  async function trocarFreq(tipo, freq) {
    const novo = { ...cfg, [tipo]: { ...cfg[tipo], freq } }
    setCfg(novo)
    const { error } = await salvarFrequencias({ [tipo]: freq })
    if (error) { logErro('Salvar frequência de backup', error); return showToast('Erro ao salvar a frequência.') }
    window.dispatchEvent(new Event('backup-atualizado'))
    showToast('Frequência do aviso salva!')
  }

  async function onEscolherPasta() {
    try {
      setPasta(await escolherPasta())
      showToast('Pasta do backup salva neste computador!')
    } catch (e) {
      if (e?.name !== 'AbortError') { logErro('Escolher pasta do backup', e); showToast('Erro: não foi possível usar esta pasta.') }
    }
  }

  async function onEsquecerPasta() {
    await esquecerPasta()
    setPasta(null)
  }

  if (!cfg) return <p style={{ fontFamily: F.body, color: C.onSurfaceVariant }}>Carregando…</p>

  return (
    <div style={{ maxWidth: '860px' }}>
      {/* Pasta */}
      <section style={cardMb}>
        <h2 style={titulo}>Onde salvar o backup</h2>
        <p style={ajuda}>
          O backup é salvo <strong>neste computador</strong>. Escolha a pasta uma vez; nas próximas vezes o arquivo vai
          direto para ela. Se usar outro computador, escolha a pasta nele também.
        </p>
        {pastaSuportada ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1 1 260px', minWidth: 0,
              background: C.surfaceContainerLow, borderRadius: '0.4rem', padding: '0.6rem 0.8rem', fontFamily: F.body, fontSize: '0.88rem',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: '20px', color: pasta ? C.statusSuccess : C.onSurfaceVariant }}>
                {pasta ? 'folder' : 'folder_off'}
              </span>
              {pasta
                ? <span style={{ color: C.onSurface, fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pasta.name}</span>
                : <span style={{ color: C.onSurfaceVariant }}>Nenhuma pasta escolhida — o arquivo vai para a pasta Downloads.</span>}
            </div>
            <button type="button" onClick={onEscolherPasta} style={btnSecondary}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>drive_folder_upload</span>
              {pasta ? 'Trocar pasta' : 'Escolher pasta'}
            </button>
            {pasta && <button type="button" onClick={onEsquecerPasta} style={btnGhost}>Usar Downloads</button>}
          </div>
        ) : (
          <div style={{ background: C.statusInfoBg, color: C.statusInfo, borderRadius: '0.4rem', padding: '0.7rem 0.9rem', fontFamily: F.body, fontSize: '0.84rem', lineHeight: 1.5 }}>
            Este navegador não permite escolher uma pasta: o backup será salvo na pasta <strong>Downloads</strong>.
            Para escolher a pasta, use o <strong>Google Chrome</strong> ou o <strong>Microsoft Edge</strong> no computador.
          </div>
        )}
        {pastaSuportada && (
          <p style={{ ...ajuda, margin: '0.6rem 0 0', fontSize: '0.76rem' }}>
            Por segurança, o navegador mostra só o nome da pasta (não o caminho completo). Ao fazer o backup, ele pode
            pedir para você clicar em “Permitir”.
          </p>
        )}
      </section>

      {/* Avisos */}
      <section style={cardMb}>
        <h2 style={titulo}>Avisos de backup</h2>
        <p style={ajuda}>
          Quando passar do prazo, aparece um aviso no topo do sistema para o administrador. O backup completo também
          conta como leve.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '0.9rem' }}>
          {Object.entries(TIPOS_BACKUP).map(([tipo, meta]) => {
            const c = cfg[tipo]
            const vencido = backupVencido(c.ultimo?.em, c.freq)
            const prox = proximoBackup(c.ultimo?.em, c.freq)
            return (
              <div key={tipo} style={{ border: `1px solid ${C.borderSubtle}`, borderRadius: '0.5rem', padding: '0.85rem' }}>
                <div style={{ fontFamily: F.headline, fontWeight: '800', fontSize: '0.95rem', color: C.onSurface }}>{meta.rotulo}</div>
                <div style={{ fontFamily: F.body, fontSize: '0.78rem', color: C.onSurfaceVariant, marginBottom: '0.6rem' }}>
                  {tipo === 'leve' ? 'Todos os dados, sem os documentos anexados.' : 'Todos os dados e os documentos anexados na Cobrança.'}
                </div>
                <label style={{ display: 'block', fontFamily: F.body, fontSize: '0.75rem', fontWeight: '600', color: C.onSurfaceVariant, marginBottom: '0.3rem' }}>
                  Avisar
                </label>
                <select value={c.freq} onChange={e => trocarFreq(tipo, e.target.value)} style={inputCss}>
                  {FREQUENCIAS.map(f => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
                </select>
                <div style={{ fontFamily: F.body, fontSize: '0.8rem', color: C.onSurface, marginTop: '0.65rem', lineHeight: 1.5 }}>
                  <div>Último: {c.ultimo ? <strong>{fmtDataHora(c.ultimo.em)}</strong> : <strong>nunca</strong>}{c.ultimo?.por ? ` · ${c.ultimo.por}` : ''}</div>
                  <div style={{ color: vencido ? C.statusWarning : C.onSurfaceVariant, fontWeight: vencido ? '700' : '400' }}>
                    {vencido ? 'Está na hora de fazer.' : `Próximo aviso: ${fmtDia(prox)}`}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Fazer agora */}
      <section style={cardMb}>
        <h2 style={titulo}>Fazer backup agora</h2>
        <p style={ajuda}>
          É gerado um único arquivo <strong>.zip</strong> com: <strong>dados.json</strong> (cópia exata, usada para
          restaurar), <strong>planilha.xlsx</strong> (os mesmos dados para abrir no Excel, uma aba por tabela) e
          <strong> resumo.txt</strong> (data, quantidade de registros e código de conferência). O completo traz também a
          pasta <strong>anexos</strong>. Senhas não fazem parte do backup.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: rodando || resultado || erro ? '0.9rem' : 0 }}>
          {Object.entries(TIPOS_BACKUP).map(([tipo, meta]) => (
            <button key={tipo} type="button" onClick={() => executar(tipo)} disabled={!!rodando}
              style={{ ...(tipo === 'completo' ? btnPrimary : btnSecondary), opacity: rodando && rodando !== tipo ? 0.5 : 1 }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>{tipo === 'completo' ? 'inventory_2' : 'backup'}</span>
              {rodando === tipo ? 'Fazendo…' : `${meta.rotulo} (${meta.detalhe})`}
            </button>
          ))}
        </div>
        {rodando && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: F.body, fontSize: '0.85rem', color: C.onSurfaceVariant }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>hourglass_top</span>
            {progresso} Não feche esta tela.
          </div>
        )}
        <BackupResultado resultado={resultado} erro={erro} onFechar={limpar} />
      </section>

      <RestaurarBackup />
    </div>
  )
}
