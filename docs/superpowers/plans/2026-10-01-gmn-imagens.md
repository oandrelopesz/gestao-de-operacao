# GMN: imagens em qualquer formato, logo intocável e imagens do site — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a logo do cliente sobe em qualquer formato de imagem e entra nas imagens da IA sem nenhuma modificação; fotos do
Drive valem em qualquer formato e tamanho; imagens e logo podem ser puxadas do site do cliente (com caixas de seleção) e a
descrição da foto ajuda o texto do post.

**Architecture:** o navegador converte qualquer imagem para PNG (logo) ou JPG (fotos do site); a função `gmn` gera a
imagem da IA **sem** logo, confere pessoas e texto e então aplica a logo original por cima com um leitor/gravador de PNG
próprio (compressão nativa do Deno, sem biblioteca). Para o Drive, formatos estranhos ou arquivos grandes usam a
miniatura que o próprio Google gera. A busca no site lê o HTML (e os `.js` de site montado por JavaScript) com funções
puras testadas em `node --test`.

**Tech Stack:** Deno (edge function `gmn`, Lovable Cloud), React + shadcn/ui, Supabase (Postgres), Cloudflare R2, OpenAI
(`gpt-6-luna` texto/visão, `gpt-image-2.5-flare` imagem), Google Drive API v3.

**Spec:** `docs/superpowers/specs/2026-09-29-gmn-posts-design.md`, **seção 12** (e 11, que ela emenda).

## Global Constraints

- Nada vai ao Google: `PUBLICACAO_LIBERADA = false` continua; aba no site em modo de teste.
- Nenhuma dependência nova no `package.json` (o Lovable instala com bun; ver cofre `_learnings/sem-dependencia-nova.md`).
  Na função, nada de biblioteca nova de imagem: o PNG é código próprio (`png.ts`).
- `supabase/functions/gmn/regras.ts`, `png.ts`, `compor.ts` e `site.ts` são **puros**: sem Deno/Node API (exceto
  `CompressionStream`/`DecompressionStream`/`Blob`/`Response`, que existem nos dois), sem `enum`, sem parameter
  properties; `regras.ts` sem nenhum import.
- Regra dura: sem pessoas geradas por IA salvo `permitir_pessoas_ia`; checagem por visão falha fechada; post nunca fica
  em `gerando` (prazo total 130 s); a logo **nunca** é desenhada pela IA.
- Mensagens ao usuário fixas, em português do Brasil, com acentos; erros externos (OpenAI, R2, Drive, sites) só no log.
- Arquivos da função: UTF-8 sem BOM, LF, quebra final. Arquivos de `src/`: mantenha o fim de linha de cada arquivo.
- Testes: `npm test` (`node --test src/lib/*.test.ts`); `npx tsc --noEmit -p tsconfig.json` sem saída.
- Commits em português terminando com exatamente uma linha
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Nunca `git stash`; nunca adicionar
  `src/routeTree.gen.ts`.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20261001170000_gmn_imagens.sql` (novo) | colunas da logo e das imagens do site; CHECKs com `site` |
| `supabase/functions/gmn/png.ts` (novo) | ler e gravar PNG 8 bits (RGB/RGBA) |
| `supabase/functions/gmn/compor.ts` (novo) | caixa da logo, redução por média de área, mistura pelo alfa |
| `supabase/functions/gmn/site.ts` (novo) | candidatos de imagem/logo a partir de HTML e de `.js` |
| `supabase/functions/gmn/regras.ts` | opções da logo, prompt sem logo, checagem sem logo, `decidirImagem` com site, descrição da imagem no prompt do post, Drive direto ou miniatura, `normalizarImagensSite` |
| `supabase/functions/gmn/openai.ts` | imagem só por `generations` em PNG; checagem sem logo; `descreverImagem` |
| `supabase/functions/gmn/google.ts` | lista toda imagem da pasta; baixa miniatura |
| `supabase/functions/gmn/conteudo.ts` | foto (Drive/site) antes do texto; IA → checagem → logo aplicada → PNG |
| `supabase/functions/gmn/index.ts` | `logo` só PNG (+ `origem_url`); ações `site`, `baixar_imagem`, `imagem_site` |
| `src/lib/gmnImagem.ts` (novo) | navegador: abrir qualquer imagem, converter para PNG (logo) ou JPG (foto) |
| `src/lib/gmn.ts` | tipos e chamadas novas |
| `src/components/gmn/AbaImagens.tsx` | aceitar qualquer imagem; opções e prévia da logo; seção "Do site" |
| `src/components/gmn/PerfilGaveta.tsx` | ligar o que é novo (opções da logo no rascunho; imagens do site gravadas na hora) |
| `src/components/gmn/PostsLista.tsx` | rótulo "Imagem do site" |
| `src/lib/gmnPng.test.ts`, `src/lib/gmnCompor.test.ts`, `src/lib/gmnSite.test.ts` (novos), `src/lib/gmnRegras.test.ts` | testes |

---

### Task 1: Migration

**Files:**
- Create: `supabase/migrations/20261001170000_gmn_imagens.sql`

**Interfaces:**
- Produces: colunas `gmn_perfis.logo_posicao`, `logo_tamanho`, `logo_fundo`, `logo_origem_url`, `imagens_site`;
  `imagem_origem = 'site'` e `gmn_imagens_uso.origem = 'site'` aceitos.

- [ ] **Step 1: Escrever a migration** (idempotente; os nomes dos CHECKs antigos são os que o Postgres gera para CHECK
  de coluna: `gmn_posts_imagem_origem_check` e `gmn_imagens_uso_origem_check` — o controlador confere no banco antes de
  aplicar)

```sql
-- GMN: logo em qualquer formato aplicada sem passar pela IA (posição, tamanho, fundo), logo escolhida do site e imagens
-- do site para os posts (2026-10-01).
ALTER TABLE public.gmn_perfis
  ADD COLUMN IF NOT EXISTS logo_posicao TEXT NOT NULL DEFAULT 'inferior_direito',
  ADD COLUMN IF NOT EXISTS logo_tamanho TEXT NOT NULL DEFAULT 'media',
  ADD COLUMN IF NOT EXISTS logo_fundo TEXT NOT NULL DEFAULT 'nenhum',
  ADD COLUMN IF NOT EXISTS logo_origem_url TEXT,
  ADD COLUMN IF NOT EXISTS imagens_site JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gmn_perfis_logo_opcoes_check') THEN
    ALTER TABLE public.gmn_perfis ADD CONSTRAINT gmn_perfis_logo_opcoes_check CHECK (
      logo_posicao IN ('superior_esquerdo', 'superior_direito', 'inferior_esquerdo', 'inferior_direito')
      AND logo_tamanho IN ('pequena', 'media', 'grande')
      AND logo_fundo IN ('nenhum', 'claro', 'escuro')
      AND jsonb_typeof(imagens_site) = 'array'
    );
  END IF;
END $$;

ALTER TABLE public.gmn_posts DROP CONSTRAINT IF EXISTS gmn_posts_imagem_origem_check;
ALTER TABLE public.gmn_posts ADD CONSTRAINT gmn_posts_imagem_origem_check
  CHECK (imagem_origem IN ('drive', 'google', 'ia', 'site'));

ALTER TABLE public.gmn_imagens_uso DROP CONSTRAINT IF EXISTS gmn_imagens_uso_origem_check;
ALTER TABLE public.gmn_imagens_uso ADD CONSTRAINT gmn_imagens_uso_origem_check
  CHECK (origem IN ('drive', 'google', 'site'));
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20261001170000_gmn_imagens.sql
git commit -m "GMN: migration das opções da logo e das imagens do site"
```

(O controlador aplica no banco pelo editor SQL do Lovable, depois de conferir os nomes dos CHECKs com
`SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid IN ('public.gmn_posts'::regclass,'public.gmn_imagens_uso'::regclass);`.)

---

### Task 2: PNG próprio e composição da logo (puros, TDD)

**Files:**
- Create: `supabase/functions/gmn/png.ts`, `supabase/functions/gmn/compor.ts`
- Modify: `supabase/functions/gmn/regras.ts` (tipos e normalização das opções da logo)
- Test: `src/lib/gmnPng.test.ts`, `src/lib/gmnCompor.test.ts`, `src/lib/gmnRegras.test.ts`

**Interfaces:**
- Produces (`png.ts`): `interface ImagemRgba { largura: number; altura: number; dados: Uint8Array }`,
  `lerPng(bytes: Uint8Array): Promise<ImagemRgba>`, `gravarPng(img: ImagemRgba): Promise<Uint8Array>`.
- Produces (`regras.ts`): `type PosicaoLogo`, `type TamanhoLogo`, `type FundoLogo`, `POSICOES_LOGO`, `TAMANHOS_LOGO`,
  `FUNDOS_LOGO`, `ROTULO_POSICAO_LOGO`, `ROTULO_TAMANHO_LOGO`, `ROTULO_FUNDO_LOGO`,
  `opcoesDaLogo(p: { logo_posicao?: unknown; logo_tamanho?: unknown; logo_fundo?: unknown }): { posicao: PosicaoLogo; tamanho: TamanhoLogo; fundo: FundoLogo }`.
- Produces (`compor.ts`): `LIMITE_LOGO`, `interface Caixa`, `caixaDaLogo(img, logo, tamanho, posicao, comFundo)`,
  `reduzir(src, largura, altura)`, `aplicarLogo(base, logo, { tamanho, posicao, fundo }): ImagemRgba`.

- [ ] **Step 1: Testes que falham** — `src/lib/gmnPng.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { gravarPng, lerPng, type ImagemRgba } from "../../supabase/functions/gmn/png.ts";

function imagem(largura: number, altura: number, alfa = 255): ImagemRgba {
  const dados = new Uint8Array(largura * altura * 4);
  for (let i = 0; i < largura * altura; i++) {
    dados[i * 4] = (i * 7) % 256; dados[i * 4 + 1] = (i * 13) % 256; dados[i * 4 + 2] = (i * 29) % 256; dados[i * 4 + 3] = alfa;
  }
  return { largura, altura, dados };
}

test("gravarPng/lerPng: ida e volta exata, opaca (sai RGB) e com transparência (sai RGBA)", async () => {
  for (const img of [imagem(37, 23), imagem(16, 9, 128)]) {
    const png = await gravarPng(img);
    assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(png[25], img.dados[3] === 255 ? 2 : 6); // tipo de cor no IHDR
    const volta = await lerPng(png);
    assert.equal(volta.largura, img.largura);
    assert.equal(volta.altura, img.altura);
    assert.deepEqual(volta.dados, img.dados);
  }
});

test("lerPng recusa o que não é PNG de 8 bits RGB/RGBA", async () => {
  await assert.rejects(lerPng(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), /não é PNG/);
  const png = await gravarPng(imagem(4, 4));
  const paleta = new Uint8Array(png);
  paleta[25] = 3; // tipo 3 (paleta) não é suportado
  await assert.rejects(lerPng(paleta), /não suportado/);
});
```

`src/lib/gmnCompor.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { aplicarLogo, caixaDaLogo, reduzir } from "../../supabase/functions/gmn/compor.ts";
import type { ImagemRgba } from "../../supabase/functions/gmn/png.ts";

const lisa = (largura: number, altura: number, cor: number[]): ImagemRgba => {
  const dados = new Uint8Array(largura * altura * 4);
  for (let i = 0; i < largura * altura; i++) dados.set(cor, i * 4);
  return { largura, altura, dados };
};

test("caixaDaLogo: cabe no limite sem deformar, nunca amplia, margem de 3% no canto escolhido", () => {
  const img = { largura: 1536, altura: 1024 };
  const c = caixaDaLogo(img, { largura: 600, altura: 240 }, "media", "inferior_direito", false);
  assert.deepEqual(c.logo, { x: 1152, y: 843, largura: 338, altura: 135 });
  assert.equal(c.fundo, null);
  const pequena = caixaDaLogo(img, { largura: 50, altura: 20 }, "grande", "superior_esquerdo", false);
  assert.deepEqual(pequena.logo, { x: 46, y: 46, largura: 50, altura: 20 }); // não amplia
  const comFundo = caixaDaLogo(img, { largura: 600, altura: 240 }, "pequena", "superior_direito", true);
  assert.ok(comFundo.fundo && comFundo.fundo.x < comFundo.logo.x && comFundo.fundo.largura > comFundo.logo.largura);
  assert.ok(Math.abs(comFundo.logo.largura / comFundo.logo.altura - 600 / 240) < 0.02); // mesma proporção
});

test("reduzir: média de área; logo menor que a caixa volta igual", () => {
  const src = lisa(4, 4, [200, 100, 50, 255]);
  const r = reduzir(src, 2, 2);
  assert.deepEqual([...r.dados.subarray(0, 4)], [200, 100, 50, 255]);
  assert.equal(reduzir(src, 8, 8), src);
});

test("aplicarLogo: pixel opaco da logo sai idêntico; fora da caixa nada muda; base intacta", () => {
  const base = lisa(300, 200, [10, 20, 30, 255]);
  const logo = lisa(40, 20, [250, 0, 0, 255]);
  logo.dados[3] = 0; // um pixel transparente na logo
  const out = aplicarLogo(base, logo, { tamanho: "grande", posicao: "inferior_esquerdo", fundo: "nenhum" });
  const { logo: cx } = caixaDaLogo(base, logo, "grande", "inferior_esquerdo", false);
  const i = ((cx.y + 5) * 300 + cx.x + 5) * 4;
  assert.deepEqual([...out.dados.subarray(i, i + 4)], [250, 0, 0, 255]);
  const t = (cx.y * 300 + cx.x) * 4; // pixel transparente da logo: fica a base
  assert.deepEqual([...out.dados.subarray(t, t + 4)], [10, 20, 30, 255]);
  assert.deepEqual([...out.dados.subarray(0, 4)], [10, 20, 30, 255]);
  assert.deepEqual([...base.dados.subarray(i, i + 4)], [10, 20, 30, 255]);
});

