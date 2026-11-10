import { zipSync, strToU8 } from 'fflate'
import * as XLSX from 'xlsx'
import { supabase } from './supabase'
import { buscarTodos } from './paginar'

// Ordem pensada para uma futura restauração (quem é referenciado vem antes).
export const TABELAS_BACKUP = [
  { nome: 'filiais',             rotulo: 'Filiais' },
  { nome: 'profiles',            rotulo: 'Usuários',            semColunas: ['email'] },
  { nome: 'configuracoes',       rotulo: 'Configurações',       chave: 'chave' },
  { nome: 'clientes',            rotulo: 'Clientes' },
  { nome: 'captacao_clientes',   rotulo: 'Captação' },
  { nome: 'vendas',              rotulo: 'Vendas' },
  { nome: 'vendas_observacoes',  rotulo: 'Vendas - observações' },
  { nome: 'despesas',            rotulo: 'Contas a pagar' },
  { nome: 'cobrancas_devedores', rotulo: 'Cobrança - devedores' },
  { nome: 'cobrancas_boletos',   rotulo: 'Cobrança - boletos' },
  { nome: 'cobrancas_lembretes', rotulo: 'Cobrança - lembretes' },
  { nome: 'cobrancas_documentos', rotulo: 'Cobrança - documentos' },
  { nome: 'cobrancas_importacoes', rotulo: 'Cobrança - importações' },
  { nome: 'agenda',              rotulo: 'Agenda' },
  { nome: 'agenda_observacoes',  rotulo: 'Agenda - observações' },
  { nome: 'sugestoes',           rotulo: 'Sugestões' },
]
const BUCKET_ANEXOS = 'cobrancas-documentos'

export const FREQUENCIAS = [
  { valor: 'diario',    rotulo: 'Diário' },
  { valor: 'semanal',   rotulo: 'Semanal' },
  { valor: 'quinzenal', rotulo: 'Quinzenal' },
  { valor: 'mensal',    rotulo: 'Mensal' },
]
export const TIPOS_BACKUP = {
  leve:     { rotulo: 'Backup leve',     detalhe: 'sem anexos',   padrao: 'semanal' },
  completo: { rotulo: 'Backup completo', detalhe: 'com anexos',   padrao: 'mensal' },
}
const CHAVE_FREQ = tipo => `backup_${tipo}_freq`
const CHAVE_ULTIMO = tipo => `backup_${tipo}_ultimo`

