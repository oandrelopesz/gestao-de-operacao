# Arquivos do sistema no Cloudflare R2 — desenho

Data: 30/09/2026. Status: desenho aprovado no chat (decisões abaixo); spec para revisão do André.

## 1. Objetivo

Tirar os arquivos do Storage do Supabase (Lovable Cloud) e guardá-los no Cloudflare R2, para ter espaço praticamente
ilimitado ("memória ilimitada"), sem mudar o banco: o Supabase continua o único banco de dados.

Fora do escopo: Swipe file (continua no Google Drive), Transcritor (não guarda mídia), GMN (já nasce no R2, bucket
`gmn-midia`), trancar o acesso (a segurança do app fica como está hoje).

## 2. Decisões (30/09/2026)

| Tema | Decisão |
|---|---|
| Banco × arquivos | Supabase = único banco; R2 = arquivos (decisão `2026-09-30-supabase-banco-cloudflare-arquivos` no cofre) |
| Acesso | **Igual a hoje**: quem usa o sistema abre e envia arquivos sem login (a chave pública do app libera a função) |
| Cópias no Supabase | Ficam **30 dias** como garantia (até 30/10/2026) e depois são apagadas |
| Swipe file | Continua no Google Drive |
| Buckets | **Um bucket privado** `gestao-arquivos` (conta Cloudflare da contato@, id `b4e84eaa8099c0e841a2eb35824027ca`), com uma pasta por módulo |
| Chaves | Um token do R2 com leitura e escrita **só** em `gestao-arquivos` e `gmn-midia` (serve também ao GMN). As chaves ficam só nos secrets do Lovable Cloud |

## 3. Onde fica cada arquivo

O caminho no R2 é o **mesmo caminho de hoje**, com a pasta do módulo na frente. Assim nenhuma coluna do banco muda.

| Módulo | Bucket atual (Supabase) | Chave no R2 | Quem lê |
|---|---|---|---|
| Arquivos | `pdfs` (privado) — `pdfs.storage_path` | `arquivos/<storage_path>` | aba Arquivos (visualizar, baixar) |
| Fireflies | `fireflies` (privado) — `<id>/transcricao.pdf` etc. | `fireflies/<caminho>` | aba Fireflies; o worker grava |
| Notas | `notas` (público) — URL pública dentro de `notas.doc` | `notas/<arquivo>` | `<img>` dentro da nota |
| Fluxogramas | `fluxogramas` (privado) — `<fluxo>/<fileId>.<ext>` na cena | `fluxogramas/<caminho>` | editor (baixa e vira dataURL) |

Volume em 30/09/2026: 12 arquivos (4,7 MB) em `pdfs`, 580 arquivos (26,1 MB) em `fireflies`, nada em `notas` e `fluxogramas`.

## 4. Edge function `r2`

Única peça com as chaves do R2 (assinatura S3 SigV4 com `aws4fetch`). `verify_jwt = false`.

**Acesso:** as ações por `POST` exigem o cabeçalho `apikey` igual à chave pública do projeto (`SUPABASE_ANON_KEY`),
que o app e o worker já mandam — o mesmo nível de hoje. A ação `migrar` exige também `x-swipe-key` igual a `SWIPE_KEY`.

| Chamada | Faz | Devolve |
|---|---|---|
| `POST {acao:"enviar", chave, tipo}` | URL assinada de `PUT` (15 min) | `{ url }` |
| `POST {acao:"ler", chave}` | URL assinada de `GET` (1 h) | `{ url }` |
| `POST {acao:"apagar", chaves}` | apaga (até 1.000 por chamada) | `{ apagados }` |
| `POST {acao:"copiar", de, para}` | copia um objeto (duplicar quadro) | `{ ok }` |
| `POST {acao:"listar", prefixo}` | lista as chaves de uma pasta | `{ chaves }` |
| `POST {acao:"migrar", bucket, limite}` | copia do Storage do Supabase para o R2 o que ainda não está lá (idempotente, em lotes) | `{ copiados, existentes, faltam }` |
| `GET ?c=notas/<arquivo>` | redireciona (302) para uma URL assinada de leitura | — |

- **Chaves válidas:** começam por `arquivos/`, `fireflies/`, `notas/` ou `fluxogramas/`, sem `..`, sem `//`, sem barra
  inicial, até 512 caracteres. O `GET` público só atende `notas/` (é o endereço fixo das imagens dentro das notas; o
  link muda de URL assinada a cada acesso, mas o endereço gravado na nota nunca expira).
