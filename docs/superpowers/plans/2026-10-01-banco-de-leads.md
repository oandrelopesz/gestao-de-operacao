# Banco de leads — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** integrar a "Planilha CRM Mestra" ao sistema: visão Banco de leads dentro do CRM, aba CRM da planilha como espelho editável do CRM do sistema, sincronização nos dois sentidos.

**Architecture:** cópia das abas de leads no banco (`banco_leads_abas`, `banco_leads`); o Apps Script da planilha manda cada edição para a edge function `planilha`, que aplica as regras do CRM (libs puras copiadas para `_shared`) e devolve operações; gravações do sistema passam por gatilhos que enchem `planilha_fila` e avisam o Web App do Apps Script (pg_net); conferência a cada 5 min.

**Tech Stack:** React + TanStack Router + shadcn (front), Supabase/Lovable Cloud (Postgres, PostgREST, Realtime, pg_net, edge functions em Deno), Google Apps Script (V8), `node --test` para as libs puras.

**Spec:** `docs/superpowers/specs/2026-10-01-banco-de-leads-design.md`

## Global Constraints

- **Nada muda no funcionamento do CRM do sistema.** Toques permitidos: `VisaoCrm` + botão "Banco de leads" em `CrmTopo.tsx`, render da visão e `useCrmTempoReal()` em `routes/_authenticated/crm.tsx`.
- **Sem dependência nova no `package.json`** (o Lovable instala com bun; ver cofre `_learnings/sem-dependencia-nova.md`).
- Libs puras sem imports `@/`, com imports relativos terminando em `.ts`, testadas com `npm test` (`node --test src/lib/*.test.ts`); testes começam com `process.env.TZ = "Asia/Tokyo";`.
- Fuso: São Paulo = UTC-3 fixo (`crmFormato.ts`). Datas na planilha: `dd/mm/aaaa`, horas `hh:mm`, data e hora `dd/mm/aaaa hh:mm`.
- Textos para o usuário em português do Brasil, sem travessão nos textos novos.
- Tabelas novas no front: `supabase.from("x" as any) as any` (não estão em `types.ts`).
- Migration idempotente, aplicada no editor SQL do Lovable (ver cofre `_knowledge/tecnico/editor-sql-e-migrations.md`); RLS: tabelas lidas pelo front com política aberta `FOR ALL USING (true) WITH CHECK (true)`; tabelas internas com RLS sem política.
- Usuário padrão do app (coluna `user_id` de `prospeccao`): `b34bdae5-7a67-4b63-a46f-8aad43a06c63`.
- Nada de sequência de escape Unicode (barra invertida + u) nos arquivos: nas ferramentas ela vira o caractere literal. Use `\p{Diacritic}` e `String.fromCharCode`.
- Commits em português terminando com `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Planilha: id `176k4WPiMeOU1Va8AxSCsGdpzkA1F0lST0m4mbXQrZak`; script ligado `1xDQ4rcAWhkAQ7dkzH8HXxeuInC0Jg_BmzotPEadz2-R_w3H9DYRKeel0`; edge function em `https://bnpvzguapunsztsdvmrs.supabase.co/functions/v1/planilha`.

## Como os arquivos saem deste plano

Cada bloco de código precedido por `<!-- arquivo: caminho -->` é o conteúdo completo daquele arquivo. O script
`scripts/extrair-plano.mjs` (Task 0) grava os blocos pedidos: `node scripts/extrair-plano.mjs <caminho> [...]`.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/bancoLeads.ts` | Papéis das colunas, chaves, faturamento → faixa, lead do CRM a partir da linha, filtros, links |
| `src/lib/planilhaCrm.ts` | Linha da aba CRM, leitura de datas/valores, interpretação da edição, migração do CRM antigo, cores |
| `scripts/copiar-libs-edge.mjs` + `supabase/functions/_shared/*.ts` | Cópias das libs puras para a edge function |
| `supabase/migrations/20261001200000_banco_de_leads.sql` | Tabelas, gatilhos, funções, Realtime |
| `supabase/functions/planilha/{index,acoes,dados,agenda,operacoes}.ts` | A ponte (ações, banco, agenda pelo servidor, operações) |
| `infra/planilha-crm/Codigo.gs` + `README.md` | Apps Script da planilha |
| `src/lib/bancoLeadsDados.ts` | Leitura/gravação do Banco de leads no front |
| `src/components/crm/banco/*.tsx` | Telas do Banco de leads |
| `src/components/crm/useCrmTempoReal.ts` | Escuta Realtime do CRM |

---

### Task 0: extrator do plano

**Files:**
- Create: `scripts/extrair-plano.mjs`

- [ ] **Step 1: Criar o extrator**

<!-- arquivo: scripts/extrair-plano.mjs -->
```js
// Grava os arquivos de um plano: cada bloco de código precedido por "<!-- arquivo: caminho -->" vira o arquivo.
// Uso: node scripts/extrair-plano.mjs <plano.md> <caminho> [caminho...]   (sem caminhos: lista os disponíveis)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const [plano, ...pedidos] = process.argv.slice(2);
if (!plano) {
  console.error("Uso: node scripts/extrair-plano.mjs <plano.md> <caminho> [caminho...]");
  process.exit(1);
}
const texto = readFileSync(plano, "utf8").replace(/\r\n/g, "\n");
const blocos = new Map();
const re = /<!-- arquivo: (.+?) -->\n```[a-z]*\n([\s\S]*?)\n```\n/g;
for (const m of texto.matchAll(re)) blocos.set(m[1].trim(), m[2] + "\n");
if (pedidos.length === 0) {
  for (const k of blocos.keys()) console.log(k);
  process.exit(0);
}
for (const p of pedidos) {
  const conteudo = blocos.get(p);
  if (conteudo === undefined) {
    console.error(`Sem bloco para ${p}`);
    process.exit(1);
  }
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, conteudo);
  console.log(`gravado ${p} (${conteudo.length} bytes)`);
}
```

- [ ] **Step 2: Conferir que lista os blocos**

Run: `node scripts/extrair-plano.mjs docs/superpowers/plans/2026-10-01-banco-de-leads.md`
Expected: a lista de caminhos deste plano, começando por `scripts/extrair-plano.mjs`.

---

### Task 1: lib pura `bancoLeads.ts`

**Files:**
- Create: `src/lib/bancoLeads.ts`
- Test: `src/lib/bancoLeads.test.ts`

**Interfaces:**
- Produces: `Papel`, `ColunaAba`, `AbaBanco`, `LeadBanco`, `TITULO_ID`, `SIM`, `NAO`, `ABAS_FORA`, `normalizar(s)`,
  `papelDoTitulo(t)`, `chavesDosTitulos(titulos)`, `montarColunas(entrada)`, `ehAbaDeLeads(nome, titulos)`,
  `chaveDoPapel(aba, papel)`, `valorDoPapel(lead, aba, papel)`, `ehSim`, `ehNao`, `ehValido(lead, aba)`,
  `nomeDoLead(lead, aba)`, `colunasVisiveis(aba)`, `faixaDoFaturamento(texto)`, `dataIsoDoTexto(t)`,
  `CAMPOS_COMUNS`, `leadCrmDoBanco(lead, aba)`, `linkDoTexto(t)`, `linkInstagram(t)`, `FiltroBanco`,
  `FILTRO_BANCO_PADRAO`, `filtrarBanco(leads, abas, filtro)`, `opcoesDeFiltro(leads, aba, max?)`,
  `compararTexto(a, b)`, `textoDeBusca(lead, aba)`.

- [ ] **Step 1: Escrever os testes**

<!-- arquivo: src/lib/bancoLeads.test.ts -->
```ts
process.env.TZ = "Asia/Tokyo";
import test from "node:test";
import assert from "node:assert/strict";
import {
  chavesDosTitulos,
  colunasVisiveis,
  dataIsoDoTexto,
  ehAbaDeLeads,
  ehValido,
  faixaDoFaturamento,
  filtrarBanco,
  FILTRO_BANCO_PADRAO,
  leadCrmDoBanco,
  linkDoTexto,
  linkInstagram,
  montarColunas,
  opcoesDeFiltro,
  papelDoTitulo,
  textoDeBusca,
  valorDoPapel,
  type AbaBanco,
  type LeadBanco,
} from "./bancoLeads.ts";

const TITULOS_GENERALISTA = [
  "Data de chegada", "#", "Nome", "Empresa", "Instagram", "Link Instagram", "Telefone", "Faturamento mensal",
  "Investimento", "Origem", "Lead válido", "Primeira mensagem enviada", "ID (sistema)",
];
const OCULTAS = new Set([1, 12]);
const aba: AbaBanco = {
  id: "737400116",
  nome: "Generalista",
  ordem: 6,
  colunas: montarColunas(TITULOS_GENERALISTA.map((titulo, indice) => ({ titulo, indice, oculta: OCULTAS.has(indice) }))),
};
const lead = (dados: Record<string, string>, extra: Partial<LeadBanco> = {}): LeadBanco => ({
  id: "l1", aba_id: aba.id, posicao: 2, dados, lead_crm_id: null, ...extra,
});

test("papel pelo título: sem acento, sem diferença de maiúsculas e espaços", () => {
  assert.equal(papelDoTitulo("Nome do cliente"), "nome");
  assert.equal(papelDoTitulo("  lead VALIDO "), "valido");
  assert.equal(papelDoTitulo("Região / Cidade"), "cidade");
  assert.equal(papelDoTitulo("Especialidade"), "nicho");
  assert.equal(papelDoTitulo("ID (sistema)"), "id");
  assert.equal(papelDoTitulo("Observações"), null);
});

test("chaves: título aparado, repetidos ganham sufixo, vazio vira null", () => {
  assert.deepEqual(chavesDosTitulos(["Nome", "", " Nome ", "Telefone", "Nome"]), ["Nome", null, "Nome (2)", "Telefone", "Nome (3)"]);
});

test("montarColunas: pula título vazio, papel repetido fica sem papel, guarda índice e oculta", () => {
  const cols = montarColunas([
    { titulo: "Nome", indice: 0, oculta: false },
    { titulo: "", indice: 1, oculta: false },
    { titulo: "Nome do cliente", indice: 2, oculta: true },
  ]);
  assert.deepEqual(cols, [
    { chave: "Nome", titulo: "Nome", indice: 0, oculta: false, papel: "nome" },
    { chave: "Nome do cliente", titulo: "Nome do cliente", indice: 2, oculta: true, papel: null },
  ]);
});

test("aba de leads: tem 'Primeira mensagem enviada' e não é aba reservada", () => {
  assert.equal(ehAbaDeLeads("Médicos", TITULOS_GENERALISTA), true);
  assert.equal(ehAbaDeLeads("CRM", TITULOS_GENERALISTA), false);
  assert.equal(ehAbaDeLeads("Sem Instagram", TITULOS_GENERALISTA), false);
  assert.equal(ehAbaDeLeads("Outra", ["Nome", "Telefone"]), false);
});

test("colunas visíveis: sem as ocultas e sem o ID, na ordem da planilha", () => {
  const titulos = colunasVisiveis(aba).map((c) => c.titulo);
  assert.equal(titulos.includes("#"), false);
  assert.equal(titulos.includes("ID (sistema)"), false);
  assert.equal(titulos[0], "Data de chegada");
  assert.equal(titulos[1], "Nome");
});

test("faturamento → faixa só quando os limites batem", () => {
  assert.equal(faixaDoFaturamento("De R$50 mil a R$100 mil por mês"), "50k_100k");
  assert.equal(faixaDoFaturamento("De R$10 mil a R$30 mil por mês"), "10k_30k");
  assert.equal(faixaDoFaturamento("Até R$10 mil por mês"), "ate_10k");
  assert.equal(faixaDoFaturamento("Acima de R$1 milhão"), "acima_1m");
  assert.equal(faixaDoFaturamento("De R$300 mil a R$1.000.000"), "300k_1m");
  assert.equal(faixaDoFaturamento("De R$100 mil a R$500 mil por mês"), null);
  assert.equal(faixaDoFaturamento("De €50 mil a €100 mil por mês"), null);
  assert.equal(faixaDoFaturamento(""), null);
  assert.equal(faixaDoFaturamento("Em branco"), null);
});

test("data da planilha → aaaa-mm-dd", () => {
  assert.equal(dataIsoDoTexto("01/07/2025"), "2025-07-01");
  assert.equal(dataIsoDoTexto("1/7/25"), "2025-07-01");
  assert.equal(dataIsoDoTexto("31/13/2025"), null);
  assert.equal(dataIsoDoTexto("ontem"), null);
});

test("lead do CRM a partir da linha", () => {
  const l = lead({
    "Data de chegada": "13/02/2025", "Nome": "Abreu", "Empresa": "Imperial store", "Instagram": "@imperialstorerj",
    "Telefone": "5521971093314", "Faturamento mensal": "De R$50 mil a R$100 mil por mês",
  });
  assert.deepEqual(leadCrmDoBanco(l, aba), {
    nome: "Abreu", empresa: "Imperial store", telefone: "5521971093314", instagram: "@imperialstorerj",
    cidade: null, nicho: null, site: null, faturamento_faixa: "50k_100k", trafego: "organico", data_lead: "2025-02-13",
  });
  const semNome = leadCrmDoBanco(lead({ "Empresa": "Loja X" }), aba);
  assert.equal(semNome.nome, "Loja X");
  assert.equal("data_lead" in semNome, false);
});

test("lead válido: vazio conta como Sim", () => {
  assert.equal(ehValido(lead({}), aba), true);
  assert.equal(ehValido(lead({ "Lead válido": "Não" }), aba), false);
  assert.equal(valorDoPapel(lead({ "Telefone": " 55 " }), aba, "telefone"), "55");
});

test("links", () => {
  assert.equal(linkInstagram("@dr.brunopassos"), "https://instagram.com/dr.brunopassos");
  assert.equal(linkInstagram("https://instagram.com/abc"), "https://instagram.com/abc");
  assert.equal(linkInstagram("Clínica derma Blu"), null);
  assert.equal(linkDoTexto("https://vinci.malta.com.br  |  LP: https://x.link/J"), "https://vinci.malta.com.br");
  assert.equal(linkDoTexto("otonorte.com.br"), "https://otonorte.com.br");
  assert.equal(linkDoTexto("sem site"), null);
});

test("filtros: válido, no CRM e valor exato de coluna", () => {
  const abas = new Map([[aba.id, aba]]);
  const a = lead({ "Nome": "A", "Origem": "Generalista 3" }, { id: "a" });
  const b = lead({ "Nome": "B", "Lead válido": "Não", "Origem": "Generalista 1" }, { id: "b" });
  const c = lead({ "Nome": "C", "Origem": "Generalista 3" }, { id: "c", lead_crm_id: "x" });
  const todos = [a, b, c];
  assert.equal(filtrarBanco(todos, abas, FILTRO_BANCO_PADRAO), todos);
  assert.deepEqual(filtrarBanco(todos, abas, { ...FILTRO_BANCO_PADRAO, valido: "nao" }).map((l) => l.id), ["b"]);
  assert.deepEqual(filtrarBanco(todos, abas, { ...FILTRO_BANCO_PADRAO, crm: "sim" }).map((l) => l.id), ["c"]);
  assert.deepEqual(
    filtrarBanco(todos, abas, { ...FILTRO_BANCO_PADRAO, colunas: { "Origem": "Generalista 3" } }).map((l) => l.id),
    ["a", "c"],
  );
});

test("opções de filtro: só colunas visíveis com 2 a 15 valores", () => {
  const visivel: AbaBanco = { ...aba, colunas: aba.colunas.map((c) => ({ ...c, oculta: false })) };
  const leads = [
    lead({ "Investimento": "Sim", "Origem": "G1" }),
    lead({ "Investimento": "Em branco", "Origem": "G1" }),
  ];
  const ops = opcoesDeFiltro(leads, visivel);
  assert.deepEqual(ops.map((o) => o.titulo), ["Investimento"]);
  assert.deepEqual(ops[0].valores, ["Em branco", "Sim"]);
});

test("texto de busca junta nome, empresa, telefone, Instagram e o resto", () => {
  const t = textoDeBusca(lead({ "Nome": "Abreu", "Empresa": "Imperial", "Origem": "G3" }), aba);
  assert.equal(t[0], "Abreu");
  assert.equal(t.includes("G3"), true);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test src/lib/bancoLeads.test.ts`
Expected: FAIL (módulo `./bancoLeads.ts` não existe).

- [ ] **Step 3: Implementar**

<!-- arquivo: src/lib/bancoLeads.ts -->
```ts
// Banco de leads: regras puras da planilha de leads integrada ao CRM
// (spec docs/superpowers/specs/2026-10-01-banco-de-leads-design.md). Usadas pelo navegador e pela edge function
// `planilha` (cópia em supabase/functions/_shared). Sem dependências além dos tipos do CRM: roda no `node --test` e
// no Deno.
import type { LeadCrm } from "./crmTipos.ts";

export type Papel =
  | "nome" | "empresa" | "telefone" | "instagram" | "link_instagram" | "faturamento" | "cidade" | "nicho" | "site"
  | "data_chegada" | "valido" | "primeira_msg" | "id";

export interface ColunaAba {
  chave: string;
  titulo: string;
  /** Posição na planilha (0 = coluna A) */
  indice: number;
  oculta: boolean;
  papel: Papel | null;
}

export interface AbaBanco {
  /** gid da aba na planilha */
  id: string;
  nome: string;
  ordem: number;
  colunas: ColunaAba[];
  ativa?: boolean;
}

export interface LeadBanco {
  id: string;
  aba_id: string;
  /** Linha na planilha */
  posicao: number;
  /** Valores por chave de coluna (células vazias não entram) */
  dados: Record<string, string>;
  lead_crm_id: string | null;
  hash?: string | null;
  na_planilha?: boolean;
  updated_at?: string | null;
}

export const TITULO_ID = "ID (sistema)";
export const SIM = "Sim";
export const NAO = "Não";

/** Abas que nunca são de leads (as de apoio ficam ocultas na planilha). */
export const ABAS_FORA = [
  "Resumo", "CRM", "CRM - lixeira", "CRM antigo (backup)",
  "Duplicatas removidas", "Excluidos nesta rodada", "Sem Instagram", "Empresa não identificada",
];

const TITULOS_PAPEL: [Papel, string[]][] = [
  ["nome", ["Nome", "Nome do cliente", "Lead"]],
  ["empresa", ["Empresa", "Nome da empresa"]],
  ["telefone", ["Telefone"]],
  ["instagram", ["Instagram"]],
  ["link_instagram", ["Link Instagram", "Link do Instagram"]],
  ["faturamento", ["Faturamento mensal"]],
  ["cidade", ["Cidade / UF", "Região / Cidade", "Cidade"]],
  ["nicho", ["Nicho", "Especialidade", "Tipo de Negócio"]],
  ["site", ["Site / LP", "Link da LP", "Site"]],
  ["data_chegada", ["Data de chegada"]],
  ["valido", ["Lead válido"]],
  ["primeira_msg", ["Primeira mensagem enviada"]],
  ["id", [TITULO_ID]],
];