/* ── Datas ── */
function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function proximoBackup(ultimoEm, freq) {
  if (!ultimoEm) return null
  const d = new Date(ultimoEm)
  d.setHours(12, 0, 0, 0)
  if (freq === 'diario') d.setDate(d.getDate() + 1)
  else if (freq === 'quinzenal') d.setDate(d.getDate() + 15)
  else if (freq === 'mensal') d.setMonth(d.getMonth() + 1)
  else d.setDate(d.getDate() + 7)
  return isoLocal(d)
}
export function backupVencido(ultimoEm, freq) {
  const prox = proximoBackup(ultimoEm, freq)
  return !prox || prox <= isoLocal(new Date())
}
export function fmtDataHora(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

/* ── Configuração (tabela configuracoes, vale para todos) ── */
export async function lerConfigBackup() {
  const chaves = Object.keys(TIPOS_BACKUP).flatMap(t => [CHAVE_FREQ(t), CHAVE_ULTIMO(t)])
  const { data, error } = await supabase.from('configuracoes').select('chave, valor').in('chave', chaves)
  const mapa = Object.fromEntries((data || []).map(r => [r.chave, r.valor]))
  const cfg = {}
  for (const [tipo, meta] of Object.entries(TIPOS_BACKUP)) {
    let ultimo = null
    try { ultimo = mapa[CHAVE_ULTIMO(tipo)] ? JSON.parse(mapa[CHAVE_ULTIMO(tipo)]) : null } catch { ultimo = null }
    cfg[tipo] = { freq: mapa[CHAVE_FREQ(tipo)] || meta.padrao, ultimo }
  }
  return { cfg, error }
}

export async function salvarFrequencias(freqs) {
  return supabase.from('configuracoes').upsert(
    Object.entries(freqs).map(([tipo, freq]) => ({ chave: CHAVE_FREQ(tipo), valor: freq })),
    { onConflict: 'chave' })
}

// O backup completo também conta como leve (tem tudo o que o leve tem).
async function registrarBackup(tipo, info) {
  const tipos = tipo === 'completo' ? ['completo', 'leve'] : ['leve']
  return supabase.from('configuracoes').upsert(
    tipos.map(t => ({ chave: CHAVE_ULTIMO(t), valor: JSON.stringify(info) })),
    { onConflict: 'chave' })
}

/* ── Pasta escolhida no computador (fica guardada só neste navegador) ── */
export const pastaSuportada = typeof window !== 'undefined' && 'showDirectoryPicker' in window

function abrirIDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('mercadao-backup', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('kv')
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function idb(modo, fn) {
  const db = await abrirIDB()
  return new Promise((res, rej) => {
    const tx = db.transaction('kv', modo)
    const req = fn(tx.objectStore('kv'))
    tx.oncomplete = () => { db.close(); res(req?.result) }
    tx.onerror = () => { db.close(); rej(tx.error) }
  })
}
export async function lerPasta() {
  if (!pastaSuportada) return null
  try { return (await idb('readonly', s => s.get('pasta'))) || null } catch { return null }
}
export async function escolherPasta() {
  const handle = await window.showDirectoryPicker({ id: 'backup-mercadao', mode: 'readwrite' })
  await idb('readwrite', s => s.put(handle, 'pasta'))
  return handle
}
export async function esquecerPasta() {
  try { await idb('readwrite', s => s.delete('pasta')) } catch { /* nada a fazer */ }
}

// Precisa ser chamado logo no clique (o navegador só pede permissão nessa hora).
async function pastaComPermissao() {
  const handle = await lerPasta()
  if (!handle) return null
  try {
    if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return handle
    if ((await handle.requestPermission({ mode: 'readwrite' })) === 'granted') return handle
  } catch { /* cai no download */ }
  return null
}

/* ── Montagem do arquivo ── */
function nomeArquivo(tipo) {
  const d = new Date()
  const hm = `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`
  return `backup-mercadao-${tipo}-${isoLocal(d)}-${hm}.zip`
}
const slug = t => String(t || 'sem-nome').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-zA-Z0-9._ -]/g, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'sem-nome'

function celula(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 32000)
  if (typeof v === 'string') return v.slice(0, 32000)
  return v
}
function montarPlanilha(dados) {
  const wb = XLSX.utils.book_new()
  for (const t of TABELAS_BACKUP) {
    const linhas = (dados[t.nome] || []).map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, celula(v)])))
    const ws = linhas.length ? XLSX.utils.json_to_sheet(linhas) : XLSX.utils.aoa_to_sheet([['(sem registros)']])
    XLSX.utils.book_append_sheet(wb, ws, t.rotulo.slice(0, 31))
  }
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
}

