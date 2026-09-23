import { useEffect, useMemo, useRef, useState } from "react";
import { Download, ExternalLink, FileText, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { atualizarPdf, baixarConteudo, salvarNoComputador, mensagemErroPdf, type PdfArquivo } from "@/lib/pdfs";
import { opcoesDePasta, formatarTamanho, type PdfPasta } from "@/lib/pdfsArvore";

function SelectPasta({ pastas, value, onChange, id }: { pastas: PdfPasta[]; value: string; onChange: (v: string) => void; id?: string }) {
  const opcoes = useMemo(() => opcoesDePasta(pastas), [pastas]);
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger id={id}><SelectValue placeholder="Escolher pasta" /></SelectTrigger>
      <SelectContent>
        {opcoes.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            <span style={{ paddingLeft: o.nivel * 14 }}>{o.nome}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------- Visualizador

interface PdfViewerProps {
  pdf: PdfArquivo | null;
  /** Ex.: "Tráfego / Meta Ads" */
  local?: string;
  onClose: () => void;
}

/** Visualização em tela cheia com botões de baixar, abrir em nova aba e fechar. */
export function PdfViewer({ pdf, local, onClose }: PdfViewerProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);
  const blobRef = useRef<Blob | null>(null);

  useEffect(() => {
    if (!pdf) return;
    let cancelado = false;
    let objectUrl: string | null = null;
    setUrl(null);
    setErro(null);
    baixarConteudo(pdf)
      .then((blob) => {
        if (cancelado) return;
        blobRef.current = blob;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((e) => { if (!cancelado) setErro(mensagemErroPdf(e)); });
    return () => {
      cancelado = true;
      blobRef.current = null;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [pdf]);

  const baixar = async () => {
    if (!pdf) return;
    setBaixando(true);
    try {
      await salvarNoComputador(pdf, blobRef.current ?? undefined);
    } catch (e) {
      toast.error(mensagemErroPdf(e));
    } finally {
      setBaixando(false);
    }
  };

  return (
    <Dialog open={!!pdf} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="flex flex-col gap-0 p-0 overflow-hidden w-[calc(100vw-1rem)] h-[calc(100dvh-1rem)] max-w-none sm:max-w-none sm:w-[calc(100vw-3rem)] sm:h-[calc(100dvh-3rem)] [&>button:last-child]:hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-3 border-b px-3 py-2 sm:px-4">
          <FileText size={18} className="shrink-0 text-red-500" />
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm font-semibold leading-tight">{pdf?.nome}</DialogTitle>
            <DialogDescription className="truncate text-[11px]">
              {[local, pdf ? formatarTamanho(pdf.tamanho) : null].filter(Boolean).join(" · ")}
            </DialogDescription>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {url && (
              <Button
                variant="ghost"
                size="sm"
                className="hidden sm:inline-flex gap-1.5"
                onClick={() => window.open(url, "_blank", "noopener")}
                title="Abrir em nova aba"
              >
                <ExternalLink size={14} /> Nova aba
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={baixar} disabled={baixando || !pdf}>
              {baixando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Baixar
            </Button>
            <Button size="sm" className="gap-1.5" onClick={onClose}>
              <X size={14} /> Fechar
            </Button>
          </div>
        </div>
        <div className="relative flex-1 bg-muted/40">
          {erro ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-destructive">{erro}</p>
              <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
            </div>
          ) : url ? (
            <iframe key={url} src={url} title={pdf?.nome} className="absolute inset-0 h-full w-full border-0" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={18} className="animate-spin" /> Carregando PDF...
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Renomear / mover

interface PdfEditDialogProps {
  pdf: PdfArquivo | null;
  pastas: PdfPasta[];
  onClose: () => void;
  onSaved: (patch: { nome: string; pasta_id: string }) => void;
}

export function PdfEditDialog({ pdf, pastas, onClose, onSaved }: PdfEditDialogProps) {
  const [nome, setNome] = useState("");
  const [pastaId, setPastaId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!pdf) return;
    setNome(pdf.nome);
    setPastaId(pdf.pasta_id);
  }, [pdf]);

  const save = async () => {
    if (!pdf) return;
    if (!nome.trim()) { toast.error("Dê um nome para o PDF"); return; }
    if (!pastaId) { toast.error("Escolha a pasta"); return; }
    setSaving(true);
    try {
      await atualizarPdf(pdf.id, { nome: nome.trim(), pasta_id: pastaId });
      onSaved({ nome: nome.trim(), pasta_id: pastaId });
      toast.success("PDF atualizado");
      onClose();
    } catch (e) {
      toast.error(mensagemErroPdf(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!pdf} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Renomear ou mover PDF</DialogTitle>
          <DialogDescription>Arquivo original: {pdf?.arquivo_nome}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <div className="space-y-2">
            <Label htmlFor="pdf-nome">Nome</Label>
            <Input id="pdf-nome" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pdf-pasta">Pasta</Label>
            <SelectPasta id="pdf-pasta" pastas={pastas} value={pastaId} onChange={setPastaId} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Escolher pasta para envio

interface EscolherPastaDialogProps {
  arquivos: File[] | null;
  pastas: PdfPasta[];
  onClose: () => void;
  onEscolhida: (pastaId: string) => void;
}

/** Quando os PDFs chegam fora de uma pasta (na raiz da aba), pergunta onde guardar. */
export function EscolherPastaDialog({ arquivos, pastas, onClose, onEscolhida }: EscolherPastaDialogProps) {
  const [pastaId, setPastaId] = useState("");

  useEffect(() => {
    if (arquivos) setPastaId("");
  }, [arquivos]);

  const n = arquivos?.length ?? 0;
  return (
    <Dialog open={!!arquivos} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Guardar em qual pasta?</DialogTitle>
          <DialogDescription>
            {n === 1 ? `"${arquivos?.[0]?.name}"` : `${n} PDFs`} — escolha o tema ou a subpasta.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!pastaId) { toast.error("Escolha a pasta"); return; }
            onEscolhida(pastaId);
          }}
        >
          <SelectPasta pastas={pastas} value={pastaId} onChange={setPastaId} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={!pastaId}>Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
