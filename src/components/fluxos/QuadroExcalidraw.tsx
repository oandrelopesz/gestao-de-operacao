// Quadro infinito (Excalidraw) com os padrões de traço limpo, painel "Gestor Pro" e biblioteca guardada no navegador.
// Só roda no navegador: é carregado sob demanda pelo EditorFluxo (nada do Excalidraw no SSR nem no pacote principal).
import { useMemo, useState } from "react";
import { Shapes } from "lucide-react";
import { Excalidraw, FONT_FAMILY, MainMenu, Sidebar, WelcomeScreen, useHandleLibrary } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { LibraryPersistenceAdapter } from "@excalidraw/excalidraw/data/library";
import type { AppState, BinaryFileData, BinaryFiles, ExcalidrawImperativeAPI, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { CenaSalva } from "@/lib/fluxoCena";
import { NOME_PAINEL, PainelGestor } from "./PainelGestor";

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
}

export function QuadroExcalidraw({ inicial, imagens, tema, onPronto, onMudou }: QuadroExcalidrawProps) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [painelFixo, setPainelFixo] = useState(false);
  useHandleLibrary({ excalidrawAPI: api, adapter: bibliotecaNoNavegador });

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
      },
      files: Object.fromEntries(
        imagens.map((i) => [i.id, { ...i, created: agora } as unknown as BinaryFileData]),
      ) as BinaryFiles,
      scrollToContent: true,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Excalidraw
      initialData={dadosIniciais}
      excalidrawAPI={(a) => {
        setApi(a);
        onPronto(a);
      }}
      onChange={onMudou}
      langCode="pt-BR"
      theme={tema}
      UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false, toggleTheme: null } }}
      renderTopRightUI={() => (
        <Sidebar.Trigger name={NOME_PAINEL} tab="formas" title="Formas extras e cards" icon={<Shapes size={16} strokeWidth={1.75} />}>
          <span className="max-sm:hidden">Formas</span>
        </Sidebar.Trigger>
      )}
    >
      <MainMenu>
        <MainMenu.DefaultItems.SaveAsImage />
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
            Quadro em branco. Funis, cones e cards prontos ficam no botão Formas.
          </WelcomeScreen.Center.Heading>
        </WelcomeScreen.Center>
      </WelcomeScreen>
      <PainelGestor api={api} docked={painelFixo} onDock={setPainelFixo} />
    </Excalidraw>
  );
}
