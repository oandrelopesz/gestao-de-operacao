/**
 * Regras puras da aba Ideias (sem Supabase nem alias "@/"), para rodar em `node --test`.
 */

export type TipoIdeia = "este_sistema" | "outro_sistema" | "cliente";

export const TIPOS_IDEIA: { id: TipoIdeia; label: string; hex: string }[] = [
  { id: "este_sistema", label: "Este sistema", hex: "#8b5cf6" },
  { id: "outro_sistema", label: "Outro sistema", hex: "#06b6d4" },
  { id: "cliente", label: "Para cliente", hex: "#f59e0b" },
];

export const tipoIdeiaMeta = (id: string) => TIPOS_IDEIA.find((t) => t.id === id) || TIPOS_IDEIA[0];

export function normalizarLink(link: string): string {
  const l = link.trim();
  if (!l) return "";
  return /^https?:\/\//i.test(l) ? l : `https://${l}`;
}

/** Normaliza cada link, descarta vazios e repetidos, mantendo a ordem digitada */
export function limparLinks(links: string[]): string[] {
  const out: string[] = [];
  for (const raw of links) {
    const l = normalizarLink(raw);
    if (l && !out.includes(l)) out.push(l);
  }
  return out;
}

export function dominioDoLink(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return link;
  }
}

/** Texto gravado em demandas.descricao quando a ideia vira demanda */
export function montarDescricaoDemanda(ideia: { descricao: string | null; links: string[] }): string | null {
  const partes: string[] = [];
  const desc = (ideia.descricao || "").trim();
  if (desc) partes.push(desc);
  if (ideia.links.length > 0) partes.push(["Links de referência:", ...ideia.links.map((l) => `- ${l}`)].join("\n"));
  return partes.length > 0 ? partes.join("\n\n") : null;
}

export interface IdeiaFiltravel {
  tipo: string;
  agencia: string | null;
  titulo: string;
  descricao: string | null;
  links: string[];
  concluida_em?: string | null;
}

export type SituacaoIdeia = "abertas" | "concluidas";

/** Filtros da aba: situação (padrão abertas), tipo ("todos" = qualquer), agência ("todas" = qualquer) e busca livre */
export function filtrarIdeias<T extends IdeiaFiltravel>(
  ideias: T[],
  f: { tipo: string; agencia: string; busca: string; situacao?: SituacaoIdeia },
): T[] {
  const q = f.busca.trim().toLowerCase();
  const concluidas = f.situacao === "concluidas";
  return ideias.filter(
    (i) =>
      !!i.concluida_em === concluidas &&
      (f.tipo === "todos" || i.tipo === f.tipo) &&
      (f.agencia === "todas" || i.agencia === f.agencia) &&
      (!q ||
        i.titulo.toLowerCase().includes(q) ||
        (i.descricao || "").toLowerCase().includes(q) ||
        i.links.some((l) => l.toLowerCase().includes(q))),
  );
}

/** Coluna pré-selecionada ao enviar para demandas: o mesmo padrão do DemandaForm */
export function colunaPadrao(colunas: { id: string; sistema: boolean }[]): string {
  if (colunas.some((c) => c.id === "fazer_hoje")) return "fazer_hoje";
  return (colunas.find((c) => !c.sistema) || colunas[0])?.id || "";
}
