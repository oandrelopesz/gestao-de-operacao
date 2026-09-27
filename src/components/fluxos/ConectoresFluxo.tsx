// Pontos de conexão (bolinhas nas bordas das formas, como no Miro) e seta de dois cliques:
// - arrastar de uma bolinha mostra a seta seguindo o mouse e destaca a forma de destino; ao soltar nela, a seta nasce
//   presa nas duas (acompanha quando qualquer uma se move); soltar no vazio cria a seta até ali; Esc cancela;
// - clicar na bolinha, sem arrastar, não faz nada;
// - com a ferramenta seta, clicar no início e clicar no fim termina a seta (o padrão do Excalidraw seguia pedindo pontos).
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { createPortal } from "react-dom";
import { CaptureUpdateAction, convertToExcalidrawElements, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { LADOS, contem, ladoDeFrente, ladoPerto, pontoDoLado, type Lado, type Ponto } from "@/lib/fluxoConectores";
import { MARCA_ANCORA } from "./inserir";

const CONECTAVEIS = new Set(["rectangle", "ellipse", "diamond", "image"]);
/** Distância das bolinhas até a borda, na tela (px) — fora das alças de redimensionar */
const AFASTAMENTO = 22;
/** Em cima, com a forma selecionada, a bolinha sobe além da alça de girar */
const AFASTAMENTO_TOPO_SELECIONADA = 40;
const ARRASTE_MINIMO = 4;
/** Soltar a até esta distância (px na tela) de uma bolinha do destino encaixa naquele lado */
const ENCAIXE = 28;
const NOME_DO_LADO: Record<Lado, string> = { cima: "de cima", direita: "direito", baixo: "de baixo", esquerda: "esquerdo" };
const VAO_SETA = 4;

type El = ExcalidrawElement;

const ehAncora = (e: El) => !!(e.customData as Record<string, unknown> | undefined)?.[MARCA_ANCORA];
// Tópicos do mapa mental têm a barra própria (filho, irmão, recolher): sem bolinhas neles
const conectavel = (e: El) =>
  !e.isDeleted && !e.locked && CONECTAVEIS.has(e.type) && (e.opacity > 0 || ehAncora(e)) && !(e.customData as { mm?: unknown } | undefined)?.mm;
const novoId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/** Forma sob o ponteiro (a de cima primeiro); com `margem`, perto da borda também vale. */
function formaSob(elementos: readonly El[], p: Ponto, margem: number, ignorar?: string): El | null {
  let perto: El | null = null;
  for (let i = elementos.length - 1; i >= 0; i--) {
    const e = elementos[i];
    if (e.id === ignorar || !conectavel(e)) continue;
    if (contem(e, p)) return e;
    if (!perto && margem > 0 && contem(e, p, margem)) perto = e;
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

interface Ligacao {
  origem: string;
  lado: Lado;
  /** Ponteiro, em coordenadas da cena */
  ponteiro: Ponto;
  alvo: string | null;
  ladoAlvo: Lado | null;
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
  const [ligando, setLigando] = useState<Ligacao | null>(null);
  const [, setVersao] = useState(0);
  const assinatura = useRef("");
  const ligandoRef = useRef<Ligacao | null>(null);
  ligandoRef.current = ligando;

  // Ponteiro sobre o quadro → qual forma mostra as bolinhas
  useEffect(() => {
    if (!api) return;
    ouvintePonteiro.current = (p) => {
      if (ligandoRef.current) return;
      const a = api.getAppState();
      const e = formaSob(api.getSceneElements(), p, (AFASTAMENTO + 16) / a.zoom.value);
      const id = e?.id ?? null;
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
  const zoom = a.zoom.value;
  const naTela = (p: Ponto) => ({ left: (p.x + a.scrollX) * zoom, top: (p.y + a.scrollY) * zoom });
  const elementos = api.getSceneElements();
  const porId = (id: string | null) => (id ? elementos.find((e) => e.id === id && conectavel(e)) : undefined);

  /** Ponto da tela (clientX/Y) → coordenadas da cena, pela posição real do quadro na página */
  const paraCena = (clientX: number, clientY: number): Ponto => {
    const r = raiz.getBoundingClientRect();
    const st = api.getAppState();
    return { x: (clientX - r.left) / st.zoom.value - st.scrollX, y: (clientY - r.top) / st.zoom.value - st.scrollY };
  };

  /** Seta presa na origem (e no destino, se houver), numa só alteração com desfazer. */
  const criarSeta = (l: Ligacao) => {
    const todos = api.getSceneElementsIncludingDeleted();
    const origem = todos.find((e) => e.id === l.origem && !e.isDeleted);
    if (!origem) return;
    const alvo = l.alvo ? todos.find((e) => e.id === l.alvo && !e.isDeleted) : undefined;
    const inicio = pontoDoLado(origem, l.lado, VAO_SETA);
    const fim = alvo && l.ladoAlvo ? pontoDoLado(alvo, l.ladoAlvo, VAO_SETA) : l.ponteiro;
    if (Math.hypot(fim.x - inicio.x, fim.y - inicio.y) < 8) return;
    const st = api.getAppState();
    const id = novoId();
    const [base] = convertToExcalidrawElements([{
      id, type: "arrow", x: inicio.x, y: inicio.y, points: [[0, 0], [fim.x - inicio.x, fim.y - inicio.y]] as never,
      strokeColor: st.currentItemStrokeColor || "#1e1e1e", strokeWidth: 2, roughness: 0, endArrowhead: "arrow",
    }], { regenerateIds: false });
    const seta = newElementWith(base as never, {
      startBinding: { elementId: origem.id, focus: 0, gap: VAO_SETA },
      endBinding: alvo ? { elementId: alvo.id, focus: 0, gap: VAO_SETA } : null,
    } as never) as El;
    const ligada = (e: El) => newElementWith(e as never, { boundElements: [...(e.boundElements ?? []), { id, type: "arrow" }] } as never) as El;
    api.updateScene({
      elements: [...todos.map((e) => (e.id === origem.id || e.id === alvo?.id ? ligada(e) : e)), seta],
      appState: { selectedElementIds: { [id]: true }, selectedGroupIds: {} },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  const aoApertar = (origem: El, lado: Lado) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX, y0 = e.clientY;
    let arrastou = false;
    const atualizar = (ev: PointerEvent) => {
      const p = paraCena(ev.clientX, ev.clientY);
      const z = api.getAppState().zoom.value;
      const alvo = formaSob(api.getSceneElements(), p, 10 / z, origem.id);
      const ladoAlvo = alvo ? ladoPerto(alvo, p, ENCAIXE / z) ?? ladoDeFrente(origem, alvo) : null;
      setLigando({ origem: origem.id, lado, ponteiro: p, alvo: alvo?.id ?? null, ladoAlvo });
    };
    // Fase de captura na janela + stopPropagation: o Excalidraw não vê este arraste (senão selecionaria/moveria por baixo)
    const mover = (ev: PointerEvent) => {
      ev.stopPropagation();
      if (!arrastou && Math.hypot(ev.clientX - x0, ev.clientY - y0) < ARRASTE_MINIMO) return;
      arrastou = true;
      atualizar(ev);
    };
    const soltar = (ev: PointerEvent) => {
      ev.stopPropagation();
      encerrar();
      if (!arrastou) return; // clique sem arrastar: não faz nada
      const p = paraCena(ev.clientX, ev.clientY);
      const z = api.getAppState().zoom.value;
      const alvo = formaSob(api.getSceneElements(), p, 10 / z, origem.id);
      const ladoAlvo = alvo ? ladoPerto(alvo, p, ENCAIXE / z) ?? ladoDeFrente(origem, alvo) : null;
      criarSeta({ origem: origem.id, lado, ponteiro: p, alvo: alvo?.id ?? null, ladoAlvo });
    };
    const tecla = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      ev.stopPropagation();
      encerrar();
    };
    const encerrar = () => {
      window.removeEventListener("pointermove", mover, true);
      window.removeEventListener("pointerup", soltar, true);
      window.removeEventListener("pointercancel", encerrar, true);
      window.removeEventListener("keydown", tecla, true);
      document.body.classList.remove("fluxo-ligando");
      setLigando(null);
      setSobre(null);
    };
    document.body.classList.add("fluxo-ligando");
    window.addEventListener("pointermove", mover, true);
    window.addEventListener("pointerup", soltar, true);
    window.addEventListener("pointercancel", encerrar, true);
    window.addEventListener("keydown", tecla, true);
  };

  // Ligando: prévia da seta e destaque do destino
  if (ligando) {
    const origem = porId(ligando.origem);
    if (!origem) return null;
    const alvo = porId(ligando.alvo);
    const ini = naTela(pontoDoLado(origem, ligando.lado, VAO_SETA));
    const fimCena = alvo && ligando.ladoAlvo ? pontoDoLado(alvo, ligando.ladoAlvo, VAO_SETA) : ligando.ponteiro;
    const fim = naTela(fimCena);
    const caixa = alvo && { ...naTela({ x: alvo.x, y: alvo.y }), w: alvo.width * zoom, h: alvo.height * zoom };
    return createPortal(
      <div className="pointer-events-none absolute inset-0 z-[3] overflow-hidden">
        <svg className="fluxo-previa" width="100%" height="100%">
          <defs>
            <marker id="fluxo-ponta" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" />
            </marker>
          </defs>
          {caixa && (
            <rect className="fluxo-previa-alvo" x={caixa.left - 6} y={caixa.top - 6} width={caixa.w + 12} height={caixa.h + 12} rx={10}
              transform={alvo!.angle ? `rotate(${(alvo!.angle * 180) / Math.PI} ${caixa.left + caixa.w / 2} ${caixa.top + caixa.h / 2})` : undefined} />
          )}
          <line className="fluxo-previa-linha" x1={ini.left} y1={ini.top} x2={fim.left} y2={fim.top} markerEnd="url(#fluxo-ponta)" />
        </svg>
        {alvo && LADOS.map((l) => {
          const p = naTela(pontoDoLado(alvo, l));
          return <span key={l} className={l === ligando.ladoAlvo ? "fluxo-encaixe fluxo-encaixe-ativo" : "fluxo-encaixe"} style={{ left: p.left, top: p.top }} />;
        })}
      </div>,
      raiz,
    );
  }

  const ids = Object.keys(a.selectedElementIds);
  const alvo = porId(sobre ?? (ids.length === 1 ? ids[0] : null));
  if (!alvo || ocupado(a)) return null;
  const selecionada = !!a.selectedElementIds[alvo.id] || alvo.groupIds.some((g) => a.selectedGroupIds[g]);
  // Faixa de funil/pirâmide: só esquerda e direita (em cima e embaixo estão as faixas vizinhas)
  const grupoDoAlvo = ehAncora(alvo) ? alvo.groupIds[alvo.groupIds.length - 1] : undefined;
  const faixa = !!grupoDoAlvo && elementos.filter((e) => ehAncora(e) && e.groupIds.includes(grupoDoAlvo)).length > 1;
  const lados: Lado[] = faixa ? ["direita", "esquerda"] : LADOS;

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
            title="Arraste até outra forma para ligar com seta"
            aria-label={`Ligar pelo lado ${NOME_DO_LADO[lado]}`}
            onPointerDown={aoApertar(alvo, lado)}
            onContextMenu={(e) => e.preventDefault()}
          />
        );
      })}
    </div>,
    raiz,
  );
}