- **Secrets:** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_ARQUIVOS` (= `gestao-arquivos`).
  O GMN usa os mesmos três primeiros com `R2_BUCKET` (= `gmn-midia`) e `R2_PUBLIC_BASE`.
- **Erros:** `{ error }` com 4xx/5xx e mensagem legível.

## 5. Front (`src/lib/r2.ts` + ajustes por módulo)

- `src/lib/r2.ts`: chama a função (`enviar` com barra de progresso via XHR `PUT` direto no R2, `ler`, `apagar`,
  `copiar`, `listar`) e monta o endereço fixo das imagens das notas.
- Regras puras testadas (`src/lib/r2Chaves.ts` + `r2Chaves.test.ts`): montar e validar chaves por módulo, reconhecer
  o caminho de uma imagem nossa tanto na URL antiga (`/storage/v1/object/public/notas/…`) quanto na nova
  (`/functions/v1/r2?c=notas%2F…`).
- **Transição de 30 dias:** leitura tenta o R2 e, se não achar, cai no Supabase; apagar remove dos dois. Envio novo
  vai só para o R2.
- Módulos: Arquivos (`src/lib/pdfs.ts`), Notas (`src/lib/notas.ts`, `src/lib/notasDoc.ts`), Fluxogramas
  (`src/lib/fluxosDados.ts`), Fireflies (`src/components/fireflies/PreviewDialog.tsx` e onde mais baixar arquivo).

## 6. Worker (Fireflies)

`worker/src/fireflies/supabase.js`: `subirArquivo` pede a URL de envio à função `r2` (com a chave pública que o worker
já tem) e faz `PUT`; `apagarArquivos` chama `apagar`. Nenhuma chave nova na VPS. A imagem nova é enviada pelo André no
Portainer (Images → Build image → Upload), como no deploy do Fireflies.

## 7. Configuração na Cloudflare (pelo navegador)

1. Bucket **`gestao-arquivos`**, privado, região automática.
2. CORS do bucket: `PUT` e `GET` das origens `https://gestao.andrelopes.digital`, `https://gestao-de-operacao.lovable.app`
   e `http://localhost:*` (dev), cabeçalho `content-type`, exposição de `etag`.
3. Token de API do R2 ("Object Read & Write") só para `gestao-arquivos` e `gmn-midia`. Os valores aparecem uma vez:
   **o André cola direto nos secrets do Lovable** (não passam pelo chat nem por arquivo). Os valores que não são segredo
   (`R2_ACCOUNT_ID`, nomes de bucket, base pública do GMN) o Claude preenche.

## 8. Ordem de implantação (sem janela fora do ar)

1. Cloudflare: bucket, CORS, token; secrets no Lovable.
2. Código na `main` (push pelo André); deploy da função `r2` pelo chat do Lovable (sem publicar o site).
3. `migrar` em todos os buckets (repetir até `faltam = 0`); conferir contagens.
4. Publicar o site (André clica, com aviso). A partir daqui, tudo novo vai para o R2; o que faltar cai no Supabase.
5. André envia a imagem nova do worker no Portainer.
6. `migrar` de novo (pega o que entrou entre os passos 3 e 5).
7. Teste de ponta a ponta nos quatro módulos (com arquivos "TESTE", apagados no fim).
8. **30/10/2026:** apagar as cópias no Supabase e tirar a leitura de reserva do código.

## 9. Testes

- `node --test`: `r2Chaves` (montar/validar chaves, recusar `..`, prefixo inválido, reconhecer URL antiga e nova).
- Manual depois do deploy: Arquivos (enviar com progresso, visualizar, trocar, baixar, excluir, pasta), Notas (colar
  imagem, reabrir, remover), Fluxogramas (imagem no quadro, reabrir, duplicar, excluir), Fireflies (prévia e download de
  uma reunião antiga e de uma nova depois do worker novo).

## 10. Riscos

- **Links assinados expiram** (1 h): o app sempre pede um novo ao abrir; nunca se grava URL assinada no banco.
- **CORS errado** trava o envio do navegador: testar no site antes de publicar a troca (a função pode ser testada
  isoladamente).
- **Worker antigo** continua gravando no Supabase até a imagem nova subir: a leitura de reserva e a segunda passada do
  `migrar` cobrem.
- **r2.dev** não é usado aqui (bucket privado); só o GMN usa endereço público.
