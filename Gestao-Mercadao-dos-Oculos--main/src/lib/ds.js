/* Design System — Mercadão dos Óculos */

export const C = {
  primary:                '#9d0518',
  primaryContainer:       '#c0272d',
  onPrimary:              '#ffffff',
  secondary:              '#466080',
  secondaryContainer:     '#bed9fe',
  onSecondaryContainer:   '#455f7f',
  surface:                '#f7f9fb',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow:    '#f2f4f6',
  surfaceContainer:       '#eceef0',
  surfaceContainerHigh:   '#e6e8ea',
  onSurface:              '#191c1e',
  onSurfaceVariant:       '#5a403e',
  outline:                '#8f706d',
  outlineVariant:         '#e3bebb',
  borderSubtle:           '#E2E8F0',
  tableHeader:            '#F1F5F9',
  statusDanger:           '#C0272D',
  statusDangerBg:         '#fee2e2',
  statusSuccess:          '#166534',
  statusSuccessBg:        '#dcfce7',
  statusWarning:          '#9A3412',
  statusWarningBg:        '#fef3c7',
  statusInfo:             '#0F2D4A',
  statusInfoBg:           '#dbeafe',
  error:                  '#ba1a1a',
}

export const F = {
  headline: "'Hanken Grotesk', sans-serif",
  body:     "'Inter', sans-serif",
  mono:     "'JetBrains Mono', monospace",
}

/* Shared component styles */
export const card = {
  background:   C.surfaceContainerLowest,
  border:       `1px solid ${C.borderSubtle}`,
  borderRadius: '0.5rem',
  padding:      '1.25rem',
}

export const inputCss = {
  width:        '100%',
  padding:      '0.55rem 0.75rem',
  border:       `1.5px solid ${C.borderSubtle}`,
  borderRadius: '0.375rem',
  fontSize:     '0.875rem',
  fontFamily:   F.body,
  outline:      'none',
  background:   C.surfaceContainerLowest,
  color:        C.onSurface,
  transition:   'border-color 0.15s',
}

export const inputReadOnly = {
  ...inputCss,
  background: C.surfaceContainerLow,
  color:      C.onSurfaceVariant,
  cursor:     'default',
}

export const btnPrimary = {
  padding:      '0.55rem 1.125rem',
  background:   C.primaryContainer,
  color:        C.onPrimary,
  border:       'none',
  borderRadius: '0.375rem',
  fontSize:     '0.875rem',
  fontFamily:   F.body,
  fontWeight:   '600',
  cursor:       'pointer',
  display:      'inline-flex',
  alignItems:   'center',
  gap:          '0.375rem',
  transition:   'opacity 0.15s',
  whiteSpace:   'nowrap',
}

export const btnSecondary = {
  padding:      '0.55rem 1.125rem',
  background:   'transparent',
  color:        C.secondary,
  border:       `1.5px solid ${C.secondary}`,
  borderRadius: '0.375rem',
  fontSize:     '0.875rem',
  fontFamily:   F.body,
  fontWeight:   '500',
  cursor:       'pointer',
  display:      'inline-flex',
  alignItems:   'center',
  gap:          '0.375rem',
  transition:   'all 0.15s',
  whiteSpace:   'nowrap',
}

export const btnGhost = {
  padding:      '0.55rem 1.125rem',
  background:   'transparent',
  color:        C.onSurfaceVariant,
  border:       'none',
  borderRadius: '0.375rem',
  fontSize:     '0.875rem',
  fontFamily:   F.body,
  fontWeight:   '500',
  cursor:       'pointer',
  display:      'inline-flex',
  alignItems:   'center',
  gap:          '0.375rem',
  transition:   'background 0.15s',
}

export const pill = (type = 'default') => {
  const map = {
    success: { background: C.statusSuccessBg, color: C.statusSuccess },
    danger:  { background: C.statusDangerBg,  color: C.statusDanger  },
    warning: { background: C.statusWarningBg, color: C.statusWarning },
    info:    { background: C.statusInfoBg,    color: C.statusInfo    },
    default: { background: C.surfaceContainerHigh, color: C.onSurfaceVariant },
  }
  return {
    ...(map[type] || map.default),
    borderRadius: '9999px',
    padding:      '0.2rem 0.65rem',
    fontSize:     '0.72rem',
    fontWeight:   '600',
    fontFamily:   F.body,
    display:      'inline-block',
    whiteSpace:   'nowrap',
  }
}

export const thStyle = {
  padding:       '0.6rem 0.875rem',
  textAlign:     'left',
  fontSize:      '0.7rem',
  fontFamily:    F.body,
  fontWeight:    '600',
  color:         C.onSurfaceVariant,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  whiteSpace:    'nowrap',
  background:    C.tableHeader,
  borderBottom:  `1.5px solid ${C.borderSubtle}`,
}

export const tdStyle = {
  padding:    '0.6rem 0.875rem',
  fontSize:   '0.875rem',
  fontFamily: F.body,
  color:      C.onSurface,
  borderBottom: `1px solid ${C.borderSubtle}`,
  verticalAlign: 'middle',
}

export const monoVal = {
  fontFamily: F.mono,
  fontSize:   '0.875rem',
  fontWeight: '500',
}
