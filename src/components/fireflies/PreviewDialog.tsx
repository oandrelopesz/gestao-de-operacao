import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, Loader2, NotebookPen, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  CONTENT_TYPE, FIREFLIES_BUCKET, ROTULO_TIPO, caminhoArquivo, chaveArquivo, dataCurta, horario, mensagemErroFireflies, nomeArquivo,
  tituloExibido, type FormatoArquivo, type ReuniaoFireflies, type TipoArquivo,
} from "@/lib/fireflies";

// ---------------------------------------------------------------- Arquivos no Storage

/** Baixa o arquivo do bucket privado `fireflies` (passa pela API com a chave do app), já com o tipo certo. */
async function baixarDoBucket(caminho: string, formato: FormatoArquivo): Promise<Blob> {
  const { data, error } = await supabase.storage.from(FIREFLIES_BUCKET).download(caminho);
  if (error) throw error;
  const tipo = CONTENT_TYPE[formato];
  return data.type === tipo ? data : new Blob([data], { type: tipo });
}

// Cache da sessão (chave = caminho + updated_at da linha): o arquivo pré-carregado quando o ponteiro chega no
// botão abre/baixa na hora, e rever o mesmo PDF não baixa de novo. Poucas dezenas de KB cada; guarda os últimos 30.
const MAX_CACHE = 30;
const cacheArquivos = new Map<string, Promise<Blob>>();

function doCache(chave: string, caminho: string, formato: FormatoArquivo): Promise<Blob> {
  const existente = cacheArquivos.get(chave);
  if (existente) {
    cacheArquivos.delete(chave);
    cacheArquivos.set(chave, existente); // mais recente no fim
    return existente;
  }
  const promessa = baixarDoBucket(caminho, formato);
  promessa.catch(() => cacheArquivos.delete(chave)); // falhou: a próxima tentativa baixa de novo
  cacheArquivos.set(chave, promessa);
  while (cacheArquivos.size > MAX_CACHE) cacheArquivos.delete(cacheArquivos.keys().next().value as string);
  return promessa;
}

/** O arquivo da reunião (do cache da sessão quando já foi baixado ou pré-carregado). */
export function baixarArquivoFireflies(r: ReuniaoFireflies, tipo: TipoArquivo, formato: FormatoArquivo): Promise<Blob> {
  const caminho = caminhoArquivo(r, tipo, formato);
  const chave = chaveArquivo(r, tipo, formato);
  if (!caminho || !chave) return Promise.reject(new Error("Este arquivo ainda não foi gerado."));
  return doCache(chave, caminho, formato);
}

/** Pré-carrega em segundo plano (ponteiro sobre o botão, toque começando): erros ficam para quando clicar. */
export function preCarregarArquivo(r: ReuniaoFireflies, tipo: TipoArquivo, formato: FormatoArquivo): void {
  baixarArquivoFireflies(r, tipo, formato).catch(() => {});
}

/** Salva no computador/celular com o nome dado (o nome do caminho no bucket é genérico). */
export function salvarBlob(blob: Blob, nome: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

// ---------------------------------------------------------------- Prévia do PDF

export interface AlvoPrevia {
  reuniao: ReuniaoFireflies;
  tipo: TipoArquivo;
}

interface PreviewDialogProps {
  /** Reunião e qual PDF mostrar (transcrição ou resumo); null = fechado */
  alvo: AlvoPrevia | null;
  onClose: () => void;
}

/** Prévia do PDF em tela cheia (como na aba Arquivos), com baixar e fechar. */
export function PreviewDialog({ alvo, onClose }: PreviewDialogProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);
  const blobRef = useRef<Blob | null>(null);
  const caminho = alvo ? caminhoArquivo(alvo.reuniao, alvo.tipo, "pdf") : null;

  useEffect(() => {
    if (!alvo) return;
    let cancelado = false;
    let objectUrl: string | null = null;
    setUrl(null);
    setErro(null);
    blobRef.current = null;
    if (!caminho) {
      setErro("Este PDF ainda não foi gerado.");
      return;
    }
    baixarArquivoFireflies(alvo.reuniao, alvo.tipo, "pdf")
      .then((blob) => {
        if (cancelado) return;
        blobRef.current = blob;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((e) => { if (!cancelado) setErro(mensagemErroFireflies(e)); });
    // Ao fechar (ou trocar de arquivo) o endereço temporário do PDF é liberado (o arquivo segue no cache da sessão)
    return () => {
      cancelado = true;
      blobRef.current = null;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [alvo, caminho]);

  const baixar = async () => {
    if (!alvo || !caminho) return;
    setBaixando(true);
    try {
      const blob = blobRef.current ?? (await baixarArquivoFireflies(alvo.reuniao, alvo.tipo, "pdf"));
      salvarBlob(blob, nomeArquivo(alvo.reuniao, alvo.tipo, "pdf"));
    } catch (e) {
      toast.error(mensagemErroFireflies(e));
    } finally {
      setBaixando(false);
    }
  };

  const r = alvo?.reuniao;
  const rotulo = alvo ? ROTULO_TIPO[alvo.tipo] : "";
  const quando = r ? [dataCurta(r.data_hora), horario(r.data_hora, r.duracao_min)].filter(Boolean).join(" · ") : "";

  return (
    <Dialog open={!!alvo} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="flex flex-col gap-0 p-0 overflow-hidden w-[calc(100vw-1rem)] h-[calc(100dvh-1rem)] max-w-none sm:max-w-none sm:w-[calc(100vw-3rem)] sm:h-[calc(100dvh-3rem)] max-sm:w-full [&>button:last-child]:hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-3 border-b px-3 py-2 sm:px-4">
          <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:flex">
            <NotebookPen size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm font-semibold leading-tight">
              {r ? `${rotulo} · ${tituloExibido(r)}` : ""}
            </DialogTitle>
            <DialogDescription className="truncate text-[11px]">{quando || "Reunião do Fireflies"}</DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {url && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 pointer-coarse:min-w-10"
                onClick={() => window.open(url, "_blank", "noopener")}
                title="Abrir em nova aba"
                aria-label="Abrir em nova aba"
              >
                <ExternalLink size={14} /> <span className="hidden sm:inline">Nova aba</span>
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={baixar} disabled={baixando || !caminho}>
              {baixando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Baixar PDF
            </Button>
            <Button size="sm" className="gap-1.5" onClick={onClose}>
              <X size={14} /> Fechar
            </Button>
          </div>
        </div>
        <div className="relative flex-1 bg-muted/40">
          {erro ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="max-w-md text-sm text-destructive">{erro}</p>
              <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
            </div>
          ) : url ? (
            <iframe key={url} src={url} title={r ? `${rotulo} · ${tituloExibido(r)}` : rotulo} className="absolute inset-0 h-full w-full border-0" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={18} className="animate-spin" /> Carregando…
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
