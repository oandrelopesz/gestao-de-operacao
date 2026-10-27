# Demandas: cliente atribuído pelo título — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. No fluxo do André, a execução padrão é o `/jev-plano` (itens no fim deste arquivo).

**Goal:** Ao criar uma demanda, o sistema reconhece no título o(s) cliente(s) citado(s) e já atribui; sem reconhecimento, a demanda fica sem cliente.

**Architecture:** Uma função pura `clientesNoTitulo(titulo, clientes)` em `src/lib/clienteNoTitulo.ts` devolve os ids dos clientes citados, na ordem do título. Os dois pontos onde o André cadastra demanda à mão a usam: o "adicionar rápido" do pé da coluna (`handleQuickAdd` em `src/routes/_authenticated/index.tsx`) grava `cliente_id`/`clientes_extras` no insert; o formulário "Nova" (`src/components/DemandaForm.tsx`) preenche o campo Cliente(s) enquanto o título é digitado, até o André escolher o cliente à mão. Nada no banco muda.

**Tech Stack:** React + react-hook-form (formulário), Supabase JS (insert), `node --test` com TypeScript direto (testes de `src/lib`), Playwright (`tools/auditoria-mobile`) para o teste de tela.

**Spec:** sem spec separada. Pedido do André em 27/10/2026: "ao cadastrar uma nova demanda no sistema, ele já entender de qual cliente é e atribuir de forma automática, porque eu sempre cadastro as demandas com o nome do cliente; se ele não reconhecer, deixa sem atribuição e eu faço manualmente". Issue: #1. Nota do módulo no cofre: `_knowledge/modulos/demandas.md`.

## Decisões já tomadas (não reabrir)

- **Regra de reconhecimento** (medida contra as 233 demandas reais em 27/10/2026: das 186 com cliente, 173 acertos = 93%, 8 sem reconhecimento, 5 com cliente a mais por o título citar dois clientes). Contam como citação, sempre como palavra inteira, sem acento e sem diferença de maiúsculas:
  - o nome inteiro ("Construflama"), sem o prefixo Dr/Dra/Colégio/Grupo/Mentoria ("Márcio Martins", "Up One") e sem espaços ("PopAgro", "UpOne", "FisioGentil");
  - os pedaços separados por " - " ou "/" e o que está entre parênteses ("Felipe Pinheiro", "Guimicell"), exceto pedaço só de palavras genéricas ("E-commerce");
  - cada palavra do nome com 3+ letras que não está na lista de genéricas ("Amuny", "Frutaria", "VDS").
- Forma que serve para mais de um cliente ("Arruda", "Virginia Arruda", "Guilherme") não decide nada. A citação mais longa ganha ("Guilherme Garcia" não puxa também "Guilherme - Guimicell").
- **Vários clientes citados = todos atribuídos** (o primeiro citado vira o principal `cliente_id`, os demais vão para `clientes_extras`, recurso que já existe desde 02/10/2026).
- **Só clientes.** Agências não entram ("Relatórios semanais Effect" vai para o cliente Effect, não para a agência Effect; o André troca à mão se quiser).
- **Sem apelidos por cliente no cadastro** (YAGNI: o André aceitou atribuir à mão o que não for reconhecido). Fica como evolução se a lista de genéricas virar rotina.
- **Onde vale:** só criação à mão (adicionar rápido e "Nova"). Não muda: editar título no painel, duplicar, ideias, CRM, recorrentes, onboarding.

## Global Constraints

- Textos de interface, comentários e mensagens de commit em português do Brasil; sem travessão em textos que o André lê.
- `src/lib/clienteNoTitulo.ts` sem imports do app (roda em `node --test`), no mesmo estilo de `src/lib/clientesDaDemanda.ts`.
- Nenhuma dependência nova. Nenhuma migration.
- Testes de tela gravam no banco de produção (único banco): só títulos começando com `[TESTE]`, apagados no fim do script.
- `git push` na `main` publica o site (Cloudflare). Migrations não existem neste plano.

---

### Task 1: Função `clientesNoTitulo` com teste

**Files:**
- Create: `src/lib/clienteNoTitulo.ts`
- Test: `src/lib/clienteNoTitulo.test.ts`

**Interfaces:**
- Produces: `export interface ClienteNome { id: string; nome: string }` e `export function clientesNoTitulo(titulo: string, clientes: ClienteNome[]): string[]` (ids na ordem em que aparecem no título, sem repetir; `[]` se nada reconhecido).

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/clienteNoTitulo.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { clientesNoTitulo } from "./clienteNoTitulo.ts";

