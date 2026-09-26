# Gestor Pro no iPhone — Fase 1 (base do app, estrutura e correções globais) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o sistema instalável no iPhone (PWA) com barra de navegação inferior, janelas em tela cheia, toque confortável e arrastar compatível com rolagem — sem nenhuma mudança no computador.

**Architecture:** Tudo que muda fica atrás de variantes de tela pequena (`max-lg:`/`max-sm:`) ou de ponteiro de toque (`pointer-coarse:`), ou em componentes renderizados só abaixo de `lg`. A garantia de "desktop intocado" é mecânica: capturas de todas as telas em 1440 e 1024 px do commit base e da versão nova, comparadas pixel a pixel. A qualidade no celular é medida por um script de auditoria (390/430 px, Chromium e WebKit).

**Tech Stack:** TanStack Start + React 19, Tailwind CSS v4 (variantes `max-*`, `pointer-coarse`), Radix UI (shadcn), @dnd-kit/core, sonner, Playwright-core (só nas ferramentas, fora do app), `node --test` para libs puras.

**Spec:** `docs/superpowers/specs/2026-09-25-mobile-pwa-design.md`

## Global Constraints

- Desktop intocado: nenhuma diferença visual a partir de 1024 px com mouse (comparação pixel a pixel no Task 7).
- Nada de service worker / modo offline.
- Alvo: iPhone, larguras 390 e 430 px; alvos de toque ≥ 40 px; campos ≥ 16 px no iPhone.
- Sem dependências novas no `package.json` do app (o Lovable instala com bun e o `bun.lockb` não pode ser regenerado aqui). Ferramentas de verificação ficam em `tools/auditoria-mobile/` com `package.json` próprio.
- Textos da interface em português; comentários no estilo do código vizinho.
- Testes de lib pura: `node --test src/lib/*.test.ts` (`npm test`), sem imports `@/` nos arquivos testados.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `tools/auditoria-mobile/package.json` | deps das ferramentas (playwright-core, pngjs, pixelmatch) |
| `tools/auditoria-mobile/rotas.mjs` | lista das 22 telas e utilitários comuns (abrir página estável) |
| `tools/auditoria-mobile/auditar.mjs` | métricas no celular + teste das janelas "Novo…" |
| `tools/auditoria-mobile/comparar-desktop.mjs` | capturas base × nova em 1440/1024 e diff pixel a pixel |
| `tools/auditoria-mobile/gerar-icones.mjs` | gera os PNGs do app a partir de um SVG |
| `tools/auditoria-mobile/README.md` | como rodar |
| `public/manifest.webmanifest`, `public/icons/*.png` | PWA |
| `src/routes/__root.tsx` | metas/links do app (manifest, ícones, iOS, viewport-fit), toasts na área segura |
| `src/lib/pwa.test.ts` | confere manifest e ícones |
| `src/lib/navMobile.ts` (+ `.test.ts`) | atalhos da barra inferior e regra de "ativo" |
| `src/components/MobileNav.tsx` | barra inferior (< lg) |
| `src/routes/_authenticated.tsx` | encaixa a barra, áreas seguras, cabeçalho compacto |
| `src/components/ui/{dialog,sheet,alert-dialog,button,checkbox,switch,dropdown-menu,select,tabs}.tsx` | tela cheia no celular e alvos de toque |
| `src/styles.css` | zoom do iPhone em campos, destaque de toque |
| 11 arquivos com `group-hover:opacity-100` | ações visíveis no toque |
| `src/lib/arrastar.ts` + 4 usos de `PointerSensor` | arrastar: mouse igual, toque com segurar |

---

### Task 1: Ferramentas de verificação e linha de base

**Files:**
- Create: `tools/auditoria-mobile/package.json`, `rotas.mjs`, `auditar.mjs`, `comparar-desktop.mjs`, `README.md`

**Interfaces:**
- Produces: `node auditar.mjs <baseUrl> <pastaSaida> [chromium|webkit]` → `resultado.json` + capturas; `node comparar-desktop.mjs <urlBase> <urlNova> <pastaSaida>` → `diff.json` + PNGs de diferença. Usados nos Tasks 7 (e fases 2/3).

- [ ] **Step 1: package.json das ferramentas**

```json
{
  "name": "auditoria-mobile",
  "private": true,
  "type": "module",
  "description": "Auditoria de uso no celular e regressão de desktop do Gestor Pro (fora do app)",
  "dependencies": { "playwright-core": "1.47.2", "pngjs": "7.0.0", "pixelmatch": "6.0.0" }
}
```

- [ ] **Step 2: `rotas.mjs` (telas e abertura estável)**

```js
// Telas do sistema e abertura "estável" (sem animação, fontes carregadas, dados assentados)
export const ROTAS = ["/", "/agenda", "/onboarding", "/roadmap", "/ideias", "/acessos", "/saldo", "/nps", "/clientes",
  "/prospeccao", "/financeiro", "/cursos", "/livros", "/habilidades", "/ver-depois", "/transcritor", "/swipe", "/links",
  "/notas", "/arquivos", "/dashboard", "/admin"];

export const nomeDaRota = (rota) => (rota === "/" ? "demandas" : rota.slice(1));
export const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const SEM_ANIMACAO = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}`;

