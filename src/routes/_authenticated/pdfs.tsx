import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  FileText, Folder, FolderOpen, FolderPlus, Upload, Search, Eye, Download, MoreVertical, Pencil, Trash2,
  ChevronRight, ChevronDown, Home, Loader2, CheckCircle2, AlertCircle, X, Library,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCachedState } from "@/lib/pageCache";
import { CACHE_KEYS } from "@/lib/data";
import {
  fetchPdfBiblioteca, enviarPdf, atualizarPdf, excluirPdf, salvarNoComputador, mensagemErroPdf,
  PDF_TAMANHO_MAX, type PdfArquivo, type PdfBiblioteca,
} from "@/lib/pdfs";
import {
  montarArvore, caminhoDaPasta, contarPdfsPorPasta, corDaPasta, filtrarPdfs, ehPdf, formatarTamanho,
  type PastaNo, type PdfPasta,
} from "@/lib/pdfsArvore";
import { PastaDialog, ExcluirPastaDialog, type PastaDialogState } from "@/components/pdfs/PastaDialogs";
import { PdfViewer, PdfEditDialog, EnviarPdfsDialog, type PdfParaEnviar } from "@/components/pdfs/PdfDialogs";

export const Route = createFileRoute("/_authenticated/pdfs")({
  validateSearch: (s: Record<string, unknown>): { pasta?: string } =>
    typeof s.pasta === "string" && s.pasta ? { pasta: s.pasta } : {},
  component: PdfsPage,
});

/** Tipo usado no arrastar-e-soltar interno (mover PDF entre pastas), para não confundir com arquivos do computador */
const MIME_PDF_INTERNO = "application/x-gestor-pdf-id";

interface Envio {
  id: string;
  nome: string;
  progresso: number;
  status: "enviando" | "ok" | "erro";
  erro?: string;
}

type TipoArrasto = "arquivos" | "pdf" | null;

function tipoDoArrasto(e: DragEvent): TipoArrasto {
  const tipos = Array.from(e.dataTransfer.types);
  if (tipos.includes(MIME_PDF_INTERNO)) return "pdf";
  if (tipos.includes("Files")) return "arquivos";
  return null;
}

const VAZIA: PdfBiblioteca = { pastas: [], pdfs: [] };

