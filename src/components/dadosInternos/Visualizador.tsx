// Tela cheia para um arquivo das respostas: briefing em perguntas e respostas, texto, imagem, PDF,
// Doc (convertido em PDF só para exibir) e planilha (tabela). Baixar no original ou no formato escolhido.
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Download, ExternalLink, FileText, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { IconeArquivo } from "@/components/pdfs/IconeArquivo";
import { cn } from "@/lib/utils";
import {
  formatarDataHora, formatosDeDownload, idDeLinkDoGoogle, linkNoGoogle, modoDoItem, rotuloDoItem, type Formulario, type ItemDrive,
} from "@/lib/dadosInternos";
import { lerBriefing } from "@/lib/briefingTexto";
import { lerCsv } from "@/lib/csv";
import { ExportGrandeError, baixarOriginal, exportar, obterItem, salvarItem } from "@/lib/driveLeitura";

type Conteudo =
  | { tipo: "url"; url: string }
  | { tipo: "texto"; texto: string }
  | { tipo: "tabela"; linhas: string[][] }
  | { tipo: "nada" };

export interface VisualizadorProps {
  arquivoId: string | null;
  formulario: Formulario;
  onFechar: () => void;
  /** Abrir outro arquivo (link de Doc dentro da planilha do contrato) */
  onAbrirArquivo: (id: string) => void;
}