export async function abrirEstavel(pagina, url, espera = 6000) {
  await pagina.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await pagina.addStyleTag({ content: SEM_ANIMACAO });
  await pagina.evaluate(() => document.fonts.ready);
  await pagina.waitForTimeout(espera);
}
```

- [ ] **Step 3: `auditar.mjs` (métricas no celular + janelas)**

```js
// Auditoria no celular: cada tela em 390x844 e 430x932 (toque), mede rolagem lateral, conteúdo cortado,
// alvos de toque < 40 px e texto < 11 px; abre as janelas "Novo…" e confere se o botão de salvar é alcançável.
import { chromium, webkit } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { ROTAS, nomeDaRota, CHROME, abrirEstavel } from "./rotas.mjs";

const [BASE = "http://localhost:5188", SAIDA = "saida-auditoria", MOTOR = "chromium"] = process.argv.slice(2);
const TELAS = [{ nome: "iphone-390", width: 390, height: 844 }, { nome: "iphone-430", width: 430, height: 932 }];
// Telas com botão de criar e o texto dele: a janela precisa caber e o salvar precisa ser alcançável
const JANELAS = [["/financeiro", /Nova fonte/], ["/cursos", /Novo curso/], ["/clientes", /Novo cliente/],
  ["/saldo", /Novo registro/], ["/swipe", /Adicionar/], ["/links", /Novo link|Adicionar/], ["/acessos", /Adicionar/]];
mkdirSync(SAIDA, { recursive: true });

const navegador = MOTOR === "webkit" ? await webkit.launch() : await chromium.launch({ executablePath: CHROME });
const resultado = [];
for (const tela of TELAS) {
  const contexto = await navegador.newContext({ viewport: { width: tela.width, height: tela.height }, deviceScaleFactor: 2,
    isMobile: MOTOR !== "webkit" ? true : undefined, hasTouch: true, locale: "pt-BR" });
  for (const rota of ROTAS) {
    const pagina = await contexto.newPage();
    if (MOTOR !== "webkit") {
      const cdp = await contexto.newCDPSession(pagina);
      await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "pointer", value: "coarse" }, { name: "hover", value: "none" },
        { name: "any-pointer", value: "coarse" }, { name: "any-hover", value: "none" }] });
    }
    try {
      await abrirEstavel(pagina, BASE + rota);
      const m = await pagina.evaluate(() => {
        const W = innerWidth;
        const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0"; };
        const rolaX = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if ((o === "auto" || o === "scroll") && p.scrollWidth > p.clientWidth) return true; } return false; };
        const desc = (el) => `${el.tagName.toLowerCase()}.${String(el.className || "").split(/\s+/).slice(0, 3).join(".")} «${(el.innerText || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 30)}»`;
        const raiz = document.querySelector("main") || document.body;
        const todos = [...raiz.querySelectorAll("*")].filter(vis);
        const vazam = todos.filter((el) => el.getBoundingClientRect().right > W + 2 && !rolaX(el));
        const alvoOk = (el) => { const r = el.getBoundingClientRect(); if (r.width >= 40 && r.height >= 40) return true;
          const d = getComputedStyle(el, "::after"); return d.content !== "none" && d.position === "absolute"; };
        const tocaveis = [...document.querySelectorAll("button, a[href], [role=button], [role=checkbox], [role=switch], [role=tab], input:not([type=hidden]), select")].filter(vis);
        const pequenos = tocaveis.filter((el) => !alvoOk(el));
        const miudos = todos.filter((el) => el.childElementCount === 0 && (el.innerText || "").trim() && parseFloat(getComputedStyle(el).fontSize) < 11);
        return {
          ponteiroToque: matchMedia("(pointer: coarse)").matches,
          rolagemLateral: document.documentElement.scrollWidth > W + 2 ? document.documentElement.scrollWidth : 0,
          vazam: vazam.filter((el) => !vazam.includes(el.parentElement)).slice(0, 5).map((el) => `${desc(el)} → ${Math.round(el.getBoundingClientRect().right)}px`),
          tocaveis: tocaveis.length, pequenos: pequenos.length,
          exemplosPequenos: pequenos.slice(0, 5).map((el) => `${desc(el)} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`),
          textoMenor11: miudos.length,
          barraInferior: !!document.querySelector("nav[aria-label='Atalhos']"),
        };
      });
      await pagina.screenshot({ path: `${SAIDA}/${tela.nome}-${nomeDaRota(rota)}.png` });
      resultado.push({ tela: tela.nome, rota, ...m });
    } catch (e) {
      resultado.push({ tela: tela.nome, rota, erro: String(e.message || e).slice(0, 200) });
    } finally { await pagina.close(); }
  }
  // Janelas: abre, confere que cabem na tela e que o botão de salvar fica visível depois de rolar
  for (const [rota, texto] of JANELAS) {
    const pagina = await contexto.newPage();
    try {
      await abrirEstavel(pagina, BASE + rota);
      await pagina.getByRole("button", { name: texto }).first().click();
      const dlg = pagina.locator("[role=dialog]").last();
      await dlg.waitFor({ timeout: 10_000 });
      await pagina.waitForTimeout(600);
      const j = await dlg.evaluate((d) => {
        const r = d.getBoundingClientRect();
        d.scrollTop = d.scrollHeight;
        const salvar = [...d.querySelectorAll("button[type=submit], button")].filter((b) => /Salvar|Criar|Adicionar|Registrar|Cadastrar/i.test(b.innerText)).pop();
        const s = salvar?.getBoundingClientRect();
        return { cabe: r.top >= -1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1,
          rolavel: d.scrollHeight <= d.clientHeight + 1 || getComputedStyle(d).overflowY !== "visible",
          salvarVisivel: !!s && s.top >= 0 && s.bottom <= innerHeight && s.height > 0, salvarTexto: salvar?.innerText?.trim() || null };
      });
      await pagina.screenshot({ path: `${SAIDA}/${tela.nome}-janela-${nomeDaRota(rota)}.png` });
      resultado.push({ tela: tela.nome, rota, janela: j });
    } catch (e) {
      resultado.push({ tela: tela.nome, rota, janela: { erro: String(e.message || e).slice(0, 160) } });
    } finally { await pagina.close(); }
  }
  await contexto.close();
}
await navegador.close();
writeFileSync(`${SAIDA}/resultado.json`, JSON.stringify(resultado, null, 2));
for (const r of resultado) {
  if (r.janela) { console.log(`${r.tela} janela ${r.rota.padEnd(12)} ${JSON.stringify(r.janela)}`); continue; }
  console.log(`${r.tela} ${r.rota.padEnd(12)} toque:${r.ponteiroToque ? "s" : "n"} lateral:${r.rolagemLateral ?? "-"} vazam:${r.vazam?.length ?? "-"} peq:${r.pequenos ?? "-"}/${r.tocaveis ?? "-"} <11px:${r.textoMenor11 ?? "-"} barra:${r.barraInferior ? "s" : "n"} ${r.erro || ""}`);
}
```

- [ ] **Step 4: `comparar-desktop.mjs` (regressão de desktop)**

```js
// Regressão de desktop: captura cada tela na versão base e na nova (mesmo instante, mesmos dados) em 1440 e 1024 px
// e compara pixel a pixel. Qualquer diferença gera um PNG em <saida>/diff-*.png para inspeção.
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { ROTAS, nomeDaRota, CHROME, abrirEstavel } from "./rotas.mjs";

