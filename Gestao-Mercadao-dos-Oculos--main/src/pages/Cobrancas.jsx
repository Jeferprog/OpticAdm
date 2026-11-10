import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { buscarTodos } from '../lib/paginar'
import { useAuth } from '../contexts/AuthContext'
import { C, F, card as dsCard, inputCss as dsInputCss } from '../lib/ds'
import { logErro } from '../lib/erros'

/* inputCss sem width — usado em células de tabela com larguras variadas */
const { width: _w, ...inputCss } = dsInputCss

/* ── helpers ── */
function todayISO() { return new Date().toISOString().slice(0, 10) }

// Tabelas largas: altura limitada à tela, com rolagem própria — a barra lateral
// fica sempre visível; cabeçalho fixo no topo e totais (se houver) fixos embaixo.
const CSS_TABELA_ROLAGEM = `
  .tabela-rolagem thead th { position: sticky; top: 0; z-index: 2; background-color: inherit; }
  .tabela-rolagem thead tr { background-clip: padding-box; }
  .tabela-rolagem tfoot td { position: sticky; bottom: 0; z-index: 2; background-color: inherit; }
`

// Para busca: minúsculas, sem acento.
function semAcentoBusca(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() }
function normalizarNome(nome) {
  return String(nome || '').trim().toUpperCase().replace(/\s+/g, ' ')
}

// Situações do banco que devem ser tratadas como quitadas (fora da inadimplência):
// "Liquidado/Liquidada" (mesmo sem data de liquidação), "Baixado por solicitação" e "Rejeitado".
function situacaoBaixa(situacao) {
  const s = String(situacao || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (s.includes('LIQUIDAD') && !s.includes('NAO LIQUIDAD')) return true
  return s.includes('BAIXADO POR SOLICITACAO') || s.includes('REJEITADO')
}
// Um boleto está QUITADO/fora da inadimplência quando: tem data de liquidação,
// a Situação Atual é "Liquidada", ou a situação (banco/atual) é baixa/rejeitado.
function boletoQuitado(b) {
  return !!b.data_liquidacao
    || b.situacao_atual === 'Liquidada'
    || situacaoBaixa(b.situacao_boleto)
    || situacaoBaixa(b.situacao_atual)
}

function parseBRL(val) {
  if (val === null || val === undefined || val === '') return null
  if (typeof val === 'number') return val
  const s = String(val).trim()
  if (!s || s === '-' || s === '—') return null
  if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
  return parseFloat(s.replace(/[^\d.]/g, '')) || 0
}

function parseDataBR(val) {
  if (!val) return null
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null
    const y = val.getFullYear(), m = val.getMonth() + 1, d = val.getDate()
    return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
  }
  const s = String(val).trim()
  if (!s || s === '-' || s === '—') return null
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split('/')
    return `${y}-${m}-${d}`
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return null
}

function fBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}
function fDate(iso) {
  if (!iso) return '—'
  // Pega só a parte da data (YYYY-MM-DD), mesmo se vier com hora (timestamp).
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  if (!y || !m || !d) return '—'
  return `${d}/${m}/${y}`
}
function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}
function fBytes(b) {
  if (!b) return '—'
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}
function tipoIcon(tipo) {
  if (!tipo) return '📎'
  if (tipo.includes('pdf')) return '📄'
  if (tipo.includes('image')) return '🖼️'
  if (tipo.includes('word') || tipo.includes('docx')) return '📝'
  return '📎'
}
function diffDias(isoA, isoB) {
  return Math.round((new Date(isoA) - new Date(isoB)) / 86400000)
}

function statusStyle(s) {
  return {
    'Novo':         { bg: C.statusDangerBg,  color: C.statusDanger  },
    'Em andamento': { bg: C.statusInfoBg,    color: C.statusInfo    },
    'Negociado':    { bg: C.statusWarningBg, color: C.statusWarning },
    'Protestado':   { bg: '#f3e8ff',         color: '#6b21a8'       },
    'Quitado':      { bg: C.statusSuccessBg, color: C.statusSuccess },
  }[s] || { bg: C.surfaceContainerHigh, color: C.onSurfaceVariant }
}

/* ── detectar período do relatório (linhas antes do cabeçalho ou min/max vencimento) ── */
function detectarPeriodo(preHeaderRows, boletos) {
  const re = /(\d{2}\/\d{2}\/\d{4})\s+(?:a|até|ate)\s+(\d{2}\/\d{2}\/\d{4})/i
  for (const row of preHeaderRows) {
    const text = (row || []).map(c => (c != null ? String(c) : '')).join(' ')
    const m = re.exec(text)
    if (m) {
      const [d1, mo1, y1] = m[1].split('/'), [d2, mo2, y2] = m[2].split('/')
      return {
        periodoInicio: `${y1}-${mo1}-${d1}`,
        periodoFim:    `${y2}-${mo2}-${d2}`,
      }
    }
  }
  const datas = boletos.map(b => b.data_vencimento).filter(Boolean).sort()
  return { periodoInicio: datas[0] || null, periodoFim: datas[datas.length - 1] || null }
}

/* ── detectar colunas pelo cabeçalho ── */
function detectarColunas(headerRow) {
  const col = {}
  headerRow.forEach((cell, j) => {
    const raw = String(cell ?? '').trim()
    const c = raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    if (/^cart(eira)?$/i.test(raw)) col.carteira = j
    if (/n[o°º]\.?\s*doc/i.test(raw) && !c.includes('nosso')) col.numero_doc = j
    if (c.includes('nosso')) col.nosso_numero = j
    if (/^txid$/i.test(raw)) col.txid = j
    if (/^pagador$/i.test(raw)) col.nome_pagador = j
    // Vencimento ATUAL do boleto. Ignora colunas como "Vencimento original"
    // ou "Dias de vencimento" (não são a data vigente no banco).
    if (c.includes('vencimento') && !c.includes('original') && !c.includes('dias')) {
      if (col.data_vencimento === undefined || c.includes('prorrog') || c.includes('atual')) col.data_vencimento = j
    }
    if (c.includes('data') && c.includes('liquidac')) col.data_liquidacao = j
    if (c.includes('emiss') && col.data_emissao === undefined) col.data_emissao = j
    if (c.includes('valor') && !c.includes('liquidac')) col.valor = j
    if (c.includes('liquidac') && !c.includes('data') && !c.includes('valor')) col.valor_liquidacao = j
    if (c.includes('situac')) col.situacao_boleto = j
    if (/^motivo$/i.test(raw)) col.motivo = j
  })
  return col
}

/* ── parsear arquivo xlsx / csv ── */
async function parseFile(file) {
  // Carrega a biblioteca de planilhas só na hora de importar (deixa o app leve).
  const XLSXmod = await import('xlsx')
  const XLSX = XLSXmod.default || XLSXmod
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null })

  let headerIdx = -1
  let colMap = {}
  for (let i = 0; i < rows.length; i++) {
    const row = (rows[i] || []).map(c => (c != null ? String(c) : ''))
    const temNosso   = row.some(c => c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').includes('nosso'))
    const temPagador = row.some(c => /^pagador$/i.test(c.trim()))
    if (temNosso && temPagador) {
      headerIdx = i
      colMap = detectarColunas(rows[i] || [])
      break
    }
  }
  if (headerIdx === -1) throw new Error('Cabeçalho não encontrado. Verifique se o arquivo contém as colunas "Nosso Nº" e "Pagador".')

  const boletos = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] || []
    const nomePagador = String(row[colMap.nome_pagador] ?? '').trim()
    if (!nomePagador) continue
    boletos.push({
      carteira:         String(row[colMap.carteira]        ?? '').trim() || null,
      numero_doc:       String(row[colMap.numero_doc]      ?? '').trim() || null,
      nosso_numero:     String(row[colMap.nosso_numero]    ?? '').trim() || null,
      txid:             String(row[colMap.txid]            ?? '').trim() || null,
      nome_pagador:     nomePagador,
      data_vencimento:  parseDataBR(row[colMap.data_vencimento]),
      data_liquidacao:  parseDataBR(row[colMap.data_liquidacao]) || null,
      data_emissao:     colMap.data_emissao !== undefined ? (parseDataBR(row[colMap.data_emissao]) || null) : null,
      valor:            parseBRL(row[colMap.valor]),
      valor_liquidacao: parseBRL(row[colMap.valor_liquidacao]),
      situacao_boleto:  String(row[colMap.situacao_boleto] ?? '').trim() || null,
      motivo:           String(row[colMap.motivo]          ?? '').trim() || null,
    })
  }
  if (boletos.length === 0) throw new Error('Nenhuma linha de boleto encontrada após o cabeçalho.')
  const { periodoInicio, periodoFim } = detectarPeriodo(rows.slice(0, headerIdx), boletos)
  return { boletos, periodoInicio, periodoFim }
}

// Mescla duas linhas do MESMO boleto (mesmo nosso número) numa só, juntando
// status e movimentação. Campos vazios não sobrescrevem preenchidos; a
// liquidação (data/valor/situação) é mantida assim que aparecer em qualquer linha.
function mesclarBoleto(prev, b) {
  const ok = v => v !== null && v !== undefined && v !== ''
  const m = { ...prev }
  ;['carteira', 'numero_doc', 'txid', 'valor', 'motivo'].forEach(k => {
    if (ok(b[k])) m[k] = b[k]
  })
  // Emissão: fica a primeira data informada.
  if (ok(b.data_emissao) && (!ok(prev.data_emissao) || b.data_emissao < prev.data_emissao))
    m.data_emissao = b.data_emissao
  // Vencimento: se as linhas trazem datas diferentes (ex.: prorrogação),
  // fica a mais recente — é a que vale no banco.
  if (ok(b.data_vencimento) && (!ok(prev.data_vencimento) || b.data_vencimento > prev.data_vencimento))
    m.data_vencimento = b.data_vencimento
  if (ok(prev.data_liquidacao)) {
    // já estava liquidado → mantém a liquidação existente
  } else if (ok(b.data_liquidacao)) {
    m.data_liquidacao = b.data_liquidacao
    if (ok(b.valor_liquidacao)) m.valor_liquidacao = b.valor_liquidacao
    if (ok(b.situacao_boleto))  m.situacao_boleto  = b.situacao_boleto
  } else {
    // nenhuma linha liquidada ainda → fica com a última situação/valores não vazios
    if (ok(b.valor_liquidacao)) m.valor_liquidacao = b.valor_liquidacao
    if (ok(b.situacao_boleto) && !situacaoBaixa(prev.situacao_boleto)) m.situacao_boleto = b.situacao_boleto
  }
  return m
}

/* ── importar boletos no Supabase (com filial) ── */
async function importarBoletos(boletos, filialId, { periodoInicio, periodoFim, nomeArquivo, importadoPor } = {}) {
  const hoje = todayISO()

  // Busca em blocos: um .in(...) com milhares de valores estoura o limite da
  // consulta (URL). Quebramos em lotes e juntamos os resultados.
  async function buscarEmBlocos(tabela, colunas, campo, valores, tam = 150) {
    const out = []
    for (let i = 0; i < valores.length; i += tam) {
      const fatia = valores.slice(i, i + tam)
      const { data, error } = await supabase.from(tabela).select(colunas).in(campo, fatia)
      if (error) throw new Error(error.message)
      if (data) out.push(...data)
    }
    return out
  }

  const uniqueNorm = [...new Set(boletos.map(b => normalizarNome(b.nome_pagador)).filter(Boolean))]
  if (uniqueNorm.length === 0) throw new Error('Nenhum pagador válido encontrado.')

  // nome_normalizado é globalmente único — busca sem filtro de filial (em blocos)
  const existentesDB = await buscarEmBlocos('cobrancas_devedores', 'id, nome_normalizado, filial_id', 'nome_normalizado', uniqueNorm)

  const mapId = {}
  existentesDB?.forEach(d => { mapId[d.nome_normalizado] = d.id })

  const novosNorm  = uniqueNorm.filter(n => !mapId[n])
  const novosNomes = novosNorm.map(norm =>
    boletos.find(b => normalizarNome(b.nome_pagador) === norm)?.nome_pagador || norm
  )
  if (novosNorm.length > 0) {
    const { data: inseridos, error: e2 } = await supabase
      .from('cobrancas_devedores')
      .insert(novosNorm.map((norm, i) => ({
        nome_pagador:       novosNomes[i],
        pagador:            novosNomes[i],
        nome_normalizado:   norm,
        filial_id:          filialId || null,
        status_cobranca:    'Novo',
        primeiro_registro:  hoje,
        ultima_atualizacao: hoje,
      })))
      .select('id, nome_normalizado')
    if (e2) throw new Error(e2.message)
    inseridos?.forEach(d => { mapId[d.nome_normalizado] = d.id })

    if (novosNomes.length > 0) {
      await supabase.from('clientes').insert(novosNomes.map(nome => ({ nome, filial_id: filialId || null })))
    }
  }

  const idsExistentes = existentesDB?.map(d => d.id) || []
  // A importação NÃO altera a "última atualização" dos devedores já existentes.
  // Só vincula à filial os que ainda não têm filial (sem tocar na data).
  if (idsExistentes.length > 0 && filialId) {
    const semFilial = existentesDB.filter(d => !d.filial_id).map(d => d.id)
    if (semFilial.length > 0)
      await supabase.from('cobrancas_devedores').update({ filial_id: filialId }).in('id', semFilial)
  }

  // Procura boletos já existentes pelo "nosso número" INDEPENDENTE da filial.
  // Assim, um boleto importado antes sem filial é ATUALIZADO (e ganha a
  // filial), em vez de virar um segundo registro duplicado.
  const nossoNums = boletos.map(b => b.nosso_numero).filter(Boolean)
  const setExistentes = new Set()
  const vencAnterior = {}  // nosso_numero → vencimento que estava no sistema
  if (nossoNums.length > 0) {
    const boletosDB = await buscarEmBlocos('cobrancas_boletos', 'nosso_numero, data_vencimento', 'nosso_numero', [...new Set(nossoNums)])
    boletosDB.forEach(b => { setExistentes.add(b.nosso_numero); vencAnterior[b.nosso_numero] = b.data_vencimento })
  }

  // O arquivo do banco (principalmente "todas as situações") pode trazer o
  // MESMO boleto (mesmo "nosso número") em várias linhas — cada uma com uma
  // situação/movimentação. Consolidamos tudo numa ÚNICA linha por nosso
  // número, mesclando os campos e mantendo a liquidação quando houver.
  const consolidado = new Map()  // nosso_numero → base mesclada
  const semNumero = []
  boletos.forEach(b => {
    const devedorId = mapId[normalizarNome(b.nome_pagador)]
    if (!devedorId) return
    const base = {
      devedor_id: devedorId, filial_id: filialId || null,
      carteira: b.carteira, numero_doc: b.numero_doc,
      nosso_numero: b.nosso_numero, txid: b.txid,
      data_vencimento: b.data_vencimento, data_liquidacao: b.data_liquidacao,
      ...(b.data_emissao ? { data_emissao: b.data_emissao } : {}),
      valor: b.valor, valor_liquidacao: b.valor_liquidacao,
      situacao_boleto: b.situacao_boleto, motivo: b.motivo,
    }
    if (!b.nosso_numero) { semNumero.push(base); return }
    const prev = consolidado.get(b.nosso_numero)
    consolidado.set(b.nosso_numero, prev ? mesclarBoleto(prev, base) : base)
  })

  const paraInserir   = []
  const paraAtualizar = []
  ;[...consolidado.values(), ...semNumero].forEach(base => {
    if (base.nosso_numero && setExistentes.has(base.nosso_numero)) {
      paraAtualizar.push(base)
    } else {
      // Boleto novo: inicializa situacao_atual com o valor vindo do banco
      paraInserir.push({ ...base, situacao_atual: base.situacao_boleto || null })
    }
  })

  if (paraInserir.length > 0) {
    for (let i = 0; i < paraInserir.length; i += 500) {
      const { error: e3 } = await supabase.from('cobrancas_boletos').insert(paraInserir.slice(i, i + 500))
      if (e3) throw new Error(e3.message)
    }
  }
  // Atualização EM LOTE (função no banco): 500 boletos por chamada, em vez
  // de uma chamada por boleto. Se a função ainda não existir (SQL não
  // rodado), cai no modo antigo, um a um.
  let emLote = paraAtualizar.length > 0
  for (let i = 0; emLote && i < paraAtualizar.length; i += 500) {
    const lote = paraAtualizar.slice(i, i + 500).map(b => ({
      nosso_numero:     b.nosso_numero,
      data_vencimento:  b.data_vencimento,
      data_liquidacao:  b.data_liquidacao,
      valor:            b.valor,
      valor_liquidacao: b.valor_liquidacao,
      situacao_boleto:  b.situacao_boleto || null,
      motivo:           b.motivo || null,
      data_emissao:     b.data_emissao || null,
    }))
    const { error } = await supabase.rpc('atualizar_boletos_importacao', { p_boletos: lote, p_filial: filialId || null })
    if (error) {
      if (i === 0) emLote = false            // função inexistente → modo antigo
      else throw new Error(error.message)
    }
  }
  if (!emLote) {
    for (const b of paraAtualizar) {
      const patch = {
        data_vencimento:  b.data_vencimento,
        data_liquidacao:  b.data_liquidacao,
        valor:            b.valor,
        valor_liquidacao: b.valor_liquidacao,
      }
      if (b.situacao_boleto) patch.situacao_boleto = b.situacao_boleto
      if (b.motivo)          patch.motivo          = b.motivo
      if (b.data_emissao)    patch.data_emissao    = b.data_emissao
      if (filialId)          patch.filial_id       = filialId  // garante/corrige a filial do boleto
      const { error } = await supabase.from('cobrancas_boletos').update(patch).eq('nosso_numero', b.nosso_numero)
      if (error) throw new Error(error.message)
    }
  }

  const mesmoDia = (a, b) => String(a || '').slice(0, 10) === String(b || '').slice(0, 10)
  const vencimentosAlterados =
    paraAtualizar.filter(b => b.data_vencimento && !mesmoDia(b.data_vencimento, vencAnterior[b.nosso_numero])).length

  // Marca nas VENDAS a data de emissão do boleto (nome + valor da parcela).
  try { await supabase.rpc('atualizar_boletos_emitidos_vendas') } catch (_) { /* função ainda não criada */ }

  // log import (silently ignore if table doesn't exist yet)
  try {
    await supabase.from('cobrancas_importacoes').insert({
      filial_id:       filialId        || null,
      periodo_inicio:  periodoInicio   || null,
      periodo_fim:     periodoFim      || null,
      nome_arquivo:    nomeArquivo     || null,
      importado_por:   importadoPor    || null,
      total_boletos:   boletos.length,
      inseridos:       paraInserir.length,
      atualizados:     paraAtualizar.length,
      novos_devedores: novosNomes.length,
    })
  } catch (_) { /* tabela ainda não criada */ }

  return {
    total: boletos.length,
    inseridos: paraInserir.length,
    atualizados: paraAtualizar.length,
    vencimentosAlterados,
    novosDevedores: novosNomes,
    devedoresAtualizados: idsExistentes.length,
  }
}