/** Sem acento, minúsculo e com espaços simples (para comparar títulos e valores). */
export function normalizar(s: string | null | undefined): string {
  return String(s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase().replace(/\s+/g, " ");
}

const PAPEL_POR_TITULO = new Map<string, Papel>(
  TITULOS_PAPEL.flatMap(([papel, titulos]) => titulos.map((t) => [normalizar(t), papel] as [string, Papel])),
);

export function papelDoTitulo(titulo: string): Papel | null {
  return PAPEL_POR_TITULO.get(normalizar(titulo)) ?? null;
}

/** Chave de cada coluna: o título sem espaços nas pontas; repetidos ganham " (2)", " (3)". Vazio = null. */
export function chavesDosTitulos(titulos: string[]): (string | null)[] {
  const usados = new Map<string, number>();
  return titulos.map((t) => {
    const titulo = String(t ?? "").trim();
    if (!titulo) return null;
    const n = (usados.get(titulo) ?? 0) + 1;
    usados.set(titulo, n);
    return n === 1 ? titulo : `${titulo} (${n})`;
  });
}

/** Colunas de uma aba a partir dos títulos da linha 1. Cada papel fica só com a primeira coluna que o tem. */
export function montarColunas(entrada: { titulo: string; oculta: boolean; indice: number }[]): ColunaAba[] {
  const chaves = chavesDosTitulos(entrada.map((c) => c.titulo));
  const papeis = new Set<Papel>();
  const out: ColunaAba[] = [];
  entrada.forEach((c, i) => {
    const chave = chaves[i];
    if (!chave) return;
    let papel = papelDoTitulo(c.titulo);
    if (papel && papeis.has(papel)) papel = null;
    if (papel) papeis.add(papel);
    out.push({ chave, titulo: String(c.titulo).trim(), indice: Number(c.indice), oculta: !!c.oculta, papel });
  });
  return out;
}

export function ehAbaDeLeads(nome: string, titulos: string[]): boolean {
  if (ABAS_FORA.includes(String(nome).trim())) return false;
  return titulos.some((t) => papelDoTitulo(t) === "primeira_msg");
}

type ComColunas = Pick<AbaBanco, "colunas"> | null | undefined;

export function chaveDoPapel(aba: ComColunas, papel: Papel): string | null {
  return aba?.colunas.find((c) => c.papel === papel)?.chave ?? null;
}

export function valorDoPapel(lead: Pick<LeadBanco, "dados">, aba: ComColunas, papel: Papel): string {
  const chave = chaveDoPapel(aba, papel);
  return chave ? String(lead.dados[chave] ?? "").trim() : "";
}

export const ehSim = (v: string | null | undefined) => normalizar(v) === "sim";
export const ehNao = (v: string | null | undefined) => normalizar(v) === "nao";

/** "Lead válido" vazio conta como Sim (como na planilha). */
export function ehValido(lead: Pick<LeadBanco, "dados">, aba: ComColunas): boolean {
  return !ehNao(valorDoPapel(lead, aba, "valido"));
}

export function nomeDoLead(lead: Pick<LeadBanco, "dados">, aba: ComColunas): string {
  return valorDoPapel(lead, aba, "nome") || valorDoPapel(lead, aba, "empresa") || "Sem nome";
}

/** Colunas que aparecem no sistema: as visíveis na planilha, sem o ID, na ordem da planilha. */
export function colunasVisiveis(aba: Pick<AbaBanco, "colunas">): ColunaAba[] {
  return aba.colunas.filter((c) => !c.oculta && c.papel !== "id").sort((a, b) => a.indice - b.indice);
}

const LIMITES_FATURAMENTO: [string, number, number][] = [
  ["ate_10k", 0, 10_000],
  ["10k_30k", 10_000, 30_000],
  ["30k_50k", 30_000, 50_000],
  ["50k_100k", 50_000, 100_000],
  ["100k_300k", 100_000, 300_000],
  ["300k_1m", 300_000, 1_000_000],
  ["acima_1m", 1_000_000, Infinity],
];

function numeroEmReais(n: string, unidade: string | undefined): number {
  const semMilhar = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(n) ? n.replace(/\./g, "") : n;
  const v = Number(semMilhar.replace(",", "."));
  if (!unidade) return v;
  return unidade === "mil" ? v * 1_000 : v * 1_000_000;
}

/** Faixa de faturamento do CRM para o texto da planilha, só quando os limites batem exatamente. */
export function faixaDoFaturamento(texto: string | null | undefined): string | null {
  const t = normalizar(texto);
  if (!t || !t.includes("r$") || t.includes("€") || /\beur/.test(t)) return null;
  const valores = [...t.matchAll(/(\d[\d.,]*)\s*(milhoes|milhao|mil)?/g)].map((m) => numeroEmReais(m[1], m[2]));
  if (valores.length === 0 || valores.some((v) => !Number.isFinite(v))) return null;
  let de: number;
  let ate: number;
  if (valores.length === 2) [de, ate] = valores;
  else if (valores.length === 1 && t.startsWith("ate")) [de, ate] = [0, valores[0]];
  else if (valores.length === 1 && (t.startsWith("acima") || t.startsWith("mais de"))) [de, ate] = [valores[0], Infinity];
  else return null;
  return LIMITES_FATURAMENTO.find(([, a, b]) => a === de && b === ate)?.[0] ?? null;
}

/** "dd/mm/aaaa" (ou "d/m/aa") → "aaaa-mm-dd" (coluna `data_lead`). */
export function dataIsoDoTexto(t: string | null | undefined): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(String(t ?? "").trim());
  if (!m) return null;
  const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const mes = Number(m[2]);
  const dia = Number(m[1]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Campos em comum entre a aba de origem e o lead do CRM (mesmo nome do papel e da coluna de `prospeccao`). */
export const CAMPOS_COMUNS = ["nome", "empresa", "telefone", "instagram", "cidade", "nicho", "site"] as const;
export type CampoComum = (typeof CAMPOS_COMUNS)[number];

/** Dados do lead do CRM criado a partir de uma linha da planilha (sem coluna nem datas do funil). */
export function leadCrmDoBanco(lead: Pick<LeadBanco, "dados">, aba: ComColunas): Partial<LeadCrm> {
  const v = (p: Papel) => valorDoPapel(lead, aba, p) || null;
  const data = dataIsoDoTexto(v("data_chegada"));
  return {
    nome: nomeDoLead(lead, aba),
    empresa: v("empresa"),
    telefone: v("telefone"),
    instagram: v("instagram"),
    cidade: v("cidade"),
    nicho: v("nicho"),
    site: v("site"),
    faturamento_faixa: faixaDoFaturamento(v("faturamento")),
    trafego: "organico",
    ...(data ? { data_lead: data } : {}),
  };
}

/** Primeiro link http(s) do texto, ou um domínio solto ("site.com.br"). */
export function linkDoTexto(t: string | null | undefined): string | null {
  const s = String(t ?? "").trim();
  const m = /https?:\/\/[^\s|,;]+/i.exec(s);
  if (m) return m[0];
  return /^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(s) ? `https://${s}` : null;
}

export function linkInstagram(t: string | null | undefined): string | null {
  const s = String(t ?? "").trim();
  if (/instagram\.com/i.test(s)) return linkDoTexto(s);
  const usuario = s.replace(/^@/, "");
  return /^[A-Za-z0-9._]{2,30}$/.test(usuario) ? `https://instagram.com/${usuario}` : null;
}

export type FiltroSimNao = "todos" | "sim" | "nao";

export interface FiltroBanco {
  valido: FiltroSimNao;
  crm: FiltroSimNao;
  /** chave da coluna → valor exato */
  colunas: Record<string, string>;
}

export const FILTRO_BANCO_PADRAO: FiltroBanco = { valido: "todos", crm: "todos", colunas: {} };

export function filtrarBanco(leads: LeadBanco[], abas: Map<string, AbaBanco>, f: FiltroBanco): LeadBanco[] {
  const extras = Object.entries(f.colunas).filter(([, v]) => v);
  if (f.valido === "todos" && f.crm === "todos" && extras.length === 0) return leads;
  return leads.filter((l) => {
    if (f.valido !== "todos" && ehValido(l, abas.get(l.aba_id)) !== (f.valido === "sim")) return false;
    if (f.crm !== "todos" && !!l.lead_crm_id !== (f.crm === "sim")) return false;
    return extras.every(([chave, valor]) => (l.dados[chave] ?? "") === valor);
  });
}

const PAPEIS_SEM_FILTRO: (Papel | null)[] = [
  "nome", "empresa", "telefone", "instagram", "link_instagram", "site", "valido", "primeira_msg", "id", "data_chegada",
];

/** Colunas visíveis boas para "Mais filtros": de 2 a `max` valores diferentes. */
export function opcoesDeFiltro(
  leads: LeadBanco[],
  aba: Pick<AbaBanco, "colunas">,
  max = 15,
): { chave: string; titulo: string; valores: string[] }[] {
  return colunasVisiveis(aba)
    .filter((c) => !PAPEIS_SEM_FILTRO.includes(c.papel))
    .map((c) => {
      const valores = [...new Set(leads.map((l) => String(l.dados[c.chave] ?? "").trim()).filter(Boolean))];
      return { chave: c.chave, titulo: c.titulo, valores: valores.sort((a, b) => compararTexto(a, b)) };
    })
    .filter((o) => o.valores.length >= 2 && o.valores.length <= max);
}

/** Ordem de texto da planilha: datas dd/mm/aaaa pela data, números pela grandeza, vazio por último. */
export function compararTexto(a: string, b: string): number {
  const x = String(a ?? "").trim();
  const y = String(b ?? "").trim();
  if (!x && !y) return 0;
  if (!x) return 1;
  if (!y) return -1;
  const dx = dataIsoDoTexto(x);
  const dy = dataIsoDoTexto(y);
  if (dx && dy) return dx.localeCompare(dy);
  return x.localeCompare(y, "pt-BR", { sensitivity: "base", numeric: true });
}

/** Campos para a busca tolerante: nome primeiro, depois empresa, telefone, Instagram e o resto da linha. */
export function textoDeBusca(lead: Pick<LeadBanco, "dados">, aba: ComColunas): string[] {
  const principais = [
    nomeDoLead(lead, aba), valorDoPapel(lead, aba, "empresa"), valorDoPapel(lead, aba, "telefone"),
    valorDoPapel(lead, aba, "instagram"),
  ];
  const resto = Object.values(lead.dados).filter((v) => !principais.includes(v));
  return [...principais, ...resto];
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test src/lib/bancoLeads.test.ts`
Expected: todos os testes PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/extrair-plano.mjs src/lib/bancoLeads.ts src/lib/bancoLeads.test.ts
git commit -m "Banco de leads: regras puras das abas da planilha (papéis, chaves, faturamento, filtros)"
```

---

### Task 2: lib pura `planilhaCrm.ts`

**Files:**
- Create: `src/lib/planilhaCrm.ts`
- Test: `src/lib/planilhaCrm.test.ts`

**Interfaces:**
- Consumes: `normalizar`, `faixaDoFaturamento`, `TITULO_ID` (Task 1); `planejarMovimento`, `planejarReuniao`,
  `validarMovimento` (`crmMovimento.ts`); `registrarTentativa` (`crmTentativas.ts`); `reiniciarPontos` (`crmPontos.ts`).
- Produces: `COLUNAS_PLANILHA_CRM`, `TituloCrm`, `SO_LEITURA`, `COLUNAS_LIXEIRA`, `LinhaCrm`, `OrigemLead`
  `{ abaNome, faturamentoTexto }`, `PendenciaCrm` `{ etapa_id, falta }`, `MOTIVO_MIGRACAO`, `dataHoraPlanilha(iso)`,
  `rotuloRemarcacao(id)`, `motivoRemarcacaoDoTexto(t)`, `motivosDaEtapa(coluna)`, `linhaCrm(lead, colunas, origem,
  pendencia)`, `CorLinha`, `corDaLinhaCrm(tipo, pendente)`, `lerData`, `lerHora`, `isoDeDataHora`, `lerDataHora`,
  `lerReais`, `lerInteiro`, `Interpretacao`, `interpretarLinhaCrm(lead, colunas, linha, origem, pendencia, agora)`,
  `EventoMigrado`, `Migracao`, `migrarLinhaAntiga(linha, colunas, agora)`.

- [ ] **Step 1: Escrever os testes**

<!-- arquivo: src/lib/planilhaCrm.test.ts -->
```ts
process.env.TZ = "Asia/Tokyo";
import test from "node:test";
import assert from "node:assert/strict";
import {
  corDaLinhaCrm,
  interpretarLinhaCrm,
  isoDeDataHora,
  lerData,
  lerDataHora,
  lerHora,
  lerInteiro,
  lerReais,
  linhaCrm,
  migrarLinhaAntiga,
  MOTIVO_MIGRACAO,
  motivoRemarcacaoDoTexto,
  motivosDaEtapa,
  type LinhaCrm,
} from "./planilhaCrm.ts";
import { COLUNAS_PADRAO } from "./crmColunas.ts";
import { leadBase, type ColunaCrm, type LeadCrm } from "./crmTipos.ts";
import { deSP } from "./crmFormato.ts";

const colunas = COLUNAS_PADRAO;
const col = (id: string): ColunaCrm => colunas.find((c) => c.id === id)!;
const agora = deSP(2026, 10, 1, 15, 0);
const lead = (over: Partial<LeadCrm> = {}) =>
  leadBase({ id: "L1", nome: "Daniel", coluna_id: "desenvolvendo", created_at: deSP(2026, 9, 10, 10, 0).toISOString(), ...over });
const comEdicao = (l: LeadCrm, mudancas: LinhaCrm, origem = null, pendencia = null) => ({
  ...linhaCrm(l, colunas, origem, pendencia),
  ...mudancas,
});

test("leitura de data, hora, data e hora, reais e inteiro", () => {
  assert.deepEqual(lerData("05/10/2026"), { ano: 2026, mes: 10, dia: 5 });
  assert.deepEqual(lerData("5/10/26"), { ano: 2026, mes: 10, dia: 5 });
  assert.equal(lerData("32/10/2026"), null);
  assert.deepEqual(lerHora("10:30"), { hora: 10, minuto: 30 });
  assert.deepEqual(lerHora("10:30:00"), { hora: 10, minuto: 30 });
  assert.deepEqual(lerHora("14h"), { hora: 14, minuto: 0 });
  assert.deepEqual(lerHora("9h15"), { hora: 9, minuto: 15 });
  assert.equal(lerHora("25:00"), null);
  assert.equal(isoDeDataHora("05/10/2026", "10:30"), deSP(2026, 10, 5, 10, 30).toISOString());
  assert.equal(lerDataHora("05/10/2026 14:00"), deSP(2026, 10, 5, 14, 0).toISOString());
  assert.equal(lerDataHora("05/10/2026"), deSP(2026, 10, 5, 10, 0).toISOString());
  assert.equal(lerDataHora("amanhã"), null);
  assert.equal(lerReais("R$ 1.500,00"), 1500);
  assert.equal(lerReais("1500"), 1500);
  assert.equal(lerReais("1.500"), 1500);
  assert.equal(lerReais("2500,5"), 2500.5);
  assert.equal(lerReais(""), null);
  assert.equal(lerReais("mil reais"), undefined);
  assert.equal(lerInteiro("3"), 3);
  assert.equal(lerInteiro(""), null);
  assert.equal(lerInteiro("três"), undefined);
});

test("linha da aba CRM: campos, origem, reunião, valores e etapa", () => {
  const l = lead({
    email: "d@x.com", empresa: "Loja", telefone: "5521999990000", trafego: "pago",
    reuniao_em: deSP(2026, 10, 3, 10, 0).toISOString(), reuniao_duracao_min: 45, evento_google_id: "ev1",
    evento_status: "ok", evento_meet_link: "https://meet.google.com/abc", valor_proposta: 2500, coluna_id: "reuniao_marcada",
    coluna_desde: deSP(2026, 10, 1, 9, 5).toISOString(), follow_up: 2,
  });
  const linha = linhaCrm(l, colunas, { abaNome: "Generalista", faturamentoTexto: "De R$50 mil a R$100 mil por mês" }, null);
  assert.equal(linha["Lead"], "Daniel");
  assert.equal(linha["Aba de origem"], "Generalista");
  assert.equal(linha["Etapa"], "Reunião marcada");
  assert.equal(linha["Na etapa desde"], "01/10/2026 09:05");
  assert.equal(linha["Tentativas"], "2");
  assert.equal(linha["Reunião (data)"], "03/10/2026");
  assert.equal(linha["Reunião (hora)"], "10:00");
  assert.equal(linha["Duração (min)"], "45");
  assert.equal(linha["Situação"], "Evento criado");
  assert.equal(linha["Valor da proposta"].replace(/\s/g, " "), "R$ 2.500,00");
  assert.equal(linha["Valor fechado"], "");
  assert.equal(linha["Orgânico/Pago"], "Pago");
  assert.equal(linha["Faturamento"], "De R$50 mil a R$100 mil por mês");
  assert.equal(linha["Entrou no CRM"], "10/09/2026");
  assert.equal(linha["ID (sistema)"], "L1");
  const semOrigem = linhaCrm(lead({ faturamento_faixa: "50k_100k" }), colunas, null, null);
  assert.equal(semOrigem["Aba de origem"], "Sistema");
  assert.equal(semOrigem["Faturamento"], "R$ 50 a 100 mil");
  assert.equal(semOrigem["Reunião (data)"], "");
});

test("linha com pendência mostra a etapa escolhida e o que falta", () => {
  const linha = linhaCrm(lead(), colunas, null, { etapa_id: "reuniao_marcada", falta: "data e hora da reunião" });
  assert.equal(linha["Etapa"], "Reunião marcada");
  assert.equal(linha["Situação"], "Falta preencher: data e hora da reunião; no sistema o lead continua em Desenvolvendo conversa");
});

test("motivos e cores por etapa", () => {
  assert.deepEqual(motivosDaEtapa(col("remarcar")), ["Não compareceu (no-show)", "Não confirmou", "Pediu para remarcar"]);
  assert.equal(motivosDaEtapa(col("perdido")).includes("Achou caro"), true);
  assert.deepEqual(motivosDaEtapa(col("respondeu")), []);
  assert.equal(motivoRemarcacaoDoTexto("Não compareceu (no-show)"), "no_show");
  assert.equal(motivoRemarcacaoDoTexto("nao confirmou"), "nao_confirmou");
  assert.equal(motivoRemarcacaoDoTexto("Pediu para remarcar"), "pediu_remarcar");
  assert.equal(motivoRemarcacaoDoTexto("outra coisa"), null);
  assert.equal(corDaLinhaCrm("ganho", false)?.fundo, "#d9ead3");
  assert.equal(corDaLinhaCrm("perdido", false)?.fundo, "#f4cccc");
  assert.equal(corDaLinhaCrm("reuniao", false)?.fundo, "#fff2cc");
  assert.equal(corDaLinhaCrm("padrao", true)?.fundo, "#fce5cd");
  assert.equal(corDaLinhaCrm("padrao", false), null);
});

test("campos simples: e-mail válido grava com evento; inválido volta com aviso", () => {
  const l = lead();
  const ok = interpretarLinhaCrm(l, colunas, comEdicao(l, { "E-mail": "novo@x.com", "Observações": "liga às 10h" }), null, null, agora);
  assert.equal(ok.patch.email, "novo@x.com");
  assert.equal(ok.patch.observacoes, "liga às 10h");
  assert.equal(ok.eventos[0].tipo, "edicao");
  assert.equal(ok.eventos[0].descricao, "Editado: Observações, E-mail");
  const ruim = interpretarLinhaCrm(l, colunas, comEdicao(l, { "E-mail": "sem-arroba" }), null, null, agora);
  assert.equal(ruim.patch.email, undefined);
  assert.deepEqual(ruim.reverter, ["E-mail"]);
  assert.deepEqual(ruim.avisos, ["E-mail inválido."]);
});

test("coluna que só o sistema preenche volta ao valor do sistema", () => {
  const l = lead();
  const r = interpretarLinhaCrm(l, colunas, comEdicao(l, { "Link do Meet": "https://meet.google.com/x" }), null, null, agora);
  assert.deepEqual(r.reverter, ["Link do Meet"]);
  assert.deepEqual(r.patch, {});
});

test("etapa que exige dado sem o dado vira pendência", () => {
  const l = lead();
  const r = interpretarLinhaCrm(l, colunas, comEdicao(l, { "Etapa": "Reunião marcada" }), null, null, agora);
  assert.deepEqual(r.pendencia, { etapa_id: "reuniao_marcada", falta: "data e hora da reunião" });
  assert.equal(r.patch.coluna_id, undefined);
  const perdido = interpretarLinhaCrm(l, colunas, comEdicao(l, { "Etapa": "Lead perdido" }), null, null, agora);
  assert.deepEqual(perdido.pendencia, { etapa_id: "perdido", falta: "o motivo" });
  const ganho = interpretarLinhaCrm(l, colunas, comEdicao(l, { "Etapa": "Fechamento" }), null, null, agora);
  assert.deepEqual(ganho.pendencia, { etapa_id: "fechamento", falta: "o valor fechado" });
});

test("reunião marcada com data e hora move e pede evento na agenda", () => {
  const l = lead();
  const r = interpretarLinhaCrm(
    l, colunas,
    comEdicao(l, { "Etapa": "Reunião marcada", "Reunião (data)": "03/10/2026", "Reunião (hora)": "14:30" }),
    null, null, agora,
  );
  assert.equal(r.patch.coluna_id, "reuniao_marcada");
  assert.equal(r.patch.reuniao_em, deSP(2026, 10, 3, 14, 30).toISOString());
  assert.equal(r.patch.reuniao_duracao_min, 30);
  assert.equal(r.agenda, "criar");
  assert.equal(r.pendencia, null);
});

test("pendência completada na edição seguinte apaga a pendência", () => {
  const l = lead();
  const pend = { etapa_id: "perdido", falta: "o motivo" };
  const r = interpretarLinhaCrm(l, colunas, comEdicao(l, { "Motivo": "Achou caro" }, null, pend as never), null, pend, agora);
  assert.equal(r.patch.coluna_id, "perdido");
  assert.equal(r.patch.motivo_perda, "Achou caro");
  assert.equal(r.pendencia, "apagar");
});

test("voltar a etapa para a do sistema apaga a pendência", () => {
  const l = lead();
  const pend = { etapa_id: "perdido", falta: "o motivo" };
  const r = interpretarLinhaCrm(l, colunas, comEdicao(l, { "Etapa": "Desenvolvendo conversa" }, null, pend as never), null, pend, agora);
  assert.equal(r.pendencia, "apagar");
  assert.deepEqual(r.patch, {});
});

test("remarcação: 'Pediu para remarcar' sem data nova fica pendente; com data nova move", () => {
  const em = deSP(2026, 10, 2, 10, 0).toISOString();
  const l = lead({ coluna_id: "reuniao_marcada", reuniao_em: em, evento_google_id: "ev1", evento_status: "ok" });
  const sem = interpretarLinhaCrm(l, colunas, comEdicao(l, { "Etapa": "Remarcar reunião", "Motivo": "Pediu para remarcar" }), null, null, agora);
  assert.deepEqual(sem.pendencia, { etapa_id: "remarcar", falta: "a nova data e hora da reunião" });
  const com = interpretarLinhaCrm(
    l, colunas,
    comEdicao(l, { "Etapa": "Remarcar reunião", "Motivo": "Pediu para remarcar", "Reunião (data)": "06/10/2026" }),
    null, null, agora,
  );
  assert.equal(com.patch.coluna_id, "remarcar");
  assert.equal(com.patch.reuniao_em, deSP(2026, 10, 6, 10, 0).toISOString());
  assert.equal(com.patch.remarcacoes, 1);
  assert.equal(com.agenda, "mover");
});

test("reunião mudada sem trocar de etapa move o evento", () => {
  const l = lead({ coluna_id: "reuniao_marcada", reuniao_em: deSP(2026, 10, 2, 10, 0).toISOString(), evento_google_id: "ev1" });
  const r = interpretarLinhaCrm(l, colunas, comEdicao(l, { "Reunião (hora)": "16:00" }), null, null, agora);
  assert.equal(r.patch.reuniao_em, deSP(2026, 10, 2, 16, 0).toISOString());
  assert.equal(r.agenda, "mover");
  const soData = interpretarLinhaCrm(lead(), colunas, comEdicao(lead(), { "Reunião (data)": "04/10/2026" }), null, null, agora);
  assert.deepEqual(soData.patch, {}, "só a data: espera a hora");
  assert.deepEqual(soData.reverter, []);
});

test("tentativas: sobem na etapa de follow-up; fora dela ou para baixo voltam", () => {
  const l = lead({ coluna_id: "follow_up", follow_up: 1 });
  const r = interpretarLinhaCrm(l, colunas, comEdicao(l, { "Tentativas": "3" }), null, null, agora);
  assert.equal(r.patch.follow_up, 3);
  assert.equal(r.eventos.filter((e) => e.tipo === "tentativa").length, 2);
  const fora = interpretarLinhaCrm(lead(), colunas, comEdicao(lead(), { "Tentativas": "2" }), null, null, agora);
  assert.deepEqual(fora.reverter, ["Tentativas"]);
  const menos = interpretarLinhaCrm(l, colunas, comEdicao(l, { "Tentativas": "0" }), null, null, agora);
  assert.deepEqual(menos.reverter, ["Tentativas"]);
});

test("motivo só vale nas etapas que têm motivo", () => {
  const perdido = lead({ coluna_id: "perdido", motivo_perda: "Achou caro" });
  const r = interpretarLinhaCrm(perdido, colunas, comEdicao(perdido, { "Motivo": "Sem orçamento agora" }), null, null, agora);
  assert.equal(r.patch.motivo_perda, "Sem orçamento agora");
  const fora = interpretarLinhaCrm(lead(), colunas, comEdicao(lead(), { "Motivo": "Achou caro" }), null, null, agora);
  assert.deepEqual(fora.reverter, ["Motivo"]);
});

test("e-mail novo com reunião futura pede convite", () => {
  const l = lead({ coluna_id: "reuniao_marcada", reuniao_em: deSP(2026, 10, 5, 10, 0).toISOString(), evento_google_id: "ev1", email: "a@x.com" });
  const r = interpretarLinhaCrm(l, colunas, comEdicao(l, { "E-mail": "b@x.com" }), null, null, agora);
  assert.equal(r.agenda, "convidar");
  assert.equal(r.emailAntigo, "a@x.com");
});

test("faturamento editado fica para a edge function decidir", () => {
  const r = interpretarLinhaCrm(lead(), colunas, comEdicao(lead(), { "Faturamento": "R$ 10 a 30 mil" }), null, null, agora);
  assert.equal(r.faturamento, "R$ 10 a 30 mil");
});

test("migração do CRM antigo: etapa, datas, reunião passada e tentativas", () => {
  const base = { "Lead": "Daniel", "Empresa": "Loja", "Telefone": "5511999990000", "Data 1ª mensagem": "10/09/2026" };
  const primeiro = migrarLinhaAntiga(base, colunas, agora)!;
  assert.equal(primeiro.campos.coluna_id, "primeiro_contato");
  assert.equal(primeiro.campos.primeiro_contato_em, deSP(2026, 9, 10, 10, 0).toISOString());
  assert.equal(primeiro.campos.created_at, deSP(2026, 9, 10, 10, 0).toISOString());
  assert.equal(primeiro.eventos[0].descricao, "Importado do CRM antigo da planilha (Primeiro contato)");

  const perdido = migrarLinhaAntiga({ ...base, "Lead Perdido": "Sim" }, colunas, agora)!;
  assert.equal(perdido.campos.coluna_id, "perdido");
  assert.equal(perdido.campos.motivo_perda, MOTIVO_MIGRACAO);

  const reuniao = migrarLinhaAntiga(
    { ...base, "Lead respondeu": "Sim", "Desenvolvendo conversa": "Sim", "Reunião Agendada": "Sim", "Data da reunião": "11/09/2026", "Hora da reunião": "10:00" },
    colunas, agora,
  )!;
  assert.equal(reuniao.campos.coluna_id, "reuniao_marcada");
  assert.equal(reuniao.campos.reuniao_em, deSP(2026, 9, 11, 10, 0).toISOString());
  assert.equal(reuniao.campos.reuniao_marcada_em, agora.toISOString());
  assert.equal(reuniao.campos.evento_google_id, undefined);

  const fup = migrarLinhaAntiga({ ...base, "Follow Up 1": "Sim", "Data FUP 1": "12/09/2026" }, colunas, agora)!;
  assert.equal(fup.campos.coluna_id, "follow_up");
  assert.equal(fup.campos.follow_up, 1);
  assert.equal(fup.eventos[1].tipo, "tentativa");
  assert.equal(fup.eventos[1].em, deSP(2026, 9, 12, 10, 0).toISOString());

  const desenv = migrarLinhaAntiga({ ...base, "Desenvolvendo conversa": "Sim", "Reunião Agendada": "Não" }, colunas, agora)!;
  assert.equal(desenv.campos.coluna_id, "desenvolvendo");
  assert.equal(migrarLinhaAntiga({ "Lead": "", "Empresa": "" }, colunas, agora), null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test src/lib/planilhaCrm.test.ts`
Expected: FAIL (módulo `./planilhaCrm.ts` não existe).

- [ ] **Step 3: Implementar**

<!-- arquivo: src/lib/planilhaCrm.ts -->
```ts
// Aba CRM da planilha como espelho editável do CRM do sistema (spec 2026-10-01-banco-de-leads §5.2 a §5.5 e §9).
// Monta a linha de cada lead, lê o que foi editado e decide o que fazer com as regras do próprio CRM.
// Sem dependências além das libs puras do CRM (roda no `node --test` e no Deno).
import type { ColunaCrm, LeadCrm, MotivoRemarcacao, NovoEvento, TipoColuna } from "./crmTipos.ts";
import {
  emailValido,
  exigenciaDe,
  FAIXAS_FATURAMENTO,
  MOTIVOS_REMARCACAO,
  motivosDa,
  ordenarColunas,
  rotuloFaixa,
  type Exigencia,
} from "./crmColunas.ts";
import { deSP, formatarData, formatarHora, formatarReais, partesSP } from "./crmFormato.ts";
import {
  planejarMovimento,
  planejarReuniao,
  validarMovimento,
  type AcaoAgenda,
  type DadosJanela,
  type DadosReuniao,
} from "./crmMovimento.ts";
import { registrarTentativa } from "./crmTentativas.ts";
import { reiniciarPontos } from "./crmPontos.ts";
import { faixaDoFaturamento, normalizar, TITULO_ID } from "./bancoLeads.ts";

export const COLUNAS_PLANILHA_CRM = [
  "Lead", "Empresa", "Telefone", "E-mail", "Instagram", "Aba de origem", "Etapa", "Na etapa desde", "Tentativas",
  "Tentativas da proposta", "Próximo contato", "Reunião (data)", "Reunião (hora)", "Duração (min)", "Link do Meet",
  "Situação", "Valor da proposta", "Valor fechado", "Motivo", "Orgânico/Pago", "Nicho", "Cidade", "Faturamento",
  "Observações", "Entrou no CRM", "ID (sistema)",
] as const;
export type TituloCrm = (typeof COLUNAS_PLANILHA_CRM)[number];

/** Colunas que o sistema preenche: editar na planilha não muda nada (a célula volta). */
export const SO_LEITURA: readonly TituloCrm[] = [
  "Aba de origem", "Na etapa desde", "Link do Meet", "Situação", "Entrou no CRM", "ID (sistema)",
];

/** Colunas da "CRM - lixeira": as mesmas, sem o ID. */
export const COLUNAS_LIXEIRA: TituloCrm[] = COLUNAS_PLANILHA_CRM.filter((t) => t !== "ID (sistema)");

/** Valores de uma linha por título de coluna. */
export type LinhaCrm = Record<string, string>;

export interface OrigemLead {
  abaNome: string;
  faturamentoTexto: string | null;
}

export interface PendenciaCrm {
  etapa_id: string;
  falta: string;
}

export const MOTIVO_MIGRACAO = "Outro: registrado no CRM antigo da planilha";

const dois = (n: number) => String(n).padStart(2, "0");

/** "01/10/2026 14:30" (fuso de São Paulo); vazio sem data. */
export function dataHoraPlanilha(iso: string | null | undefined): string {
  if (!iso) return "";
  const p = partesSP(new Date(iso));
  return `${dois(p.dia)}/${dois(p.mes)}/${p.ano} ${dois(p.hora)}:${dois(p.minuto)}`;
}

const reais = (v: number | null | undefined) => (v == null ? "" : formatarReais(v));

export function rotuloRemarcacao(id: string | null | undefined): string {
  return MOTIVOS_REMARCACAO.find((m) => m.id === id)?.rotulo ?? (id ?? "");
}

export function motivoRemarcacaoDoTexto(t: string | null | undefined): MotivoRemarcacao | null {
  const s = normalizar(t);
  if (!s) return null;
  if (s.startsWith("nao compareceu") || s.includes("no-show") || s.includes("no show")) return "no_show";
  if (s.startsWith("nao confirmou")) return "nao_confirmou";
  if (s.startsWith("pediu")) return "pediu_remarcar";
  return null;
}

/** Motivos oferecidos na coluna Motivo para a etapa (lista vazia = etapa sem motivo). */
export function motivosDaEtapa(coluna: Pick<ColunaCrm, "tipo" | "config"> | null | undefined): string[] {
  if (!coluna) return [];
  if (coluna.tipo === "remarcacao") return MOTIVOS_REMARCACAO.map((m) => m.rotulo);
  return motivosDa(coluna);
}

function motivoDoLead(lead: LeadCrm, tipo: TipoColuna | null): string {
  if (tipo === "perdido") return lead.motivo_perda ?? "";
  if (tipo === "desqualificado") return lead.motivo_desqualificacao ?? "";
  if (tipo === "remarcacao") return rotuloRemarcacao(lead.motivo_remarcacao);
  return "";
}

function situacao(lead: LeadCrm, colunas: ColunaCrm[], pendencia: PendenciaCrm | null): string {
  if (pendencia) {
    const atual = colunas.find((c) => c.id === lead.coluna_id)?.titulo ?? "nenhuma etapa";
    return `Falta preencher: ${pendencia.falta}; no sistema o lead continua em ${atual}`;
  }
  if (lead.evento_status === "erro") return `Evento não criado: ${lead.evento_erro ?? "erro desconhecido"}`;
  if (lead.evento_status === "ok" && lead.evento_google_id && lead.reuniao_em) return "Evento criado";
  return "";
}

/** Texto de cada célula da linha do lead na aba CRM. */
export function linhaCrm(lead: LeadCrm, colunas: ColunaCrm[], origem: OrigemLead | null, pendencia: PendenciaCrm | null): LinhaCrm {
  const coluna = colunas.find((c) => c.id === lead.coluna_id) ?? null;
  const desejada = pendencia ? colunas.find((c) => c.id === pendencia.etapa_id) ?? null : null;
  const reuniao = lead.reuniao_em;
  return {
    "Lead": lead.nome ?? "",
    "Empresa": lead.empresa ?? "",
    "Telefone": lead.telefone ?? "",
    "E-mail": lead.email ?? "",
    "Instagram": lead.instagram ?? "",
    "Aba de origem": origem?.abaNome ?? "Sistema",
    "Etapa": (desejada ?? coluna)?.titulo ?? "",
    "Na etapa desde": dataHoraPlanilha(lead.coluna_desde),
    "Tentativas": String(lead.follow_up ?? 0),
    "Tentativas da proposta": String(lead.follow_up_proposta ?? 0),
    "Próximo contato": dataHoraPlanilha(lead.proximo_contato_em),
    "Reunião (data)": reuniao ? formatarData(reuniao) : "",
    "Reunião (hora)": reuniao ? formatarHora(reuniao) : "",
    "Duração (min)": reuniao ? String(lead.reuniao_duracao_min ?? 30) : "",
    "Link do Meet": lead.evento_meet_link ?? "",
    "Situação": situacao(lead, colunas, pendencia),
    "Valor da proposta": reais(lead.valor_proposta),
    "Valor fechado": reais(lead.valor_fechamento),
    "Motivo": motivoDoLead(lead, coluna?.tipo ?? null),
    "Orgânico/Pago": lead.trafego === "pago" ? "Pago" : "Orgânico",
    "Nicho": lead.nicho ?? "",
    "Cidade": lead.cidade ?? "",
    "Faturamento": origem?.faturamentoTexto || (lead.faturamento_faixa ? rotuloFaixa(FAIXAS_FATURAMENTO, lead.faturamento_faixa) : ""),
    "Observações": lead.observacoes ?? "",
    "Entrou no CRM": lead.created_at ? formatarData(lead.created_at) : "",
    [TITULO_ID]: lead.id,
  };
}

export interface CorLinha {
  fundo: string;
  texto: string;
}

const VERDE: CorLinha = { fundo: "#d9ead3", texto: "#274e13" };
const VERMELHO: CorLinha = { fundo: "#f4cccc", texto: "#990000" };
const AMARELO: CorLinha = { fundo: "#fff2cc", texto: "#7f6000" };
const AMBAR: CorLinha = { fundo: "#fce5cd", texto: "#783f04" };

/** Cor da linha na aba CRM (as mesmas da planilha antiga, mais âmbar para "falta preencher"). */
export function corDaLinhaCrm(tipo: TipoColuna | null, pendente: boolean): CorLinha | null {
  if (pendente) return AMBAR;
  if (tipo === "ganho") return VERDE;
  if (tipo === "perdido" || tipo === "desqualificado") return VERMELHO;
  if (tipo === "reuniao" || tipo === "confirmacao" || tipo === "remarcacao") return AMARELO;
  return null;
}

export function lerData(t: string | null | undefined): { ano: number; mes: number; dia: number } | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(String(t ?? "").trim());
  if (!m) return null;
  const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const mes = Number(m[2]);
  const dia = Number(m[1]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return { ano, mes, dia };
}

export function lerHora(t: string | null | undefined): { hora: number; minuto: number } | null {
  const m = /^(\d{1,2})(?::(\d{2})(?::\d{2})?|h(\d{2})?)?$/.exec(String(t ?? "").trim().toLowerCase());
  if (!m) return null;
  const hora = Number(m[1]);
  const minuto = Number(m[2] ?? m[3] ?? 0);
  if (hora > 23 || minuto > 59) return null;
  return { hora, minuto };
}

export function isoDeDataHora(data: string, hora: string): string | null {
  const d = lerData(data);
  const h = lerHora(hora);
  if (!d || !h) return null;
  return deSP(d.ano, d.mes, d.dia, h.hora, h.minuto).toISOString();
}

/** "dd/mm/aaaa hh:mm" (ou só a data, às 10:00). */
export function lerDataHora(t: string | null | undefined): string | null {
  const m = /^(\S+)(?:\s+(\S+))?$/.exec(String(t ?? "").trim());
  if (!m) return null;
  return isoDeDataHora(m[1], m[2] ?? "10:00");
}

/** "R$ 1.500,00", "1500", "1.500" → número; vazio → null; ilegível → undefined. */
export function lerReais(t: string | null | undefined): number | null | undefined {
  let s = String(t ?? "").replace(/R\$/i, "").replace(/\s/g, "");
  if (!s) return null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d+(,\d{1,2})?$/.test(s)) s = s.replace(",", ".");
  else if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return undefined;
  const v = Number(s);
  return Number.isFinite(v) ? v : undefined;
}

/** "3" → 3; vazio → null; ilegível → undefined. */
export function lerInteiro(t: string | null | undefined): number | null | undefined {
  const s = String(t ?? "").trim();
  if (!s) return null;
  return /^\d+$/.test(s) ? Number(s) : undefined;
}

export interface Interpretacao {
  patch: Partial<LeadCrm>;
  eventos: NovoEvento[];
  agenda: AcaoAgenda;
  /** E-mail antes da edição (para trocar o convidado no evento) */
  emailAntigo: string | null;
  /** Pendência nova, "apagar" a que havia, ou null (nada muda) */
  pendencia: PendenciaCrm | "apagar" | null;
  /** Colunas que voltam ao valor do sistema */
  reverter: string[];
  avisos: string[];
  /** Texto novo de Faturamento (a edge function decide onde gravar) */
  faturamento?: string;
}

const CAMPOS_TEXTO: [TituloCrm, "empresa" | "telefone" | "instagram" | "nicho" | "cidade" | "observacoes"][] = [
  ["Empresa", "empresa"],
  ["Telefone", "telefone"],
  ["Instagram", "instagram"],
  ["Nicho", "nicho"],
  ["Cidade", "cidade"],
  ["Observações", "observacoes"],
];

function faltaDe(exig: Exigencia, dados: DadosJanela): string {
  switch (exig) {
    case "reuniao":
      return "data e hora da reunião";
    case "remarcacao":
      return dados.remarcacao ? "a nova data e hora da reunião" : "o motivo (Não compareceu, Não confirmou ou Pediu para remarcar)";
    case "ganho":
      return "o valor fechado";
    case "motivo":
      return "o motivo";
    case "proposta":
      return "um valor de proposta válido";
    default:
      return "os dados da etapa";
  }
}

const mesmoInstante = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && new Date(a).getTime() === new Date(b).getTime();

/**
 * O que fazer com a linha editada na aba CRM (spec §5.4). `linha` traz todas as colunas como estão na planilha;
 * compara com a linha que o sistema escreveria e aplica as regras do CRM na ordem: campos simples, etapa,
 * reunião, tentativas, motivo e convite.
 */
export function interpretarLinhaCrm(
  lead: LeadCrm,
  colunas: ColunaCrm[],
  linha: LinhaCrm,
  origem: OrigemLead | null,
  pendencia: PendenciaCrm | null,
  agora: Date,
): Interpretacao {
  const ord = ordenarColunas(colunas);
  const atual = linhaCrm(lead, ord, origem, pendencia);
  const txt = (t: string) => String(linha[t] ?? "").trim();
  const mudou = (t: string) => t in linha && txt(t) !== String(atual[t] ?? "").trim();
  const r: Interpretacao = {
    patch: {}, eventos: [], agenda: null, emailAntigo: lead.email ?? null, pendencia: null, reverter: [], avisos: [],
  };
  let trabalho: LeadCrm = { ...lead };
  const aplicar = (patch: Partial<LeadCrm>, eventos: NovoEvento[], agenda?: AcaoAgenda) => {
    Object.assign(r.patch, patch);
    trabalho = { ...trabalho, ...patch };
    r.eventos.push(...eventos);
    if (agenda) r.agenda = agenda;
  };
  const voltar = (t: string, aviso?: string) => {
    if (!r.reverter.includes(t)) r.reverter.push(t);
    if (aviso && !r.avisos.includes(aviso)) r.avisos.push(aviso);
  };

  for (const t of SO_LEITURA) if (mudou(t)) voltar(t);

  // 1. Campos simples
  const simples: Partial<LeadCrm> = {};
  const editados: string[] = [];
  if (mudou("Lead")) {
    if (txt("Lead")) {
      simples.nome = txt("Lead");
      editados.push("Nome");
    } else voltar("Lead", "O nome do lead não pode ficar vazio.");
  }
  for (const [t, campo] of CAMPOS_TEXTO) {
    if (!mudou(t)) continue;
    simples[campo] = txt(t) || null;
    editados.push(t);
  }
  let emailMudou = false;
  if (mudou("E-mail")) {
    const e = txt("E-mail");
    if (e && !emailValido(e)) voltar("E-mail", "E-mail inválido.");
    else {
      simples.email = e || null;
      editados.push("E-mail");
      emailMudou = true;
    }
  }
  if (mudou("Orgânico/Pago")) {
    const v = normalizar(txt("Orgânico/Pago"));
    if (v === "pago" || v === "organico" || v === "") {
      simples.trafego = v === "pago" ? "pago" : "organico";
      editados.push("Orgânico/Pago");
    } else voltar("Orgânico/Pago", "Use Orgânico ou Pago.");
  }
  if (mudou("Próximo contato")) {
    const t = txt("Próximo contato");
    const iso = t ? lerDataHora(t) : null;
    if (t && !iso) voltar("Próximo contato", "Próximo contato: use dd/mm/aaaa hh:mm.");
    else {
      simples.proximo_contato_em = iso;
      editados.push("Próximo contato");
    }
  }
  for (const [t, campo] of [["Valor da proposta", "valor_proposta"], ["Valor fechado", "valor_fechamento"]] as const) {
    if (!mudou(t)) continue;
    const v = lerReais(txt(t));
    if (v === undefined) voltar(t, `${t}: use um valor como 1.500,00.`);
    else {
      simples[campo] = v;
      editados.push(t);
    }
  }
  if (mudou("Faturamento")) r.faturamento = txt("Faturamento");
  if (editados.length) {
    aplicar(simples, [{ tipo: "edicao", descricao: `Editado: ${editados.join(", ")}`, dados: { campos: editados } }]);
  }

  // 2. Reunião escrita na linha
  const dataTxt = txt("Reunião (data)");
  const horaTxt = txt("Reunião (hora)");
  const durTxt = txt("Duração (min)");
  const reuniaoMudou = mudou("Reunião (data)") || mudou("Reunião (hora)") || mudou("Duração (min)");
  let duracao = lead.reuniao_duracao_min ?? 30;
  if (durTxt) {
    const d = lerInteiro(durTxt);
    if (d == null || d < 5 || d > 480) {
      if (mudou("Duração (min)")) voltar("Duração (min)", "Duração: minutos entre 5 e 480.");
    } else duracao = d;
  }
  const emLinha = dataTxt && horaTxt ? isoDeDataHora(dataTxt, horaTxt) : null;
  if (dataTxt && horaTxt && !emLinha && reuniaoMudou) {
    voltar("Reunião (data)");
    voltar("Reunião (hora)", "Reunião: data dd/mm/aaaa e hora hh:mm.");
  }
  const reuniaoDaLinha: DadosReuniao | null = emLinha ? { em: emLinha, duracaoMin: duracao } : null;

  // 3. Etapa
  const origemCol = ord.find((c) => c.id === lead.coluna_id) ?? null;
  const tituloEtapa = txt("Etapa");
  const destino = ord.find((c) => normalizar(c.titulo) === normalizar(tituloEtapa)) ?? null;
  let movimentou = false;
  if (!destino) {
    if (mudou("Etapa")) {
      voltar("Etapa", tituloEtapa ? `A etapa "${tituloEtapa}" não existe: escolha uma da lista.` : "A etapa não pode ficar vazia.");
    }
    if (pendencia && mudou("Etapa")) r.pendencia = "apagar";
  } else if (destino.id !== lead.coluna_id) {
    const exig = exigenciaDe(destino.tipo, trabalho);
    const dados: DadosJanela = {};
    if (exig === "reuniao" && reuniaoDaLinha) dados.reuniao = reuniaoDaLinha;
    if (exig === "remarcacao") {
      const motivo = motivoRemarcacaoDoTexto(txt("Motivo"));
      if (motivo) {
        const nova = reuniaoDaLinha && !mesmoInstante(reuniaoDaLinha.em, trabalho.reuniao_em) ? reuniaoDaLinha : null;
        dados.remarcacao = { motivo, nova };
      }
    }
    if (exig === "proposta") {
      const v = lerReais(txt("Valor da proposta"));
      if (v !== undefined) dados.valorProposta = v;
    }
    if (exig === "ganho") {
      const v = lerReais(txt("Valor fechado"));
      if (v) dados.valorFechamento = v;
    }
    if (exig === "motivo" && txt("Motivo")) dados.motivo = txt("Motivo");
    const erro = validarMovimento(trabalho, destino, dados);
    if (erro) r.pendencia = { etapa_id: destino.id, falta: faltaDe(exig, dados) };
    else {
      const plano = planejarMovimento(trabalho, origemCol, destino, dados, agora);
      aplicar(plano.patch, plano.eventos, plano.agenda);
      movimentou = true;
      if (pendencia) r.pendencia = "apagar";
    }
  } else if (pendencia) r.pendencia = "apagar";
  const pendente = r.pendencia !== null && r.pendencia !== "apagar";

  // 4. Reunião mudada sem trocar de etapa (como o campo de reunião da ficha)
  if (!movimentou && !pendente && reuniaoMudou) {
    if (reuniaoDaLinha) {
      const diferente = !mesmoInstante(reuniaoDaLinha.em, trabalho.reuniao_em)
        || reuniaoDaLinha.duracaoMin !== (trabalho.reuniao_duracao_min ?? 30);
      if (diferente) {
        const p = planejarReuniao(trabalho, reuniaoDaLinha, agora);
        aplicar(p.patch, p.eventos, p.agenda);
      }
    } else if (!dataTxt && !horaTxt && trabalho.reuniao_em) {
      voltar("Reunião (data)");
      voltar("Reunião (hora)", "Para desmarcar a reunião, mude a Etapa (Remarcar reunião, Lead perdido…).");
    }
    // Só a data ou só a hora: espera a outra.
  }

  // 5. Tentativas (só aumentam, na etapa certa)
  const contadores = [
    ["Tentativas", "follow_up", "follow_up", "de follow-up"],
    ["Tentativas da proposta", "follow_up_proposta", "follow_up_proposta", "de follow-up de proposta"],
  ] as const;
  for (const [t, campo, tipo, nomeTipo] of contadores) {
    if (!mudou(t)) continue;
    const n = lerInteiro(txt(t));
    const coluna = ord.find((c) => c.id === trabalho.coluna_id) ?? null;
    const feitas = trabalho[campo] ?? 0;
    if (n == null) {
      voltar(t, `${t}: use um número.`);
      continue;
    }
    if (!coluna || coluna.tipo !== tipo) {
      voltar(t, `${t} só contam quando a etapa é ${nomeTipo}.`);
      continue;
    }
    if (n < feitas) {
      voltar(t, `${t} só aumentam pela planilha; para corrigir, use o sistema.`);
      continue;
    }
    for (let i = feitas; i < n; i++) {
      const res = registrarTentativa(trabalho, coluna, agora);
      if (typeof res === "string") {
        voltar(t, res);
        break;
      }
      aplicar(res.patch, res.eventos);
    }
  }

  // 6. Motivo sem trocar de etapa
  if (!movimentou && !pendente && mudou("Motivo") && destino && destino.id === lead.coluna_id) {
    const tipo = origemCol?.tipo;
    const m = txt("Motivo");
    const evento = (descricao: string): NovoEvento[] => [{ tipo: "edicao", descricao, dados: { campos: ["Motivo"] } }];
    const remarcacao = motivoRemarcacaoDoTexto(m);
    if ((tipo === "perdido" || tipo === "desqualificado") && !m) voltar("Motivo", "O motivo não pode ficar vazio.");
    else if (tipo === "perdido") aplicar({ motivo_perda: m }, evento(`Motivo da perda: ${m}`));
    else if (tipo === "desqualificado") aplicar({ motivo_desqualificacao: m }, evento(`Motivo da desqualificação: ${m}`));
    else if (tipo === "remarcacao" && remarcacao) aplicar({ motivo_remarcacao: remarcacao }, evento(`Motivo da remarcação: ${rotuloRemarcacao(remarcacao)}`));
    else voltar("Motivo", "O Motivo só vale nas etapas Lead perdido, Lead desqualificado e Remarcar reunião: escolha a Etapa primeiro.");
  }

  // 7. E-mail novo com reunião futura: convite para o e-mail novo
  if (
    emailMudou && !r.agenda && trabalho.evento_google_id && trabalho.reuniao_em
    && new Date(trabalho.reuniao_em).getTime() > agora.getTime()
  ) r.agenda = "convidar";

  return r;
}

export interface EventoMigrado extends NovoEvento {
  /** Quando aconteceu (vai para `created_at` do histórico) */
  em: string;
}

export interface Migracao {
  campos: Partial<LeadCrm>;
  eventos: EventoMigrado[];
}

/** Lead da aba CRM antiga (colunas Sim/Não) → lead do CRM do sistema (spec §9). */
export function migrarLinhaAntiga(l: Record<string, string>, colunas: ColunaCrm[], agora: Date): Migracao | null {
  const v = (t: string) => String(l[t] ?? "").trim();
  const nome = v("Lead") || v("Empresa");
  if (!nome) return null;
  const sim = (t: string) => normalizar(v(t)) === "sim";
  const ord = ordenarColunas(colunas);
  const col = (id: string) => ord.find((c) => c.id === id) ?? null;
  const agoraIso = agora.toISOString();
  const as10h = (t: string) => {
    const d = lerData(t);
    return d ? deSP(d.ano, d.mes, d.dia, 10, 0).toISOString() : null;
  };
  const entrada = as10h(v("Data 1ª mensagem")) ?? agoraIso;
  let fups = 0;
  for (let n = 1; n <= 7; n++) if (sim(`Follow Up ${n}`)) fups = n;

  const extra: Partial<LeadCrm> = {};
  let coluna: ColunaCrm | null;
  if (sim("Lead Fechado")) {
    coluna = col("fechamento");
    extra.fechado_em = agoraIso;
    extra.follow_ups_ate_fechamento = 0;
  } else if (sim("Lead Perdido")) {
    coluna = col("perdido");
    extra.motivo_perda = MOTIVO_MIGRACAO;
    extra.perdido_em = agoraIso;
  } else if (sim("Reunião Agendada")) {
    coluna = col("reuniao_marcada");
    const d = lerData(v("Data da reunião"));
    const h = lerHora(v("Hora da reunião")) ?? { hora: 10, minuto: 0 };
    if (d) {
      const em = deSP(d.ano, d.mes, d.dia, h.hora, h.minuto).toISOString();
      Object.assign(extra, {
        reuniao_em: em,
        reuniao_duracao_min: 30,
        reuniao_marcada_em: agoraIso,
        primeira_reuniao_marcada_em: agoraIso,
        follow_ups_ate_reuniao: fups,
        pontos_contato: reiniciarPontos(em, agora),
      });
    }
  } else if (sim("Desenvolvendo conversa")) coluna = col("desenvolvendo");
  else if (sim("Lead respondeu")) coluna = col("respondeu");
  else if (fups > 0) coluna = col("follow_up");
  else coluna = col("primeiro_contato");
  coluna ??= ord[0] ?? null;
  if (!coluna) return null;

  const eventos: EventoMigrado[] = [{
    tipo: "criacao",
    descricao: `Importado do CRM antigo da planilha (${coluna.titulo})`,
    dados: { origem: "crm_antigo" },
    em: entrada,
  }];
  for (let n = 1; n <= 7; n++) {
    if (!sim(`Follow Up ${n}`)) continue;
    eventos.push({
      tipo: "tentativa",
      descricao: `${n}ª tentativa de follow-up`,
      dados: { n, escopo: "prospeccao" },
      em: as10h(v(`Data FUP ${n}`)) ?? entrada,
    });
  }

  return {
    campos: {
      nome,
      empresa: v("Empresa") || null,
      telefone: v("Telefone") || null,
      instagram: v("Instagram") || null,
      nicho: v("Nicho") || null,
      observacoes: v("Observações") || null,
      faturamento_faixa: faixaDoFaturamento(v("Faturamento mensal")),
      trafego: "organico",
      coluna_id: coluna.id,
      coluna_desde: entrada,
      primeiro_contato_em: entrada,
      created_at: entrada,
      follow_up: fups,
      ...extra,
    },
    eventos,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test src/lib/planilhaCrm.test.ts`
Expected: todos os testes PASS. Se um teste de interpretação falhar, conferir primeiro a regra correspondente em
`crmMovimento.ts` (a interpretação só chama as funções do CRM) antes de mudar o teste.

- [ ] **Step 5: Commit**

```bash
git add src/lib/planilhaCrm.ts src/lib/planilhaCrm.test.ts
git commit -m "Banco de leads: aba CRM da planilha (linha, leitura, interpretação da edição e migração do CRM antigo)"
```

---

### Task 3: cópias das libs para a edge function

**Files:**
- Create: `scripts/copiar-libs-edge.mjs`, `src/lib/libsEdge.test.ts`
- Create (gerados): `supabase/functions/_shared/{bancoLeads,crmAgenda,crmColunas,crmFormato,crmMovimento,crmPontos,crmTentativas,crmTipos,planilhaCrm}.ts`

**Interfaces:**
- Produces: as libs puras importáveis pela função como `../_shared/<nome>.ts`.

- [ ] **Step 1: Teste que exige as cópias idênticas**

<!-- arquivo: src/lib/libsEdge.test.ts -->
```ts
process.env.TZ = "Asia/Tokyo";
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

// Mesma lista de scripts/copiar-libs-edge.mjs
const LIBS = [
  "bancoLeads", "crmAgenda", "crmColunas", "crmFormato", "crmMovimento", "crmPontos", "crmTentativas", "crmTipos",
  "planilhaCrm",
];
const ler = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

test("libs da edge function `planilha` são cópias idênticas de src/lib (rode node scripts/copiar-libs-edge.mjs)", () => {
  const copias = readdirSync("supabase/functions/_shared").filter((f) => f.endsWith(".ts")).map((f) => f.slice(0, -3)).sort();
  assert.deepEqual(copias, LIBS);
  for (const n of LIBS) assert.equal(ler(`supabase/functions/_shared/${n}.ts`), ler(`src/lib/${n}.ts`), `${n}.ts diferente`);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test src/lib/libsEdge.test.ts`
Expected: FAIL (`supabase/functions/_shared` não existe).

- [ ] **Step 3: Script de cópia**

<!-- arquivo: scripts/copiar-libs-edge.mjs -->
```js
// Copia as libs puras usadas pela edge function `planilha` para supabase/functions/_shared (o deploy das funções só
// enxerga supabase/functions). Rode depois de mudar qualquer uma delas: node scripts/copiar-libs-edge.mjs
// O teste src/lib/libsEdge.test.ts falha se as cópias ficarem diferentes.
import { copyFileSync, mkdirSync } from "node:fs";

const LIBS = [
  "bancoLeads", "crmAgenda", "crmColunas", "crmFormato", "crmMovimento", "crmPontos", "crmTentativas", "crmTipos",
  "planilhaCrm",
];
mkdirSync("supabase/functions/_shared", { recursive: true });
for (const n of LIBS) copyFileSync(`src/lib/${n}.ts`, `supabase/functions/_shared/${n}.ts`);
console.log(`${LIBS.length} libs copiadas para supabase/functions/_shared`);
```

- [ ] **Step 4: Copiar e ver o teste passar**

Run: `node scripts/copiar-libs-edge.mjs && node --test src/lib/libsEdge.test.ts`
Expected: "9 libs copiadas…" e PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/copiar-libs-edge.mjs src/lib/libsEdge.test.ts supabase/functions/_shared
git commit -m "Banco de leads: libs puras do CRM copiadas para a edge function, com teste de igualdade"
```

---

### Task 4: migration do banco

**Files:**
- Create: `supabase/migrations/20261001200000_banco_de_leads.sql`

**Interfaces:**
- Produces: tabelas `planilha_config`, `banco_leads_abas`, `banco_leads`, `planilha_fila`, `planilha_pendencias`;
  funções `planilha_canonico(jsonb)`, `planilha_origem()`, `planilha_avisar()`, `planilha_chave_papel(text, text)`,
  `planilha_resumo()` → `{ abas: [{id, n, agg}], crm, crm_n }`, `planilha_status()` → `{ planilha_id,
  ultima_conferencia_em, ok, erro, conectada }`, `banco_leads_definir(p_id, p_chave, p_valor)`,
  `banco_leads_ligar(p_id, p_crm, p_chave, p_valor)`; gatilhos de hash, fila, campos em comum, saída do CRM e
  pendência; Realtime em `banco_leads`, `banco_leads_abas`, `prospeccao`, `crm_eventos`.

- [ ] **Step 1: Escrever a migration**

<!-- arquivo: supabase/migrations/20261001200000_banco_de_leads.sql -->
```sql
-- Banco de leads: a "Planilha CRM Mestra" sincronizada com o sistema
-- (spec docs/superpowers/specs/2026-10-01-banco-de-leads-design.md). Idempotente: pode rodar mais de uma vez.

-- 1. Configuração da ponte. Só a edge function lê (service role): RLS sem política.
CREATE TABLE IF NOT EXISTS public.planilha_config (
  id text PRIMARY KEY DEFAULT 'principal' CHECK (id = 'principal'),
  planilha_id text NOT NULL,
  chave text,
  webapp_url text,
  ultimo_aviso_em timestamptz,
  ultima_conferencia_em timestamptz,
  ultima_conferencia_ok boolean,
  ultima_conferencia_erro text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.planilha_config ENABLE ROW LEVEL SECURITY;

-- 2. Abas e leads da planilha (o front lê e grava: política aberta, como as outras tabelas do app)
CREATE TABLE IF NOT EXISTS public.banco_leads_abas (
  id text PRIMARY KEY,
  nome text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  colunas jsonb NOT NULL DEFAULT '[]'::jsonb,
  ativa boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.banco_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aba_id text NOT NULL REFERENCES public.banco_leads_abas(id) ON DELETE CASCADE,
  posicao integer NOT NULL DEFAULT 0,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  hash text,
  lead_crm_id uuid REFERENCES public.prospeccao(id) ON DELETE SET NULL,
  na_planilha boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS banco_leads_aba_posicao_idx ON public.banco_leads (aba_id, posicao);
CREATE INDEX IF NOT EXISTS banco_leads_lead_crm_idx ON public.banco_leads (lead_crm_id);
ALTER TABLE public.banco_leads_abas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banco_leads ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'banco_leads_abas' AND policyname = 'banco_leads_abas_aberto') THEN
    CREATE POLICY banco_leads_abas_aberto ON public.banco_leads_abas FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'banco_leads' AND policyname = 'banco_leads_aberto') THEN
    CREATE POLICY banco_leads_aberto ON public.banco_leads FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 3. Fila para a planilha e etapas esperando dado (internas: RLS sem política)
CREATE TABLE IF NOT EXISTS public.planilha_fila (
  id bigserial PRIMARY KEY,
  entidade text NOT NULL CHECK (entidade IN ('lead', 'crm')),
  registro_id text NOT NULL,
  op text NOT NULL CHECK (op IN ('upsert', 'delete')),
  campos text[],
  dados jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.planilha_pendencias (
  lead_id uuid PRIMARY KEY REFERENCES public.prospeccao(id) ON DELETE CASCADE,
  etapa_desejada text NOT NULL,
  falta text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.planilha_fila ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planilha_pendencias ENABLE ROW LEVEL SECURITY;

-- 4. Hash canônico da linha (o Apps Script calcula igual: chaves em ordem de código, valores não vazios)
CREATE OR REPLACE FUNCTION public.planilha_canonico(d jsonb) RETURNS text LANGUAGE sql IMMUTABLE AS $f$
  SELECT coalesce(string_agg(e.key || chr(31) || e.value, chr(30) ORDER BY e.key COLLATE "C"), '')
  FROM jsonb_each_text(coalesce(d, '{}'::jsonb)) AS e
  WHERE e.value IS NOT NULL AND e.value <> ''
$f$;

CREATE OR REPLACE FUNCTION public.banco_leads_antes() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  NEW.hash := md5(public.planilha_canonico(NEW.dados));
  IF TG_OP = 'UPDATE' THEN NEW.updated_at := now(); END IF;
  RETURN NEW;
END
$f$;
DROP TRIGGER IF EXISTS banco_leads_antes ON public.banco_leads;
CREATE TRIGGER banco_leads_antes BEFORE INSERT OR UPDATE ON public.banco_leads
  FOR EACH ROW EXECUTE FUNCTION public.banco_leads_antes();

-- 5. Origem da gravação: a edge function `planilha` manda o cabeçalho x-origem: planilha
CREATE OR REPLACE FUNCTION public.planilha_origem() RETURNS text LANGUAGE plpgsql STABLE AS $f$
BEGIN
  RETURN coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-origem', '');
EXCEPTION WHEN OTHERS THEN
  RETURN '';
END
$f$;

CREATE OR REPLACE FUNCTION public.planilha_chave_papel(p_aba text, p_papel text) RETURNS text LANGUAGE sql STABLE AS $f$
  SELECT c ->> 'chave'
  FROM public.banco_leads_abas a, jsonb_array_elements(a.colunas) AS c
  WHERE a.id = p_aba AND c ->> 'papel' = p_papel
  LIMIT 1
$f$;

-- 6. Aviso ao Web App do Apps Script: no máximo um a cada 2 s (a planilha esvazia a fila inteira)
CREATE OR REPLACE FUNCTION public.planilha_avisar() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_url text;
  v_ultimo timestamptz;
BEGIN
  IF coalesce(current_setting('app.planilha_avisada', true), '') = '1' THEN RETURN; END IF;
  PERFORM set_config('app.planilha_avisada', '1', true);
  SELECT webapp_url, ultimo_aviso_em INTO v_url, v_ultimo FROM public.planilha_config WHERE id = 'principal';
  IF coalesce(v_url, '') = '' THEN RETURN; END IF;
  IF v_ultimo IS NOT NULL AND v_ultimo > clock_timestamp() - interval '2 seconds' THEN RETURN; END IF;
  UPDATE public.planilha_config SET ultimo_aviso_em = clock_timestamp() WHERE id = 'principal';
  PERFORM net.http_post(
    url := v_url,
    body := jsonb_build_object('aviso', 'fila'),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 10000
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'planilha_avisar: %', SQLERRM;
END
$f$;

-- 7. Fila: o que muda pelo sistema vai para a planilha
CREATE OR REPLACE FUNCTION public.planilha_registrar() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_campos text[];
  v_inseriu boolean := false;
  campos_crm text[] := ARRAY[
    'nome', 'empresa', 'telefone', 'email', 'instagram', 'coluna_id', 'coluna_desde', 'follow_up', 'follow_up_proposta',
    'proximo_contato_em', 'reuniao_em', 'reuniao_duracao_min', 'evento_google_id', 'evento_meet_link', 'evento_status',
    'evento_erro', 'valor_proposta', 'valor_fechamento', 'motivo_perda', 'motivo_desqualificacao', 'motivo_remarcacao',
    'trafego', 'nicho', 'cidade', 'faturamento_faixa', 'observacoes', 'created_at'];
BEGIN
  IF public.planilha_origem() = 'planilha' THEN RETURN NULL; END IF;

  IF TG_TABLE_NAME = 'banco_leads' THEN
    IF TG_OP = 'DELETE' THEN
      INSERT INTO public.planilha_fila (entidade, registro_id, op, dados)
      VALUES ('lead', OLD.id::text, 'delete', jsonb_build_object('aba_id', OLD.aba_id));
      IF OLD.lead_crm_id IS NOT NULL THEN
        INSERT INTO public.planilha_fila (entidade, registro_id, op) VALUES ('crm', OLD.lead_crm_id::text, 'upsert');
      END IF;
      v_inseriu := true;
    ELSIF TG_OP = 'INSERT' THEN
      INSERT INTO public.planilha_fila (entidade, registro_id, op) VALUES ('lead', NEW.id::text, 'upsert');
      v_inseriu := true;
    ELSE
      SELECT array_agg(s.k) INTO v_campos FROM (
        SELECT n.key AS k FROM jsonb_each(NEW.dados) AS n WHERE (OLD.dados -> n.key) IS DISTINCT FROM n.value
        UNION
        SELECT o.key FROM jsonb_each(OLD.dados) AS o WHERE NOT (NEW.dados ? o.key)
      ) AS s;
      IF NEW.aba_id IS DISTINCT FROM OLD.aba_id THEN
        INSERT INTO public.planilha_fila (entidade, registro_id, op) VALUES ('lead', NEW.id::text, 'upsert');
        v_inseriu := true;
      ELSIF v_campos IS NOT NULL THEN
        INSERT INTO public.planilha_fila (entidade, registro_id, op, campos) VALUES ('lead', NEW.id::text, 'upsert', v_campos);
        v_inseriu := true;
      END IF;
      IF NEW.lead_crm_id IS DISTINCT FROM OLD.lead_crm_id THEN
        IF NEW.lead_crm_id IS NOT NULL THEN
          INSERT INTO public.planilha_fila (entidade, registro_id, op) VALUES ('crm', NEW.lead_crm_id::text, 'upsert');
        END IF;
        IF OLD.lead_crm_id IS NOT NULL THEN
          INSERT INTO public.planilha_fila (entidade, registro_id, op) VALUES ('crm', OLD.lead_crm_id::text, 'upsert');
        END IF;
        v_inseriu := true;
      END IF;
    END IF;
  ELSE
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.planilha_fila (entidade, registro_id, op) VALUES ('crm', NEW.id::text, 'upsert');
      v_inseriu := true;
    ELSE
      SELECT array_agg(c) INTO v_campos FROM unnest(campos_crm) AS c
      WHERE (to_jsonb(NEW) -> c) IS DISTINCT FROM (to_jsonb(OLD) -> c);
      IF v_campos IS NOT NULL THEN
        INSERT INTO public.planilha_fila (entidade, registro_id, op, campos) VALUES ('crm', NEW.id::text, 'upsert', v_campos);
        v_inseriu := true;
      END IF;
    END IF;
  END IF;
  IF v_inseriu THEN PERFORM public.planilha_avisar(); END IF;
  RETURN NULL;
END
$f$;

-- 8. Saída do CRM: "Não" em "Primeira mensagem enviada" do lead ligado e a linha para a lixeira da planilha
CREATE OR REPLACE FUNCTION public.planilha_prospeccao_excluir() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  b record;
  v_chave text;
  v_aba text;
  v_fat text;
BEGIN
  FOR b IN SELECT id, aba_id, dados FROM public.banco_leads WHERE lead_crm_id = OLD.id LOOP
    SELECT nome INTO v_aba FROM public.banco_leads_abas WHERE id = b.aba_id;
    v_fat := b.dados ->> public.planilha_chave_papel(b.aba_id, 'faturamento');
    v_chave := public.planilha_chave_papel(b.aba_id, 'primeira_msg');
    IF v_chave IS NOT NULL THEN
      UPDATE public.banco_leads SET dados = jsonb_set(dados, ARRAY[v_chave], to_jsonb('Não'::text)) WHERE id = b.id;
    END IF;
  END LOOP;
  IF public.planilha_origem() <> 'planilha' THEN
    INSERT INTO public.planilha_fila (entidade, registro_id, op, dados)
    VALUES ('crm', OLD.id::text, 'delete', to_jsonb(OLD) || jsonb_build_object('_aba_origem', v_aba, '_faturamento_origem', v_fat));
    PERFORM public.planilha_avisar();
  END IF;
  RETURN OLD;
END
$f$;

-- 9. Um lead só: campos em comum iguais na aba de origem e no CRM
CREATE OR REPLACE FUNCTION public.planilha_crm_para_banco() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  b record;
  campo text;
  v_chave text;
  v_novo text;
  v_dados jsonb;
BEGIN
  IF coalesce(current_setting('app.propagando', true), '') = '1' THEN RETURN NULL; END IF;
  FOR b IN SELECT id, aba_id, dados FROM public.banco_leads WHERE lead_crm_id = NEW.id LOOP
    v_dados := b.dados;
    FOREACH campo IN ARRAY ARRAY['nome', 'empresa', 'telefone', 'instagram', 'cidade', 'nicho', 'site'] LOOP
      CONTINUE WHEN (to_jsonb(NEW) ->> campo) IS NOT DISTINCT FROM (to_jsonb(OLD) ->> campo);
      v_chave := public.planilha_chave_papel(b.aba_id, campo);
      CONTINUE WHEN v_chave IS NULL;
      v_novo := btrim(coalesce(to_jsonb(NEW) ->> campo, ''));
      IF v_novo = '' THEN
        v_dados := v_dados - v_chave;
      ELSE
        v_dados := jsonb_set(v_dados, ARRAY[v_chave], to_jsonb(v_novo));
      END IF;
    END LOOP;
    IF v_dados IS DISTINCT FROM b.dados THEN
      PERFORM set_config('app.propagando', '1', true);
      UPDATE public.banco_leads SET dados = v_dados WHERE id = b.id;
      PERFORM set_config('app.propagando', '', true);
    END IF;
  END LOOP;
  RETURN NULL;
END
$f$;

CREATE OR REPLACE FUNCTION public.planilha_banco_para_crm() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  campo text;
  v_chave text;
  v_novo text;
  v_patch jsonb := '{}'::jsonb;
BEGIN
  IF coalesce(current_setting('app.propagando', true), '') = '1' OR NEW.lead_crm_id IS NULL THEN RETURN NULL; END IF;
  FOREACH campo IN ARRAY ARRAY['nome', 'empresa', 'telefone', 'instagram', 'cidade', 'nicho', 'site'] LOOP
    v_chave := public.planilha_chave_papel(NEW.aba_id, campo);
    CONTINUE WHEN v_chave IS NULL;
    v_novo := btrim(coalesce(NEW.dados ->> v_chave, ''));
    CONTINUE WHEN v_novo = btrim(coalesce(OLD.dados ->> v_chave, ''));
    CONTINUE WHEN campo = 'nome' AND v_novo = '';
    v_patch := v_patch || jsonb_build_object(campo, nullif(v_novo, ''));
  END LOOP;
  IF v_patch = '{}'::jsonb THEN RETURN NULL; END IF;
  PERFORM set_config('app.propagando', '1', true);
  UPDATE public.prospeccao p SET
    nome = CASE WHEN v_patch ? 'nome' THEN v_patch ->> 'nome' ELSE p.nome END,
    empresa = CASE WHEN v_patch ? 'empresa' THEN v_patch ->> 'empresa' ELSE p.empresa END,
    telefone = CASE WHEN v_patch ? 'telefone' THEN v_patch ->> 'telefone' ELSE p.telefone END,
    instagram = CASE WHEN v_patch ? 'instagram' THEN v_patch ->> 'instagram' ELSE p.instagram END,
    cidade = CASE WHEN v_patch ? 'cidade' THEN v_patch ->> 'cidade' ELSE p.cidade END,
    nicho = CASE WHEN v_patch ? 'nicho' THEN v_patch ->> 'nicho' ELSE p.nicho END,
    site = CASE WHEN v_patch ? 'site' THEN v_patch ->> 'site' ELSE p.site END,
    updated_at = now()
  WHERE p.id = NEW.lead_crm_id;
  PERFORM set_config('app.propagando', '', true);
  RETURN NULL;
END
$f$;

-- 10. Mudou a etapa no sistema: a etapa que a planilha esperava completar deixa de valer
CREATE OR REPLACE FUNCTION public.planilha_pendencia_obsoleta() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  DELETE FROM public.planilha_pendencias WHERE lead_id = NEW.id;
  RETURN NULL;
END
$f$;

DROP TRIGGER IF EXISTS planilha_a_registrar ON public.banco_leads;
CREATE TRIGGER planilha_a_registrar AFTER INSERT OR UPDATE OR DELETE ON public.banco_leads
  FOR EACH ROW EXECUTE FUNCTION public.planilha_registrar();
DROP TRIGGER IF EXISTS planilha_b_para_crm ON public.banco_leads;
CREATE TRIGGER planilha_b_para_crm AFTER UPDATE ON public.banco_leads
  FOR EACH ROW EXECUTE FUNCTION public.planilha_banco_para_crm();
DROP TRIGGER IF EXISTS planilha_a_registrar ON public.prospeccao;
CREATE TRIGGER planilha_a_registrar AFTER INSERT OR UPDATE ON public.prospeccao
  FOR EACH ROW EXECUTE FUNCTION public.planilha_registrar();
DROP TRIGGER IF EXISTS planilha_b_para_banco ON public.prospeccao;
CREATE TRIGGER planilha_b_para_banco AFTER UPDATE ON public.prospeccao
  FOR EACH ROW EXECUTE FUNCTION public.planilha_crm_para_banco();
DROP TRIGGER IF EXISTS planilha_c_pendencia ON public.prospeccao;
CREATE TRIGGER planilha_c_pendencia AFTER UPDATE OF coluna_id ON public.prospeccao
  FOR EACH ROW WHEN (OLD.coluna_id IS DISTINCT FROM NEW.coluna_id) EXECUTE FUNCTION public.planilha_pendencia_obsoleta();
DROP TRIGGER IF EXISTS planilha_excluir ON public.prospeccao;
CREATE TRIGGER planilha_excluir BEFORE DELETE ON public.prospeccao
  FOR EACH ROW EXECUTE FUNCTION public.planilha_prospeccao_excluir();

-- 11. Resumo para a conferência de 5 min
CREATE OR REPLACE FUNCTION public.planilha_resumo() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT jsonb_build_object(
    'abas', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', a.id, 'n', coalesce(s.n, 0), 'agg', coalesce(s.agg, md5(''))) ORDER BY a.ordem)
      FROM public.banco_leads_abas a
      LEFT JOIN (
        SELECT aba_id, count(*)::int AS n,
               md5(string_agg(id::text || ':' || coalesce(hash, '') || ':' || posicao::text, ',' ORDER BY id::text COLLATE "C")) AS agg
        FROM public.banco_leads
        GROUP BY aba_id
      ) AS s ON s.aba_id = a.id
      WHERE a.ativa
    ), '[]'::jsonb),
    'crm', md5(
      coalesce((
        SELECT string_agg(
          p.id::text || ':' || coalesce(p.updated_at::text, '') || ':' || coalesce(pp.etapa_desejada, '') || ':' || coalesce(b.aba_id, ''),
          ',' ORDER BY p.id::text COLLATE "C")
        FROM public.prospeccao p
        LEFT JOIN public.planilha_pendencias pp ON pp.lead_id = p.id
        LEFT JOIN LATERAL (SELECT bl.aba_id FROM public.banco_leads bl WHERE bl.lead_crm_id = p.id LIMIT 1) AS b ON true
      ), '')
      || '|' ||
      coalesce((SELECT string_agg(c.id || ':' || c.titulo || ':' || c.ordem::text || ':' || c.tipo, ',' ORDER BY c.ordem, c.id) FROM public.crm_colunas c), '')
    ),
    'crm_n', (SELECT count(*)::int FROM public.prospeccao)
  )
$f$;

-- 12. Estado da sincronização para a tela (sem a chave)
CREATE OR REPLACE FUNCTION public.planilha_status() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT jsonb_build_object(
    'planilha_id', planilha_id,
    'ultima_conferencia_em', ultima_conferencia_em,
    'ok', ultima_conferencia_ok,
    'erro', ultima_conferencia_erro,
    'conectada', coalesce(chave, '') <> ''
  )
  FROM public.planilha_config
  WHERE id = 'principal'
$f$;

-- 13. Gravações do Banco de leads pelo front (um campo por vez, sem sobrescrever o resto da linha)
CREATE OR REPLACE FUNCTION public.banco_leads_definir(p_id uuid, p_chave text, p_valor text) RETURNS void LANGUAGE sql AS $f$
  UPDATE public.banco_leads
  SET dados = CASE
    WHEN btrim(coalesce(p_valor, '')) = '' THEN dados - p_chave
    ELSE jsonb_set(dados, ARRAY[p_chave], to_jsonb(btrim(p_valor)))
  END
  WHERE id = p_id
$f$;

CREATE OR REPLACE FUNCTION public.banco_leads_ligar(p_id uuid, p_crm uuid, p_chave text, p_valor text) RETURNS void LANGUAGE sql AS $f$
  UPDATE public.banco_leads
  SET lead_crm_id = p_crm,
      dados = CASE WHEN p_chave IS NULL THEN dados ELSE jsonb_set(dados, ARRAY[p_chave], to_jsonb(p_valor)) END
  WHERE id = p_id
$f$;

GRANT EXECUTE ON FUNCTION public.planilha_status() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.banco_leads_definir(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.banco_leads_ligar(uuid, uuid, text, text) TO anon, authenticated;

-- 14. Realtime: o Banco de leads e o CRM se atualizam sozinhos
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['banco_leads', 'banco_leads_abas', 'prospeccao', 'crm_eventos'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
```

- [ ] **Step 2: Testar em bloco que desfaz tudo (editor SQL do Lovable)**

Colar e rodar a migration inteira dentro de `BEGIN; … ROLLBACK;` com estas conferências antes do `ROLLBACK`
(o resultado do último `SELECT` aparece em "Results"):

```sql
-- (migration aqui)
INSERT INTO public.banco_leads_abas (id, nome, ordem, colunas) VALUES ('t1', 'Teste', 0,
  '[{"chave":"Nome","titulo":"Nome","indice":0,"oculta":false,"papel":"nome"},{"chave":"Primeira mensagem enviada","titulo":"Primeira mensagem enviada","indice":1,"oculta":false,"papel":"primeira_msg"}]');
INSERT INTO public.banco_leads (id, aba_id, posicao, dados) VALUES ('00000000-0000-0000-0000-000000000001', 't1', 2, '{"Nome":"Abreu","Telefone":"55","Vazio":"","Árvore":"x"}');
SELECT hash, md5(public.planilha_canonico(dados)) AS esperado, (SELECT count(*) FROM public.planilha_fila) AS fila
FROM public.banco_leads WHERE id = '00000000-0000-0000-0000-000000000001';
ROLLBACK;
```

Expected: `hash` = `esperado` = md5 de `"Nome␟Abreu␞Telefone␟55␞Árvore␟x"` (anotar o valor: o teste do Apps
Script na Task 6 compara com ele) e `fila = 1` (o INSERT pela chave do editor não tem `x-origem`).

- [ ] **Step 3: Aplicar a migration de verdade**

Rodar o arquivo no editor SQL do Lovable (método do cofre: `dispatch` no CodeMirror + clique real + Run + "Run
anyway"). Conferir pela API REST com a chave pública:
`GET /rest/v1/banco_leads?select=id&limit=1` → `[]`; `POST /rest/v1/rpc/planilha_status` → `null` (ainda sem
configuração); `GET /rest/v1/planilha_config` → `[]` (RLS sem política).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261001200000_banco_de_leads.sql
git commit -m "Banco de leads: migration (tabelas, fila para a planilha, gatilhos, resumo e Realtime)"
```

---

### Task 5: edge function `planilha`

**Files:**
- Create: `supabase/functions/planilha/{dados.ts, agenda.ts, operacoes.ts, acoes.ts, index.ts}`
- Modify: `supabase/config.toml` (acrescentar `[functions.planilha] verify_jwt = false`)
- Test: `src/lib/planilhaOperacoes.test.ts`

**Interfaces:**
- Consumes: Tasks 1 a 4.
- Produces: `POST https://bnpvzguapunsztsdvmrs.supabase.co/functions/v1/planilha` com corpo `{ acao, planilha_id, ... }`
  e cabeçalho `x-planilha-chave`. Respostas: `{ ok, operacoes: Operacao[], avisos: string[] }` (ações de escrita),
  `{ operacoes, fila_ids }` (`fila`), `{ resumo }` (`conferir`), `{ leads: [{id, hash, posicao, na_planilha}] }`
  (`aba_detalhe`), `{ operacoes, ids, fp }` (`linhas`), `{ ok, crm: { etapas: [{id, titulo, tipo, motivos}] } }`
  (`abas`), `{ ok, criados, ligados, pulados, avisos }` (`importar_crm_antigo`), `{ erro }` em falha.
- `Operacao` = `{ tipo: "linha", aba, id, valores, completa?, linha?, cor?, motivos? }` | `{ tipo: "remover", aba, id }`
  | `{ tipo: "lixeira", valores }` | `{ tipo: "aviso", texto }`; `aba` = gid da aba de leads ou `"CRM"`.

- [ ] **Step 1: Testes das operações (puras)**

<!-- arquivo: src/lib/planilhaOperacoes.test.ts -->
```ts
process.env.TZ = "Asia/Tokyo";
import test from "node:test";
import assert from "node:assert/strict";
import { agruparFila, opCrm, opCrmMudancas, opLead, opLixeira } from "../../supabase/functions/planilha/operacoes.ts";
import { linhaCrm } from "./planilhaCrm.ts";
import { COLUNAS_PADRAO } from "./crmColunas.ts";
import { leadBase } from "./crmTipos.ts";

const colunas = COLUNAS_PADRAO;

test("fila: junta campos do mesmo registro, null vale a linha toda, exclusão vence", () => {
  const g = agruparFila([
    { id: 1, entidade: "crm", registro_id: "a", op: "upsert", campos: ["email"], dados: null },
    { id: 2, entidade: "crm", registro_id: "a", op: "upsert", campos: ["nome"], dados: null },
    { id: 3, entidade: "lead", registro_id: "b", op: "upsert", campos: ["Nome"], dados: null },
    { id: 4, entidade: "lead", registro_id: "b", op: "upsert", campos: null, dados: null },
    { id: 5, entidade: "lead", registro_id: "c", op: "upsert", campos: ["Nome"], dados: null },
    { id: 6, entidade: "lead", registro_id: "c", op: "delete", campos: null, dados: { aba_id: "9" } },
  ]);
  assert.deepEqual(g, [
    { entidade: "crm", id: "a", op: "upsert", campos: ["email", "nome"], dados: null },
    { entidade: "lead", id: "b", op: "upsert", campos: null, dados: null },
    { entidade: "lead", id: "c", op: "delete", campos: null, dados: { aba_id: "9" } },
  ]);
});

test("operação do CRM: só as colunas dos campos que mudaram; cor e motivos quando muda a etapa", () => {
  const lead = leadBase({ id: "L1", nome: "Ana", email: "a@x.com", coluna_id: "perdido", motivo_perda: "Achou caro" });
  const parcial = opCrm(lead, colunas, null, null, ["email"]);
  assert.deepEqual(parcial, { tipo: "linha", aba: "CRM", id: "L1", valores: { "E-mail": "a@x.com" }, completa: false });
  const etapa = opCrm(lead, colunas, null, null, ["coluna_id"]);
  assert.equal(etapa.tipo === "linha" && etapa.valores["Etapa"], "Lead perdido");
  assert.equal(etapa.tipo === "linha" && etapa.cor?.fundo, "#f4cccc");
  assert.equal(etapa.tipo === "linha" && etapa.motivos?.includes("Achou caro"), true);
  const toda = opCrm(lead, colunas, null, null);
  assert.equal(toda.tipo === "linha" && toda.completa, true);
  assert.equal(toda.tipo === "linha" && toda.valores["ID (sistema)"], "L1");
});

test("operação depois de uma edição: escreve o que mudou, o que volta e as colunas do sistema", () => {
  const antes = leadBase({ id: "L1", nome: "Ana", coluna_id: "desenvolvendo" });
  const depois = { ...antes, email: "novo@x.com" };
  const op = opCrmMudancas(linhaCrm(antes, colunas, null, null), depois, colunas, null, null, ["Tentativas"]);
  assert.equal(op.tipo, "linha");
  if (op.tipo !== "linha") return;
  assert.equal(op.valores["E-mail"], "novo@x.com");
  assert.equal(op.valores["Tentativas"], "0");
  assert.equal(op.valores["Situação"], "");
  assert.equal("Lead" in op.valores, false);
});

test("lixeira sem a coluna de ID; lead com campos pedidos ou linha toda", () => {
  const lix = opLixeira(leadBase({ id: "L1", nome: "Ana" }), colunas, { abaNome: "Generalista", faturamentoTexto: null });
  assert.equal(lix.tipo === "lixeira" && lix.valores["Aba de origem"], "Generalista");
  assert.equal(lix.tipo === "lixeira" && "ID (sistema)" in lix.valores, false);
  const b = { id: "b1", aba_id: "9", posicao: 3, dados: { "Nome": "Ana" }, lead_crm_id: null };
  assert.deepEqual(opLead(b, ["Nome", "Telefone"]), { tipo: "linha", aba: "9", id: "b1", valores: { "Nome": "Ana", "Telefone": "" } });
  assert.deepEqual(opLead(b, null), { tipo: "linha", aba: "9", id: "b1", valores: { "Nome": "Ana" }, completa: true });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test src/lib/planilhaOperacoes.test.ts`
Expected: FAIL (módulo `operacoes.ts` não existe).

- [ ] **Step 3: Operações**

<!-- arquivo: supabase/functions/planilha/operacoes.ts -->
```ts
// Operações que a planilha aplica (spec 2026-10-01-banco-de-leads §6): linhas, remoções, lixeira e avisos.
// Puro: testado em src/lib/planilhaOperacoes.test.ts.
import type { ColunaCrm, LeadCrm } from "../_shared/crmTipos.ts";
import type { LeadBanco } from "../_shared/bancoLeads.ts";
import {
  COLUNAS_LIXEIRA,
  corDaLinhaCrm,
  linhaCrm,
  motivosDaEtapa,
  SO_LEITURA,
  type CorLinha,
  type LinhaCrm,
  type OrigemLead,
  type PendenciaCrm,
  type TituloCrm,
} from "../_shared/planilhaCrm.ts";

export const ABA_CRM = "CRM";

export interface OperacaoLinha {
  tipo: "linha";
  /** gid da aba de leads ou "CRM" */
  aba: string;
  id: string;
  /** Valores por chave (abas de leads) ou por título (aba CRM) */
  valores: Record<string, string>;
  /** true: colunas ausentes ficam vazias */
  completa?: boolean;
  /** Linha da planilha onde o registro foi digitado (lead novo criado na aba CRM) */
  linha?: number;
  cor?: CorLinha | null;
  motivos?: string[];
}

export type Operacao =
  | OperacaoLinha
  | { tipo: "remover"; aba: string; id: string }
  | { tipo: "lixeira"; valores: Record<string, string> }
  | { tipo: "aviso"; texto: string };

/** Colunas da aba CRM que dependem de cada campo de `prospeccao` (atualização parcial vinda da fila). */
export const CAMPO_PARA_TITULOS: Record<string, TituloCrm[]> = {
  nome: ["Lead"],
  empresa: ["Empresa"],
  telefone: ["Telefone"],
  email: ["E-mail"],
  instagram: ["Instagram"],
  coluna_id: ["Etapa", "Motivo", "Situação"],
  coluna_desde: ["Na etapa desde"],
  follow_up: ["Tentativas"],
  follow_up_proposta: ["Tentativas da proposta"],
  proximo_contato_em: ["Próximo contato"],
  reuniao_em: ["Reunião (data)", "Reunião (hora)", "Duração (min)", "Situação"],
  reuniao_duracao_min: ["Duração (min)"],
  evento_google_id: ["Situação"],
  evento_meet_link: ["Link do Meet"],
  evento_status: ["Situação"],
  evento_erro: ["Situação"],
  valor_proposta: ["Valor da proposta"],
  valor_fechamento: ["Valor fechado"],
  motivo_perda: ["Motivo"],
  motivo_desqualificacao: ["Motivo"],
  motivo_remarcacao: ["Motivo"],
  trafego: ["Orgânico/Pago"],
  nicho: ["Nicho"],
  cidade: ["Cidade"],
  faturamento_faixa: ["Faturamento"],
  observacoes: ["Observações"],
  created_at: ["Entrou no CRM"],
};

function etapaECor(lead: LeadCrm, colunas: ColunaCrm[], pendencia: PendenciaCrm | null) {
  const tipo = colunas.find((c) => c.id === lead.coluna_id)?.tipo ?? null;
  const etapa = colunas.find((c) => c.id === (pendencia?.etapa_id ?? lead.coluna_id)) ?? null;
  return { cor: corDaLinhaCrm(tipo, !!pendencia), motivos: motivosDaEtapa(etapa) };
}

/** Linha do lead na aba CRM: toda (`campos` ausente) ou só as colunas dos campos que mudaram. */
export function opCrm(
  lead: LeadCrm,
  colunas: ColunaCrm[],
  origem: OrigemLead | null,
  pendencia: PendenciaCrm | null,
  campos?: string[] | null,
): OperacaoLinha {
  const linha = linhaCrm(lead, colunas, origem, pendencia);
  const toda = !campos;
  const titulos = new Set<string>(toda ? Object.keys(linha) : campos!.flatMap((c) => CAMPO_PARA_TITULOS[c] ?? []));
  const op: OperacaoLinha = {
    tipo: "linha",
    aba: ABA_CRM,
    id: lead.id,
    valores: Object.fromEntries(Object.entries(linha).filter(([t]) => titulos.has(t))),
    completa: toda,
  };
  if (toda || campos!.includes("coluna_id")) Object.assign(op, etapaECor(lead, colunas, pendencia));
  return op;
}

/**
 * Linha depois de uma edição feita na própria aba CRM: escreve só o que o sistema mudou, o que precisa voltar e as
 * colunas que o sistema preenche. Assim um valor que ainda espera complemento (data sem hora) não é apagado.
 */
export function opCrmMudancas(
  antes: LinhaCrm,
  lead: LeadCrm,
  colunas: ColunaCrm[],
  origem: OrigemLead | null,
  pendencia: PendenciaCrm | null,
  reverter: string[],
): OperacaoLinha {
  const depois = linhaCrm(lead, colunas, origem, pendencia);
  const valores: Record<string, string> = {};
  for (const [t, v] of Object.entries(depois)) {
    if (v !== (antes[t] ?? "") || reverter.includes(t) || (SO_LEITURA as readonly string[]).includes(t)) valores[t] = v;
  }
  return { tipo: "linha", aba: ABA_CRM, id: lead.id, valores, ...etapaECor(lead, colunas, pendencia) };
}

export function opLixeira(lead: LeadCrm, colunas: ColunaCrm[], origem: OrigemLead | null): Operacao {
  const linha = linhaCrm(lead, colunas, origem, null);
  return { tipo: "lixeira", valores: Object.fromEntries(COLUNAS_LIXEIRA.map((t) => [t, linha[t] ?? ""])) };
}

/** Linha da aba de leads: só as chaves pedidas (as apagadas vão vazias) ou a linha toda. */
export function opLead(lead: LeadBanco, chaves: string[] | null): OperacaoLinha {
  if (!chaves) return { tipo: "linha", aba: lead.aba_id, id: lead.id, valores: { ...lead.dados }, completa: true };
  return { tipo: "linha", aba: lead.aba_id, id: lead.id, valores: Object.fromEntries(chaves.map((k) => [k, lead.dados[k] ?? ""])) };
}

export interface EntradaFila {
  id: number;
  entidade: string;
  registro_id: string;
  op: string;
  campos: string[] | null;
  dados: any;
}

export interface GrupoFila {
  entidade: "lead" | "crm";
  id: string;
  op: "upsert" | "delete";
  campos: string[] | null;
  dados: any;
}

/** Uma entrada por registro: campos somados (null = linha toda) e a exclusão vencendo, na ordem da fila. */
export function agruparFila(entradas: EntradaFila[]): GrupoFila[] {
  const grupos = new Map<string, GrupoFila>();
  for (const e of [...entradas].sort((a, b) => a.id - b.id)) {
    const chave = `${e.entidade}:${e.registro_id}`;
    const atual = grupos.get(chave);
    const op = e.op === "delete" ? "delete" : "upsert";
    if (!atual) {
      grupos.set(chave, { entidade: e.entidade as GrupoFila["entidade"], id: e.registro_id, op, campos: e.campos ?? null, dados: e.dados ?? null });
      continue;
    }
    if (op === "delete") {
      Object.assign(atual, { op, campos: null, dados: e.dados ?? null });
    } else if (atual.op === "delete") {
      Object.assign(atual, { op, campos: null, dados: null });
    } else if (atual.campos && e.campos) {
      atual.campos = [...new Set([...atual.campos, ...e.campos])];
    } else {
      atual.campos = null;
    }
  }
  return [...grupos.values()];
}
```

- [ ] **Step 4: Ver o teste passar**

Run: `node --test src/lib/planilhaOperacoes.test.ts`
Expected: PASS.

- [ ] **Step 5: Banco**

<!-- arquivo: supabase/functions/planilha/dados.ts -->
```ts
// Leitura e gravação no banco para a função `planilha`. O cliente usa a service role e o cabeçalho
// x-origem: planilha (os gatilhos não devolvem à planilha o que veio dela).
// deno-lint-ignore-file no-explicit-any
import type { ColunaCrm, LeadCrm, NovoEvento } from "../_shared/crmTipos.ts";
import { ordenarColunas } from "../_shared/crmColunas.ts";
import { valorDoPapel, type AbaBanco, type LeadBanco } from "../_shared/bancoLeads.ts";
import type { OrigemLead, PendenciaCrm } from "../_shared/planilhaCrm.ts";

export type Sb = any;
/** Usuário padrão do app (o sistema roda sem login): `user_id` obrigatório de `prospeccao`. */
export const USUARIO_PADRAO = "b34bdae5-7a67-4b63-a46f-8aad43a06c63";
const PAGINA = 1000;
const LOTE_IDS = 150;
const CAMPOS_BANCO = "id, aba_id, posicao, dados, lead_crm_id, hash, na_planilha";

function erro(onde: string, e: any): never {
  throw new Error(`${onde}: ${e?.message ?? e}`);
}

export function lotes<T>(itens: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < itens.length; i += n) out.push(itens.slice(i, i + n));
  return out;
}

/** Todas as linhas de uma consulta, de 1000 em 1000 (limite do PostgREST). */
async function tudo(onde: string, consulta: (de: number, ate: number) => any): Promise<any[]> {
  const out: any[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await consulta(de, de + PAGINA - 1);
    if (error) erro(onde, error);
    out.push(...(data ?? []));
    if (!data || data.length < PAGINA) return out;
  }
}

export async function config(sb: Sb): Promise<any | null> {
  const { data, error } = await sb.from("planilha_config").select("*").eq("id", "principal").maybeSingle();
  if (error) erro("configuração", error);
  return data ?? null;
}

export async function colunasCrm(sb: Sb): Promise<ColunaCrm[]> {
  const { data, error } = await sb.from("crm_colunas").select("*").order("ordem");
  if (error) erro("colunas do CRM", error);
  return ordenarColunas((data ?? []).map((c: any) => ({ ...c, config: c.config ?? {} })));
}

export async function abas(sb: Sb): Promise<AbaBanco[]> {
  const { data, error } = await sb.from("banco_leads_abas").select("*").order("ordem");
  if (error) erro("abas", error);
  return data ?? [];
}

export async function mapaAbas(sb: Sb): Promise<Map<string, AbaBanco>> {
  return new Map((await abas(sb)).map((a) => [a.id, a]));
}

export async function leadsBanco(
  sb: Sb,
  f: { ids?: string[]; crmIds?: string[]; abaId?: string; campos?: string } = {},
): Promise<LeadBanco[]> {
  const campos = f.campos ?? CAMPOS_BANCO;
  if (f.ids || f.crmIds) {
    const coluna = f.ids ? "id" : "lead_crm_id";
    const out: LeadBanco[] = [];
    for (const lote of lotes((f.ids ?? f.crmIds)!, LOTE_IDS)) {
      out.push(...(await tudo("leads", (de, ate) => sb.from("banco_leads").select(campos).in(coluna, lote).order("id").range(de, ate))));
    }
    return out;
  }
  return tudo("leads", (de, ate) => {
    let q = sb.from("banco_leads").select(campos).order("id");
    if (f.abaId) q = q.eq("aba_id", f.abaId);
    return q.range(de, ate);
  });
}

export async function gravarLeads(
  sb: Sb,
  linhas: { id: string; aba_id: string; posicao: number; dados: Record<string, string>; na_planilha: boolean }[],
): Promise<void> {
  for (const lote of lotes(linhas, 300)) {
    const { error } = await sb.from("banco_leads").upsert(lote, { onConflict: "id" });
    if (error) erro("gravar leads", error);
  }
}

export async function excluirLeadsBanco(sb: Sb, ids: string[]): Promise<void> {
  for (const lote of lotes(ids, LOTE_IDS)) {
    const { error } = await sb.from("banco_leads").delete().in("id", lote);
    if (error) erro("excluir leads", error);
  }
}

export async function definirCampoBanco(sb: Sb, id: string, chave: string, valor: string): Promise<void> {
  const { error } = await sb.rpc("banco_leads_definir", { p_id: id, p_chave: chave, p_valor: valor });
  if (error) erro("gravar campo", error);
}

export async function ligarBanco(sb: Sb, id: string, crmId: string | null): Promise<void> {
  const { error } = await sb.from("banco_leads").update({ lead_crm_id: crmId }).eq("id", id);
  if (error) erro("ligar lead", error);
}

export async function leadsCrm(sb: Sb, ids?: string[]): Promise<LeadCrm[]> {
  if (!ids) return tudo("leads do CRM", (de, ate) => sb.from("prospeccao").select("*").order("created_at").order("id").range(de, ate));
  const out: LeadCrm[] = [];
  for (const lote of lotes(ids, LOTE_IDS)) {
    out.push(...(await tudo("leads do CRM", (de, ate) => sb.from("prospeccao").select("*").in("id", lote).order("id").range(de, ate))));
  }
  return out;
}

export async function leadCrm(sb: Sb, id: string): Promise<LeadCrm | null> {
  const { data, error } = await sb.from("prospeccao").select("*").eq("id", id).maybeSingle();
  if (error) erro("lead do CRM", error);
  return data ?? null;
}

export async function inserirLead(sb: Sb, campos: Partial<LeadCrm>): Promise<LeadCrm> {
  const linha = Object.fromEntries(Object.entries({ user_id: USUARIO_PADRAO, ordem: 0, ...campos }).filter(([, v]) => v !== undefined));
  const { data, error } = await sb.from("prospeccao").insert(linha).select("*").single();
  if (error) erro("criar lead no CRM", error);
  return data;
}

export async function atualizarLead(sb: Sb, id: string, patch: Partial<LeadCrm>): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  const { error } = await sb.from("prospeccao").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) erro("atualizar lead", error);
}

export async function excluirLeadCrm(sb: Sb, id: string): Promise<void> {
  const { error } = await sb.from("prospeccao").delete().eq("id", id);
  if (error) erro("tirar do CRM", error);
}

/** Histórico do lead. `em` vira a data do evento (migração); o sufixo marca o que veio da planilha. */
export async function gravarEventos(
  sb: Sb,
  leadId: string,
  eventos: (NovoEvento & { em?: string })[],
  sufixo = " (pela planilha)",
): Promise<void> {
  if (eventos.length === 0) return;
  const linhas = eventos.map((e) => ({
    lead_id: leadId,
    tipo: e.tipo,
    descricao: `${e.descricao}${sufixo}`,
    dados: e.dados ?? {},
    ...(e.em ? { created_at: e.em } : {}),
  }));
  const { error } = await sb.from("crm_eventos").insert(linhas);
  if (error) erro("histórico", error);
}

export async function pendencias(sb: Sb, ids?: string[]): Promise<Map<string, PendenciaCrm>> {
  const linhas: any[] = [];
  if (!ids) linhas.push(...(await tudo("pendências", (de, ate) => sb.from("planilha_pendencias").select("*").order("lead_id").range(de, ate))));
  else {
    for (const lote of lotes(ids, LOTE_IDS)) {
      linhas.push(...(await tudo("pendências", (de, ate) => sb.from("planilha_pendencias").select("*").in("lead_id", lote).order("lead_id").range(de, ate))));
    }
  }
  return new Map(linhas.map((p) => [p.lead_id, { etapa_id: p.etapa_desejada, falta: p.falta }]));
}

export async function gravarPendencia(sb: Sb, leadId: string, p: PendenciaCrm): Promise<void> {
  const { error } = await sb.from("planilha_pendencias")
    .upsert({ lead_id: leadId, etapa_desejada: p.etapa_id, falta: p.falta, criado_em: new Date().toISOString() });
  if (error) erro("pendência", error);
}

export async function apagarPendencia(sb: Sb, leadId: string): Promise<void> {
  const { error } = await sb.from("planilha_pendencias").delete().eq("lead_id", leadId);
  if (error) erro("pendência", error);
}

export function origemDe(lead: Pick<LeadBanco, "dados">, aba: AbaBanco): OrigemLead {
  return { abaNome: aba.nome, faturamentoTexto: valorDoPapel(lead, aba, "faturamento") || null };
}

/** Aba de origem (e texto de faturamento) de cada lead do CRM ligado a uma linha da planilha. */
export async function origens(sb: Sb, crmIds: string[], abas: Map<string, AbaBanco>): Promise<Map<string, OrigemLead>> {
  const out = new Map<string, OrigemLead>();
  if (crmIds.length === 0) return out;
  for (const b of await leadsBanco(sb, { crmIds })) {
    const aba = abas.get(b.aba_id);
    if (aba && b.lead_crm_id && !out.has(b.lead_crm_id)) out.set(b.lead_crm_id, origemDe(b, aba));
  }
  return out;
}
```

- [ ] **Step 6: Agenda pelo servidor**

<!-- arquivo: supabase/functions/planilha/agenda.ts -->
```ts
// Agenda do Google pelo servidor (spec 2026-10-01-banco-de-leads §6): o mesmo corpo de evento do CRM (crmAgenda.ts),
// com o token da contato@ guardado em google_oauth_tokens e renovado com o refresh token, como em gmn/google.ts.
// deno-lint-ignore-file no-explicit-any
import type { LeadCrm } from "../_shared/crmTipos.ts";
import type { AcaoAgenda } from "../_shared/crmMovimento.ts";
import { corpoConvidar, corpoMoverEvento, corpoNovoEvento, enviaConvite, linkMeetDoEvento } from "../_shared/crmAgenda.ts";
import type { Sb } from "./dados.ts";

const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export async function tokenGoogle(sb: Sb): Promise<string> {
  const { data: row, error } = await sb
    .from("google_oauth_tokens")
    .select("id, access_token, refresh_token, expires_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row?.refresh_token) throw new Error("Google não conectado (Admin → Google).");
  const expira = new Date(row.expires_at).getTime();
  if (row.access_token && !Number.isNaN(expira) && expira - Date.now() > 120_000) return row.access_token;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID") || "",
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") || "",
      refresh_token: row.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!d.access_token) throw new Error(`Google recusou renovar o token (${d.error ?? r.status}).`);
  const novo = new Date(Date.now() + Number(d.expires_in || 3600) * 1000).toISOString();
  await sb.from("google_oauth_tokens")
    .update({ access_token: d.access_token, expires_at: novo, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  return d.access_token;
}

class EventoSumiu extends Error {}

async function gcal(token: string, caminho: string, init: RequestInit = {}): Promise<any> {
  const r = await fetch(`${API}${caminho}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  });
  if (r.status === 204) return null;
  const d = await r.json().catch(() => ({}));
  if (r.ok) return d;
  if (r.status === 410 && init.method === "DELETE") return null;
  if (r.status === 404 || r.status === 410) throw new EventoSumiu("O evento não existe mais na agenda.");
  throw new Error(d?.error?.message || `Google Agenda respondeu ${r.status}`);
}

const parametros = (enviar: boolean) => `sendUpdates=${enviar ? "all" : "none"}&conferenceDataVersion=1`;

async function criar(token: string, lead: LeadCrm): Promise<Partial<LeadCrm>> {
  const ev = await gcal(token, `?${parametros(enviaConvite(lead))}`, {
    method: "POST",
    body: JSON.stringify(corpoNovoEvento(lead, crypto.randomUUID())),
  });
  return { evento_google_id: ev.id, evento_meet_link: linkMeetDoEvento(ev), evento_status: "ok", evento_erro: null };
}

/**
 * Executa a ação da agenda decidida pelas regras do CRM e devolve o patch do lead. Nunca lança: falha vira
 * `evento_status = 'erro'` (o card do sistema mostra "Evento não criado — Tentar de novo"). Reunião já passada não
 * mexe na agenda.
 */
export async function executarAgendaServidor(
  sb: Sb,
  antes: LeadCrm,
  lead: LeadCrm,
  acao: AcaoAgenda,
  agora: Date,
  emailAntigo: string | null,
): Promise<Partial<LeadCrm>> {
  if (!acao) return {};
  if (acao !== "cancelar" && (!lead.reuniao_em || new Date(lead.reuniao_em).getTime() <= agora.getTime())) return {};
  try {
    const token = await tokenGoogle(sb);
    if (acao === "cancelar") {
      if (!antes.evento_google_id) return {};
      try {
        await gcal(token, `/${encodeURIComponent(antes.evento_google_id)}?sendUpdates=${enviaConvite(antes) ? "all" : "none"}`, { method: "DELETE" });
      } catch (e) {
        if (!(e instanceof EventoSumiu)) throw e;
      }
      return { evento_google_id: null, evento_meet_link: null, evento_status: null, evento_erro: null };
    }
    if (acao === "criar" || !lead.evento_google_id) return await criar(token, lead);
    try {
      const id = encodeURIComponent(lead.evento_google_id);
      const atual = await gcal(token, `/${id}`);
      if (atual?.status === "cancelled") return await criar(token, lead);
      const corpo = acao === "mover"
        ? corpoMoverEvento(lead, atual?.attendees ?? [], emailAntigo)
        : corpoConvidar(lead, atual?.attendees ?? [], emailAntigo);
      const ev = await gcal(token, `/${id}?${parametros(enviaConvite(lead))}`, { method: "PATCH", body: JSON.stringify(corpo) });
      return { evento_meet_link: linkMeetDoEvento(ev) ?? lead.evento_meet_link, evento_status: "ok", evento_erro: null };
    } catch (e) {
      if (e instanceof EventoSumiu) return await criar(token, lead);
      throw e;
    }
  } catch (e: any) {
    return { evento_status: "erro", evento_erro: String(e?.message ?? e) };
  }
}
```

- [ ] **Step 7: Ações**

<!-- arquivo: supabase/functions/planilha/acoes.ts -->
```ts
// Ações da ponte planilha ⇄ sistema (spec 2026-10-01-banco-de-leads §6). Cada ação recebe o corpo do Apps Script e
// devolve as operações que a planilha aplica.
// deno-lint-ignore-file no-explicit-any
import type { ColunaCrm, LeadCrm } from "../_shared/crmTipos.ts";
import { colunaInicial, emailValido, exigenciaDe, FAIXAS_FATURAMENTO } from "../_shared/crmColunas.ts";
import {
  CAMPOS_COMUNS,
  chaveDoPapel,
  dataIsoDoTexto,
  ehSim,
  ehValido,
  faixaDoFaturamento,
  leadCrmDoBanco,
  montarColunas,
  NAO,
  nomeDoLead,
  normalizar,
  valorDoPapel,
  type AbaBanco,
  type LeadBanco,
  type Papel,
} from "../_shared/bancoLeads.ts";
import { interpretarLinhaCrm, linhaCrm, migrarLinhaAntiga, motivosDaEtapa, type OrigemLead } from "../_shared/planilhaCrm.ts";
import { executarAgendaServidor } from "./agenda.ts";
import * as D from "./dados.ts";
import { ABA_CRM, agruparFila, opCrm, opCrmMudancas, opLead, opLixeira, type Operacao } from "./operacoes.ts";

export interface Contexto {
  sb: D.Sb;
  agora: Date;
}
export type Acao = (ctx: Contexto, corpo: any) => Promise<unknown>;

const lista = (v: unknown): any[] => (Array.isArray(v) ? v : []);

function limparDados(d: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (d && typeof d === "object") {
    for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
      const s = String(v ?? "").trim();
      if (k.trim() && s) out[k.trim()] = s;
    }
  }
  return out;
}

async function configCrm(sb: D.Sb) {
  const colunas = await D.colunasCrm(sb);
  return { etapas: colunas.map((c) => ({ id: c.id, titulo: c.titulo, tipo: c.tipo, motivos: motivosDaEtapa(c) })) };
}

const PAPEIS_DO_CRM: Papel[] = [...CAMPOS_COMUNS, "faturamento"];

/** Chaves da aba de origem que acompanham o lead do CRM (campos em comum e faturamento). */
const chavesComuns = (aba: AbaBanco) => PAPEIS_DO_CRM.map((p) => chaveDoPapel(aba, p)).filter((k): k is string => !!k);

// ---------------------------------------------------------------------------------------------------------- abas
const abas: Acao = async (ctx, corpo) => {
  const recebidas = lista(corpo.abas).map((a) => ({
    id: String(a.id),
    nome: String(a.nome ?? "").trim(),
    ordem: Number(a.ordem) || 0,
    colunas: montarColunas(lista(a.colunas).map((c) => ({ titulo: String(c.titulo ?? ""), oculta: !!c.oculta, indice: Number(c.indice) || 0 }))),
    ativa: true,
    updated_at: ctx.agora.toISOString(),
  }));
  if (recebidas.length) {
    const { error } = await ctx.sb.from("banco_leads_abas").upsert(recebidas, { onConflict: "id" });
    if (error) throw new Error(`abas: ${error.message}`);
  }
  // Aba que sumiu da planilha sai do banco (com os leads); aba que deixou de ser de leads só fica inativa.
  const existentes = new Set(lista(corpo.existentes).map(String));
  const ativas = new Set(recebidas.map((a) => a.id));
  for (const a of await D.abas(ctx.sb)) {
    if (ativas.has(a.id)) continue;
    if (existentes.size > 0 && !existentes.has(a.id)) {
      const { error } = await ctx.sb.from("banco_leads_abas").delete().eq("id", a.id);
      if (error) throw new Error(`abas: ${error.message}`);
    } else if (a.ativa !== false) {
      const { error } = await ctx.sb.from("banco_leads_abas").update({ ativa: false }).eq("id", a.id);
      if (error) throw new Error(`abas: ${error.message}`);
    }
  }
  return { ok: true, crm: await configCrm(ctx.sb) };
};

// ------------------------------------------------------------------------------------------------- entrar e sair
async function entrarNoCrm(ctx: Contexto, lead: LeadBanco, aba: AbaBanco, colunas: ColunaCrm[]): Promise<LeadCrm> {
  const coluna = colunas.find((c) => c.id === "primeiro_contato") ?? colunaInicial(colunas);
  if (!coluna) throw new Error("O CRM não tem colunas.");
  const agora = ctx.agora.toISOString();
  const novo = await D.inserirLead(ctx.sb, {
    ...leadCrmDoBanco(lead, aba),
    coluna_id: coluna.id,
    coluna_desde: agora,
    primeiro_contato_em: agora,
  });
  await D.gravarEventos(ctx.sb, novo.id, [{ tipo: "criacao", descricao: `Entrou no CRM em ${coluna.titulo}, vindo da aba ${aba.nome}` }]);
  await D.ligarBanco(ctx.sb, lead.id, novo.id);
  return novo;
}

async function sairDoCrm(ctx: Contexto, lead: LeadCrm, colunas: ColunaCrm[], origem: OrigemLead | null): Promise<Operacao[]> {
  if (lead.evento_google_id && lead.reuniao_em && new Date(lead.reuniao_em).getTime() > ctx.agora.getTime()) {
    const p = await executarAgendaServidor(ctx.sb, lead, lead, "cancelar", ctx.agora, lead.email);
    if (p.evento_status === "erro") console.warn("Evento não cancelado:", p.evento_erro);
  }
  const ops: Operacao[] = [opLixeira(lead, colunas, origem), { tipo: "remover", aba: ABA_CRM, id: lead.id }];
  await D.excluirLeadCrm(ctx.sb, lead.id);
  return ops;
}

// ---------------------------------------------------------------------------------------------- abas de leads
const leads: Acao = async (ctx, corpo) => {
  const linhas = lista(corpo.linhas).map((l) => ({
    id: String(l.id),
    aba_id: String(l.aba_id),
    posicao: Number(l.posicao) || 0,
    dados: limparDados(l.dados),
  }));
  const ops: Operacao[] = [];
  const avisos: string[] = [];
  if (linhas.length === 0) return { ok: true, operacoes: ops, avisos };

  const abasMap = await D.mapaAbas(ctx.sb);
  const antes = new Map((await D.leadsBanco(ctx.sb, { ids: linhas.map((l) => l.id) })).map((l) => [l.id, l]));
  await D.gravarLeads(ctx.sb, linhas.filter((l) => abasMap.has(l.aba_id)).map((l) => ({ ...l, na_planilha: true })));
  // Carga inicial: só grava (os leads que já estão no CRM antigo entram pela migração)
  if (corpo.carga) return { ok: true, operacoes: ops, avisos };

  let colunas: ColunaCrm[] | null = null;
  const cols = async () => (colunas ??= await D.colunasCrm(ctx.sb));

  for (const l of linhas) {
    const aba = abasMap.get(l.aba_id);
    if (!aba) continue;
    const ant = antes.get(l.id);
    const crmId = ant?.lead_crm_id ?? null;
    const lead: LeadBanco = { ...l, lead_crm_id: crmId };
    const origem = D.origemDe(lead, aba);
    const k1 = chaveDoPapel(aba, "primeira_msg");
    const agoraSim = !!k1 && ehSim(l.dados[k1]);
    const antesSim = !!k1 && !!ant && ehSim(ant.dados[k1]);

    if (agoraSim && !crmId) {
      if (!ehValido(lead, aba)) {
        await D.definirCampoBanco(ctx.sb, l.id, k1!, NAO);
        ops.push({ tipo: "linha", aba: aba.id, id: l.id, valores: { [k1!]: NAO } });
        avisos.push(`${nomeDoLead(lead, aba)}: está como Lead válido = Não, por isso não entrou no CRM.`);
        continue;
      }
      const novo = await entrarNoCrm(ctx, lead, aba, await cols());
      ops.push(opCrm(novo, await cols(), origem, null));
    } else if (!agoraSim && antesSim && crmId) {
      const atual = await D.leadCrm(ctx.sb, crmId);
      if (atual) ops.push(...(await sairDoCrm(ctx, atual, await cols(), origem)));
    } else if (crmId && ant) {
      const kf = chaveDoPapel(aba, "faturamento");
      const fatMudou = !!kf && (ant.dados[kf] ?? "") !== (l.dados[kf] ?? "");
      if (fatMudou) {
        const faixa = faixaDoFaturamento(l.dados[kf!]);
        if (faixa) await D.atualizarLead(ctx.sb, crmId, { faturamento_faixa: faixa });
      }
      const comumMudou = CAMPOS_COMUNS.some((c) => {
        const k = chaveDoPapel(aba, c);
        return !!k && (ant.dados[k] ?? "") !== (l.dados[k] ?? "");
      });
      if (fatMudou || comumMudou) {
        const atual = await D.leadCrm(ctx.sb, crmId);
        const pend = (await D.pendencias(ctx.sb, [crmId])).get(crmId) ?? null;
        if (atual) ops.push(opCrm(atual, await cols(), origem, pend));
      }
    }
  }
  return { ok: true, operacoes: ops, avisos };
};

const excluirLeads: Acao = async (ctx, corpo) => {
  const ids = lista(corpo.ids).map(String);
  if (ids.length === 0) return { ok: true, operacoes: [], avisos: [] };
  const afetados = await D.leadsBanco(ctx.sb, { ids });
  await D.excluirLeadsBanco(ctx.sb, ids);
  const crmIds = afetados.map((l) => l.lead_crm_id).filter((x): x is string => !!x);
  const ops: Operacao[] = [];
  if (crmIds.length) {
    const colunas = await D.colunasCrm(ctx.sb);
    const pend = await D.pendencias(ctx.sb, crmIds);
    // Sem a linha de origem, "Aba de origem" passa a ser "Sistema" (linha toda reescrita)
    for (const l of await D.leadsCrm(ctx.sb, crmIds)) ops.push(opCrm(l, colunas, null, pend.get(l.id) ?? null));
  }
  return { ok: true, operacoes: ops, avisos: [] };
};

// ---------------------------------------------------------------------------------------------------- aba CRM
async function aplicarFaturamento(
  ctx: Contexto,
  banco: LeadBanco | null,
  aba: AbaBanco | null,
  texto: string,
): Promise<{ patch?: Partial<LeadCrm>; op?: Operacao; origem?: OrigemLead; erro?: string }> {
  const kf = aba ? chaveDoPapel(aba, "faturamento") : null;
  if (banco && aba && kf) {
    await D.definirCampoBanco(ctx.sb, banco.id, kf, texto);
    const faixa = faixaDoFaturamento(texto);
    return {
      patch: faixa ? { faturamento_faixa: faixa } : undefined,
      op: { tipo: "linha", aba: aba.id, id: banco.id, valores: { [kf]: texto } },
      origem: { abaNome: aba.nome, faturamentoTexto: texto || null },
    };
  }
  if (!texto) return { patch: { faturamento_faixa: null } };
  const faixa = FAIXAS_FATURAMENTO.find((f) => normalizar(f.rotulo) === normalizar(texto))?.id ?? faixaDoFaturamento(texto);
  if (faixa) return { patch: { faturamento_faixa: faixa } };
  return { erro: `Faturamento: use uma das faixas do CRM (${FAIXAS_FATURAMENTO.map((f) => f.rotulo).join("; ")}).` };
}

async function criarPelaPlanilha(ctx: Contexto, valores: Record<string, string>, colunas: ColunaCrm[], avisos: string[]): Promise<LeadCrm | null> {
  const v = (t: string) => String(valores[t] ?? "").trim();
  const nome = v("Lead");
  if (!nome) return null;
  const inicial = colunaInicial(colunas);
  if (!inicial) throw new Error("O CRM não tem colunas.");
  const destino = colunas.find((c) => normalizar(c.titulo) === normalizar(v("Etapa"))) ?? null;
  let coluna = inicial;
  if (destino && exigenciaDe(destino.tipo, { reuniao_em: null }) === "nenhuma") coluna = destino;
  else if (destino && destino.id !== inicial.id) {
    avisos.push(`${nome}: entrou em ${inicial.titulo}. Mude a Etapa para ${destino.titulo} de novo, preenchendo o que ela pede.`);
  }
  const agora = ctx.agora.toISOString();
  const email = v("E-mail");
  const novo = await D.inserirLead(ctx.sb, {
    nome,
    empresa: v("Empresa") || null,
    telefone: v("Telefone") || null,
    email: email && emailValido(email) ? email : null,
    instagram: v("Instagram") || null,
    nicho: v("Nicho") || null,
    cidade: v("Cidade") || null,
    observacoes: v("Observações") || null,
    trafego: normalizar(v("Orgânico/Pago")) === "pago" ? "pago" : "organico",
    coluna_id: coluna.id,
    coluna_desde: agora,
    primeiro_contato_em: coluna.id !== inicial.id ? agora : null,
  });
  await D.gravarEventos(ctx.sb, novo.id, [{ tipo: "criacao", descricao: `Criado na aba CRM da planilha, em ${coluna.titulo}` }]);
  return novo;
}

const crm: Acao = async (ctx, corpo) => {
  const colunas = await D.colunasCrm(ctx.sb);
  const abasMap = await D.mapaAbas(ctx.sb);
  const ops: Operacao[] = [];
  const avisos: string[] = [];
  for (const l of lista(corpo.linhas)) {
    const valores: Record<string, string> = Object.fromEntries(Object.entries(l.valores ?? {}).map(([k, x]) => [k, String(x ?? "")]));
    if (!l.id) {
      const novo = await criarPelaPlanilha(ctx, valores, colunas, avisos);
      if (novo) ops.push({ ...opCrm(novo, colunas, null, null), linha: Number(l.linha) || undefined });
      continue;
    }
    const lead = await D.leadCrm(ctx.sb, String(l.id));
    if (!lead) {
      ops.push({ tipo: "remover", aba: ABA_CRM, id: String(l.id) });
      continue;
    }
    const banco = (await D.leadsBanco(ctx.sb, { crmIds: [lead.id] }))[0] ?? null;
    const aba = banco ? abasMap.get(banco.aba_id) ?? null : null;
    let origem: OrigemLead | null = banco && aba ? D.origemDe(banco, aba) : null;
    const pend = (await D.pendencias(ctx.sb, [lead.id])).get(lead.id) ?? null;
    const antes = linhaCrm(lead, colunas, origem, pend);
    const it = interpretarLinhaCrm(lead, colunas, valores, origem, pend, ctx.agora);

    if (it.faturamento !== undefined) {
      const fx = await aplicarFaturamento(ctx, banco, aba, it.faturamento);
      if (fx.patch) Object.assign(it.patch, fx.patch);
      if (fx.origem) origem = fx.origem;
      if (fx.op) ops.push(fx.op);
      if (fx.erro) {
        it.reverter.push("Faturamento");
        it.avisos.push(fx.erro);
      }
    }
    let final: LeadCrm = { ...lead, ...it.patch };
    await D.atualizarLead(ctx.sb, lead.id, it.patch);
    await D.gravarEventos(ctx.sb, lead.id, it.eventos);
    if (it.pendencia === "apagar") await D.apagarPendencia(ctx.sb, lead.id);
    else if (it.pendencia) await D.gravarPendencia(ctx.sb, lead.id, it.pendencia);
    if (it.agenda) {
      const p = await executarAgendaServidor(ctx.sb, lead, final, it.agenda, ctx.agora, it.emailAntigo);
      if (Object.keys(p).length) {
        await D.atualizarLead(ctx.sb, lead.id, p);
        final = { ...final, ...p };
      }
      if (p.evento_status === "erro") avisos.push(`${final.nome}: o evento não foi criado na agenda (${p.evento_erro}).`);
    }
    avisos.push(...it.avisos.map((a) => `${final.nome}: ${a}`));
    const pendFinal = it.pendencia === "apagar" ? null : it.pendencia ?? (it.patch.coluna_id ? null : pend);
    ops.push(opCrmMudancas(antes, final, colunas, origem, pendFinal, it.reverter));
    // Campos em comum copiados para a aba de origem pelo gatilho do banco
    if (banco && aba) {
      const b2 = (await D.leadsBanco(ctx.sb, { ids: [banco.id] }))[0];
      if (b2) ops.push(opLead(b2, chavesComuns(aba)));
    }
  }
  return { ok: true, operacoes: ops, avisos };
};

// ------------------------------------------------------------------------------------------------------- fila
const fila: Acao = async (ctx) => {
  const { data, error } = await ctx.sb.from("planilha_fila").select("*").order("id").limit(300);
  if (error) throw new Error(`fila: ${error.message}`);
  const entradas = data ?? [];
  if (entradas.length === 0) return { operacoes: [], fila_ids: [] };
  const grupos = agruparFila(entradas);
  const leadIds = grupos.filter((g) => g.entidade === "lead" && g.op === "upsert").map((g) => g.id);
  const crmIds = grupos.filter((g) => g.entidade === "crm" && g.op === "upsert").map((g) => g.id);
  const abasMap = await D.mapaAbas(ctx.sb);
  const bancos = leadIds.length ? await D.leadsBanco(ctx.sb, { ids: leadIds }) : [];
  const bancoMap = new Map(bancos.map((b) => [b.id, b]));
  // Faturamento mudado na aba de origem também muda a coluna Faturamento da aba CRM
  const crmPorFaturamento = new Set<string>();
  for (const g of grupos) {
    const b = g.entidade === "lead" ? bancoMap.get(g.id) : undefined;
    const aba = b ? abasMap.get(b.aba_id) : undefined;
    const kf = aba ? chaveDoPapel(aba, "faturamento") : null;
    if (b?.lead_crm_id && kf && (!g.campos || g.campos.includes(kf))) crmPorFaturamento.add(b.lead_crm_id);
  }
  const todosCrm = [...new Set([...crmIds, ...crmPorFaturamento])];
  const crms = todosCrm.length ? await D.leadsCrm(ctx.sb, todosCrm) : [];
  const crmMap = new Map(crms.map((c) => [c.id, c]));
  const precisaColunas = todosCrm.length > 0 || grupos.some((g) => g.entidade === "crm");
  const colunas = precisaColunas ? await D.colunasCrm(ctx.sb) : [];
  const origensMap = await D.origens(ctx.sb, todosCrm, abasMap);
  const pend = todosCrm.length ? await D.pendencias(ctx.sb, todosCrm) : new Map();

  const ops: Operacao[] = [];
  for (const g of grupos) {
    if (g.entidade === "lead") {
      if (g.op === "delete") {
        if (g.dados?.aba_id) ops.push({ tipo: "remover", aba: String(g.dados.aba_id), id: g.id });
        continue;
      }
      const b = bancoMap.get(g.id);
      if (b) ops.push(opLead(b, g.campos));
      continue;
    }
    if (g.op === "delete") {
      const snap = (g.dados ?? {}) as LeadCrm & { _aba_origem?: string; _faturamento_origem?: string };
      const origem = snap._aba_origem ? { abaNome: String(snap._aba_origem), faturamentoTexto: snap._faturamento_origem ?? null } : null;
      ops.push(opLixeira({ ...snap, id: g.id }, colunas, origem), { tipo: "remover", aba: ABA_CRM, id: g.id });
      continue;
    }
    const c = crmMap.get(g.id);
    if (c) ops.push(opCrm(c, colunas, origensMap.get(c.id) ?? null, pend.get(c.id) ?? null, g.campos));
  }
  for (const id of crmPorFaturamento) {
    const c = crmMap.get(id);
    if (c && !crmIds.includes(id)) ops.push(opCrm(c, colunas, origensMap.get(id) ?? null, pend.get(id) ?? null, ["faturamento_faixa"]));
  }
  return { operacoes: ops, fila_ids: entradas.map((e: any) => e.id) };
};

const filaOk: Acao = async (ctx, corpo) => {
  const ids = lista(corpo.fila_ids).map(Number).filter(Number.isFinite);
  for (const lote of D.lotes(ids, 200)) {
    const { error } = await ctx.sb.from("planilha_fila").delete().in("id", lote);
    if (error) throw new Error(`fila: ${error.message}`);
  }
  const escritos = lista(corpo.escritos).map(String);
  for (const lote of D.lotes(escritos, 150)) {
    const { error } = await ctx.sb.from("banco_leads").update({ na_planilha: true }).in("id", lote);
    if (error) throw new Error(`fila: ${error.message}`);
  }
  return { ok: true };
};

// ------------------------------------------------------------------------------------------------ conferência
const conferir: Acao = async (ctx) => {
  const { data, error } = await ctx.sb.rpc("planilha_resumo");
  if (error) throw new Error(`resumo: ${error.message}`);
  return { resumo: data };
};

const conferenciaFim: Acao = async (ctx, corpo) => {
  const { error } = await ctx.sb.from("planilha_config").update({
    ultima_conferencia_em: ctx.agora.toISOString(),
    ultima_conferencia_ok: !!corpo.ok,
    ultima_conferencia_erro: corpo.ok ? null : String(corpo.erro ?? "erro desconhecido").slice(0, 500),
  }).eq("id", "principal");
  if (error) throw new Error(error.message);
  return { ok: true };
};

const abaDetalhe: Acao = async (ctx, corpo) => {
  const leads = await D.leadsBanco(ctx.sb, { abaId: String(corpo.aba_id), campos: "id, hash, posicao, na_planilha" });
  return { leads };
};

const linhas: Acao = async (ctx, corpo) => {
  const ops: Operacao[] = [];
  const pedidosLeads = lista(corpo.leads).map(String);
  if (pedidosLeads.length) for (const b of await D.leadsBanco(ctx.sb, { ids: pedidosLeads })) ops.push(opLead(b, null));
  let ids: string[] | undefined;
  let fp: string | null = null;
  const pedidosCrm = lista(corpo.crm).map(String);
  if (corpo.crm_todos || pedidosCrm.length) {
    // A impressão digital vem antes da leitura: mudança no meio do caminho aparece na próxima conferência
    if (corpo.crm_todos) fp = (await ctx.sb.rpc("planilha_resumo")).data?.crm ?? null;
    const leadsCrm = await D.leadsCrm(ctx.sb, corpo.crm_todos ? undefined : pedidosCrm);
    const colunas = await D.colunasCrm(ctx.sb);
    const origensMap = await D.origens(ctx.sb, leadsCrm.map((l) => l.id), await D.mapaAbas(ctx.sb));
    const pend = await D.pendencias(ctx.sb, corpo.crm_todos ? undefined : pedidosCrm);
    for (const l of leadsCrm) ops.push(opCrm(l, colunas, origensMap.get(l.id) ?? null, pend.get(l.id) ?? null));
    ids = leadsCrm.map((l) => l.id);
  }
  return { operacoes: ops, ids, fp };
};

// ------------------------------------------------------------------------------------------- migração única
const importarCrmAntigo: Acao = async (ctx, corpo) => {
  const recebidas: Record<string, string>[] = lista(corpo.linhas);
  const colunas = await D.colunasCrm(ctx.sb);
  const abasMap = await D.mapaAbas(ctx.sb);
  const chave = (tel: string | null | undefined, nome: string | null | undefined, empresa: string | null | undefined) =>
    String(tel ?? "").trim() ? `t:${String(tel).trim()}` : `n:${normalizar(nome)}|${normalizar(empresa)}`;
  const jaNoCrm = new Set((await D.leadsCrm(ctx.sb)).map((l) => chave(l.telefone, l.nome, l.empresa)));
  const porChave = new Map<string, LeadBanco>();
  for (const b of await D.leadsBanco(ctx.sb)) {
    const aba = abasMap.get(b.aba_id);
    if (!aba) continue;
    const k = chave(valorDoPapel(b, aba, "telefone"), valorDoPapel(b, aba, "nome"), valorDoPapel(b, aba, "empresa"));
    const atual = porChave.get(k);
    const marcado = ehSim(valorDoPapel(b, aba, "primeira_msg"));
    if (!atual || (marcado && !ehSim(valorDoPapel(atual, abasMap.get(atual.aba_id), "primeira_msg")))) porChave.set(k, b);
  }
  let criados = 0;
  let ligados = 0;
  let pulados = 0;
  const avisos: string[] = [];
  for (const l of recebidas) {
    const m = migrarLinhaAntiga(l, colunas, ctx.agora);
    if (!m) {
      pulados++;
      continue;
    }
    const k = chave(m.campos.telefone, m.campos.nome, m.campos.empresa);
    if (jaNoCrm.has(k)) {
      pulados++;
      continue;
    }
    const banco = porChave.get(k) ?? null;
    const aba = banco ? abasMap.get(banco.aba_id) ?? null : null;
    const daOrigem: Partial<LeadCrm> = {};
    if (banco && aba) {
      const data = dataIsoDoTexto(valorDoPapel(banco, aba, "data_chegada"));
      if (data) daOrigem.data_lead = data;
      for (const c of ["cidade", "site"] as const) {
        const v = valorDoPapel(banco, aba, c);
        if (v) daOrigem[c] = v;
      }
    }
    const novo = await D.inserirLead(ctx.sb, { ...m.campos, ...daOrigem });
    await D.gravarEventos(ctx.sb, novo.id, m.eventos, "");
    criados++;
    jaNoCrm.add(k);
    if (banco && !banco.lead_crm_id) {
      await D.ligarBanco(ctx.sb, banco.id, novo.id);
      ligados++;
    } else avisos.push(`${m.campos.nome}: não achei a linha de origem (fica como "Sistema").`);
  }
  return { ok: true, criados, ligados, pulados, avisos };
};

export const ACOES: Record<string, Acao> = {
  abas,
  leads,
  excluir_leads: excluirLeads,
  crm,
  fila,
  fila_ok: filaOk,
  conferir,
  conferencia_fim: conferenciaFim,
  aba_detalhe: abaDetalhe,
  linhas,
  importar_crm_antigo: importarCrmAntigo,
};

export { configCrm };
```

- [ ] **Step 8: Ponto de entrada**

<!-- arquivo: supabase/functions/planilha/index.ts -->
```ts
// Ponte entre a "Planilha CRM Mestra" (Apps Script) e o sistema (spec docs/superpowers/specs/2026-10-01-banco-de-leads-design.md).
//   POST { acao, planilha_id, ... } com o cabeçalho x-planilha-chave. Ações em acoes.ts.
//   acao "registrar" { chave }: grava a chave na primeira vez (a linha de planilha_config já precisa existir).
// Sem CORS: só o Apps Script chama (servidor para servidor). verify_jwt = false em supabase/config.toml.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import { ACOES } from "./acoes.ts";
import * as D from "./dados.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function igual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: true, servico: "planilha" });
  let corpo: any;
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: "Corpo inválido." }, 400);
  }
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    global: { headers: { "x-origem": "planilha" } },
    auth: { persistSession: false },
  });
  const acao = String(corpo?.acao ?? "");
  const chave = req.headers.get("x-planilha-chave") ?? "";
  try {
    const cfg = await D.config(sb);
    if (!cfg) return json({ erro: "Planilha não configurada no sistema." }, 409);
    if (String(corpo.planilha_id ?? "") !== cfg.planilha_id) return json({ erro: "Esta planilha não é a configurada no sistema." }, 403);

    if (acao === "registrar") {
      const nova = String(corpo.chave ?? "");
      if (!cfg.chave) {
        if (nova.length < 32) return json({ erro: "Chave curta demais." }, 400);
        const { error } = await sb.from("planilha_config").update({ chave: nova, updated_at: new Date().toISOString() }).eq("id", "principal");
        if (error) throw new Error(error.message);
        return json({ ok: true, registrada: true });
      }
      if (!igual(chave, cfg.chave)) return json({ erro: "Esta planilha já foi registrada com outra chave." }, 401);
      return json({ ok: true, registrada: false });
    }

    if (!cfg.chave || !igual(chave, cfg.chave)) return json({ erro: "Chave da planilha inválida." }, 401);
    const f = ACOES[acao];
    if (!f) return json({ erro: `Ação desconhecida: ${acao}` }, 400);
    return json(await f({ sb, agora: new Date() }, corpo));
  } catch (e: any) {
    console.error(acao, e);
    return json({ erro: String(e?.message ?? e) }, 500);
  }
});
```

- [ ] **Step 9: Declarar a função sem JWT**

Acrescentar ao fim de `supabase/config.toml`:

```toml
[functions.planilha]
verify_jwt = false
```

- [ ] **Step 10: Tipos e testes**

Run: `npx tsc --noEmit -p tsconfig.json` (as funções Deno ficam fora do tsconfig do app; se o tsconfig as incluir e
reclamar de `Deno`, conferir que as outras funções têm o mesmo comportamento e seguir) e `npm test`.
Expected: sem erros novos; todos os testes PASS.

- [ ] **Step 11: Commit**

```bash
git add supabase/functions/planilha supabase/config.toml src/lib/planilhaOperacoes.test.ts
git commit -m "Banco de leads: edge function planilha (ações, fila, agenda pelo servidor e migração do CRM antigo)"
```

---

### Task 6: Apps Script da planilha

**Files:**
- Create: `infra/planilha-crm/Codigo.gs`, `infra/planilha-crm/README.md`
- Test: `src/lib/planilhaGas.test.ts`

**Interfaces:**
- Consumes: as ações da Task 5 (`registrar`, `abas`, `leads`, `excluir_leads`, `crm`, `fila`, `fila_ok`, `conferir`,
  `conferencia_fim`, `aba_detalhe`, `linhas`, `importar_crm_antigo`).
- Produces: gatilhos `aoEditar`, `aoMudar`, `conferir`; Web App `doPost`; menu `CRM` com `configurar`,
  `sincronizarAgora`, `mostrarApoio`, `prepararSincronizacao`.

- [ ] **Step 1: Teste das funções puras do script (rodam no Node com `Utilities` simulado)**

<!-- arquivo: src/lib/planilhaGas.test.ts -->
```ts
process.env.TZ = "Asia/Tokyo";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { chavesDosTitulos } from "./bancoLeads.ts";

