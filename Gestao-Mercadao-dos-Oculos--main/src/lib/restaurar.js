import { unzipSync, strFromU8 } from 'fflate'
import { supabase } from './supabase'
import { buscarTodos } from './paginar'
import { TABELAS_BACKUP } from './backup'

const BUCKET_ANEXOS = 'cobrancas-documentos'
const LOTE = 500

/* ── Leitura do arquivo .zip ── */
async function sha256(bytes) {
  const h = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function lerArquivoBackup(file) {
  let arquivos
  try { arquivos = unzipSync(new Uint8Array(await file.arrayBuffer())) } catch {
    throw new Error('Este arquivo não é um .zip válido.')
  }
  if (!arquivos['dados.json']) throw new Error('Este .zip não é um backup do sistema (falta o dados.json).')
  let conteudo
  try { conteudo = JSON.parse(strFromU8(arquivos['dados.json'])) } catch {
    throw new Error('O dados.json deste backup está danificado.')
  }
  if (conteudo?.formato !== 'mercadao-dos-oculos-backup' || !conteudo.tabelas) {
    throw new Error('Este arquivo não é um backup do Mercadão dos Óculos.')
  }

  // Confere o código do resumo.txt com o dados.json.
  let integro = null
  if (arquivos['resumo.txt']) {
    const m = strFromU8(arquivos['resumo.txt']).match(/SHA-256[^\n]*\n\s*([0-9a-f]{64})/i)
    if (m) integro = m[1].toLowerCase() === await sha256(arquivos['dados.json'])
  }
  return { conteudo, arquivos, integro }
}

/* ── Prévia: compara o backup com o que está no sistema hoje ── */
function estavel(v) {
  if (Array.isArray(v)) return `[${v.map(estavel).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${estavel(v[k])}`).join(',')}}`
  return JSON.stringify(v ?? null)
}
// Compara só as colunas que existem no backup (colunas novas no sistema são ignoradas).
function igual(doBackup, atual) {
  return Object.keys(doBackup).every(k => estavel(doBackup[k]) === estavel(atual[k]))
}
const ehChaveDeBackup = r => String(r.chave || '').startsWith('backup_')

export async function prepararRestauracao(backup, onProgresso = () => {}) {
  const { conteudo } = backup
  const plano = []
  for (const [i, t] of TABELAS_BACKUP.entries()) {
    const chave = t.chave || 'id'
    const item = { ...t, chave, noBackup: 0, noSistema: 0, faltam: [], diferentes: [], sobrando: [], iguais: 0 }
    plano.push(item)

    if (t.nome === 'profiles') { item.pular = 'Usuários não são restaurados: são gerenciados em Configurações → Vendedores.'; continue }
    if (t.nome === 'cobrancas_documentos' && conteudo.tipo !== 'completo') {
      item.pular = 'Documentos só são restaurados a partir de um backup completo (com anexos).'; continue
    }
    if (!Array.isArray(conteudo.tabelas[t.nome])) { item.pular = 'Esta tabela não está no backup.'; continue }

    onProgresso(`Comparando ${t.rotulo} (${i + 1} de ${TABELAS_BACKUP.length})…`)
    let linhas = conteudo.tabelas[t.nome]
    if (t.nome === 'configuracoes') linhas = linhas.filter(r => !ehChaveDeBackup(r))
    item.noBackup = linhas.length

    const { data, error } = await buscarTodos(() => supabase.from(t.nome).select('*').order(chave, { ascending: true }))
    if (error) { item.erro = error.message; continue }
    let atuais = data || []
    if (t.nome === 'configuracoes') atuais = atuais.filter(r => !ehChaveDeBackup(r))
    item.noSistema = atuais.length

    const mapa = new Map(atuais.map(r => [String(r[chave]), r]))
    const noBackup = new Set()
    for (const r of linhas) {
      const k = String(r[chave])
      noBackup.add(k)
      const atual = mapa.get(k)
      if (!atual) item.faltam.push(r)
      else if (!igual(r, atual)) item.diferentes.push(r)
      else item.iguais++
    }
    item.sobrando = atuais.filter(r => !noBackup.has(String(r[chave]))).map(r => r[chave])
  }
  return plano
}

/* ── Execução ── */
function lotes(lista, n = LOTE) {
  const out = []
  for (let i = 0; i < lista.length; i += n) out.push(lista.slice(i, i + n))
  return out
}

// Grava em lotes; se um lote falhar, tenta registro por registro para salvar o máximo.
async function gravar(t, linhas, modo, falhas) {
  let ok = 0
  const enviar = rows => modo === 'inserir'
    ? supabase.from(t.nome).insert(rows)
    : supabase.from(t.nome).upsert(rows, { onConflict: t.chave })
  for (const lote of lotes(linhas)) {
    const { error } = await enviar(lote)
    if (!error) { ok += lote.length; continue }
    for (const r of lote) {
      const { error: e } = await enviar([r])
      if (e) falhas.push({ tabela: t.rotulo, chave: r[t.chave], motivo: e.message })
      else ok++
    }
  }
  return ok
}

async function apagar(t, chaves, falhas) {
  let ok = 0
  for (const lote of lotes(chaves, 200)) {
    const { error } = await supabase.from(t.nome).delete().in(t.chave, lote)
    if (!error) { ok += lote.length; continue }
    for (const k of lote) {
      const { error: e } = await supabase.from(t.nome).delete().eq(t.chave, k)
      if (e) falhas.push({ tabela: t.rotulo, chave: k, motivo: e.message })
      else ok++
    }
  }
  return ok
}

// modo 'faltantes': só traz de volta o que não existe mais (não mexe no resto).
// modo 'tudo': deixa como no backup (apaga o que foi criado depois e desfaz alterações).
export async function executarRestauracao(backup, plano, modo, onProgresso = () => {}) {
  const falhas = []
  const relatorio = Object.fromEntries(plano.map(t => [t.nome, { rotulo: t.rotulo, inseridos: 0, alterados: 0, apagados: 0 }]))
  const ativos = plano.filter(t => !t.pular && !t.erro)

  if (modo === 'tudo') {
    for (const t of [...ativos].reverse()) {
      if (!t.sobrando.length) continue
      onProgresso(`Apagando o que foi cadastrado depois do backup em ${t.rotulo}…`)
      relatorio[t.nome].apagados = await apagar(t, t.sobrando, falhas)
    }
  }

  for (const t of ativos) {
    if (t.faltam.length) {
      onProgresso(`Recuperando ${t.rotulo}…`)
      relatorio[t.nome].inseridos = await gravar(t, t.faltam, 'inserir', falhas)
    }
    if (modo === 'tudo' && t.diferentes.length) {
      onProgresso(`Voltando ${t.rotulo} como estava no backup…`)
      relatorio[t.nome].alterados = await gravar(t, t.diferentes, 'atualizar', falhas)
    }
  }

  // Arquivos dos documentos recuperados (só existe em backup completo).
  const docs = ativos.find(t => t.nome === 'cobrancas_documentos')
  let arquivos = 0
  if (docs?.faltam.length) {
    const noZip = Object.fromEntries((backup.conteudo.anexos || []).map(a => [a.id, a.arquivo_no_zip]))
    for (const [i, d] of docs.faltam.entries()) {
      onProgresso(`Enviando anexos (${i + 1} de ${docs.faltam.length})…`)
      const bytes = backup.arquivos[noZip[d.id]]
      if (!bytes) { falhas.push({ tabela: 'Anexos', chave: d.nome_arquivo, motivo: 'arquivo não está no backup' }); continue }
      const { error } = await supabase.storage.from(BUCKET_ANEXOS)
        .upload(d.caminho, new Blob([bytes], { type: d.tipo || 'application/octet-stream' }), { upsert: true, contentType: d.tipo || undefined })
      if (error) falhas.push({ tabela: 'Anexos', chave: d.nome_arquivo, motivo: error.message })
      else arquivos++
    }
  }

  return { relatorio: Object.values(relatorio), falhas, arquivos }
}
