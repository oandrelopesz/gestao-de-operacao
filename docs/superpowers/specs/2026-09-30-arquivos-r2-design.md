# Arquivos do sistema no Cloudflare R2 — desenho

Data: 30/09/2026. Status: desenho aprovado no chat pelo André (decisões abaixo).

## 1. Objetivo

Tirar os arquivos do Storage do Supabase (Lovable Cloud) e guardá-los no Cloudflare R2, para ter espaço praticamente
ilimitado ("memória ilimitada"), sem mudar o banco: o Supabase continua o único banco de dados.

Fora do escopo (decisão do André, 30/09): **Swipe file** (continua no Google Drive), **Transcritor** e **Fireflies**
(ficam como estão, no Storage do Supabase), GMN (já nasce no R2, bucket `gmn-midia`), trancar o acesso (a segurança do
app fica como está hoje).

## 2. Decisões (30/09/2026)

| Tema | Decisão |
|---|---|
| Banco × arquivos | Supabase = único banco; R2 = arquivos (decisão `2026-09-30-supabase-banco-cloudflare-arquivos` no cofre) |
| O que vai | **Arquivos, Notas e Fluxogramas**. Swipe file, Transcritor e Fireflies ficam como estão |
| Acesso | **Igual a hoje**: quem usa o sistema abre e envia arquivos sem login (a chave pública do app libera a função) |
| Cópias no Supabase | Ficam **30 dias** como garantia (até 30/10/2026) e depois são apagadas |
| Regra de ouro | **Nada pode quebrar nem parar de funcionar**: leitura com reserva no Supabase, função testada antes de o site mudar, publicação só depois do teste completo, e caminho de volta sem perder arquivo |
| Bucket | **Um bucket privado** `gestao-arquivos` (conta Cloudflare da contato@, id `b4e84eaa8099c0e841a2eb35824027ca`), com uma pasta por módulo. Criado em 30/09/2026, com CORS |
| Chaves | Um token do R2 com leitura e escrita **só** em `gestao-arquivos` e `gmn-midia` (serve também ao GMN). As chaves ficam só nos secrets do Lovable Cloud, colados pelo André |

## 3. Onde fica cada arquivo

O caminho no R2 é o **mesmo caminho de hoje**, com a pasta do módulo na frente. Assim nenhuma coluna do banco muda.

| Módulo | Bucket atual (Supabase) | Chave no R2 | Quem lê |
|---|---|---|---|
| Arquivos | `pdfs` (privado) — `pdfs.storage_path` | `arquivos/<storage_path>` | aba Arquivos (visualizar, baixar) |
| Notas | `notas` (público) — URL pública dentro de `notas.doc` | `notas/<arquivo>` | `<img>` dentro da nota |
| Fluxogramas | `fluxogramas` (privado) — `<fluxo>/<fileId>.<ext>` na cena | `fluxogramas/<caminho>` | editor (baixa e vira dataURL) |

Volume em 30/09/2026: 12 arquivos (4,7 MB) em `pdfs`, nada em `notas` e `fluxogramas`.

## 4. Edge function `r2`

Única peça com as chaves do R2 (assinatura S3 SigV4 com `aws4fetch`, importado por URL). `verify_jwt = false` no
`supabase/config.toml`.

**Acesso:** as ações por `POST` exigem o cabeçalho `apikey` igual à chave pública do projeto (`SUPABASE_ANON_KEY`), que
o app já manda — o mesmo nível de hoje. As ações `migrar` exigem também `x-swipe-key` igual a `SWIPE_KEY`.

| Chamada | Faz | Devolve |
|---|---|---|
| `POST {acao:"enviar", chave}` | URL assinada de `PUT` (15 min) | `{ url }` |
| `POST {acao:"ler", chave}` | URL assinada de `GET` (1 h), se o objeto existir | `{ url }` ou 404 |
| `POST {acao:"apagar", chaves}` | apaga no R2 (até 1.000 por chamada; ausente conta como apagado) | `{ apagados }` |
| `POST {acao:"copiar", de, para}` | copia um objeto dentro do R2 | `{ ok }` ou 404 |
| `POST {acao:"listar", prefixo}` | lista as chaves de uma pasta | `{ chaves }` |
| `POST {acao:"migrar", modulo, direcao, limite}` | copia entre Supabase e R2 o que falta no destino (idempotente, em lotes de até ~100 s). `direcao`: `"para-r2"` (migração) ou `"para-supabase"` (caminho de volta). Um arquivo com erro não trava os outros: vai para `erros` e é tentado de novo na próxima chamada | `{ copiados, erros, existentes, faltam }` |
| `GET ?c=notas/<arquivo>` | redireciona (302) para uma URL assinada de leitura | — |

- **Módulos e buckets de origem:** `arquivos` ↔ bucket `pdfs`; `notas` ↔ `notas`; `fluxogramas` ↔ `fluxogramas`.
- **Chaves válidas:** começam por `arquivos/`, `notas/` ou `fluxogramas/`, sem `..`, sem `//`, sem barra inicial, sem
  caractere de controle, até 512 caracteres. O `GET` público só atende `notas/` (é o endereço fixo das imagens dentro
  das notas; a URL assinada muda a cada acesso, mas o endereço gravado na nota nunca expira).