const STATUS_OPTS = ['Novo', 'Em andamento', 'Negociado', 'Protestado', 'Quitado']
const PC_STATUS_OPTS = ['Encaminhar documentos', 'Documentação enviada', 'Aguardando a audiência', 'Processo em andamento', 'Processo concluído']

const novoBoletoVazio = () => ({
  data_vencimento: '', valor: '', nosso_numero: '', numero_doc: '',
  situacao_boleto: '', situacao_atual: '', data_liquidacao: '', valor_liquidacao: '', motivo: '',
})
const novoDevVazio = (filialId = '') => ({
  nome_pagador: '', documento: '', telefone: '', filial_id: filialId,
  status_cobranca: 'Novo', pequenas_causas: false, status_pequenas_causas: '',
  data_audiencia: '', situacao_audiencia: '', observacoes: '',
  boletos: [novoBoletoVazio()],
})

/* ════════════════════════════════ COMPONENTE PRINCIPAL ════════════════════════════════ */
export default function Cobrancas() {
  const { isAdmin, profile } = useAuth()
  const location   = useLocation()
  const fileRef    = useRef()
  const docFileRef = useRef()

  // devedor a abrir automaticamente (ex.: veio de um lembrete no Dashboard)
  const [alvoDevedor, setAlvoDevedor] = useState(location.state?.abrirDevedor || null)

  const [view,             setView]             = useState('lista')
  const [devedores,        setDevedores]        = useState([])
  const [filiais,          setFiliais]          = useState([])
  const [filtroFilial,     setFiltroFilial]     = useState('')
  const [loading,          setLoading]          = useState(true)
  const [editForm,         setEditForm]         = useState({})
  const [salvando,         setSalvando]         = useState(false)
  const [devVersao,        setDevVersao]        = useState(null) // 'atualizado_em' do devedor aberto
  const [importando,       setImportando]       = useState(false)
  const [importErr,        setImportErr]        = useState(null)
  const [resultado,        setResultado]        = useState(null)
  const [copied,           setCopied]           = useState(false)

  const [modalDev,         setModalDev]         = useState(null)
  const [mostrarQuitados,  setMostrarQuitados]  = useState(false)
  const [boletoEdits,      setBoletoEdits]      = useState({})
  const [savingBoleto,     setSavingBoleto]     = useState(new Set())

  const [situacoesCobranca,    setSituacoesCobranca]    = useState(['Pendente','Em negociação','Acordado','Liquidada','Protestado','Ação judicial','Incobrável'])

  const [novoDevOpen,          setNovoDevOpen]          = useState(false)
  const [novoDev,              setNovoDev]              = useState(novoDevVazio())
  const [salvandoNovoDev,      setSalvandoNovoDev]      = useState(false)
  const [novoDevErro,          setNovoDevErro]          = useState('')

  const [importStep,           setImportStep]           = useState('closed') // 'closed' | 'selecting' | 'preview'
  const [importFilialId,       setImportFilialId]       = useState('')
  const [importParsed,         setImportParsed]         = useState(null)
  const [importPeriodoInicio,  setImportPeriodoInicio]  = useState('')
  const [importPeriodoFim,     setImportPeriodoFim]     = useState('')
  const [importFileName,       setImportFileName]       = useState('')
  const [historico,            setHistorico]            = useState([])
  const [loadingHistorico,     setLoadingHistorico]     = useState(false)

  const [filtros, setFiltros] = useState({
    busca: '', status: '', somenteNovos: false, incluirSemVencidos: false,
    pequenasCausas: '', // '' = todos | 'com' | 'sem'
    audiencia: '',      // '' = todos | 'com' | 'sem'
  })
  const [filtroVencInicio, setFiltroVencInicio] = useState('')
  const [filtroVencFim,    setFiltroVencFim]    = useState('')
  const [filtroSitBoleto,  setFiltroSitBoleto]  = useState('')  // situação do banco (boletos vencidos)

  const [filtroBolSitAtual,  setFiltroBolSitAtual]  = useState('')
  const [filtroBolSitBanco,  setFiltroBolSitBanco]  = useState('')
  const [filtroBolFilial,    setFiltroBolFilial]    = useState('')
  const [filtroBolVencInicio,setFiltroBolVencInicio]= useState('')
  const [filtroBolVencFim,   setFiltroBolVencFim]   = useState('')
  const [filtroBolNome,      setFiltroBolNome]      = useState('')  // busca pelo nome do devedor
  const [filtroBolRapido,    setFiltroBolRapido]    = useState('')  // '', aberto, vencido, a_vencer, quitado

  const [docs,         setDocs]         = useState([])
  const [loadingDocs,  setLoadingDocs]  = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [docDescricao, setDocDescricao] = useState('')
  const [docDragOver,  setDocDragOver]  = useState(false)
  const [docErr,       setDocErr]       = useState(null)

  const [lembretes,           setLembretes]           = useState([])
  const [novoLembrete,        setNovoLembrete]        = useState({ data: '', observacao: '' })
  const [mostrarFormLembrete, setMostrarFormLembrete] = useState(false)
  const [salvandoLembrete,    setSalvandoLembrete]    = useState(false)

  /* ── carregamento ── */
  const carregar = useCallback(async () => {
    setLoading(true)
    const montar = () => { let q = supabase
      .from('cobrancas_devedores')
      .select(`
        id, nome_pagador, pagador, telefone, filial_id, status_cobranca, primeiro_registro, ultima_atualizacao,
        pequenas_causas, status_pequenas_causas, data_audiencia, situacao_audiencia, observacoes,
        cobrancas_boletos (
          id, data_vencimento, data_liquidacao, valor, valor_liquidacao,
          situacao_boleto, situacao_atual, motivo, data_atual, valor_atual,
          numero_doc, nosso_numero, carteira
        )
      `)
      .order('ultima_atualizacao', { ascending: false })
    if (filtroFilial) q = q.eq('filial_id', filtroFilial)
    else if (!isAdmin && profile?.filial_id) q = q.eq('filial_id', profile.filial_id)
    return q }
    const { data, error } = await buscarTodos(montar, { ordenarPorId: true })
    if (error) logErro('Carregar devedores', error)
    setDevedores(data || [])
    setLoading(false)
  }, [filtroFilial, isAdmin, profile?.filial_id])

  useEffect(() => {
    supabase.from('filiais').select('*').order('nome').then(({ data }) => {
      setFiliais(data || [])
      setImportFilialId(data?.[0]?.id || '')
    })
    supabase.from('configuracoes').select('valor').eq('chave', 'situacoes_cobranca').single().then(({ data }) => {
      if (data?.valor) setSituacoesCobranca(data.valor.split(',').filter(Boolean))
    })
  }, [])

  useEffect(() => { carregar() }, [carregar])

  /* ── helpers derivados ── */
  function abertos(dev) { return (dev.cobrancas_boletos || []).filter(b => !boletoQuitado(b)) }
  function valorAberto(dev) { return abertos(dev).reduce((s, b) => s + (b.valor || 0), 0) }
  // VENCIDOS = em aberto e com vencimento antes de hoje (os "a vencer" não entram).
  const hojeISO = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()  // data local
  function vencidos(dev) { return abertos(dev).filter(b => b.data_vencimento && String(b.data_vencimento).slice(0, 10) < hojeISO) }
  function valorVencido(dev) { return vencidos(dev).reduce((s, b) => s + (b.valor || 0), 0) }

  /* ── filtros ── */
  const listaFiltrada = devedores.filter(dev => {
    // Só clientes com boleto VENCIDO (em aberto e vencimento antes de hoje).
    // Exceções: ao BUSCAR pelo nome, ou com "Incluir clientes sem vencidos"
    // marcado, aparecem também os quitados / só a vencer (para consultar o
    // histórico: observações, lembretes e documentos).
    const mostrarTodos = !!filtros.busca || filtros.incluirSemVencidos
    if (!mostrarTodos && vencidos(dev).length === 0) return false
    if (filtros.busca && !semAcentoBusca(dev.nome_pagador).includes(semAcentoBusca(filtros.busca))) return false
    if (filtros.status && dev.status_cobranca !== filtros.status) return false
    if (filtros.somenteNovos && dev.status_cobranca !== 'Novo') return false
    if (filtros.pequenasCausas === 'com' && !dev.pequenas_causas) return false
    if (filtros.pequenasCausas === 'sem' &&  dev.pequenas_causas) return false
    if (filtros.audiencia === 'com' && !dev.data_audiencia) return false
    if (filtros.audiencia === 'sem' &&  dev.data_audiencia) return false
    if (filtroVencInicio || filtroVencFim || filtroSitBoleto) {
      // Filtros de vencimento e situação olham só os boletos vencidos (ignora
      // pagos e a vencer). O MESMO boleto precisa atender aos dois.
      const match = vencidos(dev).some(b => {
        if (filtroSitBoleto && (b.situacao_boleto || 'Sem situação') !== filtroSitBoleto) return false
        if (!filtroVencInicio && !filtroVencFim) return true
        if (!b.data_vencimento) return false
        if (filtroVencInicio && b.data_vencimento < filtroVencInicio) return false
        if (filtroVencFim    && b.data_vencimento > filtroVencFim)    return false
        return true
      })
      if (!match) return false
    }
    return true
  })

  /* ── modal do devedor ── */
  function abrirModal(dev) {
    const edits = {}
    ;(dev.cobrancas_boletos || []).forEach(b => {
      edits[b.id] = {
        situacao_atual: b.situacao_atual || '',
        motivo:         b.motivo         || '',
        data_atual:     b.data_atual     || '',
        valor_atual:    b.valor_atual != null ? String(b.valor_atual) : '',
        dirty: false,
      }
    })
    setBoletoEdits(edits)
    carregarLembretes(dev.id)
    setEditForm({
      status_cobranca:    dev.status_cobranca    || 'Novo',
      telefone:           dev.telefone           || '',
      pequenas_causas:    dev.pequenas_causas    || false,
      status_pequenas_causas: dev.status_pequenas_causas || '',
      data_audiencia:     dev.data_audiencia     || '',
      situacao_audiencia: dev.situacao_audiencia || '',
      observacoes:        dev.observacoes        || '',
    })
    setModalDev(dev)
    setDevVersao(null)
    supabase.from('cobrancas_devedores').select('*').eq('id', dev.id).maybeSingle()
      .then(({ data }) => setDevVersao(data?.atualizado_em || null))
    setMostrarQuitados(false)  // por padrão mostra só os boletos em aberto
    carregarDocs(dev.id)
  }

  // Abre automaticamente o devedor indicado pela navegação (lembrete do Dashboard).
  useEffect(() => {
    if (!alvoDevedor || loading || !devedores.length) return
    const dev = devedores.find(d => d.id === alvoDevedor)
    if (dev) { setView('lista'); abrirModal(dev) }
    setAlvoDevedor(null)
  }, [alvoDevedor, loading, devedores]) // eslint-disable-line react-hooks/exhaustive-deps

  function fecharModal() {
    setModalDev(null); setBoletoEdits({}); setEditForm({})
    setDocs([]); setDocErr(null); setDocDescricao('')
    setLembretes([]); setNovoLembrete({ data: '', observacao: '' }); setMostrarFormLembrete(false)
  }

  function updateBoletoEdit(boletoId, field, value) {
    setBoletoEdits(prev => ({ ...prev, [boletoId]: { ...prev[boletoId], [field]: value, dirty: true } }))
  }

  // Registra a data de hoje como "última atualização" do devedor.
  // Chamado sempre que algo é registrado/editado para o devedor.
  async function tocarDevedor(devedorId) {
    if (!devedorId) return
    const hoje = todayISO()
    const { data: upd, error } = await supabase.from('cobrancas_devedores').update({ ultima_atualizacao: hoje }).eq('id', devedorId).select()
    if (error) { logErro('Atualizar data do devedor', error); return }
    if (upd?.[0]?.atualizado_em && modalDev?.id === devedorId) setDevVersao(upd[0].atualizado_em)
    setModalDev(prev => prev && prev.id === devedorId ? { ...prev, ultima_atualizacao: hoje } : prev)
    setDevedores(prev => prev.map(d => d.id === devedorId ? { ...d, ultima_atualizacao: hoje } : d))
  }

  async function salvarBoleto(boletoId) {
    const edit = boletoEdits[boletoId]
    if (!edit) return
    setSavingBoleto(prev => new Set(prev).add(boletoId))
    const valorAtualNum = edit.valor_atual !== '' ? parseBRL(edit.valor_atual) : null
    const patch = {
      situacao_atual: edit.situacao_atual || null,
      motivo:         edit.motivo         || null,
      data_atual:     edit.data_atual     || null,
      valor_atual:    valorAtualNum,
    }
    const { error } = await supabase.from('cobrancas_boletos').update(patch).eq('id', boletoId)
    setSavingBoleto(prev => { const s = new Set(prev); s.delete(boletoId); return s })
    if (!error) {
      const patchBoletos = (bols) => (bols || []).map(b =>
        b.id === boletoId ? { ...b, ...patch } : b
      )
      setModalDev(prev => prev ? { ...prev, cobrancas_boletos: patchBoletos(prev.cobrancas_boletos) } : null)
      setDevedores(prev => prev.map(d =>
        d.id === modalDev?.id ? { ...d, cobrancas_boletos: patchBoletos(d.cobrancas_boletos) } : d
      ))
      setBoletoEdits(prev => ({ ...prev, [boletoId]: { ...prev[boletoId], dirty: false } }))
      tocarDevedor(modalDev?.id)
    }
  }

  /* ── lembretes (tarefas do devedor) ── */
  async function carregarLembretes(devedorId) {
    const { data, error } = await supabase.from('cobrancas_lembretes')
      .select('id, data, observacao, concluido')
      .eq('devedor_id', devedorId)
      .order('data', { ascending: true })
    if (error) logErro('Carregar lembretes', error)
    setLembretes(data || [])
  }

  async function adicionarLembrete() {
    if (!novoLembrete.data) return
    setSalvandoLembrete(true)
    const { error } = await supabase.from('cobrancas_lembretes').insert({
      devedor_id:  modalDev.id,
      filial_id:   modalDev.filial_id || null,
      data:        novoLembrete.data,
      observacao:  novoLembrete.observacao || null,
      created_by:  profile?.id || null,
    })
    setSalvandoLembrete(false)
    if (error) {
      logErro('Salvar lembrete', error)
      window.alert('Não foi possível salvar o lembrete: ' + error.message)
    } else {
      setNovoLembrete({ data: '', observacao: '' })
      setMostrarFormLembrete(false)
      carregarLembretes(modalDev.id)
      tocarDevedor(modalDev.id)
    }
  }

  async function toggleLembrete(l) {
    await supabase.from('cobrancas_lembretes').update({ concluido: !l.concluido }).eq('id', l.id)
    carregarLembretes(modalDev.id)
    tocarDevedor(modalDev.id)
  }

  async function excluirLembrete(l) {
    if (!window.confirm('Excluir este lembrete?')) return
    await supabase.from('cobrancas_lembretes').delete().eq('id', l.id)
    carregarLembretes(modalDev.id)
    tocarDevedor(modalDev.id)
  }

  /* ── adicionar devedor manualmente ── */
  function abrirNovoDev() {
    const filialPadrao = filtroFilial || (!isAdmin ? (profile?.filial_id || '') : (filiais.length === 1 ? filiais[0].id : ''))
    setNovoDev(novoDevVazio(filialPadrao))
    setNovoDevErro('')
    setNovoDevOpen(true)
  }
  function setND(patch) { setNovoDev(prev => ({ ...prev, ...patch })) }
  function addBoletoND() { setNovoDev(prev => ({ ...prev, boletos: [...prev.boletos, novoBoletoVazio()] })) }
  function removeBoletoND(i) { setNovoDev(prev => ({ ...prev, boletos: prev.boletos.filter((_, idx) => idx !== i) })) }
  function updateBoletoND(i, campo, valor) {
    setNovoDev(prev => ({ ...prev, boletos: prev.boletos.map((b, idx) => idx === i ? { ...b, [campo]: valor } : b) }))
  }

  async function salvarNovoDev() {
    setNovoDevErro('')
    const nome = novoDev.nome_pagador.trim()
    if (!nome) { setNovoDevErro('Informe o nome do devedor.'); return }
    if (isAdmin && filiais.length > 1 && !novoDev.filial_id) { setNovoDevErro('Selecione a filial.'); return }
    const filialId = novoDev.filial_id || (!isAdmin ? profile?.filial_id : null) || null
    const norm = normalizarNome(nome)

    setSalvandoNovoDev(true)
    // Evita duplicar: verifica se já existe devedor com o mesmo nome normalizado.
    const { data: existe } = await supabase.from('cobrancas_devedores')
      .select('id').eq('nome_normalizado', norm).limit(1)
    if (existe?.length) {
      setSalvandoNovoDev(false)
      setNovoDevErro('Já existe um devedor com esse nome. Abra o devedor existente para editar.')
      return
    }

    const hoje = todayISO()
    const { data: devIns, error: eDev } = await supabase.from('cobrancas_devedores').insert({
      nome_pagador:       nome,
      pagador:            nome,
      nome_normalizado:   norm,
      documento:          novoDev.documento || null,
      telefone:           novoDev.telefone || null,
      filial_id:          filialId,
      status_cobranca:    novoDev.status_cobranca || 'Novo',
      pequenas_causas:    novoDev.pequenas_causas,
      ...(novoDev.pequenas_causas ? { status_pequenas_causas: novoDev.status_pequenas_causas || null } : {}),
      data_audiencia:     novoDev.data_audiencia || null,
      situacao_audiencia: novoDev.situacao_audiencia || null,
      observacoes:        novoDev.observacoes || null,
      primeiro_registro:  hoje,
      ultima_atualizacao: hoje,
    }).select('id').single()

    if (eDev) { setSalvandoNovoDev(false); setNovoDevErro('Erro ao salvar devedor: ' + eDev.message); return }

    // Boletos: só os que têm ao menos vencimento ou valor.
    const boletosValidos = novoDev.boletos.filter(b => b.data_vencimento || b.valor)
    if (boletosValidos.length > 0) {
      const linhas = boletosValidos.map(b => ({
        devedor_id:       devIns.id,
        filial_id:        filialId,
        data_vencimento:  b.data_vencimento || null,
        valor:            b.valor !== '' ? parseBRL(b.valor) : null,
        nosso_numero:     b.nosso_numero || null,
        numero_doc:       b.numero_doc || null,
        situacao_boleto:  b.situacao_boleto || null,
        situacao_atual:   b.situacao_atual || null,
        data_liquidacao:  b.data_liquidacao || null,
        valor_liquidacao: b.valor_liquidacao !== '' ? parseBRL(b.valor_liquidacao) : null,
        motivo:           b.motivo || null,
      }))
      const { error: eBol } = await supabase.from('cobrancas_boletos').insert(linhas)
      if (eBol) {
        setSalvandoNovoDev(false)
        setNovoDevErro('Devedor criado, mas houve erro ao salvar boletos: ' + eBol.message)
        await carregar()
        return
      }
    }

    // Sincroniza com Clientes (mesma filial), sem duplicar.
    const { data: cli } = await supabase.from('clientes').select('id').ilike('nome', nome).limit(1)
    if (!cli?.length) {
      await supabase.from('clientes').insert({ nome, telefone: novoDev.telefone || null, filial_id: filialId })
    }

    setSalvandoNovoDev(false)
    setNovoDevOpen(false)
    await carregar()
  }

  /* ── importar arquivo ── */
  async function carregarHistorico() {
    setLoadingHistorico(true)
    const { data, error } = await supabase
      .from('cobrancas_importacoes')
      .select('id, created_at, nome_arquivo, filial_id, periodo_inicio, periodo_fim, total_boletos, inseridos, atualizados')
      .order('created_at', { ascending: false })
      .limit(3)
    if (error) logErro('Carregar histórico de importações', error)
    setHistorico(data || [])
    setLoadingHistorico(false)
  }

  function clickImportar() {
    setImportStep('selecting')
    setImportParsed(null)
    setImportFileName('')
    setImportPeriodoInicio('')
    setImportPeriodoFim('')
    setImportErr(null)
    carregarHistorico()
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImportando(true)
    setImportErr(null)
    try {
      const { boletos, periodoInicio, periodoFim } = await parseFile(file)
      setImportParsed({ boletos })
      setImportFileName(file.name)
      setImportPeriodoInicio(periodoInicio || '')
      setImportPeriodoFim(periodoFim || '')
      setImportStep('preview')
    } catch (err) {
      setImportErr(err.message)
    } finally {
      setImportando(false)
    }
  }

  async function confirmarImport() {
    if (!importParsed) return
    setImportando(true)
    setImportErr(null)
    setResultado(null)
    try {
      const res = await importarBoletos(importParsed.boletos, importFilialId || null, {
        periodoInicio: importPeriodoInicio || null,
        periodoFim:    importPeriodoFim    || null,
        nomeArquivo:   importFileName      || null,
        importadoPor:  profile?.id         || null,
      })
      setResultado(res)
      setImportStep('closed')
      await carregar()
    } catch (err) {
      setImportErr(err.message)
    } finally {
      setImportando(false)
    }
  }

  /* ── salvar devedor ── */
  async function salvarDevedor() {
    if (!modalDev) return
    setSalvando(true)
    let qDev = supabase.from('cobrancas_devedores').update({
      status_cobranca:    editForm.status_cobranca,
      telefone:           editForm.telefone || null,
      pequenas_causas:    editForm.pequenas_causas,
      status_pequenas_causas: editForm.pequenas_causas ? (editForm.status_pequenas_causas || null) : null,
      data_audiencia:     editForm.data_audiencia || null,
      situacao_audiencia: editForm.situacao_audiencia || null,
      observacoes:        editForm.observacoes || null,
      ultima_atualizacao: todayISO(),
    }).eq('id', modalDev.id)
    if (devVersao) qDev = qDev.eq('atualizado_em', devVersao)
    const { data: updDev, error: eDev } = await qDev.select()
    if (eDev) {
      setSalvando(false)
      logErro('Salvar devedor', eDev)
      window.alert('Erro ao salvar: ' + eDev.message)
      return
    }
    if (devVersao && (!updDev || updDev.length === 0)) {
      setSalvando(false)
      window.alert('Este devedor foi alterado por outra pessoa enquanto você editava.\n\nFeche, abra de novo e refaça sua alteração — assim a alteração dela não se perde.')
      return
    }
    if (updDev?.[0]?.atualizado_em) setDevVersao(updDev[0].atualizado_em)

    const nomeDev = modalDev.nome_pagador
    if (nomeDev) {
      const { data: cli } = await supabase.from('clientes').select('id, telefone').ilike('nome', nomeDev).limit(1)
      if (cli?.length) {
        if (editForm.telefone && !cli[0].telefone) {
          await supabase.from('clientes').update({ telefone: editForm.telefone }).eq('id', cli[0].id)
        }
      } else {
        await supabase.from('clientes').insert({ nome: nomeDev, telefone: editForm.telefone || null, filial_id: modalDev.filial_id || null })
      }
    }

    await carregar()
    setSalvando(false)
    setModalDev(prev => prev ? {
      ...prev,
      status_cobranca:    editForm.status_cobranca,
      telefone:           editForm.telefone || null,
      pequenas_causas:    editForm.pequenas_causas,
      status_pequenas_causas: editForm.pequenas_causas ? (editForm.status_pequenas_causas || null) : null,
      data_audiencia:     editForm.data_audiencia || null,
      situacao_audiencia: editForm.situacao_audiencia || null,
      observacoes:        editForm.observacoes || null,
    } : null)
  }

  /* ── documentos ── */
  async function carregarDocs(devedorId) {
    setLoadingDocs(true)
    const { data, error } = await supabase
      .from('cobrancas_documentos')
      .select('id, nome_arquivo, caminho, tipo, tamanho, descricao, created_at')
      .eq('devedor_id', devedorId)
      .order('created_at', { ascending: false })
    if (error) logErro('Carregar documentos', error)
    setDocs(data || [])
    setLoadingDocs(false)
  }

  async function handleDocUpload(file) {
    if (!file) return
    setDocErr(null)
    const tiposOk = [
      'application/pdf', 'image/jpeg', 'image/png',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]
    if (!tiposOk.includes(file.type)) {
      return setDocErr('Tipo não permitido. Use PDF, JPG, PNG ou DOCX.')
    }
    if (file.size > 10 * 1024 * 1024) {
      return setDocErr('Arquivo muito grande. O limite é 10 MB.')
    }
    if (!modalDev) return
    setUploadingDoc(true)
    try {
      const nomeSeguro = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const caminho = `${modalDev.id}/${Date.now()}-${nomeSeguro}`
      const { error: upErr } = await supabase.storage
        .from('cobrancas-documentos')
        .upload(caminho, file, { contentType: file.type })
      if (upErr) throw new Error(upErr.message)
      const { error: dbErr } = await supabase.from('cobrancas_documentos').insert({
        devedor_id:   modalDev.id,
        nome_arquivo: file.name,
        caminho,
        tipo:         file.type,
        tamanho:      file.size,
        descricao:    docDescricao || null,
        enviado_por:  profile?.id || null,
      })
      if (dbErr) throw new Error(dbErr.message)
      setDocDescricao('')
      await carregarDocs(modalDev.id)
      tocarDevedor(modalDev.id)
    } catch (err) {
      setDocErr(err.message)
    } finally {
      setUploadingDoc(false)
    }
  }

  async function visualizarDoc(doc) {
    const { data, error } = await supabase.storage
      .from('cobrancas-documentos')
      .createSignedUrl(doc.caminho, 3600)
    if (error) return setDocErr('Não foi possível gerar o link de acesso.')
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function excluirDoc(doc) {
    if (!window.confirm(`Excluir "${doc.nome_arquivo}"?\nEsta ação não pode ser desfeita.`)) return
    const { error: stErr } = await supabase.storage
      .from('cobrancas-documentos')
      .remove([doc.caminho])
    if (stErr) return setDocErr('Erro ao excluir arquivo: ' + stErr.message)
    const { error: dbErr } = await supabase.from('cobrancas_documentos').delete().eq('id', doc.id)
    if (dbErr) return setDocErr('Erro ao excluir registro: ' + dbErr.message)
    setDocs(prev => prev.filter(d => d.id !== doc.id))
    tocarDevedor(modalDev?.id)
  }

  /* ── copiar cobrança ── */
  function copiarCobranca(dev) {
    const lista = abertos(dev).sort((a, b) => (a.data_vencimento || '').localeCompare(b.data_vencimento || ''))
    const total = valorAberto(dev)
    const linhas = lista.map(b =>
      `• Venc. ${fDate(b.data_vencimento)} — ${fBRL(b.valor)}${b.situacao_boleto ? ` [${b.situacao_boleto}]` : ''}`
    ).join('\n')
    const telLinha = dev.telefone ? `\nTelefone: ${dev.telefone}` : ''
    const txt = `*COBRANÇA — ${dev.nome_pagador}*${telLinha}\n\nBoleto(s) em aberto:\n${linhas}\n\n*Total em aberto: ${fBRL(total)}*\n\nEntre em contato para regularizar sua situação.`
    navigator.clipboard.writeText(txt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2200) })
  }

  /* ── audiências ── */
  const comAudiencia = [...devedores].filter(d => d.data_audiencia).sort((a, b) => a.data_audiencia.localeCompare(b.data_audiencia))
  const filialMap = Object.fromEntries(filiais.map(f => [f.id, f.nome]))
  const temFiltrosVenc = filtroVencInicio || filtroVencFim || filtroSitBoleto
  // Situações do banco presentes nos boletos vencidos (opções do filtro).
  const situacoesVencidos = [...new Set(devedores.flatMap(d => vencidos(d).map(b => b.situacao_boleto || 'Sem situação')))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))

  /* ── Relação de boletos ── */
  const todosBoletos = devedores.flatMap(dev =>
    (dev.cobrancas_boletos || []).map(b => ({
      ...b,
      nome_pagador: dev.nome_pagador,
      filial_id_dev: dev.filial_id,
      filial_nome: filialMap[dev.filial_id] || '—',
    }))
  )
  const sitsBancoDB = [...new Set(todosBoletos.map(b => b.situacao_boleto).filter(Boolean))].sort()
  // Classificação rápida (mesma regra da aba Cobranças).
  function classeBoleto(b) {
    if (boletoQuitado(b)) return 'quitado'
    return b.data_vencimento && String(b.data_vencimento).slice(0, 10) < hojeISO ? 'vencido' : 'a_vencer'
  }
  const contagemRapida = todosBoletos.reduce((acc, b) => { const c = classeBoleto(b); acc[c] = (acc[c] || 0) + 1; return acc }, {})
  contagemRapida.aberto = (contagemRapida.vencido || 0) + (contagemRapida.a_vencer || 0)
  const boletosFiltrados = todosBoletos.filter(b => {
    if (filtroBolNome) {
      const termo = semAcentoBusca(filtroBolNome)
      if (!semAcentoBusca(b.nome_pagador).includes(termo)) return false
    }
    if (filtroBolRapido) {
      const c = classeBoleto(b)
      if (filtroBolRapido === 'aberto' ? c === 'quitado' : c !== filtroBolRapido) return false
    }
    if (filtroBolSitAtual && b.situacao_atual !== filtroBolSitAtual) return false
    if (filtroBolSitBanco && b.situacao_boleto !== filtroBolSitBanco) return false
    if (filtroBolFilial && b.filial_id_dev !== filtroBolFilial) return false
    if (filtroBolVencInicio && b.data_vencimento < filtroBolVencInicio) return false
    if (filtroBolVencFim && b.data_vencimento > filtroBolVencFim) return false
    return true
  })
  const totalBolVal = boletosFiltrados.reduce((s, b) => s + (b.valor || 0), 0)

  async function exportarBoletos() {
    const XLSXmod = await import('xlsx')
    const XLSX = XLSXmod.default || XLSXmod
    const rows = boletosFiltrados.map(b => ({
      'Devedor':          b.nome_pagador,
      'Filial':           b.filial_nome,
      'Nosso Nº':         b.nosso_numero || '',
      'Nº Doc':           b.numero_doc   || '',
      'Vencimento':       fDate(b.data_vencimento),
      'Valor':            b.valor || 0,
      'Sit. Banco':       b.situacao_boleto || '',
      'Situação Atual':   b.situacao_atual  || '',
      'Motivo':           b.motivo          || '',
      'Dt. Liquidação':   fDate(b.data_liquidacao),
      'Vl. Liquidação':   b.valor_liquidacao || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Boletos')
    XLSX.writeFile(wb, `boletos_${todayISO()}.xlsx`)
  }

  /* ── descrição dos filtros ativos (para o cabeçalho do relatório) ── */
  function descreverFiltros() {
    const p = []
    if (filtros.busca) p.push(`Busca: "${filtros.busca}"`)
    if (filtros.incluirSemVencidos) p.push('Inclui clientes sem vencidos')
    if (filtros.status) p.push(`Status: ${filtros.status}`)
    if (filtros.somenteNovos) p.push('Somente novos')
    if (filtros.pequenasCausas === 'com') p.push('Com pequenas causas')
    if (filtros.pequenasCausas === 'sem') p.push('Sem pequenas causas')
    if (filtros.audiencia === 'com') p.push('Com audiência')
    if (filtros.audiencia === 'sem') p.push('Sem audiência')
    if (filtroFilial && filialMap[filtroFilial]) p.push(`Filial: ${filialMap[filtroFilial]}`)
    if (filtroVencInicio) p.push(`Venc. de ${fDate(filtroVencInicio)}`)
    if (filtroVencFim) p.push(`Venc. até ${fDate(filtroVencFim)}`)
    if (filtroSitBoleto) p.push(`Situação: ${filtroSitBoleto}`)
    return p.length ? p.join(' · ') : 'Todos os devedores'
  }

  /* ── imprimir relatório dos devedores conforme o filtro atual ── */
  function imprimirRelatorio() {
    if (!listaFiltrada.length) return
    const totalVal = listaFiltrada.reduce((s, dev) => s + valorVencido(dev), 0)
    const totalAbertos = listaFiltrada.reduce((s, dev) => s + vencidos(dev).length, 0)
    const mostrarFilial = filiais.length > 1

    const linhas = listaFiltrada.map(dev => `
      <tr>
        <td>${escHtml(dev.nome_pagador)}</td>
        ${mostrarFilial ? `<td>${escHtml(filialMap[dev.filial_id] || '—')}</td>` : ''}
        <td>${escHtml(dev.telefone || '—')}</td>
        <td class="c">${vencidos(dev).length}</td>
        <td class="n">${fBRL(valorVencido(dev))}</td>
        <td>${escHtml(dev.status_cobranca || '—')}</td>
        <td class="c">${dev.pequenas_causas ? 'Sim' : '—'}</td>
        <td>${dev.data_audiencia ? fDate(dev.data_audiencia) : '—'}</td>
      </tr>`).join('')

    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Relatório de Cobranças</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1a0a0e;margin:24px;font-size:12px}
  .hd{border-bottom:3px solid #9d0518;padding-bottom:10px;margin-bottom:14px}
  .hd h1{margin:0;font-size:18px;color:#9d0518}
  .hd .sub{color:#555;font-size:11px;margin-top:3px}
  .meta{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px;font-size:11px;color:#333}
  .meta b{color:#111}
  table{width:100%;border-collapse:collapse}
  th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e2d0d3;vertical-align:top}
  th{background:#f7f0f1;font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:#6e4c54}
  td.n,th.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  td.c,th.c{text-align:center}
  tfoot td{border-top:2px solid #9d0518;font-weight:700;background:#faf4f4}
  .foot{margin-top:16px;font-size:10px;color:#999;text-align:center}
  @media print{body{margin:0}}
</style></head><body>
  <div class="hd">
    <h1>Mercadão dos Óculos — Relatório de Cobranças</h1>
    <div class="sub">Emitido em ${fDate(todayISO())}</div>
  </div>
  <div class="meta">
    <div><b>Filtros:</b> ${escHtml(descreverFiltros())}</div>
    <div><b>${listaFiltrada.length}</b> devedor(es)</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Devedor</th>
        ${mostrarFilial ? '<th>Filial</th>' : ''}
        <th>Telefone</th>
        <th class="c">Vencidos</th>
        <th class="n">Valor vencido</th>
        <th>Status</th>
        <th class="c">P. Causas</th>
        <th>Audiência</th>
      </tr>
    </thead>
    <tbody>${linhas}</tbody>
    <tfoot>
      <tr>
        <td colspan="${mostrarFilial ? 3 : 2}">TOTAL</td>
        <td class="c">${totalAbertos}</td>
        <td class="n">${fBRL(totalVal)}</td>
        <td colspan="3"></td>
      </tr>
    </tfoot>
  </table>
  <div class="foot">Relatório gerado pelo sistema de gestão Mercadão dos Óculos</div>
  <script>window.onload=function(){window.print()}</script>
</body></html>`

    const w = window.open('', '_blank')
    if (!w) { alert('Habilite pop-ups para imprimir o relatório.'); return }
    w.document.write(html)
    w.document.close()
  }

  /* ════════════════════ RENDER ════════════════════ */

  const lblNovo = { display: 'block', fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px', color: C.onSurfaceVariant, marginBottom: '0.25rem', fontFamily: F.body }

  return (
    <div className="pg">

      {/* ── Modal: adicionar devedor manualmente ── */}
      {novoDevOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(15,45,74,0.50)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1.5rem', overflowY: 'auto' }}
          onClick={() => !salvandoNovoDev && setNovoDevOpen(false)}>
          <div style={{ ...dsCard, width: '100%', maxWidth: '860px', padding: 0, overflow: 'hidden', margin: 'auto' }} onClick={e => e.stopPropagation()}>
            {/* Cabeçalho */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: `1px solid ${C.borderSubtle}`, background: C.surfaceContainerLow }}>
              <div style={{ fontWeight: '800', color: C.onSurface, fontSize: '1.05rem', fontFamily: F.headline }}>Adicionar devedor</div>
              <button onClick={() => setNovoDevOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.onSurfaceVariant, fontSize: '1.25rem', lineHeight: 1 }}>✕</button>
            </div>

            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Dados do devedor */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.875rem 1rem' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lblNovo}>Nome do devedor *</label>
                  <input value={novoDev.nome_pagador} onChange={e => setND({ nome_pagador: e.target.value })}
                    placeholder="Nome do pagador" autoFocus style={{ ...inputCss, width: '100%' }} />
                </div>
                <div>
                  <label style={lblNovo}>Documento (CPF/CNPJ)</label>
                  <input value={novoDev.documento} onChange={e => setND({ documento: e.target.value })}
                    placeholder="Opcional" style={{ ...inputCss, width: '100%' }} />
                </div>
                <div>
                  <label style={lblNovo}>Telefone</label>
                  <input value={novoDev.telefone} onChange={e => setND({ telefone: e.target.value })}
                    placeholder="(00) 00000-0000" style={{ ...inputCss, width: '100%' }} />
                </div>
                {isAdmin && filiais.length > 1 && (
                  <div>
                    <label style={lblNovo}>Filial *</label>
                    <select value={novoDev.filial_id} onChange={e => setND({ filial_id: e.target.value })} style={{ ...inputCss, width: '100%' }}>
                      <option value="">Selecione…</option>
                      {filiais.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label style={lblNovo}>Status</label>
                  <select value={novoDev.status_cobranca} onChange={e => setND({ status_cobranca: e.target.value })} style={{ ...inputCss, width: '100%' }}>
                    {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '1.3rem' }}>
                  <input type="checkbox" id="nd-pc" checked={novoDev.pequenas_causas}
                    onChange={e => setND({ pequenas_causas: e.target.checked })}
                    style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: C.primaryContainer }} />
                  <label htmlFor="nd-pc" style={{ fontSize: '0.875rem', fontWeight: '600', color: C.onSurfaceVariant, cursor: 'pointer', fontFamily: F.body }}>⚖️ Pequenas causas</label>
                </div>
                {novoDev.pequenas_causas && (
                  <div>
                    <label style={lblNovo}>Status pequenas causas</label>
                    <select value={novoDev.status_pequenas_causas} onChange={e => setND({ status_pequenas_causas: e.target.value })} style={{ ...inputCss, width: '100%' }}>
                      <option value="">—</option>
                      {PC_STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label style={lblNovo}>Data da audiência</label>
                  <input type="date" value={novoDev.data_audiencia} onChange={e => setND({ data_audiencia: e.target.value })} style={{ ...inputCss, width: '100%' }} />
                </div>
                <div>
                  <label style={lblNovo}>Situação da audiência</label>
                  <input value={novoDev.situacao_audiencia} onChange={e => setND({ situacao_audiencia: e.target.value })}
                    placeholder="Ex: Aguardando pauta" style={{ ...inputCss, width: '100%' }} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lblNovo}>Observações</label>
                  <textarea rows={2} value={novoDev.observacoes} onChange={e => setND({ observacoes: e.target.value })}
                    placeholder="Anotações..." style={{ ...inputCss, width: '100%', resize: 'vertical', fontFamily: F.body }} />
                </div>
              </div>

              {/* Boletos */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <div style={{ fontWeight: '700', color: C.onSurfaceVariant, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: F.body }}>Boletos</div>
                  <button onClick={addBoletoND} style={{ padding: '0.35rem 0.8rem', background: C.surfaceContainerLowest, color: C.primaryContainer, border: `1.5px solid ${C.primaryContainer}`, borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer', fontFamily: F.body }}>+ Adicionar boleto</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  {novoDev.boletos.map((b, i) => (
                    <div key={i} style={{ border: `1px solid ${C.borderSubtle}`, borderRadius: '0.6rem', padding: '0.75rem', background: C.surfaceContainerLowest }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: C.onSurfaceVariant, fontFamily: F.body }}>Boleto {i + 1}</span>
                        {novoDev.boletos.length > 1 && (
                          <button onClick={() => removeBoletoND(i)} title="Remover" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.statusDanger, fontSize: '0.95rem' }}>✕</button>
                        )}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.5rem 0.75rem' }}>
                        <div>
                          <label style={lblNovo}>Vencimento</label>
                          <input type="date" value={b.data_vencimento} onChange={e => updateBoletoND(i, 'data_vencimento', e.target.value)} style={{ ...inputCss, width: '100%', padding: '0.35rem 0.5rem' }} />
                        </div>
                        <div>
                          <label style={lblNovo}>Valor (R$)</label>
                          <input inputMode="decimal" value={b.valor} onChange={e => updateBoletoND(i, 'valor', e.target.value)} placeholder="0,00" style={{ ...inputCss, width: '100%', padding: '0.35rem 0.5rem', fontFamily: F.mono }} />
                        </div>
                        <div>
                          <label style={lblNovo}>Nosso Nº</label>
                          <input value={b.nosso_numero} onChange={e => updateBoletoND(i, 'nosso_numero', e.target.value)} placeholder="Opcional" style={{ ...inputCss, width: '100%', padding: '0.35rem 0.5rem' }} />
                        </div>
                        <div>
                          <label style={lblNovo}>Nº Doc</label>
                          <input value={b.numero_doc} onChange={e => updateBoletoND(i, 'numero_doc', e.target.value)} placeholder="Opcional" style={{ ...inputCss, width: '100%', padding: '0.35rem 0.5rem' }} />
                        </div>
                        <div>
                          <label style={lblNovo}>Sit. Banco</label>
                          <input value={b.situacao_boleto} onChange={e => updateBoletoND(i, 'situacao_boleto', e.target.value)} placeholder="Opcional" style={{ ...inputCss, width: '100%', padding: '0.35rem 0.5rem' }} />
                        </div>
                        <div>
                          <label style={lblNovo}>Situação Atual</label>
                          <select value={b.situacao_atual} onChange={e => updateBoletoND(i, 'situacao_atual', e.target.value)} style={{ ...inputCss, width: '100%', padding: '0.35rem 0.5rem' }}>
                            <option value="">—</option>
                            {situacoesCobranca.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={lblNovo}>Data Liquidação</label>
                          <input type="date" value={b.data_liquidacao} onChange={e => updateBoletoND(i, 'data_liquidacao', e.target.value)} style={{ ...inputCss, width: '100%', padding: '0.35rem 0.5rem' }} />
                        </div>
                        <div>
                          <label style={lblNovo}>Valor Liquidado (R$)</label>
                          <input inputMode="decimal" value={b.valor_liquidacao} onChange={e => updateBoletoND(i, 'valor_liquidacao', e.target.value)} placeholder="0,00" style={{ ...inputCss, width: '100%', padding: '0.35rem 0.5rem', fontFamily: F.mono }} />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label style={lblNovo}>Motivo</label>
                          <input value={b.motivo} onChange={e => updateBoletoND(i, 'motivo', e.target.value)} placeholder="Opcional" style={{ ...inputCss, width: '100%', padding: '0.35rem 0.5rem' }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {novoDevErro && (
                <div style={{ background: C.statusDangerBg, color: C.statusDanger, borderRadius: '0.5rem', padding: '0.6rem 0.85rem', fontSize: '0.85rem', fontFamily: F.body }}>{novoDevErro}</div>
              )}
            </div>

            {/* Rodapé */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', padding: '1rem 1.5rem', borderTop: `1px solid ${C.borderSubtle}`, background: C.surfaceContainerLow }}>
              <button onClick={() => setNovoDevOpen(false)} disabled={salvandoNovoDev}
                style={{ padding: '0.6rem 1.1rem', background: 'none', border: `1.5px solid ${C.borderSubtle}`, borderRadius: '0.6rem', color: C.onSurfaceVariant, fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer', fontFamily: F.body }}>Cancelar</button>
              <button onClick={salvarNovoDev} disabled={salvandoNovoDev}
                style={{ padding: '0.6rem 1.25rem', background: C.primaryContainer, color: C.onPrimary, border: 'none', borderRadius: '0.6rem', fontSize: '0.875rem', fontWeight: '700', cursor: salvandoNovoDev ? 'not-allowed' : 'pointer', opacity: salvandoNovoDev ? 0.7 : 1, fontFamily: F.body }}>
                {salvandoNovoDev ? 'Salvando…' : 'Salvar devedor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de importação (selecionar / preview) ── */}
      {importStep !== 'closed' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(15,45,74,0.50)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }} onClick={() => importStep === 'selecting' && setImportStep('closed')}>
          <div style={{
            background: C.surfaceContainerLowest, borderRadius: '1rem', padding: '1.75rem',
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)', width: '100%', maxWidth: '480px',
          }} onClick={e => e.stopPropagation()}>

            {/* Cabeçalho */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div style={{ fontWeight: '800', color: C.onSurface, fontSize: '1.05rem', fontFamily: F.headline }}>
                {importStep === 'selecting' ? '⬆️ Importar relatório' : '✅ Confirmar importação'}
              </div>
              <button onClick={() => setImportStep('closed')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.onSurfaceVariant, fontSize: '1.1rem', lineHeight: 1, padding: '0.2rem 0.4rem' }}>
                ✕
              </button>
            </div>

            {/* Erro */}
            {importErr && (
              <div style={{ background: C.statusDangerBg, border: `1px solid ${C.statusDanger}`, borderRadius: '0.5rem', padding: '0.5rem 0.75rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                <span style={{ color: C.statusDanger, fontSize: '0.82rem', fontFamily: F.body }}>{importErr}</span>
                <button onClick={() => setImportErr(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.statusDanger, fontSize: '1rem', lineHeight: 1, flexShrink: 0 }}>✕</button>
              </div>
            )}

            {importStep === 'selecting' ? (
              <>
                {/* Filial */}
                {filiais.length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: C.onSurfaceVariant, marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: F.body }}>Filial</label>
                    <select value={importFilialId} onChange={e => setImportFilialId(e.target.value)}
                      style={{ ...inputCss, width: '100%' }}>
                      <option value="">Sem filial</option>
                      {filiais.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                  </div>
                )}

                {/* Botão selecionar arquivo */}
                <button onClick={() => fileRef.current?.click()} disabled={importando}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '0.6rem', background: C.primaryContainer, color: C.onPrimary, border: 'none', fontSize: '0.9rem', fontWeight: '700', cursor: importando ? 'not-allowed' : 'pointer', opacity: importando ? 0.7 : 1, fontFamily: F.body, marginBottom: '1.5rem' }}>
                  {importando ? '⏳ Lendo arquivo…' : '📂 Selecionar arquivo (.xlsx / .csv)'}
                </button>

                {/* Histórico */}
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: '700', color: C.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.625rem', fontFamily: F.body }}>
                    Últimas importações
                  </div>
                  {loadingHistorico ? (
                    <div style={{ color: C.onSurfaceVariant, fontSize: '0.82rem', fontFamily: F.body }}>Carregando…</div>
                  ) : historico.length === 0 ? (
                    <div style={{ color: C.outlineVariant, fontSize: '0.82rem', fontFamily: F.body }}>Nenhuma importação registrada ainda.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {historico.map(h => {
                        const filNome = filiais.find(f => f.id === h.filial_id)?.nome
                        return (
                          <div key={h.id} style={{ background: C.surfaceContainerLow, borderRadius: '0.5rem', padding: '0.6rem 0.75rem', border: `1px solid ${C.borderSubtle}` }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: '600', color: C.onSurface, fontSize: '0.82rem', fontFamily: F.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '220px' }}>
                                📄 {h.nome_arquivo || 'Arquivo'}
                              </span>
                              <span style={{ fontSize: '0.72rem', color: C.onSurfaceVariant, fontFamily: F.body, whiteSpace: 'nowrap' }}>
                                {h.created_at ? new Date(h.created_at).toLocaleDateString('pt-BR') : ''}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: C.onSurfaceVariant, fontFamily: F.body, marginTop: '3px', display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                              {filNome && <span style={{ background: C.surfaceContainerHigh, borderRadius: '0.3rem', padding: '1px 5px' }}>{filNome}</span>}
                              {(h.periodo_inicio || h.periodo_fim) && (
                                <span>{fDate(h.periodo_inicio)} – {fDate(h.periodo_fim)}</span>
                              )}
                              <span>· {h.total_boletos} boleto{h.total_boletos !== 1 ? 's' : ''}</span>
                              <span>· {h.inseridos} novo{h.inseridos !== 1 ? 's' : ''}</span>
                              <span>· {h.atualizados} atualizado{h.atualizados !== 1 ? 's' : ''}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* ── Preview / confirmar ── */
              <>
                {/* Resumo do arquivo */}
                <div style={{ background: C.surfaceContainerLow, borderRadius: '0.5rem', padding: '0.75rem 1rem', marginBottom: '1.25rem', border: `1px solid ${C.borderSubtle}` }}>
                  <div style={{ fontWeight: '600', color: C.onSurface, fontSize: '0.85rem', fontFamily: F.body, marginBottom: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    📄 {importFileName}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: C.onSurfaceVariant, fontFamily: F.body }}>
                    {importParsed?.boletos?.length ?? 0} boleto{(importParsed?.boletos?.length ?? 0) !== 1 ? 's' : ''} encontrado{(importParsed?.boletos?.length ?? 0) !== 1 ? 's' : ''}
                    {importFilialId && filiais.find(f => f.id === importFilialId) && (
                      <span> · Filial: <strong>{filiais.find(f => f.id === importFilialId)?.nome}</strong></span>
                    )}
                  </div>
                </div>

                {/* Período */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: C.onSurfaceVariant, marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: F.body }}>
                    Período do relatório
                    {importPeriodoInicio && importPeriodoFim && (
                      <span style={{ marginLeft: '0.5rem', fontWeight: '400', textTransform: 'none', letterSpacing: 0, color: C.statusSuccess, fontSize: '0.72rem' }}>
                        ✓ detectado automaticamente
                      </span>
                    )}
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input type="date" value={importPeriodoInicio} onChange={e => setImportPeriodoInicio(e.target.value)}
                      style={{ ...inputCss, flex: 1 }} />
                    <span style={{ color: C.onSurfaceVariant, fontFamily: F.body, fontSize: '0.82rem' }}>até</span>
                    <input type="date" value={importPeriodoFim} onChange={e => setImportPeriodoFim(e.target.value)}
                      style={{ ...inputCss, flex: 1 }} />
                  </div>
                </div>

                {/* Botões */}
                <div style={{ display: 'flex', gap: '0.625rem', justifyContent: 'flex-end' }}>
                  <button onClick={() => setImportStep('selecting')} disabled={importando}
                    style={{ padding: '0.55rem 1rem', borderRadius: '0.6rem', background: C.surfaceContainerLow, color: C.onSurfaceVariant, border: 'none', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer', fontFamily: F.body }}>
                    ← Voltar
                  </button>
                  <button onClick={confirmarImport} disabled={importando}
                    style={{ padding: '0.55rem 1.25rem', borderRadius: '0.6rem', background: C.primaryContainer, color: C.onPrimary, border: 'none', fontSize: '0.875rem', fontWeight: '700', cursor: importando ? 'not-allowed' : 'pointer', opacity: importando ? 0.7 : 1, fontFamily: F.body }}>
                    {importando ? '⏳ Importando…' : '✅ Confirmar importação'}
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}

      {/* ── Modal do devedor ── */}
      {modalDev && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(15,45,74,0.50)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '2rem 1rem',
          overflowY: 'auto',
        }} onClick={fecharModal}>
          <div style={{
            background: C.surfaceContainerLowest, borderRadius: '1.25rem', width: '100%', maxWidth: '900px',
            boxShadow: '0 24px 80px rgba(0,0,0,0.28)', border: `2px solid ${C.borderSubtle}`,
            margin: 'auto',
          }} onClick={e => e.stopPropagation()}>

            {/* cabeçalho do modal */}
            <div style={{ padding: '1.5rem 1.75rem', borderBottom: `1px solid ${C.borderSubtle}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
              <div>
                <div style={{ fontWeight: '800', color: C.onSurface, fontSize: '1.15rem', fontFamily: F.headline }}>{modalDev.nome_pagador}</div>
                <div style={{ fontSize: '0.8rem', color: C.onSurfaceVariant, marginTop: '2px', fontFamily: F.body }}>
                  {abertos(modalDev).length} boleto{abertos(modalDev).length !== 1 ? 's' : ''} em aberto
                  {' · '}Total: <strong style={{ color: C.statusDanger, fontFamily: F.mono }}>{fBRL(valorAberto(modalDev))}</strong>
                  {modalDev.filial_id && filialMap[modalDev.filial_id] && (
                    <span style={{ marginLeft: '0.5rem', background: C.surfaceContainerLow, borderRadius: '0.35rem', padding: '0.1rem 0.5rem', fontSize: '0.75rem', fontWeight: '600', color: C.onSurfaceVariant }}>
                      {filialMap[modalDev.filial_id]}
                    </span>
                  )}
                  {docs.length > 0 && (
                    <span style={{ marginLeft: '0.5rem', background: '#9d0518', color: '#fff', borderRadius: '0.35rem', padding: '0.1rem 0.5rem', fontSize: '0.72rem', fontWeight: '700' }}>
                      {docs.length} doc{docs.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                <button onClick={() => copiarCobranca(modalDev)}
                  style={{ padding: '0.45rem 0.9rem', borderRadius: '0.5rem', background: copied ? C.statusSuccess : C.surfaceContainerLow, color: copied ? C.onPrimary : C.onSurfaceVariant, border: 'none', fontSize: '0.82rem', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s', fontFamily: F.body }}>
                  {copied ? '✓ Copiado!' : '📋 Copiar cobrança'}
                </button>
                <button onClick={fecharModal}
                  style={{ padding: '0.45rem 0.9rem', borderRadius: '0.5rem', background: 'none', border: `1.5px solid ${C.borderSubtle}`, color: C.onSurfaceVariant, fontSize: '0.82rem', fontWeight: '600', cursor: 'pointer', fontFamily: F.body }}>
                  ✕ Fechar
                </button>
              </div>
            </div>

            <div style={{ padding: '1.5rem 1.75rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

              {/* Boletos — cada boleto em um card com linha do BANCO e linha ATUAL */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.625rem' }}>
                  <div style={{ fontWeight: '700', color: C.onSurfaceVariant, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: F.body }}>
                    Boletos
                  </div>
                  {abertos(modalDev).length > 0 && (
                    <div style={{ fontSize: '0.8rem', fontFamily: F.body }}>
                      <span style={{ color: C.onSurfaceVariant }}>Total em aberto: </span>
                      <strong style={{ color: C.statusDanger, fontFamily: F.mono }}>{fBRL(valorAberto(modalDev))}</strong>
                    </div>
                  )}
                </div>

                {(() => {
                  const todos = modalDev.cobrancas_boletos || []
                  const qtdQuitados = todos.filter(b => boletoQuitado(b)).length
                  return qtdQuitados > 0 ? (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.8rem', fontFamily: F.body, color: C.onSurfaceVariant, marginBottom: '0.5rem' }}>
                      <input type="checkbox" checked={mostrarQuitados} onChange={e => setMostrarQuitados(e.target.checked)}
                        style={{ width: '1rem', height: '1rem', accentColor: C.statusSuccess }} />
                      Mostrar também os quitados ({qtdQuitados})
                    </label>
                  ) : null
                })()}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {[...(modalDev.cobrancas_boletos || [])]
                    .filter(b => mostrarQuitados || !boletoQuitado(b))
                    .sort((a, b) => (a.data_vencimento || '').localeCompare(b.data_vencimento || ''))
                    .map(b => {
                      const emAberto = !boletoQuitado(b)
                      const edit = boletoEdits[b.id] || { situacao_atual: b.situacao_atual || '', motivo: b.motivo || '', data_atual: b.data_atual || '', valor_atual: b.valor_atual != null ? String(b.valor_atual) : '', dirty: false }
                      const isSaving = savingBoleto.has(b.id)
                      const lblCss = { fontSize: '0.62rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: C.onSurfaceVariant, marginBottom: '0.2rem', fontFamily: F.body }
                      const fieldCss = { ...inputCss, padding: '0.35rem 0.5rem', fontSize: '0.8rem', width: '100%' }
                      return (
                        <div key={b.id} style={{ border: `1px solid ${C.borderSubtle}`, borderRadius: '0.6rem', overflow: 'hidden', background: emAberto ? C.surfaceContainerLowest : C.statusSuccessBg + '22' }}>
                          {/* Cabeçalho do boleto */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', padding: '0.6rem 0.875rem', borderBottom: `1px solid ${C.borderSubtle}`, background: C.surfaceContainerLow }}>
                            <div>
                              <span style={{ ...lblCss, display: 'inline' }}>Vencimento </span>
                              <strong style={{ color: C.onSurface, fontFamily: F.mono, fontSize: '0.9rem' }}>{fDate(b.data_vencimento)}</strong>
                            </div>
                            <div>
                              <span style={{ ...lblCss, display: 'inline' }}>Valor </span>
                              <strong style={{ color: emAberto ? C.statusDanger : C.onSurfaceVariant, fontFamily: F.mono, fontSize: '0.9rem' }}>{fBRL(b.valor)}</strong>
                            </div>
                            {b.nosso_numero && (
                              <div style={{ color: C.onSurfaceVariant, fontFamily: F.mono, fontSize: '0.78rem' }}>Nosso nº {b.nosso_numero}</div>
                            )}
                            <span style={{ marginLeft: 'auto', background: emAberto ? C.statusDangerBg : C.statusSuccessBg, color: emAberto ? C.statusDanger : C.statusSuccess, borderRadius: '9999px', padding: '0.15rem 0.6rem', fontSize: '0.72rem', fontWeight: '700', fontFamily: F.body }}>
                              {emAberto ? 'Em aberto' : 'Quitado'}
                            </span>
                          </div>

                          {/* Duas linhas: Banco / Atual */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem', padding: '0.75rem 0.875rem' }}>
                            {/* Linha BANCO (somente leitura) */}
                            <div style={{ background: C.surfaceContainerHigh, borderRadius: '0.5rem', padding: '0.6rem 0.75rem' }}>
                              <div style={{ fontSize: '0.66rem', fontWeight: '800', letterSpacing: '0.6px', color: C.onSurfaceVariant, marginBottom: '0.5rem', fontFamily: F.body }}>🏦 BANCO (do relatório)</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem 1.25rem' }}>
                                <div>
                                  <div style={lblCss}>Situação</div>
                                  {b.situacao_boleto
                                    ? <span style={{ display: 'inline-block', background: C.surfaceContainerLowest, color: C.onSurfaceVariant, borderRadius: '0.3rem', padding: '0.1rem 0.45rem', fontSize: '0.75rem', fontWeight: '500', fontFamily: F.body }}>{b.situacao_boleto}</span>
                                    : <span style={{ color: C.outlineVariant }}>—</span>}
                                </div>
                                <div>
                                  <div style={lblCss}>Liquidação</div>
                                  <span style={{ fontFamily: F.mono, fontSize: '0.8rem', color: C.onSurface }}>{fDate(b.data_liquidacao)}</span>
                                </div>
                                <div>
                                  <div style={lblCss}>Valor liquidado</div>
                                  <span style={{ fontFamily: F.mono, fontSize: '0.8rem', color: b.valor_liquidacao != null ? C.statusSuccess : C.outlineVariant }}>
                                    {b.valor_liquidacao != null ? fBRL(b.valor_liquidacao) : '—'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Linha ATUAL (editável) */}
                            <div style={{ background: C.primaryContainer + '11', border: `1px solid ${C.primaryContainer}33`, borderRadius: '0.5rem', padding: '0.6rem 0.75rem' }}>
                              <div style={{ fontSize: '0.66rem', fontWeight: '800', letterSpacing: '0.6px', color: C.primaryContainer, marginBottom: '0.5rem', fontFamily: F.body }}>✏️ ATUAL (controle interno)</div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                <div>
                                  <div style={lblCss}>Situação atual</div>
                                  <select value={edit.situacao_atual}
                                    onChange={e => updateBoletoEdit(b.id, 'situacao_atual', e.target.value)}
                                    style={fieldCss}>
                                    <option value="">—</option>
                                    {situacoesCobranca.map(s => <option key={s} value={s}>{s}</option>)}
                                    {edit.situacao_atual && !situacoesCobranca.includes(edit.situacao_atual) && (
                                      <option value={edit.situacao_atual}>{edit.situacao_atual}</option>
                                    )}
                                  </select>
                                </div>
                                <div>
                                  <div style={lblCss}>Data atual</div>
                                  <input type="date" value={edit.data_atual}
                                    onChange={e => updateBoletoEdit(b.id, 'data_atual', e.target.value)}
                                    style={fieldCss} />
                                </div>
                                <div>
                                  <div style={lblCss}>Valor atual</div>
                                  <input inputMode="decimal" value={edit.valor_atual}
                                    onChange={e => updateBoletoEdit(b.id, 'valor_atual', e.target.value)}
                                    placeholder="0,00"
                                    style={{ ...fieldCss, fontFamily: F.mono }} />
                                </div>
                                <div>
                                  <div style={lblCss}>Motivo</div>
                                  <input value={edit.motivo}
                                    onChange={e => updateBoletoEdit(b.id, 'motivo', e.target.value)}
                                    placeholder="Motivo..."
                                    style={fieldCss} />
                                </div>
                              </div>
                              {edit.dirty && (
                                <div style={{ marginTop: '0.5rem', textAlign: 'right' }}>
                                  <button onClick={() => salvarBoleto(b.id)} disabled={isSaving}
                                    style={{ padding: '0.35rem 0.9rem', background: C.primaryContainer, color: C.onPrimary, border: 'none', borderRadius: '0.4rem', fontSize: '0.78rem', fontWeight: '700', cursor: isSaving ? 'not-allowed' : 'pointer', opacity: isSaving ? 0.7 : 1, fontFamily: F.body }}>
                                    {isSaving ? 'Salvando…' : 'Salvar'}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  {(modalDev.cobrancas_boletos || []).length === 0 && (
                    <div style={{ textAlign: 'center', color: C.onSurfaceVariant, padding: '1.5rem 0', fontFamily: F.body, fontSize: '0.85rem' }}>Nenhum boleto para este devedor.</div>
                  )}
                </div>
              </div>

              {/* Lembretes (tarefas) */}
              <div style={{ borderTop: `1px solid ${C.borderSubtle}`, paddingTop: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ fontWeight: '700', color: C.onSurfaceVariant, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: F.body }}>
                    Lembretes {lembretes.length > 0 && `(${lembretes.filter(l => !l.concluido).length} pendente${lembretes.filter(l => !l.concluido).length !== 1 ? 's' : ''})`}
                  </div>
                  {!mostrarFormLembrete && (
                    <button onClick={() => { setMostrarFormLembrete(true); setNovoLembrete({ data: todayISO(), observacao: '' }) }}
                      style={{ padding: '0.35rem 0.8rem', background: C.primaryContainer, color: C.onPrimary, border: 'none', borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer', fontFamily: F.body }}>
                      + Adicionar lembrete
                    </button>
                  )}
                </div>

                {mostrarFormLembrete && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end', background: C.surfaceContainerLow, border: `1px solid ${C.borderSubtle}`, borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '0.75rem' }}>
                    <div>
                      <div style={{ fontSize: '0.68rem', fontWeight: '700', color: C.onSurfaceVariant, marginBottom: '0.2rem', fontFamily: F.body }}>Data</div>
                      <input type="date" value={novoLembrete.data}
                        onChange={e => setNovoLembrete(l => ({ ...l, data: e.target.value }))}
                        style={{ ...inputCss, padding: '0.4rem 0.6rem', fontSize: '0.82rem' }} />
                    </div>
                    <div style={{ flex: '1 1 200px' }}>
                      <div style={{ fontSize: '0.68rem', fontWeight: '700', color: C.onSurfaceVariant, marginBottom: '0.2rem', fontFamily: F.body }}>Observação</div>
                      <input value={novoLembrete.observacao}
                        onChange={e => setNovoLembrete(l => ({ ...l, observacao: e.target.value }))}
                        placeholder="Ex.: ligar para negociar…"
                        style={{ ...inputCss, padding: '0.4rem 0.6rem', fontSize: '0.82rem', width: '100%' }} />
                    </div>
                    <button onClick={adicionarLembrete} disabled={!novoLembrete.data || salvandoLembrete}
                      style={{ padding: '0.45rem 0.9rem', background: C.primaryContainer, color: C.onPrimary, border: 'none', borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: '700', cursor: (!novoLembrete.data || salvandoLembrete) ? 'not-allowed' : 'pointer', opacity: (!novoLembrete.data || salvandoLembrete) ? 0.6 : 1, fontFamily: F.body }}>
                      {salvandoLembrete ? '…' : 'Salvar'}
                    </button>
                    <button onClick={() => { setMostrarFormLembrete(false); setNovoLembrete({ data: '', observacao: '' }) }}
                      style={{ padding: '0.45rem 0.8rem', background: 'none', border: `1.5px solid ${C.borderSubtle}`, color: C.onSurfaceVariant, borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer', fontFamily: F.body }}>
                      Cancelar
                    </button>
                  </div>
                )}

                {lembretes.length === 0 ? (
                  <div style={{ color: C.onSurfaceVariant, fontSize: '0.82rem', fontFamily: F.body }}>Nenhum lembrete para este devedor.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {lembretes.map(l => {
                      const atrasado = !l.concluido && l.data < todayISO()
                      const hoje = !l.concluido && l.data === todayISO()
                      return (
                        <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: `1px solid ${C.borderSubtle}`, background: l.concluido ? C.surfaceContainerLow : atrasado ? C.statusDangerBg + '55' : hoje ? C.statusWarningBg + '55' : C.surfaceContainerLowest, opacity: l.concluido ? 0.7 : 1 }}>
                          <input type="checkbox" checked={l.concluido} onChange={() => toggleLembrete(l)} style={{ cursor: 'pointer', flexShrink: 0 }} />
                          <div style={{ minWidth: '78px', fontFamily: F.mono, fontSize: '0.8rem', fontWeight: '700', color: l.concluido ? C.onSurfaceVariant : atrasado ? C.statusDanger : hoje ? C.statusWarning : C.onSurface }}>
                            {fDate(l.data)}
                          </div>
                          <div style={{ flex: 1, fontSize: '0.85rem', color: C.onSurface, textDecoration: l.concluido ? 'line-through' : 'none', fontFamily: F.body }}>
                            {l.observacao || <span style={{ color: C.outlineVariant }}>—</span>}
                            {atrasado && <span style={{ marginLeft: '0.5rem', fontSize: '0.68rem', fontWeight: '700', color: C.statusDanger }}>ATRASADO</span>}
                            {hoje && <span style={{ marginLeft: '0.5rem', fontSize: '0.68rem', fontWeight: '700', color: C.statusWarning }}>HOJE</span>}
                          </div>
                          {isAdmin && (
                            <button onClick={() => excluirLembrete(l)} title="Excluir"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.outlineVariant, fontSize: '1rem', flexShrink: 0 }}>✕</button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Formulário de cobrança */}
              <div style={{ borderTop: `1px solid ${C.borderSubtle}`, paddingTop: '1.25rem' }}>
                <div style={{ fontWeight: '700', color: C.onSurfaceVariant, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '1rem', fontFamily: F.body }}>Dados da cobrança</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.875rem 1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: C.onSurfaceVariant, marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: F.body }}>Telefone</label>
                    <input type="text" placeholder="(00) 00000-0000" value={editForm.telefone || ''}
                      onChange={e => setEditForm(f => ({ ...f, telefone: e.target.value }))}
                      style={{ ...inputCss, width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: C.onSurfaceVariant, marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: F.body }}>Status</label>
                    <select value={editForm.status_cobranca || 'Novo'}
                      onChange={e => setEditForm(f => ({ ...f, status_cobranca: e.target.value }))}
                      style={{ ...inputCss, width: '100%' }}>
                      {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: C.onSurfaceVariant, marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: F.body }}>Data da audiência</label>
                    <input type="date" value={editForm.data_audiencia || ''}
                      onChange={e => setEditForm(f => ({ ...f, data_audiencia: e.target.value }))}
                      style={{ ...inputCss, width: '100%' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', paddingTop: '1.35rem' }}>
                    <input type="checkbox" id="pc-check-modal" checked={!!editForm.pequenas_causas}
                      onChange={e => setEditForm(f => ({ ...f, pequenas_causas: e.target.checked }))}
                      style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: C.primaryContainer }} />
                    <label htmlFor="pc-check-modal" style={{ fontSize: '0.875rem', fontWeight: '600', color: C.onSurfaceVariant, cursor: 'pointer', fontFamily: F.body }}>⚖️ Pequenas causas</label>
                  </div>
                  {editForm.pequenas_causas && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: C.onSurfaceVariant, marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: F.body }}>Status pequenas causas</label>
                      <select value={editForm.status_pequenas_causas || ''}
                        onChange={e => setEditForm(f => ({ ...f, status_pequenas_causas: e.target.value }))}
                        style={{ ...inputCss, width: '100%' }}>
                        <option value="">—</option>
                        {PC_STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
                        {editForm.status_pequenas_causas && !PC_STATUS_OPTS.includes(editForm.status_pequenas_causas) && (
                          <option value={editForm.status_pequenas_causas}>{editForm.status_pequenas_causas}</option>
                        )}
                      </select>
                    </div>
                  )}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: C.onSurfaceVariant, marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: F.body }}>Situação da audiência</label>
                    <input type="text" placeholder="Ex: Aguardando pauta, Realizada..." value={editForm.situacao_audiencia || ''}
                      onChange={e => setEditForm(f => ({ ...f, situacao_audiencia: e.target.value }))}
                      style={{ ...inputCss, width: '100%' }} />
                  </div>
                </div>
                <div style={{ marginTop: '0.875rem' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: C.onSurfaceVariant, marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: F.body }}>Observações</label>
                  <textarea rows={3} placeholder="Anotações sobre negociação, contatos, acordo..."
                    value={editForm.observacoes || ''}
                    onChange={e => setEditForm(f => ({ ...f, observacoes: e.target.value }))}
                    style={{ ...inputCss, width: '100%', resize: 'vertical', fontFamily: F.body }} />
                </div>
                <div style={{ marginTop: '1rem' }}>
                  <button onClick={salvarDevedor} disabled={salvando}
                    style={{ padding: '0.6rem 1.25rem', background: C.primaryContainer, color: C.onPrimary, border: 'none', borderRadius: '0.6rem', fontSize: '0.875rem', fontWeight: '700', cursor: salvando ? 'not-allowed' : 'pointer', opacity: salvando ? 0.7 : 1, fontFamily: F.body }}>
                    {salvando ? 'Salvando…' : 'Salvar dados da cobrança'}
                  </button>
                </div>
              </div>

              {/* ── Documentos (anexos) — todos os usuários podem incluir ── */}
              {(
                <div style={{ borderTop: `1px solid ${C.borderSubtle}`, paddingTop: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.875rem' }}>
                    <div style={{ fontWeight: '700', color: C.onSurfaceVariant, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: F.body }}>
                      Documentos
                    </div>
                    {docs.length > 0 && (
                      <span style={{ background: '#9d0518', color: '#fff', borderRadius: '9999px', padding: '1px 8px', fontSize: '0.7rem', fontWeight: '700', fontFamily: F.body }}>
                        {docs.length}
                      </span>
                    )}
                  </div>

                  {/* Erro de upload */}
                  {docErr && (
                    <div style={{ background: C.statusDangerBg, border: `1px solid ${C.statusDanger}`, borderRadius: '0.5rem', padding: '0.5rem 0.75rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <span style={{ color: C.statusDanger, fontSize: '0.82rem', fontFamily: F.body }}>{docErr}</span>
                      <button onClick={() => setDocErr(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.statusDanger, fontSize: '1rem', lineHeight: 1, flexShrink: 0 }}>✕</button>
                    </div>
                  )}

                  {/* Campo de descrição */}
                  <div style={{ marginBottom: '0.625rem' }}>
                    <input
                      type="text"
                      placeholder="Descrição do documento (ex: Acordo assinado)"
                      value={docDescricao}
                      onChange={e => setDocDescricao(e.target.value)}
                      style={{ ...inputCss, width: '100%' }}
                    />
                  </div>

                  {/* Zona de upload */}
                  <div
                    onDragOver={e => { e.preventDefault(); setDocDragOver(true) }}
                    onDragLeave={() => setDocDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDocDragOver(false); handleDocUpload(e.dataTransfer.files[0]) }}
                    onClick={() => !uploadingDoc && docFileRef.current?.click()}
                    style={{
                      border: `2px dashed ${docDragOver ? '#9d0518' : C.borderSubtle}`,
                      borderRadius: '0.75rem',
                      padding: '1.25rem',
                      textAlign: 'center',
                      cursor: uploadingDoc ? 'not-allowed' : 'pointer',
                      background: docDragOver ? 'rgba(157,5,24,0.05)' : C.surfaceContainerLow,
                      transition: 'all 0.15s',
                      marginBottom: '1rem',
                    }}
                  >
                    <input
                      ref={docFileRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.docx"
                      onChange={e => { handleDocUpload(e.target.files[0]); e.target.value = '' }}
                      style={{ display: 'none' }}
                    />
                    <div style={{ fontSize: '1.4rem', marginBottom: '0.3rem' }}>📎</div>
                    {uploadingDoc ? (
                      <div style={{ color: C.onSurfaceVariant, fontSize: '0.85rem', fontFamily: F.body }}>Enviando arquivo…</div>
                    ) : (
                      <>
                        <div style={{ fontWeight: '600', color: C.onSurface, fontSize: '0.85rem', fontFamily: F.body }}>
                          Clique ou arraste um arquivo aqui
                        </div>
                        <div style={{ color: C.onSurfaceVariant, fontSize: '0.75rem', marginTop: '0.2rem', fontFamily: F.body }}>
                          PDF, JPG, PNG, DOCX · máximo 10 MB por arquivo
                        </div>
                      </>
                    )}
                  </div>

                  {/* Lista de documentos */}
                  {loadingDocs ? (
                    <div style={{ color: C.onSurfaceVariant, fontSize: '0.82rem', fontFamily: F.body, padding: '0.5rem 0', textAlign: 'center' }}>Carregando documentos…</div>
                  ) : docs.length === 0 ? (
                    <div style={{ color: C.outlineVariant, fontSize: '0.82rem', fontFamily: F.body, textAlign: 'center', padding: '1rem 0' }}>
                      Nenhum documento anexado ainda.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {docs.map(doc => (
                        <div key={doc.id} style={{
                          display: 'flex', alignItems: 'center', gap: '0.75rem',
                          background: C.surfaceContainerLow, borderRadius: '0.625rem',
                          padding: '0.625rem 0.875rem', border: `1px solid ${C.borderSubtle}`,
                        }}>
                          <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>{tipoIcon(doc.tipo)}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: '600', color: C.onSurface, fontSize: '0.82rem', fontFamily: F.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {doc.nome_arquivo}
                            </div>
                            <div style={{ color: C.onSurfaceVariant, fontSize: '0.72rem', fontFamily: F.body, display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                              {doc.descricao && <span style={{ fontStyle: 'italic' }}>{doc.descricao}</span>}
                              {doc.descricao && <span>·</span>}
                              <span>{fBytes(doc.tamanho)}</span>
                              <span>·</span>
                              <span>{fDate(doc.created_at?.slice(0, 10))}</span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
                            <button
                              onClick={() => visualizarDoc(doc)}
                              style={{ padding: '0.3rem 0.65rem', borderRadius: '0.4rem', background: C.surfaceContainerHigh, color: C.onSurface, border: 'none', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', fontFamily: F.body }}
                            >
                              Ver / Baixar
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => excluirDoc(doc)}
                                style={{ padding: '0.3rem 0.65rem', borderRadius: '0.4rem', background: C.statusDangerBg, color: '#9d0518', border: `1px solid #9d051830`, fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', fontFamily: F.body }}
                              >
                                Excluir
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* ── Cabeçalho ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: '800', color: C.onSurface, margin: 0, letterSpacing: '-0.3px', fontFamily: F.headline }}>
          Cobranças
        </h1>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setView('lista')}
            style={{ padding: '0.55rem 1rem', borderRadius: '0.6rem', border: '1.5px solid', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s', fontFamily: F.body, ...(view === 'lista' ? { background: C.onSurface, color: C.surfaceContainerLowest, borderColor: C.onSurface } : { background: C.surfaceContainerLowest, color: C.onSurfaceVariant, borderColor: C.borderSubtle }) }}
          >📋 Devedores</button>
          <button
            onClick={() => setView('audiencias')}
            style={{ padding: '0.55rem 1rem', borderRadius: '0.6rem', border: '1.5px solid', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s', fontFamily: F.body, ...(view === 'audiencias' ? { background: C.onSurface, color: C.surfaceContainerLowest, borderColor: C.onSurface } : { background: C.surfaceContainerLowest, color: C.onSurfaceVariant, borderColor: C.borderSubtle }) }}
          >📅 Audiências {comAudiencia.length > 0 && `(${comAudiencia.length})`}</button>
          <button
            onClick={() => setView('boletos')}
            style={{ padding: '0.55rem 1rem', borderRadius: '0.6rem', border: '1.5px solid', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s', fontFamily: F.body, ...(view === 'boletos' ? { background: C.onSurface, color: C.surfaceContainerLowest, borderColor: C.onSurface } : { background: C.surfaceContainerLowest, color: C.onSurfaceVariant, borderColor: C.borderSubtle }) }}
          >🗂️ Relação de Boletos</button>
          {isAdmin && (
            <button
              onClick={abrirNovoDev}
              style={{ padding: '0.55rem 1.1rem', borderRadius: '0.6rem', background: C.surfaceContainerLowest, color: C.primaryContainer, border: `1.5px solid ${C.primaryContainer}`, fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer', fontFamily: F.body }}
            >➕ Adicionar devedor</button>
          )}
          <button
            onClick={clickImportar} disabled={importando}
            style={{ padding: '0.55rem 1.1rem', borderRadius: '0.6rem', background: C.primaryContainer, color: C.onPrimary, border: 'none', fontSize: '0.85rem', fontWeight: '700', cursor: importando ? 'not-allowed' : 'pointer', opacity: importando ? 0.7 : 1, fontFamily: F.body }}
          >{importando ? '⏳ Importando...' : '⬆️ Importar relatório'}</button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileSelect} style={{ display: 'none' }} />
        </div>
      </div>

      {/* ── Banners de importação ── */}
      {importErr && (
        <div style={{ ...dsCard, borderLeft: `4px solid ${C.statusDanger}`, marginBottom: '1rem', background: C.statusDangerBg }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
            <div>
              <p style={{ fontWeight: '700', color: C.statusDanger, margin: '0 0 0.25rem', fontFamily: F.body }}>Erro na importação</p>
              <p style={{ color: C.statusDanger, margin: 0, fontSize: '0.875rem', fontFamily: F.body }}>{importErr}</p>
            </div>
            <button onClick={() => setImportErr(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.statusDanger, fontSize: '1.25rem', lineHeight: 1, flexShrink: 0 }}>✕</button>
          </div>
        </div>
      )}
      {resultado && (
        <div style={{ ...dsCard, borderLeft: `4px solid ${C.statusSuccess}`, marginBottom: '1rem', background: C.statusSuccessBg }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
            <div>
              <p style={{ fontWeight: '700', color: C.statusSuccess, margin: '0 0 0.5rem', fontFamily: F.body }}>
                ✅ Importação concluída — {resultado.total} boleto{resultado.total !== 1 ? 's' : ''} processado{resultado.total !== 1 ? 's' : ''}
                {resultado.filialNome && <span style={{ marginLeft: '0.5rem', fontWeight: '400' }}>· Filial: <strong>{resultado.filialNome}</strong></span>}
              </p>
              <div style={{ fontSize: '0.85rem', color: C.statusSuccess, display: 'flex', flexDirection: 'column', gap: '0.2rem', fontFamily: F.body }}>
                <span>📥 {resultado.inseridos} boleto{resultado.inseridos !== 1 ? 's' : ''} novo{resultado.inseridos !== 1 ? 's' : ''} inserido{resultado.inseridos !== 1 ? 's' : ''} · ♻️ {resultado.atualizados} atualizado{resultado.atualizados !== 1 ? 's' : ''}</span>
                {resultado.vencimentosAlterados > 0 && (
                  <span>📅 {resultado.vencimentosAlterados} vencimento{resultado.vencimentosAlterados !== 1 ? 's' : ''} atualizado{resultado.vencimentosAlterados !== 1 ? 's' : ''} conforme o banco</span>
                )}
                {resultado.novosDevedores.length > 0 && (
                  <span>🆕 {resultado.novosDevedores.length} devedor{resultado.novosDevedores.length > 1 ? 'es' : ''} novo{resultado.novosDevedores.length > 1 ? 's' : ''}: <strong>{resultado.novosDevedores.join(', ')}</strong></span>
                )}
                {resultado.devedoresAtualizados > 0 && (
                  <span>🔄 {resultado.devedoresAtualizados} devedor{resultado.devedoresAtualizados > 1 ? 'es' : ''} existente{resultado.devedoresAtualizados > 1 ? 's' : ''} atualizado{resultado.devedoresAtualizados > 1 ? 's' : ''}</span>
                )}
              </div>
            </div>
            <button onClick={() => setResultado(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.statusSuccess, fontSize: '1.25rem', lineHeight: 1, flexShrink: 0 }}>✕</button>
          </div>
        </div>
      )}

      {/* ════════ VIEW: LISTA ════════ */}
      {view === 'lista' && (
        <>
          {/* Filtros */}
          <div style={{ ...dsCard, marginBottom: '1rem', padding: '1rem 1.25rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.625rem', alignItems: 'center' }}>
              <input
                type="search" placeholder="Buscar por nome…" value={filtros.busca}
                onChange={e => setFiltros(f => ({ ...f, busca: e.target.value }))}
                style={{ ...inputCss, minWidth: '180px', flex: '1 1 180px' }}
              />
              <select
                value={filtros.status}
                onChange={e => setFiltros(f => ({ ...f, status: e.target.value, somenteNovos: false }))}
                style={{ ...inputCss, minWidth: '160px' }}
              >
                <option value="">Todos os status</option>
                {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {filiais.length > 1 && (
                <select value={filtroFilial} onChange={e => setFiltroFilial(e.target.value)}
                  style={{ ...inputCss, minWidth: '160px' }}>
                  <option value="">Todas as filiais</option>
                  {filiais.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: C.onSurfaceVariant, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', fontFamily: F.body }}>
                <input type="checkbox" checked={filtros.somenteNovos}
                  onChange={e => setFiltros(f => ({ ...f, somenteNovos: e.target.checked, status: e.target.checked ? '' : f.status }))} />
                Somente novos
              </label>
              <select value={filtros.pequenasCausas}
                onChange={e => setFiltros(f => ({ ...f, pequenasCausas: e.target.value }))}
                style={{ ...inputCss, minWidth: '150px' }}>
                <option value="">Pequenas causas: todas</option>
                <option value="com">Com pequenas causas</option>
                <option value="sem">Sem pequenas causas</option>
              </select>
              <select value={filtros.audiencia}
                onChange={e => setFiltros(f => ({ ...f, audiencia: e.target.value }))}
                style={{ ...inputCss, minWidth: '140px' }}>
                <option value="">Audiência: todas</option>
                <option value="com">Com audiência</option>
                <option value="sem">Sem audiência</option>
              </select>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: C.onSurfaceVariant, fontFamily: F.body, cursor: 'pointer', whiteSpace: 'nowrap' }}
                title="Mostra também clientes quitados ou só com boletos a vencer (para ver observações, lembretes e documentos antigos)">
                <input type="checkbox" checked={!!filtros.incluirSemVencidos}
                  onChange={e => setFiltros(f => ({ ...f, incluirSemVencidos: e.target.checked }))} />
                Incluir clientes sem vencidos
              </label>
              {(filtros.busca || filtros.status || filtros.somenteNovos || filtros.incluirSemVencidos || filtros.pequenasCausas || filtros.audiencia || temFiltrosVenc) && (
                <button onClick={() => { setFiltros({ busca: '', status: '', somenteNovos: false, incluirSemVencidos: false, pequenasCausas: '', audiencia: '' }); setFiltroVencInicio(''); setFiltroVencFim(''); setFiltroSitBoleto('') }}
                  style={{ fontSize: '0.8rem', color: C.statusDanger, background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600', padding: '0.3rem 0.5rem', fontFamily: F.body }}>
                  ✕ Limpar
                </button>
              )}
              <button onClick={imprimirRelatorio} disabled={loading || listaFiltrada.length === 0}
                style={{ fontSize: '0.8rem', color: C.onPrimary, background: C.primaryContainer, border: 'none', borderRadius: '0.5rem', cursor: (loading || listaFiltrada.length === 0) ? 'not-allowed' : 'pointer', opacity: (loading || listaFiltrada.length === 0) ? 0.5 : 1, fontWeight: '700', padding: '0.45rem 0.9rem', fontFamily: F.body }}>
                🖨️ Imprimir
              </button>
              <span style={{ fontSize: '0.8rem', color: C.onSurfaceVariant, marginLeft: 'auto', fontFamily: F.body }}>
                {loading ? '…' : `${listaFiltrada.length} devedor${listaFiltrada.length !== 1 ? 'es' : ''}`}
              </span>
            </div>

            {/* Filtro por vencimento */}
            <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: `1px solid ${C.borderSubtle}`, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '0.625rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: '700', color: C.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.5px', alignSelf: 'center', whiteSpace: 'nowrap', fontFamily: F.body }}>
                Boletos vencidos:
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: C.onSurfaceVariant, fontWeight: '600', marginBottom: '0.2rem', fontFamily: F.body }}>De</div>
                <input type="date" value={filtroVencInicio} onChange={e => setFiltroVencInicio(e.target.value)}
                  style={{ ...inputCss, padding: '0.4rem 0.6rem', fontSize: '0.82rem' }} />
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: C.onSurfaceVariant, fontWeight: '600', marginBottom: '0.2rem', fontFamily: F.body }}>Até</div>
                <input type="date" value={filtroVencFim} onChange={e => setFiltroVencFim(e.target.value)}
                  style={{ ...inputCss, padding: '0.4rem 0.6rem', fontSize: '0.82rem' }} />
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: C.onSurfaceVariant, fontWeight: '600', marginBottom: '0.2rem', fontFamily: F.body }}>Situação do boleto</div>
                <select value={filtroSitBoleto} onChange={e => setFiltroSitBoleto(e.target.value)}
                  style={{ ...inputCss, padding: '0.4rem 0.6rem', fontSize: '0.82rem', minWidth: '170px' }}>
                  <option value="">Todas</option>
                  {situacoesVencidos.map(sit => <option key={sit} value={sit}>{sit}</option>)}
                </select>
              </div>
              {temFiltrosVenc && (
                <button onClick={() => { setFiltroVencInicio(''); setFiltroVencFim(''); setFiltroSitBoleto('') }}
                  style={{ fontSize: '0.78rem', color: C.statusDanger, background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600', padding: '0.3rem 0.5rem', fontFamily: F.body }}>
                  ✕ Limpar
                </button>
              )}
            </div>
          </div>

          {/* Tabela de devedores */}
          <div style={{ ...dsCard, marginBottom: '1rem' }}>
            {loading ? (
              <div style={{ textAlign: 'center', color: C.onSurfaceVariant, padding: '3rem 0', fontFamily: F.body }}>Carregando…</div>
            ) : listaFiltrada.length === 0 ? (
              <div style={{ textAlign: 'center', color: C.onSurfaceVariant, padding: '3rem 0' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📂</div>
                <div style={{ fontWeight: '600', fontFamily: F.body }}>
                  {devedores.length === 0 ? 'Nenhum devedor cadastrado. Importe um relatório para começar.' : 'Nenhum resultado com os filtros aplicados.'}
                </div>
              </div>
            ) : (
              <div className="tabela-rolagem" style={{ overflow: 'auto', maxHeight: 'max(320px, calc(100vh - 260px))' }}>
                <style>{CSS_TABELA_ROLAGEM}</style>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ background: C.tableHeader, borderBottom: `1.5px solid ${C.borderSubtle}` }}>
                      {['Devedor', 'Pagador', 'Telefone', 'Vencidos', 'Valor vencido', 'Status', 'P. Causas', 'Audiência', 'Atualização'].map(h => (
                        <th key={h} style={{ padding: '0.65rem 0.875rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: '600', color: C.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', fontFamily: F.body }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {listaFiltrada.map(dev => {
                      const qtdAbertos = vencidos(dev).length
                      const valAberto  = valorVencido(dev)
                      const sStyle     = statusStyle(dev.status_cobranca)
                      return (
                        <tr
                          key={dev.id}
                          onClick={() => abrirModal(dev)}
                          style={{ borderBottom: `1px solid ${C.borderSubtle}`, cursor: 'pointer', transition: 'background 0.12s' }}
                          onMouseEnter={e => e.currentTarget.style.background = C.surfaceContainerLow}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <td style={{ padding: '0.8rem 0.875rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <div style={{ width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0, background: C.surfaceContainerHigh, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.82rem', fontWeight: '700', color: C.onSurfaceVariant, fontFamily: F.headline }}>
                                {dev.nome_pagador.charAt(0)}
                              </div>
                              <div>
                                <div style={{ fontWeight: '700', color: C.onSurface, fontSize: '0.875rem', fontFamily: F.body }}>{dev.nome_pagador}</div>
                                {dev.status_cobranca === 'Novo' && (
                                  <span style={{ fontSize: '0.68rem', fontWeight: '800', background: C.primaryContainer, color: C.onPrimary, padding: '1px 6px', borderRadius: '9999px', letterSpacing: '0.5px', fontFamily: F.body }}>NOVO</span>
                                )}
                                {vencidos(dev).length === 0 && (
                                  abertos(dev).length === 0
                                    ? <span style={{ fontSize: '0.68rem', fontWeight: '700', background: C.statusSuccessBg, color: C.statusSuccess, padding: '1px 6px', borderRadius: '9999px', marginRight: '4px', fontFamily: F.body }}>✓ QUITADO</span>
                                    : <span style={{ fontSize: '0.68rem', fontWeight: '700', background: C.statusInfoBg, color: C.statusInfo, padding: '1px 6px', borderRadius: '9999px', marginRight: '4px', fontFamily: F.body }}>A VENCER</span>
                                )}
                                {dev.filial_id && filialMap[dev.filial_id] && (
                                  <span style={{ fontSize: '0.68rem', fontWeight: '600', background: C.surfaceContainerLow, color: C.onSurfaceVariant, padding: '1px 6px', borderRadius: '9999px', marginLeft: '4px', fontFamily: F.body }}>
                                    {filialMap[dev.filial_id]}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '0.8rem 0.875rem', color: C.onSurfaceVariant, fontSize: '0.85rem', fontFamily: F.body }}>
                            {dev.pagador || dev.nome_pagador || <span style={{ color: C.outlineVariant }}>—</span>}
                          </td>
                          <td style={{ padding: '0.8rem 0.875rem', color: C.onSurfaceVariant, fontSize: '0.85rem', whiteSpace: 'nowrap', fontFamily: F.body }}>
                            {dev.telefone
                              ? <a href={`tel:${dev.telefone}`} onClick={e => e.stopPropagation()} style={{ color: C.secondary, textDecoration: 'none', fontWeight: '500' }}>{dev.telefone}</a>
                              : <span style={{ color: C.outlineVariant }}>—</span>}
                          </td>
                          <td style={{ padding: '0.8rem 0.875rem', fontWeight: '700', color: qtdAbertos > 0 ? C.onSurface : C.outlineVariant, fontFamily: F.mono }}>{qtdAbertos}</td>
                          <td style={{ padding: '0.8rem 0.875rem', fontWeight: '700', color: valAberto > 0 ? C.statusDanger : C.outlineVariant, whiteSpace: 'nowrap', fontFamily: F.mono }}>{fBRL(valAberto)}</td>
                          <td style={{ padding: '0.8rem 0.875rem' }}>
                            <span style={{ background: sStyle.bg, color: sStyle.color, borderRadius: '0.4rem', padding: '0.2rem 0.6rem', fontSize: '0.78rem', fontWeight: '700', fontFamily: F.body }}>
                              {dev.status_cobranca || '—'}
                            </span>
                          </td>
                          <td style={{ padding: '0.8rem 0.875rem', textAlign: 'center', fontSize: '1rem' }}>
                            {dev.pequenas_causas ? '⚖️' : <span style={{ color: C.outlineVariant }}>—</span>}
                          </td>
                          <td style={{ padding: '0.8rem 0.875rem', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                            {dev.data_audiencia ? (
                              <span style={{
                                fontWeight: '600', fontFamily: F.body,
                                color: dev.data_audiencia < todayISO() ? C.onSurfaceVariant :
                                       dev.data_audiencia === todayISO() ? C.statusDanger :
                                       diffDias(dev.data_audiencia, todayISO()) <= 7 ? C.statusWarning : C.onSurface
                              }}>
                                {dev.data_audiencia === todayISO() ? '🔴 ' : diffDias(dev.data_audiencia, todayISO()) <= 7 && dev.data_audiencia > todayISO() ? '🟡 ' : ''}
                                {fDate(dev.data_audiencia)}
                              </span>
                            ) : <span style={{ color: C.outlineVariant }}>—</span>}
                          </td>
                          <td style={{ padding: '0.8rem 0.875rem', color: C.onSurfaceVariant, fontSize: '0.8rem', whiteSpace: 'nowrap', fontFamily: F.mono }}>
                            {fDate(dev.ultima_atualizacao)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ════════ VIEW: AUDIÊNCIAS ════════ */}
      {view === 'audiencias' && (
        <div style={dsCard}>
          <div style={{ fontWeight: '700', color: C.onSurface, fontSize: '0.95rem', marginBottom: '1rem', fontFamily: F.headline }}>
            Audiências marcadas — {comAudiencia.length} devedor{comAudiencia.length !== 1 ? 'es' : ''}
          </div>
          {comAudiencia.length === 0 ? (
            <div style={{ textAlign: 'center', color: C.onSurfaceVariant, padding: '2.5rem 0' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📅</div>
              <div style={{ fontWeight: '600', fontFamily: F.body }}>Nenhuma audiência marcada.</div>
              <div style={{ fontSize: '0.82rem', marginTop: '0.25rem', fontFamily: F.body }}>Clique em um devedor e preencha a data da audiência.</div>
            </div>
          ) : (
            <div className="tabela-rolagem" style={{ overflow: 'auto', maxHeight: 'max(320px, calc(100vh - 260px))' }}>
              <style>{CSS_TABELA_ROLAGEM}</style>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ background: C.tableHeader, borderBottom: `1.5px solid ${C.borderSubtle}` }}>
                    {['Data', 'Devedor', 'Situação da audiência', 'Status cobrança', 'Em aberto'].map(h => (
                      <th key={h} style={{ padding: '0.55rem 0.875rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: '600', color: C.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', fontFamily: F.body }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comAudiencia.map(dev => {
                    const hoje = todayISO()
                    const dias = diffDias(dev.data_audiencia, hoje)
                    const isHoje    = dev.data_audiencia === hoje
                    const isProxima = dias > 0 && dias <= 7
                    const isPassada = dev.data_audiencia < hoje
                    const rowBg = isHoje ? C.statusDangerBg : isProxima ? C.statusWarningBg : 'transparent'
                    const sStyle = statusStyle(dev.status_cobranca)
                    return (
                      <tr
                        key={dev.id}
                        onClick={() => { setView('lista'); abrirModal(dev) }}
                        style={{ borderBottom: `1px solid ${C.borderSubtle}`, background: rowBg, cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                      >
                        <td style={{ padding: '0.7rem 0.875rem', whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: '800', color: isHoje ? C.statusDanger : isProxima ? C.statusWarning : isPassada ? C.onSurfaceVariant : C.onSurface, fontSize: '0.9rem', fontFamily: F.body }}>
                            {isHoje ? '🔴 HOJE' : isProxima ? `🟡 ${fDate(dev.data_audiencia)}` : fDate(dev.data_audiencia)}
                          </div>
                          {isHoje    && <div style={{ fontSize: '0.72rem', color: C.statusDanger, fontWeight: '600', fontFamily: F.body }}>Audiência hoje!</div>}
                          {isProxima && <div style={{ fontSize: '0.72rem', color: C.statusWarning, fontFamily: F.body }}>em {dias} dia{dias > 1 ? 's' : ''}</div>}
                          {isPassada && <div style={{ fontSize: '0.72rem', color: C.onSurfaceVariant, fontFamily: F.body }}>há {Math.abs(dias)} dia{Math.abs(dias) > 1 ? 's' : ''}</div>}
                        </td>
                        <td style={{ padding: '0.7rem 0.875rem', fontWeight: '700', color: C.onSurface, fontFamily: F.body }}>{dev.nome_pagador}</td>
                        <td style={{ padding: '0.7rem 0.875rem', color: C.onSurfaceVariant, fontSize: '0.82rem', fontFamily: F.body }}>{dev.situacao_audiencia || <span style={{ color: C.outlineVariant }}>—</span>}</td>
                        <td style={{ padding: '0.7rem 0.875rem' }}>
                          <span style={{ background: sStyle.bg, color: sStyle.color, borderRadius: '0.4rem', padding: '0.2rem 0.55rem', fontSize: '0.75rem', fontWeight: '700', fontFamily: F.body }}>
                            {dev.status_cobranca}
                          </span>
                        </td>
                        <td style={{ padding: '0.7rem 0.875rem', fontWeight: '700', color: C.statusDanger, whiteSpace: 'nowrap', fontFamily: F.mono }}>
                          {fBRL(valorAberto(dev))}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ════════ VIEW: RELAÇÃO DE BOLETOS ════════ */}
      {view === 'boletos' && (
        <>
          {/* Filtros */}
          <div style={{ ...dsCard, marginBottom: '1rem', padding: '1rem 1.25rem' }}>
            {/* Filtro rápido */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: '700', color: C.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: F.body, marginRight: '0.25rem' }}>Mostrar:</span>
              {[
                ['', 'Todos', todosBoletos.length],
                ['aberto', 'Em aberto', contagemRapida.aberto || 0],
                ['vencido', 'Vencidos', contagemRapida.vencido || 0],
                ['a_vencer', 'A vencer', contagemRapida.a_vencer || 0],
                ['quitado', 'Quitados', contagemRapida.quitado || 0],
              ].map(([v, rotulo, qtd]) => {
                const ativo = filtroBolRapido === v
                return (
                  <button key={v || 'todos'} onClick={() => setFiltroBolRapido(v)}
                    style={{
                      padding: '0.35rem 0.8rem', borderRadius: '999px', cursor: 'pointer', fontSize: '0.8rem', fontFamily: F.body,
                      fontWeight: ativo ? '700' : '500',
                      border: `1.5px solid ${ativo ? C.primaryContainer : C.borderSubtle}`,
                      background: ativo ? C.primaryContainer : C.surfaceContainerLowest,
                      color: ativo ? C.onPrimary : C.onSurfaceVariant,
                    }}>
                    {rotulo} <span style={{ opacity: 0.8, fontFamily: F.mono }}>({qtd})</span>
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.625rem', alignItems: 'center' }}>
              <input
                type="search" value={filtroBolNome} onChange={e => setFiltroBolNome(e.target.value)}
                placeholder="🔍 Buscar devedor pelo nome"
                style={{ ...inputCss, minWidth: '220px', flex: '1 1 220px' }}
              />
              <select
                value={filtroBolSitAtual} onChange={e => setFiltroBolSitAtual(e.target.value)}
                style={{ ...inputCss, minWidth: '160px' }}
              >
                <option value="">Situação Atual (todas)</option>
                {situacoesCobranca.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select
                value={filtroBolSitBanco} onChange={e => setFiltroBolSitBanco(e.target.value)}
                style={{ ...inputCss, minWidth: '160px' }}
              >
                <option value="">Sit. Banco (todas)</option>
                {sitsBancoDB.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {isAdmin && (
                <select
                  value={filtroBolFilial} onChange={e => setFiltroBolFilial(e.target.value)}
                  style={{ ...inputCss, minWidth: '150px' }}
                >
                  <option value="">Filial (todas)</option>
                  {filiais.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              )}
              <input
                type="date" value={filtroBolVencInicio} onChange={e => setFiltroBolVencInicio(e.target.value)}
                style={{ ...inputCss, width: '140px' }} title="Vencimento de"
              />
              <input
                type="date" value={filtroBolVencFim} onChange={e => setFiltroBolVencFim(e.target.value)}
                style={{ ...inputCss, width: '140px' }} title="Vencimento até"
              />
              <button
                onClick={() => { setFiltroBolNome(''); setFiltroBolRapido(''); setFiltroBolSitAtual(''); setFiltroBolSitBanco(''); setFiltroBolFilial(''); setFiltroBolVencInicio(''); setFiltroBolVencFim('') }}
                style={{ padding: '0.45rem 0.9rem', borderRadius: '0.5rem', border: `1px solid ${C.borderSubtle}`, background: C.surfaceContainerHigh, color: C.onSurfaceVariant, cursor: 'pointer', fontSize: '0.82rem', fontFamily: F.body }}
              >Limpar filtros</button>
              <button
                onClick={exportarBoletos}
                style={{ padding: '0.45rem 0.9rem', borderRadius: '0.5rem', border: 'none', background: C.primaryContainer, color: C.onPrimary, cursor: 'pointer', fontSize: '0.82rem', fontWeight: '700', fontFamily: F.body, marginLeft: 'auto' }}
              >⬇️ Exportar Excel</button>
            </div>
          </div>

          {/* Totais */}
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div style={{ ...dsCard, flex: '1 1 160px', padding: '0.875rem 1.25rem' }}>
              <div style={{ fontSize: '0.75rem', color: C.onSurfaceVariant, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: F.body, marginBottom: '0.25rem' }}>Boletos filtrados</div>
              <div style={{ fontSize: '1.6rem', fontWeight: '800', color: C.onSurface, fontFamily: F.headline }}>{boletosFiltrados.length}</div>
            </div>
            <div style={{ ...dsCard, flex: '1 1 200px', padding: '0.875rem 1.25rem' }}>
              <div style={{ fontSize: '0.75rem', color: C.onSurfaceVariant, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: F.body, marginBottom: '0.25rem' }}>Valor total</div>
              <div style={{ fontSize: '1.6rem', fontWeight: '800', color: C.primaryContainer, fontFamily: F.headline }}>{fBRL(totalBolVal)}</div>
            </div>
          </div>

          {/* Tabela */}
          <div style={{ ...dsCard, padding: 0, overflow: 'hidden' }}>
            <div className="tabela-rolagem" style={{ overflow: 'auto', maxHeight: 'max(320px, calc(100vh - 260px))' }}>
              <style>{CSS_TABELA_ROLAGEM}</style>
              {boletosFiltrados.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: C.onSurfaceVariant, fontFamily: F.body }}>
                  Nenhum boleto encontrado com os filtros selecionados.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: F.body }}>
                  <thead>
                    <tr style={{ background: C.surfaceContainerHigh }}>
                      {['Devedor', isAdmin ? 'Filial' : null, 'Nosso Nº', 'Vencimento', 'Valor', 'Sit. Banco', 'Situação Atual', 'Motivo', 'Dt. Liquidação'].filter(Boolean).map(h => (
                        <th key={h} style={{ padding: '0.65rem 0.875rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '700', color: C.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {boletosFiltrados.map(b => {
                      const liquidado = boletoQuitado(b)
                      return (
                        <tr key={b.id} style={{ borderBottom: `1px solid ${C.borderSubtle}`, background: liquidado ? C.statusSuccessBg + '33' : 'transparent' }}>
                          <td style={{ padding: '0.6rem 0.875rem', fontWeight: '600', color: C.onSurface, whiteSpace: 'nowrap' }}>{b.nome_pagador}</td>
                          {isAdmin && <td style={{ padding: '0.6rem 0.875rem', color: C.onSurfaceVariant, fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{b.filial_nome}</td>}
                          <td style={{ padding: '0.6rem 0.875rem', fontFamily: F.mono, fontSize: '0.82rem', color: C.onSurfaceVariant }}>{b.nosso_numero || '—'}</td>
                          <td style={{ padding: '0.6rem 0.875rem', whiteSpace: 'nowrap', color: C.onSurface }}>{fDate(b.data_vencimento)}</td>
                          <td style={{ padding: '0.6rem 0.875rem', fontWeight: '700', color: liquidado ? C.statusSuccess : C.statusDanger, whiteSpace: 'nowrap', fontFamily: F.mono }}>{fBRL(b.valor)}</td>
                          <td style={{ padding: '0.6rem 0.875rem' }}>
                            {b.situacao_boleto ? (
                              <span style={{ background: C.surfaceContainerHigh, color: C.onSurfaceVariant, borderRadius: '0.35rem', padding: '0.15rem 0.45rem', fontSize: '0.72rem', fontWeight: '600' }}>{b.situacao_boleto}</span>
                            ) : <span style={{ color: C.outlineVariant }}>—</span>}
                          </td>
                          <td style={{ padding: '0.6rem 0.875rem' }}>
                            {b.situacao_atual ? (
                              <span style={{ background: b.situacao_atual === 'Liquidada' ? C.statusSuccessBg : C.primaryContainer + '33', color: b.situacao_atual === 'Liquidada' ? C.statusSuccess : C.primaryContainer, borderRadius: '0.35rem', padding: '0.15rem 0.45rem', fontSize: '0.72rem', fontWeight: '700' }}>{b.situacao_atual}</span>
                            ) : <span style={{ color: C.outlineVariant }}>—</span>}
                          </td>
                          <td style={{ padding: '0.6rem 0.875rem', color: C.onSurfaceVariant, fontSize: '0.82rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.motivo || <span style={{ color: C.outlineVariant }}>—</span>}</td>
                          <td style={{ padding: '0.6rem 0.875rem', whiteSpace: 'nowrap', color: liquidado ? C.statusSuccess : C.outlineVariant, fontWeight: liquidado ? '600' : '400' }}>{fDate(b.data_liquidacao)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
