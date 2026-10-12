# Aba Conteúdo: kit automático do cofre, ocultar clientes e conta do Instagram

Pedido do André (12/10/2026, aprovado no chat): na área Clientes da aba Conteúdo, listar todos os clientes com ocultar um a um e em massa; ligar sozinho a conta do Instagram (aba Instagram) pelo nome, com opção de trocar; e o kit vir pronto do Obsidian, inclusive as fontes (ele não quer escolher fonte), com Fontshare além do Google. Logo vem da pasta `Anexos` do cliente no cofre, arquivo com "logo" no nome.

Base: Fase 1 (`docs/superpowers/plans/2026-10-12-conteudo-fase-1.md`, spec `docs/superpowers/specs/2026-10-12-conteudo-automatico-design.md`). Leia os arquivos atuais antes de mudar; siga o estilo deles.

## Restrições

- Português do Brasil em tudo o que o André lê; sem travessão.
- Deno: sempre `npx -y deno@2 check --node-modules-dir=none --no-lock <arquivo>` (nunca `auto`, que reescreve a node_modules do site). Não rodar vite, `npm run dev` nem `npm run build`.
- Sem dependência nova. Tabelas novas não estão no `types.ts`: no front, `as any` como no `src/lib/conteudo.ts`.
- `supabase/functions/conteudo/regras.ts` e `prompts.ts` são importados pelo Node (testes e script): só sintaxe de tipos que o Node apaga (sem enum, namespace, parameter properties).

## Contratos

### `supabase/functions/conteudo/regras.ts` (K2)
- `Fonte.origem` passa a `"google" | "fontshare" | "arquivo"`.
- `normalizarNome(s: string): string`: minúsculas, sem acento, só `[a-z0-9]`. "Kobe Growth (teste)" → "kobegrowthteste".
- `slugFontshare(familia: string): string`: minúsculas, sem acento, o que não for `[a-z0-9]` vira `-`, sem `-` repetido nem nas pontas. "Clash Display" → "clash-display".
- `dimensoesImagem(bytes: Uint8Array): { largura: number; altura: number } | null`: PNG (assinatura e IHDR, largura e altura big-endian nos bytes 16 a 23); JPEG (percorre os marcadores até um SOF: C0 a C3, C5 a C7, C9 a CB, CD a CF; altura no deslocamento +5 e largura no +7 a partir do FF do marcador); SVG (texto com `<svg`: atributos `width`/`height` numéricos, senão `viewBox`); outro formato: `null`.
- `varianteDoNome(nome: string): VarianteLogo`: pelo nome normalizado sem acento: contém `clar`, `branc`, `negativ`, `white` ou `light` → `clara`; `escur`, `dark`, `pret` ou `black` → `escura`; `icone`, `icon`, `simbolo` ou `symbol` → `icone`; senão `principal`.
- `ehLogoDoCofre(caminho: string): boolean`: `/^Anexos\/[^/]*logo[^/]*\.(png|jpe?g|webp|svg)$/i`.
- `casarConta(nomeCliente: string, contas: { id: string; usuario: string; nome: string }[]): string | null`: `n = normalizarNome(nomeCliente)`; com `n.length < 3`, `null`. Candidatas: contas em que `normalizarNome(usuario)` ou `normalizarNome(nome)` contém `n`, ou em que `n` contém `normalizarNome(usuario)` com pelo menos 4 letras. Devolve o id só se houver exatamente uma candidata; senão `null`.
- `linkDrive(texto: string): string | null`: primeiro `https://drive.google.com/drive/(u/N/)?folders/<id>` do texto.
- `AGENDA_PADRAO: ItemAgenda[]` = segunda 09:00 carrossel, quarta 12:00 estático, sexta 18:00 carrossel (`dia` 1, 3 e 5).
- `montarContexto` passa a ignorar caminhos que começam com `Anexos/`.
- Testes novos em `src/lib/conteudoRegras.test.ts` para cada função acima (PNG e JPEG mínimos montados em bytes no próprio teste; SVG com viewBox; `casarConta` com uma, nenhuma e duas candidatas; Kobe: "Kobe Growth (teste)" casa com `{usuario: "kobegrowth"}`).