test("aplicarLogo com fundo claro pinta o retângulo atrás da logo", () => {
  const base = lisa(300, 200, [0, 0, 0, 255]);
  const logo = lisa(40, 20, [250, 0, 0, 255]);
  const out = aplicarLogo(base, logo, { tamanho: "media", posicao: "superior_direito", fundo: "claro" });
  const { fundo } = caixaDaLogo(base, logo, "media", "superior_direito", true);
  const j = ((fundo!.y + Math.floor(fundo!.altura / 2)) * 300 + fundo!.x + 2) * 4;
  assert.ok(out.dados[j] > 200 && out.dados[j + 1] > 200); // claro, com 88% de opacidade sobre preto
});
```

Em `src/lib/gmnRegras.test.ts` (acrescente):

```ts
test("opcoesDaLogo: valores válidos passam; o resto vira o padrão", () => {
  assert.deepEqual(opcoesDaLogo({}), { posicao: "inferior_direito", tamanho: "media", fundo: "nenhum" });
  assert.deepEqual(
    opcoesDaLogo({ logo_posicao: "superior_esquerdo", logo_tamanho: "grande", logo_fundo: "escuro" }),
    { posicao: "superior_esquerdo", tamanho: "grande", fundo: "escuro" },
  );
  assert.deepEqual(opcoesDaLogo({ logo_posicao: "meio", logo_tamanho: 3 }), { posicao: "inferior_direito", tamanho: "media", fundo: "nenhum" });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test` → falha por módulo inexistente / `opcoesDaLogo` não exportado.

- [ ] **Step 3: Implementar `regras.ts`** (perto de `decidirImagem`):

```ts
// ------------------------------------------------------------------ logo aplicada sobre a imagem da IA

export const POSICOES_LOGO = ["superior_esquerdo", "superior_direito", "inferior_esquerdo", "inferior_direito"] as const;
export type PosicaoLogo = (typeof POSICOES_LOGO)[number];
export const TAMANHOS_LOGO = ["pequena", "media", "grande"] as const;
export type TamanhoLogo = (typeof TAMANHOS_LOGO)[number];
export const FUNDOS_LOGO = ["nenhum", "claro", "escuro"] as const;
export type FundoLogo = (typeof FUNDOS_LOGO)[number];

export const ROTULO_POSICAO_LOGO: Record<PosicaoLogo, string> = {
  superior_esquerdo: "Canto superior esquerdo", superior_direito: "Canto superior direito",
  inferior_esquerdo: "Canto inferior esquerdo", inferior_direito: "Canto inferior direito",
};
export const ROTULO_TAMANHO_LOGO: Record<TamanhoLogo, string> = { pequena: "Pequena", media: "Média", grande: "Grande" };
export const ROTULO_FUNDO_LOGO: Record<FundoLogo, string> = { nenhum: "Sem fundo", claro: "Fundo claro", escuro: "Fundo escuro" };

/** Opções da logo do perfil; valor que não é um dos aceitos vira o padrão (inferior direito, média, sem fundo). */
export function opcoesDaLogo(p: { logo_posicao?: unknown; logo_tamanho?: unknown; logo_fundo?: unknown }) {
  const um = <T extends string>(lista: readonly T[], v: unknown, padrao: T): T =>
    (lista as readonly unknown[]).includes(v) ? (v as T) : padrao;
  return {
    posicao: um(POSICOES_LOGO, p.logo_posicao, "inferior_direito"),
    tamanho: um(TAMANHOS_LOGO, p.logo_tamanho, "media"),
    fundo: um(FUNDOS_LOGO, p.logo_fundo, "nenhum"),
  };
}
```

- [ ] **Step 4: Criar `supabase/functions/gmn/png.ts`** (código testado em protótipo: 1536x1024 lido em ~0,2 s e gravado em
  ~0,45 s, ida e volta idêntica)

```ts
// PNG sem biblioteca: lê e grava PNG de 8 bits por canal (RGB ou RGBA, sem entrelaçamento), com a compressão nativa
// (DecompressionStream/CompressionStream "deflate", que existem no Deno e no Node 18+). Serve para aplicar a logo sobre a
// imagem da IA sem mudar um pixel da logo.

export interface ImagemRgba { largura: number; altura: number; dados: Uint8Array } // RGBA, 4 bytes por pixel

const ASSINATURA = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

async function transformar(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const saida = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(saida).arrayBuffer());
}

function u32(b: Uint8Array, i: number): number {
  return ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
}

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(partes: Uint8Array[]): number {
  let c = 0xffffffff;
  for (const p of partes) for (let i = 0; i < p.length; i++) c = TABELA_CRC[(c ^ p[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Lê um PNG de 8 bits, RGB (tipo 2) ou RGBA (tipo 6), sem entrelaçamento. Outro formato lança erro. */
export async function lerPng(bytes: Uint8Array): Promise<ImagemRgba> {
  if (!ASSINATURA.every((v, i) => bytes[i] === v)) throw new Error("não é PNG");
  let largura = 0, altura = 0, tipo = -1;
  const idat: Uint8Array[] = [];
  for (let i = 8; i + 8 <= bytes.length;) {
    const tam = u32(bytes, i);
    const nome = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
    const ini = i + 8;
    if (nome === "IHDR") {
      largura = u32(bytes, ini);
      altura = u32(bytes, ini + 4);
      const prof = bytes[ini + 8];
      tipo = bytes[ini + 9];
      const entrelacado = bytes[ini + 12];
      if (prof !== 8 || (tipo !== 2 && tipo !== 6) || entrelacado !== 0) throw new Error("PNG em formato não suportado");
    } else if (nome === "IDAT") {
      idat.push(bytes.subarray(ini, ini + tam));
    } else if (nome === "IEND") break;
    i = ini + tam + 4;
  }
  if (!largura || !altura || !idat.length) throw new Error("PNG incompleto");
  const comprimido = new Uint8Array(idat.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of idat) { comprimido.set(p, o); o += p.length; }
  const cru = await transformar(comprimido, new DecompressionStream("deflate"));
  const bpp = tipo === 6 ? 4 : 3;
  const linha = largura * bpp;
  if (cru.length < altura * (linha + 1)) throw new Error("PNG corrompido");
  const px = new Uint8Array(altura * linha);
  for (let y = 0; y < altura; y++) {
    const filtro = cru[y * (linha + 1)];
    const src = y * (linha + 1) + 1;
    const dst = y * linha;
    const ant = dst - linha;
    for (let x = 0; x < linha; x++) {
      const a = x >= bpp ? px[dst + x - bpp] : 0;
      const b = y > 0 ? px[ant + x] : 0;
      const c = y > 0 && x >= bpp ? px[ant + x - bpp] : 0;
      let v = cru[src + x];
      if (filtro === 1) v += a;
      else if (filtro === 2) v += b;
      else if (filtro === 3) v += (a + b) >> 1;
      else if (filtro === 4) v += paeth(a, b, c);
      else if (filtro !== 0) throw new Error("PNG com filtro inválido");
      px[dst + x] = v & 0xff;
    }
  }
  if (bpp === 4) return { largura, altura, dados: px };
  const rgba = new Uint8Array(largura * altura * 4);
  for (let i = 0, j = 0; i < px.length; i += 3, j += 4) {
    rgba[j] = px[i]; rgba[j + 1] = px[i + 1]; rgba[j + 2] = px[i + 2]; rgba[j + 3] = 255;
  }
  return { largura, altura, dados: rgba };
}

function bloco(nome: string, dados: Uint8Array): Uint8Array {
  const n = new TextEncoder().encode(nome);
  const out = new Uint8Array(12 + dados.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, dados.length);
  out.set(n, 4);
  out.set(dados, 8);
  v.setUint32(8 + dados.length, crc32([n, dados]));
  return out;
}

function filtrar(f: number, v: number, a: number, b: number, c: number): number {
  return (f === 0 ? v : f === 1 ? v - a : f === 2 ? v - b : f === 3 ? v - ((a + b) >> 1) : v - paeth(a, b, c)) & 0xff;
}

/**
 * Grava PNG de 8 bits. Sem transparência (todo alfa 255) sai RGB, menor. Cada linha usa o filtro com a menor soma
 * absoluta (heurística padrão), o que deixa a foto bem menor que sem filtro.
 */
export async function gravarPng(img: ImagemRgba): Promise<Uint8Array> {
  const { largura, altura, dados } = img;
  let opaca = true;
  for (let i = 3; i < dados.length; i += 4) if (dados[i] !== 255) { opaca = false; break; }
  const bpp = opaca ? 3 : 4;
  const linha = largura * bpp;
  const px = new Uint8Array(altura * linha);
  if (opaca) {
    for (let i = 0, j = 0; i < dados.length; i += 4, j += 3) { px[j] = dados[i]; px[j + 1] = dados[i + 1]; px[j + 2] = dados[i + 2]; }
  } else px.set(dados);
  const cru = new Uint8Array(altura * (linha + 1));
  for (let y = 0; y < altura; y++) {
    const atual = y * linha;
    const ant = atual - linha;
    const viz = (x: number) => [
      x >= bpp ? px[atual + x - bpp] : 0, y > 0 ? px[ant + x] : 0, y > 0 && x >= bpp ? px[ant + x - bpp] : 0,
    ];
    let melhor = 0, menor = Infinity;
    for (let f = 0; f < 5; f++) {
      let soma = 0;
      for (let x = 0; x < linha && soma < menor; x++) {
        const [a, b, c] = viz(x);
        const r = filtrar(f, px[atual + x], a, b, c);
        soma += r < 128 ? r : 256 - r;
      }
      if (soma < menor) { menor = soma; melhor = f; }
    }
    cru[y * (linha + 1)] = melhor;
    for (let x = 0; x < linha; x++) {
      const [a, b, c] = viz(x);
      cru[y * (linha + 1) + 1 + x] = filtrar(melhor, px[atual + x], a, b, c);
    }
  }
  const comprimido = await transformar(cru, new CompressionStream("deflate"));
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, largura);
  v.setUint32(4, altura);
  ihdr[8] = 8;
  ihdr[9] = opaca ? 2 : 6;
  const partes = [new Uint8Array(ASSINATURA), bloco("IHDR", ihdr), bloco("IDAT", comprimido), bloco("IEND", new Uint8Array(0))];
  const out = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of partes) { out.set(p, o); o += p.length; }
  return out;
}
```

(Se a versão com `viz()` ficar mais lenta que ~0,6 s no 1536x1024, volte ao laço com as variáveis `a`, `b`, `c` inline do
protótipo em `scratchpad/proto/png.ts` — o comportamento é o mesmo.)

- [ ] **Step 5: Criar `supabase/functions/gmn/compor.ts`** (protótipo conferido: 39.686 de 39.686 pixels opacos da logo
  idênticos; 0 pixel mudado fora da caixa)

```ts
// Aplica a logo do cliente sobre a imagem (RGBA), sem a IA tocar na logo: só redução proporcional (média de área) e
// mistura pelo alfa. Funções puras (sem Deno/Node), testáveis com node --test.
import type { ImagemRgba } from "./png.ts";
import type { FundoLogo, PosicaoLogo, TamanhoLogo } from "./regras.ts";

/** Fração máxima da largura e da altura da imagem que a logo pode ocupar. */
export const LIMITE_LOGO: Record<TamanhoLogo, { largura: number; altura: number }> = {
  pequena: { largura: 0.16, altura: 0.14 },
  media: { largura: 0.22, altura: 0.18 },
  grande: { largura: 0.3, altura: 0.24 },
};

export interface Caixa { x: number; y: number; largura: number; altura: number }

/**
 * Onde a logo entra: cabe no limite do tamanho escolhido sem deformar (mesma proporção) e nunca é ampliada; margem de 3%
 * da largura da imagem até a borda (mais o respiro do fundo, quando houver).
 */
export function caixaDaLogo(
  img: { largura: number; altura: number }, logo: { largura: number; altura: number },
  tamanho: TamanhoLogo, posicao: PosicaoLogo, comFundo: boolean,
): { logo: Caixa; fundo: Caixa | null } {
  const lim = LIMITE_LOGO[tamanho];
  const escala = Math.min(1, (img.largura * lim.largura) / logo.largura, (img.altura * lim.altura) / logo.altura);
  const largura = Math.max(1, Math.round(logo.largura * escala));
  const altura = Math.max(1, Math.round(logo.altura * escala));
  const respiro = comFundo ? Math.round(img.largura * 0.012) : 0;
  const margem = Math.round(img.largura * 0.03);
  const direita = posicao.endsWith("direito");
  const baixo = posicao.startsWith("inferior");
  const x = direita ? img.largura - margem - respiro - largura : margem + respiro;
  const y = baixo ? img.altura - margem - respiro - altura : margem + respiro;
  return {
    logo: { x, y, largura, altura },
    fundo: comFundo ? { x: x - respiro, y: y - respiro, largura: largura + 2 * respiro, altura: altura + 2 * respiro } : null,
  };
}

/** Redução proporcional por média de área (com alfa pré-multiplicado, para a borda não escurecer). Nunca amplia. */
export function reduzir(src: ImagemRgba, largura: number, altura: number): ImagemRgba {
  if (largura >= src.largura && altura >= src.altura) return src;
  const out = new Uint8Array(largura * altura * 4);
  const ex = src.largura / largura, ey = src.altura / altura;
  for (let y = 0; y < altura; y++) {
    const y0 = y * ey, y1 = y0 + ey;
    for (let x = 0; x < largura; x++) {
      const x0 = x * ex, x1 = x0 + ex;
      let r = 0, g = 0, b = 0, a = 0, peso = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1) && sy < src.altura; sy++) {
        const wy = Math.min(sy + 1, y1) - Math.max(sy, y0);
        for (let sx = Math.floor(x0); sx < Math.ceil(x1) && sx < src.largura; sx++) {
          const w = wy * (Math.min(sx + 1, x1) - Math.max(sx, x0));
          const i = (sy * src.largura + sx) * 4;
          const al = src.dados[i + 3] * w;
          r += src.dados[i] * al; g += src.dados[i + 1] * al; b += src.dados[i + 2] * al; a += al; peso += w;
        }
      }
      const j = (y * largura + x) * 4;
      if (a > 0) { out[j] = Math.round(r / a); out[j + 1] = Math.round(g / a); out[j + 2] = Math.round(b / a); }
      out[j + 3] = Math.round(a / peso);
    }
  }
  return { largura, altura, dados: out };
}

function misturar(dst: Uint8Array, i: number, r: number, g: number, b: number, a: number) {
  if (a <= 0) return;
  if (a >= 255) { dst[i] = r; dst[i + 1] = g; dst[i + 2] = b; dst[i + 3] = 255; return; }
  const t = a / 255;
  dst[i] = Math.round(r * t + dst[i] * (1 - t));
  dst[i + 1] = Math.round(g * t + dst[i + 1] * (1 - t));
  dst[i + 2] = Math.round(b * t + dst[i + 2] * (1 - t));
  dst[i + 3] = 255;
}

/** Retângulo de cantos arredondados, cor sólida com opacidade (o fundo atrás da logo). */
function pintarFundo(img: ImagemRgba, c: Caixa, cor: [number, number, number], opacidade: number) {
  const raio = Math.round(Math.min(c.largura, c.altura) * 0.18);
  for (let y = Math.max(0, c.y); y < Math.min(img.altura, c.y + c.altura); y++) {
    for (let x = Math.max(0, c.x); x < Math.min(img.largura, c.x + c.largura); x++) {
      const dx = Math.max(c.x + raio - x - 0.5, 0, x + 0.5 - (c.x + c.largura - raio));
      const dy = Math.max(c.y + raio - y - 0.5, 0, y + 0.5 - (c.y + c.altura - raio));
      if (dx * dx + dy * dy > raio * raio) continue;
      misturar(img.dados, (y * img.largura + x) * 4, cor[0], cor[1], cor[2], Math.round(255 * opacidade));
    }
  }
}

/** Aplica a logo (em uma cópia da imagem) e devolve a imagem nova. A logo só é reduzida; cores e formas ficam iguais. */
export function aplicarLogo(
  base: ImagemRgba, logo: ImagemRgba, o: { tamanho: TamanhoLogo; posicao: PosicaoLogo; fundo: FundoLogo },
): ImagemRgba {
  const img: ImagemRgba = { largura: base.largura, altura: base.altura, dados: new Uint8Array(base.dados) };
  const { logo: cx, fundo } = caixaDaLogo(img, logo, o.tamanho, o.posicao, o.fundo !== "nenhum");
  if (fundo) pintarFundo(img, fundo, o.fundo === "claro" ? [255, 255, 255] : [17, 17, 17], 0.88);
  const l = reduzir(logo, cx.largura, cx.altura);
  for (let y = 0; y < l.altura; y++) {
    for (let x = 0; x < l.largura; x++) {
      const s = (y * l.largura + x) * 4;
      misturar(img.dados, ((cx.y + y) * img.largura + (cx.x + x)) * 4, l.dados[s], l.dados[s + 1], l.dados[s + 2], l.dados[s + 3]);
    }
  }
  return img;
}
```

- [ ] **Step 6: Rodar** — `npm test` → tudo verde. Conferir os bytes da função (sem BOM, LF, quebra final) com o comando
  de bytes do brief anterior.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/gmn/png.ts supabase/functions/gmn/compor.ts supabase/functions/gmn/regras.ts src/lib/gmnPng.test.ts src/lib/gmnCompor.test.ts src/lib/gmnRegras.test.ts
git commit -m "GMN: PNG próprio e aplicação da logo por cima da imagem, sem biblioteca"
```

---

### Task 3: A IA não toca mais na logo (função)

**Files:**
- Modify: `supabase/functions/gmn/regras.ts` (`EntradaImagem`, `montarPromptImagem`, `promptChecagemImagem`,
  `PROMPT_CHECAGEM_IMAGEM`), `supabase/functions/gmn/openai.ts`, `supabase/functions/gmn/conteudo.ts`,
  `supabase/functions/gmn/index.ts`
- Test: `src/lib/gmnRegras.test.ts`

**Interfaces:**
- Consumes: `lerPng`, `gravarPng` (Task 2); `aplicarLogo` (Task 2); `opcoesDaLogo`, `PosicaoLogo` (Task 2).
- Produces: `EntradaImagem.cantoLivre: PosicaoLogo | null` (substitui `comLogo`); `promptChecagemImagem(): string`
  (sem parâmetro); `gerarImagem(prompt, total?): Promise<string>` (PNG em base64); `checarImagem(b64, tipo, total?)`;
  ação `logo` com corpo `{ perfil_id, tipo: "image/png", base64, origem_url? }`.

- [ ] **Step 1: Testes que falham** (`src/lib/gmnRegras.test.ts`; troque os testes atuais de `comLogo` e de
  `promptChecagemImagem(true)` por estes)

```ts
test("montarPromptImagem: com canto livre pede o canto limpo e nunca fala em desenhar a logo", () => {
  const base = { nome: "Loja", categoria: "Loja de carros", briefing: BRIEFING_VAZIO, tema: "servico" as const, contextoImagens: null, permitirPessoas: false };
  const com = montarPromptImagem({ ...base, cantoLivre: "inferior_direito" });
  assert.match(com, /Deixe o canto inferior direito da imagem limpo/);
  assert.match(com, /Sem texto, letras, números, preços ou slogans na arte\./);
  assert.doesNotMatch(com, /referência|aplique-a|exceto a própria logo/i);
  const sem = montarPromptImagem({ ...base, cantoLivre: null });
  assert.doesNotMatch(sem, /Deixe o canto/);
  assert.match(sem, /Sem pessoas/);
});

test("promptChecagemImagem: pessoas e texto em destaque, sem exceção de logo", () => {
  const p = promptChecagemImagem();
  assert.equal(PROMPT_CHECAGEM_IMAGEM, p);
  for (const re of [/pessoa/i, /rosto/i, /silhueta/i, /ao fundo/i, /leg[ií]vel e em destaque/i]) assert.match(p, re);
  assert.doesNotMatch(p, /segunda imagem|logo/i);
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test`.

- [ ] **Step 3: `regras.ts`**
  - Em `EntradaImagem`, troque `comLogo: boolean` por:
    ```ts
    /** Canto onde a logo será aplicada depois (a IA deixa o canto limpo); null sem logo. A IA nunca desenha a logo. */
    cantoLivre: PosicaoLogo | null;
    ```
    (mova o bloco "logo aplicada sobre a imagem da IA" da Task 2 para **antes** de `EntradaImagem`, se precisar.)
  - Em `montarPromptImagem`, troque as duas linhas que dependem de `e.comLogo` por:
    ```ts
    "Sem texto, letras, números, preços ou slogans na arte.",
    ```
    e, no lugar da linha "Use a imagem de referência…":
    ```ts
    e.cantoLivre
      ? `Deixe o canto ${ROTULO_POSICAO_LOGO[e.cantoLivre].replace(/^Canto /, "").toLowerCase()} da imagem limpo, com fundo simples e sem nenhum objeto importante: a logo da marca será aplicada ali depois.`
      : "",
    ```
  - Troque `promptChecagemImagem(comLogo: boolean)` por:
    ```ts
    export function promptChecagemImagem(): string {
      return "Olhe a imagem e responda em JSON. " +
        "tem_pessoas é true se houver qualquer pessoa, rosto, mão, corpo, silhueta ou reflexo de pessoa, mesmo pequena, parcial ou ao fundo. " +
        "tem_texto é true só se houver escrita legível e em destaque na arte (frases, letras, números, preços, slogans, letreiros, " +
        "placas de carro legíveis, marcas de terceiros); ignore marcas minúsculas e ilegíveis.";
    }

    /** O pedido da checagem (a imagem conferida é a da IA, ainda sem a logo). */
    export const PROMPT_CHECAGEM_IMAGEM = promptChecagemImagem();
    ```

- [ ] **Step 4: `openai.ts`**
  - Apague `interface Logo` e o caminho `/images/edits` de `gerarImagem`. Nova versão:
    ```ts
    /**
     * PNG gerado pela OpenAI (paisagem), em base64, como a OpenAI devolveu. Sempre sem a logo: ela é aplicada depois, por
     * cima, pela função (compor.ts), para nunca ser redesenhada. PNG porque a composição lê PNG sem biblioteca.
     */
    export async function gerarImagem(prompt: string, total?: AbortSignal): Promise<string> {
      const model = Deno.env.get("OPENAI_MODELO_IMAGEM") || "gpt-image-1";
      // quality "medium": o padrão ("auto") pode sair em "high", mais lento e caro.
      const d = await chamar("/images/generations", {
        model, prompt, size: "1536x1024", quality: "medium", n: 1, output_format: "png",
      }, PRAZO.imagem, total, "imagem");
      const b64 = d?.data?.[0]?.b64_json;
      if (!b64 || typeof b64 !== "string") throw new Error("OpenAI não devolveu a imagem.");
      return b64;
    }
    ```
  - `checarImagem(imagemB64: string, tipoMime: string, total?: AbortSignal)`: tire o parâmetro `logo`, a segunda
    `image_url` e use `promptChecagemImagem()`.

- [ ] **Step 5: `conteudo.ts`**
  - Imports: `import { lerPng, gravarPng } from "./png.ts";`, `import { aplicarLogo } from "./compor.ts";`,
    `opcoesDaLogo` de `./regras.ts`; tire `type Logo`.
  - `baixarLogo(url, total): Promise<Uint8Array>`: mesmas travas (só `R2_PUBLIC_BASE`, até 6 MB) e devolve os bytes;
    se os 8 primeiros bytes não forem a assinatura PNG, lança `"logo não é PNG"`.
  - Nova constante `const AVISO_APLICAR_LOGO = "Não foi possível aplicar a logo na imagem.";`.
  - `imagemDaIa`:
    ```ts
    async function imagemDaIa(
      perfil: any, postId: string, tema: Tema, prazoFinal: number, total?: AbortSignal,
    ): Promise<{ imagem: Imagem | null; aviso: string | null }> {
      const permitirPessoas = !!perfil.permitir_pessoas_ia;
      const opcoes = opcoesDaLogo(perfil);
      let logoPng: Uint8Array | null = null;
      if (perfil.logo_url) {
        try {
          logoPng = await baixarLogo(String(perfil.logo_url), total);
        } catch (e) {
          console.error("Logo do perfil:", msg(e));
          return { imagem: null, aviso: AVISO_LOGO };
        }
      }
      let versaoAnterior: { tem_pessoas: boolean; tem_texto: boolean } | null = null;
      for (const tentativa of [1, 2] as const) {
        const prompt = montarPromptImagem({
          nome: perfil.nome, categoria: perfil.categoria, briefing: normalizarBriefing(perfil.briefing), tema,
          contextoImagens: perfil.contexto_imagens ?? null, permitirPessoas,
          cantoLivre: logoPng ? opcoes.posicao : null, versaoAnterior,
        });
        const b64 = await gerarImagem(prompt, total);
        // A checagem roda na imagem da IA, ainda sem a logo.
        const c = await checarImagem(b64, "image/png", total);
        const decisao = decisaoChecagem(tentativa, c, prazoFinal - Date.now(), permitirPessoas);
        if (decisao === "desistir") return { imagem: null, aviso: AVISO_PESSOAS_OU_TEXTO };
        if (decisao === "repetir") {
          versaoAnterior = permitirPessoas ? { tem_pessoas: false, tem_texto: c.tem_texto } : c;
          continue;
        }
        let bytes = base64ParaBytes(b64);
        if (logoPng) {
          try {
            const final = aplicarLogo(await lerPng(bytes), await lerPng(logoPng), opcoes);
            bytes = await gravarPng(final);
          } catch (e) {
            console.error("Aplicar a logo:", msg(e));
            return { imagem: null, aviso: AVISO_APLICAR_LOGO };
          }
        }
        const chave = `${perfil.id}/${postId}.png`;
        const url = await enviarR2(chave, bytes, "image/png", total);
        return { imagem: { origem: "ia" as const, ref: chave, url }, aviso: null };
      }
      return { imagem: null, aviso: AVISO_PESSOAS_OU_TEXTO };
    }
    ```
  - Atualize o comentário de `imagemDaIa` (sem "logo como referência"; "logo aplicada por cima, sem a IA").

- [ ] **Step 6: `index.ts` — ação `logo` só PNG**
  - Import `lerPng` de `./png.ts`.
  - Em `acaoLogo`: `tipo` diferente de `"image/png"` → `ErroHttp(400, "Não foi possível ler a logo enviada.")`; mantém o
    teto de 5 MB; troque `ASSINATURA_LOGO` pela assinatura PNG; depois de decodificar, `await lerPng(bytes)` dentro de
    `try` (falhou → 400 `"Não foi possível ler a logo enviada."`), para garantir que a composição vai conseguir ler.
    Chave sempre `logos/<perfil>-<carimbo>.png`. `origem_url`: string http(s) de até 2.000 caracteres ou `null`; grava
    `logo_url` e `logo_origem_url` juntos.
  - `acaoRemoverLogo` zera `logo_url` e `logo_origem_url`.
  - Atualize o comentário do topo (`logo`: "PNG convertido pela tela, até 5 MB; origem_url opcional").

- [ ] **Step 7: Verificar** — `npm test`; sintaxe e bytes da função (comandos do brief anterior em
  `.superpowers/sdd/gmn-contexto/backend-brief.md`, se ainda existir, ou: `node -e` com `typescript.transpileModule` em
  cada `.ts` de `supabase/functions/gmn`); `npx tsc --noEmit -p tsconfig.json`.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/gmn/regras.ts supabase/functions/gmn/openai.ts supabase/functions/gmn/conteudo.ts supabase/functions/gmn/index.ts src/lib/gmnRegras.test.ts
git commit -m "GMN: a IA gera a imagem sem a logo e a função aplica a logo original por cima"
```

---

### Task 4: Logo em qualquer formato e opções da logo (tela)

**Files:**
- Create: `src/lib/gmnImagem.ts`
- Modify: `src/lib/gmn.ts`, `src/components/gmn/AbaImagens.tsx`, `src/components/gmn/PerfilGaveta.tsx`

**Interfaces:**
- Consumes: ação `logo` (Task 3); `opcoesDaLogo`, `POSICOES_LOGO`, `TAMANHOS_LOGO`, `FUNDOS_LOGO`, rótulos (Task 2);
  `caixaDaLogo` de `supabase/functions/gmn/compor.ts` (Task 2, para a prévia).
- Produces (`gmnImagem.ts`): `ACEITA_IMAGENS`, `normalizarLogo(arquivo: Blob): Promise<Blob>`,
  `normalizarFoto(arquivo: Blob): Promise<Blob>`, `blobParaBase64(b: Blob): Promise<string>`.
- Produces (`gmn.ts`): `PerfilGmn` com `logo_posicao`, `logo_tamanho`, `logo_fundo`, `logo_origem_url`,
  `imagens_site: ImagemSite[]`; `enviarLogo(perfilId, arquivo: Blob, origemUrl?: string | null): Promise<string>`.

- [ ] **Step 1: Criar `src/lib/gmnImagem.ts`**

```ts
// Conversão de imagens no navegador: qualquer formato que o navegador abre vira PNG (logo, com transparência) ou JPG
// (foto). Assim a função recebe sempre um formato que ela lê, e o arquivo original pode ter qualquer tamanho.

/** O seletor de arquivo mostra toda imagem (e os formatos que alguns sistemas não marcam como imagem). */
export const ACEITA_IMAGENS = "image/*,.heic,.heif,.avif,.svg,.ico,.bmp,.tif,.tiff,.jfif,.webp";

export const LOGO_LADO_MAX = 1024;
export const FOTO_LADO_MAX = 2048;
export const FOTO_MAX_BYTES = 5 * 1024 * 1024;

export const NAO_ABRIU =
  "Não foi possível abrir esta imagem neste navegador. Formatos como HEIC e TIFF só abrem no Safari: salve como PNG ou JPG e envie de novo.";

interface Aberta { fonte: CanvasImageSource; largura: number; altura: number; vetor: boolean; fechar: () => void }

async function abrir(arquivo: Blob): Promise<Aberta> {
  const inicio = await arquivo.slice(0, 256).text().catch(() => "");
  const vetor = arquivo.type === "image/svg+xml" || /^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(inicio);
  if (!vetor) {
    try {
      const bmp = await createImageBitmap(arquivo);
      return { fonte: bmp, largura: bmp.width, altura: bmp.height, vetor, fechar: () => bmp.close() };
    } catch { /* alguns formatos só abrem pelo <img> */ }
  }
  const url = URL.createObjectURL(vetor ? new Blob([await arquivo.arrayBuffer()], { type: "image/svg+xml" }) : arquivo);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const largura = img.naturalWidth || (vetor ? LOGO_LADO_MAX : 0);
    const altura = img.naturalHeight || (vetor ? LOGO_LADO_MAX : 0);
    if (!largura || !altura) throw new Error(NAO_ABRIU);
    return { fonte: img, largura, altura, vetor, fechar: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error(NAO_ABRIU);
  }
}

function desenhar(a: Aberta, ladoMax: number, fundoBranco: boolean): HTMLCanvasElement {
  // Nunca amplia imagem de pixels; SVG (vetor) é desenhado já no tamanho máximo.
  const escala = Math.min(a.vetor ? Infinity : 1, ladoMax / Math.max(a.largura, a.altura));
  const largura = Math.max(1, Math.round(a.largura * escala));
  const altura = Math.max(1, Math.round(a.altura * escala));
  const c = document.createElement("canvas");
  c.width = largura;
  c.height = altura;
  const g = c.getContext("2d");
  if (!g) throw new Error(NAO_ABRIU);
  if (fundoBranco) { g.fillStyle = "#ffffff"; g.fillRect(0, 0, largura, altura); }
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(a.fonte, 0, 0, largura, altura);
  return c;
}

function paraBlob(c: HTMLCanvasElement, tipo: string, qualidade?: number): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error(NAO_ABRIU))), tipo, qualidade));
}