const [URL_BASE, URL_NOVA, SAIDA = "saida-desktop"] = process.argv.slice(2);
if (!URL_BASE || !URL_NOVA) { console.error("uso: node comparar-desktop.mjs <urlBase> <urlNova> [saida]"); process.exit(1); }
mkdirSync(SAIDA, { recursive: true });
const navegador = await chromium.launch({ executablePath: CHROME });
const relatorio = [];
for (const largura of [1440, 1024]) {
  const contexto = await navegador.newContext({ viewport: { width: largura, height: 900 }, deviceScaleFactor: 1, locale: "pt-BR", reducedMotion: "reduce" });
  for (const rota of ROTAS) {
    const capturar = async (url) => { const p = await contexto.newPage(); try { await abrirEstavel(p, url + rota); return PNG.sync.read(await p.screenshot({ fullPage: true })); } finally { await p.close(); } };
    try {
      const a = await capturar(URL_BASE);
      const b = await capturar(URL_NOVA);
      const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
      const recorta = (img) => { const o = new PNG({ width: w, height: h }); PNG.bitblt(img, o, 0, 0, w, h, 0, 0); return o; };
      const diff = new PNG({ width: w, height: h });
      const px = pixelmatch(recorta(a).data, recorta(b).data, diff.data, w, h, { threshold: 0.1 });
      const tamanhoIgual = a.width === b.width && a.height === b.height;
      if (px > 0 || !tamanhoIgual) writeFileSync(`${SAIDA}/diff-${largura}-${nomeDaRota(rota)}.png`, PNG.sync.write(diff));
      relatorio.push({ largura, rota, pixelsDiferentes: px, tamanhoIgual, base: `${a.width}x${a.height}`, nova: `${b.width}x${b.height}` });
    } catch (e) {
      relatorio.push({ largura, rota, erro: String(e.message || e).slice(0, 160) });
    }
  }
  await contexto.close();
}
await navegador.close();
writeFileSync(`${SAIDA}/diff.json`, JSON.stringify(relatorio, null, 2));
for (const r of relatorio) console.log(`${r.largura} ${r.rota.padEnd(12)} ${r.erro ? "ERRO " + r.erro : `${r.pixelsDiferentes} px ${r.tamanhoIgual ? "" : `(tamanho ${r.base} → ${r.nova})`}`}`);
const problemas = relatorio.filter((r) => r.erro || r.pixelsDiferentes > 0 || !r.tamanhoIgual);
console.log(problemas.length ? `\n${problemas.length} tela(s) com diferença` : "\nDesktop idêntico em todas as telas");
```

- [ ] **Step 5: README**

```markdown
# Auditoria mobile e regressão de desktop

Ferramentas fora do app (não entram no build do Lovable). Instalar uma vez: `npm install` nesta pasta
(e `npx playwright-core install webkit` para o motor do Safari).

- Celular: `node auditar.mjs http://localhost:5188 saida-auditoria chromium` (ou `webkit`).
- Desktop base × nova: suba a versão base num worktree (`git worktree add ../gestao-base <commit>`,
  `mklink /J ..\gestao-base\node_modules node_modules`, `npx vite --port 5191` lá) e a nova aqui
  (`npx vite --port 5188`); depois `node comparar-desktop.mjs http://localhost:5191 http://localhost:5188`.
  Critério: 0 px de diferença em todas as telas (ou diferença explicada por dado vivo, conferida no PNG).
