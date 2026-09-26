// Cena dos quadros (formato do Excalidraw) ↔ o que vai para o banco: elementos vivos, poucas opções de tela e o mapa
// das imagens guardadas no Storage (o conteúdo das imagens nunca vai para o JSON). Sem dependências.

export type ElementoMinimo = {
  id: string;
  type: string;
  version: number;
  isDeleted?: boolean;
  text?: string;
  fileId?: string | null;
  [k: string]: unknown;
};

export interface ArquivoSalvo {
  caminho: string;
  mimeType: string;
}

export interface CenaSalva {
  elements: ElementoMinimo[];
  appState: { viewBackgroundColor?: string; gridSize?: number | null; gridModeEnabled?: boolean };
  arquivos: Record<string, ArquivoSalvo>;
}

export function cenaVazia(): CenaSalva {
  return { elements: [], appState: {}, arquivos: {} };
}

export function lerCena(json: unknown): CenaSalva {
  const c = (json && typeof json === "object" ? json : {}) as Partial<CenaSalva>;
  return {
    elements: Array.isArray(c.elements) ? (c.elements as ElementoMinimo[]) : [],
    appState: c.appState && typeof c.appState === "object" ? c.appState : {},
    arquivos: c.arquivos && typeof c.arquivos === "object" ? c.arquivos : {},
  };
}

export function arquivosUsados(elements: readonly ElementoMinimo[]): Set<string> {
  return new Set(elements.filter((e) => !e.isDeleted && e.type === "image" && e.fileId).map((e) => e.fileId as string));
}

export function montarCena(
  elements: readonly ElementoMinimo[],
  appState: { viewBackgroundColor?: string; gridSize?: number | null; gridModeEnabled?: boolean; [k: string]: unknown },
  arquivos: Record<string, ArquivoSalvo>,
): CenaSalva {
  const usados = arquivosUsados(elements);
  return {
    elements: elements.filter((e) => !e.isDeleted),
    appState: {
      viewBackgroundColor: appState.viewBackgroundColor,
      gridSize: appState.gridSize ?? null,
      gridModeEnabled: !!appState.gridModeEnabled,
    },
    arquivos: Object.fromEntries(Object.entries(arquivos).filter(([id]) => usados.has(id))),
  };
}

/** Imagens que estão no quadro e ainda não foram para o Storage. */
export function arquivosParaSubir(
  files: Record<string, { mimeType: string }>,
  salvos: Record<string, ArquivoSalvo>,
  usados: Set<string>,
): string[] {
  return Object.keys(files).filter((id) => usados.has(id) && !salvos[id]);
}

/** Imagens guardadas que saíram do quadro. */
export function arquivosParaApagar(salvos: Record<string, ArquivoSalvo>, usados: Set<string>): { id: string; caminho: string }[] {
  return Object.entries(salvos).filter(([id]) => !usados.has(id)).map(([id, a]) => ({ id, caminho: a.caminho }));
}

/** Textos do quadro (para a busca da lista). */
export function textosDaCena(elements: readonly ElementoMinimo[]): string {
  return elements
    .filter((e) => !e.isDeleted && typeof e.text === "string" && e.text.trim())
    .map((e) => (e.text as string).trim())
    .join("\n");
}

/** Muda quando algum elemento muda (para saber se precisa salvar). */
export function assinaturaDaCena(elements: readonly ElementoMinimo[]): string {
  let soma = 0;
  for (const e of elements) soma += (e.version ?? 0) * (e.isDeleted ? 3 : 1);
  return `${elements.length}:${soma}`;
}

export function extensaoDoMime(mime: string): string {
  const mapa: Record<string, string> = {
    "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg", "image/avif": "avif",
  };
  return mapa[mime] ?? "bin";
}

/** Centro da parte visível do quadro, em coordenadas da cena. */
export function centroDaTela(a: { scrollX: number; scrollY: number; width: number; height: number; zoom: { value: number } }): { x: number; y: number } {
  return { x: -a.scrollX + a.width / 2 / a.zoom.value, y: -a.scrollY + a.height / 2 / a.zoom.value };
}