/** Logo: PNG com transparência, lado maior até 1.024 px. */
export async function normalizarLogo(arquivo: Blob): Promise<Blob> {
  const a = await abrir(arquivo);
  try {
    return await paraBlob(desenhar(a, LOGO_LADO_MAX, false), "image/png");
  } finally {
    a.fechar();
  }
}

/** Foto: JPG (fundo branco onde era transparente), lado maior até 2.048 px e até 5 MB (baixa a qualidade se precisar). */
export async function normalizarFoto(arquivo: Blob): Promise<Blob> {
  const a = await abrir(arquivo);
  try {
    let lado = FOTO_LADO_MAX;
    for (let i = 0; i < 4; i++) {
      const c = desenhar(a, lado, true);
      for (const q of [0.9, 0.8, 0.7]) {
        const b = await paraBlob(c, "image/jpeg", q);
        if (b.size <= FOTO_MAX_BYTES) return b;
      }
      lado = Math.round(lado * 0.75);
    }
    throw new Error("A imagem ficou grande demais mesmo reduzida.");
  } finally {
    a.fechar();
  }
}

/** Conteúdo em base64, sem o prefixo `data:...;base64,`. */
export function blobParaBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => { const r = String(leitor.result ?? ""); resolve(r.slice(r.indexOf(",") + 1)); };
    leitor.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    leitor.readAsDataURL(b);
  });
}
```

- [ ] **Step 2: `src/lib/gmn.ts`**
  - `PerfilGmn` ganha:
    ```ts
    logo_posicao: PosicaoLogo; logo_tamanho: TamanhoLogo; logo_fundo: FundoLogo;
    /** URL do site de onde a logo veio (a caixa "Usar esta logo" aparece marcada nela); null se foi enviada do computador. */
    logo_origem_url: string | null;
    /** Imagens do site marcadas para os posts (gravadas na hora, fora do "Salvar imagens"). */
    imagens_site: ImagemSite[];
    ```
    com `import { ..., type PosicaoLogo, type TamanhoLogo, type FundoLogo, type ImagemSite } from ".../regras.ts"`
    (`ImagemSite` vem da Task 6; até lá, declare-a nesta task em `regras.ts`:
    `export interface ImagemSite { id: string; url: string; origem_url: string; descricao: string }` e
    `normalizarImagensSite`, ver Task 6 Step 3 — se a Task 6 já tiver criado, só importe).
  - `CAMPOS_PERFIL` inclui `logo_posicao, logo_tamanho, logo_fundo, logo_origem_url, imagens_site`. `fetchPerfis` passa
    `imagens_site` por `normalizarImagensSite` e as opções por `opcoesDaLogo` (como já faz com `agenda`/`briefing`).
  - Apague `LOGO_TIPOS`, `LOGO_MAX_BYTES` e `lerBase64`. Novo `enviarLogo`:
    ```ts
    /** Converte a imagem (qualquer formato que o navegador abre) para PNG e grava como a logo do perfil. */
    export async function enviarLogo(perfilId: string, arquivo: Blob, origemUrl: string | null = null): Promise<string> {
      const png = await normalizarLogo(arquivo);
      const base64 = await blobParaBase64(png);
      const d = await chamar<{ logo_url: string }>({ acao: "logo", perfil_id: perfilId, tipo: "image/png", base64, origem_url: origemUrl });
      return d.logo_url;
    }
    ```
  - `PostGmn.imagem_origem` aceita `"site"`.

- [ ] **Step 3: `PerfilGaveta.tsx`** — `ajustesImagens` grava também `logo_posicao`, `logo_tamanho`, `logo_fundo`
  (entram no "Salvar imagens" e na marca de alterado). Depois de enviar ou remover a logo, o rascunho e o "salvo"
  recebem `logo_url` **e** `logo_origem_url` (null no envio do computador).

- [ ] **Step 4: `AbaImagens.tsx`**
  - `accept={ACEITA_IMAGENS}`; `aria-label="Arquivo da logo (qualquer imagem)"`.
  - Texto de ajuda da logo: "Opcional. Qualquer imagem (PNG, JPG, WEBP, SVG…), de qualquer tamanho: ela é convertida
    para PNG antes de subir. Se houver logo, ela é aplicada por cima de toda imagem gerada pela IA, exatamente como é (a
    IA nunca a redesenha). As fotos do Drive e do site vão como estão. A logo é gravada assim que você envia. A remoção
    também vale na hora."
  - Abaixo da logo, três `Select` (com `Label htmlFor` e `aria-label`): "Posição da logo" (`ROTULO_POSICAO_LOGO`),
    "Tamanho" (`ROTULO_TAMANHO_LOGO`), "Fundo atrás da logo" (`ROTULO_FUNDO_LOGO`), mudando o rascunho
    (`onDados({ logo_posicao })` etc.).
  - **Prévia da posição** (só com logo): uma caixa 3:2 (`aspect-[3/2]`, `max-w-sm`, fundo neutro em degradê, texto
    "Imagem da IA" bem claro no centro) com a logo em `position:absolute`, posicionada com `caixaDaLogo({largura:1536,
    altura:1024}, {largura: naturalWidth, altura: naturalHeight}, tamanho, posicao, fundo !== "nenhum")` convertida em
    porcentagem (`left = x/1536*100%`, `top = y/1024*100%`, `width = largura/1536*100%`); com fundo, um `div` atrás com
    `rounded-md` e `bg-white/90` ou `bg-neutral-900/90`. `naturalWidth/Height` vêm do `onLoad` da `<img>` da logo.
    Legenda: "Prévia de onde a logo entra. A posição e o tamanho valem depois de Salvar imagens."

- [ ] **Step 5: Verificar** — `npx tsc --noEmit -p tsconfig.json` sem saída; `npm test`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/gmnImagem.ts src/lib/gmn.ts src/components/gmn/AbaImagens.tsx src/components/gmn/PerfilGaveta.tsx supabase/functions/gmn/regras.ts
git commit -m "GMN: logo em qualquer formato de imagem (convertida no navegador) e opções de posição, tamanho e fundo"
```

