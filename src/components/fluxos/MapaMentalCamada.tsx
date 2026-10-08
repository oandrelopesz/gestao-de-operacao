// Interação do mapa mental: atalhos de teclado, barra flutuante sobre o tópico selecionado, "+" grudados no tópico
// (sob o mouse ou selecionado), bolinha de ocultar o ramo, selo "+N" nos ramos recolhidos e reorganização automática
// ao terminar de escrever, arrastar ou redimensionar um tópico.
import { useEffect, useRef, useState, type MouseEvent as EventoMouse, type PointerEvent as EventoPonteiro, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronsDownUp, ChevronsUpDown, CornerDownRight, FoldVertical, Minus, Network, Plus, Trash2, UnfoldVertical } from "lucide-react";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { LadoMapa } from "@/lib/fluxoMapaMental";
import {
  alternarRecolher, apagarRamo, aposArrastar, criarFilho, criarIrmao, dadosDo, editarTopico, ehEventoNosso, ehTopico,
  expandirTudo, organizarMapa, recolherTudo,
} from "./mapaMental";

/** Distância (px de tela) em que o tópico ainda conta como "sob o mouse": cobre os botões grudados nele */
const ALCANCE_MOUSE = 72;

type El = ExcalidrawElement;

function ocupado(a: AppState): boolean {
  return (
    a.activeTool.type !== "selection" || a.viewModeEnabled || !!a.newElement || !!a.multiElement || !!a.resizingElement ||
    !!a.selectionElement || !!a.editingTextElement || !!a.editingLinearElement || a.isResizing || a.isRotating ||
    a.selectedElementsAreBeingDragged || !!a.croppingElementId
  );
}

/** Tópico selecionado sozinho (o texto dele selecionado também conta). */
function topicoSelecionado(api: ExcalidrawImperativeAPI): El | undefined {
  const a = api.getAppState();
  const ids = Object.keys(a.selectedElementIds);
  if (ids.length !== 1) return undefined;
  const els = api.getSceneElements();
  const el = els.find((e) => e.id === ids[0]);
  if (ehTopico(el)) return el;
  const container = el && (el as El & { containerId?: string }).containerId;
  const c = container ? els.find((e) => e.id === container) : undefined;
  return ehTopico(c) ? c : undefined;
}

