// Pontos de conexão (bolinhas nas bordas das formas, como no Miro) e seta de dois cliques:
// - arrastar de uma bolinha mostra o conector seguindo o mouse e destaca a forma de destino; perto de uma bolinha dela a
//   ponta gruda ali (ímã), no resto da forma vai para o lado que dá a ligação mais limpa; soltar no vazio deixa a ponta
//   solta; Esc cancela. A prévia é exatamente a seta que fica (mesma rota, mesmo desenho);
// - clicar na bolinha, sem arrastar, não faz nada;
// - conector selecionado: no lugar dos pontos do Excalidraw, duas alças nas pontas — arrastar uma religa aquela ponta;
// - com a ferramenta seta, clicar no início e clicar no fim termina a seta (o padrão do Excalidraw seguia pedindo pontos).
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { createPortal } from "react-dom";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { caminhoDaCurva, contem, type Lado, type Ponto } from "@/lib/fluxoConectores";
import {
  conexaoDe, criarConector, dadosConector, ehConector, escolherLado, esconderConector, extremidadeDaPonta, extremidadeDe,
  formaLigavelSob, ladosDe, moverPonta, podeLigar, pontosEntre, reavaliarPontas, setasDe, setasParaConverter, sincronizarConectores,
  type Ponta,
} from "./conectores";
import { MARCA_ANCORA } from "./inserir";

const CONECTAVEIS = new Set(["rectangle", "ellipse", "diamond", "image"]);
/** Distância das bolinhas até a borda, na tela (px) — fora das alças de redimensionar */
const AFASTAMENTO = 22;
/** Em cima, com a forma selecionada, a bolinha sobe além da alça de girar */
const AFASTAMENTO_TOPO_SELECIONADA = 40;
const ARRASTE_MINIMO = 4;
/** Folga (px na tela) em volta da forma que ainda conta como "soltar nela" */
const MARGEM_DO_ALVO = 16;
const NOME_DO_LADO: Record<Lado, string> = { cima: "de cima", direita: "direito", baixo: "de baixo", esquerda: "esquerdo" };

type El = ExcalidrawElement;
type SetaEl = El & { points: readonly [number, number][]; startArrowhead: string | null; endArrowhead: string | null };

const ehAncora = (e: El) => !!(e.customData as Record<string, unknown> | undefined)?.[MARCA_ANCORA];
// Tópicos do mapa mental têm a barra própria (filho, irmão, recolher): sem bolinhas neles
const conectavel = (e: El) =>
  !e.isDeleted && !e.locked && CONECTAVEIS.has(e.type) && (e.opacity > 0 || ehAncora(e)) && !(e.customData as { mm?: unknown } | undefined)?.mm;
