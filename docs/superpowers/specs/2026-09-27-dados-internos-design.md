# Dados internos — design (respostas dos formulários, lidas do Drive)

Data: 27/09/2026. Aprovado em conversa.

## 1. Objetivo

Aba **Dados internos** com quatro sub-abas somente leitura — **Dados para contrato**, **Briefing – Negócios**,
**Briefing – Estratégia** e **Catálogos – E-Commerce** — que mostram, organizadas, as respostas que os formulários
públicos gravam no Google Drive da conta contato@andrelopes.digital. Cada resposta pode ser vista dentro do sistema e
baixada no formato original. Quando chega um envio novo, o próprio formulário avisa o sistema: o contador no menu sobe
na hora e a lista aberta se atualiza, sem o sistema consultar o Drive periodicamente.

## 2. Decisões do usuário

1. As sub-abas não são modificáveis: nada de enviar, renomear, mover, excluir ou criar.
2. Aviso de novidade: **contador no menu** (item "Dados internos") + selo "Novo" no item até ser aberto. Sem WhatsApp.
3. Atualização **só quando chega envio** (o formulário avisa o sistema); nada de consulta periódica ao Drive.
4. No topo da aba, **4 botões que copiam o link** de cada formulário: Contrato, Estratégia, Negócios, Catálogo.
5. Navegação por pastas dentro do sistema (cada envio do Catálogo é uma pasta do cliente) e **download em .zip de
   qualquer pasta** (loja inteira, pasta Fotos, um produto), além do download de arquivos soltos.
6. Os testes de ponta a ponta nos briefings só apagam o lead de teste (arquivo no Drive e linha no banco deles) com
   o ok do usuário.

## 3. O que cada formulário grava no Drive (levantado em 27/09/2026)

| Formulário | Pasta no Drive (id) | O que cada envio cria | Quem grava |
|---|---|---|---|
| `contrato.andrelopes.digital` | `Dados de contrato` (`1YmeAImZbMPZn-ulPNdmPBovEI5spME9w`) | 1 Google Doc `AAAA-MM-DD — Empresa — Representante` + 1 linha na planilha única `Respostas — Dados de contrato` (aba "Respostas", colunas Protocolo…Documento) | Apps Script "Dados de contrato — formulário" (repo `oandrelopesz/contratos`, pasta local `Sistemas/Contratos`) |
| `catalogo.andrelopes.digital` | `E-Commerce` (`1oLF5CdjoFhHotF9JYbykqiumUUy82fKm`) | pasta `Loja - Cliente` com a planilha `Catálogo - Loja` (aba "Produtos": Produto, Descrição, Preço de compra, Preço de venda, Lucro, Margem, Markup, Link do fornecedor, Fotos) e a pasta `Fotos` (produto com 1 foto: arquivo solto em `Fotos`; com 2+ fotos: subpasta `Fotos/<Produto>`); reenvio da mesma loja acrescenta linhas e fotos na mesma pasta | Apps Script "Catálogo e-commerce — formulário" (repo `oandrelopesz/catalogoecomm`, pasta local `Sistemas/Briefing E-Commerce`) |
| `estrategia.andrelopes.digital` | `Briefing/Estratégia` (`1gH_-_h9Al1jSiO2zzPSh9gbwhkpR6ZIZ`) | 1 `.txt` `<empresa ou nome> - AAAA-MM-DD HH-MM-SS.txt` com as perguntas numeradas e as respostas, separadas por uma linha de sublinhados | Lovable (projeto `uywiktoihqsafhuvtemo`): tabela `briefings` → função `processar-briefing` → `enviar-briefing` → Apps Script próprio; ao terminar, grava `briefings.exportado_drive_em` |
| `negocios.andrelopes.digital` | `Briefing/Negócios` (`1DhKMgqex14a-RuMof3Jht5Jx7nEQDYuP`) | igual ao de Estratégia (nome base: `empresa` ou `nome` ou `briefing-<id>`, com `\/:*?"<>|` trocados por `-`) | Lovable (projeto `mglhrffkopxmyigzqyoe`), mesmo fluxo |

Pastas de controle do Catálogo, **sempre escondidas** no sistema: `_rascunhos` (fotos de envios em andamento) e
`_teste` (lojas `[TESTE] …`).

Links dos formulários (botões de copiar): `https://contrato.andrelopes.digital/`, `https://estrategia.andrelopes.digital/`,
`https://negocios.andrelopes.digital/`, `https://catalogo.andrelopes.digital/`.

## 4. Visão geral

```
formulário ──grava──▶ Google Drive (fonte da verdade dos conteúdos)
     │
     └──avisa──▶ RPC registrar_envio_formulario ──▶ tabela formularios_envios ──Realtime──▶ navegador
                                                                                   │
                                           contador no menu ◀─────────────────────┤
                                           sub-aba aberta: relista a pasta no Drive
```

