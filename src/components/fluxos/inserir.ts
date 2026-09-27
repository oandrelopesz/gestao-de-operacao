// Inserção de formas e cards no quadro: peças de fluxoFormas → elementos do Excalidraw, agrupados e colocados no
// centro da parte visível, já selecionados (clique no painel = aparece no meio da tela, pronto para arrastar).
import { CaptureUpdateAction, FONT_FAMILY, ROUNDNESS, convertToExcalidrawElements, getCommonBounds } from "@excalidraw/excalidraw";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { centroDaTela } from "@/lib/fluxoCena";
import { lugarLivre } from "@/lib/fluxoConectores";
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

/** Marca das âncoras invisíveis (onde setas se prendem e o duplo clique escreve); os pontos de conexão usam isso. */
export const MARCA_ANCORA = "ancora";

/** Peças de uma forma extra → esqueletos do Excalidraw, todos num mesmo grupo (movem e escalam juntos). */
export function pecasParaEsqueletos(pecas: Peca[], cor: Cor): Esqueleto[] {
  const grupo = novoId();
  const base = {
    strokeColor: cor.traco, backgroundColor: cor.fundo, fillStyle: "solid" as const, strokeWidth: 2, roughness: 0, groupIds: [grupo],
  };
  return pecas.map((p): Esqueleto => {
    const id = novoId();
    if (p.tipo === "poligono") {
      return { id, type: "line", x: p.x, y: p.y, points: p.pontos as never, roundness: null, ...base };
    }
    if (p.tipo === "elipse") {
      return { id, type: "ellipse", x: p.x, y: p.y, width: p.largura, height: p.altura, ...base };
    }
    // Âncora: invisível (opacidade 0) mas preenchida, para o clique e a seta "pegarem" em toda a área
    return {
      id, type: p.forma === "elipse" ? "ellipse" : "rectangle", x: p.x, y: p.y, width: p.largura, height: p.altura,
      ...base, opacity: 0, roundness: null, customData: { [MARCA_ANCORA]: true },
      ...(p.texto
        ? { label: { text: p.texto, fontSize: 18, fontFamily: FONT_FAMILY.Nunito, strokeColor: COR_TEXTO, groupIds: [grupo] } }
        : {}),
    };
  });
}

export type TipoCard = "arredondado" | "quadrado" | "postit" | "etapa" | "destaque" | "etiqueta";

export const CARDS: { id: TipoCard; rotulo: string }[] = [
  { id: "arredondado", rotulo: "Card arredondado" },
  { id: "quadrado", rotulo: "Card quadrado" },
  { id: "postit", rotulo: "Post-it" },
  { id: "etapa", rotulo: "Card de etapa" },
  { id: "destaque", rotulo: "Destaque" },
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
    case "destaque":
      return { ...comum, width: 220, height: 100, backgroundColor: cor.traco, strokeColor: cor.traco,
        roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS }, label: texto("Destaque", { strokeColor: "#ffffff" }) };
    case "etiqueta":
      return { ...comum, width: 150, height: 44, backgroundColor: cor.traco, strokeColor: cor.traco,
        roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS }, label: texto("Etiqueta", { fontSize: 16, strokeColor: "#ffffff" }) };
  }
}

/** Centro da parte do quadro que está à vista (sem o painel lateral aberto por cima), em coordenadas da cena. */
export function centroVisivel(api: ExcalidrawImperativeAPI): { x: number; y: number } {
  const a = api.getAppState();
  const painel = document.querySelector<HTMLElement>(".excalidraw .sidebar");
  // Painel solto fica por cima do quadro; fixado, ele encolhe o quadro e fica fora da conta (o min abaixo resolve os dois)
  const cobre = painel ? painel.getBoundingClientRect() : null;
  if (!cobre || cobre.width === 0) return centroDaTela(a);
  const direita = Math.min(a.offsetLeft + a.width, cobre.left);
  const cx = (a.offsetLeft + direita) / 2;
  const cy = a.offsetTop + a.height / 2;
  return { x: (cx - a.offsetLeft) / a.zoom.value - a.scrollX, y: (cy - a.offsetTop) / a.zoom.value - a.scrollY };
}

/** Converte, centra no meio da tela, adiciona à cena (com desfazer) e deixa selecionado. */
export function inserirNoCentro(api: ExcalidrawImperativeAPI, esqueletos: Esqueleto[]): void {
  let novos: ExcalidrawElement[] = convertToExcalidrawElements(esqueletos, { regenerateIds: false });
  if (!novos.length) return;
  const [minX, minY, maxX, maxY] = getCommonBounds(novos);
  // No meio da parte visível; se já houver algo ali, no espaço livre mais perto (nada cai em cima de outra forma)
  const ocupadas = api.getSceneElements().map((e) => {
    const [x1, y1, x2, y2] = getCommonBounds([e]);
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  });
  const canto = lugarLivre(centroVisivel(api), maxX - minX, maxY - minY, ocupadas);
  const dx = canto.x - minX;
  const dy = canto.y - minY;
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
  // O espaço livre mais perto pode ficar fora da tela (quadro cheio, celular): a tela desliza até a forma nova
  const a = api.getAppState();
  const [nx1, ny1, nx2, ny2] = getCommonBounds(novos);
  const vx1 = -a.scrollX, vy1 = -a.scrollY, vx2 = vx1 + a.width / a.zoom.value, vy2 = vy1 + a.height / a.zoom.value;
  if (nx1 < vx1 || ny1 < vy1 || nx2 > vx2 || ny2 > vy2) api.scrollToContent(novos, { animate: true, duration: 350 });
}