const ehLigacaoDoMapa = (e: El) => !!(e.customData as { mmLigacao?: unknown } | undefined)?.mmLigacao;

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
  /** A ponta que fica parada: a bolinha de onde saiu (conector novo) ou a outra ponta do conector */
  fixa: Ponta;
  /** Qual ponta da seta segue o mouse ("para" num conector novo) */
  movendo: "de" | "para";
  /** Conector cuja ponta está sendo arrastada (null = conector novo) */
  seta: string | null;
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
      const sel = ids.length === 1 ? elements.find((x) => x.id === ids[0]) : null;
      const nova = `${alvo}|${e?.version}|${sel?.version}|${a.scrollX}|${a.scrollY}|${a.zoom.value}|${ids.join(",")}|${ocupado(a)}`;
      if (nova !== assinatura.current) {
        assinatura.current = nova;
        setVersao((v) => v + 1);
      }
    });
  }, [api, sobre]);

  // Conector selecionado não mostra os pontos do Excalidraw (seriam dezenas, a curva é feita de pontos próximos) nem abre
  // o editor de pontos: as pontas dele são as nossas alças
  useEffect(() => {
    if (!api) return;
    return api.onChange((elements, a) => {
      const id = a.editingLinearElement?.elementId ?? a.selectedLinearElement?.elementId;
      if (!id || a.selectedLinearElement?.isDragging) return;
      const e = elements.find((x) => x.id === id);
      if (!ehConector(e)) return;
      if (a.editingLinearElement) api.updateScene({ appState: { selectedLinearElement: null, editingLinearElement: null } });
      else api.updateScene({ appState: { selectedLinearElement: null } });
    });
  }, [api]);

  // Conectores sempre colados nas bolinhas: a cada mudança (uma vez por quadro de animação), converte setas presas do
  // jeito do Excalidraw e recalcula as que mudaram. Pontas sendo arrastadas pela pessoa ficam de fora até ela soltar.
  useEffect(() => {
    if (!api) return;
    let pontaArrastada: string | null = null;
    const reavaliar = new Set<string>();
    let agendado = 0;
    const rodar = () => {
      agendado = 0;
      const a = api.getAppState();
      const pular = new Set<string>();
      if (a.newElement) pular.add(a.newElement.id);
      if (a.multiElement) pular.add(a.multiElement.id);
      if (a.selectedLinearElement?.isDragging) pular.add(a.selectedLinearElement.elementId);
      if (a.selectedElementsAreBeingDragged) Object.keys(a.selectedElementIds).forEach((id) => pular.add(id));
      const vivos = api.getSceneElements();
      const ids = [...new Set([...setasParaConverter(vivos, pular), ...[...reavaliar].filter((id) => !pular.has(id))])];
      reavaliar.clear();
      if (ids.length) reavaliarPontas(api, ids);
      sincronizarConectores(api, pular);
    };
    const cancelar = api.onChange((_elements, a) => {
      const agora = a.selectedLinearElement?.isDragging ? a.selectedLinearElement.elementId : null;
      if (pontaArrastada && pontaArrastada !== agora) reavaliar.add(pontaArrastada);
      pontaArrastada = agora;
      if (!agendado) agendado = requestAnimationFrame(rodar);
    });
    return () => {
      cancelar();
      if (agendado) cancelAnimationFrame(agendado);
    };
  }, [api]);

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
  const zoom = a.zoom.value;
  const naTela = (p: Ponto) => ({ left: (p.x + a.scrollX) * zoom, top: (p.y + a.scrollY) * zoom });
  const elementos = api.getSceneElements();
  const porIdMapa = new Map(elementos.map((e) => [e.id, e]));
  const porId = (id: string | null) => (id ? elementos.find((e) => e.id === id && conectavel(e)) : undefined);
  // A dica do Excalidraw para setas ("Ctrl + duplo clique edita os pontos") não vale para conectores
  const idsSel = Object.keys(a.selectedElementIds);
  raiz.classList.toggle("conector-ativo", idsSel.length === 1 && ehConector(porIdMapa.get(idsSel[0])));

  /** Ponto da tela (clientX/Y) → coordenadas da cena, pela posição real do quadro na página */
  const paraCena = (clientX: number, clientY: number): Ponto => {
    const r = raiz.getBoundingClientRect();
    const st = api.getAppState();
    return { x: (clientX - r.left) / st.zoom.value - st.scrollX, y: (clientY - r.top) / st.zoom.value - st.scrollY };
  };

  /** Ponta que segue o mouse: a bolinha do destino (ímã ou melhor lado) ou o próprio ponteiro */
  const pontaMovel = (l: Ligacao): Ponta => (l.alvo && l.ladoAlvo ? { id: l.alvo, lado: l.ladoAlvo } : { x: l.ponteiro.x, y: l.ponteiro.y });

  /**
   * Arraste de uma bolinha ou de uma alça de ponta. Eventos na janela, em captura e sem propagar: o Excalidraw não vê
   * este arraste (senão selecionaria ou moveria por baixo). Clique sem arrastar não faz nada.
   */
  const arrastar = (
    base: Omit<Ligacao, "ponteiro" | "alvo" | "ladoAlvo">,
    aoSoltar: (l: Ligacao) => void,
    aoComecar?: () => void,
    aoDesistir?: () => void,
  ) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX, y0 = e.clientY;
    let arrastou = false;
    const destino = (ev: PointerEvent): Ligacao => {
      const p = paraCena(ev.clientX, ev.clientY);
      const st = api.getAppState();
      const vivos = api.getSceneElements();
      const alvo = formaLigavelSob(vivos, p, MARGEM_DO_ALVO / st.zoom.value, "id" in base.fixa ? base.fixa.id : undefined);
      if (!alvo) return { ...base, ponteiro: p, alvo: null, ladoAlvo: null };
      const fixa = extremidadeDaPonta(base.fixa, new Map(vivos.map((x) => [x.id, x])), vivos);
      const lado = fixa ? escolherLado(alvo, p, st.zoom.value, fixa, vivos, base.movendo === "para").lado : ladosDe(alvo, vivos)[0];
      return { ...base, ponteiro: p, alvo: alvo.id, ladoAlvo: lado };
    };
    const mover = (ev: PointerEvent) => {
      ev.stopPropagation();
      if (!arrastou && Math.hypot(ev.clientX - x0, ev.clientY - y0) < ARRASTE_MINIMO) return;
      if (!arrastou) aoComecar?.();
      arrastou = true;
      setLigando(destino(ev));
    };
    const soltar = (ev: PointerEvent) => {
      ev.stopPropagation();
      encerrar();
      if (arrastou) aoSoltar(destino(ev));
    };
    const tecla = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      ev.stopPropagation();
      encerrar();
      if (arrastou) aoDesistir?.();
    };
    const encerrar = () => {
      window.removeEventListener("pointermove", mover, true);
      window.removeEventListener("pointerup", soltar, true);
      window.removeEventListener("pointercancel", cancelar, true);
      window.removeEventListener("keydown", tecla, true);
      document.body.classList.remove("fluxo-ligando");
      setLigando(null);
      setSobre(null);
    };
    const cancelar = () => {
      encerrar();
      if (arrastou) aoDesistir?.();
    };
    document.body.classList.add("fluxo-ligando");
    window.addEventListener("pointermove", mover, true);
    window.addEventListener("pointerup", soltar, true);
    window.addEventListener("pointercancel", cancelar, true);
    window.addEventListener("keydown", tecla, true);
  };

  // Conector novo saindo de uma bolinha; soltar no vazio, perto da própria bolinha, desiste
  const aoApertarBolinha = (origem: El, lado: Lado) =>
    arrastar({ fixa: { id: origem.id, lado }, movendo: "para", seta: null }, (l) => {
      const inicio = conexaoDe(origem, lado, api.getSceneElements()).ponto;
      if (!l.alvo && Math.hypot(l.ponteiro.x - inicio.x, l.ponteiro.y - inicio.y) < 12 / api.getAppState().zoom.value) return;
      criarConector(api, { id: origem.id, lado }, pontaMovel(l));
    });

  // Ponta de um conector selecionado: a seta some enquanto a prévia mostra a versão nova; Esc devolve como estava
  const aoApertarPonta = (seta: SetaEl, qual: "de" | "para") => {
    const dados = dadosConector(seta)!;
    const opacidade = seta.opacity;
    return arrastar(
      { fixa: qual === "de" ? dados.para : dados.de, movendo: qual, seta: seta.id },
      (l) => moverPonta(api, seta.id, qual, pontaMovel(l), opacidade),
      () => esconderConector(api, seta.id, true, opacidade),
      () => esconderConector(api, seta.id, false, opacidade),
    );
  };

  // Ligando: prévia da seta (a mesma rota e o mesmo desenho da seta que vai ficar) e destaque do destino
  if (ligando) {
    const fixa = extremidadeDaPonta(ligando.fixa, porIdMapa, elementos);
    if (!fixa) return null;
    const alvo = ligando.alvo ? elementos.find((e) => e.id === ligando.alvo && podeLigar(e)) : undefined;
    const movel = alvo && ligando.ladoAlvo ? extremidadeDe(alvo, ligando.ladoAlvo, elementos) : { ponto: ligando.ponteiro, normal: null, caixa: null };
    const seta = ligando.seta ? (porIdMapa.get(ligando.seta) as SetaEl | undefined) : undefined;
    const [de, para] = ligando.movendo === "para" ? [fixa, movel] : [movel, fixa];
    const pontos = pontosEntre(de, para, !!seta && !seta.roundness, seta ? setasDe(seta) : undefined).map((p) => {
      const t = naTela(p);
      return { x: t.left, y: t.top };
    });
    const pontaNoFim = seta ? !!seta.endArrowhead : true;
    const pontaNoInicio = seta ? !!seta.startArrowhead : false;
    const caixa = alvo && { ...naTela({ x: alvo.x, y: alvo.y }), w: alvo.width * zoom, h: alvo.height * zoom };
    return createPortal(
      <div className="pointer-events-none absolute inset-0 z-[3] overflow-hidden">
        <svg className="fluxo-previa" width="100%" height="100%">
          <defs>
            <marker id="fluxo-ponta" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="9" markerHeight="9" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
              <path d="M1,1 L10,6 L1,11" />
            </marker>
          </defs>
          {caixa && (
            <rect className="fluxo-previa-alvo" x={caixa.left - 6} y={caixa.top - 6} width={caixa.w + 12} height={caixa.h + 12} rx={10}
              transform={alvo!.angle ? `rotate(${(alvo!.angle * 180) / Math.PI} ${caixa.left + caixa.w / 2} ${caixa.top + caixa.h / 2})` : undefined} />
          )}
          <path className="fluxo-previa-linha" d={caminhoDaCurva(pontos)} fill="none"
            markerEnd={pontaNoFim ? "url(#fluxo-ponta)" : undefined} markerStart={pontaNoInicio ? "url(#fluxo-ponta)" : undefined} />
        </svg>
        {alvo && ladosDe(alvo, elementos).map((l) => {
          const p = naTela(conexaoDe(alvo, l, elementos).ponto);
          return <span key={l} className={l === ligando.ladoAlvo ? "fluxo-encaixe fluxo-encaixe-ativo" : "fluxo-encaixe"} style={{ left: p.left, top: p.top }} />;
        })}
      </div>,
      raiz,
    );
  }

  if (ocupado(a)) return null;
  const ids = Object.keys(a.selectedElementIds);
  const selecionado = ids.length === 1 ? porIdMapa.get(ids[0]) : undefined;
  // Conector selecionado: alças nas duas pontas (as ligações do mapa mental seguem a árvore, sem alças)
  const conector = ehConector(selecionado) && !ehLigacaoDoMapa(selecionado) ? (selecionado as SetaEl) : null;
  const alvo = porId(sobre ?? (conector ? null : ids.length === 1 ? ids[0] : null));
  if (!alvo && !conector) return null;

  const bolinhas = (() => {
    if (!alvo) return null;
    const selecionada = !!a.selectedElementIds[alvo.id] || alvo.groupIds.some((g) => a.selectedGroupIds[g]);
    return ladosDe(alvo, elementos).map((lado) => {
      const afast = (lado === "cima" && selecionada ? AFASTAMENTO_TOPO_SELECIONADA : AFASTAMENTO) / zoom;
      const c = conexaoDe(alvo, lado, elementos);
      const pos = naTela({ x: c.ponto.x + c.normal.x * afast, y: c.ponto.y + c.normal.y * afast });
      return (
        <button
          key={`${alvo.id}-${lado}`}
          type="button"
          className="fluxo-conector"
          style={{ left: pos.left, top: pos.top }}
          title="Arraste até outra forma para ligar com seta"
          aria-label={`Ligar pelo lado ${NOME_DO_LADO[lado]}`}
          onPointerDown={aoApertarBolinha(alvo, lado)}
          onContextMenu={(e) => e.preventDefault()}
        />
      );
    });
  })();

  const pontas = conector && conector.points.length >= 2
    ? ([["de", conector.points[0]], ["para", conector.points[conector.points.length - 1]]] as const).map(([qual, p]) => {
      const pos = naTela({ x: conector.x + p[0], y: conector.y + p[1] });
      return (
        <button
          key={`${conector.id}-${qual}`}
          type="button"
          className="fluxo-ponta"
          style={{ left: pos.left, top: pos.top }}
          title="Arraste para ligar esta ponta em outro lugar"
          aria-label={qual === "de" ? "Mover o início da seta" : "Mover a ponta da seta"}
          onPointerDown={aoApertarPonta(conector, qual)}
          onContextMenu={(e) => e.preventDefault()}
        />
      );
    })
    : null;

  return createPortal(
    <div className="pointer-events-none absolute inset-0 z-[3] overflow-hidden">
      {bolinhas}
      {pontas}
    </div>,
    raiz,
  );
}