- O **Drive** é a única fonte dos conteúdos: a aba lista a pasta direto na Drive API v3, pelo navegador, com o token
  que a edge function `google-token` já entrega (mesmo caminho do Swipe file e da Agenda).
- A tabela **`formularios_envios`** guarda só os avisos (o que chegou, quando, se já foi visto). Ela alimenta o
  contador e o selo "Novo"; não é uma cópia do Drive.
- O Drive é lido quando a sub-aba é aberta e de novo quando chega um aviso daquele formulário com ela aberta. Não há
  consulta periódica.

## 5. Banco do sistema (migration nova)

```sql
CREATE TABLE public.formularios_envios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  formulario  text NOT NULL CHECK (formulario IN ('contrato','estrategia','negocios','catalogo')),
  chave       text NOT NULL UNIQUE,        -- evita aviso duplicado em reenvio: '<formulario>:<id do envio>'
  titulo      text NOT NULL,               -- empresa (contrato), "Loja - Cliente" (catálogo), nome base do .txt (briefings)
  drive_id    text,                        -- Doc (contrato) ou pasta da loja (catálogo); nulo nos briefings
  recebido_em timestamptz NOT NULL DEFAULT now(),
  visto_em    timestamptz
);
CREATE INDEX formularios_envios_nao_vistos ON public.formularios_envios (formulario) WHERE visto_em IS NULL;
```

- RLS ligado com a política aberta `FOR ALL USING (true)` de todas as tabelas do app; tabela na publicação
  `supabase_realtime`.
- **RPC `registrar_envio_formulario(p_formulario text, p_chave text, p_titulo text, p_drive_id text DEFAULT NULL)`**,
  `SECURITY DEFINER`: valida o formulário, corta o título em 200 caracteres e faz
  `INSERT … ON CONFLICT (chave) DO NOTHING`. É o único ponto de entrada dos formulários
  (`POST https://bnpvzguapunsztsdvmrs.supabase.co/rest/v1/rpc/registrar_envio_formulario` com a chave anon do app,
  que já é pública no site).
- Aplicada pelo SQL editor do Lovable, como as demais migrations do app.

## 6. Os avisos dos formulários

Regra comum: **o aviso nunca derruba o envio**. Qualquer falha (sistema fora do ar, rede, resposta inesperada) é
engolida e registrada no log do próprio formulário; a pessoa conclui normalmente e o arquivo cai no Drive do mesmo jeito.

### 6.1 Contrato (Apps Script)

- `server/handler.ts`: depois de `createDoc` e `appendRow`, chama `store.notify({ chave: 'contrato:' + (idEnvio ||
  protocolo), titulo: empresa.nome, driveId: <id do Doc> })` dentro de `try/catch`. O caminho de reenvio (`recall`
  devolveu protocolo) não avisa de novo; a `chave` única cobre o resto.
- `createDoc` passa a devolver também o id do Doc (hoje devolve só a URL).
- `apps-script/Code.js`: `notify` faz `UrlFetchApp.fetch(<RPC>, { method: 'post', muteHttpExceptions: true, … })`.
  URL e chave anon ficam em constantes no `Code.js`.
- `appsscript.json`: acrescentar o escopo `https://www.googleapis.com/auth/script.external_request`.
- Testes do repo (`server/handler.test.ts`, `server/gas.test.ts`): aviso chamado uma vez no envio novo, nenhuma vez no
  reenvio, e envio `ok` mesmo com `notify` lançando erro.

### 6.2 Catálogo (Apps Script)

- `server/handler.ts`: no fim de `registrar` (comum aos caminhos `enviar` e `concluir`), chama
  `backend.notify({ chave: 'catalogo:' + idEnvio, titulo: 'Loja - Cliente', driveId: <id da pasta da loja> })` em
  `try/catch`. Reenvio que devolve `resultadoGuardado` não avisa.
- `abrirLoja_` passa a expor o id da pasta da loja.
- Lojas `[TESTE] …` também avisam (é assim que o teste de ponta a ponta confere o fluxo); a aba não mostra `_teste`,
  mas abre o item pelo link direto (seção 8.5).
- Mesmas mudanças de `Code.js`, `appsscript.json` e testes do Contrato.

### 6.3 Ordem obrigatória para publicar um Apps Script com escopo novo

Um web app que roda como o dono **falha em todo envio** se o código novo pedir um escopo ainda não autorizado. Por isso:

1. `npm run gas:push` (envia o código; o deployment em uso continua na versão antiga).
2. O usuário abre o editor do Apps Script e roda a função nova `testarAviso()` — o editor pede a autorização do escopo
   novo (conta contato@) e a função grava um aviso `chave = '<formulario>:teste-autorizacao'`, que confirma o caminho
   até o sistema e é apagado depois direto no banco.
