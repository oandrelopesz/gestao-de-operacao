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
