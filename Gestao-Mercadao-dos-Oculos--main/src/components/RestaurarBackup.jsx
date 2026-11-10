import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { logErro } from '../lib/erros'
import { C, F, card, inputCss, btnPrimary, btnSecondary, btnGhost, thStyle, tdStyle } from '../lib/ds'
import { executarBackup, fmtDataHora, TIPOS_BACKUP } from '../lib/backup'
import { lerArquivoBackup, prepararRestauracao, executarRestauracao } from '../lib/restaurar'

const PALAVRA = 'RESTAURAR'
const num = n => n ? n.toLocaleString('pt-BR') : '—'

export default function RestaurarBackup() {
  const { profile } = useAuth()
  const [backup, setBackup] = useState(null)
  const [plano, setPlano] = useState(null)
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [modo, setModo] = useState(null)
  const [confirma, setConfirma] = useState('')
  const [progresso, setProgresso] = useState('')
  const [executando, setExecutando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState('')

  function recomecar() {
    setBackup(null); setPlano(null); setNomeArquivo(''); setModo(null); setConfirma('')
    setResultado(null); setErro(''); setProgresso('')
  }

  async function escolherArquivo(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    recomecar()
    setNomeArquivo(file.name)
    setProgresso('Lendo o arquivo…')
    try {
      const b = await lerArquivoBackup(file)
      setBackup(b)
      setPlano(await prepararRestauracao(b, setProgresso))
    } catch (err) {
      logErro('Ler backup para restaurar', err)
      setErro(err.message || String(err))
    } finally {
      setProgresso('')
    }
  }

  async function restaurar() {
    setExecutando(true); setErro('')
    try {
      // 1) Backup de segurança do estado atual (precisa vir logo no clique).
      setProgresso('Fazendo um backup de segurança do sistema atual…')
      const seg = await executarBackup('leve', { feitoPor: profile?.nome, onProgresso: p => setProgresso(`Backup de segurança: ${p}`) })
      if (seg.erros.length) throw new Error('O backup de segurança não ficou completo, por isso a restauração foi cancelada. Nada foi alterado.')

      // 2) Recalcula a comparação (algo pode ter mudado desde a prévia) e restaura.
      const atual = await prepararRestauracao(backup, setProgresso)
      const r = await executarRestauracao(backup, atual, modo, setProgresso)
      setResultado({ ...r, seguranca: seg })
    } catch (err) {
      logErro('Restaurar backup', err)
      setErro(err.message || String(err))
    } finally {
      setExecutando(false); setProgresso('')
    }
  }

  const ativos = (plano || []).filter(t => !t.pular && !t.erro)
  const tot = {
    faltam: ativos.reduce((s, t) => s + t.faltam.length, 0),
    diferentes: ativos.reduce((s, t) => s + t.diferentes.length, 0),
    sobrando: ativos.reduce((s, t) => s + t.sobrando.length, 0),
  }
  const meta = backup?.conteudo
  const podeRestaurar = modo && !executando && (modo === 'faltantes' ? tot.faltam > 0 : confirma.trim().toUpperCase() === PALAVRA)

  return (
    <section style={{ ...card, marginBottom: '1.25rem' }}>
      <h2 style={{ margin: '0 0 0.3rem', fontSize: '1rem', fontWeight: '800', fontFamily: F.headline, color: C.onSurface }}>Restaurar backup</h2>
      <p style={{ margin: '0 0 1rem', fontSize: '0.84rem', color: C.onSurfaceVariant, fontFamily: F.body, lineHeight: 1.5 }}>
        Escolha um arquivo de backup (.zip). Antes de alterar qualquer coisa, o sistema mostra o que tem no backup e o
        que vai mudar. Ao restaurar, ele faz primeiro um <strong>backup de segurança</strong> do estado atual.
      </p>

      {!resultado && (
        <label style={{ ...btnSecondary, cursor: executando ? 'default' : 'pointer', opacity: executando ? 0.5 : 1 }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>upload_file</span>
          {backup ? 'Escolher outro arquivo' : 'Escolher arquivo de backup'}
          <input type="file" accept=".zip,application/zip" onChange={escolherArquivo} disabled={executando} style={{ display: 'none' }} />
        </label>
      )}

      {progresso && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: F.body, fontSize: '0.85rem', color: C.onSurfaceVariant, marginTop: '0.9rem' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>hourglass_top</span>
          {progresso} {executando && 'Não feche esta tela.'}
        </div>
      )}
      {erro && <Faixa tipo="erro" icone="error">{erro}</Faixa>}

      {/* Prévia */}
      {plano && !resultado && (
        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1.5rem', fontFamily: F.body, fontSize: '0.85rem', color: C.onSurface }}>
            <span><strong>Arquivo:</strong> {nomeArquivo}</span>
            <span><strong>Tipo:</strong> {TIPOS_BACKUP[meta.tipo]?.rotulo || meta.tipo}</span>
            <span><strong>Feito em:</strong> {fmtDataHora(meta.criado_em)}{meta.feito_por ? ` por ${meta.feito_por}` : ''}</span>
            <span style={{ color: backup.integro === false ? C.statusDanger : backup.integro ? C.statusSuccess : C.onSurfaceVariant, fontWeight: '700' }}>
              {backup.integro === false ? '⚠ Arquivo alterado ou danificado' : backup.integro ? '✓ Arquivo íntegro' : 'Sem código de conferência'}
            </span>
          </div>

          <div style={{ overflowX: 'auto', border: `1px solid ${C.borderSubtle}`, borderRadius: '0.5rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
              <thead>
                <tr>
                  {['Tabela', 'No backup', 'Hoje', 'Faltam', 'Alterados depois', 'Novos depois'].map((h, i) => (
                    <th key={h} style={{ ...thStyle, textAlign: i ? 'right' : 'left', whiteSpace: 'normal', verticalAlign: 'bottom' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plano.map(t => (
                  <tr key={t.nome}>
                    <td style={{ ...tdStyle, fontWeight: '600', whiteSpace: 'nowrap' }}>{t.rotulo}</td>
                    {t.pular || t.erro ? (
                      <td colSpan={5} style={{ ...tdStyle, color: t.erro ? C.statusDanger : C.onSurfaceVariant, fontSize: '0.78rem' }}>
                        {t.erro ? `Não foi possível ler: ${t.erro}` : t.pular}
                      </td>
                    ) : (
                      <>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{num(t.noBackup)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{num(t.noSistema)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: t.faltam.length ? C.statusSuccess : undefined, fontWeight: t.faltam.length ? '700' : '400' }}>{num(t.faltam.length)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{num(t.diferentes.length)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{num(t.sobrando.length)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Modos */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '0.8rem' }}>
            <OpcaoModo ativo={modo === 'faltantes'} onClick={() => setModo('faltantes')} icone="healing"
              titulo="Recuperar o que falta" selo="Seguro" seloCor={C.statusSuccess} seloFundo={C.statusSuccessBg}>
              Traz de volta os <strong>{num(tot.faltam)}</strong> registro(s) que existem no backup e não existem mais no
              sistema. Não altera nem apaga nada do que está no sistema hoje.
            </OpcaoModo>
            <OpcaoModo ativo={modo === 'tudo'} onClick={() => setModo('tudo')} icone="history"
              titulo="Voltar tudo como estava no backup" selo="Cuidado" seloCor={C.statusDanger} seloFundo={C.statusDangerBg}>
              Recupera <strong>{num(tot.faltam)}</strong>, desfaz <strong>{num(tot.diferentes)}</strong> alteração(ões) e
              <strong> apaga {num(tot.sobrando)}</strong> registro(s) cadastrados depois do backup. Tudo o que foi feito
              depois de {fmtDataHora(meta.criado_em)} será perdido.
            </OpcaoModo>
          </div>

          {modo === 'tudo' && (
            <label style={{ fontFamily: F.body, fontSize: '0.84rem', color: C.statusDanger, fontWeight: '600' }}>
              Para confirmar, digite <strong>{PALAVRA}</strong>:
              <input value={confirma} onChange={e => setConfirma(e.target.value)} disabled={executando}
                style={{ ...inputCss, maxWidth: '240px', display: 'block', marginTop: '0.35rem', borderColor: C.statusDanger }} />
            </label>
          )}
          {modo === 'faltantes' && tot.faltam === 0 && (
            <Faixa tipo="info" icone="info">Não falta nada: tudo o que está no backup ainda existe no sistema.</Faixa>
          )}

          {modo && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" onClick={restaurar} disabled={!podeRestaurar}
                style={{ ...btnPrimary, opacity: podeRestaurar ? 1 : 0.5, cursor: podeRestaurar ? 'pointer' : 'default' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>settings_backup_restore</span>
                {executando ? 'Restaurando…' : modo === 'tudo' ? 'Voltar tudo como estava' : 'Recuperar o que falta'}
              </button>
              {!executando && <button type="button" onClick={recomecar} style={btnGhost}>Cancelar</button>}
            </div>
          )}
        </div>
      )}

      {/* Resultado */}
      {resultado && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginTop: '0.5rem' }}>
          <Faixa tipo={resultado.falhas.length ? 'aviso' : 'ok'} icone={resultado.falhas.length ? 'warning' : 'check_circle'}>
            <strong>{resultado.falhas.length ? 'Restauração concluída com pendências.' : 'Restauração concluída.'}</strong>{' '}
            Backup de segurança salvo na {resultado.seguranca.local}: {resultado.seguranca.nome}
          </Faixa>
          <div style={{ overflowX: 'auto', border: `1px solid ${C.borderSubtle}`, borderRadius: '0.5rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
              <thead><tr>{['Tabela', 'Recuperados', 'Desfeitos', 'Apagados'].map((h, i) => <th key={h} style={{ ...thStyle, textAlign: i ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
              <tbody>
                {resultado.relatorio.filter(r => r.inseridos || r.alterados || r.apagados).map(r => (
                  <tr key={r.rotulo}>
                    <td style={{ ...tdStyle, fontWeight: '600' }}>{r.rotulo}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{num(r.inseridos)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{num(r.alterados)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{num(r.apagados)}</td>
                  </tr>
                ))}
                {resultado.arquivos > 0 && (
                  <tr><td style={{ ...tdStyle, fontWeight: '600' }}>Arquivos anexos</td><td style={{ ...tdStyle, textAlign: 'right' }}>{num(resultado.arquivos)}</td><td style={tdStyle} /><td style={tdStyle} /></tr>
                )}
              </tbody>
            </table>
          </div>
          {resultado.falhas.length > 0 && (
            <Faixa tipo="aviso" icone="report">
              <strong>{resultado.falhas.length} registro(s) não puderam ser restaurados:</strong>
              <ul style={{ margin: '0.3rem 0 0', paddingLeft: '1.1rem' }}>
                {resultado.falhas.slice(0, 8).map((f, i) => <li key={i}>{f.tabela}: {f.motivo}</li>)}
                {resultado.falhas.length > 8 && <li>…e mais {resultado.falhas.length - 8}</li>}
              </ul>
            </Faixa>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => window.location.reload()} style={btnPrimary}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>refresh</span>
              Recarregar o sistema
            </button>
            <button type="button" onClick={recomecar} style={btnGhost}>Fechar</button>
          </div>
        </div>
      )}
    </section>
  )
}

function OpcaoModo({ ativo, onClick, icone, titulo, selo, seloCor, seloFundo, children }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo}
      style={{
        textAlign: 'left', cursor: 'pointer', borderRadius: '0.5rem', padding: '0.85rem', fontFamily: F.body,
        border: `2px solid ${ativo ? C.primaryContainer : C.borderSubtle}`,
        background: ativo ? C.surfaceContainerLow : C.surfaceContainerLowest,
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.4rem' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '20px', color: seloCor }}>{icone}</span>
        <span style={{ fontFamily: F.headline, fontWeight: '800', fontSize: '0.92rem', color: C.onSurface }}>{titulo}</span>
        <span style={{ marginLeft: 'auto', background: seloFundo, color: seloCor, borderRadius: '999px', padding: '0.1rem 0.55rem', fontSize: '0.7rem', fontWeight: '700' }}>{selo}</span>
      </div>
      <div style={{ fontSize: '0.82rem', color: C.onSurfaceVariant, lineHeight: 1.5 }}>{children}</div>
    </button>
  )
}

function Faixa({ tipo, icone, children }) {
  const cores = {
    ok:    [C.statusSuccessBg, C.statusSuccess],
    aviso: [C.statusWarningBg, C.statusWarning],
    erro:  [C.statusDangerBg, C.statusDanger],
    info:  [C.statusInfoBg, C.statusInfo],
  }[tipo]
  return (
    <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'flex-start', background: cores[0], color: cores[1], borderRadius: '0.5rem', padding: '0.7rem 0.9rem', fontFamily: F.body, fontSize: '0.84rem', lineHeight: 1.45, marginTop: '0.2rem' }}>
      <span className="material-symbols-outlined" style={{ fontSize: '20px', flexShrink: 0 }}>{icone}</span>
      <div style={{ minWidth: 0, wordBreak: 'break-word' }}>{children}</div>
    </div>
  )
}
