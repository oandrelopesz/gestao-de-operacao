// Editor de um quadro: carrega do banco (com as imagens), salva sozinho 1,5 s depois da última mudança (e ao sair),
// avisa se outro aparelho salvou antes e gera a miniatura da lista. Carregado sob demanda pela rota /fluxogramas/$id.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Check, Circle, CloudOff, Loader2, Maximize, Minimize, RotateCw, Shapes } from "lucide-react";
import { toast } from "sonner";
import { exportToBlob } from "@excalidraw/excalidraw";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  arquivosParaApagar, arquivosParaSubir, arquivosUsados, assinaturaDaCena, montarCena, textosDaCena,
  type ArquivoSalvo, type ElementoMinimo,
} from "@/lib/fluxoCena";
import {
  EVENTO_FLUXO_SALVO, apagarImagens, baixarImagens, carregarFluxo, renomearFluxo, salvarFluxo, subirImagem, traduzErroFluxos,
  type Fluxo,
} from "@/lib/fluxosDados";
import { cn } from "@/lib/utils";
import { NOME_PAINEL } from "./PainelGestor";
import { QuadroExcalidraw } from "./QuadroExcalidraw";

type Estado = "salvo" | "pendente" | "salvando" | "erro" | "conflito";
type Ultimo = { elements: readonly OrderedExcalidrawElement[]; appState: AppState; files: BinaryFiles };

const ESPERA_SALVAR_MS = 1500;
const INTERVALO_MINIATURA_MS = 6_000;

/** O Excalidraw segue o tema do app (classe "dark" no <html>). */
function useTemaApp(): "light" | "dark" {
  const ler = () => (document.documentElement.classList.contains("dark") ? "dark" : "light");
  const [tema, setTema] = useState<"light" | "dark">(ler);
  useEffect(() => {
    const observador = new MutationObserver(() => setTema(ler()));
    observador.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observador.disconnect();
  }, []);
  return tema;
}

/** Muda quando um elemento muda ou quando o fundo/grade do quadro muda. */
function assinatura(elements: readonly unknown[], appState: { viewBackgroundColor?: string; gridModeEnabled?: boolean }): string {
  return `${assinaturaDaCena(elements as readonly ElementoMinimo[])}|${appState.viewBackgroundColor ?? ""}|${appState.gridModeEnabled ? 1 : 0}`;
}

function paraDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsDataURL(blob);
  });
}

/** Miniatura da lista (clara, até 480 px). `undefined` = não deu para gerar agora (mantém a anterior). */
async function gerarMiniatura(u: Ultimo): Promise<string | null | undefined> {
  const vivos = u.elements.filter((e) => !e.isDeleted);
  if (!vivos.length) return null;
  try {
    const blob = await exportToBlob({
      elements: vivos,
      appState: { ...u.appState, exportBackground: true, exportWithDarkMode: false },
      files: u.files,
      mimeType: "image/webp",
      quality: 0.8,
      maxWidthOrHeight: 480,
    });
    return await paraDataURL(blob);
  } catch {
    return undefined;
  }
}