### `supabase/functions/conteudo/prompts.ts` (K3)
- `ESQUEMA_KIT = objeto({ tom_de_voz: string, fontes: array de objeto({ familia: string, reservas: array de string }), pilares: array de objeto({ nome: string, descricao: string }), saude: boolean })` (mesmo helper `objeto` do arquivo).
- `SYSTEM_KIT` (texto): "Você monta o kit de marca de um cliente de agência para posts de Instagram, só com o que está no cofre do cliente. tom_de_voz: de 4 a 8 linhas práticas de como escrever para o público do cliente (vocabulário, nível de formalidade, o que evitar, frase da marca se houver). fontes: as famílias citadas no design system, na ordem título, texto e números, cada uma com as reservas que o próprio design system indicar; nunca invente fonte que o cofre não cita; sem design system com fonte, lista vazia. pilares: de 3 a 5 pilares de conteúdo para o Instagram, a partir do negócio, do público e do método do cliente, com uma descrição curta. saude: true só se o cliente for clínica, consultório, médico, dentista, estética médica ou outra área regulada pelo CFM ou pelo CFO."
- Teste: `ESQUEMA_KIT.required` é `["tom_de_voz", "fontes", "pilares", "saude"]`.

### `render.ts` e `montagem.ts` (K4)
- `cssFontshare(familia: string): Promise<string>`: `GET https://api.fontshare.com/v2/css?f[]=<slugFontshare>@<pesos>&display=block`, tentando os pesos `300,400,500,600,700`, depois `400,700`, depois `1`; aceita a primeira resposta ok que contenha `@font-face`; senão `Error("A fonte <familia> não existe no Fontshare.")`. Conferir de verdade com `clash-display` e `satoshi` (devem funcionar) e um nome inventado (deve falhar).
- `resolverFonte(familia: string, reservas: string[]): Promise<Fonte | null>`: para cada nome em `[familia, ...reservas]`, tenta `cssGoogle` (dá `{ familia: nome, origem: "google" }`) e depois `cssFontshare` (`origem: "fontshare"`); devolve a primeira que funcionar; nenhuma, `null`. Google primeiro porque é a mesma regra das fontes já gravadas.
- `carregarRecursos` (montagem.ts) passa a aceitar `origem: "fontshare"` com `cssFontshare`.

### `index.ts` (K5)
- `cofre_sync`: aceita arquivo com `binario: true`, só quando `ehLogoDoCofre(caminho)` e o base64 tiver até 4.000.000 caracteres; decodifica, grava no R2 com `guardar` em `instagram/conteudo/cofre/<hash>.<ext>` (tipo pela extensão: png, jpeg, webp, svg+xml) e faz o upsert em `conteudo_cofre` com `conteudo` = essa chave. O resto continua como está.
- `cofre_ler` com pasta continua devolvendo só notas `.md` do kit (não devolve `Anexos/`).
- Nova ação `kit_do_cofre` `{ cliente_id }` → `{ kit: { fontes: number, logos: number, pilares: number, conta: boolean, drive: boolean, avisos: string[] } }`, com `acessoLiberado`:
  1. Lê a linha de `conteudo_clientes` com `clientes(nome)`; sem `pasta_cofre`, 400 "Escolha a pasta do cofre deste cliente.".
  2. Lê as linhas de `conteudo_cofre` da pasta; nenhuma, 400 "O cofre deste cliente ainda não foi sincronizado.".
  3. `design_system` = conteúdo da primeira nota `.md` cujo nome de arquivo contém "design system" (sem diferenciar maiúsculas); `tomNota` = a que contém "tom de voz".
  4. Claude: `gerarJson({ system: SYSTEM_KIT, conteudo: montarContexto(linhas), esquema: ESQUEMA_KIT, esforco: "low", maxTokens: 4000 })`.
  5. Fontes: `resolverFonte` de cada uma, na ordem, sem repetir família; a que não resolver vira aviso "Fonte X não encontrada no Google nem no Fontshare". Se nenhuma resolver, mantém as fontes atuais.
  6. Logos: para cada linha com `ehLogoDoCofre(caminho)`: `ler(chave)`, `dimensoesImagem` (sem medida, 0 por 0), `{ variante: varianteDoNome(nome do arquivo), chave, largura, altura }`. Junta com as logos atuais: a do cofre substitui a de mesma variante.
  7. Conta: se `ig_conta_id` está vazio, `casarConta(clientes.nome, contas ativas e não ocultas de ig_contas)`.
  8. Drive: se `drive_url` está vazio, `linkDrive` no texto das notas; achando, tenta `lerPastas` (erro vira aviso, não falha).
  9. Grava: `design_system` (se achou nota), `tom_de_voz` (`tomNota` ou o do Claude), `fontes`, `pilares` (se vierem), `saude`, `logos`, `ig_conta_id`, `drive_url`, `drive_pastas`, e `agenda = AGENDA_PADRAO` se a agenda estiver vazia; `updated_at`.