---

### Task 5: Fotos do Drive em qualquer formato e tamanho

**Files:**
- Modify: `supabase/functions/gmn/regras.ts`, `supabase/functions/gmn/google.ts`, `supabase/functions/gmn/conteudo.ts`
- Test: `src/lib/gmnRegras.test.ts`

**Interfaces:**
- Produces (`regras.ts`): `fotoDiretaDoDrive(mime: string, tamanho: number): boolean`,
  `miniaturaGrande(link: string, lado?: number): string`, `descricaoDaFoto(descricao: string | null | undefined, nome: string): string`.
- Produces (`google.ts`): `interface ImagemDrive { id; name; mimeType; size: number; description: string; thumbnailLink: string | null }`,
  `baixarMiniatura(token, link, total?): Promise<{ bytes: Uint8Array; tipo: "image/jpeg" | "image/png" }>`.
- Produces (`conteudo.ts`): `Imagem` ganha `descricao: string`.

- [ ] **Step 1: Testes que falham**

```ts
test("fotoDiretaDoDrive: só JPG/PNG de até 5 MB vão direto; o resto usa a miniatura do Google", () => {
  assert.equal(fotoDiretaDoDrive("image/jpeg", 1_000_000), true);
  assert.equal(fotoDiretaDoDrive("image/png", 5 * 1024 * 1024), true);
  assert.equal(fotoDiretaDoDrive("image/png", 5 * 1024 * 1024 + 1), false);
  assert.equal(fotoDiretaDoDrive("image/heif", 900_000), false);
  assert.equal(fotoDiretaDoDrive("image/webp", 10), false);
});

test("miniaturaGrande: troca o tamanho do link de miniatura (ou acrescenta) por =s2048", () => {
  assert.equal(miniaturaGrande("https://lh3.googleusercontent.com/drive-storage/abc=s220"), "https://lh3.googleusercontent.com/drive-storage/abc=s2048");
  assert.equal(miniaturaGrande("https://lh3.googleusercontent.com/abc=w400-h300"), "https://lh3.googleusercontent.com/abc=s2048");
  assert.equal(miniaturaGrande("https://lh3.googleusercontent.com/abc"), "https://lh3.googleusercontent.com/abc=s2048");
});

test("descricaoDaFoto: descrição do Drive vence; sem ela, o nome sem extensão e sem _-", () => {
  assert.equal(descricaoDaFoto("Fachada da loja à noite", "IMG_1.jpg"), "Fachada da loja à noite");
  assert.equal(descricaoDaFoto("", "fachada-da-loja_2024.HEIC"), "fachada da loja 2024");
});
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: `regras.ts`**

```ts
const LIMITE_FOTO_DIRETA = 5 * 1024 * 1024;