```

- [ ] **Step 6: instalar e rodar a linha de base**

Run (na pasta `tools/auditoria-mobile`): `npm install --no-audit --no-fund && npx playwright-core install webkit`
Run: `npx vite --port 5188 --strictPort` (na raiz, em segundo plano) e `node auditar.mjs http://localhost:5188 ../../.auditoria/base chromium`
Expected: tabela por tela; `barra:n` em todas (a barra ainda não existe), números de `peq` parecidos com a auditoria inicial.
Adicionar `.auditoria/` ao `.gitignore`.

- [ ] **Step 7: Commit**

```bash
git add tools/auditoria-mobile .gitignore
git commit -m "Ferramentas: auditoria mobile (Chromium/WebKit) e regressão de desktop pixel a pixel"
```

---

### Task 2: App instalável (manifest, ícones, metas do iPhone)

**Files:**
- Create: `tools/auditoria-mobile/gerar-icones.mjs`, `public/manifest.webmanifest`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/apple-touch-icon.png`
- Modify: `src/routes/__root.tsx` (head: viewport, metas, links; Toaster)
- Test: `src/lib/pwa.test.ts`

**Interfaces:**
- Produces: `/manifest.webmanifest` e ícones em `/icons/…`, usados pelo iOS ao "Adicionar à Tela de Início".

- [ ] **Step 1: teste que falha (`src/lib/pwa.test.ts`)**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const pub = (p: string) => new URL(`../../public/${p}`, import.meta.url);
/** Largura e altura de um PNG pelo cabeçalho IHDR. */
const tamanhoPng = (p: string) => { const b = readFileSync(pub(p)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test("manifest do app: nome, tela cheia, início e cores", () => {
  const m = JSON.parse(readFileSync(pub("manifest.webmanifest"), "utf8"));
  assert.equal(m.name, "Gestor Pro");
  assert.equal(m.short_name, "Gestor Pro");
  assert.equal(m.display, "standalone");
  assert.equal(m.start_url, "/");
  assert.equal(m.scope, "/");
  assert.match(m.background_color, /^#[0-9a-f]{6}$/i);
  assert.match(m.theme_color, /^#[0-9a-f]{6}$/i);
});

test("ícones do manifest existem no tamanho declarado", () => {
  const m = JSON.parse(readFileSync(pub("manifest.webmanifest"), "utf8"));
  const tamanhos = m.icons.map((i: { sizes: string }) => i.sizes).sort();
  assert.deepEqual(tamanhos, ["192x192", "512x512"]);
  for (const i of m.icons) {
    assert.equal(i.type, "image/png");
    assert.deepEqual(tamanhoPng(i.src.replace(/^\//, "")), i.sizes.split("x").map(Number));
  }
});

test("ícone da tela de início do iPhone: 180x180", () => {
  assert.ok(existsSync(pub("icons/apple-touch-icon.png")));
  assert.deepEqual(tamanhoPng("icons/apple-touch-icon.png"), [180, 180]);
});
```

- [ ] **Step 2: rodar e ver falhar**

Run: `node --test src/lib/pwa.test.ts`
Expected: FAIL (ENOENT em `public/manifest.webmanifest`).

- [ ] **Step 3: gerador de ícones (`tools/auditoria-mobile/gerar-icones.mjs`)**

Ícone = quadrado cheio (o iOS arredonda sozinho) com o degradê dos botões do app e as "faíscas" (lucide Sparkles) do logo do menu, centralizadas em ~52% (cabe na área segura de ícone "maskable").

```js
// Gera os ícones do app (PNG) a partir de um SVG, renderizado no Chrome.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { CHROME } from "./rotas.mjs";

const SVG = (lado) => `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2563eb"/><stop offset="1" stop-color="#06b6d4"/></linearGradient></defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <g transform="translate(123 123) scale(11.08)" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
    <path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>
  </g></svg>`;
const SAIDA = "../../public/icons";
mkdirSync(SAIDA, { recursive: true });
const navegador = await chromium.launch({ executablePath: CHROME });
for (const [nome, lado] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  const p = await navegador.newPage({ viewport: { width: lado, height: lado }, deviceScaleFactor: 1 });
  await p.setContent(`<html><body style="margin:0">${SVG(lado)}</body></html>`);
  await p.screenshot({ path: `${SAIDA}/${nome}`, omitBackground: false });
  await p.close();
}
await navegador.close();
console.log("ícones gerados em public/icons");
```

Run (em `tools/auditoria-mobile`): `node gerar-icones.mjs` → conferir visualmente `public/icons/icon-512.png`.

- [ ] **Step 4: `public/manifest.webmanifest`**

```json
{
  "name": "Gestor Pro",
  "short_name": "Gestor Pro",
  "description": "Gestão da operação: demandas, agenda, clientes e ferramentas.",
  "lang": "pt-BR",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0e1320",
  "theme_color": "#0e1320",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 5: metas e links no `src/routes/__root.tsx`**

Trocar o viewport e acrescentar as metas (mantendo as existentes):

```tsx
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#0e1320" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Gestor Pro" },
      // Barra de status do iPhone transparente com texto branco: a faixa escura da área segura fica no layout
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
```

E nos `links`:

```tsx
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
```

E os toasts abaixo da barra de status do iPhone (só afeta telas < 600 px, onde o sonner usa `mobileOffset`):

```tsx
      <Toaster richColors closeButton position="top-right" mobileOffset={{ top: "calc(env(safe-area-inset-top) + 8px)" }} />
