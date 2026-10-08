import { useRef, useState } from "react";
import { FileAudio, FileVideo, Link2, Loader2, Plus, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { normalizarUrl } from "@/lib/linksTexto";
import { plataformaDoLink, rotuloPlataforma, tipoDeArquivo } from "@/lib/transcritorTexto";

type Modo = "link" | "arquivo";
interface LinhaLink { link: string; nome: string }
interface LinhaArquivo { arquivo: File; nome: string }

interface Props {
  aberto: boolean;
  onClose: () => void;
  onLinks: (itens: { link: string; nome?: string }[]) => Promise<void>;
  onArquivos: (itens: { arquivo: File; nome?: string }[]) => Promise<void>;
}

function tamanho(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** "Transcrever": pergunta se é link ou arquivo; plataforma e formato são detectados sozinhos. */
export function TranscreverDialog({ aberto, onClose, onLinks, onArquivos }: Props) {
  const [modo, setModo] = useState<Modo>("link");
  const [links, setLinks] = useState<LinhaLink[]>([{ link: "", nome: "" }]);
  const [arquivos, setArquivos] = useState<LinhaArquivo[]>([]);
  const [recusados, setRecusados] = useState<string[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const limpar = () => {
    setLinks([{ link: "", nome: "" }]);
    setArquivos([]);
    setRecusados([]);
  };
  const fechar = () => { if (!salvando) { limpar(); onClose(); } };

  const receber = (lista: FileList | File[]) => {
    const bons: LinhaArquivo[] = [];
    const ruins: string[] = [];
    for (const f of Array.from(lista)) {
      if (tipoDeArquivo(f.name, f.type)) bons.push({ arquivo: f, nome: "" });
      else ruins.push(f.name);
    }
    setArquivos((prev) => [...prev, ...bons]);
    setRecusados(ruins);
  };

  // Colar vários links de uma vez (um por linha) vira várias linhas
  const colarLinks = (i: number, texto: string) => {
    const partes = texto.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (partes.length <= 1) return false;
    setLinks((prev) => [...prev.slice(0, i), ...partes.map((link) => ({ link, nome: "" })), ...prev.slice(i + 1)]);
    return true;
  };

  const linksValidos = links.filter((l) => l.link.trim()).map((l) => ({ ...l, url: normalizarUrl(l.link) }));
  const linksInvalidos = linksValidos.filter((l) => !l.url);
  const pode = modo === "link" ? linksValidos.length > 0 && !linksInvalidos.length : arquivos.length > 0;

  const enviar = async () => {
    if (!pode) return;
    setSalvando(true);
    try {
      if (modo === "link") await onLinks(linksValidos.map((l) => ({ link: l.url as string, nome: l.nome.trim() || undefined })));
      else await onArquivos(arquivos.map((a) => ({ arquivo: a.arquivo, nome: a.nome.trim() || undefined })));
      limpar();
      onClose();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) fechar(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Transcrever</DialogTitle>
          <DialogDescription>Link ou arquivo — a plataforma e o formato são reconhecidos sozinhos. O nome é opcional.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          {([["link", "Link", "Instagram, TikTok, YouTube, anúncio…", Link2], ["arquivo", "Arquivo", "mp3, mp4, mov, m4a, wav…", Upload]] as const).map(([valor, titulo, sub, Icone]) => (
            <button key={valor} type="button" onClick={() => setModo(valor)}
              className={cn("flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors", modo === valor ? "border-primary bg-primary/5" : "border-border/70 hover:bg-muted/40")}>
              <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", modo === valor ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
                <Icone size={15} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{titulo}</span>
                <span className="block text-xs text-muted-foreground">{sub}</span>
              </span>
            </button>
          ))}
        </div>

        {modo === "link" ? (
          <div className="space-y-3">
            {links.map((l, i) => {
              const url = l.link.trim() ? normalizarUrl(l.link) : null;
              return (
                <div key={i} className="space-y-1.5 rounded-lg border p-2.5">
                  <div className="flex items-center gap-2">
                    <Input autoFocus={i === 0} placeholder="Cole o link (dá para colar vários de uma vez)" value={l.link}
                      onPaste={(e) => { if (colarLinks(i, e.clipboardData.getData("text"))) e.preventDefault(); }}
                      onChange={(e) => setLinks((prev) => prev.map((x, j) => (j === i ? { ...x, link: e.target.value } : x)))} />
                    {links.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setLinks((prev) => prev.filter((_, j) => j !== i))} aria-label="Remover link">
                        <X size={14} />
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input placeholder="Nome (opcional)" value={l.nome} className="h-8 text-xs"
                      onChange={(e) => setLinks((prev) => prev.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} />
                    {l.link.trim() && (
                      <span className={cn("shrink-0 text-[11px]", url ? "text-muted-foreground" : "text-destructive")}>
                        {url ? rotuloPlataforma({ origem: "link", plataforma: plataformaDoLink(url) }) : "Link inválido"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => setLinks((prev) => [...prev, { link: "", nome: "" }])}>
              <Plus size={14} /> Outro link
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <input ref={input} type="file" multiple accept="audio/*,video/*" className="hidden"
              onChange={(e) => { if (e.target.files?.length) receber(e.target.files); e.target.value = ""; }} />
            <button type="button" onClick={() => input.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)}
              onDrop={(e) => { e.preventDefault(); setArrastando(false); receber(e.dataTransfer.files); }}
              className={cn("flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-8 text-sm text-muted-foreground transition-colors",
                arrastando ? "border-primary bg-primary/5" : "hover:border-primary/50 hover:bg-primary/5")}>
              <Upload size={24} className="text-primary" />
              <span><span className="font-medium text-foreground">Arraste arquivos aqui</span> ou clique para escolher</span>
              <span className="text-xs">Áudio ou vídeo, qualquer duração. Vários de uma vez.</span>
            </button>
            {recusados.length > 0 && <p className="text-xs text-destructive">Não são áudio nem vídeo: {recusados.join(", ")}</p>}
            {arquivos.map((a, i) => {
              const tipo = tipoDeArquivo(a.arquivo.name, a.arquivo.type);
              const Icone = tipo === "video" ? FileVideo : FileAudio;
              return (
                <div key={`${a.arquivo.name}-${i}`} className="flex items-center gap-2 rounded-lg border p-2">
                  <Icone size={18} className="shrink-0 text-primary" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate text-xs font-medium" title={a.arquivo.name}>{a.arquivo.name} <span className="font-normal text-muted-foreground">· {tamanho(a.arquivo.size)}</span></p>
                    <Input placeholder="Nome (opcional)" value={a.nome} className="h-7 text-xs"
                      onChange={(e) => setArquivos((prev) => prev.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} />
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setArquivos((prev) => prev.filter((_, j) => j !== i))} aria-label="Remover arquivo">
                    <X size={14} />
                  </Button>
                </div>
              );
            })}
            {arquivos.length > 0 && <p className="text-[11px] text-muted-foreground">Pode usar outras páginas do sistema ou outros programas enquanto sobem; só não feche esta aba do navegador até o envio terminar.</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={fechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={enviar} disabled={!pode || salvando} className="gap-1.5">
            {salvando && <Loader2 size={14} className="animate-spin" />}
            {modo === "link" ? `Transcrever${linksValidos.length > 1 ? ` ${linksValidos.length} links` : ""}` : `Enviar${arquivos.length > 1 ? ` ${arquivos.length} arquivos` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