/** Foto do Drive que pode ir como está (JPG ou PNG de até 5 MB). O resto usa a miniatura que o Google gera. */
export function fotoDiretaDoDrive(mime: string, tamanho: number): boolean {
  return (mime === "image/jpeg" || mime === "image/png") && tamanho <= LIMITE_FOTO_DIRETA;
}

/** Link de miniatura do Drive no tamanho grande (o sufixo `=s220`, `=w400-h300` etc. vira `=s2048`). */
export function miniaturaGrande(link: string, lado = 2048): string {
  return /=[a-z0-9-]+$/i.test(link) ? link.replace(/=[a-z0-9-]+$/i, `=s${lado}`) : `${link}=s${lado}`;
}

/** O que a foto mostra, para o texto do post: a descrição do arquivo no Drive ou, sem ela, o nome sem extensão. */
export function descricaoDaFoto(descricao: string | null | undefined, nome: string): string {
  const d = (descricao ?? "").trim();
  if (d) return d.slice(0, 300);
  return nome.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
}
```

- [ ] **Step 4: `google.ts`**
  - `imagensDaPasta`: consulta `... and trashed = false and mimeType contains 'image/'`, `fields: "files(id,name,mimeType,size,description,thumbnailLink)"`,
    sem o filtro de tamanho; devolve `size: Number(f.size || 0)`, `description: f.description ?? ""`,
    `thumbnailLink: f.thumbnailLink ?? null`. Atualize o comentário ("toda imagem direto na pasta…").
  - Novo:
    ```ts
    /** Miniatura grande que o Google gera (JPG ou PNG), para formatos como HEIC/WEBP ou arquivos acima de 5 MB. */
    export async function baixarMiniatura(token: string, link: string, total?: AbortSignal): Promise<{ bytes: Uint8Array; tipo: "image/jpeg" | "image/png" }> {
      return await comPrazo("miniatura do Drive", async (signal) => {
        const r = await fetch(miniaturaGrande(link), { headers: { Authorization: `Bearer ${token}` }, signal });
        if (!r.ok) throw new Error(`Drive respondeu ${r.status} ao baixar a miniatura`);
        const bytes = new Uint8Array(await r.arrayBuffer());
        const png = bytes[0] === 0x89 && bytes[1] === 0x50;
        const jpg = bytes[0] === 0xff && bytes[1] === 0xd8;
        if (!png && !jpg) throw new Error("miniatura do Drive não veio em JPG nem PNG");
        if (bytes.length > 5 * 1024 * 1024) throw new Error("miniatura do Drive grande demais");
        return { bytes, tipo: png ? "image/png" : "image/jpeg" };
      }, total);
    }
    ```

- [ ] **Step 5: `conteudo.ts` — `imagemDoDrive`**
  - `type Imagem = { origem: "drive" | "ia" | "site"; ref: string; url: string; descricao: string }` (a IA usa
    `descricao: ""`).
  - Depois de escolher pelo rodízio, tente até 3 fotos (a escolhida e as próximas pela mesma ordem do rodízio,
    excluindo as que falharem): `fotoDiretaDoDrive(f.mimeType, f.size)` → `baixarDoDrive` (tipo = mime);
    senão, com `thumbnailLink` → `baixarMiniatura`; sem miniatura ou erro → próxima. Grava no R2 com a extensão do tipo
    real e registra o uso só da foto que entrou. Nenhuma serviu → `"vazia"`. Devolve
    `descricao: descricaoDaFoto(f.description, f.name)`.
  - O aviso de pasta vazia vira: `"A pasta do Drive não tem nenhuma foto que deu para usar."`.

- [ ] **Step 6: Verificar** (`npm test`, sintaxe, bytes, `tsc`) e **commit**

```bash
git add supabase/functions/gmn/regras.ts supabase/functions/gmn/google.ts supabase/functions/gmn/conteudo.ts src/lib/gmnRegras.test.ts
git commit -m "GMN: fotos do Drive em qualquer formato e tamanho (miniatura do Google quando não for JPG/PNG de até 5 MB)"
```

---

### Task 6: Imagens do site — leitura, ações e uso nos posts (função)

**Files:**
- Create: `supabase/functions/gmn/site.ts`
- Modify: `supabase/functions/gmn/regras.ts`, `supabase/functions/gmn/openai.ts`, `supabase/functions/gmn/conteudo.ts`,
  `supabase/functions/gmn/index.ts`
- Test: `src/lib/gmnSite.test.ts`, `src/lib/gmnRegras.test.ts`

**Interfaces:**
- Produces (`site.ts`): `interface CandidatoSite { url; descricao; fonte: "img" | "og" | "icone" | "jsonld" | "bundle" | "css"; logo: boolean }`,
  `imagensDoHtml(html, paginaUrl)`, `imagensDoBundle(js, bundleUrl)`, `scriptsDoSite(html, paginaUrl, max?)`,
  `deduplicar(lista)`, `separarCandidatos(lista): { logos: CandidatoSite[]; imagens: CandidatoSite[] }`,
  `urlPublicaHttp(u: string): URL | null`.
- Produces (`regras.ts`): `interface ImagemSite { id: string; url: string; origem_url: string; descricao: string }`,
  `normalizarImagensSite(v: unknown): ImagemSite[]`; `decidirImagem({ comImagem, temPasta, temSite, usaIa })` →
  `"drive" | "site" | "ia" | null`; `EntradaPost.descricaoImagem: string | null`.
- Produces (`openai.ts`): `descreverImagem(url: string, total?): Promise<string>`.
- Produces (`index.ts`): ações
  - `site` `{ perfil_id, url? }` → `{ logos: CandidatoSite[], imagens: CandidatoSite[] }` (não grava nada);
  - `baixar_imagem` `{ url }` → **bytes da imagem** com `Content-Type` da imagem (não JSON);
  - `imagem_site` `{ perfil_id, base64 (JPG), origem_url, descricao }` → `{ imagens_site: ImagemSite[] }`.

- [ ] **Step 1: Testes que falham** — `src/lib/gmnSite.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { deduplicar, imagensDoBundle, imagensDoHtml, scriptsDoSite, separarCandidatos, urlPublicaHttp } from "../../supabase/functions/gmn/site.ts";

const HTML = `<!doctype html><html><head>
<meta property="og:image" content="/img/capa.jpg"><meta property="og:image:alt" content="Fachada da loja">
<link rel="icon" href="/favicon.svg"><link rel="apple-touch-icon" href="https://cdn.loja.com/apple.png">
<script type="application/ld+json">{"@type":"AutoDealer","name":"Loja X","logo":"https://cdn.loja.com/logo-x.png","image":"/img/loja.webp"}</script>
<script type="module" src="/assets/index-abc123.js"></script>
</head><body>
<header><img class="site-logo" src="/img/marca.svg" alt="Loja X"></header>
<figure><img src="/img/patio.jpg" alt=""><figcaption>Pátio com <b>40 seminovos</b></figcaption></figure>
<img src="data:image/gif;base64,R0lGOD" alt="pixel"><img srcset="/img/sedan-480.jpg 480w, /img/sedan-1200.jpg 1200w" alt="Sedã prata">
<div style="background-image:url('/img/fundo.png')"></div>
</body></html>`;

test("imagensDoHtml: og, ícones, JSON-LD, img com legenda/alt/srcset e CSS; logo marcada; data: fora", () => {
  const r = imagensDoHtml(HTML, "https://www.loja.com/");
  const por = (u: string) => r.find((c) => c.url === u);
  assert.equal(por("https://www.loja.com/img/capa.jpg")?.descricao, "Fachada da loja");
  assert.equal(por("https://www.loja.com/favicon.svg")?.logo, true);
  assert.equal(por("https://cdn.loja.com/logo-x.png")?.logo, true);
  assert.equal(por("https://www.loja.com/img/marca.svg")?.logo, true);
  assert.equal(por("https://www.loja.com/img/patio.jpg")?.descricao, "Pátio com 40 seminovos");
  assert.equal(por("https://www.loja.com/img/sedan-1200.jpg")?.descricao, "Sedã prata");
  assert.ok(por("https://www.loja.com/img/fundo.png"));
  assert.ok(por("https://www.loja.com/img/loja.webp"));
  assert.ok(!r.some((c) => c.url.startsWith("data:")));
});

test("scriptsDoSite e imagensDoBundle: só .js do próprio site; caminhos de imagem dentro do .js", () => {
  assert.deepEqual(scriptsDoSite(HTML, "https://www.loja.com/"), ["https://www.loja.com/assets/index-abc123.js"]);
  const js = `const a="/assets/hero-9f8e.jpg",b='https://cdn.x.com/logo-brand.png',c="/api/dados.json";`;
  const r = imagensDoBundle(js, "https://www.loja.com/assets/index-abc123.js");
  assert.deepEqual(r.map((c) => c.url), ["https://www.loja.com/assets/hero-9f8e.jpg", "https://cdn.x.com/logo-brand.png"]);
  assert.equal(r[1].logo, true);
});

test("deduplicar soma descrição e marca de logo; separarCandidatos limita e ordena", () => {
  const d = deduplicar([
    { url: "https://a/1.png", descricao: "", fonte: "img", logo: false },
    { url: "https://a/1.png", descricao: "Logo A", fonte: "jsonld", logo: true },
  ]);
  assert.deepEqual(d, [{ url: "https://a/1.png", descricao: "Logo A", fonte: "img", logo: true }]);
  const muitos = Array.from({ length: 60 }, (_, i) => ({ url: `https://a/${i}.jpg`, descricao: "", fonte: "img" as const, logo: i < 12 }));
  const s = separarCandidatos(muitos);
  assert.equal(s.logos.length, 8);
  assert.equal(s.imagens.length, 40);
  assert.ok(s.imagens.every((c) => !c.logo));
});

test("urlPublicaHttp: só http(s) e host público", () => {
  assert.ok(urlPublicaHttp("https://www.loja.com/x.jpg"));
  for (const u of ["file:///etc/passwd", "http://localhost/x", "http://127.0.0.1/x", "http://10.0.0.5/x", "http://192.168.1.2/x", "http://169.254.169.254/x", "http://[::1]/x", "ftp://a/x", "nada"]) {
    assert.equal(urlPublicaHttp(u), null, u);
  }
});
```

Em `src/lib/gmnRegras.test.ts` (substitua o teste atual de `decidirImagem` e acrescente):

```ts
test("decidirImagem: Drive > site > IA; só texto pula tudo", () => {
  const b = { comImagem: true, temPasta: false, temSite: false, usaIa: false };
  assert.equal(decidirImagem({ ...b, comImagem: false, temPasta: true }), null);
  assert.equal(decidirImagem({ ...b, temPasta: true, temSite: true, usaIa: true }), "drive");
  assert.equal(decidirImagem({ ...b, temSite: true, usaIa: true }), "site");
  assert.equal(decidirImagem({ ...b, usaIa: true }), "ia");
  assert.equal(decidirImagem(b), null);
});

test("normalizarImagensSite: só itens completos, sem id repetido", () => {
  assert.deepEqual(normalizarImagensSite(null), []);
  assert.deepEqual(
    normalizarImagensSite([{ id: "a", url: "https://r2/a.jpg", origem_url: "https://s/a.jpg", descricao: "Pátio" }, { id: "a", url: "x" }, { url: "y" }, 3]),
    [{ id: "a", url: "https://r2/a.jpg", origem_url: "https://s/a.jpg", descricao: "Pátio" }],
  );
});

test("montarMensagensPost: com descrição da imagem pede texto coerente com a foto", () => {
  const e = { nome: "Loja", categoria: null, briefing: BRIEFING_VAZIO, saude: false, tema: "servico" as const, palavras: [], anteriores: [], motivoReprovacao: null, contextoPosts: null };
  assert.match(montarMensagensPost({ ...e, descricaoImagem: "Pátio com sedãs" }).user, /A imagem do post mostra: Pátio com sedãs\. Escreva de forma coerente com ela, sem descrever a foto\./);
  assert.doesNotMatch(montarMensagensPost({ ...e, descricaoImagem: null }).user, /A imagem do post mostra/);
});
```

(Os testes antigos que chamam `montarMensagensPost` sem `descricaoImagem` passam a enviar `descricaoImagem: null`.)

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: `regras.ts`**

```ts
export interface ImagemSite { id: string; url: string; origem_url: string; descricao: string }

