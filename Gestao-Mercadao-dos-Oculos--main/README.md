# Mercadão dos Óculos — Sistema de Gestão

Sistema web completo para gestão interna da rede de óticas **Mercadão dos Óculos**, cobrindo vendas diárias, comissões, cobranças de boletos e captação de clientes.

🔗 **Acesso:** [jeferprog.github.io/Gestao-Mercadao-dos-Oculos-](https://jeferprog.github.io/Gestao-Mercadao-dos-Oculos-)

---

## Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + Vite 6 |
| Estilização | Tailwind CSS v4 |
| Backend / Banco | Supabase (PostgreSQL + Auth + RLS) |
| Hospedagem | GitHub Pages |
| Roteamento | React Router DOM v7 (HashRouter) |
| Planilhas | SheetJS (xlsx v0.18.5) |

---

## Módulos do Sistema

### 📊 Dashboard
- Totais de vendas e comissões do dia e do mês
- Dados filtrados por perfil: admin vê toda a rede, vendedor vê apenas seus dados
- Ranking dos vendedores por volume de vendas
- Somente vendas **efetivadas** são contabilizadas

### 🧾 Vendas
- Lançamento de vendas com tipo (Solar / Grau), O.S. automática por filial, nota fiscal, cliente, data, valor e forma de pagamento
- Forma padrão: **Entrada e Saldo** (com sub-campos de valor e forma para cada parte; validação de soma = valor final)
- **Venda não efetivada:** checkbox + motivo obrigatório; excluída de totais, comissões e dashboard
- **Conferido** (exclusivo do admin): toggle com registro de data/hora
- Navegação por dia e filtro por período de datas
- Filtro por filial (quando há mais de uma)
- Admin visualiza e edita todas as vendas; vendedor apenas as suas

### 📈 Resumo
- Relatório consolidado por período
- Totais por vendedor com comissões calculadas
- Filtro por filial

### 👥 Vendedores *(exclusivo admin)*
- Cadastro com nome, e-mail, filial e taxa de comissão (%)
- Definição de meta mensal individual
- Cálculo automático de comissões sobre vendas efetivadas

### 💳 Cobranças *(exclusivo admin)*
- Importação de relatório de boletos via planilha Excel por filial
- Deduplicação por `nosso_numero` dentro de cada filial
- Filtro por data de vencimento e por filial
- Modal do devedor: abre painel com todos os boletos do cliente ao clicar na linha
- Edição inline de situação e motivo por boleto, com salvar individual

### 👤 Clientes
- Cadastro e consulta de clientes da rede
- Histórico de compras

### 🎯 Captação de Clientes
- Registro de atendimentos de captação (consultas que não converteram em venda)
- Campos: data, nome do cliente, nº O.S. (opcional), vendedor e filial
- Admin vê todos os registros; vendedor vê apenas os seus
- Filtros por período e filial

### ⚙️ Configurações *(exclusivo admin)*
- Cadastro e gestão de filiais (numeração de O.S. independente por filial)
- Formas de pagamento disponíveis
- Gestão de usuários do sistema

---

## Perfis de Acesso

| Funcionalidade | Admin | Vendedor |
|---|:---:|:---:|
| Dashboard (visão geral da rede) | ✅ | ❌ |
| Dashboard (próprios dados) | ✅ | ✅ |
| Registrar / editar próprias vendas | ✅ | ✅ |
| Editar vendas de outros vendedores | ✅ | ❌ |
| Marcar venda como Conferido | ✅ | ❌ |
| Cobranças / importação de boletos | ✅ | ❌ |
| Vendedores e comissões | ✅ | ❌ |
| Captação de Clientes (próprios) | ✅ | ✅ |
| Captação de Clientes (todos) | ✅ | ❌ |
| Configurações | ✅ | ❌ |

---

## Banco de Dados (Supabase)

Todas as tabelas possuem Row Level Security (RLS) ativada.

| Tabela | Descrição |
|---|---|
| `profiles` | Usuários com papel (`admin` / `vendedor`), filial e taxa de comissão |
| `filiais` | Filiais da rede com nome e cidade |
| `vendas` | Vendas diárias com 20+ campos (incluindo conferido, entrada/saldo, efetivada) |
| `devedores` | Devedores importados do relatório de boletos |
| `cobrancas_boletos` | Boletos individuais vinculados a devedores e filiais |
| `clientes` | Cadastro de clientes |
| `captacao_clientes` | Registros de atendimentos de captação |

### Migrations disponíveis em `supabase/`

```
supabase/
├── schema.sql               # Estrutura inicial completa
├── filiais.sql              # Tabela de filiais e políticas RLS
├── vendas_v2.sql            # Colunas adicionais em vendas (conferido, entrada/saldo, efetivada)
├── cobrancas.sql            # Tabelas de cobranças e boletos
└── captacao_clientes.sql    # Tabela de captação com RLS
```

---

## Estrutura do Projeto

```
src/
├── contexts/
│   └── AuthContext.jsx       # Sessão, perfil e isAdmin
├── components/
│   ├── Layout.jsx            # Shell com sidebar + conteúdo
│   └── Sidebar.jsx           # Menu lateral responsivo
└── pages/
    ├── Login.jsx
    ├── Dashboard.jsx
    ├── Vendas.jsx
    ├── Resumo.jsx
    ├── Vendedores.jsx
    ├── Cobrancas.jsx
    ├── Clientes.jsx
    ├── CaptacaoClientes.jsx
    └── Configuracoes.jsx

public/
└── logo.png                  # Logo da rede

supabase/                     # Scripts SQL para execução no Supabase
.github/workflows/            # Deploy automático no GitHub Pages
```

---

## Deploy e Configuração

### 1. Variáveis de ambiente

Crie `.env` na raiz (use `.env.example` como base):

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key-aqui
```

### 2. Banco de dados

Execute os scripts da pasta `supabase/` no **SQL Editor do Supabase**, na ordem:

1. `schema.sql`
2. `filiais.sql`
3. `cobrancas.sql`
4. `vendas_v2.sql`
5. `captacao_clientes.sql`

### 3. Deploy local

```bash
npm install
npm run dev
```

### 4. Deploy no GitHub Pages

O deploy é automático via GitHub Actions ao fazer merge na branch `main`.

Configure os secrets no repositório (Settings → Secrets):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

---

## Cores da Marca

| Elemento | Hex |
|---|---|
| Vermelho principal | `#C0272D` |
| Azul navy | `#0f2d4a` |

---

*Sistema desenvolvido exclusivamente para uso interno da rede Mercadão dos Óculos.*
