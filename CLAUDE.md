# Regras de trabalho — OpticAdm

Este arquivo define como o Claude deve trabalhar neste repositório. Siga à risca.

## Sobre o dono do projeto
- O dono é o responsável pelo sistema e **não é programador**.
- Explique sempre, em **linguagem simples**, o que mudou e por quê.
- Para **toda ação manual**, dê o **passo a passo** detalhado: onde clicar no
  Supabase (nome do menu/botão), o que copiar e onde colar, o que esperar ver.
- Nunca presuma conhecimento técnico. Evite jargão; quando for inevitável,
  explique em uma frase.

## Ritmo de trabalho
- **Uma etapa por vez.** Faça só o que foi pedido naquela etapa.
- **Não altere nada fora do escopo** do pedido (nada de "aproveitar e
  arrumar" outras coisas sem combinar antes).
- Se perceber algo importante fora do escopo, **aponte e pergunte** — não mexa.

## Banco de dados (Supabase)
- Este repositório **NUNCA** usa o projeto Supabase do **Mercadão dos Óculos**.
  Usa **somente o projeto Supabase próprio do OpticAdm**.
- Cada mudança de banco vira **UM arquivo novo** em `supabase/multiempresa/`,
  **numerado** em sequência (`01_`, `02_`, `03_`...).
- Cada script deve seguir o padrão dos atuais:
  - **Cabeçalho** em comentário explicando o que o script faz e como rodá-lo.
  - **Idempotente** (pode rodar de novo sem erro nem efeito duplicado —
    use `if not exists`, `create or replace`, `on conflict do nothing`, etc.).
  - **Nunca apaga dados** nem remove colunas/tabelas com dados.
  - Termina com uma **consulta de verificação** que mostra que deu certo.

## Git e Pull Requests
- Trabalhe em **uma branch por etapa**.
- Ao terminar, **abra um Pull Request** com explicação em linguagem simples.
- **O dono faz o merge** depois de testar. O Claude não faz merge.

## Ao concluir cada etapa
Liste **o que o dono deve testar na tela**, separando:
- **Como administrador:** o que abrir e conferir.
- **Como vendedor:** o que abrir e conferir.

## Publicação (GitHub Pages)
- Só ative a publicação automática e cadastre chaves/secrets **quando pedido**.
- O fluxo em `.github/workflows/deploy.yml` fica em modo manual até lá.
