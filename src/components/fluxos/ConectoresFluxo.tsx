// Pontos de conexão (bolinhas nas bordas das formas, como no Miro) e seta de dois cliques:
// - arrastar de uma bolinha até outra forma cria uma seta presa nas duas (o próprio Excalidraw desenha e prende);
// - clicar numa bolinha cria uma forma igual naquele lado, já ligada por seta;
// - com a ferramenta seta, clicar no início e clicar no fim termina a seta (o padrão do Excalidraw seguia pedindo pontos).
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { createPortal } from "react-dom";
import { CaptureUpdateAction, ROUNDNESS, convertToExcalidrawElements, getCommonBounds, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { LADOS, contem, ladoOposto, pontoDoLado, posicaoAoLado, type Caixa, type Lado, type Ponto } from "@/lib/fluxoConectores";
import { MARCA_ANCORA } from "./inserir";

const CONECTAVEIS = new Set(["rectangle", "ellipse", "diamond", "image"]);
/** Distância das bolinhas até a borda, na tela (px) — fora das alças de redimensionar */
const AFASTAMENTO = 22;
/** Em cima, com a forma selecionada, a bolinha sobe além da alça de girar */
const AFASTAMENTO_TOPO_SELECIONADA = 40;
const ARRASTE_MINIMO = 5;
const NOME_DO_LADO: Record<Lado, string> = { cima: "de cima", direita: "direito", baixo: "de baixo", esquerda: "esquerdo" };
const VAO_SETA = 4;

type El = ExcalidrawElement;

const ehAncora = (e: El) => !!(e.customData as Record<string, unknown> | undefined)?.[MARCA_ANCORA];
const conectavel = (e: El) => !e.isDeleted && !e.locked && CONECTAVEIS.has(e.type) && (e.opacity > 0 || ehAncora(e));
const novoId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/** Forma sob o ponteiro (a de cima primeiro); perto da borda também vale, para dar tempo de chegar à bolinha. */
function formaSob(elementos: readonly El[], p: Ponto, zoom: number): string | null {
  let perto: string | null = null;
  for (let i = elementos.length - 1; i >= 0; i--) {
    const e = elementos[i];
    if (!conectavel(e)) continue;
    if (contem(e, p)) return e.id;
    if (!perto && contem(e, p, (AFASTAMENTO + 14) / zoom)) perto = e.id;
  }
  return perto;
}

/** Nada de bolinhas enquanto a pessoa desenha, arrasta, gira, escreve ou recorta. */
function ocupado(a: AppState): boolean {
  return (
    a.activeTool.type !== "selection" || a.viewModeEnabled || !!a.newElement || !!a.multiElement || !!a.resizingElement ||
    !!a.selectionElement || !!a.editingTextElement || !!a.editingLinearElement || a.isResizing || a.isRotating ||
    a.selectedElementsAreBeingDragged || !!a.croppingElementId
  );
}

function caixaDe(els: readonly El[]): Caixa {
  const [x1, y1, x2, y2] = getCommonBounds(els);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** Esqueleto que copia o visual de um elemento (sem texto, sem ligações), com id novo. */
function copiaDe(e: El, extra: Partial<ExcalidrawElementSkeleton> = {}): ExcalidrawElementSkeleton & { id: string } {
  const base = {
    id: novoId(), x: e.x, y: e.y, width: e.width, height: e.height, angle: e.angle, strokeColor: e.strokeColor,
    backgroundColor: e.backgroundColor, fillStyle: e.fillStyle, strokeWidth: e.strokeWidth, strokeStyle: e.strokeStyle,
    roughness: e.roughness, opacity: e.opacity, roundness: e.roundness, customData: e.customData,
  };
  if (e.type === "line") return { ...base, type: "line", points: (e as El & { points: unknown }).points as never, ...extra } as never;
  return { ...base, type: e.type as "rectangle", ...extra } as never;
}

export function ConectoresFluxo({
  api,
  raiz,
  ouvintePonteiro,
}: {
  api: ExcalidrawImperativeAPI | null;
  /** O elemento .excalidraw: as bolinhas entram nele, entre o desenho (camadas 1–2) e as barras (camada 4) */
  raiz: HTMLElement | null;
  /** O quadro chama isto a cada movimento do ponteiro (coordenadas da cena) */
  ouvintePonteiro: MutableRefObject<((p: Ponto) => void) | null>;
}) {
  const [sobre, setSobre] = useState<string | null>(null);
  const [, setVersao] = useState(0);
  const assinatura = useRef("");
  const arrastando = useRef(false);

  // Ponteiro sobre o quadro → qual forma mostra as bolinhas
  useEffect(() => {
    if (!api) return;
    ouvintePonteiro.current = (p) => {
      if (arrastando.current) return;
      const id = formaSob(api.getSceneElements(), p, api.getAppState().zoom.value);
      setSobre((atual) => (atual === id ? atual : id));
    };
    return () => {
      ouvintePonteiro.current = null;
    };
  }, [api, ouvintePonteiro]);

  // Redesenha as bolinhas quando a forma, a rolagem, o zoom ou o estado mudam (e só então)
  useEffect(() => {
    if (!api) return;
    return api.onChange((elements, a) => {
      const ids = Object.keys(a.selectedElementIds);
      const alvo = sobre ?? (ids.length === 1 ? ids[0] : null);
      const e = alvo ? elements.find((x) => x.id === alvo) : null;
      const nova = `${alvo}|${e?.version}|${a.scrollX}|${a.scrollY}|${a.zoom.value}|${ids.join(",")}|${ocupado(a)}`;
      if (nova !== assinatura.current) {
        assinatura.current = nova;
        setVersao((v) => v + 1);
      }
    });
  }, [api, sobre]);

  // Duplo clique numa forma agrupada (cone, funil…): o Excalidraw só "entra" no grupo e seleciona a âncora sob o
  // ponteiro; aqui já abre o texto dela (Enter = escrever na forma selecionada)
  useEffect(() => {
    if (!api || !raiz) return;
    const aoDuploClique = () => {
      setTimeout(() => {
        const a = api.getAppState();
        if (a.editingTextElement || !a.editingGroupId) return;
        const ids = Object.keys(a.selectedElementIds);
        const el = ids.length === 1 ? api.getSceneElements().find((e) => e.id === ids[0]) : undefined;
        if (el && ehAncora(el)) {
          raiz.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
        }
      }, 30);
    };
    raiz.addEventListener("dblclick", aoDuploClique);
    return () => raiz.removeEventListener("dblclick", aoDuploClique);
  }, [api, raiz]);

  // Seta de dois cliques: no segundo clique com a mesma seta em andamento, termina (Esc = "finalizar" do Excalidraw)
  useEffect(() => {
    if (!api) return;
    let setaEmAndamento: string | null = null;
    let cliques = 0;
    return api.onPointerUp(() => {
      setTimeout(() => {
        const m = api.getAppState().multiElement;
        if (!m || m.type !== "arrow") {
          setaEmAndamento = null;
          cliques = 0;
          return;
        }
        if (m.id !== setaEmAndamento) {
          setaEmAndamento = m.id;
          cliques = 1;
          return;
        }
        cliques += 1;
        if (cliques >= 2) {
          setaEmAndamento = null;
          cliques = 0;
          document.querySelector(".excalidraw-container")?.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }),
          );
        }
      }, 0);
    });
  }, [api]);

  if (!api || !raiz) return null;
  const a = api.getAppState();
  const ids = Object.keys(a.selectedElementIds);
  const elementos = api.getSceneElements();
  const alvoId = sobre ?? (ids.length === 1 ? ids[0] : null);
  const alvo = alvoId ? elementos.find((e) => e.id === alvoId && conectavel(e)) : undefined;
  if (!alvo || ocupado(a)) return null;
  const selecionada = !!a.selectedElementIds[alvo.id] || alvo.groupIds.some((g) => a.selectedGroupIds[g]);
  // Faixa de funil/pirâmide: só esquerda e direita (em cima e embaixo estão as faixas vizinhas)
  const grupoDoAlvo = ehAncora(alvo) ? alvo.groupIds[alvo.groupIds.length - 1] : undefined;
  const faixa = !!grupoDoAlvo && elementos.filter((e) => ehAncora(e) && e.groupIds.includes(grupoDoAlvo)).length > 1;
  const lados: Lado[] = faixa ? ["direita", "esquerda"] : LADOS;
  const zoom = a.zoom.value;
  const naTela = (p: Ponto) => ({ left: (p.x + a.scrollX) * zoom, top: (p.y + a.scrollY) * zoom });

  /** Arrastou a partir da bolinha: entrega ao Excalidraw uma seta começando na borda da forma (ele prende e desenha). */
  const comecarSeta = (lado: Lado, ev: PointerEvent) => {
    const st = api.getAppState();
    const borda = pontoDoLado(alvo, lado, 0);
    const bx = (borda.x + st.scrollX) * st.zoom.value + st.offsetLeft;
    const by = (borda.y + st.scrollY) * st.zoom.value + st.offsetTop;
    api.setActiveTool({ type: "arrow" });
    setTimeout(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(".excalidraw canvas.interactive");
      if (!canvas) return;
      const comum = { pointerId: ev.pointerId, pointerType: ev.pointerType, isPrimary: true, button: 0, buttons: 1, bubbles: true, cancelable: true };
      canvas.dispatchEvent(new PointerEvent("pointerdown", { ...comum, clientX: bx, clientY: by }));
      window.dispatchEvent(new PointerEvent("pointermove", { ...comum, clientX: ev.clientX, clientY: ev.clientY }));
      arrastando.current = false;
    }, 0);
  };

  /** Clique na bolinha: forma igual (ou um card, se for faixa de funil/imagem) naquele lado, ligada por seta. */
  const criarLigada = (lado: Lado) => {
    const todos = api.getSceneElementsIncludingDeleted();
    const vivos = todos.filter((e) => !e.isDeleted);
    const grupo = ehAncora(alvo) ? alvo.groupIds[alvo.groupIds.length - 1] : undefined;
    const doGrupo = grupo ? vivos.filter((e) => e.groupIds.includes(grupo)) : [];
    const umaAncora = grupo && doGrupo.filter(ehAncora).length === 1;

    let esqueletos: (ExcalidrawElementSkeleton & { id: string })[];
    let destinoId: string;
    let origemCaixa: Caixa;
    if (umaAncora) {
      // Forma extra (cone, estrela…): copia o desenho inteiro, sem o texto
      const novoGrupo = novoId();
      origemCaixa = caixaDe(doGrupo.filter((e) => !("containerId" in e && e.containerId)));
      esqueletos = doGrupo
        .filter((e) => e.type !== "text")
        .map((e) => copiaDe(e, { groupIds: [novoGrupo] }));
      destinoId = esqueletos[doGrupo.filter((e) => e.type !== "text").findIndex(ehAncora)].id;
    } else if (grupo || alvo.type === "image") {
      // Faixa de funil/pirâmide ou imagem: um card arredondado na cor dela
      origemCaixa = { x: alvo.x, y: alvo.y, width: alvo.width, height: alvo.height };
      const id = novoId();
      esqueletos = [{
        id, type: "rectangle", x: 0, y: 0, width: 220, height: 96, strokeColor: alvo.type === "image" ? "#1e1e1e" : alvo.strokeColor,
        backgroundColor: alvo.type === "image" ? "#e9ecef" : alvo.backgroundColor, fillStyle: "solid", strokeWidth: 2, roughness: 0,
        roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
      }];
      destinoId = id;
    } else {
      origemCaixa = { x: alvo.x, y: alvo.y, width: alvo.width, height: alvo.height };
      const copia = copiaDe(alvo);
      esqueletos = [copia];
      destinoId = copia.id;
    }

    let novos: El[] = convertToExcalidrawElements(esqueletos, { regenerateIds: false });
    const caixaNova = caixaDe(novos);
    const ocupadas = vivos.filter((e) => e.type !== "arrow" && !(grupo && e.groupIds.includes(grupo)) && e.id !== alvo.id).map((e) => ({
      x: e.x, y: e.y, width: e.width, height: e.height,
    }));
    const pos = posicaoAoLado(origemCaixa, caixaNova.width, caixaNova.height, lado, ocupadas);
    const dx = pos.x - caixaNova.x, dy = pos.y - caixaNova.y;
    novos = novos.map((e) => ({ ...e, x: e.x + dx, y: e.y + dy }));
    const destino = novos.find((e) => e.id === destinoId)!;

    // Seta reta de borda a borda, presa nas duas formas (o Excalidraw recalcula quando uma delas mexer)
    const inicio = pontoDoLado(alvo, lado, VAO_SETA);
    const fim = pontoDoLado(destino, ladoOposto(lado), VAO_SETA);
    const setaId = novoId();
    const [setaBase] = convertToExcalidrawElements([{
      id: setaId, type: "arrow", x: inicio.x, y: inicio.y, points: [[0, 0], [fim.x - inicio.x, fim.y - inicio.y]] as never,
      strokeColor: "#1e1e1e", strokeWidth: 2, roughness: 0, endArrowhead: "arrow",
    }], { regenerateIds: false });
    const seta = newElementWith(setaBase as never, {
      startBinding: { elementId: alvo.id, focus: 0, gap: VAO_SETA },
      endBinding: { elementId: destino.id, focus: 0, gap: VAO_SETA },
    } as never) as El;
    novos = novos.map((e) => (e.id === destino.id ? { ...e, boundElements: [{ id: setaId, type: "arrow" as const }] } : e));
    const origemAtualizada = newElementWith(alvo as never, {
      boundElements: [...(alvo.boundElements ?? []), { id: setaId, type: "arrow" }],
    } as never) as El;

    const grupoNovo = destino.groupIds[0];
    api.updateScene({
      elements: [...todos.map((e) => (e.id === alvo.id ? origemAtualizada : e)), ...novos, seta],
      appState: {
        selectedElementIds: grupoNovo ? Object.fromEntries(novos.map((e) => [e.id, true])) : { [destino.id]: true },
        selectedGroupIds: grupoNovo ? { [grupoNovo]: true } : {},
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    setSobre(null);
  };

  const aoApertar = (lado: Lado) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX, y0 = e.clientY;
    arrastando.current = true;
    const mover = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < ARRASTE_MINIMO) return;
      soltarOuvintes();
      comecarSeta(lado, ev);
    };
    const soltar = () => {
      soltarOuvintes();
      arrastando.current = false;
      criarLigada(lado);
    };
    const soltarOuvintes = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  };

  return createPortal(
    <div className="pointer-events-none absolute inset-0 z-[3] overflow-hidden">
      {lados.map((lado) => {
        const afast = (lado === "cima" && selecionada ? AFASTAMENTO_TOPO_SELECIONADA : AFASTAMENTO) / zoom;
        const pos = naTela(pontoDoLado(alvo, lado, afast));
        return (
          <button
            key={`${alvo.id}-${lado}`}
            type="button"
            className="fluxo-conector"
            style={{ left: pos.left, top: pos.top }}
            title="Arraste até outra forma para ligar · clique para criar uma igual deste lado"
            aria-label={`Ligar pelo lado ${NOME_DO_LADO[lado]}`}
            onPointerDown={aoApertar(lado)}
            onContextMenu={(e) => e.preventDefault()}
          />
        );
      })}
    </div>,
    raiz,
  );
}