// O Apps Script devolve os bytes do digest com sinal (-128..127)
const Utilities = {
  DigestAlgorithm: { MD5: "md5" },
  Charset: { UTF_8: "utf8" },
  computeDigest: (_alg: string, s: string) => [...createHash("md5").update(s, "utf8").digest()].map((b) => (b > 127 ? b - 256 : b)),
};
const gas: any = { Utilities, console };
vm.createContext(gas);
vm.runInContext(readFileSync("infra/planilha-crm/Codigo.gs", "utf8"), gas);

const md5 = (s: string) => createHash("md5").update(s, "utf8").digest("hex");
const US = String.fromCharCode(31);
const RS = String.fromCharCode(30);

test("md5 do script igual ao do Node (e ao md5 do Postgres)", () => {
  assert.equal(gas.md5_(""), "d41d8cd98f00b204e9800998ecf8427e");
  assert.equal(gas.md5_("Árvore"), md5("Árvore"));
});

test("hash da linha: chaves em ordem de código, valores vazios fora (igual a planilha_canonico)", () => {
  const dados = { "Telefone": "55", "Nome": "Abreu", "Vazio": "", "Árvore": "x" };
  assert.equal(gas.canonico_(dados), `Nome${US}Abreu${RS}Telefone${US}55${RS}Árvore${US}x`);
  assert.equal(gas.hashLinha_(dados), md5(`Nome${US}Abreu${RS}Telefone${US}55${RS}Árvore${US}x`));
});