async function sha256(bytes) {
  const h = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('')
}
const fmtTamanho = n => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`

async function gerarBackup(tipo, { feitoPor, onProgresso }) {
  const criadoEm = new Date().toISOString()
  const dados = {}
  const erros = []

  for (const [i, t] of TABELAS_BACKUP.entries()) {
    onProgresso(`Copiando ${t.rotulo} (${i + 1} de ${TABELAS_BACKUP.length})…`)
    const chave = t.chave || 'id'
    const { data, error } = await buscarTodos(() => supabase.from(t.nome).select('*').order(chave, { ascending: true }))
    if (error) { erros.push(`${t.rotulo}: ${error.message}`); dados[t.nome] = data || []; continue }
    dados[t.nome] = (data || []).map(r => {
      if (!t.semColunas) return r
      const c = { ...r }; t.semColunas.forEach(k => delete c[k]); return c
    })
  }

  const arquivos = {}
  const anexos = []
  let bytesAnexos = 0
  if (tipo === 'completo') {
    const docs = dados.cobrancas_documentos || []
    const nomeDev = Object.fromEntries((dados.cobrancas_devedores || []).map(d => [d.id, d.nome_pagador]))
    const usados = new Set()
    for (const [i, doc] of docs.entries()) {
      onProgresso(`Baixando anexos (${i + 1} de ${docs.length})…`)
      const { data: blob, error } = await supabase.storage.from(BUCKET_ANEXOS).download(doc.caminho)
      if (error || !blob) { erros.push(`Anexo "${doc.nome_arquivo}": ${error?.message || 'não encontrado'}`); continue }
      const base = `anexos/${slug(nomeDev[doc.devedor_id])}/${slug(doc.nome_arquivo)}`
      let destino = base, n = 2
      while (usados.has(destino)) destino = base.replace(/(\.[^./]*)?$/, m => `_${n++}${m}`)
      usados.add(destino)
      const bytes = new Uint8Array(await blob.arrayBuffer())
      arquivos[destino] = [bytes, { level: 0 }]
      bytesAnexos += bytes.length
      anexos.push({ id: doc.id, caminho: doc.caminho, arquivo_no_zip: destino, tamanho: bytes.length })
    }
  }

  onProgresso('Montando o arquivo…')
  const conteudo = {
    formato: 'mercadao-dos-oculos-backup',
    versao: 1,
    tipo,
    criado_em: criadoEm,
    feito_por: feitoPor || null,
    tabelas: dados,
    anexos,
  }
  const json = strToU8(JSON.stringify(conteudo))
  const hash = await sha256(json)
  const qtd = Object.fromEntries(TABELAS_BACKUP.map(t => [t.nome, (dados[t.nome] || []).length]))

  const resumo = [
    'BACKUP - MERCADÃO DOS ÓCULOS',
    '============================',
    `Tipo:       ${TIPOS_BACKUP[tipo].rotulo} (${TIPOS_BACKUP[tipo].detalhe})`,
    `Feito em:   ${fmtDataHora(criadoEm)}`,
    `Feito por:  ${feitoPor || '-'}`,
    '',
    'O QUE TEM NESTE ARQUIVO',
    '  dados.json      -> cópia completa dos dados, usada pelo sistema para restaurar.',
    '  planilha.xlsx   -> os mesmos dados para consulta no Excel (uma aba por tabela).',
    tipo === 'completo' ? '  anexos/         -> documentos anexados na Cobrança, separados por devedor.' : '  (backup leve: os documentos anexados na Cobrança não estão incluídos)',
    '',
    'REGISTROS POR TABELA',
    ...TABELAS_BACKUP.map(t => `  ${t.rotulo.padEnd(26, '.')} ${String(qtd[t.nome]).padStart(7)}`),
    ...(tipo === 'completo' ? [`  ${'Anexos'.padEnd(26, '.')} ${String(anexos.length).padStart(7)}  (${fmtTamanho(bytesAnexos)})`] : []),
    '',
    erros.length ? 'ATENÇÃO - ITENS QUE NÃO PUDERAM SER COPIADOS' : 'Nenhum erro durante a cópia.',
    ...erros.map(e => `  - ${e}`),
    '',
    'CÓDIGO DE CONFERÊNCIA (SHA-256 do dados.json)',
    `  ${hash}`,
    '',
  ].join('\r\n')

  arquivos['dados.json'] = [json, { level: 6 }]
  arquivos['planilha.xlsx'] = [montarPlanilha(dados), { level: 0 }]
  arquivos['resumo.txt'] = [strToU8('﻿' + resumo), { level: 6 }]

  const zip = zipSync(arquivos)
  return { zip, nome: nomeArquivo(tipo), erros, qtd, anexos: anexos.length, criadoEm }
}

function baixar(bytes, nome) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }))
  const a = document.createElement('a')
  a.href = url; a.download = nome
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

// Faz o backup inteiro: copia, monta o .zip, salva na pasta (ou Downloads)
// e registra a data. Chamar direto no clique do botão.
export async function executarBackup(tipo, { feitoPor, onProgresso = () => {} }) {
  const pasta = await pastaComPermissao()
  const r = await gerarBackup(tipo, { feitoPor, onProgresso })

  onProgresso('Salvando…')
  let local = null
  if (pasta) {
    try {
      const fh = await pasta.getFileHandle(r.nome, { create: true })
      const w = await fh.createWritable()
      await w.write(r.zip)
      await w.close()
      local = `pasta "${pasta.name}"`
    } catch { local = null }
  }
  if (!local) { baixar(r.zip, r.nome); local = 'pasta Downloads' }

  let registrado = false
  if (r.erros.length === 0) {
    const { error } = await registrarBackup(tipo, { em: r.criadoEm, por: feitoPor || null, arquivo: r.nome })
    registrado = !error
    window.dispatchEvent(new Event('backup-atualizado'))
  }
  return { ...r, local, registrado, tamanho: r.zip.length, tamanhoTexto: fmtTamanho(r.zip.length) }
}