```

- [ ] **Step 6: rodar o teste e ver passar**

Run: `node --test src/lib/pwa.test.ts` → Expected: 3 pass.
Run: `npx tsc --noEmit -p tsconfig.json` → Expected: 0 erros.

- [ ] **Step 7: Commit**

```bash
git add public/manifest.webmanifest public/icons src/routes/__root.tsx src/lib/pwa.test.ts tools/auditoria-mobile/gerar-icones.mjs
git commit -m "PWA: manifest, ícones e metas do iPhone para instalar o Gestor Pro na tela de início"
```

---

### Task 3: Barra inferior e áreas seguras no celular

**Files:**
- Create: `src/lib/navMobile.ts`, `src/lib/navMobile.test.ts`, `src/components/MobileNav.tsx`
- Modify: `src/routes/_authenticated.tsx` (render da barra, faixa da área segura, cabeçalho, menu lateral, espaço inferior)

**Interfaces:**
- Produces: `ATALHOS_MOBILE: { to: string; rotulo: string }[]`, `atalhoAtivo(pathname: string, to: string): boolean`, `<MobileNav onMais={() => void} maisAberto={boolean} />`.

- [ ] **Step 1: teste que falha (`src/lib/navMobile.test.ts`)**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { ATALHOS_MOBILE, atalhoAtivo } from "./navMobile.ts";

test("atalhos da barra inferior: Demandas, Agenda, Notas e Transcritor, nessa ordem", () => {
  assert.deepEqual(ATALHOS_MOBILE.map((a) => a.to), ["/", "/agenda", "/notas", "/transcritor"]);
});

test("atalhoAtivo: Demandas só na raiz; os outros na própria rota e nas subrotas", () => {
  assert.equal(atalhoAtivo("/", "/"), true);
  assert.equal(atalhoAtivo("/agenda", "/"), false);
  assert.equal(atalhoAtivo("/agenda", "/agenda"), true);
  assert.equal(atalhoAtivo("/notas/123", "/notas"), true);
  assert.equal(atalhoAtivo("/notasx", "/notas"), false);
});
```

- [ ] **Step 2: ver falhar** — Run: `node --test src/lib/navMobile.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: `src/lib/navMobile.ts`**

```ts
// Barra inferior do celular (< lg): os atalhos mais usados; o resto fica no menu "Mais".
// Sem dependências: roda no navegador e no `node --test`.

export interface AtalhoMobile {
  to: string;
  rotulo: string;
}

export const ATALHOS_MOBILE: AtalhoMobile[] = [
  { to: "/", rotulo: "Demandas" },
  { to: "/agenda", rotulo: "Agenda" },
  { to: "/notas", rotulo: "Notas" },
  { to: "/transcritor", rotulo: "Transcritor" },
];

/** Demandas ("/") só acende na raiz; os demais também nas subrotas ("/notas/123"). */
export function atalhoAtivo(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}
```

- [ ] **Step 4: ver passar** — Run: `node --test src/lib/navMobile.test.ts` → 2 pass.

- [ ] **Step 5: `src/components/MobileNav.tsx`**

```tsx
import { Link, useRouterState } from "@tanstack/react-router";
import { AudioLines, CalendarDays, LayoutDashboard, Menu, StickyNote, type LucideIcon } from "lucide-react";
import { ATALHOS_MOBILE, atalhoAtivo } from "@/lib/navMobile";
import { cn } from "@/lib/utils";

const ICONES: Record<string, LucideIcon> = { "/": LayoutDashboard, "/agenda": CalendarDays, "/notas": StickyNote, "/transcritor": AudioLines };
const ITEM = "flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors active:scale-95";

