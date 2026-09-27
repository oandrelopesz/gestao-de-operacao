// Quadro infinito (Excalidraw) com os padrões de traço limpo, painel "Gestor Pro" e biblioteca guardada no navegador.
// Só roda no navegador: é carregado sob demanda pelo EditorFluxo (nada do Excalidraw no SSR nem no pacote principal).
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Download, Shapes } from "lucide-react";
import { Excalidraw, FONT_FAMILY, MainMenu, Sidebar, WelcomeScreen, useHandleLibrary } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { LibraryPersistenceAdapter } from "@excalidraw/excalidraw/data/library";
import type { AppState, BinaryFileData, BinaryFiles, ExcalidrawImperativeAPI, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { CenaSalva } from "@/lib/fluxoCena";
import type { Ponto } from "@/lib/fluxoConectores";
import { traduzirExcalidraw } from "@/lib/fluxoTraducoes";
import { ConectoresFluxo } from "./ConectoresFluxo";
import { criarMapa } from "./mapaMental";
import { MapaMentalCamada } from "./MapaMentalCamada";
import { NOME_PAINEL, PainelGestor } from "./PainelGestor";

const ATRIBUTOS_TRADUZIDOS = ["title", "aria-label", "placeholder"];
const DO_EXCALIDRAW = ".excalidraw, .excalidraw-modal-container, .excalidraw-tooltip";

/** Troca, na tela, os textos que o pacote pt-BR do Excalidraw deixa em inglês (dicas, tipos de seta, busca…). */
function traduzirNo(no: Node) {
  if (no.nodeType === Node.TEXT_NODE) {
    const t = traduzirExcalidraw(no.nodeValue ?? "");
    if (t !== null) no.nodeValue = t;
    return;
  }
  if (no.nodeType !== Node.ELEMENT_NODE) return;
  const el = no as Element;
  if (el.tagName === "TEXTAREA" || el.tagName === "SCRIPT" || el.tagName === "STYLE") return;
  for (const nome of ATRIBUTOS_TRADUZIDOS) {
    const v = el.getAttribute(nome);
    const t = v ? traduzirExcalidraw(v) : null;
    if (t !== null) el.setAttribute(nome, t);
  }
  el.childNodes.forEach(traduzirNo);
}

function useTraducaoExcalidraw(ativo: boolean) {
  useEffect(() => {
    if (!ativo) return;
    const noEscopo = (n: Node | null) => !!(n instanceof Element ? n : n?.parentElement)?.closest(DO_EXCALIDRAW);
    document.querySelectorAll(DO_EXCALIDRAW).forEach(traduzirNo);
    const observador = new MutationObserver((mudancas) => {
      for (const m of mudancas) {
        if (m.type === "characterData") {
          if (noEscopo(m.target)) traduzirNo(m.target);
        } else if (m.type === "attributes") {
          if (noEscopo(m.target)) traduzirNo(m.target);
        } else {
          m.addedNodes.forEach((n) => {
            if (noEscopo(n) || (n instanceof Element && n.querySelector(DO_EXCALIDRAW))) traduzirNo(n);
          });
        }
      }
    });
    observador.observe(document.body, {
      subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS_TRADUZIDOS,
    });
    return () => observador.disconnect();
  }, [ativo]);
}

const CHAVE_BIBLIOTECA = "fluxogramas-biblioteca";

/** Itens que a pessoa guarda na biblioteca do Excalidraw ficam neste navegador (valem para todos os quadros). */
const bibliotecaNoNavegador: LibraryPersistenceAdapter = {
  load() {
    try {
      const salvo = window.localStorage.getItem(CHAVE_BIBLIOTECA);
      return salvo ? { libraryItems: JSON.parse(salvo) } : null;
    } catch {
      return null;
    }
  },
  save({ libraryItems }) {
    try {
      window.localStorage.setItem(CHAVE_BIBLIOTECA, JSON.stringify(libraryItems));
    } catch {
      // sem espaço ou armazenamento bloqueado: a biblioteca vale só para esta visita
    }
  },
};

export interface QuadroExcalidrawProps {
  inicial: CenaSalva;
  imagens: { id: string; dataURL: string; mimeType: string }[];
  tema: "light" | "dark";
  onPronto: (api: ExcalidrawImperativeAPI) => void;
  onMudou: (elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => void;
  onExportar: () => void;
  /** Quadro novo criado com o modelo "Mapa mental": monta o mapa ao abrir */
  criarMapaAoAbrir?: boolean;
}

// memo: o editor muda de estado a cada "Salvando…/Salvo"; sem isto o Excalidraw inteiro seria redesenhado junto
export const QuadroExcalidraw = memo(function QuadroExcalidraw({ inicial, imagens, tema, onPronto, onMudou, onExportar, criarMapaAoAbrir }: QuadroExcalidrawProps) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [painelFixo, setPainelFixo] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const [raiz, setRaiz] = useState<HTMLElement | null>(null);
  const ouvintePonteiro = useRef<((p: Ponto) => void) | null>(null);
  useHandleLibrary({ excalidrawAPI: api, adapter: bibliotecaNoNavegador });
  useTraducaoExcalidraw(!!api);

  useEffect(() => {
    if (api) setRaiz(caixa.current?.querySelector<HTMLElement>(".excalidraw") ?? null);
  }, [api]);

  const mapaCriado = useRef(false);
  useEffect(() => {
    if (!api || !raiz || !criarMapaAoAbrir || mapaCriado.current) return;
    mapaCriado.current = true;
    // Espera o quadro medir a tela antes de achar o meio
    setTimeout(() => {
      if (!api.getSceneElements().length) criarMapa(api, raiz);
    }, 150);
  }, [api, raiz, criarMapaAoAbrir]);

  // Só vale na montagem (o Excalidraw ignora mudanças depois)
  const dadosIniciais = useMemo<ExcalidrawInitialDataState>(() => {
    const agora = Date.now();
    return {
      elements: inicial.elements as unknown as ExcalidrawInitialDataState["elements"],
      appState: {
        viewBackgroundColor: inicial.appState.viewBackgroundColor ?? "#ffffff",
        gridSize: inicial.appState.gridSize ?? 20,
        gridModeEnabled: !!inicial.appState.gridModeEnabled,
        currentItemRoughness: 0,
        currentItemFontFamily: FONT_FAMILY.Nunito,
        currentItemStrokeWidth: 2,
        currentItemRoundness: "round",
        // Formas desenhadas nascem preenchidas (branco): dá para pegar e arrastar clicando no meio, não só na borda
        currentItemBackgroundColor: "#ffffff",
        currentItemFillStyle: "solid",
      },
      files: Object.fromEntries(
        imagens.map((i) => [i.id, { ...i, created: agora } as unknown as BinaryFileData]),
      ) as BinaryFiles,
      scrollToContent: true,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={caixa} className="fluxo-quadro h-full w-full">
    <Excalidraw
      initialData={dadosIniciais}
      excalidrawAPI={(a) => {
        setApi(a);
        onPronto(a);
      }}
      onChange={onMudou}
      onPointerUpdate={(e) => ouvintePonteiro.current?.(e.pointer)}
      // Cópia de tópico/ligação do mapa mental vira card/seta comum (senão entraria na árvore do mapa original)
      onDuplicate={(proximos, anteriores) => {
        const antigos = new Set(anteriores.map((e) => e.id));
        return proximos.map((e) => {
          const extra = e.customData as Record<string, unknown> | undefined;
          if (antigos.has(e.id) || !extra || (!("mm" in extra) && !("mmLigacao" in extra))) return e;
          const { mm: _mm, mmLigacao: _l, ...resto } = extra;
          return { ...e, customData: resto };
        });
      }}
      langCode="pt-BR"
      theme={tema}
      UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: false, toggleTheme: null } }}
      // No celular a linha de cima é só das ferramentas; o botão Formas vai para a barra do editor
      renderTopRightUI={(celular) =>
        celular ? null : (
          <Sidebar.Trigger name={NOME_PAINEL} tab="formas" title="Formas extras e cards" icon={<Shapes size={16} strokeWidth={1.75} />}>
            Formas
          </Sidebar.Trigger>
        )
      }
    >
      <MainMenu>
        <MainMenu.Item icon={<Download size={16} strokeWidth={1.75} />} onSelect={onExportar} shortcut="Ctrl+Shift+E">
          Exportar…
        </MainMenu.Item>
        <MainMenu.DefaultItems.SearchMenu />
        <MainMenu.DefaultItems.CommandPalette />
        <MainMenu.DefaultItems.Help />
        <MainMenu.DefaultItems.ClearCanvas />
        <MainMenu.Separator />
        <MainMenu.DefaultItems.ChangeCanvasBackground />
      </MainMenu>
      <WelcomeScreen>
        <WelcomeScreen.Hints.MenuHint />
        <WelcomeScreen.Hints.ToolbarHint />
        <WelcomeScreen.Hints.HelpHint />
        <WelcomeScreen.Center>
          <WelcomeScreen.Center.Heading>
            Quadro em branco. Funis, cones e cards prontos ficam no botão Formas; as bolinhas nas bordas ligam uma forma à outra.
          </WelcomeScreen.Center.Heading>
        </WelcomeScreen.Center>
      </WelcomeScreen>
      <PainelGestor api={api} docked={painelFixo} onDock={setPainelFixo} />
    </Excalidraw>
    <ConectoresFluxo api={api} raiz={raiz} ouvintePonteiro={ouvintePonteiro} />
    <MapaMentalCamada api={api} raiz={raiz} />
    </div>
  );
});