test("agregado da aba: id:hash:posicao em ordem de id, separado por vírgula", () => {
  const itens = [{ id: "b", hash: "h2", posicao: 3 }, { id: "a", hash: "h1", posicao: 2 }];
  assert.equal(gas.agregado_(itens), md5("a:h1:2,b:h2:3"));
  assert.equal(gas.agregado_([]), md5(""));
});

test("chaves das colunas iguais às do sistema", () => {
  const titulos = ["Nome", "", " Nome ", "Telefone", "Nome", "Lead válido"];
  assert.deepEqual([...gas.chavesDe_(titulos)], chavesDosTitulos(titulos));
});

test("etapa da aba CRM antiga (lixeira)", () => {
  assert.equal(gas.etapaAntiga_({ "Lead Perdido": "Sim" }), "Lead perdido");
  assert.equal(gas.etapaAntiga_({ "Reunião Agendada": "Sim", "Lead respondeu": "Sim" }), "Reunião marcada");
  assert.equal(gas.etapaAntiga_({ "Follow Up 2": "Sim" }), "Follow-up");
  assert.equal(gas.etapaAntiga_({}), "Primeiro contato");
});

test("valor para a célula: fórmula e sinal de mais viram texto; espaço especial vira espaço", () => {
  assert.equal(gas.valorParaCelula_("=1+1"), "'=1+1");
  assert.equal(gas.valorParaCelula_("+5561981387869"), "'+5561981387869");
  assert.equal(gas.valorParaCelula_(`R$${String.fromCharCode(160)}2.500,00`), "R$ 2.500,00");
  assert.equal(gas.valorParaCelula_(null), "");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test src/lib/planilhaGas.test.ts`
Expected: FAIL (arquivo `infra/planilha-crm/Codigo.gs` não existe).

- [ ] **Step 3: Escrever o script**

<!-- arquivo: infra/planilha-crm/Codigo.gs -->
```js
/**
 * Planilha CRM Mestra <-> sistema Gestão de Operação (Banco de leads e CRM).
 * Spec: docs/superpowers/specs/2026-10-01-banco-de-leads-design.md (repositório gestao-de-operacao).
 * Cópia versionada em infra/planilha-crm/Codigo.gs: edite lá e cole aqui (ver infra/planilha-crm/README.md).
 *
 * - Abas de leads: listas Sim/Não, cores e a coluna "ID (sistema)" oculta; cada edição vai para o sistema na hora.
 * - Aba CRM: espelho editável do CRM do sistema (o sistema vale); etapa, reunião e tentativas seguem as regras do CRM.
 * - Web App (doPost): o sistema avisa que há fila; a planilha busca e aplica.
 * - Relógio de 5 min (conferir): conferência completa.
 * Gatilhos instaláveis aoEditar, aoMudar e conferir: criados por "CRM > Preparar sincronização".
 */

var CFG = {
  EDGE: 'https://bnpvzguapunsztsdvmrs.supabase.co/functions/v1/planilha',
  FONTE: 'Poppins',
  CRM: 'CRM',
  LIXEIRA: 'CRM - lixeira',
  BACKUP: 'CRM antigo (backup)',
  RESUMO: 'Resumo',
  TIT_CHECK: 'Primeira mensagem enviada',
  TIT_VALID: 'Lead válido',
  TIT_ID: 'ID (sistema)',
  OCULTAR: ['Duplicatas removidas', 'Excluidos nesta rodada', 'Sem Instagram', 'Empresa não identificada'],
  LINHAS_CRM: 2000,
  CAB_FUNDO: '#1c2434'
};
CFG.IGNORAR = [CFG.RESUMO, CFG.CRM, CFG.LIXEIRA, CFG.BACKUP].concat(CFG.OCULTAR);

var COLUNAS_CRM = [
  'Lead', 'Empresa', 'Telefone', 'E-mail', 'Instagram', 'Aba de origem', 'Etapa', 'Na etapa desde', 'Tentativas',
  'Tentativas da proposta', 'Próximo contato', 'Reunião (data)', 'Reunião (hora)', 'Duração (min)', 'Link do Meet',
  'Situação', 'Valor da proposta', 'Valor fechado', 'Motivo', 'Orgânico/Pago', 'Nicho', 'Cidade', 'Faturamento',
  'Observações', 'Entrou no CRM', 'ID (sistema)'
];
var CRM_SO_LEITURA = ['Aba de origem', 'Na etapa desde', 'Link do Meet', 'Situação', 'Entrou no CRM', 'ID (sistema)'];
var CRM_TEXTO = [
  'Lead', 'Empresa', 'Telefone', 'E-mail', 'Instagram', 'Aba de origem', 'Etapa', 'Reunião (hora)', 'Link do Meet',
  'Situação', 'Motivo', 'Orgânico/Pago', 'Nicho', 'Cidade', 'Faturamento', 'Observações', 'ID (sistema)'
];

var VERDE = '#d9ead3', T_VERDE = '#274e13';
var VERMELHO = '#f4cccc', T_VERM = '#990000';

/* ------------------------------------------------------------------------------------------------ utilidades */

function md5_(s) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(s), Utilities.Charset.UTF_8);
  return b.map(function (x) { var h = (x & 0xff).toString(16); return h.length === 1 ? '0' + h : h; }).join('');
}