- `semana`: lê só `oculto = false`; cliente sem agenda é pulado em silêncio (sem entrada em `pulados`).

### `tools/cofre-sync/sync.mjs` (K6)
- Além das notas, envia as imagens de `Anexos/` com `ehLogoDoCofre`: lê em binário, hash sha256 dos bytes, envia `{ pasta, caminho: "Anexos/<arquivo>", hash, conteudo: <base64>, binario: true }`. Notas de texto como hoje. O controle de mudança (`mudancasCofre`) vale para os dois.

### `src/lib/conteudo.ts` (K7)
- `ClienteConteudo` ganha `oculto: boolean`.
- `kitDoCofre(clienteId: string)` → `chamar<{ kit: {...} }>({ acao: "kit_do_cofre", cliente_id })`.
- `ocultarClientes(ids: string[], oculto: boolean, linhas: ClienteConteudo[]): Promise<void>`: atualiza `oculto` nas linhas existentes (pelo `cliente_id`) e insere `{ cliente_id, oculto: true }` para quem ainda não tem linha (só quando `oculto` é true).

### Tela (K8)
- `src/components/conteudo/Clientes.tsx`:
  - Lista todos os clientes de `fetchClientesOpcoes()` (não arquivados) mais os já ligados que não estejam nela (ex.: a Kobe de teste, arquivada), em ordem de nome; sai o diálogo "Ligar cliente".
  - Campo de busca com o hook de busca tolerante usado nas outras abas (`useBusca`; ver um uso existente) e chave "Mostrar ocultos" (sem ela, os ocultos não aparecem; com ela, só os ocultos).
  - Card: caixa de seleção, nome, `@conta` (das contas de `fetchContas`) ou "Sem conta do Instagram", "Falta: ..." (de `faltaDoCliente`) ou "Pronto para gerar", ou "Ainda não configurado" quando não tem linha; botão de olho (Ocultar ou Mostrar) com `aria-label`.
  - Clicar num card sem linha: `ligarCliente({ cliente_id, pasta_cofre: pasta do cofre com o mesmo nome normalizado (normalizarNome) ou null, ig_conta_id: null })`, depois `kitDoCofre` com aviso "Puxando o kit do cofre..." (erro vira aviso, a gaveta abre mesmo assim), `recarregar` e abre a gaveta.
  - Barra flutuante de seleção em massa, no mesmo visual da `src/components/demandas/SelecaoBarra.tsx` (fixa embaixo): "N selecionados", "Selecionar todos (M)", "Ocultar" (ou "Mostrar" com a chave de ocultos ligada) e "Limpar".
