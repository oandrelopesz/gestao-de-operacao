import { useEffect, useMemo, useRef, useState } from "react";
import { Download, ExternalLink, FileText, FolderPlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { atualizarPdf, baixarConteudo, criarPasta, salvarNoComputador, mensagemErroPdf, type PdfArquivo } from "@/lib/pdfs";
import { opcoesDePasta, formatarTamanho, nomeSemExtensao, PASTA_CORES, type PdfPasta } from "@/lib/pdfsArvore";

function SelectPasta({ pastas, value, onChange, id }: { pastas: PdfPasta[]; value: string; onChange: (v: string) => void; id?: string }) {
  const opcoes = useMemo(() => opcoesDePasta(pastas), [pastas]);
  return (
    // O Radix dispara onValueChange("") quando o valor aponta para uma opção que acabou de ser criada
    // e ainda não está registrada (pasta criada dentro do popup); ignorar evita perder a seleção.
    <Select value={value || undefined} onValueChange={(v) => { if (v) onChange(v); }}>
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
  onSaved: (patch: { nome: string; pasta_id: string; player: string | null }) => void;
}

export function PdfEditDialog({ pdf, pastas, onClose, onSaved }: PdfEditDialogProps) {
  const [nome, setNome] = useState("");
  const [player, setPlayer] = useState("");
  const [pastaId, setPastaId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!pdf) return;
    setNome(pdf.nome);
    setPlayer(pdf.player || "");
    setPastaId(pdf.pasta_id);
  }, [pdf]);

  const save = async () => {
    if (!pdf) return;
    if (!nome.trim()) { toast.error("Dê um nome para o PDF"); return; }
    if (!pastaId) { toast.error("Escolha a pasta"); return; }
    setSaving(true);
    try {
      const patch = { nome: nome.trim(), pasta_id: pastaId, player: player.trim() || null };
      await atualizarPdf(pdf.id, patch);
      onSaved(patch);
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
          <DialogTitle>Editar PDF</DialogTitle>
          <DialogDescription>Arquivo original: {pdf?.arquivo_nome}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <div className="space-y-2">
            <Label htmlFor="pdf-nome">Nome</Label>
            <Input id="pdf-nome" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pdf-player">Player</Label>
            <Input id="pdf-player" placeholder="Ex.: Pedro Sobral, Meta, Anthropic" value={player} onChange={(e) => setPlayer(e.target.value)} />
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

// ---------------------------------------------------------------- Popup de envio

export interface PdfParaEnviar {
  arquivo: File;
  nome: string;
  player: string;
}

interface EnviarPdfsDialogProps {
  /** Arquivos já validados (só PDFs, até 50 MB); null = fechado */
  arquivos: File[] | null;
  /** Pasta aberta ou pasta onde os arquivos foram soltos */
  pastaInicial: string | null;
  pastas: PdfPasta[];
  onClose: () => void;
  onPastaCriada: (pasta: PdfPasta) => void;
  onConfirmar: (itens: PdfParaEnviar[], pastaId: string) => void;
}

/**
 * Ao adicionar PDFs: nome (opcional — vazio mantém o nome do documento), player e o tema/pasta.
 * Dá para criar um tema ou uma subpasta ali mesmo, sem sair do popup.
 */
export function EnviarPdfsDialog({ arquivos, pastaInicial, pastas, onClose, onPastaCriada, onConfirmar }: EnviarPdfsDialogProps) {
  const [campos, setCampos] = useState<{ nome: string; player: string }[]>([]);
  const [pastaId, setPastaId] = useState("");
  const [criando, setCriando] = useState<{ parentId: string | null } | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [salvandoPasta, setSalvandoPasta] = useState(false);

  useEffect(() => {
    if (!arquivos) return;
    setCampos(arquivos.map(() => ({ nome: "", player: "" })));
    setPastaId(pastaInicial ?? "");
    setCriando(null);
    setNovoNome("");
  }, [arquivos, pastaInicial]);

  const pastaEscolhida = pastas.find((p) => p.id === pastaId);
  const setCampo = (idx: number, patch: Partial<{ nome: string; player: string }>) =>
    setCampos((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));

  const criarPastaAqui = async () => {
    if (!criando) return;
    const nome = novoNome.trim();
    if (!nome) { toast.error("Dê um nome para a pasta"); return; }
    const repetida = pastas.find((p) => (p.parent_id ?? null) === criando.parentId && p.nome.toLowerCase() === nome.toLowerCase());
    if (repetida) {
      setPastaId(repetida.id);
      setCriando(null);
      setNovoNome("");
      toast.info(`"${repetida.nome}" já existia e foi selecionada`);
      return;
    }
    setSalvandoPasta(true);
    try {
      const temas = pastas.filter((p) => !p.parent_id).length;
      const nova = await criarPasta(pastas, {
        nome,
        parent_id: criando.parentId,
        cor: criando.parentId ? null : PASTA_CORES[temas % PASTA_CORES.length],
      });
      onPastaCriada(nova);
      setPastaId(nova.id);
      setCriando(null);
      setNovoNome("");
      toast.success(criando.parentId ? `Subpasta "${nova.nome}" criada` : `Tema "${nova.nome}" criado`);
    } catch (e) {
      toast.error(mensagemErroPdf(e));
    } finally {
      setSalvandoPasta(false);
    }
  };

  const confirmar = () => {
    if (!arquivos) return;
    if (criando) { criarPastaAqui(); return; }
    if (!pastaId) { toast.error("Escolha o tema ou a pasta do PDF"); return; }
    onConfirmar(arquivos.map((arquivo, i) => ({ arquivo, nome: campos[i]?.nome ?? "", player: campos[i]?.player ?? "" })), pastaId);
  };

  const n = arquivos?.length ?? 0;
  return (
    <Dialog open={!!arquivos} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{n === 1 ? "Adicionar PDF" : `Adicionar ${n} PDFs`}</DialogTitle>
          <DialogDescription>O nome é opcional: se ficar em branco, fica o nome do documento original.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); confirmar(); }}>
          <div className="space-y-3">
            {arquivos?.map((arquivo, i) => (
              <div key={`${arquivo.name}-${i}`} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FileText size={14} className="shrink-0 text-red-500" />
                  <span className="truncate">{arquivo.name}</span>
                  <span className="shrink-0">· {formatarTamanho(arquivo.size)}</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`pdf-nome-${i}`} className="text-xs">Nome (opcional)</Label>
                    <Input
                      id={`pdf-nome-${i}`}
                      autoFocus={i === 0}
                      placeholder={nomeSemExtensao(arquivo.name)}
                      value={campos[i]?.nome ?? ""}
                      onChange={(e) => setCampo(i, { nome: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`pdf-player-${i}`} className="text-xs">Player</Label>
                    <Input
                      id={`pdf-player-${i}`}
                      placeholder="Ex.: Pedro Sobral, Meta, Anthropic"
                      value={campos[i]?.player ?? ""}
                      onChange={(e) => setCampo(i, { player: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            ))}
            {n > 1 && (
              <button
                type="button"
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => setCampos((prev) => prev.map((c) => ({ ...c, player: prev[0]?.player ?? "" })))}
              >
                Usar o player do primeiro em todos
              </button>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pdf-envio-pasta">Tema / pasta</Label>
            <SelectPasta id="pdf-envio-pasta" pastas={pastas} value={pastaId} onChange={setPastaId} />
            {criando ? (
              <div className="flex items-center gap-2 rounded-lg border border-dashed p-2">
                <FolderPlus size={15} className="shrink-0 text-primary" />
                <Input
                  autoFocus
                  className="h-8"
                  placeholder={criando.parentId ? `Nova subpasta em "${pastas.find((p) => p.id === criando.parentId)?.nome}"` : "Nome do novo tema"}
                  value={novoNome}
                  onChange={(e) => setNovoNome(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setCriando(null); } }}
                />
                <Button type="button" size="sm" className="h-8" onClick={criarPastaAqui} disabled={salvandoPasta}>
                  {salvandoPasta ? <Loader2 size={14} className="animate-spin" /> : "Criar"}
                </Button>
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setCriando(null)} title="Cancelar">
                  <X size={14} />
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => { setNovoNome(""); setCriando({ parentId: null }); }}>
                  <FolderPlus size={13} /> Novo tema
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  disabled={!pastaEscolhida}
                  title={pastaEscolhida ? undefined : "Escolha primeiro o tema onde a subpasta vai ficar"}
                  onClick={() => { setNovoNome(""); setCriando({ parentId: pastaId }); }}
                >
                  <FolderPlus size={13} /> {pastaEscolhida ? `Subpasta em "${pastaEscolhida.nome}"` : "Nova subpasta"}
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={!pastaId || !!criando}>
              {n === 1 ? "Guardar PDF" : `Guardar ${n} PDFs`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