/** Igual a planilha_canonico() do banco: chaves em ordem de código, valores não vazios. */
function canonico_(dados) {
  var us = String.fromCharCode(31), rs = String.fromCharCode(30);
  return Object.keys(dados)
    .filter(function (k) { return dados[k] != null && dados[k] !== ''; })
    .sort()
    .map(function (k) { return k + us + dados[k]; })
    .join(rs);
}

function hashLinha_(dados) { return md5_(canonico_(dados)); }

/** Igual ao agregado de planilha_resumo(): id:hash:posicao em ordem de id. */
function agregado_(itens) {
  var ord = itens.slice().sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  return md5_(ord.map(function (i) { return i.id + ':' + i.hash + ':' + i.posicao; }).join(','));
}

/** Igual a chavesDosTitulos() do sistema: título aparado; repetidos ganham " (2)", " (3)". */
function chavesDe_(titulos) {
  var usados = {};
  return titulos.map(function (t) {
    t = String(t == null ? '' : t).trim();
    if (!t) return null;
    usados[t] = (usados[t] || 0) + 1;
    return usados[t] === 1 ? t : t + ' (' + usados[t] + ')';
  });
}

var ESPACOS_ESPECIAIS = new RegExp('[' + String.fromCharCode(160) + String.fromCharCode(8239) + ']', 'g');

function valorParaCelula_(v) {
  v = v == null ? '' : String(v).replace(ESPACOS_ESPECIAIS, ' ');
  return /^[=+]/.test(v) ? "'" + v : v;
}

function igualCelula_(a, b) {
  var n = function (s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); };
  return n(a) === n(b);
}

function semAcento_(s) { return String(s == null ? '' : s).normalize('NFD').replace(/\p{Diacritic}/gu, ''); }
function ehSim_(v) { return semAcento_(v).trim().toLowerCase() === 'sim'; }
function ehNao_(v) { return semAcento_(v).trim().toLowerCase() === 'nao'; }