/** jsonb `imagens_site` → lista válida (itens com id, url e origem_url em texto; id repetido: o primeiro vence). */
export function normalizarImagensSite(v: unknown): ImagemSite[] {
  const out: ImagemSite[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    const url = typeof o.url === "string" ? o.url : "";
    const origem = typeof o.origem_url === "string" ? o.origem_url : "";
    if (!id || !url || !origem || out.some((i) => i.id === id)) continue;
    out.push({ id, url, origem_url: origem, descricao: typeof o.descricao === "string" ? o.descricao.slice(0, 300) : "" });
  }
  return out;
}
```

  - `decidirImagem(o: { comImagem: boolean; temPasta: boolean; temSite: boolean; usaIa: boolean }): "drive" | "site" | "ia" | null`
    (`!comImagem` → null; `temPasta` → "drive"; `temSite` → "site"; `usaIa` → "ia"; senão null). Atualize o comentário.
  - `EntradaPost` ganha `descricaoImagem: string | null`; em `montarMensagensPost`, depois do tema:
    `e.descricaoImagem ? \`A imagem do post mostra: ${e.descricaoImagem}. Escreva de forma coerente com ela, sem descrever a foto.\` : ""`.

- [ ] **Step 4: Criar `supabase/functions/gmn/site.ts`** — o código do protótipo (`scratchpad/proto/site.ts`, testado
  em andrelopes.digital e wikipedia.org) **mais** as duas funções abaixo. Cópia integral:

```ts
// Leitura das imagens e da logo de um site, só por texto (HTML e, em site montado por JavaScript, os arquivos .js).
// Funções puras: recebem o texto e a URL da página e devolvem candidatos com URL absoluta.

export interface CandidatoSite {
  url: string;
  descricao: string; // alt, título, legenda ou og:image:alt (pode ficar vazio)
  fonte: "img" | "og" | "icone" | "jsonld" | "bundle" | "css";
  logo: boolean; // tem cara de logo (alt/classe/nome com "logo", ícone, JSON-LD logo)
}

const EXT_IMAGEM = /\.(png|jpe?g|jfif|webp|avif|gif|svg|bmp|ico|heic|heif|tiff?)(\?[^"'\s)]*)?$/i;

function atributos(tag: string): Record<string, string> {
  const r: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    r[m[1].toLowerCase()] = (m[3] ?? m[4] ?? m[5] ?? "").trim();
  }
  return r;
}

function decodificar(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ").trim();
}

function absoluta(u: string, base: string): string | null {
  const v = decodificar(u);
  if (!v || v.startsWith("data:") || v.startsWith("blob:") || v.startsWith("javascript:")) return null;
  try {
    const url = new URL(v, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/** A maior imagem de um srcset ("a.jpg 480w, b.jpg 1200w" → b.jpg). */
function maiorDoSrcset(srcset: string): string | null {
  let melhor: string | null = null, maior = -1;
  for (const parte of srcset.split(",")) {
    const [u, d] = parte.trim().split(/\s+/);
    const n = d ? parseFloat(d) : 1;
    if (u && n > maior) { maior = n; melhor = u; }
  }
  return melhor;
}

const PARECE_LOGO = /logo|logotipo|marca|brand/i;

/** Candidatos de imagem e de logo no HTML de uma página. */
export function imagensDoHtml(html: string, paginaUrl: string): CandidatoSite[] {
  const out: CandidatoSite[] = [];
  const add = (u: string | null | undefined, descricao: string, fonte: CandidatoSite["fonte"], logo: boolean) => {
    const url = u ? absoluta(u, paginaUrl) : null;
    if (url) out.push({ url, descricao: decodificar(descricao).slice(0, 300), fonte, logo });
  };
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = atributos(m[0]);
    const nome = (a.property || a.name || "").toLowerCase();
    if (nome === "og:image" || nome === "og:image:url" || nome === "og:image:secure_url" || nome === "twitter:image") {
      add(a.content, "", "og", false);
    }
    if (nome === "og:logo") add(a.content, "", "og", true);
  }
  const ogAlt = /<meta\b[^>]*(?:property|name)\s*=\s*["']og:image:alt["'][^>]*>/i.exec(html);
  if (ogAlt) { const a = atributos(ogAlt[0]); for (const c of out) if (c.fonte === "og" && !c.descricao) c.descricao = decodificar(a.content ?? ""); }
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const a = atributos(m[0]);
    const rel = (a.rel || "").toLowerCase();
    if (/(^|\s)(icon|apple-touch-icon|mask-icon)(\s|$)/.test(rel)) add(a.href, "", "icone", true);
  }
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const visitar = (v: unknown) => {
        if (!v || typeof v !== "object") return;
        if (Array.isArray(v)) { v.forEach(visitar); return; }
        const o = v as Record<string, unknown>;
        const logo = o.logo;
        if (typeof logo === "string") add(logo, String(o.name ?? ""), "jsonld", true);
        else if (logo && typeof logo === "object" && typeof (logo as Record<string, unknown>).url === "string") {
          add((logo as Record<string, string>).url, String(o.name ?? ""), "jsonld", true);
        }
        const image = o.image;
        if (typeof image === "string") add(image, String(o.name ?? ""), "jsonld", false);
        for (const k of Object.keys(o)) if (k !== "logo" && k !== "image") visitar(o[k]);
      };
      visitar(JSON.parse(m[1]));
    } catch { /* JSON-LD quebrado: ignora */ }
  }
  // <figure> com legenda: a legenda vira a descrição da imagem de dentro
  const legendas = new Map<string, string>();
  for (const m of html.matchAll(/<figure\b[\s\S]*?<\/figure>/gi)) {
    const img = /<img\b[^>]*>/i.exec(m[0]);
    const cap = /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i.exec(m[0]);
    if (img && cap) { const a = atributos(img[0]); const u = a.src || a["data-src"]; if (u) legendas.set(u, cap[1].replace(/<[^>]+>/g, " ")); }
  }
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const a = atributos(m[0]);
    const src = a.src || a["data-src"] || a["data-lazy-src"] || (a.srcset ? maiorDoSrcset(a.srcset) : null) || (a["data-srcset"] ? maiorDoSrcset(a["data-srcset"]) : null);
    if (!src) continue;
    const grande = a.srcset ? maiorDoSrcset(a.srcset) : null;
    const descricao = legendas.get(src) || a.alt || a.title || "";
    const logo = PARECE_LOGO.test([a.alt, a.class, a.id, src].join(" "));
    add(grande || src, descricao, "img", logo);
  }
  for (const m of html.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    if (EXT_IMAGEM.test(m[1])) add(m[1], "", "css", PARECE_LOGO.test(m[1]));
  }
  return deduplicar(out);
}

/** Em site montado por JavaScript (Vite, Lovable, React), as imagens aparecem como caminhos dentro dos .js. */
export function imagensDoBundle(js: string, bundleUrl: string): CandidatoSite[] {
  const out: CandidatoSite[] = [];
  for (const m of js.matchAll(/["'`]((?:https?:\/\/|\/)[^"'`\s]{3,300}?\.(?:png|jpe?g|webp|avif|gif|svg))["'`]/gi)) {
    const url = absoluta(m[1], bundleUrl);
    if (url) out.push({ url, descricao: "", fonte: "bundle", logo: PARECE_LOGO.test(m[1]) });
  }
  return deduplicar(out);
}

/** Os .js do próprio site citados no HTML (até `max`), para procurar imagens em site montado por JavaScript. */
export function scriptsDoSite(html: string, paginaUrl: string, max = 3): string[] {
  const host = new URL(paginaUrl).host;
  const out: string[] = [];
  for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const u = absoluta(m[1], paginaUrl);
    if (u && new URL(u).host === host && !out.includes(u)) out.push(u);
    if (out.length >= max) break;
  }
  return out;
}

/** Mesma URL uma vez só (a primeira ocorrência vence, mas descrição e marca de logo se somam). */
export function deduplicar(lista: CandidatoSite[]): CandidatoSite[] {
  const mapa = new Map<string, CandidatoSite>();
  for (const c of lista) {
    const ja = mapa.get(c.url);
    if (!ja) mapa.set(c.url, { ...c });
    else { if (!ja.descricao && c.descricao) ja.descricao = c.descricao; ja.logo = ja.logo || c.logo; }
  }
  return [...mapa.values()];
}

const RASTREIO = /facebook\.com\/tr|google-analytics|googletagmanager|doubleclick|\/pixel|hotjar|clarity\.ms/i;

/** Logos (até 8; JSON-LD e og:logo primeiro) e imagens (até 40; com descrição primeiro), sem rastreadores. */
export function separarCandidatos(lista: CandidatoSite[]): { logos: CandidatoSite[]; imagens: CandidatoSite[] } {
  const limpos = lista.filter((c) => !RASTREIO.test(c.url));
  const pesoLogo = (c: CandidatoSite) => (c.fonte === "jsonld" || c.fonte === "og" ? 0 : c.fonte === "img" ? 1 : 2);
  const logos = limpos.filter((c) => c.logo).sort((a, b) => pesoLogo(a) - pesoLogo(b)).slice(0, 8);
  const imagens = limpos.filter((c) => !c.logo).sort((a, b) => Number(!a.descricao) - Number(!b.descricao)).slice(0, 40);
  return { logos, imagens };
}