/** Barra inferior do celular: 4 atalhos + "Mais" (abre o menu lateral completo). Some a partir de lg. */
export function MobileNav({ onMais, maisAberto }: { onMais: () => void; maisAberto: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const emAtalho = ATALHOS_MOBILE.some((a) => atalhoAtivo(pathname, a.to));
  return (
    <nav aria-label="Atalhos" className="lg:hidden fixed inset-x-0 bottom-0 z-30 border-t border-border/60 glass pb-[env(safe-area-inset-bottom)]">
      <div className="grid h-16 grid-cols-5">
        {ATALHOS_MOBILE.map((a) => {
          const Icone = ICONES[a.to];
          const ativo = !maisAberto && atalhoAtivo(pathname, a.to);
          return (
            <Link key={a.to} to={a.to} aria-current={ativo ? "page" : undefined} className={cn(ITEM, ativo ? "text-primary" : "text-muted-foreground")}>
              <Icone size={22} strokeWidth={ativo ? 2.2 : 1.8} />
              {a.rotulo}
            </Link>
          );
        })}
        <button type="button" onClick={onMais} className={cn(ITEM, maisAberto || !emAtalho ? "text-primary" : "text-muted-foreground")}>
          <Menu size={22} strokeWidth={maisAberto || !emAtalho ? 2.2 : 1.8} />
          Mais
        </button>
      </div>
    </nav>
  );
}
```

- [ ] **Step 6: encaixar no `src/routes/_authenticated.tsx`**

1. Import: `import { MobileNav } from "@/components/MobileNav";`
2. Logo depois da `{/* Barra de alerta de saldo */}` (antes do overlay), a faixa escura atrás da barra de status do iPhone (altura 0 fora do app instalado):

```tsx
        {/* Faixa escura atrás da barra de status do iPhone (app instalado); 0 px no navegador e no desktop */}
        <div aria-hidden className="lg:hidden fixed inset-x-0 top-0 z-[60] h-[env(safe-area-inset-top)] bg-sidebar" />
```

3. `<aside ...>`: acrescentar ao `cn(` a classe `"max-lg:pt-[env(safe-area-inset-top)] max-lg:pb-[env(safe-area-inset-bottom)]"`.
4. `<header ...>`: trocar `className="h-14 border-b …"` por `className="h-14 max-lg:h-[calc(3.5rem+env(safe-area-inset-top))] max-lg:pt-[env(safe-area-inset-top)] border-b …"` (restante igual).
5. Selo BETA do cabeçalho: acrescentar `max-lg:hidden` à classe do `<span>` "beta".
6. Conteúdo: `<div key={pathname} className="p-4 lg:p-8 page-enter">` → `<div key={pathname} className="p-4 lg:p-8 max-lg:pb-[calc(5.5rem+env(safe-area-inset-bottom))] page-enter">`.
7. Antes de fechar `</main>`: `<MobileNav onMais={() => setIsSidebarOpen(true)} maisAberto={isSidebarOpen} />`.

- [ ] **Step 7: verificar**

Run: `npx tsc --noEmit -p tsconfig.json` → 0 erros; `npm test` → todos passam.
Run: `node tools/auditoria-mobile/auditar.mjs http://localhost:5188 .auditoria/t3 chromium` (servidor 5188 no ar) → `barra:s` em todas as telas; abrir `.auditoria/t3/iphone-390-demandas.png` e conferir a barra inferior sem cobrir conteúdo.

- [ ] **Step 8: Commit**

```bash
git add src/lib/navMobile.ts src/lib/navMobile.test.ts src/components/MobileNav.tsx src/routes/_authenticated.tsx
git commit -m "Celular: barra inferior (Demandas, Agenda, Notas, Transcritor, Mais) e áreas seguras do iPhone"
```

---

### Task 4: Componentes base no celular e no toque

**Files:**
- Modify: `src/components/ui/dialog.tsx`, `sheet.tsx`, `alert-dialog.tsx`, `button.tsx`, `checkbox.tsx`, `switch.tsx`, `dropdown-menu.tsx`, `select.tsx`, `tabs.tsx`, `src/styles.css`

- [ ] **Step 1: `dialog.tsx` — tela cheia abaixo de `sm`, rolagem interna, rodapé fixo, X maior no toque**

No `DialogContent`, acrescentar ao fim da string de classes (antes de `className`):

```
max-sm:inset-x-0 max-sm:left-0 max-sm:top-[env(safe-area-inset-top)] max-sm:bottom-[env(safe-area-inset-bottom)] max-sm:translate-x-0 max-sm:translate-y-0 max-sm:h-auto max-sm:max-h-none max-sm:max-w-none max-sm:content-start max-sm:overflow-y-auto max-sm:overscroll-contain max-sm:rounded-none max-sm:border-0 max-sm:data-[state=open]:slide-in-from-left-0 max-sm:data-[state=open]:slide-in-from-top-0 max-sm:data-[state=closed]:slide-out-to-left-0 max-sm:data-[state=closed]:slide-out-to-top-0
```

No `DialogPrimitive.Close`: acrescentar `pointer-coarse:right-2 pointer-coarse:top-2 pointer-coarse:flex pointer-coarse:size-10 pointer-coarse:items-center pointer-coarse:justify-center`.

No `DialogFooter`: `cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:gap-2 max-sm:bg-card max-sm:pt-3", className)`.

- [ ] **Step 2: `sheet.tsx` — largura total e rolagem no celular**

Nas variantes `left` e `right`, acrescentar: `max-sm:w-full max-sm:max-w-none max-sm:overflow-y-auto max-sm:pt-[calc(1.5rem+env(safe-area-inset-top))] max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]`. No botão X do `SheetContent`, as mesmas classes `pointer-coarse:` do dialog.

- [ ] **Step 3: `alert-dialog.tsx` — margem lateral no celular**

No `AlertDialogContent`, acrescentar: `max-sm:w-[calc(100%-2rem)] max-sm:rounded-2xl`.

- [ ] **Step 4: `button.tsx` — altura mínima de 40 px no toque**

```ts
      size: {
        default: "h-9 px-4 py-2 pointer-coarse:min-h-10",
        sm: "h-8 rounded-lg px-3 text-xs pointer-coarse:min-h-10",
        lg: "h-10 rounded-lg px-8",
        icon: "h-9 w-9 pointer-coarse:min-h-10 pointer-coarse:min-w-10",
      },
```

- [ ] **Step 5: `checkbox.tsx` e `switch.tsx` — área de toque invisível de 40 px**

Checkbox (Root): acrescentar `pointer-coarse:relative pointer-coarse:after:absolute pointer-coarse:after:-inset-3 pointer-coarse:after:content-['']`.
Switch (Root): acrescentar `pointer-coarse:relative pointer-coarse:after:absolute pointer-coarse:after:-inset-y-2.5 pointer-coarse:after:-inset-x-1 pointer-coarse:after:content-['']`.

- [ ] **Step 6: `dropdown-menu.tsx`, `select.tsx`, `tabs.tsx` — itens mais altos no toque**

Em cada item (`DropdownMenuItem`, `DropdownMenuSubTrigger`, `DropdownMenuCheckboxItem`, `DropdownMenuRadioItem`, `SelectItem`): acrescentar `pointer-coarse:py-2.5`. Em `TabsTrigger`: `pointer-coarse:py-2`.

- [ ] **Step 7: `src/styles.css` — zoom do iPhone e destaque de toque** (fora de `@layer`, no fim do arquivo, para vencer os utilitários)

```css
/* iPhone: campo com fonte < 16px faz o Safari dar zoom ao focar (só iOS tem -webkit-touch-callout) */
@supports (-webkit-touch-callout: none) {
  input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
  textarea,
  select {
    font-size: max(16px, 1em);
  }
}

/* Toque: sem o retângulo cinza do iOS e sem inflar texto na rotação */
@media (pointer: coarse) {
  html {
    -webkit-tap-highlight-color: transparent;
    -webkit-text-size-adjust: 100%;
  }
}
```

- [ ] **Step 8: verificar**

Run: `npx tsc --noEmit -p tsconfig.json` → 0 erros; `npm test` → passam.
Run: `node tools/auditoria-mobile/auditar.mjs http://localhost:5188 .auditoria/t4 chromium` → nas linhas `janela`, `cabe:true` e `salvarVisivel:true` em todas; `peq` bem menor que na linha de base. Conferir `iphone-390-janela-cursos.png`.

- [ ] **Step 9: Commit**

```bash
git add src/components/ui src/styles.css
git commit -m "Celular: janelas em tela cheia com salvar sempre visível, alvos de toque de 40 px e sem zoom nos campos do iPhone"
```

---

### Task 5: Ações que só apareciam com o mouse passam a aparecer no toque

**Files (cada ocorrência de `opacity-0 … group-hover:opacity-100`, e `opacity-60 … group-hover:opacity-100`):**
`src/components/KanbanCard.tsx:174,208,219,387`, `src/components/processos/VerbaOnboarding.tsx:129`, `src/components/prospeccao/ProspeccaoCard.tsx:106`, `src/components/prospeccao/ProspeccaoDrawer.tsx:443`, `src/components/transcritor/ListaTranscricoes.tsx:179`, `src/routes/_authenticated/arquivos.tsx:961`, `clientes.tsx:724`, `financeiro.tsx:506`, `habilidades.tsx:621`, `links.tsx:242,265`, `notas.tsx:323,346`, `ver-depois.tsx:233`

- [ ] **Step 1: acrescentar `pointer-coarse:opacity-100` ao lado de cada `group-hover:opacity-100`**

Regra mecânica: em cada string que contém `opacity-0` (ou `opacity-60`) e `group-hover:opacity-100`, acrescentar ` pointer-coarse:opacity-100` imediatamente depois de `group-hover:opacity-100`. Exceção: `ver-depois.tsx:233` é a camada escura com o botão de play sobre a capa — no toque ela deve continuar escondida (a capa inteira já é tocável); não mexer nela.
Comando de conferência: `grep -rn "group-hover:opacity-100" src --include=*.tsx | grep -v "pointer-coarse:opacity-100"` → só a linha do `ver-depois.tsx`.

- [ ] **Step 2: verificar**

Run: `npx tsc --noEmit -p tsconfig.json` → 0 erros.
Run: auditoria (`.auditoria/t5`) e abrir `iphone-390-financeiro.png`: o botão ⋮ de cada fonte aparece.

- [ ] **Step 3: Commit**

```bash
git add src/components src/routes/_authenticated
git commit -m "Celular: botões que só apareciam com o mouse por cima ficam visíveis no toque"
```

---

### Task 6: Arrastar no toque sem roubar a rolagem

> **Ajuste na execução (25/09):** em vez de `MouseSensor`, o mouse fica com um `PointerSensor` que só ignora
> `pointerType === "touch"` (`PointerSemToque`), porque os botões dentro do card de Demandas bloqueiam
> `onPointerDown` — com `MouseSensor` um clique neles poderia iniciar arrasto. O teclado só entra onde já
> existia (Demandas e Fila). Verificado com `tools/auditoria-mobile/testar-arrastar.mjs` (mouse arrasta;
> toque deslizando rola; toque segurando arrasta) — no código antigo o toque não arrastava de jeito nenhum.

**Files:**
- Create: `src/lib/arrastar.ts`
- Modify: `src/routes/_authenticated/index.tsx:44-56,129-138`, `src/components/fila/FilaComSelecao.tsx:5,70-73`, `src/components/processos/Trilha.tsx:6-9,123`, `src/components/processos/TemplateEditorDialog.tsx:6-9,88`

**Interfaces:**
- Produces: `useSensoresArrastar(distancia: number, teclado?: KeyboardSensorOptions["coordinateGetter"]): SensorDescriptor[]` (retorno de `useSensors`).

- [ ] **Step 1: `src/lib/arrastar.ts`**

```ts
// Sensores do dnd-kit: no mouse, igual a antes (arrasta depois de N px); no toque, só depois de segurar
// ~250 ms parado — assim deslizar o dedo rola a tela em vez de arrastar o card.
import { KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, type KeyboardCoordinateGetter } from "@dnd-kit/core";

export const ATRASO_TOQUE_MS = 250;
export const TOLERANCIA_TOQUE_PX = 8;

export function useSensoresArrastar(distancia: number, coordenadasTeclado?: KeyboardCoordinateGetter) {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: distancia } }),
    useSensor(TouchSensor, { activationConstraint: { delay: ATRASO_TOQUE_MS, tolerance: TOLERANCIA_TOQUE_PX } }),
    useSensor(KeyboardSensor, coordenadasTeclado ? { coordinateGetter: coordenadasTeclado } : {}),
  );
}
```

- [ ] **Step 2: trocar os usos**

- `index.tsx`: remover `KeyboardSensor, PointerSensor, useSensor, useSensors` do import do `@dnd-kit/core` (manter o resto), importar `useSensoresArrastar` de `@/lib/arrastar` e substituir o bloco `const sensors = useSensors(…)` por `const sensors = useSensoresArrastar(3, sortableKeyboardCoordinates);`.
- `FilaComSelecao.tsx`: idem com `useSensoresArrastar(4, sortableKeyboardCoordinates)`.
- `Trilha.tsx` e `TemplateEditorDialog.tsx`: `const sensors = useSensoresArrastar(6);` (antes não tinham teclado; o `KeyboardSensor` sem coordenadas é inofensivo, só permite arrastar pelo teclado). Remover `PointerSensor, useSensor, useSensors` dos imports.

- [ ] **Step 3: verificar**

Run: `npx tsc --noEmit -p tsconfig.json` → 0 erros; `npx eslint src/lib/arrastar.ts src/routes/_authenticated/index.tsx src/components/fila/FilaComSelecao.tsx src/components/processos/Trilha.tsx src/components/processos/TemplateEditorDialog.tsx 2>&1 | grep -v prettier | grep -E "no-unused|error  " ` → nenhum import sobrando.
Teste manual no app local (Chrome, mouse): arrastar um card entre colunas de Demandas continua igual.

- [ ] **Step 4: Commit**

```bash
git add src/lib/arrastar.ts src/routes/_authenticated/index.tsx src/components/fila/FilaComSelecao.tsx src/components/processos/Trilha.tsx src/components/processos/TemplateEditorDialog.tsx
git commit -m "Arrastar: mouse igual a antes; no toque, segurar para arrastar e deslizar para rolar"
```

---

### Task 6b: Sistema sempre atualizado ao voltar (pedido do usuário durante a execução)

**Files:** Create `src/lib/versaoApp.ts` (+ `.test.ts`), `src/components/AtualizarAoVoltar.tsx`, `tools/auditoria-mobile/testar-voltar.mjs`; Modify `src/routes/_authenticated.tsx` (chave `${pathname}#${recarga}` na tela e `<AtualizarAoVoltar onRecarregarPagina={recarregarPagina} />`).

- `versaoDoHtml(html)` → `"main-XXXX.js"` | null; `decidirAoVoltar({ausenteMs, versaoAtual, versaoNova, celular, janelaAberta})` → `"nada" | "recarregar-app" | "avisar-versao" | "recarregar-pagina"` (6 testes).
- Verificado: `MSYS_NO_PATHCONV=1 node testar-voltar.mjs http://localhost:5188 /financeiro` → celular remonta, computador não.

### Task 7: Verificação completa, correções e publicação

- [ ] **Step 1: regressão de desktop (base × nova)**

```bash
git worktree add ../gestao-base 8bbf0ae
cmd //c mklink /J "..\\gestao-base\\node_modules" "node_modules"
# base na 5191 (worktree) e nova na 5188 (aqui), em segundo plano
node tools/auditoria-mobile/comparar-desktop.mjs http://localhost:5191 http://localhost:5188 .auditoria/desktop
```

Expected: `Desktop idêntico em todas as telas` (1440 e 1024). Se houver diferença: abrir `diff-*.png`, achar a classe responsável e prendê-la atrás de `max-lg:`/`pointer-coarse:`; repetir até zerar (diferença só de dado vivo — ex.: um item novo na lista entre as duas capturas — é aceitável depois de conferida no PNG).

- [ ] **Step 2: auditoria no celular, Chromium e WebKit**

Run: `node tools/auditoria-mobile/auditar.mjs http://localhost:5188 .auditoria/final chromium` e `… webkit`.
Expected: `lateral:0` e `vazam:0` em todas; `barra:s`; janelas `cabe:true, salvarVisivel:true`; `peq` perto de zero fora de textos-link. Registrar os números antes/depois no resumo ao usuário.

- [ ] **Step 3: limpar**

`git worktree remove ../gestao-base --force` e parar os dois servidores.

- [ ] **Step 4: publicar**

`git push origin main`; no Lovable, Publicar → "Publicar alterações"; conferir no site que `/manifest.webmanifest` responde 200 e que o HTML traz `apple-touch-icon`.

- [ ] **Step 5: instruções ao usuário**

No iPhone: Safari → gestao.andrelopes.digital → Compartilhar → "Adicionar à Tela de Início" → abrir pelo ícone e testar: barra inferior, uma janela "Novo…", arrastar um card (segurar), "Entrar com Google" no Transcritor.