// Nomes reais do cadastro (27/10/2026); o id é o próprio nome para o teste ler fácil
const CLIENTES = [
  "Pop Agro", "Dra Amuny Gobato", "Dr Márcio Martins", "Ultraclinic Breves (Felipe Pinheiro)", "Colégio Up One",
  "Colégio Castro Alves", "Futebol Star", "Easy Shop", "Guilherme Garcia", "Guilherme - Guimicell",
  "Virgínia Arruda - E-commerce", "Virginia Arruda - Orações Poderosas", "Dani Arruda", "Super Soft",
  "Frutaria Natural Food", "Construflama", "VDS Laboratório", "Syntropia Lab", "Fisio Gentil", "Avelore",
].map((nome) => ({ id: nome, nome }));
const reconhece = (titulo: string) => clientesNoTitulo(titulo, CLIENTES);

test("nome inteiro, sem acento, sem o Dr/Dra/Colégio do começo e sem espaço", () => {
  assert.deepEqual(reconhece("Corrigir LP Marcio Martins"), ["Dr Márcio Martins"]);
  assert.deepEqual(reconhece("Trackear LP Dra Amuny Gobato"), ["Dra Amuny Gobato"]);
  assert.deepEqual(reconhece("Subir criativos Up One"), ["Colégio Up One"]);
  assert.deepEqual(reconhece("Subir criativos UpOne"), ["Colégio Up One"]);
  assert.deepEqual(reconhece("Mandar ata PopAgro"), ["Pop Agro"]);
  assert.deepEqual(reconhece("SUBIR CAMPANHAS CASTRO ALVES"), ["Colégio Castro Alves"]);
});

test("parte do nome: palavra própria do cliente e o que está entre parênteses", () => {
  assert.deepEqual(reconhece("Reestruturar campanhas Amuny"), ["Dra Amuny Gobato"]);
  assert.deepEqual(reconhece("Nova estratégia Frutaria"), ["Frutaria Natural Food"]);
  assert.deepEqual(reconhece("Estratégia VDS"), ["VDS Laboratório"]);
  assert.deepEqual(reconhece("Subir vídeos Felipe Pinheiro"), ["Ultraclinic Breves (Felipe Pinheiro)"]);
  assert.deepEqual(reconhece("Extrair SEO da FisioGentil"), ["Fisio Gentil"]);
});

test("vários clientes na ordem do título, sem repetir", () => {
  assert.deepEqual(reconhece("Otimizar campanhas Futebol Star e Easy Shop"), ["Futebol Star", "Easy Shop"]);
  assert.deepEqual(reconhece("Relatórios semanais Frutaria, Super Soft e Construflama"), [
    "Frutaria Natural Food", "Super Soft", "Construflama",
  ]);
  assert.deepEqual(reconhece("Construflama: revisar Construflama"), ["Construflama"]);
});

test("a citação mais longa ganha: Guilherme Garcia não puxa o outro Guilherme", () => {
  assert.deepEqual(reconhece("Mudar funil Guilherme Garcia"), ["Guilherme Garcia"]);
  assert.deepEqual(reconhece("Estoque Guimicell"), ["Guilherme - Guimicell"]);
});

test("não reconhece: palavra genérica, nome de dois clientes, pedaço de palavra, nada citado", () => {
  assert.deepEqual(reconhece("Super urgente: revisar contrato"), []);
  assert.deepEqual(reconhece("Fazer formulário de ecommerce"), []);
  assert.deepEqual(reconhece("Estratégia Virginia Arruda"), []);
  assert.deepEqual(reconhece("Revisar lab de testes"), []);
  assert.deepEqual(reconhece("Construflamas"), []);
  assert.deepEqual(reconhece("Carrossel Francisco"), []);
  assert.deepEqual(reconhece(""), []);
});

