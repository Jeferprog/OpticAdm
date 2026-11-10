import { useState, useRef, useEffect, Fragment } from 'react'
import { C, F } from '../lib/ds'

/* ═══════════════════════════════════════════════════════════════════
   Componentes de gráfico (SVG/HTML puro, sem biblioteca).
   Paleta categórica validada (daltonismo / contraste) — ordem fixa:
   azul, laranja, verde-água, amarelo. Cores claras (verde-água,
   amarelo) ficam abaixo de 3:1 no fundo branco → por isso todo gráfico
   tem legenda e "Ver tabela".
   ═══════════════════════════════════════════════════════════════════ */
export const SERIE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100']
// Rampa ordinal (um só tom, claro → escuro) para faixas ordenadas.
export const RAMPA_ORDINAL = ['#86b6ef', '#3987e5', '#256abf', '#104281']
const GRADE = '#e6e8ea'
const SUPERFICIE = '#ffffff'

export function fBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}
// Eixo: R$ 0 · R$ 20 mil · R$ 1,2 mi
export function fBRLCurto(v) {
  const a = Math.abs(v || 0)
  if (a >= 1e6) return `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (a >= 1e3) return `R$ ${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return `R$ ${Math.round(v || 0)}`
}

function useLargura() {
  const ref = useRef(null)
  const [w, setW] = useState(600)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.floor(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

// Divisões "redondas" para o eixo Y.
function ticksEixo(max) {
  if (!(max > 0)) return [0, 1]
  const bruto = max / 4
  const pot = Math.pow(10, Math.floor(Math.log10(bruto)))
  const passo = [1, 2, 2.5, 5, 10].map(m => m * pot).find(p => p >= bruto) || pot * 10
  const topo = Math.ceil(max / passo) * passo
  const out = []
  for (let v = 0; v <= topo + 1e-9; v += passo) out.push(v)
  return out
}

/* ── Cartão do gráfico (título, legenda, alternar tabela) ── */
export function CartaoGrafico({ titulo, subtitulo, legenda, tabela, children, carregando }) {
  const [verTabela, setVerTabela] = useState(false)
  return (
    <div style={{
      background: SUPERFICIE, border: `1px solid ${C.borderSubtle}`, borderRadius: '0.75rem',
      padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: '700', fontFamily: F.headline, color: C.onSurface, fontSize: '0.95rem' }}>{titulo}</div>
          {subtitulo && <div style={{ fontFamily: F.body, color: C.onSurfaceVariant, fontSize: '0.78rem', marginTop: '2px' }}>{subtitulo}</div>}
        </div>
        {tabela && (
          <button type="button" onClick={() => setVerTabela(v => !v)}
            style={{ background: 'none', border: `1px solid ${C.borderSubtle}`, borderRadius: '0.4rem', padding: '0.25rem 0.6rem', fontSize: '0.75rem', fontFamily: F.body, color: C.onSurfaceVariant, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {verTabela ? 'Ver gráfico' : 'Ver tabela'}
          </button>
        )}
      </div>
      {legenda && legenda.length > 1 && !verTabela && <Legenda itens={legenda} />}
      <div style={{ opacity: carregando ? 0.45 : 1, transition: 'opacity 0.2s' }}>
        {verTabela && tabela ? <Tabela {...tabela} /> : children}
      </div>
    </div>
  )
}

export function Legenda({ itens }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1rem' }}>
      {itens.map(i => (
        <span key={i.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontFamily: F.body, fontSize: '0.78rem', color: C.onSurfaceVariant }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: i.cor, flexShrink: 0 }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}

function Tabela({ colunas, linhas }) {
  return (
    <div style={{ overflowX: 'auto', maxHeight: '320px', overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', fontFamily: F.body }}>
        <thead>
          <tr>
            {colunas.map((c, i) => (
              <th key={c} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '0.4rem 0.6rem', color: C.onSurfaceVariant, fontWeight: '600', borderBottom: `1px solid ${C.borderSubtle}`, whiteSpace: 'nowrap', position: 'sticky', top: 0, background: SUPERFICIE }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, r) => (
            <tr key={r}>
              {l.map((cel, i) => (
                <td key={i} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '0.4rem 0.6rem', borderBottom: `1px solid ${C.borderSubtle}`, color: C.onSurface, fontVariantNumeric: i === 0 ? 'normal' : 'tabular-nums', whiteSpace: 'nowrap' }}>{cel}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── Dica flutuante (valor em destaque, rótulo em segundo plano) ── */
function Dica({ x, y, largura, titulo, linhas }) {
  const W = 200
  const esquerda = Math.min(Math.max(8, x - W / 2), largura - W - 8)
  return (
    <div role="tooltip" style={{
      position: 'absolute', left: esquerda, top: Math.max(0, y - 8), transform: 'translateY(-100%)',
      width: W, background: C.onSurface, color: '#fff', borderRadius: '0.5rem', padding: '0.55rem 0.7rem',
      fontFamily: F.body, fontSize: '0.75rem', pointerEvents: 'none', boxShadow: '0 6px 18px rgba(0,0,0,0.2)', zIndex: 5,
    }}>
      <div style={{ opacity: 0.75, marginBottom: '0.3rem' }}>{titulo}</div>
      {linhas.map(l => (
        <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.15rem' }}>
          {l.cor && <span style={{ width: '10px', height: '2px', background: l.cor, flexShrink: 0 }} />}
          <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{l.valor}</strong>
          <span style={{ opacity: 0.75, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.label}</span>
        </div>
      ))}
    </div>
  )
}

/* ── Colunas (uma série, empilhadas ou agrupadas) ──
   categorias: [{ rotulo, rotuloLongo?, valores: { [key]: número } }]
   series:     [{ key, label, cor }]                                     */
export function GraficoColunas({ categorias, series, modo = 'empilhado', altura = 220, formatar = fBRL, destacar = [] }) {
  const [ref, largura] = useLargura()
  const [ativo, setAtivo] = useState(null)
  const mL = 64, mR = 12, mT = 22, mB = 28
  const W = largura, H = altura + mT + mB
  const plotW = Math.max(10, W - mL - mR)
  const n = Math.max(1, categorias.length)
  const banda = plotW / n

  const totalCat = c => series.reduce((s, se) => s + (c.valores[se.key] || 0), 0)
  const maxV = modo === 'empilhado'
    ? Math.max(0, ...categorias.map(totalCat))
    : Math.max(0, ...categorias.flatMap(c => series.map(se => c.valores[se.key] || 0)))
  const ticks = ticksEixo(maxV)
  const topo = ticks[ticks.length - 1] || 1
  const y = v => mT + altura - (v / topo) * altura

  const nGrupo = modo === 'agrupado' ? series.length : 1
  const larguraBarra = Math.min(24, (banda * 0.62 - (nGrupo - 1) * 2) / nGrupo)
  const larguraGrupo = larguraBarra * nGrupo + (nGrupo - 1) * 2
  const passoRotulo = Math.ceil(n / Math.max(1, Math.floor(plotW / 48)))

  // Rótulo de valor só no maior e nas categorias destacadas (ex.: mês atual).
  const idxMax = categorias.reduce((bi, c, i, arr) => (totalCat(c) > totalCat(arr[bi]) ? i : bi), 0)
  const rotulados = new Set([idxMax, ...destacar].filter(i => i >= 0 && i < n))

  function barra(x, v0, v1, cor, arredondaTopo, k) {
    const yTop = y(v1), yBase = y(v0)
    const h = Math.max(0, yBase - yTop - (v0 > 0 ? 2 : 0))   // 2px de respiro entre segmentos
    if (h <= 0) return null
    const r = arredondaTopo ? Math.min(4, h, larguraBarra / 2) : 0
    const x0 = x, x1 = x + larguraBarra, yb = yTop + h
    const d = r > 0
      ? `M${x0},${yb} L${x0},${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} L${x1 - r},${yTop} Q${x1},${yTop} ${x1},${yTop + r} L${x1},${yb} Z`
      : `M${x0},${yb} L${x0},${yTop} L${x1},${yTop} L${x1},${yb} Z`
    return <path key={k} d={d} fill={cor} />
  }

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', minWidth: 0 }} onMouseLeave={() => setAtivo(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} height={H} role="img" aria-label="Gráfico de colunas" style={{ display: 'block', width: '100%', overflow: 'visible' }}>
        {/* grade + eixo Y */}
        {ticks.map(t => (
          <g key={t}>
            <line x1={mL} x2={W - mR} y1={y(t)} y2={y(t)} stroke={GRADE} strokeWidth="1" />
            <text x={mL - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fontFamily={F.body} fill={C.onSurfaceVariant} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fBRLCurto(t)}
            </text>
          </g>
        ))}
        {categorias.map((c, i) => {
          const cx = mL + banda * i + banda / 2
          const x0 = cx - larguraGrupo / 2
          const marcas = []
          if (modo === 'empilhado') {
            let acc = 0
            const visiveis = series.filter(se => (c.valores[se.key] || 0) > 0)
            visiveis.forEach((se, k) => {
              const v = c.valores[se.key] || 0
              marcas.push(barra(x0, acc, acc + v, se.cor, k === visiveis.length - 1, se.key))
              acc += v
            })
          } else {
            series.forEach((se, k) => {
              marcas.push(barra(x0 + k * (larguraBarra + 2), 0, c.valores[se.key] || 0, se.cor, true, se.key))
            })
          }
          const total = modo === 'empilhado' ? totalCat(c) : Math.max(0, ...series.map(se => c.valores[se.key] || 0))
          return (
            <g key={i}>
              <g opacity={ativo === null || ativo === i ? 1 : 0.55}>{marcas}</g>
              {rotulados.has(i) && total > 0 && (
                <text x={cx > W - mR - 34 ? W - 2 : cx} y={y(total) - 6} textAnchor={cx > W - mR - 34 ? 'end' : 'middle'} fontSize="11" fontWeight="600" fontFamily={F.body} fill={C.onSurface}>
                  {fBRLCurto(total)}
                </text>
              )}
              {i % passoRotulo === 0 && (
                <text x={cx} y={mT + altura + 18} textAnchor="middle" fontSize="11" fontFamily={F.body} fill={C.onSurfaceVariant}>
                  {c.rotulo}
                </text>
              )}
              {/* área de toque maior que a barra */}
              <rect x={mL + banda * i} y={mT} width={banda} height={altura} fill="transparent"
                tabIndex={0} aria-label={`${c.rotuloLongo || c.rotulo}: ${formatar(modo === 'empilhado' ? totalCat(c) : total)}`}
                onMouseEnter={() => setAtivo(i)} onFocus={() => setAtivo(i)} onBlur={() => setAtivo(null)}
                style={{ cursor: 'default', outline: 'none' }} />
            </g>
          )
        })}
        <line x1={mL} x2={W - mR} y1={mT + altura} y2={mT + altura} stroke={C.outlineVariant} strokeWidth="1" />
      </svg>
      {ativo !== null && categorias[ativo] && (
        <Dica
          x={mL + banda * ativo + banda / 2} y={y(modo === 'empilhado' ? totalCat(categorias[ativo]) : Math.max(0, ...series.map(se => categorias[ativo].valores[se.key] || 0)))}
          largura={W}
          titulo={categorias[ativo].rotuloLongo || categorias[ativo].rotulo}
          linhas={[
            ...series.map(se => ({ label: se.label, cor: se.cor, valor: formatar(categorias[ativo].valores[se.key] || 0) })),
            ...(modo === 'empilhado' && series.length > 1 ? [{ label: 'Total', valor: formatar(totalCat(categorias[ativo])) }] : []),
          ]}
        />
      )}
    </div>
  )
}

/* ── Barras horizontais (ranking / faixas) ──
   itens: [{ rotulo, valor, cor?, detalhe? }]  — valor na ponta da barra. */
export function GraficoBarrasH({ itens, formatar = fBRL, cor = SERIE[0], vazio = 'Sem dados no período.' }) {
  const [ativo, setAtivo] = useState(null)
  const max = Math.max(0, ...itens.map(i => i.valor || 0))
  if (!itens.length || max <= 0) {
    return <div style={{ color: C.onSurfaceVariant, fontFamily: F.body, fontSize: '0.85rem', padding: '1.5rem 0', textAlign: 'center' }}>{vazio}</div>
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 30%) minmax(0, 1fr) auto', gap: '0.55rem 0.75rem', alignItems: 'center' }}>
      {itens.map((it, i) => (
        <Fragment key={it.rotulo + i}>
          <div title={it.rotulo} style={{ fontFamily: F.body, fontSize: '0.8rem', color: C.onSurface, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {it.rotulo}
          </div>
          <div tabIndex={0} onMouseEnter={() => setAtivo(i)} onMouseLeave={() => setAtivo(null)} onFocus={() => setAtivo(i)} onBlur={() => setAtivo(null)}
            aria-label={`${it.rotulo}: ${formatar(it.valor)}${it.detalhe ? ` (${it.detalhe})` : ''}`}
            style={{ display: 'flex', alignItems: 'center', minHeight: '24px', outline: 'none' }}>
            <div style={{
              height: '18px', width: `${Math.max(0.5, (it.valor / max) * 100)}%`, minWidth: '3px',
              background: it.cor || cor, borderRadius: '0 4px 4px 0',
              opacity: ativo === null || ativo === i ? 1 : 0.55, transition: 'opacity 0.12s',
            }} />
          </div>
          <span style={{ fontFamily: F.body, fontSize: '0.78rem', color: C.onSurface, fontWeight: '600', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
            {formatar(it.valor)}
            {it.detalhe && <span style={{ color: C.onSurfaceVariant, fontWeight: '400' }}> · {it.detalhe}</span>}
          </span>
        </Fragment>
      ))}
    </div>
  )
}
