# OpticAdm — Sistema de Gestão para Óticas

Sistema web para gestão de óticas, cobrindo vendas diárias, comissões, cobranças de boletos, captação e agenda. Derivado do sistema interno da rede **Mercadão dos Óculos**, o OpticAdm está evoluindo para um **produto multiempresa**: várias óticas no mesmo sistema, cada uma enxergando apenas os próprios dados.

> **Em transição para multiempresa.** A base atual é de uso de uma única rede. A separação de dados por empresa está sendo construída em etapas (ver `supabase/multiempresa/`).

---

## Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + Vite 6 |
| Estilização | Tailwind CSS v4 + design system próprio (`src/lib/ds.js`) |
| Backend / Banco | Supabase (PostgreSQL + Auth + RLS) |
| Hospedagem | GitHub Pages |
| Roteamento | React Router DOM v7 (HashRouter) |
| Planilhas | SheetJS (xlsx v0.18.5) |
| Compactação (backup) | fflate |

---

## Módulos do Sistema

### Dashboard
- Totais de vendas e comissões do dia e do mês
- Dados por perfil: admin vê toda a rede/filiais; vendedor vê apenas os seus
- Cards de inadimplência (vencidos, protestados, negativados) e tarefas pendentes
- Somente vendas **efetivadas** são contabilizadas

### Vendas
- Lançamento com tipo (Solar / Grau), O.S. automática por filial, nota fiscal, cliente, data, valor e forma de pagamento
- Forma padrão **Entrada e Saldo** (valor e forma para cada parte; validação de soma)
- **Venda não efetivada:** checkbox + motivo obrigatório; excluída de totais, comissões e dashboard
- **Conferido** (exclusivo do admin): toggle com registro de data/hora
- Navegação por dia, filtro por período e por filial

### Contas a Pagar (Resumo)
- Despesas por período, pagas e a vencer, com filtro por filial

### Comissões (Vendedores)
- Cadastro com nome, e-mail, filial e taxa de comissão (%)
- Cálculo automático sobre vendas efetivadas

### Cobranças
- Importação de boletos via planilha Excel por filial
- Deduplicação por `nosso_numero` dentro de cada filial
- Painel do devedor, edição de situação/motivo, lembretes e audiências

### Clientes
- Cadastro e consulta de clientes

### Captação de Clientes
- Registro de atendimentos que não converteram em venda

### Agenda
- Agenda da loja por filial

### Configurações *(exclusivo admin)*
- Filiais (numeração de O.S. independente por filial), formas de pagamento, usuários, situações de cobrança e backup

---

## Perfis de Acesso

| Funcionalidade | Admin | Vendedor |
|---|:---:|:---:|
| Dashboard (visão geral da rede) | ✅ | ❌ |
| Dashboard (próprios dados) | ✅ | ✅ |
| Registrar / editar próprias vendas | ✅ | ✅ |
| Editar vendas de outros vendedores | ✅ | ❌ |
| Marcar venda como Conferido | ✅ | ❌ |
| Contas a Pagar | ✅ | ❌ |
| Cobranças / importação de boletos | ✅ | ✅ |
| Comissões | ✅ | ✅ |
| Captação (próprios) | ✅ | ✅ |
| Configurações | ✅ | ❌ |

---

## Banco de Dados (Supabase)

Todas as tabelas usam Row Level Security (RLS).

| Tabela | Descrição |
|---|---|
| `profiles` | Usuários com papel (`admin` / `vendedor`), filial e comissão |
| `filiais` | Filiais da rede |
| `vendas` | Vendas diárias (conferido, entrada/saldo, efetivada, etc.) |
| `despesas` | Contas a pagar |
| `cobrancas_devedores` | Devedores |
| `cobrancas_boletos` | Boletos vinculados a devedores e filiais |
| `cobrancas_lembretes` | Lembretes/tarefas de cobrança |
| `clientes` | Cadastro de clientes |
| `captacao_clientes` | Atendimentos de captação |
| `agenda` | Agenda da loja |
| `configuracoes` | Parâmetros do sistema |

### Scripts SQL

- `supabase/` — scripts da estrutura atual (base de uma rede).
- `supabase/multiempresa/` — mudanças da evolução **multiempresa**, numeradas (`01_`, `02_`...). Cada arquivo tem cabeçalho explicando o que faz, é idempotente, não apaga dados e termina com uma consulta de verificação.

---

## Configuração Local

### 1. Variáveis de ambiente

Copie `.env.example` para `.env` e preencha com as credenciais do projeto Supabase **próprio do OpticAdm**:

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key-aqui
```

> O arquivo `.env` **nunca** é versionado (está no `.gitignore`).

### 2. Rodar o projeto

```bash
npm install
npm run dev
```

---

## Deploy (GitHub Pages)

O fluxo de deploy fica em `.github/workflows/deploy.yml`. **A publicação automática ainda não está ativada** — será habilitada em uma etapa futura, quando o banco próprio do OpticAdm existir. Quando ativada, exigirá os secrets do repositório (Settings → Secrets and variables → Actions):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

---

## Cores da Marca

| Elemento | Hex |
|---|---|
| Vermelho principal | `#C0272D` |
| Vermelho escuro | `#9d0518` |
| Azul navy | `#0f2d4a` |
