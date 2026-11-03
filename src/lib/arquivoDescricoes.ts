// Descrições de um arquivo (aba Arquivos): cada arquivo tem várias, cada uma com nome e texto.
// Ficam em pdfs.descricoes (jsonb). A coluna antiga pdfs.observacoes continua guardando o texto
// de todas juntas, para a busca e para arquivos anteriores a esta mudança.

export type Descricao = {
  id: string;
  titulo: string;
  texto: string;
}

export const TITULO_PADRAO = "Observações";

let contador = 0;
export function novaDescricao(titulo = "", texto = ""): Descricao {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `d${Date.now()}-${contador++}`;
  return { id, titulo, texto };
}

/** Lê o jsonb do banco com tolerância: ignora o que não tem a forma certa. */
export function lerDescricoes(valor: unknown): Descricao[] {
  if (!Array.isArray(valor)) return [];
  const saida: Descricao[] = [];
  for (const item of valor) {
    if (!item || typeof item !== "object") continue;
    const { id, titulo, texto } = item as Record<string, unknown>;
    if (typeof texto !== "string" && typeof titulo !== "string") continue;
    saida.push({
      id: typeof id === "string" && id ? id : novaDescricao().id,
      titulo: typeof titulo === "string" ? titulo : "",
      texto: typeof texto === "string" ? texto : "",
    });
  }
  return saida;
}

/** Descrições do arquivo; arquivo antigo (só com observações) vira uma descrição "Observações". */
export function descricoesDe(a: { descricoes?: unknown; observacoes?: string | null }): Descricao[] {
  const lidas = lerDescricoes(a.descricoes);
  if (lidas.length) return lidas;
  const antigo = a.observacoes?.trim();
  return antigo ? [{ id: "observacoes-antigas", titulo: TITULO_PADRAO, texto: antigo }] : [];
}

/** Tira espaços das pontas e descarta a descrição em que nome e texto estão vazios. */
export function limparDescricoes(lista: Descricao[]): Descricao[] {
  return lista
    .map((d) => ({ id: d.id, titulo: d.titulo.trim(), texto: d.texto.trim() }))
    .filter((d) => d.titulo || d.texto);
}

/** Texto de todas as descrições juntas (busca e coluna observacoes); null se não há nenhuma. */
export function resumoDescricoes(lista: Descricao[]): string | null {
  const partes = limparDescricoes(lista).map((d) => (d.titulo && d.texto ? `${d.titulo}\n${d.texto}` : d.titulo || d.texto));
  return partes.length ? partes.join("\n\n") : null;
}

/** Os dois campos que vão para o banco, a partir da lista editada. */
export function camposParaSalvar(lista: Descricao[]): { descricoes: Descricao[]; observacoes: string | null } {
  const limpa = limparDescricoes(lista);
  return { descricoes: limpa, observacoes: resumoDescricoes(limpa) };
}

/** Uma linha de prévia para o card fechado. */
export function previaDescricao(lista: Descricao[]): string {
  const d = lista[0];
  if (!d) return "";
  const primeira = d.texto.split("\n").find((l) => l.trim())?.trim() ?? "";
  const base = d.titulo ? (primeira ? `${d.titulo}: ${primeira}` : d.titulo) : primeira;
  return lista.length > 1 ? `${base} (+${lista.length - 1})` : base;
}