/** URL http(s) de host público (nada de localhost, IP privado, link-local ou porta de serviço interno). */
export function urlPublicaHttp(u: string): URL | null {
  let url: URL;
  try { url = new URL(u); } catch { return null; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const h = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return null;
  const ip = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ip) {
    const [a, b] = [Number(ip[1]), Number(ip[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return null;
  }
  return url;
}
```

- [ ] **Step 5: `openai.ts` — descrição curta de uma imagem**

```ts
/** Uma frase curta, em português, do que a foto mostra (para o texto do post). URL pública da imagem (R2). */
export async function descreverImagem(url: string, total?: AbortSignal): Promise<string> {
  const d = await chamar("/chat/completions", {
    model: modeloVisao(),
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "Descreva em uma frase curta, em português do Brasil, o que esta foto mostra, para ajudar a escrever um post do Google Meu Negócio. Responda só com a descrição, sem aspas." },
        { type: "image_url", image_url: { url, detail: "low" } },
      ],
    }],
  }, PRAZO.texto, total, "texto");
  const t = d?.choices?.[0]?.message?.content;
  return typeof t === "string" ? t.trim().replace(/^["']|["']$/g, "").slice(0, 300) : "";
}
```

- [ ] **Step 6: `index.ts` — ações novas** (imports: `separarCandidatos`, `imagensDoHtml`, `imagensDoBundle`,
  `scriptsDoSite`, `deduplicar`, `urlPublicaHttp` de `./site.ts`; `normalizarImagensSite` de `./regras.ts`;
  `descreverImagem` de `./openai.ts`)

```ts
const UA = "Mozilla/5.0 (compatible; GestaoDeOperacao/1.0; +https://gestao.andrelopes.digital)";

/** Lê até `max` bytes de uma resposta (corta o resto) e devolve o texto ou os bytes. */
async function lerAte(r: Response, max: number): Promise<Uint8Array> {
  const leitor = r.body?.getReader();
  if (!leitor) return new Uint8Array(0);
  const partes: Uint8Array[] = [];
  let n = 0;
  while (n < max) {
    const { done, value } = await leitor.read();
    if (done || !value) break;
    partes.push(value);
    n += value.length;
  }
  await leitor.cancel().catch(() => {});
  const out = new Uint8Array(Math.min(n, max));
  let o = 0;
  for (const p of partes) { const pedaco = p.subarray(0, out.length - o); out.set(pedaco, o); o += pedaco.length; if (o >= out.length) break; }
  return out;
}

/** Busca no site do perfil (ou na URL enviada): candidatos de logo e de imagem. Não grava nada. */
async function acaoSite(sb: any, body: any, total: AbortSignal): Promise<Response> {
  const perfil = await carregarPerfil(sb, body);
  const alvo = urlPublicaHttp(typeof body.url === "string" && body.url.trim() ? body.url.trim() : String(perfil.site ?? ""));
  if (!alvo) throw new ErroHttp(400, "Informe o site do perfil (http ou https) na aba Agenda.");
  let r: Response;
  try {
    r = await fetch(alvo.href, { headers: { "user-agent": UA, accept: "text/html" }, redirect: "follow", signal: AbortSignal.any([AbortSignal.timeout(15_000), total]) });
  } catch (e) {
    console.error("Site:", msg(e));
    throw new ErroHttp(502, "Não foi possível abrir o site.");
  }
  if (!r.ok) throw new ErroHttp(502, `O site respondeu ${r.status}.`);
  const html = new TextDecoder().decode(await lerAte(r, 3 * 1024 * 1024));
  const base = r.url || alvo.href;
  let lista = imagensDoHtml(html, base);
  for (const s of scriptsDoSite(html, base)) {
    try {
      const rj = await fetch(s, { headers: { "user-agent": UA }, signal: AbortSignal.any([AbortSignal.timeout(10_000), total]) });
      if (rj.ok) lista = deduplicar([...lista, ...imagensDoBundle(new TextDecoder().decode(await lerAte(rj, 5 * 1024 * 1024)), s)]);
    } catch (e) {
      console.error("Site, script:", msg(e));
    }
  }
  return json(separarCandidatos(lista));
}

const IMAGEM_EXTERNA_MAX = 20 * 1024 * 1024;

/** Baixa uma imagem de outro site para o navegador converter (o navegador não pode, por CORS). Devolve os bytes. */
async function acaoBaixarImagem(body: any, total: AbortSignal): Promise<Response> {
  const alvo = urlPublicaHttp(typeof body.url === "string" ? body.url : "");
  if (!alvo) throw new ErroHttp(400, "Endereço de imagem inválido.");
  let r: Response;
  try {
    r = await fetch(alvo.href, { headers: { "user-agent": UA, accept: "image/*" }, redirect: "follow", signal: AbortSignal.any([AbortSignal.timeout(20_000), total]) });
  } catch (e) {
    console.error("Baixar imagem:", msg(e));
    throw new ErroHttp(502, "Não foi possível baixar a imagem.");
  }
  if (!r.ok) throw new ErroHttp(502, "Não foi possível baixar a imagem.");
  if (Number(r.headers.get("content-length")) > IMAGEM_EXTERNA_MAX) throw new ErroHttp(400, "A imagem passa de 20 MB.");
  const tipo = (r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const bytes = await lerAte(r, IMAGEM_EXTERNA_MAX + 1);
  if (bytes.length > IMAGEM_EXTERNA_MAX) throw new ErroHttp(400, "A imagem passa de 20 MB.");
  if (tipo && !tipo.startsWith("image/") && tipo !== "application/octet-stream") throw new ErroHttp(400, "O endereço não é de uma imagem.");
  return new Response(bytes, { status: 200, headers: { ...cors, "Content-Type": tipo.startsWith("image/") ? tipo : "application/octet-stream" } });
}

/** Guarda no R2 uma imagem do site já convertida pela tela (JPG) e a acrescenta às imagens do site do perfil. */
async function acaoImagemSite(sb: any, body: any, total: AbortSignal): Promise<Response> {
  const perfil = await carregarPerfil(sb, body);
  const origem = urlPublicaHttp(typeof body.origem_url === "string" ? body.origem_url : "");
  if (!origem) throw new ErroHttp(400, "Endereço de imagem inválido.");
  const texto = typeof body.base64 === "string" ? body.base64 : "";
  if (!texto || tamanhoBase64(texto) > 5 * 1024 * 1024) throw new ErroHttp(400, "A imagem convertida passa de 5 MB.");
  const bytes = base64ParaBytes(texto.startsWith("data:") ? texto.slice(texto.indexOf(",") + 1) : texto);
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) throw new ErroHttp(400, "Não foi possível ler a imagem enviada.");
  if (!r2Configurado()) throw new ErroHttp(503, SEM_R2);
  const id = crypto.randomUUID();
  let url: string;
  try {
    url = await enviarR2(`site/${perfil.id}/${id}.jpg`, bytes, "image/jpeg", total);
  } catch (e) {
    console.error("Imagem do site: R2:", msg(e));
    throw new ErroHttp(500, "Não foi possível guardar a imagem. Tente de novo.");
  }
  let descricao = typeof body.descricao === "string" ? body.descricao.trim().slice(0, 300) : "";
  if (descricao.length < 15 && openaiConfigurada()) {
    try { descricao = (await descreverImagem(url, total)) || descricao; } catch (e) { console.error("Descrever imagem:", msg(e)); }
  }
  const lista = normalizarImagensSite(perfil.imagens_site).filter((i) => i.origem_url !== origem.href);
  lista.push({ id, url, origem_url: origem.href, descricao });
  const { error } = await sb.from("gmn_perfis").update({ imagens_site: lista, updated_at: new Date().toISOString() }).eq("id", perfil.id);
  if (error) {
    console.error("Imagem do site: banco:", error.message);
    throw new ErroHttp(500, "Não foi possível guardar a imagem. Tente de novo.");
  }
  return json({ imagens_site: lista });
}
```

  - No `Deno.serve`, depois de `remover_logo`:
    ```ts
    if (body.acao === "site") return await acaoSite(sb, body, total);
    if (body.acao === "baixar_imagem") return await acaoBaixarImagem(body, total);
    if (body.acao === "imagem_site") return await acaoImagemSite(sb, body, total);
    ```
  - Atualize o comentário do topo com as três ações.
  - Em `acaoPrevia`, `podeTerImagem` passa a considerar também `normalizarImagensSite(perfil.imagens_site).length > 0`.

- [ ] **Step 7: `conteudo.ts` — site como fonte e foto antes do texto**

```ts
/** Imagem do site marcada pelo André (já no R2, em JPG), em rodízio como as fotos do Drive. */
async function imagemDoSite(sb: Sb, perfil: any): Promise<Imagem | null> {
  const lista = normalizarImagensSite(perfil.imagens_site);
  if (!lista.length) return null;
  const { data: usos } = await sb.from("gmn_imagens_uso").select("ref, usado_em").eq("perfil_id", perfil.id).eq("origem", "site");
  const mapa: Record<string, string> = Object.fromEntries((usos ?? []).map((u: any) => [u.ref, u.usado_em]));
  const ref = escolherImagem(lista.map((i) => i.id), mapa);
  const item = lista.find((i) => i.id === ref)!;
  await sb.from("gmn_imagens_uso").upsert(
    { perfil_id: perfil.id, origem: "site", ref: item.id, usado_em: new Date().toISOString() },
    { onConflict: "perfil_id,origem,ref" },
  );
  return { origem: "site", ref: item.id, url: item.url, descricao: item.descricao };
}
```

  Em `gerarConteudo`, **antes** do laço do texto:

```ts
  // Foto do Drive ou do site é escolhida antes do texto: a descrição dela vai para o prompt do post.
  let imagem: Imagem | null = null;
  const avisos: string[] = [];
  const origem = decidirImagem({
    comImagem: opcoes.comImagem ?? true,
    temPasta: String(perfil.drive_pasta_url ?? "").trim() !== "",
    temSite: normalizarImagensSite(perfil.imagens_site).length > 0,
    usaIa: !!perfil.usa_ia_imagem,
  });
  if (origem === "drive") {
    try {
      const doDrive = await imagemDoDrive(sb, perfil, postId, total);
      if (doDrive === "vazia") avisos.push("A pasta do Drive não tem nenhuma foto que deu para usar.");
      else if (doDrive === null) avisos.push(AVISO_LINK_DRIVE);
      else imagem = doDrive;
    } catch (e) {
      avisos.push(`Pasta do Drive: ${msg(e)}`);
    }
  } else if (origem === "site") {
    try {
      imagem = await imagemDoSite(sb, perfil);
    } catch (e) {
      avisos.push(`Imagem do site: ${msg(e)}`);
    }
  }
```

  passe `descricaoImagem: imagem?.descricao || null` para `montarMensagensPost`; tire o bloco antigo de Drive de depois do
  texto; **depois** do texto fica só `if (origem === "ia") { … imagemDaIa … }` (com `descricao: ""` no objeto da IA).
  `CamposPost.imagem_origem` aceita `"site"`.

- [ ] **Step 8: Verificar** (`npm test`; sintaxe e bytes de `supabase/functions/gmn/*.ts`; `tsc`) e **commit**

```bash
git add supabase/functions/gmn/site.ts supabase/functions/gmn/regras.ts supabase/functions/gmn/openai.ts supabase/functions/gmn/conteudo.ts supabase/functions/gmn/index.ts src/lib/gmnSite.test.ts src/lib/gmnRegras.test.ts
git commit -m "GMN: imagens e logo do site (busca, download, descrição) e imagem do site como fonte dos posts"
```

---

### Task 7: Imagens e logo do site (tela)

**Files:**
- Modify: `src/lib/gmn.ts`, `src/components/gmn/AbaImagens.tsx`, `src/components/gmn/PerfilGaveta.tsx`,
  `src/components/gmn/PostsLista.tsx`

**Interfaces:**
- Consumes: ações `site`, `baixar_imagem`, `imagem_site` (Task 6); `enviarLogo(perfilId, blob, origemUrl)` (Task 4);
  `normalizarFoto`, `blobParaBase64` (Task 4); `CandidatoSite`, `ImagemSite`.
- Produces (`gmn.ts`): `buscarNoSite(perfilId): Promise<{ logos: CandidatoSite[]; imagens: CandidatoSite[] }>`,
  `baixarImagemExterna(url): Promise<Blob>`, `usarLogoDoSite(perfilId, url): Promise<string>`,
  `adicionarImagemSite(perfilId, c: CandidatoSite): Promise<ImagemSite[]>`,
  `removerImagemSite(perfilId, lista: ImagemSite[], id: string): Promise<ImagemSite[]>`.

- [ ] **Step 1: `src/lib/gmn.ts`**

```ts
export async function buscarNoSite(perfilId: string): Promise<{ logos: CandidatoSite[]; imagens: CandidatoSite[] }> {
  return await chamar({ acao: "site", perfil_id: perfilId });
}

/** A imagem de outro site, baixada pela função (o navegador não pode baixar direto por causa do CORS). */
export async function baixarImagemExterna(url: string): Promise<Blob> {
  const headers = await cabecalhosDeAcesso();
  const r = await fetch(FUNCAO, { method: "POST", headers, body: JSON.stringify({ acao: "baixar_imagem", url }) });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.error || `A função gmn respondeu ${r.status}`);
  }
  return await r.blob();
}

/** Usa uma logo encontrada no site: baixa, converte para PNG e grava (guardando de onde veio). */
export async function usarLogoDoSite(perfilId: string, url: string): Promise<string> {
  return await enviarLogo(perfilId, await baixarImagemExterna(url), url);
}

/** Marca uma imagem do site para os posts: baixa, converte para JPG e manda guardar (a função descreve se faltar). */
export async function adicionarImagemSite(perfilId: string, c: CandidatoSite): Promise<ImagemSite[]> {
  const jpg = await normalizarFoto(await baixarImagemExterna(c.url));
  const d = await chamar<{ imagens_site: unknown }>({
    acao: "imagem_site", perfil_id: perfilId, origem_url: c.url, descricao: c.descricao, base64: await blobParaBase64(jpg),
  });
  return normalizarImagensSite(d.imagens_site);
}

/** Desmarca uma imagem do site (o arquivo fica no R2). */
export async function removerImagemSite(perfilId: string, lista: ImagemSite[], id: string): Promise<ImagemSite[]> {
  const nova = lista.filter((i) => i.id !== id);
  await salvarPerfil(perfilId, { imagens_site: nova } as Partial<PerfilGmn>);
  return nova;
}
```

(`CandidatoSite` importado como tipo de `../../supabase/functions/gmn/site.ts`.)

- [ ] **Step 2: `AbaImagens.tsx` — seção "Do site"** (logo depois da logo e das opções dela)
  - Título "Do site do cliente" e o botão **"Buscar imagens e logo no site"** (ícone `Globe`), desabilitado sem
    `dados.site` salvo (dica: "Preencha o site na aba Agenda e salve."), com espera "Buscando no site…". Erro: toast com
    `traduzErroGmn`. Resultado vazio: "Nenhuma imagem encontrada nesse site."
  - **"Logos encontradas"**: grade de cartões (miniatura `img` com `src` = URL do candidato,
    `referrerPolicy="no-referrer"`, `loading="lazy"`, `object-contain`, fundo xadrez claro; `onError` esconde o
    cartão), com `Checkbox` + `Label` **"Usar esta logo"**, marcada quando `dados.logo_origem_url === c.url`. Marcar →
    `usarLogoDoSite` (espera só naquele cartão; ao terminar, atualiza `logo_url`/`logo_origem_url` como no envio
    manual). Desmarcar a marcada → abre o mesmo diálogo "Remover a logo?".
  - **"Imagens do site"**: grade (miniatura 3:2, descrição em 2 linhas, ou "Sem descrição: a IA descreve ao marcar"),
    `Checkbox` + `Label` **"Usar nos posts"**, marcada quando `dados.imagens_site` tem `origem_url === c.url`. Marcar →
    `adicionarImagemSite`; desmarcar → `removerImagemSite`. Espera por cartão; toast de erro.
  - **"Imagens do site em uso (N)"**: sempre visível quando `imagens_site` não está vazia (mesmo sem buscar de novo):
    miniatura do R2, descrição e a caixa "Usar nos posts" marcada (desmarcar remove).
  - Texto: "As imagens marcadas entram nos posts em rodízio quando não há pasta do Drive. Elas são guardadas na hora (não
    dependem do Salvar imagens)."
  - Os resultados da busca ficam só na tela (somem ao fechar a gaveta).

- [ ] **Step 3: `PerfilGaveta.tsx`** — `imagens_site` e `logo_origem_url` ficam **fora** de `ajustesImagens` (gravados
  na hora); ao mudar, atualizar o rascunho e o "salvo" juntos (sem marcar "alterado") e chamar `onMudou()`. Esperas
  presas à sessão da gaveta (o mesmo `sessaoRef` das esperas atuais).

- [ ] **Step 4: `PostsLista.tsx`** — `ORIGEM_IMAGEM` ganha `site: "Imagem do site"`.

- [ ] **Step 5: Verificar** (`tsc` sem saída, `npm test`) e **commit**

```bash
git add src/lib/gmn.ts src/components/gmn/AbaImagens.tsx src/components/gmn/PerfilGaveta.tsx src/components/gmn/PostsLista.tsx
git commit -m "GMN: buscar imagens e logo no site, com caixas para usar a logo e usar as imagens nos posts"
```

---

### Task 8: Verificação real e publicação (controlador)

**Files:** nenhum de código (scripts no scratchpad; registros no cofre).

- [ ] **Step 1:** Conferir os nomes dos CHECKs (SQL da Task 1) e aplicar a migration no editor SQL do Lovable; conferir
  as colunas pela API pública.
- [ ] **Step 2: Servidor local** (`npx vite --port 5173` no worktree; função simulada com `page.route`, como em
  `scratchpad/gmn-contexto-tela.mjs`): enviar como logo um arquivo `.jpg` que é WEBP, um SVG, um PNG grande (>5 MB) e
  um GIF → os quatro chegam à ação `logo` como `image/png` e com lado maior ≤ 1.024; um arquivo que não é imagem → a
  mensagem `NAO_ABRIU`. Opções da logo gravam no "Salvar imagens" e a prévia mexe com elas. Busca no site simulada:
  marcar logo chama `baixar_imagem` + `logo` com `origem_url`; marcar imagem chama `imagem_site`; desmarcar grava
  `imagens_site` sem o item. 390 px sem rolagem lateral. Reverter `src/routeTree.gen.ts` depois.
- [ ] **Step 3: Merge na `main`, push, deploy da função pelo chat do Lovable** (pedir só o deploy da `gmn` com os 11
  arquivos — `index.ts`, `acesso.ts`, `conteudo.ts`, `google.ts`, `openai.ts`, `prazo.ts`, `r2.ts`, `regras.ts`,
  `png.ts`, `compor.ts`, `site.ts` —, sem mexer em arquivo e sem publicar) e conferir a versão nova (ação `site` sem
  perfil → 400 "Informe o perfil.").
- [ ] **Step 4: Teste real** (perfil TESTE pelo REST; chamadas pela aba do site, que tem a chave):
  - logo WEBP-com-nome-JPG convertida pela página → `logo` 200;
  - prévia com imagem da IA → PNG 1536x1024; **conferir pixel a pixel** que a região da logo é a logo reduzida
    (baixar o PNG final e a logo, rodar `caixaDaLogo` + `reduzir` + comparação no Node; pixels opacos 100% iguais);
    olhar a imagem;
  - pasta do Drive de teste (criada pela página com o token do `google-token` dentro de `_teste`, com um WEBP e um PNG de
    mais de 5 MB) → foto vem pela miniatura (`imagem_origem = drive`), texto coerente com a descrição;
  - busca no site em `https://andrelopes.digital` → candidatos; marcar uma imagem → `imagens_site` com descrição;
    prévia → `imagem_origem = site` e texto coerente com a descrição;
  - apagar o perfil TESTE e a pasta de teste.