export function Visualizador({ arquivoId, formulario, onFechar, onAbrirArquivo }: VisualizadorProps) {
  const [item, setItem] = useState<ItemDrive | null>(null);
  const [conteudo, setConteudo] = useState<Conteudo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [original, setOriginal] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const modo = item ? modoDoItem(item, formulario.id) : null;

  useEffect(() => {
    setItem(null);
    setConteudo(null);
    setErro(null);
    setOriginal(false);
    if (!arquivoId) return;
    let cancelado = false;
    let objectUrl: string | null = null;
    (async () => {
      const it = await obterItem(arquivoId);
      if (cancelado) return;
      setItem(it);
      const m = modoDoItem(it, formulario.id);
      if (m === "nenhum") { setConteudo({ tipo: "nada" }); return; }
      if (m === "planilha") {
        const texto = await (await exportar(it.id, "text/csv")).text();
        if (!cancelado) setConteudo({ tipo: "tabela", linhas: lerCsv(texto) });
        return;
      }
      if (m === "briefing" || m === "texto") {
        const texto = await (await baixarOriginal(it.id)).text();
        if (!cancelado) setConteudo({ tipo: "texto", texto });
        return;
      }
      const blob = m === "doc" ? await exportar(it.id, "application/pdf") : await baixarOriginal(it.id);
      if (cancelado) return;
      // O iframe/img só mostra com o tipo certo
      const tipo = m === "doc" || m === "pdf" ? "application/pdf" : blob.type || it.mimeType;
      objectUrl = URL.createObjectURL(new Blob([blob], { type: tipo }));
      setConteudo({ tipo: "url", url: objectUrl });
    })().catch((e) => {
      if (cancelado) return;
      setErro(e instanceof ExportGrandeError ? "Grande demais para visualizar aqui. Use \"Abrir no Google\"." : e instanceof Error ? e.message : "Não consegui abrir");
    });
    return () => {
      cancelado = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [arquivoId, formulario.id]);

  const briefing = useMemo(
    () => (modo === "briefing" && conteudo?.tipo === "texto" ? lerBriefing(conteudo.texto) : null),
    [modo, conteudo],
  );
  const formatos = item ? formatosDeDownload(item.mimeType) : [];
  const rotulo = item ? rotuloDoItem(item, formulario.id) : null;

  const baixar = async (indice: number) => {
    if (!item) return;
    setBaixando(true);
    try {
      await salvarItem(item, formatos[indice]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui baixar");
    } finally {
      setBaixando(false);
    }
  };

  return (
    <Dialog open={!!arquivoId} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent
        className="flex flex-col gap-0 overflow-hidden p-0 w-[calc(100vw-1rem)] h-[calc(100dvh-1rem)] max-w-none sm:max-w-none sm:w-[calc(100vw-3rem)] sm:h-[calc(100dvh-3rem)] [&>button:last-child]:hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-3 border-b px-3 py-2 sm:px-4">
          <IconeArquivo nome={item?.name ?? "arquivo"} tamanho={30} />
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm font-semibold leading-tight">{rotulo?.titulo ?? "Abrindo…"}</DialogTitle>
            <DialogDescription className="truncate text-[11px]">
              {[formulario.aba, rotulo ? formatarDataHora(rotulo.data) : null].filter(Boolean).join(" · ")}
            </DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {modo === "briefing" && briefing && (
              <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => setOriginal((o) => !o)}>
                {original ? "Perguntas e respostas" : "Texto original"}
              </Button>
            )}
            {item && (
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => window.open(linkNoGoogle(item), "_blank", "noopener")} title="Abrir no Google">
                <ExternalLink size={14} /> <span className="hidden sm:inline">Abrir no Google</span>
              </Button>
            )}
            {formatos.length === 1 && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void baixar(0)} disabled={baixando}>
                {baixando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Baixar
              </Button>
            )}
            {formatos.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5" disabled={baixando}>
                    {baixando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Baixar <ChevronDown size={13} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {formatos.map((f, i) => <DropdownMenuItem key={f.rotulo} onClick={() => void baixar(i)}>{f.rotulo}</DropdownMenuItem>)}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button size="sm" className="gap-1.5" onClick={onFechar}><X size={14} /> Fechar</Button>
          </div>
        </div>

        <div className="relative flex-1 bg-muted/40">
          {erro ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-destructive">{erro}</p>
              <Button variant="outline" size="sm" onClick={onFechar}>Fechar</Button>
            </div>
          ) : !conteudo ? (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={18} className="animate-spin" /> Carregando…
            </div>
          ) : conteudo.tipo === "nada" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <IconeArquivo nome={item?.name ?? ""} tamanho={64} />
              <p className="text-sm font-medium">{item?.name}</p>
              <p className="max-w-sm text-xs text-muted-foreground">Esse formato não abre aqui dentro. Baixe para abrir no programa certo.</p>
            </div>
          ) : conteudo.tipo === "texto" ? (
            <div className="absolute inset-0 overflow-auto bg-background">
              {briefing && !original ? (
                <div className="mx-auto max-w-3xl space-y-5 p-5 sm:p-8">
                  {briefing.titulo && <h2 className="text-lg font-semibold">{briefing.titulo}</h2>}
                  {briefing.blocos.map((b) => (
                    <section key={b.numero} className="space-y-1.5 border-b pb-4 last:border-0">
                      <p className="text-sm font-semibold">
                        <span className="mr-2 font-mono text-xs text-muted-foreground">{b.numero}</span>
                        {b.pergunta}
                      </p>
                      <p className={cn("whitespace-pre-wrap break-words text-sm leading-relaxed", b.semResposta && "italic text-muted-foreground")}>
                        {b.semResposta ? "Sem resposta" : b.resposta}
                      </p>
                    </section>
                  ))}
                </div>
              ) : (
                <pre className="mx-auto max-w-4xl whitespace-pre-wrap break-words p-6 font-mono text-[13px] leading-relaxed">{conteudo.texto}</pre>
              )}
            </div>
          ) : conteudo.tipo === "tabela" ? (
            <div className="absolute inset-0 overflow-auto bg-background">
              <table className="min-w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-muted">
                  <tr>{(conteudo.linhas[0] ?? []).map((c, j) => <th key={j} className="whitespace-nowrap border-b px-3 py-2 text-left font-semibold">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {conteudo.linhas.slice(1).map((linha, i) => (
                    <tr key={i} className="border-b hover:bg-muted/40">
                      {linha.map((c, j) => {
                        const docId = idDeLinkDoGoogle(c);
                        return (
                          <td key={j} className="max-w-[28rem] whitespace-pre-wrap break-words px-3 py-2 align-top">
                            {docId ? (
                              <Button variant="link" size="sm" className="h-auto gap-1 p-0" onClick={() => onAbrirArquivo(docId)}><FileText size={13} /> Ver documento</Button>
                            ) : /^https?:\/\//.test(c) ? (
                              <a href={c} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">{c}</a>
                            ) : c}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : modo === "imagem" ? (
            <img src={conteudo.url} alt={item?.name ?? ""} className="absolute inset-0 h-full w-full object-contain p-4" />
          ) : (
            <iframe key={conteudo.url} src={conteudo.url} title={item?.name ?? "arquivo"} className="absolute inset-0 h-full w-full border-0" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