function PdfsPage() {
  const navigate = useNavigate();
  const { pasta: pastaParam } = Route.useSearch();
  const [biblioteca, setBiblioteca] = useCachedState<PdfBiblioteca | null>(CACHE_KEYS.pdfs, null);
  const bib = biblioteca ?? VAZIA;
  const [loading, setLoading] = useState(biblioteca === null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const [envios, setEnvios] = useState<Envio[]>([]);
  /** Arquivos aguardando o popup de envio (nome, player e pasta) */
  const [pendentes, setPendentes] = useState<{ arquivos: File[]; pastaId: string | null } | null>(null);
  const [arrastandoArquivos, setArrastandoArquivos] = useState(false);
  const [alvo, setAlvo] = useState<string | null>(null);
  const [visualizando, setVisualizando] = useState<PdfArquivo | null>(null);
  const [editando, setEditando] = useState<PdfArquivo | null>(null);
  const [pdfToDelete, setPdfToDelete] = useState<PdfArquivo | null>(null);
  const [excluindoPdf, setExcluindoPdf] = useState(false);
  const [pastaDialog, setPastaDialog] = useState<PastaDialogState>(null);
  const [pastaToDelete, setPastaToDelete] = useState<PdfPasta | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const contadorArrasto = useRef(0);

  const load = async () => {
    try {
      setBiblioteca(await fetchPdfBiblioteca());
      setErro(null);
    } catch (e) {
      setErro(mensagemErroPdf(e));
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // Soltar um arquivo fora da área não pode fazer o navegador sair do sistema para abrir o PDF
  useEffect(() => {
    const bloquear = (e: globalThis.DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", bloquear);
    window.addEventListener("drop", bloquear);
    return () => {
      window.removeEventListener("dragover", bloquear);
      window.removeEventListener("drop", bloquear);
    };
  }, []);

  const pastaAtual = useMemo(
    () => (pastaParam ? bib.pastas.find((p) => p.id === pastaParam) ?? null : null),
    [bib.pastas, pastaParam],
  );
  const caminho = useMemo(() => caminhoDaPasta(bib.pastas, pastaAtual?.id ?? null), [bib.pastas, pastaAtual]);
  const arvore = useMemo(() => montarArvore(bib.pastas), [bib.pastas]);
  const contagem = useMemo(() => contarPdfsPorPasta(bib.pastas, bib.pdfs), [bib]);
  const nomeDoLocal = (pastaId: string) => caminhoDaPasta(bib.pastas, pastaId).map((p) => p.nome).join(" / ");

  // Ao entrar numa pasta, a árvore lateral se abre até ela
  useEffect(() => {
    if (!caminho.length) return;
    setAbertas((prev) => {
      const next = new Set(prev);
      caminho.forEach((p) => next.add(p.id));
      return next;
    });
  }, [caminho]);

  const subpastas = useMemo(
    () => (pastaAtual ? encontrarNo(arvore, pastaAtual.id)?.filhos ?? [] : arvore),
    [arvore, pastaAtual],
  );
  const pdfsDaPasta = useMemo(
    () => (pastaAtual ? bib.pdfs.filter((f) => f.pasta_id === pastaAtual.id) : []),
    [bib.pdfs, pastaAtual],
  );
  const resultadosBusca = useMemo(() => (busca.trim() ? filtrarPdfs(bib.pdfs, busca) : []), [bib.pdfs, busca]);
  const recentes = useMemo(() => bib.pdfs.slice(0, 8), [bib.pdfs]);

  const abrirPasta = (id: string | null) => {
    setBusca("");
    navigate({ to: "/pdfs", search: id ? { pasta: id } : {} });
  };

  const toggle = (id: string) =>
    setAbertas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // ------------------------------------------------------------ Envio

  const enviar = async (itens: PdfParaEnviar[], pastaId: string) => {
    const destino = bib.pastas.find((p) => p.id === pastaId);
    const fila = itens.map((item) => ({
      item,
      envio: { id: `${Date.now()}-${Math.random()}`, nome: item.nome.trim() || item.arquivo.name, progresso: 0, status: "enviando" as const },
    }));
    setEnvios((prev) => [...prev, ...fila.map((i) => i.envio)]);
    const atualizar = (id: string, patch: Partial<Envio>) =>
      setEnvios((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

    let ok = 0;
    for (const { item, envio } of fila) {
      try {
        const novo = await enviarPdf(item.arquivo, pastaId, { nome: item.nome, player: item.player }, (fracao) =>
          atualizar(envio.id, { progresso: Math.round(fracao * 100) }),
        );
        setBiblioteca((prev) => ({ ...(prev ?? VAZIA), pdfs: [novo, ...(prev ?? VAZIA).pdfs] }));
        atualizar(envio.id, { status: "ok", progresso: 100 });
        ok += 1;
        window.setTimeout(() => setEnvios((prev) => prev.filter((e) => e.id !== envio.id)), 2500);
      } catch (e) {
        atualizar(envio.id, { status: "erro", erro: mensagemErroPdf(e) });
      }
    }
    if (ok) toast.success(`${ok} ${ok === 1 ? "PDF guardado" : "PDFs guardados"} em "${destino?.nome ?? "pasta"}"`);
  };

  /** Ponto único de entrada de arquivos (botão, arrastar na área ou numa pasta). */
  const receberArquivos = (lista: FileList | File[], pastaId: string | null) => {
    const arquivos = Array.from(lista);
    const pdfs = arquivos.filter(ehPdf);
    const ignorados = arquivos.length - pdfs.length;
    if (ignorados) toast.warning(`${ignorados} ${ignorados === 1 ? "arquivo ignorado" : "arquivos ignorados"}: só PDFs podem ser guardados aqui`);
    const grandes = pdfs.filter((f) => f.size > PDF_TAMANHO_MAX);
    if (grandes.length) toast.error(`Maior que 50 MB, não enviado: ${grandes.map((f) => f.name).join(", ")}`);
    const validos = pdfs.filter((f) => f.size <= PDF_TAMANHO_MAX);
    if (!validos.length) return;
    // Sempre passa pelo popup: nome (opcional), player e tema — já com a pasta aberta/de destino escolhida
    setPendentes({ arquivos: validos, pastaId });
  };

  // ------------------------------------------------------------ Arrastar e soltar

  const propsDeAlvo = (pastaId: string) => ({
    onDragOver: (e: DragEvent) => {
      const tipo = tipoDoArrasto(e);
      if (!tipo) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = tipo === "pdf" ? "move" : "copy";
      if (alvo !== pastaId) setAlvo(pastaId);
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAlvo((a) => (a === pastaId ? null : a));
    },
    onDrop: (e: DragEvent) => {
      const tipo = tipoDoArrasto(e);
      if (!tipo) return;
      e.preventDefault();
      e.stopPropagation();
      setAlvo(null);
      setArrastandoArquivos(false);
      contadorArrasto.current = 0;
      if (tipo === "arquivos") receberArquivos(e.dataTransfer.files, pastaId);
      else moverPdf(e.dataTransfer.getData(MIME_PDF_INTERNO), pastaId);
    },
  });

  const areaProps = {
    onDragEnter: (e: DragEvent) => {
      if (tipoDoArrasto(e) !== "arquivos") return;
      contadorArrasto.current += 1;
      setArrastandoArquivos(true);
    },
    onDragOver: (e: DragEvent) => {
      if (tipoDoArrasto(e) !== "arquivos") return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (e: DragEvent) => {
      if (tipoDoArrasto(e) !== "arquivos") return;
      contadorArrasto.current = Math.max(0, contadorArrasto.current - 1);
      if (contadorArrasto.current === 0) setArrastandoArquivos(false);
    },
    onDrop: (e: DragEvent) => {
      if (tipoDoArrasto(e) !== "arquivos") return;
      e.preventDefault();
      contadorArrasto.current = 0;
      setArrastandoArquivos(false);
      receberArquivos(e.dataTransfer.files, pastaAtual?.id ?? null);
    },
  };

  // ------------------------------------------------------------ Ações nos PDFs

  const moverPdf = async (pdfId: string, pastaId: string) => {
    const pdf = bib.pdfs.find((f) => f.id === pdfId);
    if (!pdf || pdf.pasta_id === pastaId) return;
    const destino = bib.pastas.find((p) => p.id === pastaId);
    setBiblioteca((prev) => prev && { ...prev, pdfs: prev.pdfs.map((f) => (f.id === pdfId ? { ...f, pasta_id: pastaId } : f)) });
    try {
      await atualizarPdf(pdfId, { pasta_id: pastaId });
      toast.success(`"${pdf.nome}" movido para "${destino?.nome}"`);
    } catch (e) {
      toast.error(mensagemErroPdf(e));
      await load();
    }
  };

  const baixar = async (pdf: PdfArquivo) => {
    const t = toast.loading(`Baixando "${pdf.nome}"...`);
    try {
      await salvarNoComputador(pdf);
      toast.dismiss(t);
    } catch (e) {
      toast.error(mensagemErroPdf(e), { id: t });
    }
  };

  const confirmarExclusaoPdf = async () => {
    if (!pdfToDelete) return;
    setExcluindoPdf(true);
    try {
      await excluirPdf(pdfToDelete);
      setBiblioteca((prev) => prev && { ...prev, pdfs: prev.pdfs.filter((f) => f.id !== pdfToDelete.id) });
      toast.success("PDF excluído");
      setPdfToDelete(null);
    } catch (e) {
      toast.error(mensagemErroPdf(e));
    } finally {
      setExcluindoPdf(false);
    }
  };

  const escolherArquivos = () => inputRef.current?.click();

  // ------------------------------------------------------------ Render

  const linhaPdf = (pdf: PdfArquivo, mostrarLocal: boolean) => (
    <PdfLinha
      key={pdf.id}
      pdf={pdf}
      local={mostrarLocal ? nomeDoLocal(pdf.pasta_id) : undefined}
      cor={corDaPasta(bib.pastas, pdf.pasta_id)}
      onVer={() => setVisualizando(pdf)}
      onBaixar={() => baixar(pdf)}
      onEditar={() => setEditando(pdf)}
      onExcluir={() => setPdfToDelete(pdf)}
    />
  );

  const corAtual = pastaAtual ? corDaPasta(bib.pastas, pastaAtual.id) : undefined;
  const qtdAtual = pastaAtual ? contagem.get(pastaAtual.id) : undefined;

  return (
    <div className="space-y-6">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) receberArquivos(e.target.files, pastaAtual?.id ?? null);
          e.target.value = "";
        }}
      />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">PDFs</h1>
          <p className="text-muted-foreground text-sm">
            Seus PDFs importantes organizados por tema. Arraste arquivos do computador para qualquer pasta.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setPastaDialog({ mode: "create", parentId: pastaAtual?.id ?? null })}>
            <FolderPlus size={18} /> {pastaAtual ? "Nova subpasta" : "Novo tema"}
          </Button>
          <Button className="gap-2" onClick={escolherArquivos}>
            <Upload size={18} /> Enviar PDFs
          </Button>
        </div>
      </div>

      {erro && (
        <Card className="border-destructive/40"><CardContent className="p-4 text-sm text-destructive">{erro}</CardContent></Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Árvore de pastas */}
        <Card className="hidden lg:block h-fit lg:sticky lg:top-20">
          <CardContent className="p-2">
            <button
              type="button"
              onClick={() => abrirPasta(null)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted",
                !pastaAtual && "bg-primary/10 text-foreground font-medium",
              )}
            >
              <Library size={15} className="text-muted-foreground" />
              <span className="flex-1 text-left">Todas as pastas</span>
              <span className="numeric text-[11px] text-muted-foreground">{bib.pdfs.length}</span>
            </button>
            <div className="mt-1 space-y-0.5">
              {arvore.map((no) => (
                <ArvoreItem
                  key={no.id}
                  no={no}
                  nivel={0}
                  pastas={bib.pastas}
                  atual={pastaAtual?.id ?? null}
                  abertas={abertas}
                  alvo={alvo}
                  contagem={contagem}
                  onToggle={toggle}
                  onAbrir={abrirPasta}
                  propsDeAlvo={propsDeAlvo}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPastaDialog({ mode: "create", parentId: null })}
              className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <FolderPlus size={14} /> Novo tema
            </button>
          </CardContent>
        </Card>

        {/* Conteúdo da pasta */}
        <div className="relative min-w-0 space-y-5" {...areaProps}>
          {arrastandoArquivos && (
            <div className="pointer-events-none absolute -inset-2 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-primary/5 backdrop-blur-[1px]">
              <div className="rounded-xl bg-card px-5 py-3 text-sm font-medium shadow-lg flex items-center gap-2">
                <Upload size={16} className="text-primary" />
                {pastaAtual ? `Solte para guardar em "${pastaAtual.nome}"` : "Solte na pasta desejada ou aqui para escolher"}
              </div>
            </div>
          )}

          {/* Caminho */}
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            <button type="button" onClick={() => abrirPasta(null)} className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              <Home size={14} /> PDFs
            </button>
            {caminho.map((p, i) => (
              <span key={p.id} className="inline-flex items-center gap-1">
                <ChevronRight size={14} className="text-muted-foreground/50" />
                <button
                  type="button"
                  onClick={() => abrirPasta(p.id)}
                  className={cn(
                    "rounded-md px-1.5 py-0.5 hover:bg-muted",
                    i === caminho.length - 1 ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                  {...propsDeAlvo(p.id)}
                >
                  {p.nome}
                </button>
              </span>
            ))}
          </nav>

          {pastaAtual && (
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${corAtual}22`, color: corAtual }}>
                <FolderOpen size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-semibold leading-tight">{pastaAtual.nome}</h2>
                <p className="text-xs text-muted-foreground">
                  {qtdAtual?.direto ?? 0} {qtdAtual?.direto === 1 ? "PDF" : "PDFs"} aqui
                  {subpastas.length > 0 && ` · ${subpastas.length} ${subpastas.length === 1 ? "subpasta" : "subpastas"} · ${qtdAtual?.total ?? 0} no total`}
                </p>
              </div>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" title="Opções da pasta"><MoreVertical size={16} /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setPastaDialog({ mode: "create", parentId: pastaAtual.id })}>
                    <FolderPlus size={14} className="mr-2" /> Nova subpasta
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setPastaDialog({ mode: "edit", pasta: pastaAtual })}>
                    <Pencil size={14} className="mr-2" /> Renomear / mover
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setPastaToDelete(pastaAtual)}>
                    <Trash2 size={14} className="mr-2" /> Excluir pasta
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <Input placeholder="Buscar PDF em todas as pastas..." className="pl-10 pr-9" value={busca} onChange={(e) => setBusca(e.target.value)} />
            {busca && (
              <button type="button" onClick={() => setBusca("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title="Limpar busca">
                <X size={16} />
              </button>
            )}
          </div>

          {envios.length > 0 && (
            <Card>
              <CardContent className="p-3 space-y-2">
                {envios.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 text-sm">
                    {e.status === "enviando" && <Loader2 size={15} className="shrink-0 animate-spin text-primary" />}
                    {e.status === "ok" && <CheckCircle2 size={15} className="shrink-0 text-emerald-500" />}
                    {e.status === "erro" && <AlertCircle size={15} className="shrink-0 text-destructive" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{e.nome}</p>
                      {e.status === "erro"
                        ? <p className="truncate text-[11px] text-destructive">{e.erro}</p>
                        : <Progress value={e.progresso} className="mt-1 h-1.5" />}
                    </div>
                    {e.status === "erro" && (
                      <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setEnvios((prev) => prev.filter((x) => x.id !== e.id))} title="Dispensar">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {busca.trim() ? (
            <section className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {resultadosBusca.length} {resultadosBusca.length === 1 ? "resultado" : "resultados"}
              </h3>
              {resultadosBusca.length > 0 ? (
                <Card><div className="divide-y">{resultadosBusca.map((f) => linhaPdf(f, true))}</div></Card>
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">Nenhum PDF com esse nome.</p>
              )}
            </section>
          ) : (
            <>
              {/* Pastas (na raiz, os temas) */}
              {(subpastas.length > 0 || (!pastaAtual && !loading)) && (
                <section className="space-y-2">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{pastaAtual ? "Subpastas" : "Temas"}</h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {subpastas.map((no) => {
                      const cor = corDaPasta(bib.pastas, no.id);
                      const c = contagem.get(no.id);
                      return (
                        <button
                          key={no.id}
                          type="button"
                          onClick={() => abrirPasta(no.id)}
                          className={cn(
                            "group relative flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition-all hover:-translate-y-px hover:border-foreground/20 hover:shadow-md",
                            alvo === no.id && "border-primary ring-2 ring-primary/40",
                          )}
                          {...propsDeAlvo(no.id)}
                        >
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${cor}22`, color: cor }}>
                            {alvo === no.id ? <FolderOpen size={20} /> : <Folder size={20} />}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{no.nome}</span>
                            <span className="block text-[11px] text-muted-foreground">
                              {c?.total ?? 0} {c?.total === 1 ? "PDF" : "PDFs"}
                              {no.filhos.length > 0 && ` · ${no.filhos.length} ${no.filhos.length === 1 ? "pasta" : "pastas"}`}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setPastaDialog({ mode: "create", parentId: pastaAtual?.id ?? null })}
                      className="flex items-center justify-center gap-2 rounded-xl border border-dashed p-3 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                    >
                      <FolderPlus size={16} /> {pastaAtual ? "Nova subpasta" : "Novo tema"}
                    </button>
                  </div>
                </section>
              )}

              {/* PDFs da pasta */}
              {pastaAtual ? (
                <section className="space-y-2">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">PDFs</h3>
                  {pdfsDaPasta.length > 0 && <Card><div className="divide-y">{pdfsDaPasta.map((f) => linhaPdf(f, false))}</div></Card>}
                  <button
                    type="button"
                    onClick={escolherArquivos}
                    className={cn(
                      "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-foreground",
                      pdfsDaPasta.length ? "py-5" : "py-14",
                    )}
                  >
                    <Upload size={pdfsDaPasta.length ? 18 : 28} className="text-primary" />
                    <span>
                      <span className="font-medium text-foreground">Arraste PDFs aqui</span> ou clique para escolher do computador
                    </span>
                    {!pdfsDaPasta.length && <span className="text-xs">Até 50 MB por arquivo. Pode soltar vários de uma vez.</span>}
                  </button>
                </section>
              ) : (
                recentes.length > 0 && (
                  <section className="space-y-2">
                    <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Adicionados recentemente</h3>
                    <Card><div className="divide-y">{recentes.map((f) => linhaPdf(f, true))}</div></Card>
                  </section>
                )
              )}

              {!pastaAtual && !loading && bib.pastas.length > 0 && bib.pdfs.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
                  <div className="bg-muted rounded-full p-4"><FileText size={32} className="text-muted-foreground" /></div>
                  <h3 className="text-base font-medium">Nenhum PDF guardado ainda</h3>
                  <p className="text-muted-foreground max-w-sm text-sm">Abra um tema e arraste os arquivos, ou solte-os direto em cima de uma pasta.</p>
                </div>
              )}
            </>
          )}

          {loading && !biblioteca && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" /> Carregando...
            </div>
          )}
        </div>
      </div>

      <PdfViewer pdf={visualizando} local={visualizando ? nomeDoLocal(visualizando.pasta_id) : undefined} onClose={() => setVisualizando(null)} />

      <PdfEditDialog
        pdf={editando}
        pastas={bib.pastas}
        onClose={() => setEditando(null)}
        onSaved={(patch) =>
          setBiblioteca((prev) => prev && { ...prev, pdfs: prev.pdfs.map((f) => (f.id === editando?.id ? { ...f, ...patch } : f)) })
        }
      />

      <EnviarPdfsDialog
        arquivos={pendentes?.arquivos ?? null}
        pastaInicial={pendentes?.pastaId ?? null}
        pastas={bib.pastas}
        onClose={() => setPendentes(null)}
        onPastaCriada={(pasta) => setBiblioteca((prev) => ({ ...(prev ?? VAZIA), pastas: [...(prev ?? VAZIA).pastas, pasta] }))}
        onConfirmar={(itens, pastaId) => {
          setPendentes(null);
          enviar(itens, pastaId);
        }}
      />

      <PastaDialog
        state={pastaDialog}
        pastas={bib.pastas}
        onClose={() => setPastaDialog(null)}
        onSaved={load}
      />

      <ExcluirPastaDialog
        pasta={pastaToDelete}
        biblioteca={bib}
        onClose={() => setPastaToDelete(null)}
        onDeleted={async (pasta) => {
          // Se a pasta aberta (ou uma de suas mães) foi excluída, volta para a mãe dela
          if (caminho.some((p) => p.id === pasta.id)) abrirPasta(pasta.parent_id);
          await load();
        }}
      />

      <AlertDialog open={!!pdfToDelete} onOpenChange={(o) => { if (!o && !excluindoPdf) setPdfToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{pdfToDelete?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>O arquivo é apagado de vez do armazenamento. Não há como desfazer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindoPdf}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmarExclusaoPdf(); }} disabled={excluindoPdf} className="bg-destructive hover:bg-destructive/90">
              {excluindoPdf ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function encontrarNo(nos: PastaNo[], id: string): PastaNo | undefined {
  for (const n of nos) {
    if (n.id === id) return n;
    const achado = encontrarNo(n.filhos, id);
    if (achado) return achado;
  }
  return undefined;
}

// ---------------------------------------------------------------- Árvore lateral

interface ArvoreItemProps {
  no: PastaNo;
  nivel: number;
  pastas: PdfPasta[];
  atual: string | null;
  abertas: Set<string>;
  alvo: string | null;
  contagem: Map<string, { direto: number; total: number }>;
  onToggle: (id: string) => void;
  onAbrir: (id: string) => void;
  propsDeAlvo: (id: string) => Record<string, (e: DragEvent) => void>;
}

function ArvoreItem(props: ArvoreItemProps) {
  const { no, nivel, pastas, atual, abertas, alvo, contagem, onToggle, onAbrir, propsDeAlvo } = props;
  const aberta = abertas.has(no.id);
  const cor = corDaPasta(pastas, no.id);
  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md pr-2 text-sm transition-colors hover:bg-muted",
          atual === no.id && "bg-primary/10 font-medium",
          alvo === no.id && "bg-primary/15 ring-1 ring-primary/50",
        )}
        style={{ paddingLeft: 4 + nivel * 14 }}
        {...propsDeAlvo(no.id)}
      >
        <button
          type="button"
          onClick={() => onToggle(no.id)}
          className={cn("flex h-6 w-5 shrink-0 items-center justify-center text-muted-foreground", !no.filhos.length && "invisible")}
          title={aberta ? "Recolher" : "Expandir"}
        >
          {aberta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <button type="button" onClick={() => onAbrir(no.id)} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left">
          {atual === no.id || alvo === no.id
            ? <FolderOpen size={15} className="shrink-0" style={{ color: cor }} />
            : <Folder size={15} className="shrink-0" style={{ color: cor }} />}
          <span className="truncate">{no.nome}</span>
        </button>
        <span className="numeric text-[11px] text-muted-foreground">{contagem.get(no.id)?.total || ""}</span>
      </div>
      {aberta && no.filhos.map((f) => <ArvoreItem key={f.id} {...props} no={f} nivel={nivel + 1} />)}
    </div>
  );
}

// ---------------------------------------------------------------- Linha de PDF

interface PdfLinhaProps {
  pdf: PdfArquivo;
  local?: string;
  cor: string;
  onVer: () => void;
  onBaixar: () => void;
  onEditar: () => void;
  onExcluir: () => void;
}

function PdfLinha({ pdf, local, cor, onVer, onBaixar, onEditar, onExcluir }: PdfLinhaProps) {
  return (
    <div
      className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(MIME_PDF_INTERNO, pdf.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      title="Arraste para uma pasta para mover"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-500">
        <FileText size={18} />
      </span>
      <button type="button" onClick={onVer} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-medium group-hover:underline underline-offset-2">{pdf.nome}</span>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {pdf.player && (
            <>
              <span className="truncate font-medium text-foreground/80">{pdf.player}</span>
              <span>·</span>
            </>
          )}
          {local && (
            <>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: cor }} />
              <span className="truncate">{local}</span>
              <span>·</span>
            </>
          )}
          <span className="shrink-0">{formatarTamanho(pdf.tamanho)}</span>
          <span>·</span>
          <span className="shrink-0">{format(new Date(pdf.created_at), "dd/MM/yyyy")}</span>
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" variant="outline" className="h-8 gap-1.5 px-2.5" onClick={onVer} title="Visualizar">
          <Eye size={14} /> <span className="hidden sm:inline">Visualizar</span>
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 px-2.5" onClick={onBaixar} title="Baixar">
          <Download size={14} /> <span className="hidden sm:inline">Baixar</span>
        </Button>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Mais opções"><MoreVertical size={15} /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEditar}><Pencil size={14} className="mr-2" /> Editar (nome, player, pasta)</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onExcluir}>
              <Trash2 size={14} className="mr-2" /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
