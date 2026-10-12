# Central de arquivos: plano

Pedido do André (12/10/2026): aba nova "Central de arquivos" com uma pasta por cliente (com busca) para guardar fotos do
cliente (pessoa) e logos da empresa, juntas na mesma pasta, com download no formato original, sem converter nada.
Armazenamento interno (Cloudflare R2, como Notas e Arquivos), sem Drive.

Decisões aprovadas no chat:
- Pastas = clientes do cadastro (`clientes`, `arquivado = false`, ordem alfabética). Cliente novo já tem pasta vazia.
- Aceita imagens (jpg, jpeg, png, webp, gif, svg, avif, heic, heif) com miniatura e arquivos de logo (ai, eps, pdf, psd,
  cdr) com ícone. Até 100 MB por arquivo.
- Sem tabela no banco: cada arquivo é a chave R2 `central/<cliente_id>/<AAAAMMDD-HHMMSS>-<nome original>`. A data na frente
  impede sobrescrever arquivo de mesmo nome. A lista do R2 dá pasta, nome e data.
- Miniatura pelo endereço fixo da função `r2` (`GET ?c=central/...` → 302 assinado), como Notas e Instagram.
- Download: baixa o blob original e salva com o nome original (bytes iguais, sem conversão).
- Apagar com confirmação. Sem etiqueta foto/logo, sem renomear, sem ligação com o Kit do Conteúdo (fica para depois).
- Arquivo `central/` não tem bucket antigo no Supabase: a Central usa funções só do R2 (listar e apagar); baixar usa
  `baixarComReserva`, que só cai na reserva se o R2 falhar.

Publicação: a função `r2` precisa ir ao ar (o `publicar.mjs` passa a publicar `r2` também). Sem migration.

## Itens

- [ ] X1 | files: supabase/functions/r2/index.ts | check: npx -y deno@2 check --node-modules-dir=none --no-lock supabase/functions/r2/index.ts | exec: haiku | `MODULOS` ganha `central: "central"`; o GET de endereço fixo aceita também `central/` (ajustar a mensagem do 403 e o comentário do topo)
- [ ] X2 | files: src/lib/r2Chaves.ts,src/lib/r2Chaves.test.ts,src/lib/r2.ts | check: npm test && npx tsc --noEmit -p . | exec: haiku | `central` em MODULOS_R2 (+ teste), `urlFixaR2` em r2Chaves, `listarR2` e `apagarR2` em r2.ts
- [ ] X3 | files: src/lib/centralRegras.ts,src/lib/centralRegras.test.ts | check: node --test src/lib/centralRegras.test.ts && npx tsc --noEmit -p . | exec: haiku | regras puras da Central, testes primeiro
- [ ] X4 | files: src/lib/central.ts | after: X2,X3 | check: npx tsc --noEmit -p . | exec: haiku | dados da Central (clientes, listar, enviar, baixar, apagar, miniatura)
- [ ] X5 | files: src/routes/_authenticated/central.tsx,src/components/central/,src/lib/nav.tsx,src/routeTree.gen.ts | after: X4 | check: npx tsc --noEmit -p . | exec: sonnet | tela, rota e item no menu

## Contratos

### X1 (função r2)
- `const MODULOS` passa a ser `{ arquivos: "pdfs", notas: "notas", fluxogramas: "fluxogramas", instagram: "instagram", central: "central" }`.
- No `GET ?c=`, a condição vira `!chave.startsWith("notas/") && !chave.startsWith("instagram/") && !chave.startsWith("central/")`,
  e a mensagem do 403: "Só as imagens das notas, as mídias do Instagram e a Central de arquivos têm endereço público."
- Comentário da linha 3: `GET ?c=notas/<arquivo> | instagram/<arquivo> | central/<arquivo>`.
- Nada mais muda (migrar/conferir não são usados para `central`).

### X2 (R2 no app)
- `src/lib/r2Chaves.ts`: `MODULOS_R2` ganha `central: "central"`. Nova função pura:
  `export function urlFixaR2(supabaseUrl: string, modulo: ModuloR2, caminho: string): string` →
  `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/r2?c=${encodeURIComponent(chaveR2(modulo, caminho))}`.
  `urlImagemNota` passa a ser `return urlFixaR2(supabaseUrl, "notas", arquivo);` (mesmo resultado).