function horaCurta(d: Date): string {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function EditorFluxo({ fluxoId }: { fluxoId: string }) {
  const tema = useTemaApp();
  const [dados, setDados] = useState<{ fluxo: Fluxo; imagens: { id: string; dataURL: string; mimeType: string }[] } | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [montagem, setMontagem] = useState(0);
  const [titulo, setTitulo] = useState("");
  const [estado, setEstado] = useState<Estado>("salvo");
  const [erroSalvar, setErroSalvar] = useState("");
  const [salvoEm, setSalvoEm] = useState<Date | null>(null);
  const [telaCheia, setTelaCheia] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  // Estado do salvamento em refs: o onChange do Excalidraw dispara a cada movimento do mouse
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const ultimo = useRef<Ultimo | null>(null);
  const tituloSalvo = useRef("");
  const updatedAt = useRef("");
  const arquivosSalvos = useRef<Record<string, ArquivoSalvo>>({});
  const assinaturaSalva = useRef("");
  const assinaturaVista = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emAndamento = useRef(false);
  const deNovo = useRef(false);
  const emConflito = useRef(false);
  const ultimaMiniatura = useRef(0);
  const miniaturaAtrasada = useRef(false);

  const carregar = useCallback(async () => {
    setDados(null);
    setErroCarga(null);
    try {
      const fluxo = await carregarFluxo(fluxoId);
      const imagens = await baixarImagens(fluxo.cena.arquivos);
      updatedAt.current = fluxo.updated_at;
      arquivosSalvos.current = { ...fluxo.cena.arquivos };
      assinaturaSalva.current = assinatura(fluxo.cena.elements, fluxo.cena.appState);
      assinaturaVista.current = assinaturaSalva.current;
      ultimo.current = null;
      emConflito.current = false;
      tituloSalvo.current = fluxo.titulo;
      setTitulo(fluxo.titulo);
      setEstado("salvo");
      setSalvoEm(null);
      setDados({ fluxo, imagens });
      setMontagem((n) => n + 1);
      if (imagens.length < Object.keys(fluxo.cena.arquivos).length) toast.error("Algumas imagens do quadro não carregaram.");
    } catch (e) {
      setErroCarga(traduzErroFluxos(e));
    }
  }, [fluxoId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const salvar = useCallback(
    async (opcoes: { forcar?: boolean; final?: boolean } = {}) => {
      const { forcar = false, final = false } = opcoes;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      if (emConflito.current && !forcar) return;
      if (emAndamento.current) {
        deNovo.current = true;
        return;
      }
      const u = ultimo.current;
      if (!u) return;
      const a = assinatura(u.elements, u.appState);
      const mudou = a !== assinaturaSalva.current;
      const querMiniatura = mudou ? final || Date.now() - ultimaMiniatura.current > INTERVALO_MINIATURA_MS : final && miniaturaAtrasada.current;
      if (!mudou && !querMiniatura && !forcar) return;

      emAndamento.current = true;
      setEstado("salvando");
      try {
        const usados = arquivosUsados(u.elements as unknown as ElementoMinimo[]);
        for (const id of arquivosParaSubir(u.files, arquivosSalvos.current, usados)) {
          const f = u.files[id];
          arquivosSalvos.current[id] = await subirImagem(fluxoId, id, f.dataURL, f.mimeType);
        }
        const cena = montarCena(u.elements as unknown as ElementoMinimo[], u.appState as never, arquivosSalvos.current);
        let miniatura: string | null | undefined;
        if (querMiniatura) {
          miniatura = await gerarMiniatura(u);
          if (miniatura !== undefined) {
            ultimaMiniatura.current = Date.now();
            miniaturaAtrasada.current = false;
          }
        } else {
          miniaturaAtrasada.current = true;
        }
        const r = await salvarFluxo(fluxoId, { cena, textos: textosDaCena(cena.elements), miniatura }, updatedAt.current, forcar);
        if ("conflito" in r) {
          emConflito.current = true;
          // A janela de aviso não aparece por cima da tela cheia
          if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
          setEstado("conflito");
          return;
        }
        emConflito.current = false;
        updatedAt.current = r.updated_at;
        assinaturaSalva.current = a;
        // Imagens que saíram do quadro deixam o armazenamento (desfazer depois sobe de novo)
        const sairam = arquivosParaApagar(arquivosSalvos.current, usados);
        if (sairam.length) {
          sairam.forEach((s) => delete arquivosSalvos.current[s.id]);
          void apagarImagens(sairam.map((s) => s.caminho));
        }
        setSalvoEm(new Date());
        setEstado(assinaturaVista.current === a ? "salvo" : "pendente");
        // Saindo do editor, a lista já pode estar aberta com a versão anterior: avisa para ela recarregar
        window.dispatchEvent(new Event(EVENTO_FLUXO_SALVO));
      } catch (e) {
        setErroSalvar(traduzErroFluxos(e));
        setEstado("erro");
      } finally {
        emAndamento.current = false;
        if (deNovo.current) {
          deNovo.current = false;
          timer.current = setTimeout(() => salvar(), ESPERA_SALVAR_MS);
        }
      }
    },
    [fluxoId],
  );

  const aoMudar = useCallback(
    (elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      ultimo.current = { elements, appState, files };
      const a = assinatura(elements, appState);
      if (a === assinaturaVista.current) return;
      assinaturaVista.current = a;
      if (emConflito.current) return;
      if (a === assinaturaSalva.current) {
        setEstado((e) => (e === "pendente" ? "salvo" : e));
        return;
      }
      setEstado((e) => (e === "salvando" || e === "erro" ? e : "pendente"));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => salvar(), ESPERA_SALVAR_MS);
    },
    [salvar],
  );

  // Sair da aba, fechar o app ou trocar de página: salva na hora
  useEffect(() => {
    const aoEsconder = () => {
      if (document.visibilityState === "hidden") void salvar({ final: true });
    };
    const antesDeSair = (e: BeforeUnloadEvent) => {
      if (assinaturaVista.current !== assinaturaSalva.current && !emConflito.current) {
        void salvar({ final: true });
        e.preventDefault();
      }
    };
    document.addEventListener("visibilitychange", aoEsconder);
    window.addEventListener("beforeunload", antesDeSair);
    return () => {
      document.removeEventListener("visibilitychange", aoEsconder);
      window.removeEventListener("beforeunload", antesDeSair);
      void salvar({ final: true });
    };
  }, [salvar]);

  useEffect(() => {
    const aoMudarTela = () => setTelaCheia(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", aoMudarTela);
    return () => document.removeEventListener("fullscreenchange", aoMudarTela);
  }, []);

  const aoPronto = useCallback((a: ExcalidrawImperativeAPI) => {
    api.current = a;
  }, []);

  const salvarTitulo = async (valor: string) => {
    const novo = valor.trim() || "Sem título";
    if (novo === tituloSalvo.current) {
      setTitulo(novo);
      return;
    }
    try {
      await renomearFluxo(fluxoId, novo);
      tituloSalvo.current = novo;
      setTitulo(novo);
    } catch (e) {
      toast.error(traduzErroFluxos(e));
    }
  };

  const alternarTelaCheia = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void caixa.current?.requestFullscreen?.().catch(() => toast.error("O navegador não deixou abrir em tela cheia."));
  };
  const podeTelaCheia = typeof document !== "undefined" && !!document.fullscreenEnabled;

  // No celular só o ícone (menos o erro, que precisa ser clicado)
  const indicador = (() => {
    const base = "fluxo-estado flex items-center gap-1.5";
    if (estado === "salvando") return <span className={cn(base, "text-muted-foreground")}><Loader2 size={13} className="animate-spin" /><span className="max-sm:hidden">Salvando…</span></span>;
    if (estado === "pendente") return <span className={cn(base, "text-muted-foreground")}><Circle size={8} className="fill-current" /><span className="max-sm:hidden">Alterações não salvas</span></span>;
    if (estado === "conflito") return <span className={cn(base, "text-amber-600 dark:text-amber-400")}><AlertTriangle size={13} /><span className="max-sm:hidden">Alterado em outro aparelho</span></span>;
    if (estado === "erro") {
      return (
        <button type="button" onClick={() => salvar({ forcar: true })} title={erroSalvar} className={cn(base, "text-destructive hover:underline")}>
          <CloudOff size={13} /> Erro ao salvar<span className="max-sm:hidden"> — tentar de novo</span>
        </button>
      );
    }
    return <span className={cn(base, "text-muted-foreground")}><Check size={13} /><span className="max-sm:hidden">{salvoEm ? `Salvo às ${horaCurta(salvoEm)}` : "Salvo"}</span></span>;
  })();

  return (
    <div ref={caixa} className="fluxo-editor flex flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 px-2 sm:px-3">
        <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="Voltar para os quadros">
          <Link to="/fluxogramas" aria-label="Voltar para os quadros"><ArrowLeft size={17} /></Link>
        </Button>
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          onBlur={(e) => salvarTitulo(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setTitulo(tituloSalvo.current);
              requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
            }
          }}
          disabled={!dados}
          aria-label="Nome do quadro"
          placeholder="Sem título"
          className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-sm font-semibold outline-none transition-colors hover:border-border focus:border-primary/60 sm:max-w-md"
        />
        <div className="ml-auto flex shrink-0 items-center gap-1 text-xs">
          {dados && <span key={estado + (salvoEm?.getTime() ?? "")}>{indicador}</span>}
          {dados && (
            // Até 730 px o Excalidraw usa o layout de celular (sem o botão Formas no quadro)
            <Button variant="ghost" size="icon" className="h-8 w-8 min-[731px]:hidden" title="Formas e cards"
              onClick={() => api.current?.toggleSidebar({ name: NOME_PAINEL, tab: "formas" })}>
              <Shapes size={16} />
            </Button>
          )}
          {podeTelaCheia && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={alternarTelaCheia} title={telaCheia ? "Sair da tela cheia" : "Tela cheia"}>
              {telaCheia ? <Minimize size={16} /> : <Maximize size={16} />}
            </Button>
          )}
        </div>
      </div>
      <div className={cn("relative min-h-0 flex-1", !dados && "p-4")}>
        {erroCarga ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="max-w-md text-sm text-destructive">{erroCarga}</p>
            <div className="flex gap-2">
              <Button variant="outline" asChild><Link to="/fluxogramas">Voltar</Link></Button>
              <Button className="gap-2" onClick={carregar}><RotateCw size={15} /> Tentar de novo</Button>
            </div>
          </div>
        ) : !dados ? (
          <Skeleton className="h-full w-full rounded-xl" />
        ) : (
          <QuadroExcalidraw
            key={montagem}
            inicial={dados.fluxo.cena}
            imagens={dados.imagens}
            tema={tema}
            onPronto={aoPronto}
            onMudou={aoMudar}
          />
        )}
      </div>

      <AlertDialog open={estado === "conflito"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Este quadro foi alterado em outro aparelho</AlertDialogTitle>
            <AlertDialogDescription>
              Alguém salvou este quadro depois que você o abriu. Recarregue para ver a versão mais nova (o que você mudou aqui desde
              o último salvamento se perde) ou mantenha o seu, salvando por cima da outra versão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => void carregar()}>Recarregar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void salvar({ forcar: true })}>Manter o meu e salvar por cima</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