export function MapaMentalCamada({ api, raiz }: { api: ExcalidrawImperativeAPI | null; raiz: HTMLElement | null }) {
  const [, setVersao] = useState(0);
  const [sobMouse, setSobMouse] = useState<string | null>(null);
  const assinatura = useRef("");

  // Tópico mais perto do mouse (dentro do alcance), para mostrar os "+" e a bolinha de ocultar
  useEffect(() => {
    if (!api || !raiz) return;
    const aoMover = (ev: PointerEvent) => {
      const a = api.getAppState();
      const caixa = raiz.getBoundingClientRect();
      const z = a.zoom.value;
      const x = (ev.clientX - caixa.left) / z - a.scrollX, y = (ev.clientY - caixa.top) / z - a.scrollY;
      let perto: string | null = null, menor = ALCANCE_MOUSE / z;
      for (const e of api.getSceneElements()) {
        if (!ehTopico(e)) continue;
        const dist = Math.hypot(Math.max(e.x - x, 0, x - e.x - e.width), Math.max(e.y - y, 0, y - e.y - e.height));
        if (dist <= menor) { menor = dist; perto = e.id; }
      }
      setSobMouse((atual) => (atual === perto ? atual : perto));
    };
    const aoSair = () => setSobMouse(null);
    raiz.addEventListener("pointermove", aoMover, { passive: true });
    raiz.addEventListener("pointerleave", aoSair);
    return () => {
      raiz.removeEventListener("pointermove", aoMover);
      raiz.removeEventListener("pointerleave", aoSair);
    };
  }, [api, raiz]);
  const antes = useRef<{ editando: string | null; arrastando: boolean; redimensionando: boolean }>({ editando: null, arrastando: false, redimensionando: false });

  // Atalhos (fase de captura: antes do Excalidraw, que usaria Enter/Delete/Tab do jeito dele)
  useEffect(() => {
    if (!api || !raiz) return;
    const aoTeclar = (e: KeyboardEvent) => {
      // Janela do app aberta (Exportar, conflito…) não recebe atalho do mapa; seletores do próprio Excalidraw não contam
      const janelaDoApp = [...document.querySelectorAll("[role=dialog], [role=alertdialog]")].some((j) => !j.closest(".excalidraw"));
      if (ehEventoNosso(e) || janelaDoApp) return;
      const a = api.getAppState();
      const semModificador = !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey;
      const editando = a.editingTextElement as (El & { containerId?: string }) | null;
      if (editando) {
        const cont = editando.containerId ? api.getSceneElements().find((x) => x.id === editando.containerId) : undefined;
        if (!ehTopico(cont) || !semModificador || (e.key !== "Tab" && e.key !== "Enter")) return;
        // Escrevendo num tópico: Enter/Tab confirmam o texto e já abrem o próximo tópico (Shift+Enter quebra linha)
        e.preventDefault();
        e.stopPropagation();
        (e.target as HTMLElement).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
        const id = cont.id;
        setTimeout(() => (e.key === "Tab" ? criarFilho(api, raiz, id) : criarIrmao(api, raiz, id)), 60);
        return;
      }
      const alvo = e.target as HTMLElement | null;
      if (alvo && alvo !== document.body && !alvo.closest(".excalidraw")) return;
      if (alvo?.closest("input, textarea, [contenteditable=true]")) return;
      if (a.activeTool.type !== "selection") return;
      const topico = topicoSelecionado(api);
      if (!topico) return;
      const tecla = e.key.toLowerCase();
      let acao: (() => void) | null = null;
      if (e.key === "Tab" && semModificador) acao = () => criarFilho(api, raiz, topico.id);
      else if (e.key === "Enter" && semModificador) acao = () => criarIrmao(api, raiz, topico.id);
      else if (e.key === "F2") acao = () => editarTopico(api, raiz, topico.id);
      else if ((e.key === "Delete" || e.key === "Backspace") && semModificador) acao = () => apagarRamo(api, topico.id);
      else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === ".") acao = () => alternarRecolher(api, topico.id);
      else if ((e.ctrlKey || e.metaKey) && e.shiftKey && tecla === "l") acao = () => organizarMapa(api, dadosDo(topico)!.raiz);
      if (!acao) return;
      e.preventDefault();
      e.stopPropagation();
      acao();
    };
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, [api, raiz]);

  // Terminou de escrever / arrastar / redimensionar um tópico → reorganiza o mapa dele. Também redesenha a camada.
  useEffect(() => {
    if (!api) return;
    return api.onChange((elements, a) => {
      const anterior = antes.current;
      const editandoAgora = (a.editingTextElement as (El & { containerId?: string }) | null)?.containerId ?? null;
      const terminouTexto = anterior.editando && !editandoAgora ? anterior.editando : null;
      const terminouArraste = anterior.arrastando && !a.selectedElementsAreBeingDragged;
      const terminouTamanho = anterior.redimensionando && !a.isResizing;
      antes.current = { editando: editandoAgora, arrastando: a.selectedElementsAreBeingDragged, redimensionando: a.isResizing };
      if (terminouTexto || terminouArraste || terminouTamanho) {
        setTimeout(() => {
          if (terminouTexto) {
            const t = api.getSceneElements().find((e) => e.id === terminouTexto);
            if (ehTopico(t)) organizarMapa(api, dadosDo(t)!.raiz);
          }
          if (terminouArraste || terminouTamanho) {
            const ids = Object.keys(api.getAppState().selectedElementIds);
            const topicos = api.getSceneElements().filter((e) => ids.includes(e.id) && ehTopico(e));
            if (topicos.length === 1 && terminouArraste) aposArrastar(api, topicos[0].id);
            else [...new Set(topicos.map((t) => dadosDo(t)!.raiz))].forEach((r) => organizarMapa(api, r));
          }
        }, 0);
      }
      const recolhidos = elements.filter((e) => ehTopico(e) && dadosDo(e)!.recolhido).map((e) => `${e.id}:${e.version}`).join(",");
      const sel = Object.keys(a.selectedElementIds).join(",");
      const selV = elements.filter((e) => a.selectedElementIds[e.id]).map((e) => e.version).join(",");
      const nova = `${sel}|${selV}|${recolhidos}|${a.scrollX}|${a.scrollY}|${a.zoom.value}|${ocupado(a)}`;
      if (nova !== assinatura.current) {
        assinatura.current = nova;
        setVersao((v) => v + 1);
      }
    });
  }, [api]);

  if (!api || !raiz) return null;
  const a = api.getAppState();
  // Com tópico do mapa selecionado, a dica do Excalidraw ("Enter adiciona texto") não vale: a barra mostra os atalhos
  raiz.classList.toggle("mm-ativo", !!topicoSelecionado(api) && !a.editingTextElement);
  if (ocupado(a)) return null;
  const zoom = a.zoom.value;
  const naTela = (x: number, y: number) => ({ left: (x + a.scrollX) * zoom, top: (y + a.scrollY) * zoom });
  const elementos = api.getSceneElements();
  const topico = topicoSelecionado(api);
  const recolhidos = elementos.filter((e) => ehTopico(e) && dadosDo(e)!.recolhido);
  const temFilhos = topico ? elementos.some((e) => ehTopico(e) && dadosDo(e)!.pai === topico.id) || !!dadosDo(topico)!.recolhido : false;

  // Clique nos botões da camada: não chega ao Excalidraw e não tira o foco do quadro. Sem isso, Ctrl+Z e os atalhos
  // param depois do clique: o React entrega o teclado pela árvore dele, e a camada não fica dentro do Excalidraw.
  const segurar = {
    onPointerDown: (ev: EventoPonteiro) => ev.stopPropagation(),
    onMouseDown: (ev: EventoMouse) => { ev.preventDefault(); raiz.focus({ preventScroll: true }); },
  };
  const barraAbaixo = !!topico && naTela(topico.x + topico.width / 2, topico.y).top < 70;
  const barra = topico && (() => {
    const pos = naTela(topico.x + topico.width / 2, barraAbaixo ? topico.y + topico.height : topico.y);
    const d = dadosDo(topico)!;
    const doMapa = elementos.filter((e) => ehTopico(e) && dadosDo(e)!.raiz === d.raiz);
    const tudo = d.pai !== null ? [] : [
      ...(doMapa.some((e) => { const p = dadosDo(e)!.pai; return p !== null && p !== d.raiz; })
        ? [{ icone: <FoldVertical size={15} />, dica: "Recolher tudo", acao: () => recolherTudo(api, d.raiz) }] : []),
      ...(doMapa.some((e) => dadosDo(e)!.recolhido)
        ? [{ icone: <UnfoldVertical size={15} />, dica: "Expandir tudo", acao: () => expandirTudo(api, d.raiz) }] : []),
    ];
    const botoes: { icone: ReactNode; dica: string; acao: () => void; perigo?: boolean }[] = [
      { icone: <CornerDownRight size={15} />, dica: "Tópico filho (Tab)", acao: () => criarFilho(api, raiz, topico.id) },
      { icone: <Plus size={15} />, dica: d.pai === null ? "Novo tópico (Enter)" : "Tópico irmão (Enter)", acao: () => criarIrmao(api, raiz, topico.id) },
      ...(temFilhos ? [{
        icone: d.recolhido ? <ChevronsUpDown size={15} /> : <ChevronsDownUp size={15} />,
        dica: d.recolhido ? "Expandir (Ctrl+.)" : "Recolher (Ctrl+.)", acao: () => alternarRecolher(api, topico.id),
      }] : []),
      ...tudo,
      { icone: <Network size={15} />, dica: "Organizar o mapa (Ctrl+Shift+L)", acao: () => organizarMapa(api, d.raiz) },
      { icone: <Trash2 size={15} />, dica: d.pai === null ? "Apagar o mapa inteiro (Delete)" : "Apagar o ramo (Delete)", acao: () => apagarRamo(api, topico.id), perigo: true },
    ];
    return (
      <div className={barraAbaixo ? "mm-barra mm-barra-abaixo" : "mm-barra"} style={{ left: pos.left, top: pos.top }} {...segurar}>
        {botoes.map((b) => (
          <button key={b.dica} type="button" title={b.dica} aria-label={b.dica} onClick={b.acao} className={b.perigo ? "mm-perigo" : undefined}>
            {b.icone}
          </button>
        ))}
      </div>
    );
  })();

  // "+" ao lado (etapa ligada; na ideia central, um de cada lado), "+" embaixo (etapa no mesmo nível) e bolinha de
  // ocultar as etapas, no tópico sob o mouse e no selecionado
  const grudados = [...new Set([topico?.id, sobMouse])].flatMap((id) => {
    const t = id ? elementos.find((e) => e.id === id && ehTopico(e)) : undefined;
    if (!t) return [];
    const d = dadosDo(t)!;
    const temFilhos = elementos.some((e) => ehTopico(e) && dadosDo(e)!.pai === t.id);
    const lados: LadoMapa[] = d.pai === null ? ["esq", "dir"] : [d.lado];
    const itens = lados.map((lado) => {
      const p = naTela(lado === "dir" ? t.x + t.width : t.x, t.y + t.height / 2);
      // Afasta para não cobrir a bolinha de ocultar (ou o selo "+N" do ramo recolhido)
      const afastar = d.recolhido ? 56 : temFilhos && d.pai !== null ? 36 : 18;
      return (
        <button key={`${t.id}-${lado}`} type="button" className="mm-mais mm-mais-lado" title="Nova etapa ligada (Tab)" aria-label="Nova etapa ligada (Tab)"
          style={{ left: p.left + (lado === "dir" ? afastar : -afastar), top: p.top }} {...segurar}
          onClick={() => criarFilho(api, raiz, t.id, d.pai === null ? lado : undefined)}>
          <Plus size={13} strokeWidth={2.5} />
        </button>
      );
    });
    // Embaixo: não na ideia central, nem quando a barra do selecionado está embaixo dele
    if (d.pai !== null && !(barraAbaixo && t.id === topico?.id)) {
      const p = naTela(t.x + t.width / 2, t.y + t.height);
      itens.push(
        <button key={`${t.id}-baixo`} type="button" className="mm-mais mm-mais-baixo" title="Nova etapa abaixo (Enter)" aria-label="Nova etapa abaixo (Enter)"
          style={{ left: p.left, top: p.top + 10 }} {...segurar} onClick={() => criarIrmao(api, raiz, t.id)}>
          <Plus size={13} strokeWidth={2.5} />
        </button>,
      );
    }
    if (d.pai !== null && temFilhos && !d.recolhido) {
      const p = naTela(d.lado === "dir" ? t.x + t.width : t.x, t.y + t.height / 2);
      itens.push(
        <button key={`${t.id}-ocultar`} type="button" className="mm-ocultar" title="Ocultar as etapas (Ctrl+.)" aria-label="Ocultar as etapas (Ctrl+.)"
          style={{ left: p.left, top: p.top }} {...segurar} onClick={() => alternarRecolher(api, t.id)}>
          <Minus size={11} strokeWidth={3} />
        </button>,
      );
    }
    return itens;
  });

  return createPortal(
    <div className="pointer-events-none absolute inset-0 z-[3] overflow-hidden">
      {grudados}
      {barra}
      {recolhidos.map((e) => {
        const d = dadosDo(e)!;
        const qtd = (d.oculto ?? []).filter((x) => (x.customData as { mm?: unknown } | undefined)?.mm).length;
        const esquerda = d.lado === "esq" && d.pai !== null;
        const p = naTela(esquerda ? e.x : e.x + e.width, e.y + e.height / 2);
        return (
          <button key={e.id} type="button" className={esquerda ? "mm-selo mm-selo-esq" : "mm-selo"} style={{ left: p.left, top: p.top }}
            title={`Expandir ${qtd} ${qtd === 1 ? "tópico" : "tópicos"} (Ctrl+.)`} onClick={() => alternarRecolher(api, e.id)}
            {...segurar}>
            +{qtd}
          </button>
        );
      })}
    </div>,
    raiz,
  );
}