- `src/components/conteudo/AbaKit.tsx`: botão "Puxar tudo do cofre" no topo (chama `kitDoCofre`, mostra os avisos e recarrega); a lista de fontes mostra a origem (Google Fonts, Fontshare ou arquivo); os controles de adicionar fonte ficam dentro de `<details>` "Ajustar fontes à mão"; o rascunho do formulário volta ao que está salvo quando `cliente.id`, `cliente.design_system` ou `cliente.tom_de_voz` mudarem.

---

## Itens de execução (Jev)

- [r] K1 | files: supabase/migrations/20261012180000_conteudo_oculto.sql | check: node --env-file=.env -e "fetch(process.env.VITE_SUPABASE_URL+'/rest/v1/conteudo_clientes?select=oculto&limit=1',{headers:{apikey:process.env.VITE_SUPABASE_PUBLISHABLE_KEY}}).then(r=>console.log(r.status))" | exec: sonnet | Migration idempotente: ALTER TABLE public.conteudo_clientes ADD COLUMN IF NOT EXISTS oculto boolean NOT NULL DEFAULT false; aplicar com o mesmo db push da Task 1 do plano da Fase 1 (conferir antes com migration list que só ela está pendente); o check deve dar 200
- [r] K2 | files: supabase/functions/conteudo/regras.ts,src/lib/conteudoRegras.test.ts | check: node --test src/lib/conteudoRegras.test.ts | exec: sonnet | Contratos de regras.ts acima, com os testes; rodar também npm test e npx tsc --noEmit -p .
- [r] K3 | files: supabase/functions/conteudo/prompts.ts,src/lib/conteudoRegras.test.ts | after: K2 | check: node --test src/lib/conteudoRegras.test.ts | exec: haiku | Contrato de prompts.ts acima (ESQUEMA_KIT, SYSTEM_KIT) e o teste do esquema; rodar também npx tsc --noEmit -p .
- [r] K4 | files: supabase/functions/conteudo/render.ts,supabase/functions/conteudo/montagem.ts | after: K2 | check: npx -y deno@2 check --node-modules-dir=none --no-lock supabase/functions/conteudo/montagem.ts | exec: sonnet | Contrato de render.ts e montagem.ts acima (cssFontshare, resolverFonte, fontshare no carregarRecursos), conferindo o Fontshare de verdade com curl
- [r] K5 | files: supabase/functions/conteudo/index.ts | after: K3,K4 | check: npx -y deno@2 check --node-modules-dir=none --no-lock supabase/functions/conteudo/index.ts | exec: sonnet | Contrato de index.ts acima (cofre_sync binário, kit_do_cofre, semana sem ocultos e sem aviso de quem não tem agenda)
- [r] K6 | files: tools/cofre-sync/sync.mjs | after: K2 | check: node --check tools/cofre-sync/sync.mjs | exec: sonnet | Contrato do script acima (logos de Anexos em binário); não rodar o script
- [r] K7 | files: src/lib/conteudo.ts | after: K3 | check: npx tsc --noEmit -p . | exec: haiku | Contrato de src/lib/conteudo.ts acima (oculto, kitDoCofre, ocultarClientes)
- [r] K8 | files: src/components/conteudo/Clientes.tsx,src/components/conteudo/AbaKit.tsx | after: K7 | check: npx tsc --noEmit -p . | exec: sonnet | Contrato da tela acima (lista com busca, ocultar um a um e em massa, ligar ao abrir com kit do cofre, Puxar tudo do cofre, fontes só leitura com ajuste à mão escondido); rodar também npm test
- [ ] K9 | after: K1,K5,K6,K8 | check: curl -s https://uajusldnvzgakffofkhl.supabase.co/functions/v1/conteudo | exec: opus | Sessão principal: publicar a função, rodar o script do cofre, "Puxar tudo do cofre" na Kobe, conferir fontes Clash Display e Satoshi e a logo, push do site e teste real

---

## Adendo: arquivos de fonte do cofre (pedido do André, 12/10/2026)

"Coloque a opção das fontes também serem puxadas direto do cofre." Leitura: (1) arquivos de fonte que estiverem na pasta do cliente no cofre são enviados e usados antes do Google e do Fontshare (serve para fonte própria); (2) botão "Puxar do cofre" na seção de fontes do Kit, que atualiza só as fontes.