function lotes_(arr, n) {
  var out = [];
  for (var i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function avisar_(texto) {
  try { SpreadsheetApp.getActive().toast(String(texto), 'CRM', 8); } catch (e) { console.log(texto); }
}

function colunaLetra_(n) {
  var s = '';
  while (n > 0) {
    var r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = (n - r - 1) / 26;
  }
  return s;
}

function listaSimNao_() {
  return SpreadsheetApp.newDataValidation().requireValueInList(['Sim', 'Não'], true).setAllowInvalid(false).build();
}

function horarios_() {
  var h = [];
  for (var i = 7; i <= 22; i++) ['00', '15', '30', '45'].forEach(function (m) { if (i < 22 || m === '00') h.push(('0' + i).slice(-2) + ':' + m); });
  return h;
}

/* --------------------------------------------------------------------------------------------------- ponte */

function chamar_(acao, corpo) {
  var chave = PropertiesService.getScriptProperties().getProperty('chave') || '';
  var payload = { acao: acao, planilha_id: SpreadsheetApp.getActive().getId() };
  Object.keys(corpo || {}).forEach(function (k) { payload[k] = corpo[k]; });
  var r = UrlFetchApp.fetch(CFG.EDGE, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    headers: { 'x-planilha-chave': chave },
    muteHttpExceptions: true
  });
  var codigo = r.getResponseCode();
  var j;
  try { j = JSON.parse(r.getContentText()); } catch (e) { throw new Error('Resposta inválida do sistema (' + codigo + ')'); }
  if (codigo >= 300 || j.erro) throw new Error(j.erro || ('O sistema respondeu ' + codigo));
  return j;
}

/* ------------------------------------------------------------------------------------------- abas de leads */

function titulos_(sh) {
  var n = sh.getLastColumn();
  if (n < 1) return [];
  return sh.getRange(1, 1, 1, n).getDisplayValues()[0].map(function (t) { return String(t).trim(); });
}

function ehAbaDeLeads_(sh) {
  if (CFG.IGNORAR.indexOf(sh.getName()) > -1) return false;
  return titulos_(sh).indexOf(CFG.TIT_CHECK) > -1;
}

function abasDeLeads_() {
  return SpreadsheetApp.getActive().getSheets().filter(ehAbaDeLeads_);
}

/** Coluna "ID (sistema)": acha ou cria no fim, oculta. */
function colunaId_(sh) {
  var t = titulos_(sh);
  var i = t.indexOf(CFG.TIT_ID);
  if (i > -1) return i + 1;
  var c = t.length + 1;
  if (c > sh.getMaxColumns()) sh.insertColumnAfter(sh.getMaxColumns());
  sh.getRange(1, c).setValue(CFG.TIT_ID);
  sh.hideColumns(c);
  return c;
}

/** Abas de leads com as colunas (título, posição, oculta) e os gids de todas as abas da planilha. */
function metaAbas_() {
  var todas = SpreadsheetApp.getActive().getSheets();
  var abas = [];
  todas.forEach(function (sh, ordem) {
    if (!ehAbaDeLeads_(sh)) return;
    var t = titulos_(sh);
    var cols = [];
    for (var i = 0; i < t.length; i++) if (t[i]) cols.push({ titulo: t[i], indice: i, oculta: sh.isColumnHiddenByUser(i + 1) });
    abas.push({ id: String(sh.getSheetId()), nome: sh.getName(), ordem: ordem, colunas: cols });
  });
  return { abas: abas, existentes: todas.map(function (s) { return String(s.getSheetId()); }) };
}

/** Manda as abas ao sistema se algo mudou (ou se `forcar`). Guarda as etapas do CRM para as listas da aba CRM. */
function enviarAbas_(forcar) {
  var meta = metaAbas_();
  var assinatura = md5_(JSON.stringify(meta));
  var props = PropertiesService.getDocumentProperties();
  if (!forcar && props.getProperty('abas_assinatura') === assinatura) return false;
  var r = chamar_('abas', meta);
  props.setProperty('abas_assinatura', assinatura);
  props.setProperty('abas_conhecidas', meta.abas.map(function (a) { return a.id; }).join(','));
  if (r.crm && r.crm.etapas) props.setProperty('crm_etapas', JSON.stringify(r.crm.etapas));
  return true;
}

function abaConhecida_(id) {
  var k = PropertiesService.getDocumentProperties().getProperty('abas_conhecidas') || '';
  return (',' + k + ',').indexOf(',' + id + ',') > -1;
}

/** Linhas não vazias da aba: { linha, id, dados } com os valores como aparecem na planilha. */
function lerAba_(sh) {
  var colId = colunaId_(sh);
  var titulos = titulos_(sh);
  var chaves = chavesDe_(titulos);
  var nR = sh.getLastRow(), nC = titulos.length;
  var linhas = [];
  if (nR >= 2 && nC > 0) {
    var vals = sh.getRange(2, 1, nR - 1, nC).getDisplayValues();
    for (var i = 0; i < vals.length; i++) {
      var dados = {}, vazia = true;
      for (var c = 0; c < nC; c++) {
        if (c === colId - 1 || !chaves[c]) continue;
        var v = String(vals[i][c]).trim();
        if (v !== '') { dados[chaves[c]] = v; vazia = false; }
      }
      if (!vazia) linhas.push({ linha: i + 2, id: String(vals[i][colId - 1]).trim(), dados: dados });
    }
  }
  return { sh: sh, aba_id: String(sh.getSheetId()), titulos: titulos, chaves: chaves, colId: colId, linhas: linhas };
}

/** ID novo para linha sem ID ou com ID repetido (linha copiada com a coluna oculta). `vistos`: id -> gid. */
function garantirIds_(info, vistos) {
  var nR = info.sh.getLastRow();
  if (nR < 2) return 0;
  var faixa = info.sh.getRange(2, info.colId, nR - 1, 1);
  var vals = faixa.getValues();
  var novos = 0;
  info.linhas.forEach(function (l) {
    if (!l.id || vistos[l.id]) {
      l.id = Utilities.getUuid();
      vals[l.linha - 2][0] = l.id;
      novos++;
    }
    vistos[l.id] = info.aba_id;
  });
  if (novos) faixa.setValues(vals);
  return novos;
}

function idsDeOutrasAbas_(gid) {
  var vistos = {};
  abasDeLeads_().forEach(function (sh) {
    if (String(sh.getSheetId()) === gid) return;
    var t = titulos_(sh), c = t.indexOf(CFG.TIT_ID) + 1, n = sh.getLastRow();
    if (!c || n < 2) return;
    sh.getRange(2, c, n - 1, 1).getValues().forEach(function (v) { var id = String(v[0]).trim(); if (id) vistos[id] = String(sh.getSheetId()); });
  });
  return vistos;
}

function enviarLeads_(info, linhas, carga) {
  lotes_(linhas, 300).forEach(function (lote) {
    var r = chamar_('leads', {
      carga: !!carga,
      linhas: lote.map(function (l) { return { id: l.id, aba_id: info.aba_id, posicao: l.linha, dados: l.dados }; })
    });
    aplicarOperacoes_(r.operacoes || []);
    (r.avisos || []).forEach(avisar_);
  });
}

/* ------------------------------------------------------------------------------------------ aplicar operações */

/**
 * Aplica as operações devolvidas pelo sistema. Devolve os ids de leads acrescentados nas abas de leads (o sistema
 * marca na_planilha).
 */
function aplicarOperacoes_(ops) {
  if (!ops || !ops.length) return [];
  var ss = SpreadsheetApp.getActive();
  var cache = {};
  var escritos = [];
  var remocoes = [];

  function folha(aba) {
    if (cache.hasOwnProperty(aba)) return cache[aba];
    var ehCrm = aba === 'CRM';
    var sh = ehCrm ? ss.getSheetByName(CFG.CRM) : ss.getSheets().filter(function (s) { return String(s.getSheetId()) === String(aba); })[0];
    if (!sh) return (cache[aba] = null);
    var colId = ehCrm ? titulos_(sh).indexOf(CFG.TIT_ID) + 1 : colunaId_(sh);
    if (!colId) return (cache[aba] = null);
    var t = titulos_(sh);
    var mapa = {};
    var n = sh.getLastRow();
    if (n >= 2) sh.getRange(2, colId, n - 1, 1).getValues().forEach(function (v, i) { var id = String(v[0]).trim(); if (id) mapa[id] = i + 2; });
    return (cache[aba] = { sh: sh, titulos: t, chaves: ehCrm ? t : chavesDe_(t), colId: colId, mapa: mapa, ehCrm: ehCrm });
  }

  ops.forEach(function (op) {
    if (op.tipo === 'aviso') { avisar_(op.texto); return; }
    if (op.tipo === 'lixeira') { anexarLixeira_(op.valores || {}); return; }
    if (op.tipo === 'remover') { remocoes.push(op); return; }
    if (op.tipo !== 'linha') return;
    var f = folha(op.aba);
    if (!f) return;
    var linha = f.mapa[op.id];
    if (!linha && op.linha && op.linha >= 2 && !String(f.sh.getRange(op.linha, f.colId).getValue()).trim()) linha = op.linha;
    var nova = !linha;
    if (nova) linha = Math.max(f.sh.getLastRow() + 1, 2);
    f.mapa[op.id] = linha;
    escreverLinha_(f, linha, op, nova && !op.linha);
    if (nova && !f.ehCrm) escritos.push(op.id);
  });

  remocoes
    .map(function (op) { var f = folha(op.aba); return f && f.mapa[op.id] ? { f: f, linha: f.mapa[op.id], id: op.id } : null; })
    .filter(function (x) { return x; })
    .sort(function (a, b) { return b.linha - a.linha; })
    .forEach(function (x) {
      removerLinha_(x.f.sh, x.linha);
      delete x.f.mapa[x.id];
      Object.keys(x.f.mapa).forEach(function (k) { if (x.f.mapa[k] > x.linha) x.f.mapa[k]--; });
    });
  return escritos;
}

function escreverLinha_(f, linha, op, nova) {
  var nC = f.titulos.length;
  var faixa = f.sh.getRange(linha, 1, 1, nC);
  var valores = op.valores || {};
  var tem = function (k) { return k && Object.prototype.hasOwnProperty.call(valores, k); };
  if (nova) {
    if (linha > 2) {
      var modelo = f.sh.getRange(linha - 1, 1, 1, nC);
      modelo.copyTo(faixa, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      modelo.copyTo(faixa, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
    }
    faixa.setValues([f.chaves.map(function (k, c) {
      if (c === f.colId - 1) return op.id;
      return tem(k) ? valorParaCelula_(valores[k]) : '';
    })]);
  } else {
    var atuais = faixa.getDisplayValues()[0];
    for (var c = 0; c < nC; c++) {
      var k = f.chaves[c];
      if (!k) continue;
      if (c === f.colId - 1) {
        if (!String(atuais[c]).trim()) f.sh.getRange(linha, c + 1).setValue(op.id);
        continue;
      }
      if (!tem(k) && !op.completa) continue;
      var v = tem(k) ? valores[k] : '';
      if (igualCelula_(atuais[c], v)) continue;
      f.sh.getRange(linha, c + 1).setValue(valorParaCelula_(v));
    }
  }
  if (f.ehCrm) {
    if (op.cor !== undefined) pintarLinhaCrm_(f.sh, linha, nC, op.cor);
    if (op.motivos !== undefined) validarMotivo_(f.sh, f.titulos, linha, op.motivos);
  }
}

function removerLinha_(sh, linha) {
  if (sh.getMaxRows() - sh.getFrozenRows() <= 1) sh.getRange(linha, 1, 1, sh.getMaxColumns()).clearContent();
  else sh.deleteRow(linha);
}

function pintarLinhaCrm_(sh, linha, nC, cor) {
  sh.getRange(linha, 1, 1, nC).setBackground(cor ? cor.fundo : null).setFontColor(cor ? cor.texto : null);
}

function validarMotivo_(sh, titulos, linha, motivos) {
  var c = titulos.indexOf('Motivo') + 1;
  if (!c) return;
  var celula = sh.getRange(linha, c);
  if (motivos && motivos.length) {
    celula.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(motivos, true).setAllowInvalid(true).build());
  } else {
    celula.clearDataValidations();
  }
}

function anexarLixeira_(valores) {
  var ss = SpreadsheetApp.getActive();
  var lix = ss.getSheetByName(CFG.LIXEIRA) || ss.insertSheet(CFG.LIXEIRA);
  var t = titulos_(lix);
  if (t.indexOf('Etapa') < 0) {
    t = COLUNAS_CRM.filter(function (x) { return x !== CFG.TIT_ID; });
    lix.getRange(1, 1, 1, t.length).setValues([t]).setFontWeight('bold').setBackground(CFG.CAB_FUNDO).setFontColor('#ffffff');
    lix.setFrozenRows(1);
  }
  var linha = Math.max(lix.getLastRow() + 1, 2);
  lix.getRange(linha, 1, 1, t.length).setValues([t.map(function (x) { return valorParaCelula_(valores[x]); })]);
}

/* ----------------------------------------------------------------------------------------------- gatilhos */

function aoEditar(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet();
  var r1 = e.range.getRow(), r2 = r1 + e.range.getNumRows() - 1;
  var ehCrm = sh.getName() === CFG.CRM;
  if (!ehCrm && !ehAbaDeLeads_(sh)) return;
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) { if (ehCrm) marcarPendenteCrm_(sh, r1, r2); return; }
  try {
    if (r1 === 1) {
      if (!ehCrm) enviarAbas_(true);
      if (r2 < 2) return;
      r1 = 2;
    }
    if (ehCrm) editarCrm_(sh, r1, r2);
    else editarLeads_(sh, r1, r2);
    aplicarFila_();
  } catch (err) {
    if (ehCrm) marcarPendenteCrm_(sh, r1, r2);
    avisar_('Não sincronizou agora: ' + err.message + '. A conferência tenta de novo em até 5 min.');
  } finally {
    lock.releaseLock();
  }
}

function editarLeads_(sh, r1, r2) {
  var info = lerAba_(sh);
  var novos = garantirIds_(info, idsDeOutrasAbas_(info.aba_id));
  if (novos || !abaConhecida_(info.aba_id)) enviarAbas_(false);
  var alvo = info.linhas.filter(function (l) { return l.linha >= r1 && l.linha <= r2; });
  if (alvo.length) enviarLeads_(info, alvo, false);
}

function linhasCrm_(sh, r1, r2) {
  var t = titulos_(sh);
  var cId = t.indexOf(CFG.TIT_ID);
  var vals = sh.getRange(r1, 1, r2 - r1 + 1, t.length).getDisplayValues();
  var linhas = [];
  for (var i = 0; i < vals.length; i++) {
    var valores = {}, temAlgo = false;
    for (var c = 0; c < t.length; c++) {
      if (!t[c]) continue;
      valores[t[c]] = String(vals[i][c]).trim();
      if (c !== cId && valores[t[c]]) temAlgo = true;
    }
    var id = cId > -1 ? valores[CFG.TIT_ID] : '';
    if (!temAlgo) continue; // linha vazia (ou esvaziada): a conferência devolve o lead, se houver
    linhas.push({ id: id || null, linha: r1 + i, valores: valores });
  }
  return linhas;
}

function editarCrm_(sh, r1, r2) {
  lotes_(linhasCrm_(sh, r1, r2), 40).forEach(function (lote) {
    var r = chamar_('crm', { linhas: lote });
    aplicarOperacoes_(r.operacoes || []);
    (r.avisos || []).forEach(avisar_);
  });
}

function marcarPendenteCrm_(sh, r1, r2) {
  try {
    var t = titulos_(sh), c = t.indexOf(CFG.TIT_ID) + 1;
    if (!c) return;
    var props = PropertiesService.getDocumentProperties();
    var lista = JSON.parse(props.getProperty('crm_pendentes') || '[]');
    sh.getRange(r1, c, r2 - r1 + 1, 1).getValues().forEach(function (v) {
      var id = String(v[0]).trim();
      if (id && lista.indexOf(id) < 0) lista.push(id);
    });
    props.setProperty('crm_pendentes', JSON.stringify(lista.slice(-200)));
  } catch (e) { console.log('marcarPendenteCrm_: ' + e); }
}

/** Reenvia as linhas da aba CRM cuja edição não chegou ao sistema. */
function retentarCrm_() {
  var props = PropertiesService.getDocumentProperties();
  var lista = JSON.parse(props.getProperty('crm_pendentes') || '[]');
  if (!lista.length) return;
  var sh = SpreadsheetApp.getActive().getSheetByName(CFG.CRM);
  var t = titulos_(sh), c = t.indexOf(CFG.TIT_ID) + 1, n = sh.getLastRow();
  if (c && n >= 2) {
    var ids = sh.getRange(2, c, n - 1, 1).getValues().map(function (v) { return String(v[0]).trim(); });
    var linhas = [];
    lista.forEach(function (id) { var i = ids.indexOf(id); if (i > -1) linhas = linhas.concat(linhasCrm_(sh, i + 2, i + 2)); });
    if (linhas.length) {
      var r = chamar_('crm', { linhas: linhas });
      aplicarOperacoes_(r.operacoes || []);
    }
  }
  props.deleteProperty('crm_pendentes');
}

function aoMudar(e) {
  var tipo = e && e.changeType;
  if (['INSERT_COLUMN', 'REMOVE_ROW', 'REMOVE_COLUMN', 'INSERT_GRID', 'REMOVE_GRID', 'OTHER'].indexOf(tipo) < 0) return;
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) return;
  try {
    var sh = SpreadsheetApp.getActive().getActiveSheet();
    if (tipo !== 'REMOVE_ROW') enviarAbas_(false);
    if (sh && sh.getName() === CFG.CRM) {
      if (tipo === 'REMOVE_ROW') {
        avisar_('Apagar a linha não tira o lead do CRM: ela volta. Para tirar, marque Não em "Primeira mensagem enviada" na aba de origem ou exclua no sistema.');
        reescreverCrm_();
      }
      return;
    }
    if (sh && ehAbaDeLeads_(sh)) conferirLeads_(chamar_('conferir', {}).resumo.abas || [], [sh]);
  } catch (err) {
    avisar_('Não sincronizou agora: ' + err.message);
  } finally {
    lock.releaseLock();
  }
}

/** O sistema avisa que há fila: busca e aplica (e olha de novo depois de 3,5 s, para o que chegou junto). */
function doPost(e) {
  var lock = LockService.getDocumentLock();
  if (lock.tryLock(30000)) {
    try {
      aplicarFila_();
      Utilities.sleep(3500);
      aplicarFila_();
    } catch (err) {
      console.error('doPost: ' + err);
    } finally {
      lock.releaseLock();
    }
  }
  return ContentService.createTextOutput('ok');
}

function doGet() {
  return ContentService.createTextOutput('Planilha CRM: ponte com o sistema no ar.');
}

function aplicarFila_() {
  for (var volta = 0; volta < 20; volta++) {
    var r = chamar_('fila', {});
    var ids = r.fila_ids || [];
    if (!ids.length) return;
    var escritos = aplicarOperacoes_(r.operacoes || []);
    chamar_('fila_ok', { fila_ids: ids, escritos: escritos });
  }
}

/* --------------------------------------------------------------------------------------------- conferência */

function conferir() {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(60000)) return;
  try { conferir_(); } finally { lock.releaseLock(); }
}

function conferir_() {
  var erro = null;
  try {
    retentarCrm_();
    aplicarFila_();
    enviarAbas_(false);
    var resumo = chamar_('conferir', {}).resumo || {};
    conferirLeads_(resumo.abas || [], null);
    var props = PropertiesService.getDocumentProperties();
    if (props.getProperty('crm_fp') !== resumo.crm || contarIdsCrm_() !== resumo.crm_n) reescreverCrm_();
  } catch (e) {
    erro = e && e.message ? e.message : String(e);
    console.error(e);
  }
  try { chamar_('conferencia_fim', { ok: !erro, erro: erro }); } catch (e2) { console.error(e2); }
  return erro;
}

/** Abas de leads: a planilha vale. `so` limita a algumas abas (os IDs de todas entram na conta de repetidos). */
function conferirLeads_(resumoAbas, so) {
  var infos = abasDeLeads_().map(lerAba_);
  var vistos = {};
  var novos = 0;
  infos.forEach(function (info) { novos += garantirIds_(info, vistos); });
  if (novos) enviarAbas_(false);
  var porId = {};
  resumoAbas.forEach(function (a) { porId[a.id] = a; });
  var ids = so ? so.map(function (s) { return String(s.getSheetId()); }) : null;
  infos.forEach(function (info) {
    if (ids && ids.indexOf(info.aba_id) < 0) return;
    var itens = info.linhas.map(function (l) { return { id: l.id, hash: hashLinha_(l.dados), posicao: l.linha }; });
    var srv = porId[info.aba_id];
    if (srv && srv.n === itens.length && srv.agg === agregado_(itens)) return;
    var det = chamar_('aba_detalhe', { aba_id: info.aba_id }).leads || [];
    var noBanco = {};
    det.forEach(function (d) { noBanco[d.id] = d; });
    var enviar = info.linhas.filter(function (l, i) {
      var d = noBanco[l.id];
      return !d || d.hash !== itens[i].hash || d.posicao !== l.linha;
    });
    if (enviar.length) enviarLeads_(info, enviar, false);
    var apagar = [], trazer = [];
    det.forEach(function (d) {
      if (vistos[d.id]) return;
      if (d.na_planilha) apagar.push(d.id); else trazer.push(d.id);
    });
    if (apagar.length) aplicarOperacoes_(chamar_('excluir_leads', { ids: apagar }).operacoes || []);
    if (trazer.length) {
      var escritos = aplicarOperacoes_(chamar_('linhas', { leads: trazer }).operacoes || []);
      if (escritos.length) chamar_('fila_ok', { fila_ids: [], escritos: escritos });
    }
  });
}

function contarIdsCrm_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(CFG.CRM);
  if (!sh) return -1;
  var c = titulos_(sh).indexOf(CFG.TIT_ID) + 1, n = sh.getLastRow();
  if (!c || n < 2) return 0;
  return sh.getRange(2, c, n - 1, 1).getValues().filter(function (v) { return String(v[0]).trim(); }).length;
}

/** Aba CRM: o sistema vale. Reescreve as células diferentes, acrescenta o que falta e tira o que sobrou. */
function reescreverCrm_() {
  var r = chamar_('linhas', { crm_todos: true });
  aplicarOperacoes_(r.operacoes || []);
  var sh = SpreadsheetApp.getActive().getSheetByName(CFG.CRM);
  var c = titulos_(sh).indexOf(CFG.TIT_ID) + 1, n = sh.getLastRow();
  if (c && n >= 2) {
    var vivos = {};
    (r.ids || []).forEach(function (id) { vivos[id] = true; });
    var sobras = [];
    sh.getRange(2, c, n - 1, 1).getValues().forEach(function (v) {
      var id = String(v[0]).trim();
      if (id && !vivos[id]) sobras.push({ tipo: 'remover', aba: 'CRM', id: id });
    });
    aplicarOperacoes_(sobras);
  }
  PropertiesService.getDocumentProperties().setProperty('crm_fp', r.fp || '');
}

/* ------------------------------------------------------------------------------------------ menu e ajustes */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('CRM')
    .addItem('Configurar planilha', 'configurar')
    .addItem('Sincronizar agora', 'sincronizarAgora')
    .addSeparator()
    .addItem('Mostrar abas de apoio', 'mostrarApoio')
    .addItem('Preparar sincronização (uso único)', 'prepararSincronizacao')
    .addToUi();
}

function sincronizarAgora() {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(60000)) { SpreadsheetApp.getUi().alert('Outra sincronização está rodando. Tente de novo em 1 minuto.'); return; }
  var erro;
  try { erro = conferir_(); } finally { lock.releaseLock(); }
  SpreadsheetApp.getUi().alert(erro ? 'A conferência encontrou um problema: ' + erro : 'Planilha e sistema conferidos.');
}

function mostrarApoio() {
  var ss = SpreadsheetApp.getActive();
  CFG.OCULTAR.forEach(function (n) { var sh = ss.getSheetByName(n); if (sh) sh.showSheet(); });
}

/** Fonte, abas de apoio ocultas, listas, cores e a aba CRM. Pode rodar quantas vezes quiser. */
function configurar() {
  var ss = SpreadsheetApp.getActive();
  ss.getSheets().forEach(function (sh) {
    sh.getRange(1, 1, Math.max(sh.getMaxRows(), 1), Math.max(sh.getMaxColumns(), 1)).setFontFamily(CFG.FONTE);
  });
  CFG.OCULTAR.forEach(function (n) { var sh = ss.getSheetByName(n); if (sh) sh.hideSheet(); });
  var abas = [];
  abasDeLeads_().forEach(function (sh) { configurarAbaLeads_(sh); abas.push(sh.getName()); });
  var crm = ss.getSheetByName(CFG.CRM);
  if (crm && titulos_(crm).indexOf(CFG.TIT_ID) > -1) configurarCrm_(crm);
  SpreadsheetApp.getUi().alert('Planilha configurada.\n\nAbas de leads (' + abas.length + '):\n' + abas.join('\n'));
}

function configurarAbaLeads_(sh) {
  var colId = colunaId_(sh);
  var t = titulos_(sh);
  var cCheck = t.indexOf(CFG.TIT_CHECK) + 1, cValid = t.indexOf(CFG.TIT_VALID) + 1;
  var n = sh.getLastRow() - 1;
  if (n >= 1) {
    [[cCheck, 'Não'], [cValid, 'Sim']].forEach(function (p) {
      if (p[0] < 1) return;
      var rg = sh.getRange(2, p[0], n, 1);
      rg.setDataValidation(listaSimNao_()).setHorizontalAlignment('center');
      var vals = rg.getValues();
      var mudou = false;
      vals.forEach(function (v) { if (String(v[0]).trim() === '') { v[0] = p[1]; mudou = true; } });
      if (mudou) rg.setValues(vals);
    });
    var alvo = sh.getRange(2, 1, n, sh.getLastColumn());
    var regras = [];
    if (cValid > 0) {
      regras.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$' + colunaLetra_(cValid) + '2="Não"')
        .setBackground(VERMELHO).setFontColor(T_VERM).setRanges([alvo]).build());
    }
    if (cCheck > 0) {
      regras.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$' + colunaLetra_(cCheck) + '2="Sim"')
        .setBackground(VERDE).setFontColor(T_VERDE).setRanges([alvo]).build());
    }
    sh.setConditionalFormatRules(regras);
  }
  sh.setFrozenRows(1);
  sh.hideColumns(colId);
}

function configurarCrm_(sh) {
  var t = titulos_(sh);
  var n = CFG.LINHAS_CRM;
  if (sh.getMaxRows() < n) sh.insertRowsAfter(sh.getMaxRows(), n - sh.getMaxRows());
  sh.setFrozenRows(1);
  sh.setFrozenColumns(1);
  sh.getRange(1, 1, 1, t.length).setFontWeight('bold').setBackground(CFG.CAB_FUNDO).setFontColor('#ffffff')
    .setVerticalAlignment('middle').setWrap(true);
  var col = function (x) { return t.indexOf(x) + 1; };
  var faixa = function (x) { return sh.getRange(2, col(x), n - 1, 1); };
  var formato = function (lista, f) { lista.forEach(function (x) { if (col(x)) faixa(x).setNumberFormat(f); }); };
  formato(CRM_TEXTO, '@');
  formato(['Reunião (data)', 'Entrou no CRM'], 'dd/MM/yyyy');
  formato(['Na etapa desde', 'Próximo contato'], 'dd/MM/yyyy HH:mm');
  formato(['Valor da proposta', 'Valor fechado'], '"R$" #,##0.00');
  formato(['Tentativas', 'Tentativas da proposta', 'Duração (min)'], '0');
  var lista = function (itens, invalido) {
    return SpreadsheetApp.newDataValidation().requireValueInList(itens, true).setAllowInvalid(invalido).build();
  };
  var etapas = JSON.parse(PropertiesService.getDocumentProperties().getProperty('crm_etapas') || '[]')
    .map(function (e) { return e.titulo; });
  if (etapas.length && col('Etapa')) faixa('Etapa').setDataValidation(lista(etapas, false));
  if (col('Orgânico/Pago')) faixa('Orgânico/Pago').setDataValidation(lista(['Orgânico', 'Pago'], false));
  if (col('Duração (min)')) faixa('Duração (min)').setDataValidation(lista(['15', '30', '45', '60', '90'], true));
  if (col('Reunião (hora)')) faixa('Reunião (hora)').setDataValidation(lista(horarios_(), true));
  if (col('Reunião (data)')) {
    faixa('Reunião (data)').setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build());
  }
  CRM_SO_LEITURA.forEach(function (x) {
    if (col(x)) sh.getRange(1, col(x)).setBackground('#4b5563').setNote('Preenchido pelo sistema: editar aqui não muda nada.');
  });
  if (col(CFG.TIT_ID)) sh.hideColumns(col(CFG.TIT_ID));
}

/* ------------------------------------------------------------------------------------- preparação (uso único) */

function prepararSincronizacao() {
  var ui = SpreadsheetApp.getUi();
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(60000)) { ui.alert('Outra sincronização está rodando. Tente de novo em 1 minuto.'); return; }
  try {
    ui.alert(preparar_());
  } catch (e) {
    ui.alert('A preparação parou: ' + e.message + '\n\nRode de novo: ela continua de onde parou.');
  } finally {
    lock.releaseLock();
  }
}

/** Etapas idempotentes (guardadas em "preparo"): registrar, IDs, carga, CRM antigo, lixeira, gatilhos. */
function preparar_() {
  var props = PropertiesService.getDocumentProperties();
  var etapa = Number(props.getProperty('preparo') || 0);
  var msgs = [];
  if (etapa < 1) {
    registrar_();
    props.setProperty('preparo', '1');
    msgs.push('Planilha registrada no sistema.');
  }
  if (etapa < 2) {
    var vistos = {};
    abasDeLeads_().forEach(function (sh) { garantirIds_(lerAba_(sh), vistos); });
    enviarAbas_(true);
    props.setProperty('preparo', '2');
    msgs.push('Coluna ID criada nas abas de leads.');
  }
  if (etapa < 3) {
    var total = 0;
    abasDeLeads_().forEach(function (sh) { var info = lerAba_(sh); enviarLeads_(info, info.linhas, true); total += info.linhas.length; });
    props.setProperty('preparo', '3');
    msgs.push(total + ' leads enviados ao sistema.');
  }
  if (etapa < 4) {
    msgs.push(migrarCrmAntigo_());
    props.setProperty('preparo', '4');
  }
  if (etapa < 5) {
    converterLixeira_();
    props.setProperty('preparo', '5');
    msgs.push('Lixeira convertida.');
  }
  if (etapa < 6) {
    instalarGatilhos_();
    props.setProperty('preparo', '6');
    msgs.push('Gatilhos instalados (edição, mudança e conferência a cada 5 min).');
  }
  var erro = conferir_();
  msgs.push(erro ? 'Conferência: ' + erro : 'Conferência ok.');
  return msgs.join('\n');
}

function registrar_() {
  var props = PropertiesService.getScriptProperties();
  var chave = props.getProperty('chave');
  if (!chave) {
    chave = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('chave', chave);
  }
  return chamar_('registrar', { chave: chave });
}

function migrarCrmAntigo_() {
  var ss = SpreadsheetApp.getActive();
  var crm = ss.getSheetByName(CFG.CRM) || ss.insertSheet(CFG.CRM);
  var t = titulos_(crm);
  var msg = 'A aba CRM já estava no formato novo.';
  if (t.indexOf(CFG.TIT_ID) < 0) {
    var linhas = [];
    var n = crm.getLastRow();
    if (n >= 2 && t.length) {
      crm.getRange(2, 1, n - 1, t.length).getDisplayValues().forEach(function (row) {
        var o = {}, tem = false;
        t.forEach(function (x, i) { if (x) { o[x] = String(row[i]).trim(); if (o[x]) tem = true; } });
        if (tem) linhas.push(o);
      });
    }
    var r = linhas.length ? chamar_('importar_crm_antigo', { linhas: linhas }) : { criados: 0, ligados: 0, pulados: 0, avisos: [] };
    msg = 'CRM antigo: ' + r.criados + ' leads criados no sistema, ' + r.ligados + ' ligados à aba de origem, ' + r.pulados +
      ' pulados.' + (r.avisos && r.avisos.length ? '\n' + r.avisos.join('\n') : '');
    if (!ss.getSheetByName(CFG.BACKUP)) crm.copyTo(ss).setName(CFG.BACKUP).hideSheet();
    crm.showColumns(1, crm.getMaxColumns());
    crm.getRange(1, 1, crm.getMaxRows(), crm.getMaxColumns()).clearDataValidations().clearNote();
    crm.clear();
    crm.setConditionalFormatRules([]);
    if (crm.getMaxColumns() < COLUNAS_CRM.length) crm.insertColumnsAfter(crm.getMaxColumns(), COLUNAS_CRM.length - crm.getMaxColumns());
    crm.getRange(1, 1, 1, COLUNAS_CRM.length).setValues([COLUNAS_CRM]);
  }
  configurarCrm_(crm);
  reescreverCrm_();
  return msg;
}

function etapaAntiga_(o) {
  if (ehSim_(o['Lead Fechado'])) return 'Fechamento';
  if (ehSim_(o['Lead Perdido'])) return 'Lead perdido';
  if (ehSim_(o['Reunião Agendada'])) return 'Reunião marcada';
  if (ehSim_(o['Desenvolvendo conversa'])) return 'Desenvolvendo conversa';
  if (ehSim_(o['Lead respondeu'])) return 'Respondeu';
  for (var i = 7; i >= 1; i--) if (ehSim_(o['Follow Up ' + i])) return 'Follow-up';
  return 'Primeiro contato';
}

function valorLixeiraAntiga_(o, titulo) {
  switch (titulo) {
    case 'Lead': return o['Lead'] || '';
    case 'Empresa': return o['Empresa'] || '';
    case 'Telefone': return o['Telefone'] || '';
    case 'Instagram': return o['Instagram'] || '';
    case 'Nicho': return o['Nicho'] || '';
    case 'Observações': return o['Observações'] || '';
    case 'Faturamento': return o['Faturamento mensal'] || '';
    case 'Etapa': return etapaAntiga_(o);
    case 'Reunião (data)': return o['Data da reunião'] || '';
    case 'Reunião (hora)': return o['Hora da reunião'] || '';
    case 'Entrou no CRM': return o['Data 1ª mensagem'] || '';
    case 'Aba de origem': return '(CRM antigo)';
    default: return '';
  }
}