- `src/lib/r2Chaves.test.ts`: o teste de `MODULOS_R2` inclui `central: "central"`; um teste novo de `urlFixaR2` com
  `("https://abc.supabase.co/", "central", "c1/20261012-101500-Logo Final.png")` →
  `"https://abc.supabase.co/functions/v1/r2?c=central%2Fc1%2F20261012-101500-Logo%20Final.png"`.
- `src/lib/r2.ts`, duas funções só do R2 (sem reserva no Supabase), ao lado das existentes, reaproveitando `chamar`:
  - `export async function listarR2(modulo: ModuloR2): Promise<string[]>`: `chamar({ acao: "listar", prefixo: \`${modulo}/\` })`
    e devolve as chaves sem o `<modulo>/` do começo.
  - `export async function apagarR2(modulo: ModuloR2, caminhos: string[]): Promise<void>`: em lotes de 1.000,
    `chamar({ acao: "apagar", chaves: lote.map((c) => chaveR2(modulo, c)) })`.
  - `export function urlFixa(modulo: ModuloR2, caminho: string): string` → `urlFixaR2(SUPABASE_URL, modulo, caminho)`.

### X3 (regras puras, `src/lib/centralRegras.ts`, sem imports)
Escrever os testes primeiro (`node:test` + `node:assert/strict`, como `r2Chaves.test.ts`), ver falhar, depois implementar.
- `export const EXT_IMAGEM = ["jpg", "jpeg", "png", "webp", "gif", "svg", "avif", "heic", "heif"] as const;`
- `export const EXT_LOGO = ["ai", "eps", "pdf", "psd", "cdr"] as const;`
- `export const ACEITA = [...EXT_IMAGEM, ...EXT_LOGO].map((e) => "." + e).join(",");` (para o `accept` do input)
- `export const TAMANHO_MAX = 100 * 1024 * 1024;`
- `export function extensao(nome: string): string`: o que vem depois do último ponto, minúsculo; "" sem ponto.
- `export function tipoArquivo(nome: string): "imagem" | "logo" | null` pela extensão (maiúscula ou minúscula).
- `export function motivoRecusa(nome: string, tamanho: number): string | null`:
  tipo null → `"<nome>: formato não aceito (imagens e AI, EPS, PDF, PSD, CDR)."`;
  tamanho > TAMANHO_MAX → `"<nome>: passa de 100 MB."`; senão null.
- `export function carimbo(agora: Date): string` → `AAAAMMDD-HHMMSS` no horário de Brasília (America/Sao_Paulo, via
  `Intl.DateTimeFormat("en-CA", { timeZone, hourCycle: "h23", ... })`). Ex.: `new Date("2026-10-12T13:05:09Z")` → `"20261012-100509"`.