- [ ] **Step 5: Publicar o site no Lovable** (a tela nova) e conferir no site (só leitura).
- [ ] **Step 6: Cofre** (`_knowledge/modulos/gmn.md`, `_memory/current-state.md`, decisão nova
  `_decisions/2026-10-01-gmn-logo-intocavel-e-imagens-do-site.md`, aprendizado sobre WEBP com nome de JPG) e memória.

---

## Self-Review

- **Cobertura da spec (seção 12):** 12.1 → Task 4 (+ `logo` só PNG na Task 3); 12.2 → Tasks 2 e 3; 12.3 → Task 5;
  12.4 → Tasks 6 e 7; 12.5 → Tasks 5 e 6 (`descricao`, ordem, `decidirImagem`); 12.6 → Task 1; teste real → Task 8.
- **Tipos consistentes:** `PosicaoLogo/TamanhoLogo/FundoLogo` nascem em `regras.ts` (Task 2) e são usados por
  `compor.ts` (Task 2), `conteudo.ts` (Task 3) e a tela (Task 4). `ImagemSite`/`normalizarImagensSite` nascem na Task 6;
  a Task 4 só os declara se a 6 ainda não tiver criado (ordem de execução: 1 → 7, então a Task 4 os cria e a 6 só usa —
  **regra: a Task 4 cria `ImagemSite` e `normalizarImagensSite` em `regras.ts` com o código da Task 6 Step 3, e a Task 6
  não os recria**). `Imagem.descricao` nasce na Task 5 e é usada na 6.
- **Sem lacunas:** cada passo de código traz o código ou a troca exata; as integrações citam funções e mensagens literais.

---

## Emenda às Tasks 6 e 7 (spec 12.7, 2026-10-01 noite) — vale por cima do texto delas

Pedido do André no meio da execução: buscas de logo e de fotos separadas, com reconhecimento de logo × foto; chave
"Usar fotos do site nos posts" (desligada por padrão); foto do site só entra quando combina com o post. A migration
`20261001190000_gmn_fotos_site.sql` (`usa_fotos_site`) já foi aplicada no banco.

### Task 6 (função) — o que muda

1. **`regras.ts`** (puro, TDD):
   - Troque `decidirImagem` por `fontesDaImagem(o: { comImagem: boolean; temPasta: boolean; temFotosSite: boolean; usaIa: boolean }): ("drive" | "site" | "ia")[]`:
     `!comImagem` → `[]`; `temPasta` → `["drive"]` (sem cair para outra fonte); senão, nesta ordem, `"site"` se
     `temFotosSite` e `"ia"` se `usaIa`. Tire `decidirImagem` e o teste dela; teste novo:
     ```ts
     test("fontesDaImagem: Drive sozinho; senão site (se ligado) e depois IA; só texto pula tudo", () => {
       const b = { comImagem: true, temPasta: false, temFotosSite: false, usaIa: false };
       assert.deepEqual(fontesDaImagem({ ...b, comImagem: false, temPasta: true, temFotosSite: true, usaIa: true }), []);
       assert.deepEqual(fontesDaImagem({ ...b, temPasta: true, temFotosSite: true, usaIa: true }), ["drive"]);
       assert.deepEqual(fontesDaImagem({ ...b, temFotosSite: true, usaIa: true }), ["site", "ia"]);
       assert.deepEqual(fontesDaImagem({ ...b, temFotosSite: true }), ["site"]);
       assert.deepEqual(fontesDaImagem({ ...b, usaIa: true }), ["ia"]);
       assert.deepEqual(fontesDaImagem(b), []);
     });
     ```
   - `fotosDoSiteComDescricao(perfil: { usa_fotos_site?: unknown; imagens_site?: unknown }): ImagemSite[]` → `[]` se
     `usa_fotos_site !== true`; senão `normalizarImagensSite(...)` só com `descricao.trim() !== ""`. Teste (desligada →
     `[]`; ligada → só as com descrição).
   - Combinar foto e post:
     ```ts
     export const ESQUEMA_FOTOS_QUE_COMBINAM = {
       type: "object", additionalProperties: false, required: ["ids"],
       properties: { ids: { type: "array", items: { type: "string" } } },
     } as const;

     /** Pede à IA as fotos do site cuja descrição combina com o post (na dúvida, nenhuma). Até 40 fotos. */
     export function montarMensagensFotosQueCombinam(texto: string, fotos: { id: string; descricao: string }[]): Mensagens {
       const system = [
         "Você escolhe fotos para um post do Perfil da Empresa no Google (Google Meu Negócio).",
         "Responda só com os ids das fotos cuja descrição combina claramente com o assunto do post.",
         "Na dúvida, não inclua. Pode não haver nenhuma: aí responda com a lista vazia.",
       ].join("\n");
       const lista = fotos.slice(0, 40).map((f) => `- ${f.id}: ${f.descricao}`).join("\n");
       return { system, user: `Post:\n${texto}\n\nFotos:\n${lista}` };
     }
     ```
     Teste: o `user` contém o texto e cada `- id: descricao`; com 50 fotos, só 40 entram; o `system` fala em "Na dúvida".
   - Classificar imagem do site:
     ```ts
     export const ESQUEMA_CLASSIFICACAO_IMAGEM = {
       type: "object", additionalProperties: false, required: ["tipo", "descricao"],
       properties: { tipo: { type: "string", enum: ["logo", "foto", "outro"] }, descricao: { type: "string" } },
     } as const;

     export const PROMPT_CLASSIFICAR_IMAGEM =
       "Esta imagem saiu do site de um negócio local. Classifique: logo (logotipo, marca ou ícone da empresa), " +
       "foto (fotografia ou imagem que poderia ilustrar um post: produto, ambiente, fachada, serviço, equipe) ou outro " +
       "(banner com muito texto, ícone genérico, gráfico, captura de tela, imagem decorativa). Para foto, descreva em " +
       "uma frase curta, em português do Brasil, o que ela mostra; para logo e outro, descricao vazia.";

     /** O modelo de visão lê PNG, JPG, WEBP e GIF; SVG, ICO, BMP, TIFF, AVIF e HEIC ficam só pela pista do HTML. */
     export function visaoLeFormato(url: string): boolean {
       const ext = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(new URL(url).pathname)?.[1]?.toLowerCase() ?? "";
       if (!ext) return true; // sem extensão: tenta
       return ["png", "jpg", "jpeg", "jfif", "webp", "gif"].includes(ext);
     }
     ```
     Teste: `.png`, `.JPG?v=2`, `.webp`, sem extensão → true; `.svg`, `.ico`, `.avif`, `.heic` → false.
2. **`site.ts`** (puro, TDD): mantenha `separarCandidatos` e acrescente
   `candidatosDeLogo(lista, max = 16)` (os com `logo` ou `fonte === "icone"`; JSON-LD e og primeiro) e
   `candidatosDeFoto(lista, max = 24)` (os outros, sem rastreadores; com descrição primeiro). Testes com a lista do
   teste existente.
3. **`openai.ts`**:
   - `classificarImagem(url: string, total?: AbortSignal): Promise<{ tipo: "logo" | "foto" | "outro"; descricao: string }>`
     — `/chat/completions` com `modeloVisao()`, `PROMPT_CLASSIFICAR_IMAGEM` + `image_url { url, detail: "low" }`,
     `response_format` com `ESQUEMA_CLASSIFICACAO_IMAGEM`; resposta fora do esquema lança.
   - `fotosQueCombinam(texto: string, fotos: { id: string; descricao: string }[], total?: AbortSignal): Promise<string[]>`
     — `gerarJson` com `montarMensagensFotosQueCombinam` e `ESQUEMA_FOTOS_QUE_COMBINAM`; devolve só ids que existem em
     `fotos`.
4. **`index.ts` — `acaoSite`**: o corpo traz `tipo: "logos" | "fotos"` (outro → 400 `"Escolha buscar a logo ou as fotos."`).
   Depois de juntar a lista (como no plano), pegue `candidatosDeLogo` ou `candidatosDeFoto` e classifique em paralelo
   (até 6 ao mesmo tempo, helper local `emParalelo`): se `openaiConfigurada()` e `visaoLeFormato(url)`,
   `classificarImagem` (erro → vale a pista: logo na busca de logos, foto com o alt na de fotos); senão vale a pista.
   Logos: devolve `{ logos }` com os classificados como `logo` (e os de pista). Fotos: devolve `{ fotos }` com os
   classificados como `foto` e descrição de pelo menos 10 caracteres (`descricao` = a da IA ou, sem ela, o alt).
5. **`conteudo.ts`**: `const fontes = fontesDaImagem({ comImagem, temPasta, temFotosSite: fotosDoSiteComDescricao(perfil).length > 0, usaIa })`.
   - `fontes[0] === "drive"`: como na Task 5 (foto antes do texto; `descricaoImagem` = descrição dela).
   - Senão: gere o texto (`descricaoImagem: null`) e depois percorra `fontes`: `"site"` → `imagemDoSite(sb, perfil, texto, total)`
     (lista = `fotosDoSiteComDescricao(perfil)`; `fotosQueCombinam`; nenhuma → `null`; entre as que combinam, a menos
     usada pelo rodízio, registrando o uso) — achou, para; erro → log e segue; `"ia"` → `imagemDaIa` (como hoje).
   - Terminou sem imagem depois de tentar o site (e sem IA ligada): aviso `"Nenhuma foto do site combinou com este post."`.
     Se a IA entrar depois do site, sem aviso do site.
   - `acaoPrevia`: `podeTerImagem` passa a usar `fotosDoSiteComDescricao(perfil).length > 0`.
6. **`imagem_site`**: continua igual (a descrição vem da busca; `descreverImagem` só se vier curta).

### Task 7 (tela) — o que muda

1. **`gmn.ts`**: `PerfilGmn.usa_fotos_site: boolean` (em `CAMPOS_PERFIL`); `buscarLogosNoSite(perfilId): Promise<CandidatoSite[]>`
   (`acao: "site", tipo: "logos"` → `logos`) e `buscarFotosNoSite(perfilId): Promise<CandidatoSite[]>` (`tipo: "fotos"` → `fotos`)
   no lugar de `buscarNoSite`.
2. **`PerfilGaveta.tsx`**: `ajustesImagens` grava também `usa_fotos_site`.
3. **`AbaImagens.tsx`**:
   - Na seção da logo: botão **"Buscar logo no site"** (ícone `Globe`; precisa do site salvo, dica "Preencha o site na aba
     Agenda e salve.") e a grade **"Logos encontradas no site"** com a caixa **"Usar esta logo"** (como no plano).
   - Seção **"Fotos do site"** com o `Switch` **"Usar fotos do site nos posts"** (rascunho, gravado no "Salvar imagens").
     - Desligado: só o texto "Desligado: as fotos do site não entram nos posts." (a lista marcada fica guardada, oculta).
     - Ligado: botão **"Buscar fotos no site"**, a grade com descrição e a caixa **"Usar nos posts"**, e
       **"Fotos do site marcadas (N)"**. Texto: "Uma foto do site só entra num post quando combina com o assunto dele (a
       IA confere). Se nenhuma combinar, o post usa a imagem da IA, se estiver ligada, ou sai só com texto."
   - Busca de fotos sem resultado: "Nenhuma foto encontrada nesse site."; de logos: "Nenhuma logo encontrada nesse site."