function converterLixeira_() {
  var ss = SpreadsheetApp.getActive();
  var lix = ss.getSheetByName(CFG.LIXEIRA) || ss.insertSheet(CFG.LIXEIRA);
  var t = titulos_(lix);
  if (t.indexOf('Etapa') > -1) return;
  var novos = COLUNAS_CRM.filter(function (x) { return x !== CFG.TIT_ID; });
  var linhas = [];
  var n = lix.getLastRow();
  if (n >= 2 && t.length) {
    lix.getRange(2, 1, n - 1, t.length).getDisplayValues().forEach(function (row) {
      var o = {};
      t.forEach(function (x, i) { o[x] = String(row[i]).trim(); });
      if (!o['Lead'] && !o['Empresa']) return;
      linhas.push(novos.map(function (x) { return valorParaCelula_(valorLixeiraAntiga_(o, x)); }));
    });
  }
  lix.getRange(1, 1, lix.getMaxRows(), lix.getMaxColumns()).clearDataValidations();
  lix.clear();
  lix.setConditionalFormatRules([]);
  if (lix.getMaxColumns() < novos.length) lix.insertColumnsAfter(lix.getMaxColumns(), novos.length - lix.getMaxColumns());
  lix.getRange(1, 1, 1, novos.length).setValues([novos]).setFontWeight('bold').setBackground(CFG.CAB_FUNDO).setFontColor('#ffffff');
  if (linhas.length) lix.getRange(2, 1, linhas.length, novos.length).setValues(linhas);
  lix.setFrozenRows(1);
}

function instalarGatilhos_() {
  var ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['aoEditar', 'aoMudar', 'conferir'].indexOf(t.getHandlerFunction()) > -1) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('aoEditar').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('aoMudar').forSpreadsheet(ss).onChange().create();
  ScriptApp.newTrigger('conferir').timeBased().everyMinutes(5).create();
}
```

- [ ] **Step 4: README do script**

<!-- arquivo: infra/planilha-crm/README.md -->
```markdown
# Apps Script da "Planilha CRM Mestra"

Ponte entre a planilha de leads e o sistema (spec `docs/superpowers/specs/2026-10-01-banco-de-leads-design.md`).

- Planilha: `176k4WPiMeOU1Va8AxSCsGdpzkA1F0lST0m4mbXQrZak` (dona: contato@andrelopes.digital)
- Script ligado: `1xDQ4rcAWhkAQ7dkzH8HXxeuInC0Jg_BmzotPEadz2-R_w3H9DYRKeel0`, arquivo único `Código.gs`
- Edge function: `planilha` (`supabase/functions/planilha`)

## Publicar uma mudança

1. Editar `Codigo.gs` aqui e rodar `node --test src/lib/planilhaGas.test.ts`.
2. Abrir o editor (Extensões > Apps Script na planilha) e colar o arquivo inteiro em `Código.gs` (Ctrl+S).
   O `clasp` desta máquina pede novo login (`invalid_rapt`); colar no editor dispensa.
3. Se mudou `doPost`: Implantar > Gerenciar implantações > editar a implantação "Ponte com o sistema" > Nova versão.
   A URL `/exec` não muda.

## Peças

- Gatilhos instaláveis (criados por CRM > Preparar sincronização): `aoEditar` (edição), `aoMudar` (estrutura),
  `conferir` (a cada 5 min).
- Web App (executa como contato@, acesso "Qualquer pessoa"): o banco avisa por pg_net que há fila; o `doPost` busca
  na edge function e aplica. Quem chama não manda em nada.
- Propriedades: `chave` (script, senha da ponte, nunca exibida); `preparo`, `abas_assinatura`, `abas_conhecidas`,
  `crm_etapas`, `crm_fp`, `crm_pendentes` (documento).
- A URL do Web App fica em `planilha_config.webapp_url` (gravada pelo editor SQL).
```

- [ ] **Step 5: Rodar o teste**

Run: `node --test src/lib/planilhaGas.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add infra/planilha-crm src/lib/planilhaGas.test.ts
git commit -m "Banco de leads: Apps Script da planilha (gatilhos, fila, conferência, aba CRM nova e preparação)"
```

---

### Task 7: dados do Banco de leads no front

**Files:**
- Create: `src/lib/bancoLeadsDados.ts`, `src/components/crm/banco/useBancoLeads.ts`, `src/components/crm/useCrmTempoReal.ts`

**Interfaces:**
- Consumes: tabelas e RPCs da Task 4; tipos da Task 1.
- Produces: `StatusPlanilha`, `carregarAbasBanco()`, `carregarLeadsBanco()`, `statusPlanilha()`,
  `definirCampoBanco(id, chave, valor)`, `ligarAoCrm(id, crmId, chave, valor)`, `criarLeadBanco(abaId, dados, posicao)`,
  `excluirLeadsBanco(ids)`; hook `useBancoLeads()` → `{ abas, leads, setLeads, status, carregando, erro, recarregar }`;
  hook `useCrmTempoReal()`.

- [ ] **Step 1: Leitura e gravação**

<!-- arquivo: src/lib/bancoLeadsDados.ts -->
```ts
// Banco de leads no front: leitura e gravação no banco. A planilha recebe cada mudança pelo Apps Script
// (gatilhos do banco → fila → Web App). Spec docs/superpowers/specs/2026-10-01-banco-de-leads-design.md §8.2.
import { supabase } from "@/integrations/supabase/client";
import type { AbaBanco, LeadBanco } from "@/lib/bancoLeads";

// Tabelas novas ainda não estão em types.ts
const db = supabase as any;
const PAGINA = 1000;
const CAMPOS = "id, aba_id, posicao, dados, lead_crm_id, updated_at";

export interface StatusPlanilha {
  planilha_id: string | null;
  ultima_conferencia_em: string | null;
  ok: boolean | null;
  erro: string | null;
  conectada: boolean;
}

export async function carregarAbasBanco(): Promise<AbaBanco[]> {
  const { data, error } = await db.from("banco_leads_abas").select("*").eq("ativa", true).order("ordem");
  if (error) throw error;
  return (data ?? []) as AbaBanco[];
}

/** Todos os leads (de 1000 em 1000, limite do PostgREST). */
export async function carregarLeadsBanco(): Promise<LeadBanco[]> {
  const out: LeadBanco[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await db.from("banco_leads").select(CAMPOS).order("aba_id").order("posicao").order("id").range(de, de + PAGINA - 1);
    if (error) throw error;
    out.push(...((data ?? []) as LeadBanco[]));
    if (!data || data.length < PAGINA) return out;
  }
}

export async function statusPlanilha(): Promise<StatusPlanilha | null> {
  const { data, error } = await db.rpc("planilha_status");
  if (error) throw error;
  return (data ?? null) as StatusPlanilha | null;
}

/** Um campo por vez (sem sobrescrever o resto da linha); vazio apaga o campo. */
export async function definirCampoBanco(id: string, chave: string, valor: string): Promise<void> {
  const { error } = await db.rpc("banco_leads_definir", { p_id: id, p_chave: chave, p_valor: valor });
  if (error) throw error;
}

/** Liga a linha ao lead do CRM e grava "Primeira mensagem enviada" na mesma gravação. */
export async function ligarAoCrm(id: string, crmId: string | null, chave: string | null, valor: string): Promise<void> {
  const { error } = await db.rpc("banco_leads_ligar", { p_id: id, p_crm: crmId, p_chave: chave, p_valor: valor });
  if (error) throw error;
}

export async function criarLeadBanco(abaId: string, dados: Record<string, string>, posicao: number): Promise<LeadBanco> {
  const { data, error } = await db.from("banco_leads").insert({ aba_id: abaId, posicao, dados, na_planilha: false }).select(CAMPOS).single();
  if (error) throw error;
  return data as LeadBanco;
}

export async function excluirLeadsBanco(ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 150) {
    const { error } = await db.from("banco_leads").delete().in("id", ids.slice(i, i + 150));
    if (error) throw error;
  }
}
```

- [ ] **Step 2: Hook com Realtime**

<!-- arquivo: src/components/crm/banco/useBancoLeads.ts -->
```ts
// Estado do Banco de leads: abas, leads e estado da sincronização, com Realtime (o que muda na planilha aparece
// sozinho).
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AbaBanco, LeadBanco } from "@/lib/bancoLeads";
import { carregarAbasBanco, carregarLeadsBanco, statusPlanilha, type StatusPlanilha } from "@/lib/bancoLeadsDados";

function doPayload(n: any): LeadBanco {
  return { id: n.id, aba_id: n.aba_id, posicao: n.posicao, dados: n.dados ?? {}, lead_crm_id: n.lead_crm_id ?? null, updated_at: n.updated_at };
}

export function useBancoLeads() {
  const [abas, setAbas] = useState<AbaBanco[]>([]);
  const [leads, setLeads] = useState<LeadBanco[]>([]);
  const [status, setStatus] = useState<StatusPlanilha | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    try {
      const [a, l, s] = await Promise.all([carregarAbasBanco(), carregarLeadsBanco(), statusPlanilha().catch(() => null)]);
      setAbas(a);
      setLeads(l);
      setStatus(s);
      setErro(null);
    } catch (e: any) {
      setErro(e?.message ?? String(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void recarregar();
    const canal = supabase
      .channel("banco-leads")
      .on("postgres_changes", { event: "*", schema: "public", table: "banco_leads" }, (p: any) => {
        if (p.eventType === "DELETE") {
          const id = p.old?.id;
          if (id) setLeads((prev) => prev.filter((l) => l.id !== id));
          return;
        }
        if (!p.new?.id) return;
        const novo = doPayload(p.new);
        setLeads((prev) => {
          const i = prev.findIndex((l) => l.id === novo.id);
          if (i < 0) return [...prev, novo];
          const copia = prev.slice();
          copia[i] = novo;
          return copia;
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "banco_leads_abas" }, () => {
        void carregarAbasBanco().then(setAbas).catch(() => {});
      })
      .subscribe();
    const relogio = window.setInterval(() => {
      void statusPlanilha().then(setStatus).catch(() => {});
    }, 60_000);
    return () => {
      window.clearInterval(relogio);
      void supabase.removeChannel(canal);
    };
  }, [recarregar]);

  return { abas, leads, setLeads, status, carregando, erro, recarregar };
}
```

- [ ] **Step 3: Escuta do CRM**

<!-- arquivo: src/components/crm/useCrmTempoReal.ts -->
```ts
// O CRM se atualiza sozinho quando um lead muda fora desta tela (pela planilha, por exemplo): escuta `prospeccao` e
// `crm_eventos` e recarrega com 1 s de espera, juntando avisos em rajada. Spec 2026-10-01-banco-de-leads §8.1.
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCrm } from "@/components/crm/CrmContexto";

export function useCrmTempoReal() {
  const { recarregar } = useCrm();
  const ref = useRef(recarregar);
  ref.current = recarregar;
  useEffect(() => {
    let espera: number | undefined;
    const agendar = () => {
      window.clearTimeout(espera);
      espera = window.setTimeout(() => void ref.current(), 1000);
    };
    const canal = supabase
      .channel("crm-tempo-real")
      .on("postgres_changes", { event: "*", schema: "public", table: "prospeccao" }, agendar)
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_eventos" }, agendar)
      .subscribe();
    return () => {
      window.clearTimeout(espera);
      void supabase.removeChannel(canal);
    };
  }, []);
}
```

- [ ] **Step 4: Tipos**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros novos.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bancoLeadsDados.ts src/components/crm/banco/useBancoLeads.ts src/components/crm/useCrmTempoReal.ts
git commit -m "Banco de leads: leitura e gravação no front, Realtime do banco e escuta do CRM"
```

---

### Task 8: telas do Banco de leads e os dois toques no CRM

**Files:**
- Create: `src/components/crm/banco/{BancoLeads.tsx, BancoTabela.tsx, BancoFicha.tsx, BancoNovoLead.tsx, BancoSelecaoBarra.tsx}`
- Modify: `src/components/crm/CrmTopo.tsx`, `src/routes/_authenticated/crm.tsx`

**Interfaces:**
- Consumes: Tasks 1 e 7; `useCrm()` (`colunas`, `leads`, `colunaDoLead`, `excluirLeads`, `recarregar`, `abrirFicha`);
  `crmDados.criarLead(dados, coluna)` e `crmDados.atualizarLead(id, patch)`.
- Produces: `<BancoLeads onAbrirNoCrm={(crmId) => …} />`; `VisaoCrm` com `"banco"`.

- [ ] **Step 1: Tabela**

<!-- arquivo: src/components/crm/banco/BancoTabela.tsx -->
```tsx
// Tabela do Banco de leads: colunas visíveis da aba (ou as comuns em "Todas"), nome fixo à esquerda, edição na
// célula, cores da planilha (verde = no CRM, vermelho = inválido) e seleção em massa. Spec §8.2.
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  colunasVisiveis,
  compararTexto,
  ehNao,
  ehSim,
  ehValido,
  linkDoTexto,
  linkInstagram,
  NAO,
  nomeDoLead,
  SIM,
  valorDoPapel,
  type AbaBanco,
  type LeadBanco,
  type Papel,
} from "@/lib/bancoLeads";
import { linkWhatsapp } from "@/lib/crmWhatsapp";
import { cn } from "@/lib/utils";

const POR_VEZ = 200;

interface ColunaTabela {
  chave: string;
  titulo: string;
  papel: Papel | null;
  valor: (l: LeadBanco) => string;
  editavel: boolean;
}

function colunasDaTabela(aba: AbaBanco | null, abasPorId: Map<string, AbaBanco>): ColunaTabela[] {
  if (aba) {
    return colunasVisiveis(aba)
      .filter((c) => c.papel !== "nome")
      .map((c) => ({ chave: c.chave, titulo: c.titulo, papel: c.papel, valor: (l) => l.dados[c.chave] ?? "", editavel: true }));
  }
  const de = (l: LeadBanco) => abasPorId.get(l.aba_id);
  return [
    { chave: "_empresa", titulo: "Empresa", papel: "empresa", valor: (l) => valorDoPapel(l, de(l), "empresa"), editavel: false },
    { chave: "_telefone", titulo: "Telefone", papel: "telefone", valor: (l) => valorDoPapel(l, de(l), "telefone"), editavel: false },
    { chave: "_instagram", titulo: "Instagram", papel: "instagram", valor: (l) => valorDoPapel(l, de(l), "instagram"), editavel: false },
    { chave: "_aba", titulo: "Aba", papel: null, valor: (l) => de(l)?.nome ?? "", editavel: false },
    { chave: "_valido", titulo: "Lead válido", papel: null, valor: (l) => (ehValido(l, de(l)) ? SIM : NAO), editavel: false },
    { chave: "_crm", titulo: "No CRM", papel: null, valor: (l) => (l.lead_crm_id ? SIM : NAO), editavel: false },
  ];
}

/** Célula de texto: clique para editar; Enter salva, Esc cancela, sair do campo salva. */
function CelulaEditavel({ valor, onSalvar }: { valor: string; onSalvar: (v: string) => void }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor);
  useEffect(() => {
    if (!editando) setTexto(valor);
  }, [valor, editando]);
  if (editando) {
    return (
      <input
        autoFocus
        aria-label="Editar valor"
        className="h-7 w-full min-w-[9rem] rounded border bg-background px-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/40"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setTexto(valor);
            setEditando(false);
          }
        }}
        onBlur={() => {
          setEditando(false);
          if (texto.trim() !== valor.trim()) onSalvar(texto);
        }}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditando(true)}
      title={valor || "Clique para preencher"}
      className="-mx-1 block min-h-6 w-full max-w-[16rem] truncate rounded px-1 text-left hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {valor || <span className="text-muted-foreground/40">—</span>}
    </button>
  );
}

function SimNao({ valor, rotulo, onMudar }: { valor: string; rotulo: string; onMudar: (v: string) => void }) {
  const conhecido = ehSim(valor) || ehNao(valor);
  const atual = ehSim(valor) ? SIM : ehNao(valor) ? NAO : valor;
  return (
    <select
      aria-label={rotulo}
      value={atual}
      onChange={(e) => onMudar(e.target.value)}
      className={cn(
        "h-7 rounded-md border bg-background px-1.5 text-xs font-medium",
        ehSim(valor) && "text-emerald-700 dark:text-emerald-400",
        ehNao(valor) && "text-rose-700 dark:text-rose-400",
      )}
    >
      {!conhecido && <option value={valor}>{valor || "—"}</option>}
      <option value={SIM}>Sim</option>
      <option value={NAO}>Não</option>
    </select>
  );
}

function Selo({ sim }: { sim: boolean }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", sim ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300" : "bg-muted text-muted-foreground")}>
      {sim ? "Sim" : "Não"}
    </span>
  );
}

function Celula({ coluna, lead, onEditar }: { coluna: ColunaTabela; lead: LeadBanco; onEditar: (l: LeadBanco, chave: string, v: string) => void }) {
  const v = coluna.valor(lead);
  if (coluna.chave === "_valido" || coluna.chave === "_crm") return <Selo sim={v === SIM} />;
  if (coluna.editavel && (coluna.papel === "valido" || coluna.papel === "primeira_msg")) {
    return <SimNao valor={v} rotulo={coluna.titulo} onMudar={(x) => onEditar(lead, coluna.chave, x)} />;
  }
  const link =
    coluna.papel === "telefone" ? linkWhatsapp(v)
    : coluna.papel === "instagram" ? linkInstagram(v)
    : coluna.papel === "link_instagram" || coluna.papel === "site" ? linkDoTexto(v)
    : null;
  const Icone = coluna.papel === "telefone" ? MessageCircle : ExternalLink;
  return (
    <div className="flex items-center gap-1">
      {coluna.editavel ? (
        <CelulaEditavel valor={v} onSalvar={(x) => onEditar(lead, coluna.chave, x)} />
      ) : (
        <span className="block max-w-[16rem] truncate" title={v}>{v || <span className="text-muted-foreground/40">—</span>}</span>
      )}
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          title={coluna.papel === "telefone" ? "Abrir no WhatsApp" : "Abrir link"}
          aria-label={coluna.papel === "telefone" ? "Abrir no WhatsApp" : "Abrir link"}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Icone size={13} />
        </a>
      )}
    </div>
  );
}

const fundoDaLinha = (noCrm: boolean, valido: boolean) =>
  noCrm ? "bg-emerald-50 dark:bg-emerald-950/40" : !valido ? "bg-rose-50 dark:bg-rose-950/40" : "bg-card";

export function BancoTabela({
  aba,
  abasPorId,
  leads,
  selecionados,
  onSelecionar,
  onAbrir,
  onEditar,
}: {
  aba: AbaBanco | null;
  abasPorId: Map<string, AbaBanco>;
  leads: LeadBanco[];
  selecionados: Set<string>;
  onSelecionar: Dispatch<SetStateAction<Set<string>>>;
  onAbrir: (id: string) => void;
  onEditar: (l: LeadBanco, chave: string, v: string) => void;
}) {
  const colunas = useMemo(() => colunasDaTabela(aba, abasPorId), [aba, abasPorId]);
  const [ordem, setOrdem] = useState<{ chave: string | null; direcao: "asc" | "desc" }>({ chave: null, direcao: "asc" });
  const [limite, setLimite] = useState(POR_VEZ);
  useEffect(() => {
    setOrdem({ chave: null, direcao: "asc" });
    setLimite(POR_VEZ);
  }, [aba?.id]);

  const ordenados = useMemo(() => {
    if (!ordem.chave) {
      if (aba) return [...leads].sort((a, b) => a.posicao - b.posicao);
      return leads;
    }
    const col = ordem.chave === "_nome" ? null : colunas.find((c) => c.chave === ordem.chave);
    const valor = (l: LeadBanco) => (col ? col.valor(l) : nomeDoLead(l, abasPorId.get(l.aba_id)));
    const r = [...leads].sort((a, b) => compararTexto(valor(a), valor(b)));
    return ordem.direcao === "asc" ? r : r.reverse();
  }, [leads, ordem, colunas, aba, abasPorId]);

  const visiveis = ordenados.slice(0, limite);
  const todosVisiveis = visiveis.length > 0 && visiveis.every((l) => selecionados.has(l.id));

  const ordenarPor = (chave: string) =>
    setOrdem((o) => (o.chave === chave ? { chave, direcao: o.direcao === "asc" ? "desc" : "asc" } : { chave, direcao: "asc" }));
  const marcar = (id: string, marcado: boolean) =>
    onSelecionar((prev) => {
      const s = new Set(prev);
      if (marcado) s.add(id);
      else s.delete(id);
      return s;
    });
  const marcarVisiveis = (marcado: boolean) =>
    onSelecionar((prev) => {
      const s = new Set(prev);
      for (const l of visiveis) {
        if (marcado) s.add(l.id);
        else s.delete(l.id);
      }
      return s;
    });

  const Cabecalho = ({ chave, titulo, fixo }: { chave: string; titulo: string; fixo?: boolean }) => {
    const ativo = ordem.chave === chave;
    const Seta = !ativo ? ArrowUpDown : ordem.direcao === "asc" ? ArrowUp : ArrowDown;
    return (
      <TableHead
        aria-sort={ativo ? (ordem.direcao === "asc" ? "ascending" : "descending") : "none"}
        className={cn(
          "sticky top-0 whitespace-nowrap bg-card shadow-[inset_0_-1px_0_var(--color-border)]",
          fixo ? "left-10 z-20" : "z-10",
        )}
      >
        <button
          type="button"
          onClick={() => ordenarPor(chave)}
          title="Clique para ordenar"
          className={cn("inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring", ativo && "text-foreground")}
        >
          {titulo}
          <Seta size={12} className={cn("shrink-0", !ativo && "opacity-40")} aria-hidden />
        </button>
      </TableHead>
    );
  };

  return (
    <div className="min-w-0 space-y-2">
      <div className="max-h-[max(20rem,calc(100dvh-19rem))] w-full overflow-auto rounded-md border bg-card">
        <table className="w-full caption-bottom text-sm">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky left-0 top-0 z-20 w-10 bg-card shadow-[inset_0_-1px_0_var(--color-border)]">
                <Checkbox checked={todosVisiveis} onCheckedChange={(v) => marcarVisiveis(v === true)} disabled={visiveis.length === 0} aria-label="Selecionar todos os leads mostrados" />
              </TableHead>
              <Cabecalho chave="_nome" titulo="Lead" fixo />
              {colunas.map((c) => <Cabecalho key={c.chave} chave={c.chave} titulo={c.titulo} />)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visiveis.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={colunas.length + 2} className="py-10 text-center text-sm text-muted-foreground">
                  Nenhum lead neste filtro.
                </TableCell>
              </TableRow>
            ) : (
              visiveis.map((l) => {
                const abaDoLead = abasPorId.get(l.aba_id);
                const fundo = fundoDaLinha(!!l.lead_crm_id, ehValido(l, abaDoLead));
                const marcado = selecionados.has(l.id);
                const nome = nomeDoLead(l, abaDoLead);
                return (
                  <TableRow key={l.id} data-state={marcado ? "selected" : undefined} className={cn("whitespace-nowrap", fundo)}>
                    <TableCell className={cn("sticky left-0 z-[1] w-10", fundo)}>
                      <Checkbox checked={marcado} onCheckedChange={(v) => marcar(l.id, v === true)} aria-label={`Selecionar ${nome}`} />
                    </TableCell>
                    <TableCell className={cn("sticky left-10 z-[1] shadow-[inset_-1px_0_0_var(--color-border)]", fundo)}>
                      <button
                        type="button"
                        onClick={() => onAbrir(l.id)}
                        title={`Abrir a ficha de ${nome}`}
                        className="block max-w-[14rem] truncate text-left font-medium hover:underline focus-visible:underline focus-visible:outline-none"
                      >
                        {nome}
                      </button>
                    </TableCell>
                    {colunas.map((c) => (
                      <TableCell key={c.chave} className="py-1.5">
                        <Celula coluna={c} lead={l} onEditar={onEditar} />
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </table>
      </div>
      {ordenados.length > limite && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setLimite((n) => n + POR_VEZ)}>
            Mostrar mais ({ordenados.length - limite} restantes)
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Ficha**

<!-- arquivo: src/components/crm/banco/BancoFicha.tsx -->
```tsx
// Ficha do lead do Banco de leads (painel lateral; tela cheia no celular): todos os campos visíveis da aba, atalhos,
// Lead válido, Primeira mensagem enviada (entra e sai do CRM), bloco do CRM e exclusão. Spec §8.2.
import { useEffect, useState } from "react";
import { AtSign, Globe, KanbanSquare, MessageCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  colunasVisiveis,
  ehSim,
  ehValido,
  linkDoTexto,
  linkInstagram,
  NAO,
  nomeDoLead,
  SIM,
  valorDoPapel,
  type AbaBanco,
  type LeadBanco,
} from "@/lib/bancoLeads";
import { linkWhatsapp } from "@/lib/crmWhatsapp";
import { formatarData } from "@/lib/crmFormato";
import type { ColunaCrm, LeadCrm } from "@/lib/crmTipos";
import { cn } from "@/lib/utils";

function Campo({ titulo, valor, onSalvar }: { titulo: string; valor: string; onSalvar: (v: string) => void }) {
  const [texto, setTexto] = useState(valor);
  useEffect(() => setTexto(valor), [valor]);
  const longo = valor.length > 60 || valor.includes("\n");
  const salvar = () => {
    if (texto.trim() !== valor.trim()) onSalvar(texto);
  };
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{titulo}</span>
      {longo ? (
        <Textarea rows={4} className="text-sm" value={texto} onChange={(e) => setTexto(e.target.value)} onBlur={salvar} />
      ) : (
        <Input className="h-9 text-sm" value={texto} onChange={(e) => setTexto(e.target.value)} onBlur={salvar} />
      )}
    </label>
  );
}

function SimNaoBotoes({ rotulo, sim, onMudar }: { rotulo: string; sim: boolean; onMudar: (sim: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
      <span className="text-sm">{rotulo}</span>
      <div role="group" aria-label={rotulo} className="inline-flex rounded-lg border bg-background p-0.5">
        {[true, false].map((v) => (
          <button
            key={String(v)}
            type="button"
            aria-pressed={sim === v}
            onClick={() => sim !== v && onMudar(v)}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              sim === v ? (v ? "bg-emerald-600 text-white" : "bg-rose-600 text-white") : "text-muted-foreground hover:bg-muted",
            )}
          >
            {v ? "Sim" : "Não"}
          </button>
        ))}
      </div>
    </div>
  );
}

