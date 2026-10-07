/**
 * Nomes do swipe file no Drive (sem Supabase nem alias "@/", para `node --test`).
 * Padrão combinado com o André (2026-10-07): "Nome do arquivo - Player - Tipo - Rede";
 * o nome é opcional, e nicho/subnicho ficam só nas pastas.
 */

/** Tira o que quebra nome de arquivo/pasta ao baixar do Drive e junta espaços. */
export function limparNome(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
}

export function nomeArquivo(p: { nome?: string | null; player: string; tipo: string; rede: string }): string {
  return [p.nome || "", p.player, p.tipo, p.rede].map(limparNome).filter(Boolean).join(" - ").slice(0, 180);
}

/** Links colados de uma vez (um por linha ou separados por espaço), na ordem, sem repetidos. */
export function separarLinks(texto: string): string[] {
  const parecido = /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i;
  return Array.from(new Set(texto.split(/\s+/).filter((t) => parecido.test(t))));
}

/**
 * Primeiro nome livre: "base", "base (2)", "base (3)"... LP e carrossel viram pasta, e o worker
 * reaproveita a pasta de mesmo nome (os arquivos de duas referências se misturariam).
 */
export function nomeLivre(base: string, usados: Set<string>): string {
  if (!usados.has(base)) return base;
  let n = 2;
  while (usados.has(`${base} (${n})`)) n++;
  return `${base} (${n})`;
}