- **Secrets:** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_ARQUIVOS` (= `gestao-arquivos`).
  O GMN usa os mesmos três primeiros com `R2_BUCKET` (= `gmn-midia`) e `R2_PUBLIC_BASE`.
- **Erros:** `{ error }` com 4xx/5xx e mensagem legível em português. Um `GET` de status (`GET` sem `c`) devolve
  `{ r2: boolean, bucket }` para conferir se os secrets estão lá e se o bucket responde (`bucket: "ok"`).

## 5. Front

- `src/lib/r2Chaves.ts` (regras puras, testadas): montar e validar a chave por módulo, montar o endereço fixo de uma
  imagem de nota e reconhecer o caminho de uma imagem nossa tanto na URL antiga
  (`/storage/v1/object/public/notas/…`) quanto na nova (`/functions/v1/r2?c=notas%2F…`).
- `src/lib/r2.ts` (I/O): chama a função (`enviar` com barra de progresso via XHR `PUT` direto no R2, `ler`, `apagar`,
  `copiar`, `listar`) e baixa um arquivo com **reserva**: tenta o R2 e, se não achar (404), baixa do Supabase.
- Comportamento durante os 30 dias:
  - **Enviar:** só para o R2.
  - **Ler / baixar / visualizar:** R2 primeiro; se não existir lá, Supabase.
  - **Apagar:** nos dois (ausente em um deles não é erro).
  - **Trocar arquivo (Arquivos):** envia o novo ao R2, atualiza a linha e só então apaga o antigo dos dois lados.
  - **Duplicar quadro (Fluxogramas):** copia no R2; se a imagem de origem só existir no Supabase, baixa de lá e envia ao R2.
  - **Excluir quadro:** lista a pasta nos dois lados e apaga nos dois.
  - **Imagem de nota:** nova vai para o R2 com o endereço fixo; ao sair da nota, apaga do lado certo conforme a URL.
- Arquivos tocados: `src/lib/pdfs.ts`, `src/lib/notas.ts`, `src/lib/notasDoc.ts`, `src/lib/fluxosDados.ts`.

## 6. Configuração na Cloudflare e no Lovable

1. Bucket **`gestao-arquivos`**, privado (feito em 30/09/2026).
2. CORS do bucket (feito): `GET`, `PUT` e `HEAD` das origens `https://gestao.andrelopes.digital`,
   `https://gestao-de-operacao.lovable.app` e `http://localhost:8080`, `5173`, `5174`, `5175`; cabeçalho
   `content-type`; expõe `ETag`.
3. Token de API do R2 ("Object Read & Write") só para `gestao-arquivos` e `gmn-midia`: o Claude preenche o formulário
   e **o André cria o token e cola os secrets no Lovable** (o classificador do Claude Code bloqueia escrita no cofre
   de secrets, e as chaves não passam pelo chat).

## 7. Ordem de implantação (sem janela fora do ar)

1. Cloudflare e secrets (acima).
2. Código na `main` (push pelo André); deploy da função `r2` pelo chat do Lovable (**sem publicar o site**).
3. Teste da função isolada: status, `enviar` → `PUT` → `ler` → `GET` → `apagar` com uma chave `arquivos/TESTE-…`,
   e o CORS a partir do site.
4. `migrar` para o R2 nos três módulos (repetir até `faltam = 0`) e conferir: mesma quantidade e mesmo tamanho de cada
   arquivo nos dois lados.
5. Teste do front novo no servidor local contra a função publicada (Arquivos, Notas, Fluxogramas).
6. Publicar o site (André clica, com aviso). Daí em diante tudo novo vai para o R2; o que faltar cai no Supabase.
7. `migrar` para o R2 de novo (pega o que alguém enviou entre os passos 4 e 6 pelo site antigo).
8. Teste de ponta a ponta no site publicado, com arquivos "TESTE" apagados no fim.
9. **30/10/2026:** reescrever em `notas.doc` os endereços antigos de imagem (`/storage/v1/object/public/notas/…`) para o
   endereço fixo novo; só então apagar as cópias no Supabase e tirar a leitura de reserva do código.

**Caminho de volta:** se algo der errado depois do passo 6, `migrar` com `direcao: "para-supabase"` devolve ao
Supabase o que só existe no R2 e o site volta à versão anterior (republicar o commit antigo), sem perder arquivo.

## 8. Testes

- `node --test`: `r2Chaves` (montar e validar chaves, recusar `..`, barra inicial e módulo inválido, endereço fixo de
  imagem, reconhecer URL antiga e nova, URL de fora do sistema devolve nulo).
- Função: roteiro do passo 3 da seção 7, com saída registrada.
- Manual, local e no site: Arquivos (enviar com progresso, visualizar, trocar, baixar, mover, excluir arquivo e pasta),
  Notas (colar imagem, reabrir, remover a imagem, excluir a nota), Fluxogramas (imagem no quadro, reabrir, duplicar,
  excluir).

## 9. Riscos

- **Links assinados expiram** (1 h): o app pede um novo a cada abertura; nunca se grava URL assinada no banco.
- **CORS errado** trava o envio: testado no passo 3, antes de o site mudar.
- **Arquivo enviado pelo site antigo durante a troca:** a segunda passada do `migrar` e a leitura de reserva cobrem.
- **R2 fora do ar:** arquivos antigos ainda leem do Supabase (30 dias); os novos ficam indisponíveis até voltar (mesmo
  risco que hoje existe com o Storage do Supabase).
- **Limite de tempo da função** na migração: lotes pequenos (`limite`), repetidos até terminar.