3. Só então `npx clasp update-deployment <id do deployment>` (a URL do formulário não muda).

### 6.4 Briefings Estratégia e Negócios (gatilho no banco de cada projeto)

- Migration em cada projeto (aplicada pelo SQL editor do Lovable do projeto): função
  `avisar_sistema_gestao()` + gatilho `AFTER UPDATE OF exportado_drive_em ON public.briefings`, disparando só quando
  `OLD.exportado_drive_em IS NULL AND NEW.exportado_drive_em IS NOT NULL` — momento em que o `.txt` já está no Drive.
- A função chama `net.http_post` (pg_net, já usado nesses bancos) para a RPC do sistema com
  `p_formulario` = `'estrategia'` ou `'negocios'`, `p_chave` = `'<formulario>:' || NEW.id`,
  `p_titulo` = o mesmo nome base que a função `processar-briefing` daquele projeto usa no arquivo
  (Estratégia: `empresa` → `nome` → `Lead`; Negócios: `empresa` → `nome` → `briefing-<id>`), `p_drive_id` nulo.
- `net.http_post` é assíncrono: falha do sistema não afeta o `UPDATE` nem o briefing.
- Nenhuma mudança nas telas nem nas edge functions dos briefings.

## 7. Acesso ao Drive

- `GOOGLE_SCOPES` (`src/lib/googleDrive.ts`) ganha `https://www.googleapis.com/auth/drive.readonly` (o `drive.file`
  continua, para o Swipe file). O app OAuth é interno do Workspace: sem verificação do Google.
- O usuário reconecta uma vez em Admin > Google Drive (consentimento com a conta contato@).
- A aba detecta token sem o escopo novo (403 `insufficientPermissions`/`ACCESS_TOKEN_SCOPE_INSUFFICIENT`) e mostra o
  aviso com o botão "Reconectar Google", como no Swipe e na Agenda.
- Chamadas usadas: `files.list` (filhos de uma pasta, `trashed = false`), `files.get?alt=media` (bytes originais),
  `files.export` (Docs e Planilhas). Módulo novo `src/lib/driveLeitura.ts` (só leitura; nada de escrita).

## 8. A aba

### 8.1 Rota e menu

- Rota `/dados-internos` (em `src/routes/_authenticated/`), search params `aba` (`contrato` | `negocios` |
  `estrategia` | `catalogo`), `pasta` (id de pasta) e `arquivo` (id de arquivo).
- Menu: grupo **Operação**, último item (pedido do usuário em 27/09/2026), rótulo "Dados internos", com contador de não vistos (some quando zero).
  Palavras de busca: briefing, contrato, catálogo, formulários, respostas.
- Clicar no item (ou no contador) abre a primeira sub-aba com novidades; sem novidades, a última usada.

### 8.2 Topo

Quatro botões **Contrato · Estratégia · Negócios · Catálogo**: um clique copia o link do formulário e mostra o toast
"Link copiado". Abaixo, as sub-abas com contador próprio.

### 8.3 Sub-abas

- **Briefing – Negócios / Briefing – Estratégia**: lista das respostas, mais nova primeiro. Cada linha mostra nome e
  data/hora extraídos do nome do arquivo (`JAO BOEIRA · 25/08/2026 15:26`; se o nome fugir do padrão, usa o nome
  inteiro e a data de criação no Drive) e o selo "Novo". Busca por nome.
- **Dados para contrato**: no topo, fixo, "Planilha de respostas"; abaixo, um item por Doc, mais novo primeiro.
- **Catálogos – E-Commerce**: uma pasta por loja (`Loja - Cliente`), ordenadas pela última modificação, com selo
  "Novo" em envio novo ou reenvio. Dentro da loja: a planilha (tabela) e a pasta Fotos (galeria).
- Qualquer pasta navega como no Drive, com trilha clicável (`E-Commerce › Loja X › Fotos › Produto`). Itens que
  alguém coloque à mão nas pastas aparecem normalmente.

### 8.4 Ver e baixar

| Tipo | Ver no sistema | Baixar |
|---|---|---|
| `.txt` dos briefings | perguntas e respostas formatadas (bloco a bloco pelo separador de sublinhados; linha `N - Pergunta` em destaque); botão para o texto original; se não reconhecer o formato, mostra o texto original | o `.txt` original, mesmo nome |
| outro texto (`txt`, `md`, `csv`, `json`) | texto em `<pre>`, como na aba Arquivos | original |
| Imagem (jpg, png, webp, gif) | galeria; clique amplia, setas navegam | original |
| PDF | visualizador em iframe, como na aba Arquivos | original |
| Google Doc | exportado para PDF só para exibir | Word (.docx) ou PDF |
| Google Planilha | primeira aba exportada em CSV e mostrada como tabela (rolagem horizontal no celular) | Excel (.xlsx) ou CSV |
| Outros (Word, Excel, zip…) | sem visualização | original |