### Contratos

- `regras.ts` (F1):
  - `ehFonteDoCofre(caminho: string): boolean`: `/^(Anexos|Fontes)\/[^/]+\.(woff2|woff|ttf|otf)$/i`.
  - `pesoDoNome(nome: string): number`: pelo nome normalizado (minúsculas, sem acento, sem separadores): `thin` ou `hairline` 100; `extralight` ou `ultralight` 200; `light` 300; `medium` 500; `semibold` ou `demibold` 600; `extrabold` ou `ultrabold` 800; `black` ou `heavy` 900; `bold` 700; senão 400. Testar na ordem certa (extralight antes de light, semibold e extrabold antes de bold).
  - `fontesDoCofre(familia: string, arquivos: { caminho: string; chave: string }[]): Fonte[]`: arquivos com `ehFonteDoCofre` cujo nome (sem extensão, `normalizarNome`) começa com `normalizarNome(familia)` e não contém `italic`; cada um vira `{ familia, origem: "arquivo", chave, peso: pesoDoNome(nome) }`, sem repetir peso (fica o primeiro, preferindo woff2, depois woff, ttf, otf), em ordem de peso.
  - Testes para os três.
- `tools/cofre-sync/sync.mjs` (F2): além das logos, envia em binário os arquivos que passam em `ehFonteDoCofre`, olhando `Anexos/` e `Fontes/`.
- `index.ts` (F3):
  - `cofre_sync`: aceita binário também quando `ehFonteDoCofre(caminho)` (tipos `font/woff2`, `font/woff`, `font/ttf`, `font/otf`), mesmo limite e mesma pasta no R2.
  - `kit_do_cofre`: para cada nome na ordem `[familia, ...reservas]`, primeiro `fontesDoCofre(nome, linhas com chave)` (se vier algo, usa todos os pesos e para), depois `resolverFonte(nome, [])`. Mantém o aviso de fonte não encontrada.
  - `kit_do_cofre` aceita `so_fontes: true`: faz o mesmo cálculo, mas grava só `fontes` (e `updated_at`).
- Tela (F4):
  - `src/lib/conteudo.ts`: `kitDoCofre(clienteId: string, soFontes = false)` manda `so_fontes`.
  - `AbaKit.tsx`: botão "Puxar do cofre" no cabeçalho da seção Fontes (ícone `FolderSync`, como os outros), que chama `kitDoCofre(cliente.id, true)`, mostra os avisos e recarrega; a lista mostra "arquivo do cofre" quando a chave começa com `instagram/conteudo/cofre/`.

### Itens

- [ ] F1 | files: supabase/functions/conteudo/regras.ts,src/lib/conteudoRegras.test.ts | check: node --test src/lib/conteudoRegras.test.ts | exec: sonnet | Contrato do adendo para regras.ts (ehFonteDoCofre, pesoDoNome, fontesDoCofre) com testes; rodar também npm test e npx tsc --noEmit -p .
- [ ] F2 | files: tools/cofre-sync/sync.mjs | after: F1 | check: node --check tools/cofre-sync/sync.mjs | exec: haiku | Contrato do adendo para o script (fontes de Anexos/ e Fontes/ em binário); não rodar o script
- [ ] F3 | files: supabase/functions/conteudo/index.ts | after: F1 | check: npx -y deno@2 check --node-modules-dir=none --no-lock supabase/functions/conteudo/index.ts | exec: sonnet | Contrato do adendo para index.ts (cofre_sync com fontes, kit_do_cofre com arquivos do cofre primeiro e so_fontes)
- [ ] F4 | files: src/lib/conteudo.ts,src/components/conteudo/AbaKit.tsx | after: F3,K8 | check: npx tsc --noEmit -p . | exec: haiku | Contrato do adendo para a tela (kitDoCofre com soFontes, botão Puxar do cofre nas fontes, rótulo arquivo do cofre)
