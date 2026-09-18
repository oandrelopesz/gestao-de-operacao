export type TipoAcesso = "membros" | "drive" | "telegram";

export const TIPOS_ACESSO: { id: TipoAcesso; label: string }[] = [
  { id: "membros", label: "Área de membros (site com login)" },
  { id: "drive", label: "Google Drive (várias aulas)" },
  { id: "telegram", label: "Telegram (link do canal/grupo)" },
];

export interface Aula {
  titulo: string;
  link: string;
}

export function parseAulas(raw: unknown): Aula[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a: any) => ({ titulo: String(a?.titulo || ""), link: String(a?.link || "") }))
    .filter((a) => a.link);
}

export function tipoAcessoDe(raw: unknown): TipoAcesso {
  return raw === "drive" || raw === "telegram" ? raw : "membros";
}