test("e-commerce no título não puxa a cliente Virgínia E-commerce", () => {
  assert.deepEqual(reconhece("Terminar integrações e-commerce Avelore"), ["Avelore"]);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test src/lib/clienteNoTitulo.test.ts`
Expected: FAIL com `ERR_MODULE_NOT_FOUND` (o arquivo `clienteNoTitulo.ts` ainda não existe).

- [ ] **Step 3: Escrever a implementação**

Criar `src/lib/clienteNoTitulo.ts`:

```ts
// Reconhece no título de uma demanda nova os clientes citados ("Subir criativos PopAgro" → Pop Agro), para a
// demanda já nascer atribuída. Nada reconhecido, ou só nome que serve para mais de um cliente, = sem cliente.
// Regras puras, sem imports do app, para poder testar com `node --test`.

export interface ClienteNome {
  id: string;
  nome: string;
}

// Tratamento e tipo de negócio no começo do nome: "Dra Amuny Gobato" também vale como "Amuny Gobato",
// "Colégio Up One" como "Up One".
const PREFIXOS = new Set(["dr", "dra", "colegio", "grupo", "mentoria"]);

// Palavras comuns demais para apontar um cliente sozinhas. O nome inteiro continua valendo:
// "Super Soft" reconhece, "Super urgente" não.
// ponytail: lista fixa montada com os clientes de 27/10/2026; cliente novo que der falso positivo põe a palavra aqui
// (se isso virar rotina, apelidos por cliente no cadastro).
const GENERICAS = new Set([
  ...PREFIXOS,
  "de", "da", "do", "das", "dos", "e", "em", "a", "o",
  "lab", "laboratorio", "super", "soft", "viral", "prime", "imports", "star", "car", "shop", "easy", "natural",
  "food", "seguros", "engenharia", "multimarcas", "veiculos", "salon", "desempenho", "kids", "wealth", "growth",
  "commerce", "ecommerce", "oracoes", "poderosas", "trabalho", "fe", "radar", "leilao", "fisio", "oral", "up",
  "one", "pop", "agro", "stop", "dias", "campos", "silva", "lima", "breves", "futebol",
]);

/** Minúsculas, sem acento, só letras e números separados por um espaço. */
function normalizar(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Formas do nome que contam como citação: o nome inteiro, os pedaços separados por " - " ou "/" e o que está entre
 * parênteses ("Ultraclinic Breves (Felipe Pinheiro)" → "felipe pinheiro"), cada um também sem o prefixo e sem
 * espaços ("pop agro" → "popagro"), e cada palavra do nome que não é genérica ("amuny", "frutaria").
 */
function formasDoNome(nome: string): string[] {
  const semParenteses = nome.replace(/\([^)]*\)/g, " ");
  const pedacos = semParenteses.split(/\s+-\s+|\//).map(normalizar);
  const parenteses = [...nome.matchAll(/\(([^)]*)\)/g)].map((m) => normalizar(m[1]));
  const partes = [normalizar(semParenteses)];
  for (const p of [...(pedacos.length > 1 ? pedacos : []), ...parenteses]) {
    // "Virgínia Arruda - E-commerce" não vira citação de "e-commerce"
    if (p && !p.split(" ").every((w) => GENERICAS.has(w))) partes.push(p);
  }
  const formas = new Set<string>();
  for (const p of partes) {
    const palavras = p.split(" ");
    while (palavras.length > 1 && PREFIXOS.has(palavras[0])) palavras.shift();
    for (const f of [p, palavras.join(" ")]) {
      if (f.length < 3) continue;
      formas.add(f);
      formas.add(f.replace(/ /g, ""));
    }
  }
  for (const w of normalizar(nome).split(" ")) if (w.length >= 3 && !GENERICAS.has(w)) formas.add(w);
  return [...formas];
}

/** Ids dos clientes citados no título, na ordem em que aparecem, sem repetir. */
export function clientesNoTitulo(titulo: string, clientes: ClienteNome[]): string[] {
  const donos = new Map<string, Set<string>>();
  for (const c of clientes) {
    for (const f of formasDoNome(c.nome)) {
      if (!donos.has(f)) donos.set(f, new Set());
      donos.get(f)!.add(c.id);
    }
  }
  const texto = ` ${normalizar(titulo)} `;
  const achados: { ini: number; fim: number; id: string }[] = [];
  for (const [forma, ids] of donos) {
    if (ids.size !== 1) continue; // serve para mais de um cliente ("arruda"): não decide
    const [id] = ids;
    for (let i = texto.indexOf(` ${forma} `); i >= 0; i = texto.indexOf(` ${forma} `, i + 1)) {
      achados.push({ ini: i + 1, fim: i + 1 + forma.length, id });
    }
  }
  // A citação mais longa ganha: "Guilherme Garcia" não conta também como "Guilherme" de outro cliente
  achados.sort((a, b) => b.fim - b.ini - (a.fim - a.ini) || a.ini - b.ini);
  const aceitos: typeof achados = [];
  for (const a of achados) if (!aceitos.some((b) => a.ini < b.fim && b.ini < a.fim)) aceitos.push(a);
  aceitos.sort((a, b) => a.ini - b.ini);
  return [...new Set(aceitos.map((a) => a.id))];
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test src/lib/clienteNoTitulo.test.ts`
Expected: `pass 6`, `fail 0`.

Run: `npm test`
Expected: todos os testes de `src/lib` passam (`fail 0`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/clienteNoTitulo.ts src/lib/clienteNoTitulo.test.ts
git commit -m "feat: reconhece o cliente citado no título da demanda (função pura com teste)"
```

---

### Task 2: Adicionar rápido já grava o cliente

**Files:**
- Modify: `src/routes/_authenticated/index.tsx` (import perto da linha 82; `handleQuickAdd`, linhas ~397-436)

**Interfaces:**
- Consumes: `clientesNoTitulo(titulo: string, clientes: ClienteNome[]): string[]` de `@/lib/clienteNoTitulo` (Task 1). `clientes` é o estado já existente da página (`{ id, nome, agencia }[]`, carregado por `loadClientesLite`).

- [ ] **Step 1: Importar a função**

Logo abaixo de `import { clientesDaDemanda } from "@/lib/clientesDaDemanda";` (linha ~82):

```ts
import { clientesNoTitulo } from "@/lib/clienteNoTitulo";
```

- [ ] **Step 2: Usar no insert do adicionar rápido**

Em `handleQuickAdd`, trocar:

```ts
      const { data, error } = await supabase.from("demandas").insert([{
        titulo,
        status: status as any,
        user_id: userId,
        cliente_id: null,
        prioridade: "media" as const,
        ordem: maxOrder + 1,
        recorrente: isRecorrente
      }]).select().single();
```

por:

```ts
      // O André escreve o cliente no título ("Subir criativos PopAgro"): a demanda já nasce atribuída.
      // Nada reconhecido = sem cliente, como antes.
      const ids = clientesNoTitulo(titulo, clientes);

      // O join com clientes faz o selo do cliente aparecer no card já na atualização otimista
      const { data, error } = await supabase.from("demandas").insert([{
        titulo,
        status: status as any,
        user_id: userId,
        cliente_id: ids[0] ?? null,
        clientes_extras: ids.slice(1),
        prioridade: "media" as const,
        ordem: maxOrder + 1,
        recorrente: isRecorrente
      }]).select("*, clientes(nome, agencia)").single();
```

- [ ] **Step 3: Conferir tipos e testes**

Run: `npx tsc --noEmit -p .`
Expected: nenhuma linha `error TS` (hoje o projeto está com 0 erros).

Run: `npm test`
Expected: `fail 0`.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_authenticated/index.tsx
git commit -m "feat: adicionar rápido das Demandas atribui o cliente citado no título"
```

---

### Task 3: Formulário "Nova" preenche o cliente enquanto o título é digitado

**Files:**
- Modify: `src/components/DemandaForm.tsx` (imports no topo; corpo de `DemandaForm`; campo `titulo` linhas ~72-84; `onEscolher` do `ClientePicker` linhas ~108-112)

**Interfaces:**
- Consumes: `clientesNoTitulo` de `@/lib/clienteNoTitulo` (Task 1); prop `clientes` que o formulário já recebe.
- Comportamento: se a demanda abriu sem cliente e sem Pessoal (sempre o caso do "Nova"), cada mudança no título recalcula `cliente_id`/`clientes_extras` (inclusive limpa quando o nome sai do título). Assim que o André usa o seletor de cliente (cliente, Pessoal ou Sem cliente), o título para de mexer no campo.

- [ ] **Step 1: Imports**

No topo de `src/components/DemandaForm.tsx`, acrescentar:

```ts
import { useRef } from "react";
import { clientesNoTitulo } from "@/lib/clienteNoTitulo";
```

(o segundo logo abaixo de `import { clientesDaDemanda } from "@/lib/clientesDaDemanda";`)

- [ ] **Step 2: Guardar se o cliente ainda segue o título**

Logo depois do `useForm(...)` (antes do `return (`):

```ts
  // Demanda sem dono: o cliente segue o título ("Subir criativos PopAgro" → Pop Agro) até o André escolher à mão
  const clientePeloTitulo = useRef(!initialValues?.cliente_id && !initialValues?.pessoal);
```

- [ ] **Step 3: Recalcular ao digitar o título**

No campo `titulo`, trocar:

```tsx
                <Input placeholder="O que precisa ser feito?" {...field} value={field.value || ""} />
```

por:

```tsx
                <Input
                  placeholder="O que precisa ser feito?"
                  {...field}
                  value={field.value || ""}
                  onChange={(e) => {
                    field.onChange(e);
                    if (!clientePeloTitulo.current) return;
                    const ids = clientesNoTitulo(e.target.value, clientes);
                    form.setValue("cliente_id", ids[0] ?? "");
                    form.setValue("clientes_extras", ids.slice(1));
                  }}
                />
```

- [ ] **Step 4: Escolha à mão encerra o automático**

No `onEscolher` do `ClientePicker`, trocar:

```tsx
                  onEscolher={(v) => {
                    field.onChange(v.cliente_id ?? "");
```

por:

```tsx
                  onEscolher={(v) => {
                    clientePeloTitulo.current = false;
                    field.onChange(v.cliente_id ?? "");
```

- [ ] **Step 5: Conferir tipos e testes**

Run: `npx tsc --noEmit -p .`
Expected: nenhuma linha `error TS`.

Run: `npm test`
Expected: `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add src/components/DemandaForm.tsx
git commit -m "feat: formulário Nova demanda preenche o cliente pelo título até a escolha manual"
```

---

### Task 4: Teste de tela, publicação, cofre e issue

**Files:**
- Create: `tools/auditoria-mobile/testar-cliente-no-titulo.mjs`
- Modify: `tools/auditoria-mobile/README.md` (uma linha nova na lista)

**Interfaces:**
- Consumes: Tasks 1-3 já commitadas; `CHROME` e `abrirEstavel` de `tools/auditoria-mobile/rotas.mjs`; `.env` da raiz (chave pública do site, a mesma de `testar-diversos-clientes.mjs`).

- [ ] **Step 1: Escrever o script de tela**

Criar `tools/auditoria-mobile/testar-cliente-no-titulo.mjs`:

```js
// Demandas com o nome do cliente no título: confere a atribuição automática no adicionar rápido (banco e selo no card)
// e no formulário "Nova" (campo preenchido ao digitar, gravado ao salvar, e escolha à mão que o título não desfaz).
// Uso: node testar-cliente-no-titulo.mjs [http://localhost:5178/]. Cria demandas [TESTE] e apaga todas no fim.
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { CHROME, abrirEstavel } from "./rotas.mjs";
import { clientesNoTitulo } from "../../src/lib/clienteNoTitulo.ts";
const env = Object.fromEntries(readFileSync("../../.env", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const H = { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + env.VITE_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" };
const api = (path, init) => fetch(env.VITE_SUPABASE_URL + "/rest/v1/" + path, { headers: H, ...init }).then((r) => (r.status === 204 ? null : r.json()));
const URL_APP = process.argv[2] || "http://localhost:5178/";

const clientes = await api("clientes?select=id,nome");
// Um cliente que o próprio nome reconhece sozinho, sem ambiguidade com outro cliente
const alvo = clientes.find((c) => { const r = clientesNoTitulo(c.nome, clientes); return r.length === 1 && r[0] === c.id; });
console.log("cliente do teste:", alvo.nome);
const T_RAPIDO = `[TESTE] rapido ${alvo.nome}`;
const T_SEM = "[TESTE] rapido sem cliente qwzx";
const T_FORM = `[TESTE] form ${alvo.nome}`;
const falhas = [];
const confere = (ok, msg) => { console.log(`${ok ? "OK   " : "FALHA"} ${msg}`); if (!ok) falhas.push(msg); };
const buscar = async (titulo) => (await api(`demandas?select=id,cliente_id,clientes_extras,pessoal&titulo=eq.${encodeURIComponent(titulo)}`))[0];

const nav = await chromium.launch({ executablePath: CHROME });
try {
  const p = await (await nav.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await abrirEstavel(p, URL_APP, 6000);

  // 1) Adicionar rápido no Standby (coluna sem regra de data)
  const coluna = p.locator("div", { has: p.getByText("Standby", { exact: true }) }).filter({ has: p.getByRole("button", { name: "Novo" }) }).last();
  await coluna.getByRole("button", { name: "Novo" }).click();
  const entrada = coluna.getByPlaceholder("Nova tarefa...");
  for (const t of [T_RAPIDO, T_SEM]) { await entrada.fill(t); await entrada.press("Enter"); await p.waitForTimeout(1500); }
  const d1 = await buscar(T_RAPIDO);
  const d2 = await buscar(T_SEM);
  confere(d1?.cliente_id === alvo.id, `adicionar rápido "${T_RAPIDO}" grava o cliente (veio ${d1?.cliente_id})`);
  confere(!!d2 && d2.cliente_id === null, `adicionar rápido "${T_SEM}" fica sem cliente`);
  const selo = p.locator(`[title=${JSON.stringify("Cliente: " + alvo.nome)}]`);
  const card = p.locator("div", { hasText: T_RAPIDO }).filter({ has: selo }).last();
  confere(await card.waitFor({ timeout: 5000 }).then(() => true, () => false), "selo do cliente aparece no card do adicionar rápido");

  // 2) Formulário "Nova": preenche ao digitar, limpa quando o nome sai, grava ao salvar
  const dialogo = p.getByRole("dialog");
  const campoTitulo = dialogo.getByPlaceholder("O que precisa ser feito?");
  const campoCliente = dialogo.locator("div", { has: p.getByText("Cliente(s)", { exact: true }) }).last().locator("button").first();
  await p.getByRole("button", { name: "Nova", exact: true }).click();
  await campoTitulo.pressSequentially(T_FORM, { delay: 10 });
  confere((await campoCliente.innerText()).trim() === alvo.nome, `formulário: digitar o título preenche Cliente(s) com ${alvo.nome} (mostra "${(await campoCliente.innerText()).trim()}")`);
  await campoTitulo.fill("[TESTE] form nada");
  confere((await campoCliente.innerText()).trim() === "Sem cliente (opcional)", "formulário: tirar o nome do título limpa o cliente");
  await campoTitulo.fill(T_FORM);
  await dialogo.getByRole("button", { name: "Criar Demanda" }).click();
  await p.waitForTimeout(1500);
  confere((await buscar(T_FORM))?.cliente_id === alvo.id, "formulário: salvar grava o cliente reconhecido");

  // 3) Escolha à mão vence: depois de Pessoal, o título não mexe mais no campo (fecha sem salvar)
  await p.getByRole("button", { name: "Nova", exact: true }).click();
  await campoTitulo.fill(`${T_FORM} manual`);
  await campoCliente.click();
  await p.getByRole("option", { name: "Pessoal" }).click();
  await campoTitulo.fill(`${T_FORM} manual de novo`);
  confere((await campoCliente.innerText()).trim() === "Pessoal", "formulário: depois da escolha à mão, o título não troca o cliente");
  await p.keyboard.press("Escape");
} finally {
  for (const prefixo of ["[TESTE] rapido", "[TESTE] form"]) {
    await api(`demandas?titulo=like.${encodeURIComponent(prefixo + "*")}`, { method: "DELETE" }).catch(() => {});
  }
  await nav.close();
  console.log("demandas de teste apagadas");
}
console.log(falhas.length ? `${falhas.length} falha(s)` : "tudo certo");
process.exitCode = falhas.length ? 1 : 0;
```

- [ ] **Step 2: Linha no README das ferramentas**

Em `tools/auditoria-mobile/README.md`, no fim da lista de scripts, acrescentar:

```markdown
- Cliente pelo título nas Demandas: `node testar-cliente-no-titulo.mjs http://localhost:5178/` — adicionar rápido no Standby
  com e sem nome de cliente (confere banco e selo no card) e formulário "Nova" (preenche ao digitar, limpa, grava, escolha
  à mão vence). Cria demandas `[TESTE] rapido`/`[TESTE] form` e apaga todas no fim.
```

- [ ] **Step 3: Subir o servidor local (um só)**

Conferir que não há outro `vite` deste repositório rodando (dois servidores entram em ping-pong no `src/routeTree.gen.ts`):

```bash
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -match 'vite' } | Select-Object ProcessId, CommandLine | Format-List"
```

Se aparecer `vite` deste repositório, parar com `Stop-Process -Id <id>` (não mexer em `cua_node`/`codex.js`, que são do André). Depois, em segundo plano: `npx vite --port 5178`. Esperar o log "ready".

- [ ] **Step 4: Rodar o teste de tela**

Run (dentro de `tools/auditoria-mobile`; se faltar `node_modules` ali, rodar `npm install` antes):

```bash
cd tools/auditoria-mobile && node testar-cliente-no-titulo.mjs http://localhost:5178/
```

Expected: 7 linhas `OK`, `demandas de teste apagadas`, `tudo certo`, código de saída 0. Se algum seletor não achar o elemento (coluna Standby renomeada, por exemplo), ajustar o seletor no script, não o app.

Conferir que nada `[TESTE]` sobrou: abrir o quadro e procurar "[TESTE]" na busca (deve vir vazio).

- [ ] **Step 5: Parar o servidor e limpar**

Parar o `vite` (pelo `Get-CimInstance` + `Stop-Process`; o TaskStop do `npx` não mata o filho). Se `git status` mostrar `src/routeTree.gen.ts` modificado, `git checkout -- src/routeTree.gen.ts`.

- [ ] **Step 6: Commit e publicação**

```bash
git add tools/auditoria-mobile/testar-cliente-no-titulo.mjs tools/auditoria-mobile/README.md
git commit -m "test: script de tela do cliente pelo título nas Demandas

Closes #1"
git push origin main
```

Expected: push aceito; a Cloudflare publica o site sozinha. Conferir em `https://gestao.andrelopes.digital` (abrir o quadro, "Novo" no Standby com `[TESTE] Amuny`, ver o selo "Dra Amuny Gobato" no card, apagar o card).

- [ ] **Step 7: Registrar no cofre e fechar a issue**

No cofre (`C:\Users\Andre\Sistemas\Gestão de Operação\Obsidian Gestão de Operação\Gestão de Operação`), seguindo o `CLAUDE.md` dele:
- `_knowledge/modulos/demandas.md`, seção **Cards** (item "Criar"): acrescentar que o adicionar rápido e o "Nova" reconhecem o cliente no título (`src/lib/clienteNoTitulo.ts`, regra e lista de genéricas; só clientes, vários citados = vários atribuídos; formulário segue o título até a escolha manual), com a data de publicação e o commit. Em **Código**, citar `clienteNoTitulo.ts` e o teste; em **Armadilhas**, "cliente novo que der falso positivo: palavra entra em `GENERICAS`".
- `_decisions/2026-10-27-cliente-pelo-titulo-nas-demandas.md` (já existe, criada no planejamento): `status: active`, data de publicação e commits.
- `_knowledge/modulos/demandas.md`, **Pendências**: trocar o item "(Planejado em 2026-10-27, issue #1)" por "(Feito em <data>)".
- `_memory/current-state.md`: tirar a linha "Demandas: cliente pelo título" de Próximos passos e pôr uma linha curta em "No ar"; detalhe (commits, resultado do teste de tela) no topo de `_memory/historico.md`.

Depois: `gh issue comment 1 --body "<o que foi feito, commits, onde testar>"`. A issue fecha sozinha pelo `Closes #1` do push.

---

## Itens para o `/jev-plano`

- [r] CT1 | files: src/lib/clienteNoTitulo.ts,src/lib/clienteNoTitulo.test.ts | check: node --test src/lib/clienteNoTitulo.test.ts && npm test | exec: haiku | Task 1: criar a função e o teste exatamente como no plano; commit.
- [r] CT2 | files: src/routes/_authenticated/index.tsx | after: CT1 | check: npx tsc --noEmit -p . && npm test | exec: haiku | Task 2: import e insert do handleQuickAdd com cliente_id/clientes_extras e select com join; commit.
- [r] CT3 | files: src/components/DemandaForm.tsx | after: CT1 | check: npx tsc --noEmit -p . && npm test | exec: haiku | Task 3: useRef clientePeloTitulo, onChange do título, onEscolher encerra o automático; commit.
- [r] CT4 | files: tools/auditoria-mobile/testar-cliente-no-titulo.mjs,tools/auditoria-mobile/README.md | after: CT2,CT3 | check: cd tools/auditoria-mobile && node testar-cliente-no-titulo.mjs http://localhost:5178/ | exec: sonnet | Task 4 steps 1-5: script de tela, servidor local único, rodar, limpar.
- [ ] CT5 | files: cofre,_memory,_decisions | after: CT4 | check: gh issue view 1 --json state -q .state | exec: sonnet | Task 4 steps 6-7: commit com Closes #1, push, conferir no site, cofre e comentário na issue.