export function BancoFicha({
  lead,
  aba,
  crmLead,
  crmColuna,
  onFechar,
  onEditar,
  onEnviarAoCrm,
  onTirarDoCrm,
  onExcluir,
  onAbrirNoCrm,
}: {
  lead: LeadBanco | null;
  aba: AbaBanco | null;
  crmLead: LeadCrm | null;
  crmColuna: ColunaCrm | null;
  onFechar: () => void;
  onEditar: (l: LeadBanco, chave: string, v: string) => void;
  onEnviarAoCrm: (l: LeadBanco) => void;
  onTirarDoCrm: (l: LeadBanco) => void;
  onExcluir: (l: LeadBanco) => void;
  onAbrirNoCrm: (crmId: string) => void;
}) {
  const [confirmarExcluir, setConfirmarExcluir] = useState(false);
  const aberto = !!lead && !!aba;
  const nome = lead && aba ? nomeDoLead(lead, aba) : "";
  const telefone = lead && aba ? valorDoPapel(lead, aba, "telefone") : "";
  const instagram = lead && aba ? linkInstagram(valorDoPapel(lead, aba, "instagram")) ?? linkDoTexto(valorDoPapel(lead, aba, "link_instagram")) : null;
  const site = lead && aba ? linkDoTexto(valorDoPapel(lead, aba, "site")) : null;
  const whatsapp = linkWhatsapp(telefone);
  const valido = lead && aba ? ehValido(lead, aba) : true;
  const campos = aba ? colunasVisiveis(aba).filter((c) => c.papel !== "valido" && c.papel !== "primeira_msg") : [];
  const chaveValido = aba?.colunas.find((c) => c.papel === "valido")?.chave ?? null;
  const chave1msg = aba?.colunas.find((c) => c.papel === "primeira_msg")?.chave ?? null;

  return (
    <Sheet open={aberto} onOpenChange={(a) => { if (!a) onFechar(); }}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {lead && aba && (
          <div className="flex flex-col">
            <div className="space-y-3 border-b bg-muted/30 p-4 pr-14 sm:p-6 sm:pr-14">
              <SheetTitle className="text-xl font-semibold leading-tight">{nome}</SheetTitle>
              <SheetDescription className="text-xs">Aba {aba.nome} da planilha · linha {lead.posicao}</SheetDescription>
              <div className="flex flex-wrap gap-2">
                {lead.lead_crm_id && <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">No CRM</span>}
                {!valido && <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-800 dark:bg-rose-900/50 dark:text-rose-300">Lead inválido</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild={!!whatsapp} variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={!whatsapp}>
                  {whatsapp ? <a href={whatsapp} target="_blank" rel="noreferrer"><MessageCircle size={14} /> WhatsApp</a> : <span><MessageCircle size={14} /> WhatsApp</span>}
                </Button>
                <Button asChild={!!instagram} variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={!instagram}>
                  {instagram ? <a href={instagram} target="_blank" rel="noreferrer"><AtSign size={14} /> Instagram</a> : <span><AtSign size={14} /> Instagram</span>}
                </Button>
                {site && (
                  <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                    <a href={site} target="_blank" rel="noreferrer"><Globe size={14} /> Site</a>
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-6 p-4 pb-10 sm:p-6">
              <section className="space-y-2">
                {chaveValido && (
                  <SimNaoBotoes rotulo="Lead válido" sim={valido} onMudar={(sim) => onEditar(lead, chaveValido, sim ? SIM : NAO)} />
                )}
                {chave1msg && (
                  <SimNaoBotoes
                    rotulo="Primeira mensagem enviada (no CRM)"
                    sim={ehSim(lead.dados[chave1msg]) || !!lead.lead_crm_id}
                    onMudar={(sim) => (sim ? onEnviarAoCrm(lead) : onTirarDoCrm(lead))}
                  />
                )}
              </section>

              {crmLead && (
                <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-emerald-50/60 p-3 dark:bg-emerald-950/30">
                  <div className="min-w-0 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">No CRM</p>
                    <p className="flex items-center gap-1.5 font-medium">
                      {crmColuna && <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: crmColuna.hex }} aria-hidden />}
                      {crmColuna?.titulo ?? "Sem etapa"}
                      {crmLead.coluna_desde && <span className="font-normal text-muted-foreground"> desde {formatarData(crmLead.coluna_desde)}</span>}
                    </p>
                  </div>
                  <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => onAbrirNoCrm(crmLead.id)}>
                    <KanbanSquare size={14} /> Abrir no CRM
                  </Button>
                </section>
              )}

              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dados da planilha</h3>
                {campos.map((c) => (
                  <Campo key={c.chave} titulo={c.titulo} valor={lead.dados[c.chave] ?? ""} onSalvar={(v) => onEditar(lead, c.chave, v)} />
                ))}
              </section>

              <section className="flex justify-end border-t pt-4">
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive" onClick={() => setConfirmarExcluir(true)}>
                  <Trash2 size={14} /> Excluir lead
                </Button>
              </section>
            </div>

            <AlertDialog open={confirmarExcluir} onOpenChange={setConfirmarExcluir}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir {nome}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    A linha sai da aba {aba.nome} da planilha.
                    {lead.lead_crm_id ? " O lead continua no CRM (a origem passa a ser Sistema)." : ""}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => {
                      setConfirmarExcluir(false);
                      onExcluir(lead);
                    }}
                  >
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 3: Novo lead**

<!-- arquivo: src/components/crm/banco/BancoNovoLead.tsx -->
```tsx
// Novo lead numa aba do Banco de leads: os campos visíveis da aba; entra no fim da aba (a planilha recebe pela fila).
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { colunasVisiveis, type AbaBanco } from "@/lib/bancoLeads";

export function BancoNovoLead({
  aba,
  aberto,
  onFechar,
  onCriar,
}: {
  aba: AbaBanco | null;
  aberto: boolean;
  onFechar: () => void;
  onCriar: (dados: Record<string, string>) => Promise<boolean>;
}) {
  const [dados, setDados] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (aberto) setDados({});
  }, [aberto]);
  const campos = aba ? colunasVisiveis(aba).filter((c) => c.papel !== "valido" && c.papel !== "primeira_msg") : [];
  const algum = Object.values(dados).some((v) => v.trim());

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!algum || salvando) return;
    setSalvando(true);
    const ok = await onCriar(Object.fromEntries(Object.entries(dados).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v)));
    setSalvando(false);
    if (ok) onFechar();
  };

  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) onFechar(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={salvar} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Novo lead em {aba?.nome}</DialogTitle>
            <DialogDescription>Entra no fim da aba da planilha. Preencha o que tiver; o resto dá para completar depois.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {campos.map((c) => (
              <label key={c.chave} className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{c.titulo}</span>
                <Input
                  className="h-9 text-sm"
                  value={dados[c.chave] ?? ""}
                  onChange={(e) => setDados((d) => ({ ...d, [c.chave]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>Cancelar</Button>
            <Button type="submit" disabled={!algum || salvando} className="gap-1.5">
              {salvando && <Loader2 size={14} className="animate-spin" />} Criar lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Barra de seleção**

<!-- arquivo: src/components/crm/banco/BancoSelecaoBarra.tsx -->
```tsx
// Barra flutuante das ações em massa do Banco de leads (layout de SelecaoBarraCrm). Vai para o <body> (portal).
import { useState } from "react";
import { createPortal } from "react-dom";
import { CheckSquare, Loader2, Send, ShieldCheck, ShieldX, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function BancoSelecaoBarra({
  quantidade,
  onEnviarAoCrm,
  onValido,
  onExcluir,
  onLimpar,
}: {
  quantidade: number;
  onEnviarAoCrm: () => Promise<void>;
  onValido: (valido: boolean) => Promise<void>;
  onExcluir: () => Promise<void>;
  onLimpar: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const qtd = `${quantidade} ${quantidade === 1 ? "lead" : "leads"}`;
  const executar = async (f: () => Promise<void>) => {
    if (ocupado) return;
    setOcupado(true);
    try {
      await f();
    } finally {
      setOcupado(false);
      setConfirmar(false);
      onLimpar();
    }
  };

  const barra = (
    <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 animate-in slide-in-from-bottom-4 duration-200 max-lg:bottom-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-popover px-3 py-2 shadow-xl">
        <span className="flex items-center gap-1.5 pr-1 text-sm font-semibold" aria-live="polite">
          {ocupado ? <Loader2 size={15} className="animate-spin text-primary" /> : <CheckSquare size={15} className="text-primary" />}
          {quantidade} {quantidade === 1 ? "selecionado" : "selecionados"}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={ocupado} onClick={() => void executar(onEnviarAoCrm)} title={`Enviar ${qtd} ao CRM (Primeiro contato)`}>
            <Send size={13} /> Enviar ao CRM
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={ocupado} onClick={() => void executar(() => onValido(true))}>
            <ShieldCheck size={13} /> Válido
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={ocupado} onClick={() => void executar(() => onValido(false))}>
            <ShieldX size={13} /> Inválido
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive" disabled={ocupado} onClick={() => setConfirmar(true)}>
            <Trash2 size={13} /> Excluir
          </Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={ocupado} onClick={onLimpar} aria-label="Limpar seleção" title="Limpar seleção">
            <X size={15} />
          </Button>
        </div>
      </div>
      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {qtd}?</AlertDialogTitle>
            <AlertDialogDescription>As linhas saem da planilha. Leads que estão no CRM continuam lá.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void executar(onExcluir)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
  return typeof document === "undefined" ? null : createPortal(barra, document.body);
}
```

- [ ] **Step 5: Tela principal**

<!-- arquivo: src/components/crm/banco/BancoLeads.tsx -->
```tsx
// Banco de leads: as abas de leads da "Planilha CRM Mestra" dentro do CRM (spec 2026-10-01-banco-de-leads §8.2).
// Lê e grava em banco_leads; o Apps Script leva cada mudança à planilha e traz as de lá (Realtime).
import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Filter, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MensagemBusca } from "@/components/MensagemBusca";
import { useCrm } from "@/components/crm/CrmContexto";
import { useBusca } from "@/lib/useBusca";
import * as crmDados from "@/lib/crmDados";
import { colunaInicial } from "@/lib/crmColunas";
import {
  chaveDoPapel,
  ehSim,
  ehValido,
  faixaDoFaturamento,
  filtrarBanco,
  FILTRO_BANCO_PADRAO,
  leadCrmDoBanco,
  NAO,
  nomeDoLead,
  opcoesDeFiltro,
  SIM,
  textoDeBusca,
  type AbaBanco,
  type FiltroBanco,
  type FiltroSimNao,
  type LeadBanco,
} from "@/lib/bancoLeads";
import { criarLeadBanco, definirCampoBanco, excluirLeadsBanco, ligarAoCrm, type StatusPlanilha } from "@/lib/bancoLeadsDados";
import { useBancoLeads } from "./useBancoLeads";
import { BancoTabela } from "./BancoTabela";
import { BancoFicha } from "./BancoFicha";
import { BancoNovoLead } from "./BancoNovoLead";
import { BancoSelecaoBarra } from "./BancoSelecaoBarra";
import { cn } from "@/lib/utils";

const TODAS = "todas";

function lerLocal(chave: string, padrao: string): string {
  try {
    return window.localStorage.getItem(chave) ?? padrao;
  } catch {
    return padrao;
  }
}

function gravarLocal(chave: string, valor: string) {
  try {
    window.localStorage.setItem(chave, valor);
  } catch {
    // navegador sem armazenamento: só não lembra a escolha
  }
}

function comValor(dados: Record<string, string>, chave: string, valor: string): Record<string, string> {
  const v = valor.trim();
  const out = { ...dados };
  if (v) out[chave] = v;
  else delete out[chave];
  return out;
}

/** Ações do Banco de leads: gravam no banco (a planilha recebe pelo Apps Script) e já mudam a tela. */
function useAcoesBanco(abasPorId: Map<string, AbaBanco>, leads: LeadBanco[], setLeads: Dispatch<SetStateAction<LeadBanco[]>>) {
  const crm = useCrm();
  const trocar = useCallback(
    (id: string, f: (l: LeadBanco) => LeadBanco) => setLeads((prev) => prev.map((l) => (l.id === id ? f(l) : l))),
    [setLeads],
  );

  const editar = useCallback(
    async (lead: LeadBanco, chave: string, valor: string) => {
      const anterior = lead.dados[chave] ?? "";
      if (anterior === valor.trim()) return;
      const aba = abasPorId.get(lead.aba_id);
      trocar(lead.id, (l) => ({ ...l, dados: comValor(l.dados, chave, valor) }));
      try {
        await definirCampoBanco(lead.id, chave, valor);
        if (aba && lead.lead_crm_id && chave === chaveDoPapel(aba, "faturamento")) {
          const faixa = faixaDoFaturamento(valor);
          if (faixa) await crmDados.atualizarLead(lead.lead_crm_id, { faturamento_faixa: faixa });
        }
      } catch (e: any) {
        toast.error("Não foi possível salvar: " + (e?.message ?? e));
        trocar(lead.id, (l) => ({ ...l, dados: comValor(l.dados, chave, anterior) }));
      }
    },
    [abasPorId, trocar],
  );

  const enviarAoCrm = useCallback(
    async (lead: LeadBanco, avisar = true): Promise<boolean> => {
      const aba = abasPorId.get(lead.aba_id);
      if (!aba || lead.lead_crm_id) return false;
      if (!ehValido(lead, aba)) {
        if (avisar) toast.error(`${nomeDoLead(lead, aba)} está como Lead válido = Não. Mude para Sim antes de enviar ao CRM.`);
        return false;
      }
      const coluna = crm.colunas.find((c) => c.id === "primeiro_contato") ?? colunaInicial(crm.colunas);
      if (!coluna) {
        toast.error("O CRM não tem colunas.");
        return false;
      }
      const k1 = chaveDoPapel(aba, "primeira_msg");
      try {
        const { lead: novo } = await crmDados.criarLead({ ...leadCrmDoBanco(lead, aba), primeiro_contato_em: new Date().toISOString() }, coluna);
        await ligarAoCrm(lead.id, novo.id, k1, SIM);
        trocar(lead.id, (l) => ({ ...l, lead_crm_id: novo.id, dados: k1 ? comValor(l.dados, k1, SIM) : l.dados }));
        if (avisar) toast.success(`${nomeDoLead(lead, aba)} entrou no CRM em ${coluna.titulo}.`);
        return true;
      } catch (e: any) {
        toast.error("Não foi possível enviar ao CRM: " + (e?.message ?? e));
        return false;
      }
    },
    [abasPorId, crm.colunas, trocar],
  );

  const tirarDoCrm = useCallback(
    async (lead: LeadBanco) => {
      if (!lead.lead_crm_id) return;
      const k1 = chaveDoPapel(abasPorId.get(lead.aba_id), "primeira_msg");
      await crm.excluirLeads([lead.lead_crm_id]);
      trocar(lead.id, (l) => ({ ...l, lead_crm_id: null, dados: k1 ? comValor(l.dados, k1, NAO) : l.dados }));
    },
    [abasPorId, crm, trocar],
  );

  const excluir = useCallback(
    async (ids: string[]) => {
      const fora = new Set(ids);
      const antes = leads;
      setLeads((prev) => prev.filter((l) => !fora.has(l.id)));
      try {
        await excluirLeadsBanco(ids);
        toast.success(ids.length === 1 ? "Lead excluído." : `${ids.length} leads excluídos.`);
      } catch (e: any) {
        setLeads(antes);
        toast.error("Não foi possível excluir: " + (e?.message ?? e));
      }
    },
    [leads, setLeads],
  );

  const criar = useCallback(
    async (aba: AbaBanco, dados: Record<string, string>): Promise<boolean> => {
      const kValido = chaveDoPapel(aba, "valido");
      const k1 = chaveDoPapel(aba, "primeira_msg");
      const completos = { ...(kValido ? { [kValido]: SIM } : {}), ...(k1 ? { [k1]: NAO } : {}), ...dados };
      const posicao = Math.max(1, ...leads.filter((l) => l.aba_id === aba.id).map((l) => l.posicao)) + 1;
      try {
        const novo = await criarLeadBanco(aba.id, completos, posicao);
        setLeads((prev) => (prev.some((l) => l.id === novo.id) ? prev : [...prev, novo]));
        toast.success(`Lead criado em ${aba.nome}. A planilha recebe em segundos.`);
        return true;
      } catch (e: any) {
        toast.error("Não foi possível criar: " + (e?.message ?? e));
        return false;
      }
    },
    [leads, setLeads],
  );

  const validoEmMassa = useCallback(
    async (alvo: LeadBanco[], valido: boolean) => {
      let feitos = 0;
      for (const l of alvo) {
        const k = chaveDoPapel(abasPorId.get(l.aba_id), "valido");
        if (!k) continue;
        await editar(l, k, valido ? SIM : NAO);
        feitos++;
      }
      toast.success(`${feitos} ${feitos === 1 ? "lead marcado" : "leads marcados"} como ${valido ? "válido" : "inválido"}.`);
    },
    [abasPorId, editar],
  );

  const enviarEmMassa = useCallback(
    async (alvo: LeadBanco[]) => {
      let ok = 0;
      let pulados = 0;
      for (const l of alvo) {
        if (l.lead_crm_id || !ehValido(l, abasPorId.get(l.aba_id))) {
          pulados++;
          continue;
        }
        if (await enviarAoCrm(l, false)) ok++;
      }
      toast.success(`${ok} ${ok === 1 ? "lead enviado" : "leads enviados"} ao CRM.${pulados ? ` ${pulados} já estavam lá ou são inválidos.` : ""}`);
    },
    [abasPorId, enviarAoCrm],
  );

  return { editar, enviarAoCrm, tirarDoCrm, excluir, criar, validoEmMassa, enviarEmMassa };
}

function SubAbas({
  abas,
  contagem,
  total,
  atual,
  onEscolher,
}: {
  abas: AbaBanco[];
  contagem: Map<string, number>;
  total: number;
  atual: string;
  onEscolher: (id: string) => void;
}) {
  const itens = [{ id: TODAS, nome: "Todas", n: total }, ...abas.map((a) => ({ id: a.id, nome: a.nome, n: contagem.get(a.id) ?? 0 }))];
  return (
    <div className="-mx-1 overflow-x-auto pb-1">
      <div role="tablist" aria-label="Abas da planilha" className="flex w-max gap-1.5 px-1">
        {itens.map((a) => {
          const ativa = atual === a.id;
          return (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={ativa}
              onClick={() => onEscolher(a.id)}
              className={cn(
                "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                ativa ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
              )}
            >
              {a.nome}
              <span className={cn("tabular-nums", ativa ? "opacity-80" : "text-muted-foreground")}>{a.n}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StatusSync({ status }: { status: StatusPlanilha | null }) {
  const [, setTique] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTique((x) => x + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);
  if (!status?.conectada) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
        <AlertTriangle size={13} /> A planilha ainda não está conectada
      </span>
    );
  }
  const em = status.ultima_conferencia_em ? new Date(status.ultima_conferencia_em).getTime() : null;
  const min = em === null ? null : Math.max(0, Math.round((Date.now() - em) / 60_000));
  const quando = min === null ? "ainda não conferida" : min < 1 ? "agora há pouco" : min < 60 ? `há ${min} min` : `há ${Math.round(min / 60)} h`;
  const problema = status.ok === false;
  const atrasado = min === null || min > 15;
  return (
    <span
      title={problema && status.erro ? `Última conferência com problema: ${status.erro}` : "Edições vão na hora; a planilha confere tudo a cada 5 minutos."}
      className={cn("inline-flex items-center gap-1 whitespace-nowrap text-xs", problema || atrasado ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}
    >
      {problema || atrasado ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
      {problema ? `Conferência com problema ${quando}` : `Sincronizado com a planilha ${quando}`}
    </span>
  );
}

function MaisFiltros({
  opcoes,
  valores,
  onMudar,
}: {
  opcoes: { chave: string; titulo: string; valores: string[] }[];
  valores: Record<string, string>;
  onMudar: (v: Record<string, string>) => void;
}) {
  const ativos = Object.values(valores).filter(Boolean).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-9 gap-1.5 text-xs", ativos > 0 && "border-primary text-primary")}>
          <Filter size={13} /> Mais filtros{ativos ? ` (${ativos})` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3">
        {opcoes.map((o) => (
          <label key={o.chave} className="block space-y-1 text-xs">
            <span className="font-medium">{o.titulo}</span>
            <select
              className="h-8 w-full rounded-md border bg-background px-2 text-xs"
              value={valores[o.chave] ?? ""}
              onChange={(e) => onMudar({ ...valores, [o.chave]: e.target.value })}
            >
              <option value="">Todos</option>
              {o.valores.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
        ))}
        {ativos > 0 && (
          <Button variant="ghost" size="sm" className="h-7 w-full text-xs" onClick={() => onMudar({})}>
            Limpar estes filtros
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function SeletorSimNao({ valor, onMudar, rotulo, opcoes }: { valor: FiltroSimNao; onMudar: (v: FiltroSimNao) => void; rotulo: string; opcoes: [string, string, string] }) {
  return (
    <Select value={valor} onValueChange={(v) => onMudar(v as FiltroSimNao)}>
      <SelectTrigger aria-label={rotulo} className="h-9 flex-1 min-w-[130px] text-xs sm:w-[150px] sm:flex-none">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="todos">{opcoes[0]}</SelectItem>
        <SelectItem value="sim">{opcoes[1]}</SelectItem>
        <SelectItem value="nao">{opcoes[2]}</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function BancoLeads({ onAbrirNoCrm }: { onAbrirNoCrm: (crmId: string) => void }) {
  const { abas, leads, setLeads, status, carregando, erro } = useBancoLeads();
  const crm = useCrm();
  const [abaAtual, setAbaAtual] = useState<string>(() => lerLocal("banco-leads-aba", TODAS));
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FiltroBanco>(FILTRO_BANCO_PADRAO);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set());
  const [saida, setSaida] = useState<LeadBanco | null>(null);

  const abasPorId = useMemo(() => new Map(abas.map((a) => [a.id, a])), [abas]);
  const aba = abaAtual === TODAS ? null : abasPorId.get(abaAtual) ?? null;
  const acoes = useAcoesBanco(abasPorId, leads, setLeads);

  useEffect(() => {
    if (abaAtual !== TODAS && abas.length > 0 && !abasPorId.has(abaAtual)) setAbaAtual(TODAS);
  }, [abaAtual, abas.length, abasPorId]);
  useEffect(() => {
    gravarLocal("banco-leads-aba", abaAtual);
    setFiltro((f) => ({ ...f, colunas: {} }));
    setSelecionados(new Set());
  }, [abaAtual]);

  const contagem = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of leads) m.set(l.aba_id, (m.get(l.aba_id) ?? 0) + 1);
    return m;
  }, [leads]);
  const daAba = useMemo(
    () => (aba ? leads.filter((l) => l.aba_id === aba.id) : leads.filter((l) => abasPorId.has(l.aba_id))),
    [leads, aba, abasPorId],
  );
  const filtrados = useMemo(() => filtrarBanco(daAba, abasPorId, filtro), [daAba, abasPorId, filtro]);
  const resultado = useBusca(filtrados, busca, (l) => textoDeBusca(l, abasPorId.get(l.aba_id)), { manterOrdem: true, deps: [abasPorId] });
  const opcoesExtra = useMemo(() => (aba ? opcoesDeFiltro(daAba, aba) : []), [daAba, aba]);

  const idsMostrados = useMemo(() => new Set(resultado.itens.map((l) => l.id)), [resultado.itens]);
  const selecionadosMostrados = useMemo(() => leads.filter((l) => selecionados.has(l.id) && idsMostrados.has(l.id)), [leads, selecionados, idsMostrados]);

  const leadFicha = fichaId ? leads.find((l) => l.id === fichaId) ?? null : null;
  const crmLead = leadFicha?.lead_crm_id ? crm.leads.find((l) => l.id === leadFicha.lead_crm_id) ?? null : null;

  const aoEditar = (lead: LeadBanco, chave: string, valor: string) => {
    const abaDoLead = abasPorId.get(lead.aba_id);
    if (abaDoLead && chave === chaveDoPapel(abaDoLead, "primeira_msg")) {
      if (ehSim(valor)) void acoes.enviarAoCrm(lead);
      else if (lead.lead_crm_id) setSaida(lead);
      else void acoes.editar(lead, chave, valor);
      return;
    }
    void acoes.editar(lead, chave, valor);
  };

  const planilhaUrl = status?.planilha_id
    ? `https://docs.google.com/spreadsheets/d/${status.planilha_id}/edit${aba ? `#gid=${aba.id}` : ""}`
    : null;

  return (
    <div className={cn("flex flex-col gap-3", selecionadosMostrados.length > 0 && "pb-20")}>
      <SubAbas abas={abas} contagem={contagem} total={leads.filter((l) => abasPorId.has(l.aba_id)).length} atual={abaAtual} onEscolher={setAbaAtual} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar no Banco de leads"
            placeholder="Buscar nome, empresa, telefone ou qualquer dado"
            className="h-9 pl-9 md:text-xs"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <SeletorSimNao rotulo="Lead válido" valor={filtro.valido} onMudar={(v) => setFiltro((f) => ({ ...f, valido: v }))} opcoes={["Válidos e inválidos", "Só válidos", "Só inválidos"]} />
        <SeletorSimNao rotulo="No CRM" valor={filtro.crm} onMudar={(v) => setFiltro((f) => ({ ...f, crm: v }))} opcoes={["No CRM e fora", "Só no CRM", "Fora do CRM"]} />
        {aba && opcoesExtra.length > 0 && <MaisFiltros opcoes={opcoesExtra} valores={filtro.colunas} onMudar={(c) => setFiltro((f) => ({ ...f, colunas: c }))} />}
        {planilhaUrl && (
          <Button asChild variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
            <a href={planilhaUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Abrir planilha</a>
          </Button>
        )}
        <Button size="sm" className="h-9 gap-1.5 text-xs" onClick={() => setNovoAberto(true)} disabled={!aba} title={aba ? `Novo lead em ${aba.nome}` : "Escolha uma aba para criar o lead nela"}>
          <Plus size={14} /> Lead
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusSync status={status} />
        <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
          {resultado.itens.length} {resultado.itens.length === 1 ? "lead" : "leads"}
        </span>
      </div>
      <MensagemBusca resultado={resultado} />

      {erro ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          Não foi possível carregar o Banco de leads: {erro}
        </div>
      ) : carregando ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="animate-spin" size={18} /> Carregando o Banco de leads…
        </div>
      ) : abas.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nenhuma aba da planilha chegou ainda. Elas aparecem aqui assim que a planilha for conectada.
        </div>
      ) : (
        <BancoTabela
          aba={aba}
          abasPorId={abasPorId}
          leads={resultado.itens}
          selecionados={selecionados}
          onSelecionar={setSelecionados}
          onAbrir={setFichaId}
          onEditar={aoEditar}
        />
      )}

      <BancoFicha
        lead={leadFicha}
        aba={leadFicha ? abasPorId.get(leadFicha.aba_id) ?? null : null}
        crmLead={crmLead}
        crmColuna={crmLead ? crm.colunaDoLead(crmLead) ?? null : null}
        onFechar={() => setFichaId(null)}
        onEditar={aoEditar}
        onEnviarAoCrm={(l) => void acoes.enviarAoCrm(l)}
        onTirarDoCrm={(l) => setSaida(l)}
        onExcluir={(l) => {
          setFichaId(null);
          void acoes.excluir([l.id]);
        }}
        onAbrirNoCrm={(id) => {
          setFichaId(null);
          onAbrirNoCrm(id);
        }}
      />

      <BancoNovoLead aba={aba} aberto={novoAberto} onFechar={() => setNovoAberto(false)} onCriar={(d) => (aba ? acoes.criar(aba, d) : Promise.resolve(false))} />

      {selecionadosMostrados.length > 0 && (
        <BancoSelecaoBarra
          quantidade={selecionadosMostrados.length}
          onEnviarAoCrm={() => acoes.enviarEmMassa(selecionadosMostrados)}
          onValido={(v) => acoes.validoEmMassa(selecionadosMostrados, v)}
          onExcluir={() => acoes.excluir(selecionadosMostrados.map((l) => l.id))}
          onLimpar={() => setSelecionados(new Set())}
        />
      )}

      <AlertDialog open={!!saida} onOpenChange={(a) => { if (!a) setSaida(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tirar {saida ? nomeDoLead(saida, abasPorId.get(saida.aba_id)) : ""} do CRM?</AlertDialogTitle>
            <AlertDialogDescription>
              O lead e o histórico dele no CRM são apagados (reunião futura é cancelada na agenda). Na planilha, a linha do
              CRM vai para "CRM - lixeira" e "Primeira mensagem enviada" fica Não.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const l = saida;
                setSaida(null);
                if (l) void acoes.tirarDoCrm(l);
              }}
            >
              Tirar do CRM
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 6: Botão no topo do CRM (`src/components/crm/CrmTopo.tsx`)**

Trocar a importação dos ícones e o tipo/lista de visões:

```tsx
import { BarChart3, CalendarRange, Columns3, Database, Download, KanbanSquare, ListChecks, Plus, Search, Table2, Tag, type LucideIcon } from "lucide-react";
```

```tsx
export type VisaoCrm = "fila" | "kanban" | "planilha" | "dashboard" | "banco";

const VISOES: { id: VisaoCrm; rotulo: string; Icone: LucideIcon }[] = [
  { id: "fila", rotulo: "Fila do dia", Icone: ListChecks },
  { id: "kanban", rotulo: "Kanban", Icone: KanbanSquare },
  { id: "planilha", rotulo: "Planilha", Icone: Table2 },
  { id: "dashboard", rotulo: "Dashboard", Icone: BarChart3 },
  { id: "banco", rotulo: "Banco de leads", Icone: Database },
];
```

No componente, logo depois de `const { periodo } = filtro;`:

```tsx
  const banco = visao === "banco";
```

Envolver o bloco dos botões da direita (`<div className="flex items-center gap-2">` com Exportar, Colunas e Novo lead)
em `{!banco && ( … )}`; trocar `grid-cols-4` por `grid-cols-5` na `TabsList`; envolver tudo o que vem depois de
`</Tabs>` dentro da segunda linha (período, personalizado, critério, etiqueta, busca e contagem) em
`{!banco && (<> … </>)}`; e trocar a última linha por `{!banco && resultadoBusca && <MensagemBusca resultado={resultadoBusca} />}`.

- [ ] **Step 7: Rota do CRM (`src/routes/_authenticated/crm.tsx`)**

Importações novas (junto das outras de `@/components/crm/…`):

```tsx
import { BancoLeads } from "@/components/crm/banco/BancoLeads";
import { useCrmTempoReal } from "@/components/crm/useCrmTempoReal";
```

Em `CrmTela`, trocar a primeira linha por:

```tsx
  const { leads, eventos, carregando, erro, abrirExportacao, abrirFicha } = useCrm();
  useCrmTempoReal();
```

E, junto das outras visões:

```tsx
          {visao === "dashboard" && <DashboardCrm leads={filtrados} eventos={eventosFiltrados} />}
          {visao === "banco" && (
            <BancoLeads
              onAbrirNoCrm={(id) => {
                setVisao("kanban");
                abrirFicha(id);
              }}
            />
          )}
```

- [ ] **Step 8: Tipos, testes e build**

Run: `npx tsc --noEmit -p tsconfig.json && npm test && npx vite build`
Expected: sem erros; testes PASS; build ok. Reverter `src/routeTree.gen.ts` se o build o mudou sem motivo.

- [ ] **Step 9: Conferir no navegador (servidor local)**

`npm run dev` (antes, matar `vite dev` antigos). Abrir `/crm`, escolher "Banco de leads": sem abas, aparece o aviso
"Nenhuma aba da planilha chegou ainda" e "A planilha ainda não está conectada". As outras visões continuam iguais.

- [ ] **Step 10: Commit**

```bash
git add src/components/crm/banco src/components/crm/CrmTopo.tsx src/routes/_authenticated/crm.tsx
git commit -m "Banco de leads: visão no CRM (sub-abas, tabela editável, ficha, novo lead, ações em massa)"
```

---

### Task 9: publicar a base (código na main, edge function)

**Files:** nenhum novo.

- [ ] **Step 1: Tudo verde**

Run: `node scripts/copiar-libs-edge.mjs && npx tsc --noEmit -p tsconfig.json && npm test && npx vite build`
Expected: sem erros. Reverter `src/routeTree.gen.ts` se só mudou formatação.

- [ ] **Step 2: Levar à main e enviar**

```bash
git checkout main
git merge --no-ff banco-de-leads -m "Merge: Banco de leads (planilha de leads integrada ao CRM)"
git push origin main
```

Se o classificador barrar o push, pedir ao André: `! git push origin main`. O push não publica o site.

- [ ] **Step 3: Deploy da edge function pelo chat do Lovable**

Mensagem: "Faça apenas o deploy da edge function planilha. Não altere, crie nem apague nenhum arquivo, não mexa no banco e
não publique o site." Depois: `git fetch` e, se o Lovable criou commits, `git merge --ff-only origin/main` e conferir que
só mexeram em `src/integrations/supabase/types.ts`.

- [ ] **Step 4: Conferir que a função responde**

Run: `curl -s https://bnpvzguapunsztsdvmrs.supabase.co/functions/v1/planilha`
Expected: `{"ok":true,"servico":"planilha"}`. E um POST sem configuração:
`curl -s -X POST -H "Content-Type: application/json" -d '{"acao":"fila","planilha_id":"x"}' .../planilha` →
`{"erro":"Planilha não configurada no sistema."}`.

---

### Task 10: teste de ponta a ponta numa cópia da planilha

**Files:** nenhum (testes manuais pelo navegador; dados "TESTE CLAUDE" apagados no fim).

- [ ] **Step 1: Cópia de teste enxuta**

Copiar a planilha pelo Drive ("TESTE CLAUDE - Planilha CRM Mestra"); a cópia leva o Apps Script. Na cópia, deixar só
Resumo, Médicos (5 linhas), Generalista (as linhas que estão no CRM antigo e mais 5), Leads (Arthur) (3 linhas, tem
colunas ocultas K e L), CRM (3 linhas: um perdido, um com reunião, um com Follow Up 1), CRM - lixeira e as abas de
apoio; trocar os nomes por "TESTE CLAUDE 1", "TESTE CLAUDE 2"… nas abas de leads e na aba CRM (mantendo os telefones
iguais entre a Generalista e o CRM, para a ligação pelo telefone).

- [ ] **Step 2: Configurar o sistema para a cópia**

No editor SQL do Lovable:
`INSERT INTO public.planilha_config (id, planilha_id) VALUES ('principal', '<id da cópia>') ON CONFLICT (id) DO UPDATE SET planilha_id = EXCLUDED.planilha_id, chave = NULL, webapp_url = NULL;`

- [ ] **Step 3: Script e Web App na cópia**

No editor do Apps Script da cópia: colar `infra/planilha-crm/Codigo.gs` inteiro em `Código.gs` e salvar. Implantar >
Nova implantação > App da Web (executar como: eu; quem pode acessar: qualquer pessoa), descrição "Ponte com o sistema".
Autorizar como contato@. Copiar a URL `/exec` e gravar: `UPDATE public.planilha_config SET webapp_url = '<url>' WHERE id = 'principal';`

- [ ] **Step 4: Preparar**

Na cópia, recarregar a página e rodar CRM > Preparar sincronização. Expected: a mensagem lista "Planilha registrada",
"Coluna ID criada", "N leads enviados", "CRM antigo: 3 leads criados… 3 ligados", "Lixeira convertida", "Gatilhos
instalados", "Conferência ok". Conferir a aba CRM nova (26 colunas, ID oculto, cores) e a lixeira.

- [ ] **Step 5: Roteiro de conferência (anotar o resultado de cada item)**

Com o servidor local em `/crm` → Banco de leads:
1. Sub-abas com as contagens certas; Leads (Arthur) sem as colunas "Google - Maps" e "Google - Nota"; Médicos sem "#",
   "Investimento" e "Origem".
2. Editar uma célula na planilha → aparece no sistema em até 3 s (Realtime).
3. Editar uma célula no sistema → aparece na planilha em até 10 s.
4. "Primeira mensagem enviada = Sim" na planilha → lead no CRM em Primeiro contato (Kanban atualiza sozinho) e linha na
   aba CRM. "Não" → sai do CRM, linha na lixeira.
5. Mesmo pelo sistema (botões da ficha e da tabela), com a confirmação de "Tirar do CRM".
6. Aba CRM: Etapa = Reunião marcada sem data → linha âmbar com "Falta preencher"; preencher data (dias à frente) e hora →
   evento criado na agenda da contato@ com Meet ("Evento criado" e o link na linha; o card mostra o Meet). Sem e-mail no
   lead: nenhum convite sai.
7. E-mail `oandrelopesz@gmail.com` na aba CRM → convite enviado (avisar o André que o convite de teste chega no e-mail
   dele); Etapa = Lead perdido com motivo → evento cancelado.
8. Tentativas em Follow-up (de 1 para 2) → evento de tentativa no histórico e Próximo contato pela cadência; Tentativas
   fora do follow-up → célula volta com aviso.
9. Colar 3 linhas novas numa aba de leads → entram com ID e aparecem no sistema; copiar uma linha inteira (com o ID
   oculto) → a cópia ganha ID novo na conferência; apagar uma linha → some do sistema na conferência ("Sincronizar
   agora").
10. Ocultar uma coluna numa aba → some do sistema depois de "Sincronizar agora".
11. Excluir um lead pelo sistema → a linha sai da planilha.
12. Apagar uma linha da aba CRM → aviso e a linha volta.

Corrigir o que falhar (voltar à task do componente, com teste que reproduz o defeito) antes de seguir.

- [ ] **Step 6: Limpar o teste**

SQL: `DELETE FROM public.prospeccao WHERE id IN (SELECT lead_crm_id FROM public.banco_leads WHERE lead_crm_id IS NOT NULL) OR nome ILIKE 'TESTE CLAUDE%';`
`DELETE FROM public.banco_leads_abas;` `DELETE FROM public.planilha_fila;` `DELETE FROM public.planilha_pendencias;`
Conferir na agenda que não sobrou evento "TESTE CLAUDE". Mover a cópia de teste para a lixeira do Drive (os gatilhos
dela param junto).

---

### Task 11: planilha verdadeira, publicação e cofre

- [ ] **Step 1: Backup** — copiar a planilha no Drive como "Planilha CRM Mestra - backup 01-10-2026".

- [ ] **Step 2: Configurar** — SQL:
`UPDATE public.planilha_config SET planilha_id = '176k4WPiMeOU1Va8AxSCsGdpzkA1F0lST0m4mbXQrZak', chave = NULL, webapp_url = NULL WHERE id = 'principal';`

- [ ] **Step 3: Script e Web App** — como no Step 3 da Task 10, no editor do script da planilha verdadeira; gravar a
URL `/exec` em `planilha_config.webapp_url`.

- [ ] **Step 4: Preparar** — CRM > Preparar sincronização na planilha verdadeira. Expected: 1.151 leads enviados,
"CRM antigo: 33 leads criados", lixeira convertida, gatilhos instalados, conferência ok.

- [ ] **Step 5: Conferir** — no sistema: 13 sub-abas com as contagens do Resumo; CRM com 5 perdidos, 3 em Reunião
marcada, 1 em Desenvolvendo conversa, 1 em Follow-up e 23 em Primeiro contato; aba CRM da planilha com 33 linhas.

- [ ] **Step 6: Publicar o site** — push da main (se houver commit novo), Lovable > Publicar > Publicar alterações;
conferir em https://gestao.andrelopes.digital/crm que aparece "Banco de leads".

- [ ] **Step 7: Cofre e memória** — nota `_knowledge/modulos/banco-de-leads.md` (como funciona, dados, código,
armadilhas, como testar); atualizar `_knowledge/modulos/crm.md` (visão nova, Realtime, gatilhos em `prospeccao`),
`_knowledge/tecnico/banco-de-dados.md`, `_knowledge/tecnico/codigo.md`, `_knowledge/projects.md`,
`_memory/current-state.md`, topo de `_memory/historico.md`; decisão `_decisions/2026-10-01-banco-de-leads.md`;
aprendizados novos em `_learnings/`. Memória do Claude: `banco-de-leads.md` + linha no `MEMORY.md`.
