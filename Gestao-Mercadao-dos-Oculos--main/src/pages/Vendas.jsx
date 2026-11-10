import { useState, useEffect, useCallback, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { buscarTodos } from '../lib/paginar'
import { useAuth } from '../contexts/AuthContext'
import { C, F, card as dsCard, inputCss, btnPrimary, btnSecondary } from '../lib/ds'
import { logErro } from '../lib/erros'

/* ── helpers ── */
function fBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}
function fDateBR(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
function firstOfMonthISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function num(v) { return parseFloat(String(v ?? '').replace(',', '.')) || 0 }

// Lista de especialistas salva em Configurações (JSON; aceita texto com vírgulas).
function lerListaEspecialistas(valor) {
  if (!valor) return []
  try {
    const l = JSON.parse(valor)
    if (Array.isArray(l)) return l.map(x => String(x).trim()).filter(Boolean)
  } catch { /* formato antigo */ }
  return String(valor).split(',').map(x => x.trim()).filter(Boolean)
}

// Campo com lista de sugestões dos especialistas cadastrados em Configurações.
// Ao clicar, mostra todos; ao digitar, filtra (sem diferenciar acentos/maiúsculas).
function semAcento(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') }
function CampoEspecialista({ value, opcoes, onChange }) {
  const [aberto, setAberto] = useState(false)
  const termo = semAcento(value)
  const filtradas = opcoes.filter(n => !termo || semAcento(n).includes(termo))
  const lista = filtradas.length ? filtradas : opcoes
  return (
    <div style={{ position: 'relative' }}>
      <input style={inputCss} autoComplete="off"
        placeholder={opcoes.length ? 'Opcional — clique para escolher' : 'Opcional'}
        value={value}
        onFocus={() => setAberto(true)}
        onClick={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onKeyDown={e => { if (e.key === 'Escape') setAberto(false) }}
        onChange={e => { onChange(e.target.value); setAberto(true) }} />
      {aberto && lista.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, marginTop: '2px',
          background: C.surfaceContainerLowest, border: `1.5px solid ${C.borderSubtle}`,
          borderRadius: '0.375rem', boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
          maxHeight: '220px', overflowY: 'auto',
        }}>
          {lista.map(n => (
            <div key={n}
              onMouseDown={e => { e.preventDefault(); onChange(n); setAberto(false) }}
              style={{
                padding: '0.5rem 0.75rem', cursor: 'pointer', fontFamily: F.body, fontSize: '0.875rem',
                color: C.onSurface, background: n === value ? C.surfaceContainerLow : 'transparent',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = C.surfaceContainerLow }}
              onMouseLeave={e => { e.currentTarget.style.background = n === value ? C.surfaceContainerLow : 'transparent' }}>
              {n}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Tipos de venda "de grau" usam o Número da Venda (sequência automática).
// Vale para "Grau" (dados antigos) e "Óculos de Grau" (novo padrão).
function usaNumeroVenda(tipo) {
  return String(tipo || '').toLowerCase().includes('grau')
}

// Lista padrão de tipos de venda, usada enquanto as configurações não carregam.
const TIPOS_VENDA_PADRAO = ['Óculos de Grau', 'Solar']
function round2(x) { return Math.round(x * 100) / 100 }

// Soma "meses" mantendo o mesmo dia (27/09 → 27/10). Se o mês destino não
// tiver aquele dia (ex.: 31), usa o último dia do mês.
function addMesesISO(iso, meses) {
  const base = iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : todayISO()
  const [y, m, d] = base.split('-').map(Number)
  const dt = new Date(y, (m - 1) + meses, d)
  if (dt.getDate() !== d) dt.setDate(0) // estourou o mês → último dia do mês pretendido
  const pad = x => String(x).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

// Calcula os valores das parcelas. Acima do nº de parcelas sem juros,
// aplica juros compostos (tabela Price) sobre o valor final.
function valoresParcelas(qtd, valorFinal, semJuros, jurosPct) {
  const i = (parseFloat(jurosPct) || 0) / 100
  const aplica = qtd > (parseInt(semJuros) || 0) && i > 0
  if (aplica && valorFinal > 0) {
    const pmt = round2(valorFinal * i / (1 - Math.pow(1 + i, -qtd)))
    const total = round2(pmt * qtd)
    const arr = Array(qtd).fill(pmt)
    arr[qtd - 1] = round2(total - pmt * (qtd - 1))
    return { valores: arr, comJuros: true, total }
  }
  const base = Math.floor((valorFinal / qtd) * 100) / 100
  const arr = []
  let acc = 0
  for (let k = 0; k < qtd; k++) {
    const v = k === qtd - 1 ? round2(valorFinal - acc) : base
    acc += v; arr.push(v)
  }
  return { valores: arr, comJuros: false, total: round2(valorFinal) }
}

// Tabela de juros do Boleto MultiCredito por nº de parcelas (% total sobre o valor).
const MC_PARCELAS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const MC_TABELA_PADRAO = { 2: 5.05, 3: 6.77, 4: 8.51, 5: 10.27, 6: 12.05, 7: 13.84, 8: 15.65, 9: 17.48, 10: 19.33, 11: 21.20, 12: 23.09 }

// Calcula as parcelas do MultiCredito: aplica o % da tabela para aquele nº de
// parcelas sobre o valor financiado e divide igualmente (última absorve centavos).
function valoresParcelasMC(qtd, valorBase, tabela) {
  const q = Math.max(1, Math.min(parseInt(qtd) || 1, 36))
  const pct = parseFloat(String((tabela || {})[q] ?? '').toString().replace(',', '.')) || 0
  if (q >= 2 && pct > 0 && valorBase > 0) {
    const total = round2(valorBase * (1 + pct / 100))
    const base = Math.floor((total / q) * 100) / 100
    const arr = []
    let acc = 0
    for (let k = 0; k < q; k++) { const v = k === q - 1 ? round2(total - acc) : base; acc += v; arr.push(v) }
    return { valores: arr, comJuros: true, total }
  }
  // sem juros na tabela → divide o próprio valor
  const base = Math.floor((valorBase / q) * 100) / 100
  const arr = []
  let acc = 0
  for (let k = 0; k < q; k++) { const v = k === q - 1 ? round2(valorBase - acc) : base; acc += v; arr.push(v) }
  return { valores: arr, comJuros: false, total: round2(valorBase) }
}

// Gera as parcelas (nº, data mensal a partir da data base, valor).
function gerarParcelas(qtd, valorFinal, dataBase, semJuros, jurosPct) {
  const q = Math.max(1, Math.min(parseInt(qtd) || 1, 36))
  const { valores } = valoresParcelas(q, valorFinal, semJuros, jurosPct)
  return valores.map((v, k) => ({ n: k + 1, data: addMesesISO(dataBase, k), valor: v.toFixed(2) }))
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

const Label = ({ children }) => (
  <label style={{
    display: 'block', fontSize: '0.8rem', fontWeight: '600', fontFamily: F.body,
    color: C.onSurfaceVariant, marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.5px',
  }}>{children}</label>
)

// Modalidades de pagamento. As que NÃO são "crediário" (sem entrada)
// pedem a forma da entrada/à vista: Pix ou Dinheiro.
const MODALIDADES_PAGAMENTO = [
  { v: 'avista',              label: 'À vista',                    temEntrada: true },
  { v: 'cartao_credito',      label: 'Cartão Crédito',             temEntrada: false },
  { v: 'cartao_debito',       label: 'Cartão Débito',              temEntrada: false },
  { v: 'cartao',              label: 'Entrada + Cartão',           temEntrada: true },
  { v: 'boleto',              label: 'Entrada + Boleto',           temEntrada: true },
  { v: 'boleto_multicredito', label: 'Entrada + Boleto MultiCredito', temEntrada: true },
  { v: 'crediario_entrada',   label: 'Entrada + Crediário',        temEntrada: true },
  { v: 'boleto_multicredito_sem', label: 'Boleto MultiCredito (sem entrada)', temEntrada: false },
  { v: 'crediario',           label: 'Crediário (sem entrada)',    temEntrada: false },
]
// Modalidades com prestações (boletos/crediário). Só controle da venda —
// a aba Cobrança recebe apenas o que vem do arquivo do banco.
const MODS_PRESTACAO      = ['boleto', 'boleto_multicredito', 'boleto_multicredito_sem', 'crediario_entrada', 'crediario']
// Modalidades cuja entrada entra como 1ª parcela (o restante vira prestações).
const MODS_ENTRADA_PARCELA = ['boleto', 'boleto_multicredito', 'crediario_entrada']
// Modalidades que têm campo "Valor da entrada".
const MODS_ENTRADA_VALOR  = ['cartao', 'boleto', 'boleto_multicredito', 'crediario_entrada']
// Cartão de crédito pode ser parcelado (na operadora). O nº de parcelas é só
// informativo.
const MODS_CARTAO_PARCELAS = ['cartao_credito', 'cartao']
function ehMultiCreditoMod(m) { return m === 'boleto_multicredito' || m === 'boleto_multicredito_sem' }
function modalidadeTemEntrada(v) {
  const m = MODALIDADES_PAGAMENTO.find(x => x.v === v)
  return m ? m.temEntrada : false
}
// Monta o texto que fica salvo em forma_pagamento (aparece nas listas e relatórios).
// O nº de parcelas do cartão aparece via "(N×)" na lista, então não é repetido aqui.
function textoFormaPagamento(modalidade, entrada) {
  switch (modalidade) {
    case 'avista':            return entrada ? `À vista (${entrada})` : 'À vista'
    case 'cartao_credito':    return 'Cartão Crédito'
    case 'cartao_debito':     return 'Cartão Débito'
    case 'cartao':            return entrada ? `${entrada} + Cartão` : 'Cartão'
    case 'boleto':            return entrada ? `${entrada} + Boleto` : 'Boleto'
    case 'boleto_multicredito': return entrada ? `${entrada} + Boleto MultiCredito` : 'Boleto MultiCredito'
    case 'boleto_multicredito_sem': return 'Boleto MultiCredito'
    case 'crediario_entrada': return entrada ? `${entrada} + Crediário` : 'Crediário'
    case 'crediario':         return 'Crediário'
    default:                  return ''
  }
}

const FORM_INIT = {
  tipo_venda: 'Grau',
  os_numero: '',
  nota_fiscal: '',
  nome_cliente: '',
  especialista: '',
  pagador: '',
  data_venda: todayISO(),
  vendedor_id: '',
  filial_id: '',
  valor_bruto: '',
  desconto: '0',
  tarifa: '0',
  valor_final: '',
  pagamento_modalidade: '',
  pagamento_entrada: '',
  entrada_valor: '',
  valor_financiado: '',
  _finManual: false,
  forma_pagamento: '',
  num_parcelas: 1,
  parcelas: [],
  efetivada: true,
  motivo_nao_efetivada: '',
}

/* ── FormVenda ── */
function FormVenda({ form, onChange, onFilialChange, onTipoVendaChange, vendedores, filiais, formasPagamento, tiposVenda, especialistas, parcelasSemJuros, jurosPercent, tabelaMC, isAdmin, onSubmit, onCancel, saving, editando }) {
  // Opções do tipo de venda: as configuradas + o valor atual (para não perder
  // o tipo de vendas antigas que não estejam mais na lista).
  const tiposOpcoes = Array.from(new Set([...(tiposVenda || []), form.tipo_venda].filter(Boolean)))
  // Modalidades com prestações (boletos/crediário) — só controle da venda.
  const mod = form.pagamento_modalidade
  const temPrestacoes = MODS_PRESTACAO.includes(mod)
  // Modalidades que têm valor de entrada (à vista é pago integral; crediário puro não tem entrada).
  const temEntradaValor = MODS_ENTRADA_VALOR.includes(mod)
  // A entrada entra como 1ª parcela só em boleto/crediário (no cartão o restante vai no cartão).
  const usaEntradaParcela = MODS_ENTRADA_PARCELA.includes(mod)
  // Cartão de crédito pode ser parcelado (informativo).
  const temParcelasCartao = MODS_CARTAO_PARCELAS.includes(mod)
  // Boleto MultiCredito usa a TABELA de juros por parcela (configurada à parte).
  const ehMultiCredito = m => m === 'boleto_multicredito' || m === 'boleto_multicredito_sem'
  // Calcula as parcelas do restante conforme a modalidade (tabela MC ou juros geral).
  const calcInfo = (m, N, restante) => ehMultiCredito(m)
    ? valoresParcelasMC(N, restante, tabelaMC)
    : valoresParcelas(N, restante, parcelasSemJuros, jurosPercent)

  // Valor Financiado do MultiCredito: sugestão = Valor Final (menos a entrada,
  // quando houver). Se o usuário digitar, vale o valor digitado.
  function sugestaoFinanciado(f, finalV) {
    const entr = MODS_ENTRADA_PARCELA.includes(f.pagamento_modalidade) ? num(f.entrada_valor) : 0
    return Math.max(0, round2(finalV - entr))
  }
  function valorFinanciadoDe(f, finalV) {
    return f._finManual && f.valor_financiado !== '' ? Math.max(0, num(f.valor_financiado)) : sugestaoFinanciado(f, finalV)
  }

  // Monta as parcelas: entrada (se houver) como 1ª, e o RESTANTE (valor − entrada)
  // dividido em N prestações — com juros conforme a modalidade.
  function calcParcelas(f, finalV) {
    const m = f.pagamento_modalidade
    const gera = MODS_PRESTACAO.includes(m)
    if (!gera) return []
    const comEntrada = MODS_ENTRADA_PARCELA.includes(m) && num(f.entrada_valor) > 0
    const entrada = comEntrada ? num(f.entrada_valor) : 0
    const N = Math.max(1, Math.min(parseInt(f.num_parcelas) || 1, 36))
    // MultiCredito: divide o VALOR FINANCIADO (informado ou sugerido).
    const restante = ehMultiCredito(m) ? valorFinanciadoDe(f, finalV) : Math.max(0, round2(finalV - entrada))
    const info = calcInfo(m, N, restante)
    const base = f.data_venda || todayISO()
    const off = comEntrada ? 1 : 0
    const arr = []
    if (comEntrada) arr.push({ n: 1, data: base, valor: entrada.toFixed(2) })
    info.valores.forEach((v, k) => arr.push({ n: off + k + 1, data: addMesesISO(base, off + k), valor: v.toFixed(2) }))
    return arr
  }

  function handleBrutoDesc(field, val) {
    const next = { ...form, [field]: val }
    const b = parseFloat(String(next.valor_bruto).replace(',', '.')) || 0
    const d = parseFloat(String(next.desconto).replace(',', '.')) || 0
    next.valor_final = Math.max(0, b - d).toFixed(2)
    next.parcelas = calcParcelas(next, num(next.valor_final) + num(next.tarifa))
    onChange(next)
  }

  const bruto = num(form.valor_bruto)
  const desc = num(form.desconto)
  const final = num(form.valor_final)
  const tarifa = num(form.tarifa)
  // Base do parcelamento = valor da venda (+ tarifa só em vendas antigas que já tinham;
  // o campo Tarifa foi retirado da tela).
  const baseParc = round2(final + tarifa)
  const isGrau = usaNumeroVenda(form.tipo_venda)

  const entradaVal = usaEntradaParcela ? num(form.entrada_valor) : 0
  const restanteVal = ehMultiCredito(mod) ? valorFinanciadoDe(form, baseParc) : Math.max(0, round2(baseParc - entradaVal))
  const nPrest = Math.max(1, Math.min(parseInt(form.num_parcelas) || 1, 36))
  const parcelas = form.parcelas || []
  const somaParc = parcelas.reduce((s, p) => s + num(p.valor), 0)
  const infoJuros = temPrestacoes ? calcInfo(mod, nPrest, restanteVal) : { valores: [], comJuros: false, total: 0 }
  const comJuros = infoJuros.comJuros
  const totalParcelado = entradaVal + infoJuros.total
  const parcelasOk = !temPrestacoes || parcelas.length === 0 || Math.abs(somaParc - totalParcelado) < 0.05

  function mudarNumParcelas(raw) {
    const nn = raw === '' ? '' : Math.max(1, Math.min(parseInt(raw) || 1, 36))
    const f = { ...form, num_parcelas: nn }
    onChange({ ...f, parcelas: calcParcelas(f, baseParc) })
  }
  function mudarFinanciado(val) {
    const f = { ...form, valor_financiado: val, _finManual: val !== '' }
    onChange({ ...f, parcelas: calcParcelas(f, baseParc) })
  }
  function usarSugestaoFinanciado() {
    const f = { ...form, valor_financiado: '', _finManual: false }
    onChange({ ...f, parcelas: calcParcelas(f, baseParc) })
  }
  function mudarEntradaValor(val) {
    const f = { ...form, entrada_valor: val }
    onChange({ ...f, parcelas: calcParcelas(f, baseParc) })
  }
  // Parcelas no cartão de crédito: só atualiza o texto da forma de pagamento (sem cobrança).
  function mudarParcelasCartao(raw) {
    const nn = raw === '' ? '' : Math.max(1, Math.min(parseInt(raw) || 1, 36))
    onChange({ ...form, num_parcelas: nn,
      forma_pagamento: textoFormaPagamento(form.pagamento_modalidade, form.pagamento_entrada, nn) })
  }
  function redividir() {
    onChange({ ...form, parcelas: calcParcelas(form, baseParc) })
  }
  function updateParcela(i, campo, valor) {
    // Ao mudar a data de uma parcela, recalcula as datas seguintes (mensal).
    if (campo === 'data') {
      onChange({ ...form, parcelas: parcelas.map((p, idx) => idx < i ? p : { ...p, data: addMesesISO(valor, idx - i) }) })
      return
    }
    onChange({ ...form, parcelas: parcelas.map((p, idx) => idx === i ? { ...p, [campo]: valor } : p) })
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>

        {/* Tipo de Venda */}
        <div>
          <Label>Tipo de Venda</Label>
          <select style={inputCss}
            value={form.tipo_venda}
            onChange={e => onTipoVendaChange(e.target.value)}>
            {tiposOpcoes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* Número da Venda — somente para Grau */}
        {isGrau && (
          <div>
            <Label>Nº Venda</Label>
            <input style={inputCss} inputMode="numeric" placeholder="Número da venda"
              value={form.os_numero}
              onChange={e => onChange({ ...form, os_numero: e.target.value })} />
          </div>
        )}

        {/* Nota Fiscal */}
        <div>
          <Label>Nota Fiscal</Label>
          <input style={inputCss} placeholder="Opcional"
            value={form.nota_fiscal}
            onChange={e => onChange({ ...form, nota_fiscal: e.target.value })} />
        </div>

        {/* Nome do Cliente */}
        <div>
          <Label>Nome do Cliente</Label>
          <input style={inputCss} placeholder="Opcional"
            value={form.nome_cliente}
            onChange={e => {
              const novo = e.target.value
              // O pagador acompanha o cliente enquanto não for editado à mão.
              const espelha = !form.pagador || form.pagador === form.nome_cliente
              onChange({ ...form, nome_cliente: novo, pagador: espelha ? novo : form.pagador })
            }} />
        </div>

        {/* Especialista que atendeu no exame de vista (opcional) */}
        <div>
          <Label>Especialista (exame de vista)</Label>
          <CampoEspecialista
            value={form.especialista || ''}
            opcoes={especialistas || []}
            onChange={val => onChange({ ...form, especialista: val })} />
        </div>

        {/* Data */}
        <div>
          <Label>Data</Label>
          <input type="date" style={inputCss} required
            value={form.data_venda}
            onChange={e => onChange({ ...form, data_venda: e.target.value })} />
        </div>

        {/* Filial */}
        {isAdmin ? (
          <div>
            <Label>Filial</Label>
            <select style={inputCss}
              value={form.filial_id}
              onChange={e => onFilialChange(e.target.value)}>
              <option value="">Sem filial</option>
              {filiais.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
        ) : filiais.length > 1 && (
          <div>
            <Label>Filial</Label>
            <input style={{ ...inputCss, background: C.surfaceContainerLow, color: C.onSurfaceVariant, cursor: 'default' }}
              value={filiais.find(f => f.id === form.filial_id)?.nome || '—'}
              readOnly />
          </div>
        )}

        {/* Vendedor — qualquer usuário pode lançar para outro vendedor */}
        <div>
          <Label>Vendedor</Label>
          <select style={inputCss} required
            value={form.vendedor_id}
            onChange={e => onChange({ ...form, vendedor_id: e.target.value })}>
            <option value="">Selecione...</option>
            {vendedores.map(v => (
              <option key={v.id} value={v.id}>{v.nome}</option>
            ))}
          </select>
        </div>

        {/* Valor Bruto */}
        <div>
          <Label>Valor Bruto (R$)</Label>
          <input style={inputCss} type="number" min="0.01" step="0.01" required placeholder="0,00"
            value={form.valor_bruto}
            onChange={e => handleBrutoDesc('valor_bruto', e.target.value)} />
        </div>

        {/* Desconto */}
        <div>
          <Label>Desconto (R$)</Label>
          <input style={inputCss} type="number" min="0" step="0.01" placeholder="0,00"
            value={form.desconto}
            onChange={e => handleBrutoDesc('desconto', e.target.value)} />
          {desc > bruto && bruto > 0 && (
            <span style={{ color: C.error, fontSize: '0.78rem', fontFamily: F.body }}>Desconto maior que o valor bruto</span>
          )}
        </div>

        {/* Valor Final */}
        <div>
          <Label>Valor Final (R$)</Label>
          <input style={inputCss} type="number" min="0" step="0.01" required placeholder="0,00"
            value={form.valor_final}
            onChange={e => { const f = { ...form, valor_final: e.target.value }; onChange({ ...f, parcelas: calcParcelas(f, num(e.target.value) + num(form.tarifa)) }) }} />
        </div>

        {/* Pagador (pode ser diferente do cliente comprador) */}
        <div>
          <Label>Pagador</Label>
          <input style={inputCss} placeholder="Quem paga a venda"
            value={form.pagador}
            onChange={e => onChange({ ...form, pagador: e.target.value })} />
        </div>

        {/* Forma de Pagamento — modalidade */}
        <div>
          <Label>Forma de Pagamento</Label>
          <select style={inputCss} required
            value={form.pagamento_modalidade}
            onChange={e => {
              const novaMod = e.target.value
              const entrada = modalidadeTemEntrada(novaMod) ? (form.pagamento_entrada || '') : ''
              const f = { ...form, pagamento_modalidade: novaMod, pagamento_entrada: entrada,
                forma_pagamento: textoFormaPagamento(novaMod, entrada, form.num_parcelas) }
              onChange({ ...f, parcelas: calcParcelas(f, baseParc) })
            }}>
            <option value="">Selecione...</option>
            {MODALIDADES_PAGAMENTO.map(m => (
              <option key={m.v} value={m.v}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* Entrada / à vista: Pix ou Dinheiro */}
        {modalidadeTemEntrada(form.pagamento_modalidade) && (
          <div>
            <Label>{form.pagamento_modalidade === 'avista' ? 'Pago em' : 'Entrada em'}</Label>
            <select style={inputCss} required
              value={form.pagamento_entrada}
              onChange={e => {
                const entrada = e.target.value
                onChange({ ...form, pagamento_entrada: entrada,
                  forma_pagamento: textoFormaPagamento(form.pagamento_modalidade, entrada, form.num_parcelas) })
              }}>
              <option value="">Selecione...</option>
              <option value="Pix">Pix</option>
              <option value="Dinheiro">Dinheiro</option>
              <option value="Cartão Débito">Cartão Débito</option>
              <option value="Cartão Crédito">Cartão Crédito</option>
            </select>
          </div>
        )}

        {/* Valor da entrada (antes do nº de parcelas) */}
        {temEntradaValor && (
          <div>
            <Label>Valor da entrada (R$)</Label>
            <input style={inputCss} type="number" min="0" step="0.01" placeholder="0,00"
              value={form.entrada_valor}
              onChange={e => mudarEntradaValor(e.target.value)} />
          </div>
        )}

        {/* Valor Financiado — só MultiCredito (antes do nº de parcelas) */}
        {ehMultiCredito(mod) && (
          <div>
            <Label>Valor Financiado (R$)</Label>
            <input style={inputCss} type="number" min="0" step="0.01" placeholder="0,00"
              value={form._finManual ? form.valor_financiado : sugestaoFinanciado(form, baseParc).toFixed(2)}
              onFocus={e => e.target.select()}
              onChange={e => mudarFinanciado(e.target.value)} />
            <span style={{ fontSize: '0.75rem', color: C.onSurfaceVariant, fontFamily: F.body }}>
              {form._finManual
                ? <>Informado manualmente · <button type="button" onClick={usarSugestaoFinanciado}
                    style={{ background: 'none', border: 'none', padding: 0, color: C.primaryContainer, cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600', textDecoration: 'underline' }}>
                    usar sugestão ({fBRL(sugestaoFinanciado(form, baseParc))})</button></>
                : (usaEntradaParcela && entradaVal > 0 ? 'Sugestão: Valor Final menos a entrada' : 'Sugestão: Valor Final')}
            </span>
          </div>
        )}

        {/* Número de prestações (divide o restante) */}
        {temPrestacoes && (
          <div>
            <Label>{usaEntradaParcela ? 'Nº de prestações (fora a entrada)' : 'Número de parcelas'}</Label>
            <input style={inputCss} type="number" min="1" max="36" step="1"
              value={form.num_parcelas}
              onFocus={e => e.target.select()}
              onChange={e => mudarNumParcelas(e.target.value)}
              onBlur={() => { if (form.num_parcelas === '' || parseInt(form.num_parcelas) < 1) mudarNumParcelas('1') }} />
            {restanteVal > 0 && (
              <span style={{ fontSize: '0.75rem', color: comJuros ? C.statusWarning : C.onSurfaceVariant, fontFamily: F.body }}>
                {nPrest}× de {fBRL(infoJuros.total / nPrest)} sobre {ehMultiCredito(mod) ? 'o valor financiado' : 'o restante'} {fBRL(restanteVal)}
                {comJuros ? ` (com juros — restante parcelado ${fBRL(infoJuros.total)})` : ' sem juros'}
              </span>
            )}
          </div>
        )}

        {/* Número de parcelas do cartão de crédito (informativo, sem cobrança) */}
        {temParcelasCartao && (
          <div>
            <Label>Parcelas no cartão</Label>
            <input style={inputCss} type="number" min="1" max="36" step="1"
              value={form.num_parcelas}
              onFocus={e => e.target.select()}
              onChange={e => mudarParcelasCartao(e.target.value)}
              onBlur={() => { if (form.num_parcelas === '' || parseInt(form.num_parcelas) < 1) mudarParcelasCartao('1') }} />
            {(() => {
              // Entrada + Cartão: o cartão parcela só o que sobra depois da entrada.
              const entradaCartao = temEntradaValor ? Math.min(Math.max(num(form.entrada_valor), 0), final) : 0
              const noCartao = Math.max(0, round2(final - entradaCartao))
              const nCart = parseInt(form.num_parcelas) || 1
              return noCartao > 0 && nCart >= 2 && (
                <span style={{ fontSize: '0.75rem', color: C.onSurfaceVariant, fontFamily: F.body }}>
                  {nCart}× de {fBRL(noCartao / nCart)} no cartão
                  {entradaCartao > 0 && ` (restante ${fBRL(noCartao)}, após a entrada de ${fBRL(entradaCartao)})`}
                </span>
              )
            })()}
          </div>
        )}
      </div>

      {/* Bloco de Parcelas */}
      {temPrestacoes && parcelas.length > 0 && (
        <div style={{ background: C.surfaceContainerLow, border: `1.5px solid ${C.outlineVariant}`, borderRadius: '0.75rem', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: '700', fontFamily: F.body, color: C.onSurface, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {usaEntradaParcela ? `Entrada + ${nPrest} prestação(ões)` : `Parcelas (${parcelas.length}×)`}
            </div>
            <button type="button" onClick={redividir}
              style={{ padding: '0.3rem 0.7rem', fontSize: '0.78rem', fontFamily: F.body, fontWeight: '600', borderRadius: '0.5rem', border: `1.5px solid ${C.borderSubtle}`, background: C.surfaceContainerLowest, color: C.onSurfaceVariant, cursor: 'pointer' }}>
              ↺ Recalcular
            </button>
          </div>

          <div style={{ fontSize: '0.75rem', color: C.onSurfaceVariant, fontFamily: F.body }}>
            Dica: mude o <strong>valor da entrada</strong> ou o <strong>nº de prestações</strong> acima e o sistema divide o restante automaticamente.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {parcelas.map((p, i) => {
              const ehEntrada = usaEntradaParcela && i === 0
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 1fr', gap: '0.5rem', alignItems: 'center' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: '700', fontFamily: F.body, color: ehEntrada ? C.statusDanger : C.onSurfaceVariant }}>
                    {ehEntrada ? 'Entrada' : `${usaEntradaParcela ? i : p.n}ª prestação`}
                  </div>
                  <input type="date" style={{ ...inputCss, padding: '0.4rem 0.6rem' }}
                    value={p.data || ''} onChange={e => updateParcela(i, 'data', e.target.value)} />
                  <input type="number" min="0" step="0.01" placeholder="0,00" style={{ ...inputCss, padding: '0.4rem 0.6rem', fontFamily: F.mono }}
                    value={p.valor} onChange={e => updateParcela(i, 'valor', e.target.value)} />
                </div>
              )
            })}
          </div>

          {comJuros && (
            <div style={{ color: C.statusWarning, fontFamily: F.body, fontSize: '0.78rem', fontWeight: '600' }}>
              {ehMultiCredito(mod)
                ? `Juros da tabela MultiCredito (${nPrest}×) sobre o restante ${fBRL(restanteVal)} · total parcelado ${fBRL(totalParcelado)}`
                : `Juros aplicados (acima de ${parcelasSemJuros}× sem juros) sobre o restante ${fBRL(restanteVal)} · total parcelado ${fBRL(totalParcelado)}`}
            </div>
          )}
          {parcelasOk ? (
            <div style={{ color: C.statusSuccess, fontFamily: F.body, fontSize: '0.82rem', fontWeight: '600' }}>
              ✓ Soma ({fBRL(somaParc)}) confere com {usaEntradaParcela ? 'entrada + prestações' : 'o total'} ({fBRL(totalParcelado)})
            </div>
          ) : (
            <div style={{ color: C.error, fontFamily: F.body, fontSize: '0.82rem', fontWeight: '600' }}>
              ⚠ Soma das parcelas ({fBRL(somaParc)}) deve ser igual a {fBRL(totalParcelado)}
            </div>
          )}
        </div>
      )}

      {/* Venda não efetivada */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox"
            checked={!form.efetivada}
            onChange={e => onChange({ ...form, efetivada: !e.target.checked, motivo_nao_efetivada: e.target.checked ? form.motivo_nao_efetivada : '' })}
            style={{ width: '1rem', height: '1rem', accentColor: C.statusDanger }} />
          <span style={{ fontSize: '0.88rem', fontFamily: F.body, fontWeight: '600', color: C.statusDanger }}>Venda não efetivada</span>
        </label>
        {!form.efetivada && (
          <div>
            <Label>Motivo (obrigatório)</Label>
            <textarea style={{ ...inputCss, minHeight: '80px', resize: 'vertical' }} required={!form.efetivada}
              placeholder="Descreva o motivo da venda não ter sido efetivada..."
              value={form.motivo_nao_efetivada}
              onChange={e => onChange({ ...form, motivo_nao_efetivada: e.target.value })} />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '0.5rem' }}>
        <button type="button" style={btnSecondary} onClick={onCancel}>Cancelar</button>
        <button type="submit" style={btnPrimary} disabled={saving}>
          {saving ? 'Salvando...' : (editando ? 'Atualizar Venda' : 'Registrar Venda')}
        </button>
      </div>
    </form>
  )
}

/* ── componente principal ── */
export default function Vendas() {
  const { profile, isAdmin } = useAuth()
  const [viewMode, setViewMode] = useState('dia') // 'dia' | 'periodo'
  const [dataSel, setDataSel] = useState(todayISO())
  const [periodoInicio, setPeriodoInicio] = useState(firstOfMonthISO())
  const [periodoFim, setPeriodoFim] = useState(todayISO())
  const [vendas, setVendas] = useState([])
  const [diasComVendas, setDiasComVendas] = useState([])
  const [loading, setLoading] = useState(true)
  const [formasPagamento, setFormasPagamento] = useState([])
  const [parcelasSemJuros, setParcelasSemJuros] = useState(0)
  const [jurosPercent, setJurosPercent] = useState(0)
  const [tabelaMC, setTabelaMC] = useState({ ...MC_TABELA_PADRAO })
  const [tiposVenda, setTiposVenda] = useState(TIPOS_VENDA_PADRAO)
  const [especialistas, setEspecialistas] = useState([])
  const [vendedores, setVendedores] = useState([])
  const [filiais, setFiliais] = useState([])
  const [filtroFilial, setFiltroFilial] = useState('')
  const [buscaCliente, setBuscaCliente] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(FORM_INIT)
  const [editId, setEditId] = useState(null)
  const [editVersao, setEditVersao] = useState(null) // 'atualizado_em' ao abrir a edição
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [expandedId, setExpandedId] = useState(null) // venda com detalhes abertos
  const [obsMap, setObsMap] = useState({})   // { vendaId: [observações] }
  const [obsInput, setObsInput] = useState('')
  const [obsSaving, setObsSaving] = useState(false)

  function showToast(msg, tipo = 'ok') {
    setToast({ msg, tipo })
    setTimeout(() => setToast(null), 3500)
  }

  /* carrega configurações, vendedores e filiais (uma vez) */
  useEffect(() => {
    async function init() {
      const [{ data: cfgRows }, vendsRes, { data: fils }] = await Promise.all([
        supabase.from('configuracoes').select('*'),
        supabase.from('vendedores_lista').select('id, nome, ativo').order('nome'),
        supabase.from('filiais').select('*').order('nome'),
      ])
      // Fallback caso a view ainda não exista (SQL não rodado).
      let vends = vendsRes.data
      if (vendsRes.error) {
        const r = await supabase.from('profiles').select('id, nome, ativo').order('nome')
        vends = r.data
      }
      if (cfgRows) {
        const map = Object.fromEntries(cfgRows.map(r => [r.chave, r.valor]))
        setFormasPagamento((map.formas_pagamento || '').split(',').filter(Boolean))
        setParcelasSemJuros(parseInt(map.parcelas_sem_juros) || 0)
        setJurosPercent(parseFloat(String(map.juros_parcela_percent).replace(',', '.')) || 0)
        if (map.juros_multicredito_tabela) {
          try {
            const t = JSON.parse(map.juros_multicredito_tabela)
            if (t && typeof t === 'object') setTabelaMC(prev => ({ ...prev, ...t }))
          } catch { /* mantém o padrão */ }
        }
        const tipos = (map.tipos_venda || '').split(',').map(t => t.trim()).filter(Boolean)
        if (tipos.length) setTiposVenda(tipos)
        setEspecialistas(lerListaEspecialistas(map.especialistas))
      }
      if (vends) setVendedores(vends)
      if (fils) setFiliais(fils)
    }
    init()
  }, [])

  /* dias com movimento no mês da data selecionada (somente modo dia) */
  const carregarDias = useCallback(async () => {
    if (viewMode !== 'dia') return
    const mes = dataSel.slice(0, 7)
    const montar = () => { let q = supabase
      .from('vendas')
      .select('data_venda')
      .gte('data_venda', `${mes}-01`)
      .lte('data_venda', `${mes}-31`)
    if (filtroFilial) q = q.eq('filial_id', filtroFilial)
    else if (!isAdmin) q = q.eq('filial_id', profile?.filial_id || '')
    return q }
    const { data } = await buscarTodos(montar, { ordenarPorId: true })
    if (data) {
      const unique = [...new Set(data.map(r => r.data_venda))].sort()
      setDiasComVendas(unique)
    }
  }, [dataSel, filtroFilial, isAdmin, profile?.id, viewMode])

  /* vendas do dia ou período selecionado */
  const carregarVendas = useCallback(async () => {
    setLoading(true)
    const montar = () => { let q = supabase.from('vendas').select('*')

    if (viewMode === 'dia') {
      q = q.eq('data_venda', dataSel)
        .order('data_venda', { ascending: false })
        .order('os_numero', { nullsLast: true })
    } else {
      // Período: ordena pelo Nº da Venda em ordem crescente.
      q = q.gte('data_venda', periodoInicio).lte('data_venda', periodoFim)
        .order('os_numero', { ascending: true, nullsFirst: false })
    }

    if (filtroFilial) q = q.eq('filial_id', filtroFilial)
    else if (!isAdmin) q = q.eq('filial_id', profile?.filial_id || '')
    return q }
    const { data, error } = await buscarTodos(montar, { ordenarPorId: true })
    if (!error && data) setVendas(data)
    setLoading(false)
  }, [dataSel, periodoInicio, periodoFim, viewMode, filtroFilial, isAdmin, profile?.id])

  useEffect(() => {
    carregarDias()
    carregarVendas()
  }, [carregarDias, carregarVendas])

  /* recalcula O.S. ao trocar filial no formulário (somente venda nova de Grau) */
  async function handleFilialChange(newFilialId) {
    const nextOs = usaNumeroVenda(form.tipo_venda) ? await getProximoOs(newFilialId) : ''
    setForm(f => ({ ...f, filial_id: newFilialId, os_numero: nextOs }))
  }

  /* recalcula O.S. ao trocar tipo de venda */
  async function handleTipoVendaChange(novoTipo) {
    if (usaNumeroVenda(novoTipo)) {
      const nextOs = await getProximoOs(form.filial_id)
      setForm(f => ({ ...f, tipo_venda: novoTipo, os_numero: nextOs }))
    } else {
      setForm(f => ({ ...f, tipo_venda: novoTipo, os_numero: '' }))
    }
  }

  /* próximo Nº da Venda por filial — só quando a filial segue sequência automática */
  async function getProximoOs(filialId) {
    if (!filialId) return ''
    const [{ data: fil }, { data: maxRow }] = await Promise.all([
      supabase.from('filiais').select('os_numero_inicial, sequencia_vendas').eq('id', filialId).maybeSingle(),
      supabase.from('vendas').select('os_numero').eq('filial_id', filialId)
        .not('os_numero', 'is', null).order('os_numero', { ascending: false }).limit(1).maybeSingle(),
    ])
    if (fil && fil.sequencia_vendas === false) return '' // numeração manual → deixa em branco
    const inicial = fil?.os_numero_inicial || 1
    if (maxRow) return Math.max(maxRow.os_numero + 1, inicial)
    return inicial
  }

  // Busca a lista atual de especialistas (pega cadastros feitos depois de abrir a tela).
  async function carregarEspecialistas() {
    const { data, error } = await supabase.from('configuracoes').select('valor').eq('chave', 'especialistas').maybeSingle()
    if (error) { logErro('Carregar especialistas', error); return }
    setEspecialistas(lerListaEspecialistas(data?.valor))
  }

  async function abrirNovaVenda() {
    carregarEspecialistas()
    const filialId = profile?.filial_id || (filiais.length === 1 ? filiais[0].id : '')
    const tipoInicial = tiposVenda[0] || 'Óculos de Grau'
    const proximo = usaNumeroVenda(tipoInicial) ? await getProximoOs(filialId) : ''
    setForm({
      ...FORM_INIT,
      tipo_venda: tipoInicial,
      os_numero: proximo,
      data_venda: viewMode === 'dia' ? dataSel : todayISO(),
      vendedor_id: profile?.id || '',
      filial_id: filialId,
    })
    setEditId(null)
    setEditVersao(null)
    setShowForm(true)
  }

  function abrirEdicao(v) {
    carregarEspecialistas()
    setForm({
      tipo_venda: v.tipo_venda || 'Grau',
      os_numero: v.os_numero || '',
      nota_fiscal: v.nota_fiscal || '',
      nome_cliente: v.nome_cliente || '',
      especialista: v.especialista || '',
      _espAntes: v.especialista || '',
      pagador: v.pagador || v.nome_cliente || '',
      data_venda: v.data_venda,
      vendedor_id: v.vendedor_id,
      filial_id: v.filial_id || '',
      valor_bruto: v.valor_bruto,
      desconto: v.desconto || 0,
      tarifa: v.tarifa != null ? String(v.tarifa) : '0',
      valor_final: v.valor_final,
      pagamento_modalidade: v.pagamento_modalidade || '',
      pagamento_entrada: v.pagamento_entrada || '',
      entrada_valor: v.entrada_valor != null ? String(v.entrada_valor) : '',
      valor_financiado: v.valor_financiado != null ? String(v.valor_financiado) : '',
      _finManual: v.valor_financiado != null,
      forma_pagamento: v.forma_pagamento,
      ...carregarEdicaoParcelas(v),
      efetivada: v.efetivada !== false,
      motivo_nao_efetivada: v.motivo_nao_efetivada || '',
    })
    setEditId(v.id)
    setEditVersao(v.atualizado_em || null)
    setShowForm(true)
  }

  // Para edição: separa a entrada das prestações. O nº de parcelas mostrado
  // é a quantidade de PRESTAÇÕES (fora a entrada), quando há entrada.
  function carregarEdicaoParcelas(v) {
    const base = carregarParcelas(v)
    const parcs = base.parcelas
    const usaEntr = MODS_ENTRADA_PARCELA.includes(v.pagamento_modalidade) && (v.entrada_valor || 0) > 0
    const nPrest = usaEntr ? Math.max(1, parcs.length - 1) : (parcs.length || base.num_parcelas || 1)
    return { num_parcelas: nPrest, parcelas: parcs }
  }

  // Monta num_parcelas/parcelas a partir da venda (converte entrada/saldo antigos).
  function carregarParcelas(v) {
    if (Array.isArray(v.parcelas) && v.parcelas.length) {
      return {
        num_parcelas: v.num_parcelas || v.parcelas.length,
        parcelas: v.parcelas.map(p => ({ n: p.n, data: p.data || '', valor: p.valor != null ? String(p.valor) : '' })),
      }
    }
    if (v.entrada_valor != null || v.saldo_valor != null) {
      return {
        num_parcelas: 2,
        parcelas: [
          { n: 1, data: v.data_venda || '', valor: v.entrada_valor != null ? String(v.entrada_valor) : '' },
          { n: 2, data: '', valor: v.saldo_valor != null ? String(v.saldo_valor) : '' },
        ],
      }
    }
    return { num_parcelas: v.num_parcelas || 1, parcelas: [] }
  }

  async function salvar(e) {
    e.preventDefault()
    const bruto = parseFloat(String(form.valor_bruto).replace(',', '.')) || 0
    const desc = parseFloat(String(form.desconto).replace(',', '.')) || 0
    const final = parseFloat(String(form.valor_final).replace(',', '.')) || 0
    if (bruto <= 0) return showToast('Valor Bruto deve ser maior que zero.', 'err')
    if (desc > bruto) return showToast('Desconto não pode ser maior que o Valor Bruto.', 'err')
    if (usaNumeroVenda(form.tipo_venda) && !form.os_numero) {
      return showToast('Número da Venda é obrigatório para este tipo de venda.', 'err')
    }

    if (!form.efetivada && !form.motivo_nao_efetivada?.trim()) {
      return showToast('Informe o motivo da venda não efetivada.', 'err')
    }

    if (!form.pagamento_modalidade) {
      return showToast('Selecione a forma de pagamento.', 'err')
    }
    if (modalidadeTemEntrada(form.pagamento_modalidade) && !form.pagamento_entrada) {
      return showToast('Selecione se a entrada / o à vista é em Pix ou Dinheiro.', 'err')
    }

    const modSel = form.pagamento_modalidade
    const geraPrest = MODS_PRESTACAO.includes(modSel)
    const temEntradaValorSel = MODS_ENTRADA_VALOR.includes(modSel)
    const temParcelasCartaoSel = MODS_CARTAO_PARCELAS.includes(modSel)
    let parcelasPayload = null
    let numParcelasSalvar = 1
    if (geraPrest) {
      const parc = (form.parcelas || []).map(p => ({ n: p.n, data: p.data || null, valor: num(p.valor) }))
      if (!parc.length) return showToast('Defina o número de prestações.', 'err')
      if (parc.some(p => !p.data)) return showToast('Preencha a data de todas as parcelas.', 'err')
      parcelasPayload = parc
      numParcelasSalvar = parc.length
    } else if (temParcelasCartaoSel) {
      // Parcelas no cartão: guardamos a quantidade (informativo), sem boletos.
      numParcelasSalvar = Math.max(1, parseInt(form.num_parcelas) || 1)
    }

    setSaving(true)
    const payload = {
      tipo_venda: form.tipo_venda || 'Óculos de Grau',
      os_numero: usaNumeroVenda(form.tipo_venda) ? (parseInt(form.os_numero) || null) : null,
      nota_fiscal: form.nota_fiscal || null,
      nome_cliente: form.nome_cliente || null,
      pagador: (form.pagador || form.nome_cliente || '').trim() || null,
      data_venda: form.data_venda,
      vendedor_id: form.vendedor_id,
      filial_id: form.filial_id || null,
      valor_bruto: bruto,
      desconto: desc,
      tarifa: num(form.tarifa) || 0,
      valor_final: final,
      pagamento_modalidade: form.pagamento_modalidade || null,
      pagamento_entrada: modalidadeTemEntrada(form.pagamento_modalidade) ? (form.pagamento_entrada || null) : null,
      forma_pagamento: form.forma_pagamento || textoFormaPagamento(form.pagamento_modalidade, form.pagamento_entrada, numParcelasSalvar),
      num_parcelas: numParcelasSalvar,
      parcelas: parcelasPayload,
      entrada_valor: temEntradaValorSel && num(form.entrada_valor) > 0 ? num(form.entrada_valor) : null,
      valor_financiado: ehMultiCreditoMod(modSel)
        ? (form._finManual && form.valor_financiado !== ''
            ? Math.max(0, num(form.valor_financiado))
            : Math.max(0, round2(final + num(form.tarifa) - (MODS_ENTRADA_PARCELA.includes(modSel) ? num(form.entrada_valor) : 0))))
        : null,
      entrada_forma: temEntradaValorSel ? (form.pagamento_entrada || null) : null,
      saldo_valor: null,
      saldo_forma: null,
      efetivada: form.efetivada !== false,
      motivo_nao_efetivada: !form.efetivada ? (form.motivo_nao_efetivada || null) : null,
    }
    // Especialista do exame de vista (opcional). Só envia quando preenchido
    // ou quando a venda já tinha um (para permitir apagar).
    const esp = (form.especialista || '').trim().replace(/\s+/g, ' ')
    if (esp || (editId && form._espAntes)) payload.especialista = esp || null

    let error
    let vendaId = editId
    let numeroAjustado = null
    if (editId) {
      // Só grava se ninguém alterou a venda desde que a edição foi aberta.
      let q = supabase.from('vendas').update(payload).eq('id', editId)
      if (editVersao) q = q.eq('atualizado_em', editVersao)
      const { data: upd, error: eUp } = await q.select('id')
      error = eUp
      if (!eUp && editVersao && (!upd || upd.length === 0)) {
        setSaving(false)
        return showToast('Esta venda foi alterada por outra pessoa enquanto você editava. Feche, recarregue a lista e edite de novo — assim a alteração dela não se perde.', 'err')
      }
    } else {
      const { data: ins, error: eIns } = await supabase.from('vendas').insert(payload).select('id, os_numero').single()
      error = eIns
      vendaId = ins?.id
      // O banco pode ter dado outro número se este acabou de ser usado por outra venda.
      if (ins && payload.os_numero && ins.os_numero !== payload.os_numero) numeroAjustado = ins.os_numero
    }

    setSaving(false)
    if (error) {
      if (error.code === '23505') {
        showToast('Já existe uma venda com este Nº da Venda nesta filial. Confira o número e tente de novo.', 'err')
      } else {
        showToast('Erro ao salvar: ' + error.message, 'err')
      }
    } else {
      showToast(numeroAjustado
        ? `Venda registrada com o Nº ${numeroAjustado} (o Nº ${payload.os_numero} acabou de ser usado por outra venda).`
        : (editId ? 'Venda atualizada!' : 'Venda registrada!'))

      if (form.nome_cliente?.trim()) {
        const n = form.nome_cliente.trim()
        const filialCliente = form.filial_id || profile?.filial_id || null
        const { data: exist } = await supabase.from('clientes').select('id').ilike('nome', n).limit(1)
        if (!exist?.length) {
          const { error: errCli } = await supabase.from('clientes').insert({ nome: n, filial_id: filialCliente })
          if (errCli) {
            logErro('Sincronizar cliente da venda', errCli)
            showToast('Venda registrada. (O cliente não foi adicionado ao cadastro de Clientes.)', 'ok')
          }
        }
      }
      // Refaz a conferência "Boleto emitido" (o pagador pode ter mudado).
      if (geraPrest) {
        const { error: eConf } = await supabase.rpc('atualizar_boletos_emitidos_vendas')
        if (eConf) logErro('Conferir boleto emitido da venda', eConf)
      }
      setShowForm(false)
      carregarVendas()
      carregarDias()
    }
  }

  async function excluir(id) {
    if (!window.confirm('Confirma exclusão desta venda?')) return
    const { error } = await supabase.from('vendas').delete().eq('id', id)
    if (error) {
      showToast('Erro ao excluir: ' + error.message, 'err')
    } else {
      showToast('Venda excluída.')
      carregarVendas()
      carregarDias()
    }
  }

  async function toggleConferido(v) {
    const novoValor = !v.conferido
    const payload = {
      conferido: novoValor,
      conferido_em: novoValor ? new Date().toISOString() : null,
    }
    setVendas(prev => prev.map(x => x.id === v.id ? { ...x, ...payload } : x))
    const { data: upd, error } = await supabase.from('vendas').update(payload).eq('id', v.id).select()
    if (error) {
      showToast('Erro ao atualizar conferido: ' + error.message, 'err')
      setVendas(prev => prev.map(x => x.id === v.id ? { ...x, conferido: v.conferido, conferido_em: v.conferido_em } : x))
    } else if (upd?.[0]?.atualizado_em) {
      // Mantém a "versão" local em dia (evita falso aviso de edição simultânea).
      setVendas(prev => prev.map(x => x.id === v.id ? { ...x, atualizado_em: upd[0].atualizado_em } : x))
    }
  }

  // Carrega as observações da venda quando o detalhamento é aberto.
  useEffect(() => {
    if (!expandedId) return
    setObsInput('')
    let cancel = false
    ;(async () => {
      const { data } = await supabase.from('vendas_observacoes')
        .select('id, texto, autor_nome, created_at')
        .eq('venda_id', expandedId)
        .order('created_at', { ascending: false })
      if (!cancel) setObsMap(prev => ({ ...prev, [expandedId]: data || [] }))
    })()
    return () => { cancel = true }
  }, [expandedId])

  async function adicionarObservacao(v) {
    const texto = obsInput.trim()
    if (!texto) return
    setObsSaving(true)
    const { error } = await supabase.from('vendas_observacoes').insert({
      venda_id:   v.id,
      texto,
      autor_id:   profile?.id || null,
      autor_nome: profile?.nome || null,
      filial_id:  v.filial_id || profile?.filial_id || null,
    })
    setObsSaving(false)
    if (error) {
      logErro('Salvar observação da venda', error)
      showToast('Erro ao salvar observação: ' + error.message, 'err')
      return
    }
    setObsInput('')
    const { data } = await supabase.from('vendas_observacoes')
      .select('id, texto, autor_nome, created_at')
      .eq('venda_id', v.id)
      .order('created_at', { ascending: false })
    setObsMap(prev => ({ ...prev, [v.id]: data || [] }))
  }

  function podeAlterar(v) {
    // Depois de conferida, só o administrador pode alterar a venda.
    if (v.conferido && !isAdmin) return false
    return isAdmin || v.filial_id === profile?.filial_id
  }

  /* totais apenas das vendas efetivadas */
  const termoBusca = buscaCliente.trim().toLowerCase()
  const vendasVisiveis = termoBusca
    ? vendas.filter(v => (v.nome_cliente || '').toLowerCase().includes(termoBusca))
    : vendas
  const vendasEfetivadas = vendasVisiveis.filter(v => v.efetivada !== false)
  const totBruto = vendasEfetivadas.reduce((s, v) => s + (v.valor_bruto || 0), 0)
  const totDesc = vendasEfetivadas.reduce((s, v) => s + (v.desconto || 0), 0)
  const totFinal = vendasEfetivadas.reduce((s, v) => s + (v.valor_final || 0), 0)
  const vendedorMap = Object.fromEntries(vendedores.map(v => [v.id, v.nome]))
  // Só vendedores ativos podem receber NOVAS vendas.
  const vendedoresAtivos = vendedores.filter(v => v.ativo)
  const filialMap = Object.fromEntries(filiais.map(f => [f.id, f.nome]))

  function navegarDia(delta) {
    const d = new Date(dataSel + 'T12:00:00')
    d.setDate(d.getDate() + delta)
    setDataSel(d.toISOString().slice(0, 10))
  }

  const hoje = todayISO()

  const tituloTabela = viewMode === 'dia'
    ? fDateBR(dataSel)
    : `${fDateBR(periodoInicio)} a ${fDateBR(periodoFim)}`

  const colsFixas = 6 + (filiais.length > 1 ? 1 : 0) + (isAdmin ? 1 : 0)

  /* ── imprimir relatório de vendas conforme o filtro atual ── */
  function imprimirVendas() {
    if (!vendas.length) return
    const mostrarFilial = filiais.length > 1
    const periodoTxt = viewMode === 'dia'
      ? `Dia ${fDateBR(dataSel)}`
      : `Período de ${fDateBR(periodoInicio)} a ${fDateBR(periodoFim)}`
    const filialTxt = filtroFilial && filialMap[filtroFilial] ? ` · Filial: ${filialMap[filtroFilial]}` : ''

    const linhas = vendas.map(v => {
      const pag = v.num_parcelas >= 2 ? `${v.forma_pagamento || '—'} (${v.num_parcelas}×)` : (v.forma_pagamento || '—')
      const naoEf = v.efetivada === false
      return `
      <tr${naoEf ? ' class="ne"' : ''}>
        <td class="n">${v.os_numero != null ? v.os_numero : '—'}</td>
        <td>${escHtml(v.tipo_venda || 'Grau')}</td>
        <td>${fDateBR(v.data_venda)}</td>
        <td>${escHtml(v.nome_cliente || '—')}</td>
        <td>${escHtml(vendedorMap[v.vendedor_id] || '—')}</td>
        ${mostrarFilial ? `<td>${escHtml(filialMap[v.filial_id] || '—')}</td>` : ''}
        <td class="v">${fBRL(v.valor_final)}</td>
        <td>${escHtml(pag)}</td>
        <td>${naoEf ? 'Não efetivada' : 'OK'}</td>
      </tr>`
    }).join('')

    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Relatório de Vendas</title>
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
  td.n,th.n,td.v,th.v{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  tr.ne td{color:#999;text-decoration:line-through}
  tfoot td{border-top:2px solid #9d0518;font-weight:700;background:#faf4f4}
  .foot{margin-top:16px;font-size:10px;color:#999;text-align:center}
  @media print{body{margin:0}}
</style></head><body>
  <div class="hd">
    <h1>Mercadão dos Óculos — Relatório de Vendas</h1>
    <div class="sub">Emitido em ${fDateBR(hoje)}</div>
  </div>
  <div class="meta">
    <div><b>${escHtml(periodoTxt)}</b>${escHtml(filialTxt)}</div>
    <div><b>${vendas.length}</b> venda(s)</div>
  </div>
  <table>
    <thead>
      <tr>
        <th class="n">Nº Venda</th><th>Tipo</th><th>Data</th><th>Cliente</th><th>Vendedor</th>
        ${mostrarFilial ? '<th>Filial</th>' : ''}
        <th class="v">Valor Final</th><th>Pagamento</th><th>Situação</th>
      </tr>
    </thead>
    <tbody>${linhas}</tbody>
    <tfoot>
      <tr>
        <td colspan="${mostrarFilial ? 6 : 5}">TOTAL EFETIVADO — ${vendasEfetivadas.length} venda(s)</td>
        <td class="v">${fBRL(totFinal)}</td>
        <td colspan="2"></td>
      </tr>
    </tfoot>
  </table>
  <div class="foot">Relatório gerado pelo sistema de gestão Mercadão dos Óculos</div>
  <script>window.onload=function(){window.print()}</script>
</body></html>`

    const w = window.open('', '_blank')
    if (!w) { showToast('Habilite pop-ups para imprimir o relatório.', 'err'); return }
    w.document.write(html)
    w.document.close()
  }

  return (
    <div className="pg">
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '1.25rem', right: '1.25rem', zIndex: 9999,
          padding: '0.75rem 1.25rem', borderRadius: '0.5rem', fontSize: '0.875rem',
          fontFamily: F.body, fontWeight: '600', color: '#fff',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          background: toast.tipo === 'err' ? C.statusDanger : C.statusSuccess,
          maxWidth: '320px',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Slide-over backdrop */}
      {showForm && (
        <div
          onClick={() => setShowForm(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 199,
            backdropFilter: 'blur(2px)',
          }}
        />
      )}

      {/* Slide-over panel */}
      {showForm && (
        <div style={{
          position: 'fixed', top: 0, right: 0,
          height: '100%',
          width: 'min(640px, 100vw)',
          zIndex: 200,
          background: C.surfaceContainerLowest,
          boxShadow: '-4px 0 32px rgba(0,0,0,0.18)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Panel header */}
          <div style={{
            padding: '1rem 1.5rem',
            borderBottom: `1px solid ${C.borderSubtle}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            background: C.surfaceContainerLowest,
          }}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontFamily: F.headline, fontWeight: '700', color: C.onSurface }}>
              {editId ? 'Editar Venda' : 'Nova Venda'}
            </h2>
            <button
              onClick={() => setShowForm(false)}
              aria-label="Fechar"
              style={{
                background: C.surfaceContainerHigh,
                border: 'none',
                borderRadius: '0.375rem',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: C.onSurfaceVariant,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>close</span>
            </button>
          </div>
          {/* Panel body (scrollable) */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
            <FormVenda
              form={form}
              onChange={setForm}
              onFilialChange={handleFilialChange}
              onTipoVendaChange={handleTipoVendaChange}
              vendedores={vendedoresAtivos}
              filiais={filiais}
              formasPagamento={formasPagamento}
              tiposVenda={tiposVenda}
              especialistas={especialistas}
              parcelasSemJuros={parcelasSemJuros}
              jurosPercent={jurosPercent}
              tabelaMC={tabelaMC}
              isAdmin={isAdmin}
              onSubmit={salvar}
              onCancel={() => setShowForm(false)}
              saving={saving}
              editando={!!editId}
            />
          </div>
        </div>
      )}

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: '800', fontFamily: F.headline, color: C.onSurface, margin: 0, letterSpacing: '-0.3px' }}>
          Vendas Diárias
        </h1>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button style={btnSecondary} onClick={imprimirVendas} disabled={loading || vendas.length === 0}
            title="Imprimir o relatório conforme o filtro atual">
            🖨️ Imprimir
          </button>
          <button style={btnPrimary} onClick={abrirNovaVenda}>
            + Nova Venda
          </button>
        </div>
      </div>

      {/* Filtro de filial (admin + múltiplas filiais) */}
      {isAdmin && filiais.length > 1 && (
        <div style={{ ...dsCard, marginBottom: '1rem', padding: '1rem 1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div>
              <Label>Filial</Label>
              <select style={{ ...inputCss, width: 'auto', minWidth: '160px' }}
                value={filtroFilial}
                onChange={e => setFiltroFilial(e.target.value)}>
                <option value="">Todas</option>
                {filiais.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Seletor de Data / Período */}
      <div style={{ ...dsCard, marginBottom: '1rem' }}>
        {/* Toggle modo */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.875rem' }}>
          {['dia', 'periodo'].map(m => (
            <button key={m} onClick={() => setViewMode(m)}
              style={{
                padding: '0.35rem 0.9rem', borderRadius: '2rem', border: 'none',
                fontSize: '0.8rem', fontFamily: F.body, fontWeight: '700', cursor: 'pointer',
                background: viewMode === m ? C.primaryContainer : C.surfaceContainerHigh,
                color: viewMode === m ? '#fff' : C.onSurfaceVariant,
              }}>
              {m === 'dia' ? 'Por dia' : 'Por período'}
            </button>
          ))}
        </div>

        {viewMode === 'dia' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button onClick={() => navegarDia(-1)}
                style={{ ...btnSecondary, padding: '0.5rem 0.875rem', fontSize: '1.1rem' }}
                title="Dia anterior">‹</button>

              <input type="date" value={dataSel}
                onChange={e => setDataSel(e.target.value)}
                style={{ ...inputCss, width: 'auto', minWidth: '145px' }} />

              <button onClick={() => navegarDia(1)}
                style={{ ...btnSecondary, padding: '0.5rem 0.875rem', fontSize: '1.1rem' }}
                title="Próximo dia">›</button>

              <button onClick={() => setDataSel(hoje)}
                style={{
                  ...btnSecondary, padding: '0.5rem 0.875rem',
                  background: dataSel === hoje ? C.primaryContainer : C.surfaceContainerHigh,
                  color: dataSel === hoje ? '#fff' : C.onSurfaceVariant,
                  border: dataSel === hoje ? 'none' : `1.5px solid ${C.secondary}`,
                }}>
                Hoje
              </button>
            </div>

            {/* Pills — dias com movimento */}
            {diasComVendas.length > 0 && (
              <div style={{ marginTop: '0.875rem' }}>
                <div style={{ fontSize: '0.75rem', color: C.onSurfaceVariant, fontFamily: F.body, fontWeight: '600', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Dias com movimento
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '4px' }}>
                  {diasComVendas.map(d => (
                    <button key={d} onClick={() => setDataSel(d)}
                      style={{
                        flexShrink: 0, padding: '0.3rem 0.7rem', borderRadius: '2rem',
                        border: 'none', fontSize: '0.8rem', fontFamily: F.body, fontWeight: '600', cursor: 'pointer',
                        background: d === dataSel ? C.primaryContainer : C.surfaceContainerHigh,
                        color: d === dataSel ? '#fff' : C.onSurfaceVariant,
                      }}>
                      {fDateBR(d)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div>
              <Label>Data inicial</Label>
              <input type="date" value={periodoInicio}
                onChange={e => setPeriodoInicio(e.target.value)}
                style={{ ...inputCss, width: 'auto', minWidth: '145px' }} />
            </div>
            <div>
              <Label>Data final</Label>
              <input type="date" value={periodoFim}
                onChange={e => setPeriodoFim(e.target.value)}
                style={{ ...inputCss, width: 'auto', minWidth: '145px' }} />
            </div>
            <button style={btnPrimary} onClick={carregarVendas}>Filtrar</button>
          </div>
        )}
      </div>

      {/* Tabela */}
      <div style={{ ...dsCard }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ fontWeight: '700', fontFamily: F.headline, color: C.onSurface, fontSize: '0.95rem' }}>
            {tituloTabela}
            {vendasVisiveis.length > 0 && (
              <span style={{ marginLeft: '0.5rem', color: C.onSurfaceVariant, fontFamily: F.body, fontWeight: '400', fontSize: '0.85rem' }}>
                — {vendasVisiveis.length} venda{vendasVisiveis.length !== 1 ? 's' : ''}
                {vendasVisiveis.some(v => v.efetivada === false) && (
                  <span style={{ color: C.statusDanger }}>
                    {' '}({vendasVisiveis.filter(v => v.efetivada === false).length} não efetivada{vendasVisiveis.filter(v => v.efetivada === false).length !== 1 ? 's' : ''})
                  </span>
                )}
              </span>
            )}
          </div>
          {/* Busca por nome do cliente */}
          <input
            type="text"
            value={buscaCliente}
            onChange={e => setBuscaCliente(e.target.value)}
            placeholder="🔍 Buscar por cliente..."
            style={{ ...inputCss, width: 'auto', minWidth: '220px', maxWidth: '100%' }} />
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', color: C.onSurfaceVariant, fontFamily: F.body, padding: '2.5rem 0' }}>Carregando...</div>
        ) : vendasVisiveis.length === 0 ? (
          <div style={{ textAlign: 'center', color: C.onSurfaceVariant, fontFamily: F.body, padding: '3rem 0' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{termoBusca ? '🔍' : '📋'}</div>
            {termoBusca ? (
              <>
                <div style={{ fontWeight: '600' }}>Nenhuma venda para "{buscaCliente.trim()}"</div>
                <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>Tente outro nome ou limpe a busca.</div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: '600' }}>Nenhuma venda {viewMode === 'dia' ? 'neste dia' : 'neste período'}</div>
                <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>Clique em "+ Nova Venda" para registrar</div>
              </>
            )}
          </div>
        ) : (
          <div className="tabela-vendas-rolagem" style={{ overflow: 'auto', maxHeight: 'max(320px, calc(100vh - 230px))' }}>
            {/* Cabeçalho e totais fixos: a barra de rolagem lateral fica sempre visível na tela. */}
            <style>{`
              .tabela-vendas-rolagem thead th { position: sticky; top: 0; z-index: 2; background: ${C.tableHeader}; box-shadow: inset 0 -1.5px 0 ${C.borderSubtle}; }
              .tabela-vendas-rolagem tfoot td { position: sticky; bottom: 0; z-index: 2; background: ${C.tableHeader}; box-shadow: inset 0 2px 0 ${C.borderSubtle}; }
            `}</style>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: C.tableHeader, borderBottom: `1.5px solid ${C.borderSubtle}` }}>
                  {[
                    'Tipo', 'Nº Venda', 'N. Fiscal', 'Cliente', 'Data', 'Vendedor',
                    ...(filiais.length > 1 ? ['Filial'] : []),
                    ...(isAdmin ? ['Conf.'] : []),
                    'Valor Bruto', 'Desconto', 'Valor Final', 'Pagamento', 'Ações',
                  ].map(h => (
                    <th key={h} style={{
                      padding: '0.6rem 0.75rem', textAlign: 'left', fontSize: '0.7rem',
                      fontFamily: F.body, fontWeight: '600', color: C.onSurfaceVariant,
                      textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vendasVisiveis.map(v => {
                  const naoEfetivada = v.efetivada === false
                  const aberto = expandedId === v.id
                  return (
                    <Fragment key={v.id}>
                    <tr
                      onClick={() => setExpandedId(aberto ? null : v.id)}
                      title={aberto ? 'Clique para recolher' : 'Clique para ver os detalhes'}
                      style={{ borderBottom: `1px solid ${C.borderSubtle}`, opacity: naoEfetivada ? 0.55 : 1, cursor: 'pointer', background: aberto ? C.surfaceContainerLow : 'transparent' }}
                      onMouseEnter={e => e.currentTarget.style.background = C.surfaceContainerLow}
                      onMouseLeave={e => e.currentTarget.style.background = aberto ? C.surfaceContainerLow : 'transparent'}>
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{ color: C.onSurfaceVariant, fontSize: '0.7rem', transition: 'transform 0.2s', transform: aberto ? 'rotate(90deg)' : 'none', display: 'inline-block' }}>▸</span>
                          <span style={{
                            background: String(v.tipo_venda).toLowerCase().includes('solar') ? C.statusWarningBg : C.statusInfoBg,
                            color: String(v.tipo_venda).toLowerCase().includes('solar') ? C.statusWarning : C.statusInfo,
                            borderRadius: '0.375rem', padding: '0.2rem 0.55rem',
                            fontSize: '0.75rem', fontFamily: F.body, fontWeight: '600', display: 'inline-block',
                          }}>{v.tipo_venda || 'Grau'}</span>
                          </span>
                          {naoEfetivada && (
                            <span style={{
                              background: C.statusDangerBg, color: C.statusDanger,
                              borderRadius: '0.375rem', padding: '0.15rem 0.45rem',
                              fontSize: '0.7rem', fontFamily: F.body, fontWeight: '700', display: 'inline-block',
                            }}>Não efetivada</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', fontFamily: F.mono, fontWeight: '700', color: C.statusInfo }}>
                        {v.os_numero ? `#${v.os_numero}` : '—'}
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', fontFamily: F.body, color: C.onSurfaceVariant }}>{v.nota_fiscal || '—'}</td>
                      <td style={{ padding: '0.65rem 0.75rem', fontFamily: F.body, color: C.onSurfaceVariant }}>{v.nome_cliente || '—'}</td>
                      <td style={{ padding: '0.65rem 0.75rem', fontFamily: F.body, color: C.onSurfaceVariant, whiteSpace: 'nowrap' }}>{fDateBR(v.data_venda)}</td>
                      <td style={{ padding: '0.65rem 0.75rem', fontFamily: F.body, color: C.onSurfaceVariant }}>{vendedorMap[v.vendedor_id] || '—'}</td>
                      {filiais.length > 1 && (
                        <td style={{ padding: '0.65rem 0.75rem', fontFamily: F.body, color: C.onSurfaceVariant, fontSize: '0.82rem' }}>
                          {filialMap[v.filial_id] || '—'}
                        </td>
                      )}
                      {isAdmin && (
                        <td style={{ padding: '0.65rem 0.75rem' }}>
                          <button
                            onClick={e => { e.stopPropagation(); toggleConferido(v) }}
                            title={v.conferido ? `Conferido em ${v.conferido_em ? new Date(v.conferido_em).toLocaleString('pt-BR') : ''}` : 'Marcar como conferido'}
                            style={{
                              width: '2rem', height: '2rem', borderRadius: '0.375rem', border: 'none',
                              fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: v.conferido ? C.statusSuccessBg : C.surfaceContainerHigh,
                              color: v.conferido ? C.statusSuccess : C.onSurfaceVariant,
                            }}>
                            {v.conferido ? '✓' : '○'}
                          </button>
                        </td>
                      )}
                      <td style={{ padding: '0.65rem 0.75rem', fontFamily: F.mono, color: C.onSurface, whiteSpace: 'nowrap' }}>{fBRL(v.valor_bruto)}</td>
                      <td style={{ padding: '0.65rem 0.75rem', fontFamily: F.mono, color: v.desconto > 0 ? C.statusDanger : C.onSurfaceVariant, whiteSpace: 'nowrap' }}>
                        {v.desconto > 0 ? `- ${fBRL(v.desconto)}` : '—'}
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', fontFamily: F.mono, fontWeight: '700', color: naoEfetivada ? C.onSurfaceVariant : C.statusSuccess, whiteSpace: 'nowrap' }}>
                        {fBRL(v.valor_final)}
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', fontFamily: F.body, color: C.onSurfaceVariant }}>
                        {v.num_parcelas >= 2 ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                            <span style={{ background: C.surfaceContainerHigh, borderRadius: '0.375rem', padding: '0.2rem 0.55rem', fontSize: '0.78rem', fontWeight: '600' }}>{v.forma_pagamento || '—'}</span>
                            <span style={{ background: C.statusInfoBg, color: C.statusInfo, borderRadius: '0.375rem', padding: '0.2rem 0.5rem', fontSize: '0.73rem', fontWeight: '700' }}>{v.num_parcelas}×</span>
                          </div>
                        ) : v.forma_pagamento === 'Entrada e Saldo' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            <span style={{ background: C.statusDangerBg, borderRadius: '0.375rem', padding: '0.15rem 0.45rem', fontSize: '0.73rem', fontWeight: '600', color: C.statusDanger, display: 'inline-block' }}>
                              Entrada {fBRL(v.entrada_valor)} — {v.entrada_forma}
                            </span>
                            <span style={{ background: C.statusInfoBg, borderRadius: '0.375rem', padding: '0.15rem 0.45rem', fontSize: '0.73rem', fontWeight: '600', color: C.statusInfo, display: 'inline-block' }}>
                              Saldo {fBRL(v.saldo_valor)} — {v.saldo_forma}
                            </span>
                          </div>
                        ) : (
                          <span style={{
                            background: C.surfaceContainerHigh, borderRadius: '0.375rem',
                            padding: '0.2rem 0.55rem', fontSize: '0.78rem', fontFamily: F.body, fontWeight: '600',
                          }}>{v.forma_pagamento || '—'}</span>
                        )}
                        {/* Boleto no banco (vendas com boleto/crediário) */}
                        {MODS_PRESTACAO.includes(v.pagamento_modalidade) && !naoEfetivada && (
                          <div style={{ marginTop: '0.3rem' }}>
                            {v.boleto_emitido_em ? (
                              <span title="Boleto encontrado no arquivo do banco" style={{ background: C.statusSuccessBg, color: C.statusSuccess, borderRadius: '0.375rem', padding: '0.15rem 0.45rem', fontSize: '0.72rem', fontWeight: '600', whiteSpace: 'nowrap', display: 'inline-block' }}>
                                ✓ Boleto emitido em {fDateBR(v.boleto_emitido_em)}
                              </span>
                            ) : (
                              <span title="Boleto ainda não encontrado no arquivo do banco" style={{ background: C.statusWarningBg, color: C.statusWarning, borderRadius: '0.375rem', padding: '0.15rem 0.45rem', fontSize: '0.72rem', fontWeight: '600', whiteSpace: 'nowrap', display: 'inline-block' }}>
                                ⏳ Sem boleto
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        {podeAlterar(v) ? (
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button onClick={e => { e.stopPropagation(); abrirEdicao(v) }}
                              style={{
                                padding: '0.3rem 0.6rem', fontSize: '0.78rem', fontFamily: F.body, fontWeight: '600',
                                borderRadius: '0.375rem', border: `1.5px solid ${C.borderSubtle}`,
                                background: C.surfaceContainerLow, color: C.onSurfaceVariant, cursor: 'pointer',
                              }}>Editar</button>
                            <button onClick={e => { e.stopPropagation(); excluir(v.id) }}
                              style={{
                                padding: '0.3rem 0.6rem', fontSize: '0.78rem', fontFamily: F.body, fontWeight: '600',
                                borderRadius: '0.375rem', border: `1.5px solid ${C.outlineVariant}`,
                                background: C.statusDangerBg, color: C.statusDanger, cursor: 'pointer',
                              }}>Excluir</button>
                          </div>
                        ) : (v.conferido && !isAdmin) ? (
                          <span title="Venda conferida — somente o administrador pode alterar"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                              fontSize: '0.75rem', fontFamily: F.body, fontWeight: '600', color: C.onSurfaceVariant,
                            }}>🔒 Conferida</span>
                        ) : null}
                      </td>
                    </tr>

                    {/* Linha de detalhes — desliza para baixo ao clicar na venda */}
                    <tr>
                      <td colSpan={colsFixas + 5} style={{ padding: 0, border: 'none' }}>
                        <div style={{ display: 'grid', gridTemplateRows: aberto ? '1fr' : '0fr', transition: 'grid-template-rows 0.25s ease' }}>
                          <div style={{ overflow: 'hidden' }}>
                            <div style={{
                              margin: '0 0.5rem 0.75rem', padding: '1rem 1.25rem',
                              background: C.surfaceContainerLow, borderLeft: `4px solid ${C.primary}`,
                              borderRadius: '0 0.5rem 0.5rem 0',
                            }}>
                              <div style={{ fontFamily: F.body, fontWeight: '700', color: C.onSurface, fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                                Resumo da venda {v.os_numero ? `#${v.os_numero}` : ''}
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.6rem 1.25rem' }}>
                                {[
                                  ['Tipo', v.tipo_venda || 'Grau'],
                                  ['Nº da Venda', v.os_numero ? `#${v.os_numero}` : '—'],
                                  ['Nota Fiscal', v.nota_fiscal || '—'],
                                  ['Cliente', v.nome_cliente || '—'],
                                  ['Pagador', v.pagador || v.nome_cliente || '—'],
                                  ['Especialista', v.especialista || '—'],
                                  ['Data', fDateBR(v.data_venda)],
                                  ['Vendedor', vendedorMap[v.vendedor_id] || '—'],
                                  ...(filiais.length > 1 ? [['Filial', filialMap[v.filial_id] || '—']] : []),
                                  ['Forma de pagamento', v.num_parcelas >= 2 ? `${v.forma_pagamento || '—'} (${v.num_parcelas}×)` : (v.forma_pagamento || '—')],
                                  ...(MODS_PRESTACAO.includes(v.pagamento_modalidade)
                                    ? [['Boleto emitido em', v.boleto_emitido_em ? fDateBR(v.boleto_emitido_em) : '']]
                                    : []),
                                  ...(v.valor_financiado != null && ehMultiCreditoMod(v.pagamento_modalidade)
                                    ? [['Valor financiado', fBRL(v.valor_financiado)]]
                                    : []),
                                  ...(Number(v.entrada_valor) > 0
                                    ? [['Entrada', `${fBRL(v.entrada_valor)}${(v.entrada_forma || v.pagamento_entrada) ? ` (${v.entrada_forma || v.pagamento_entrada})` : ''}`]]
                                    : []),
                                  ['Valor bruto', fBRL(v.valor_bruto)],
                                  ['Desconto', v.desconto > 0 ? `- ${fBRL(v.desconto)}` : '—'],
                                  ['Tarifa', v.tarifa > 0 ? `+ ${fBRL(v.tarifa)}` : '—'],
                                  ['Valor final', fBRL(v.valor_final)],
                                  ['Conferido', v.conferido ? `Sim${v.conferido_em ? ' — ' + new Date(v.conferido_em).toLocaleString('pt-BR') : ''}` : 'Não'],
                                ].map(([rotulo, valor]) => (
                                  <div key={rotulo}>
                                    <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: C.onSurfaceVariant, fontFamily: F.body, fontWeight: '600' }}>{rotulo}</div>
                                    <div style={{ fontSize: '0.85rem', color: C.onSurface, fontFamily: F.body, marginTop: '0.15rem' }}>{valor}</div>
                                  </div>
                                ))}
                              </div>

                              {naoEfetivada && (
                                <div style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: C.statusDanger, fontFamily: F.body }}>
                                  <strong>Não efetivada:</strong> {v.motivo_nao_efetivada || '—'}
                                </div>
                              )}

                              {Array.isArray(v.parcelas) && v.parcelas.length > 0 && (
                                <div style={{ marginTop: '0.9rem' }}>
                                  <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: C.onSurfaceVariant, fontFamily: F.body, fontWeight: '600', marginBottom: '0.4rem' }}>Parcelas</div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                    {v.parcelas.map(p => (
                                      <span key={p.n} style={{
                                        background: C.surfaceContainerHigh, borderRadius: '0.375rem',
                                        padding: '0.3rem 0.6rem', fontSize: '0.78rem', fontFamily: F.body,
                                        color: C.onSurface, display: 'inline-flex', gap: '0.4rem', alignItems: 'center',
                                      }}>
                                        <strong>{p.n === 1 && MODS_ENTRADA_PARCELA.includes(v.pagamento_modalidade) ? 'Entrada' : `${p.n}ª`}</strong>
                                        <span style={{ color: C.onSurfaceVariant }}>{fDateBR(p.data)}</span>
                                        <span style={{ fontFamily: F.mono }}>{fBRL(p.valor)}</span>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Observações da venda */}
                              <div style={{ marginTop: '0.9rem' }}>
                                <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: C.onSurfaceVariant, fontFamily: F.body, fontWeight: '600', marginBottom: '0.4rem' }}>Observações</div>
                                {(obsMap[v.id] || []).length > 0 ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.6rem' }}>
                                    {(obsMap[v.id] || []).map(o => (
                                      <div key={o.id} style={{ background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: '0.4rem', padding: '0.5rem 0.65rem' }}>
                                        <div style={{ fontSize: '0.85rem', color: C.onSurface, fontFamily: F.body, whiteSpace: 'pre-wrap' }}>{o.texto}</div>
                                        <div style={{ fontSize: '0.7rem', color: C.onSurfaceVariant, fontFamily: F.body, marginTop: '0.2rem' }}>
                                          {o.autor_nome ? `${o.autor_nome} · ` : ''}{new Date(o.created_at).toLocaleString('pt-BR')}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div style={{ fontSize: '0.82rem', color: C.onSurfaceVariant, fontFamily: F.body, marginBottom: '0.6rem' }}>Nenhuma observação ainda.</div>
                                )}
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                                  <textarea
                                    value={expandedId === v.id ? obsInput : ''}
                                    onChange={e => setObsInput(e.target.value)}
                                    placeholder="Escreva uma observação..."
                                    rows={2}
                                    style={{ ...inputCss, flex: 1, resize: 'vertical', minHeight: '38px' }} />
                                  <button type="button" onClick={() => adicionarObservacao(v)} disabled={obsSaving || !obsInput.trim()}
                                    style={{ ...btnPrimary, whiteSpace: 'nowrap' }}>
                                    {obsSaving ? 'Salvando...' : 'Adicionar'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                    </Fragment>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: `2px solid ${C.borderSubtle}`, background: C.tableHeader }}>
                  <td colSpan={colsFixas} style={{ padding: '0.65rem 0.75rem', fontFamily: F.body, fontWeight: '700', color: C.onSurface, fontSize: '0.82rem' }}>
                    TOTAL EFETIVADO — {vendasEfetivadas.length} venda{vendasEfetivadas.length !== 1 ? 's' : ''}
                  </td>
                  <td style={{ padding: '0.65rem 0.75rem', fontFamily: F.mono, fontWeight: '700', color: C.onSurface, whiteSpace: 'nowrap' }}>{fBRL(totBruto)}</td>
                  <td style={{ padding: '0.65rem 0.75rem', fontFamily: F.mono, fontWeight: '700', color: C.statusDanger, whiteSpace: 'nowrap' }}>
                    {totDesc > 0 ? `- ${fBRL(totDesc)}` : '—'}
                  </td>
                  <td style={{ padding: '0.65rem 0.75rem', fontFamily: F.mono, fontWeight: '800', color: C.statusSuccess, whiteSpace: 'nowrap' }}>{fBRL(totFinal)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
