// Inserção de formas e cards no quadro: peças de fluxoFormas → elementos do Excalidraw, agrupados e colocados no
// centro da parte visível, já selecionados (clique no painel = aparece no meio da tela, pronto para arrastar).
import { CaptureUpdateAction, FONT_FAMILY, ROUNDNESS, convertToExcalidrawElements, getCommonBounds } from "@excalidraw/excalidraw";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { centroDaTela } from "@/lib/fluxoCena";
import type { Peca } from "@/lib/fluxoFormas";

export interface Cor { nome: string; fundo: string; traco: string }

/** Pares de preenchimento claro + contorno da paleta do Excalidraw. */
export const CORES: Cor[] = [
  { nome: "Azul", fundo: "#a5d8ff", traco: "#1971c2" },
  { nome: "Verde", fundo: "#b2f2bb", traco: "#2f9e44" },
  { nome: "Amarelo", fundo: "#ffec99", traco: "#f08c00" },
  { nome: "Laranja", fundo: "#ffd8a8", traco: "#e8590c" },
  { nome: "Vermelho", fundo: "#ffc9c9", traco: "#e03131" },
  { nome: "Roxo", fundo: "#d0bfff", traco: "#6741d9" },
  { nome: "Cinza", fundo: "#e9ecef", traco: "#495057" },
  { nome: "Branco", fundo: "#ffffff", traco: "#1e1e1e" },
];

const COR_TEXTO = "#1e1e1e";

const novoId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

type Esqueleto = ExcalidrawElementSkeleton & { id: string };
/** Texto que deve ficar centrado num ponto depois de medido (o Excalidraw calcula a largura real do texto). */
type Centro = { id: string; cx: number; cy: number };

/** Peças de uma forma extra → esqueletos do Excalidraw, todos num mesmo grupo (movem e escalam juntos). */
export function pecasParaEsqueletos(pecas: Peca[], cor: Cor): { esqueletos: Esqueleto[]; centros: Centro[] } {
  const grupo = novoId();
  const base = {
    strokeColor: cor.traco, backgroundColor: cor.fundo, fillStyle: "solid" as const, strokeWidth: 2, roughness: 0, groupIds: [grupo],
  };
  const centros: Centro[] = [];
  const esqueletos = pecas.map((p): Esqueleto => {
    const id = novoId();
    if (p.tipo === "poligono") {
      return { id, type: "line", x: p.x, y: p.y, points: p.pontos as never, roundness: null, ...base };
    }
    if (p.tipo === "elipse") {
      return { id, type: "ellipse", x: p.x, y: p.y, width: p.largura, height: p.altura, ...base };
    }
    // Rótulo das faixas: `y` vem 10 px acima do meio da faixa
    centros.push({ id, cx: p.x + p.largura / 2, cy: p.y + 10 });
    return {
      id, type: "text", x: p.x, y: p.y, text: p.texto, fontSize: 18, fontFamily: FONT_FAMILY.Nunito, textAlign: "center",
      strokeColor: COR_TEXTO, groupIds: [grupo],
    };
  });
  return { esqueletos, centros };
}

export type TipoCard = "arredondado" | "quadrado" | "postit" | "etapa" | "etiqueta";

export const CARDS: { id: TipoCard; rotulo: string }[] = [
  { id: "arredondado", rotulo: "Card arredondado" },
  { id: "quadrado", rotulo: "Card quadrado" },
  { id: "postit", rotulo: "Post-it" },
  { id: "etapa", rotulo: "Card de etapa" },
  { id: "etiqueta", rotulo: "Etiqueta" },
];

/** Card = retângulo nativo com o texto dentro (quebra linha e cresce sozinho; duplo clique edita). */
export function esqueletoDoCard(tipo: TipoCard, cor: Cor): Esqueleto {
  const id = novoId();
  const comum = { id, type: "rectangle" as const, x: 0, y: 0, strokeWidth: 2, roughness: 0, fillStyle: "solid" as const };
  const texto = (text: string, extra: object = {}) => ({ text, fontSize: 20, fontFamily: FONT_FAMILY.Nunito, strokeColor: COR_TEXTO, ...extra });
  switch (tipo) {
    case "arredondado":
      return { ...comum, width: 220, height: 100, backgroundColor: cor.fundo, strokeColor: cor.traco,
        roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS }, label: texto("Card") };
    case "quadrado":
      return { ...comum, width: 220, height: 100, backgroundColor: cor.fundo, strokeColor: cor.traco, roundness: null, label: texto("Card") };
    case "postit":
      return { ...comum, width: 200, height: 200, backgroundColor: "#fff3a3", strokeColor: "transparent", roundness: null,
        label: texto("Anotação", { textAlign: "left", verticalAlign: "top" }) };
    case "etapa":
      return { ...comum, width: 260, height: 140, backgroundColor: cor.fundo, strokeColor: cor.traco,
        roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
        label: texto("Título da etapa\n\nDescrição da etapa", { textAlign: "left", verticalAlign: "top", fontSize: 18 }) };
    case "etiqueta":
      return { ...comum, width: 150, height: 44, backgroundColor: cor.traco, strokeColor: cor.traco,
        roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS }, label: texto("Etiqueta", { fontSize: 16, strokeColor: "#ffffff" }) };
  }
}

/** Converte, centra no meio da tela, adiciona à cena (com desfazer) e deixa selecionado. */
export function inserirNoCentro(api: ExcalidrawImperativeAPI, esqueletos: Esqueleto[], centros: Centro[] = []): void {
  let novos: ExcalidrawElement[] = convertToExcalidrawElements(esqueletos, { regenerateIds: false });
  if (!novos.length) return;
  const centroDe = new Map(centros.map((c) => [c.id, c]));
  novos = novos.map((e) => {
    const c = centroDe.get(e.id);
    return c ? { ...e, x: c.cx - e.width / 2, y: c.cy - e.height / 2 } : e;
  });
  const [minX, minY, maxX, maxY] = getCommonBounds(novos);
  const alvo = centroDaTela(api.getAppState());
  const dx = alvo.x - (minX + maxX) / 2;
  const dy = alvo.y - (minY + maxY) / 2;
  novos = novos.map((e) => ({ ...e, x: e.x + dx, y: e.y + dy }));
  const grupos = new Set(novos.flatMap((e) => e.groupIds));
  api.setActiveTool({ type: "selection" });
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), ...novos],
    appState: {
      // Texto dentro de card acompanha o card; só o card fica selecionado
      selectedElementIds: Object.fromEntries(novos.filter((e) => !("containerId" in e && e.containerId)).map((e) => [e.id, true])),
      selectedGroupIds: Object.fromEntries([...grupos].map((g) => [g, true])),
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}