- `export function nomeLimpo(nome: string): string`: troca `/`, `\` e caracteres de controle (código < 32 ou 127) por
  `-`, tira espaços das pontas; se passar de 150 caracteres, corta a base e mantém a extensão
  (`base.slice(0, 150 - ext.length - 1) + "." + ext`); vazio vira `"arquivo"`.
- `export function caminhoCentral(clienteId: string, nome: string, agora: Date): string` →
  `${clienteId}/${carimbo(agora)}-${nomeLimpo(nome)}`.
- `export function nomeOriginal(caminho: string): string`: a parte depois da primeira `/`, sem o prefixo
  `^\d{8}-\d{6}-` quando existir. Ex.: `"c1/20261012-100509-Logo.png"` → `"Logo.png"`.
- `export function dataDoCaminho(caminho: string): Date | null`: lê o carimbo (horário de Brasília, -03:00) ou null.
- `export function contarPorCliente(caminhos: string[]): Record<string, number>`: conta pela parte antes da primeira `/`
  (ignora caminho sem `/`).
- `export function arquivosDoCliente(caminhos: string[], clienteId: string): string[]`: os que começam com
  `${clienteId}/`, do mais novo para o mais antigo (ordem decrescente do caminho).
Testes cobrindo: tipoArquivo (PNG maiúsculo = imagem, .ai = logo, .docx = null, sem extensão = null), motivoRecusa
(formato e tamanho), carimbo (exemplo acima), nomeLimpo (barra, controle, nome longo mantendo extensão, vazio),
caminhoCentral + nomeOriginal ida e volta, dataDoCaminho, contarPorCliente, arquivosDoCliente (ordem).

### X4 (dados, `src/lib/central.ts`)
Comentário de topo no estilo dos outros `src/lib/*.ts`. Funções:
- `export async function fetchPastas(): Promise<{ id: string; nome: string }[]>`:
  `supabase.from("clientes").select("id, nome").eq("arquivado", false).order("nome")`, lança o erro.
- `export const listarCentral = () => listarR2("central");`
- `export async function enviarCentral(clienteId: string, arquivo: File, onProgresso?: (f: number) => void): Promise<string>`:
  `const motivo = motivoRecusa(arquivo.name, arquivo.size); if (motivo) throw new Error(motivo);`
  `const caminho = caminhoCentral(clienteId, arquivo.name, new Date());`
  `await enviarR2("central", caminho, arquivo, arquivo.type || "application/octet-stream", onProgresso); return caminho;`
- `export async function baixarCentral(caminho: string): Promise<void>`: `const blob = await baixarComReserva("central", caminho);`
  cria `URL.createObjectURL(blob)`, um `<a download={nomeOriginal(caminho)}>`, clica, remove e revoga a URL. Sem
  conversão nenhuma (o blob é o arquivo enviado).
- `export const apagarCentral = (caminho: string) => apagarR2("central", [caminho]);`
- `export const urlMiniatura = (caminho: string) => urlFixa("central", caminho);`

### X5 (tela, rota e menu)
- `src/lib/nav.tsx`, grupo Ferramentas, logo depois de "Arquivos":
  `{ label: "Central de arquivos", icon: <FolderOpen size={17} />, to: "/central", palavras: ["fotos", "logos", "logo", "imagens", "marca", "clientes", "banco de imagens"] }`
  (importar `FolderOpen` de lucide-react se ainda não estiver).
- `src/routes/_authenticated/central.tsx`: `createFileRoute("/_authenticated/central")` com `validateSearch` aceitando
  `cliente?: string` (pasta aberta; voltar = remover). Página `p-4 md:p-6`, título com ícone FolderOpen "Central de arquivos".
- `src/routeTree.gen.ts`: rota acrescentada À MÃO, copiando o padrão das linhas de `/conteudo` (não rodar o gerador nem o
  dev server). O `git diff` desse arquivo só pode ter linhas da Central.
- Componentes em `src/components/central/` (um ou dois arquivos):
  - **Pastas**: `Input` de busca ("Buscar cliente") com `useBusca(pastas, busca, (p) => [p.nome])` e `MensagemBusca`
    (ver como `src/routes/_authenticated/links.tsx` usa). Grade de cartões (2 colunas no celular, 4-5 no desktop), cada um
    com ícone de pasta, nome do cliente e "N arquivos" / "Vazia" (`contarPorCliente(listarCentral())`). Clique abre a pasta.
  - **Pasta aberta**: botão "Todas as pastas", nome do cliente, botão "Enviar" (input escondido `multiple accept={ACEITA}`).
    A área inteira aceita arrastar e soltar (destaque visual ao arrastar). Cada arquivo recusado por `motivoRecusa` vira
    `toast.error` e os outros sobem. Progresso por arquivo enquanto envia. Depois de enviar, recarrega a lista.
  - Grade de arquivos (`arquivosDoCliente`), cada cartão com: área quadrada de fundo quadriculado ou `bg-muted` (logo com
    fundo transparente aparece), `img` com `src={urlMiniatura(c)}`, `loading="lazy"`, `object-contain`; se der erro
    (HEIC no Chrome) ou for logo, ícone + extensão em maiúsculas. Embaixo: nome original (truncado, com `title`), data
    (`dataDoCaminho`, pt-BR), botão "Baixar" (`baixarCentral`, com estado de carregando) e "Apagar" com
    `AlertDialog` de confirmação ("Apagar <nome>? Não dá para desfazer.").
  - Pasta vazia: texto "Nenhum arquivo ainda. Arraste fotos e logos aqui ou clique em Enviar."
  - Erros em `toast.error(e.message)`. Textos em português.
- Funcionar no celular (390 px): grades em 2 colunas, botões que cabem.

## Depois dos itens
Revisão (Sonnet), commit, `publicar.mjs` com a função `r2`, teste no ar: enviar PNG, SVG e um PDF numa pasta de teste,
ver miniatura, baixar e comparar o hash com o original, apagar, buscar pasta, celular.