- Todo item e toda pasta têm **"Abrir no Google"**, com `authuser=contato@andrelopes.digital` (o Chrome do usuário
  abre por padrão em outra conta).
- **Baixar pasta (.zip)** em toda pasta: percorre a árvore (sem `_rascunhos`/`_teste`), baixa os originais e
  converte Doc → .docx e Planilha → .xlsx; mantém a estrutura de pastas; arquivos entram sem recompressão (nível 0).
  Biblioteca `fflate`. Barra de progresso ("37 de 120 arquivos"); cancelável.
- "Original" = `files.get?alt=media`, os mesmos bytes do Drive, com o nome do arquivo no Drive.

### 8.5 Novo, visto e contador

- **Não vistos** = linhas de `formularios_envios` com `visto_em` nulo. O menu e as sub-abas assinam a tabela pelo
  Realtime (padrão do `NotificationBell`) e recontam a cada mudança.
- **Selo "Novo"** num item do Drive quando existe aviso não visto que corresponde a ele:
  - contrato e catálogo: `drive_id` igual ao id do Doc/pasta;
  - briefings: o `.txt` cujo nome começa com `titulo + " - "` (comparação sem acentos, caixa ou caracteres
    trocados) e foi criado entre 15 min antes e 2 min depois de `recebido_em`; sem correspondência pelo nome, o
    `.txt` mais recente criado nessa janela.
- Abrir o item grava `visto_em` nos avisos correspondentes. Cada sub-aba tem "Marcar tudo como visto". Aviso sem
  item correspondente conta no contador e é limpo por "Marcar tudo como visto".
- Link direto `?aba=…&pasta=…` / `?arquivo=…` abre o item mesmo fora das pastas listadas (usado nos testes com
  lojas `[TESTE]`).

## 9. Erros

| Situação | Comportamento |
|---|---|
| Google desconectado ou sem `drive.readonly` | aviso na aba + "Reconectar Google"; os botões de copiar link continuam funcionando |
| Falha ao listar ou baixar | toast com "Tentar de novo"; a lista já carregada continua na tela |
| Exportação acima do limite do Google (10 MB) | mensagem "Grande demais para visualizar aqui" + "Abrir no Google" |
| Aviso não chegou (sistema fora do ar) | o envio segue normal; o item aparece ao abrir a sub-aba, sem selo e sem contar |
| Falha em um arquivo no .zip | tenta de novo 2 vezes; persistindo, conclui o .zip e lista os que ficaram de fora |
| Realtime caiu | reconecta sozinho (cliente Supabase); ao voltar para a janela, recarrega a contagem |

## 10. Testes

- **Vitest (este repo)**: leitura do `.txt` em perguntas e respostas (formato real de um arquivo de cada briefing);
  nome e data a partir do nome do arquivo; correspondência aviso ↔ arquivo (acentos, caracteres trocados, janela de
  tempo); caminhos do .zip (subpastas, nomes repetidos, extensões de Doc/Planilha); parser de CSV (aspas, vírgulas e
  quebras de linha dentro de célula); menu com o item novo.
- **Repos dos Apps Scripts**: testes da seção 6.1/6.2 nos testes com Drive e planilha simulados que já existem.
- **Ponta a ponta** (navegador, após publicar):
  1. envio `[TESTE]` no Contrato e no Catálogo (dados válidos de CNPJ/CPF de teste) → contador sobe sem recarregar,
     lista atualiza se aberta, selo "Novo", visualização do Doc, da planilha e da galeria, downloads (original,
     .docx, .xlsx, .zip);
  2. limpeza com `limparTestes()` de cada Apps Script e remoção das linhas de teste em `formularios_envios`;
  3. um envio `[TESTE]` em cada briefing → aviso e correspondência com o `.txt`; o `.txt` e a linha em `briefings`
     só são apagados com o ok do usuário.

## 11. Fora do escopo

- Aviso por WhatsApp ou no sino de alertas.
- Ligar respostas a clientes, leads do CRM ou demandas.
- Editar, criar ou apagar qualquer coisa no Drive pela aba.
- Mudanças nas telas dos quatro formulários.

## 12. Ordem de entrega

1. Banco: `formularios_envios` + RPC + Realtime (migration aplicada).
2. Aba no sistema: escopo `drive.readonly`, leitura do Drive, sub-abas, visualização, downloads, .zip, contador e
   selos; publicar no Lovable; usuário reconecta o Google.
3. Apps Script do Contrato (seção 6.1 + ordem da 6.3) e teste de ponta a ponta.
4. Apps Script do Catálogo (seção 6.2 + ordem da 6.3) e teste de ponta a ponta.
5. Gatilhos dos dois briefings (seção 6.4) e teste de ponta a ponta com o ok do usuário para a limpeza.
