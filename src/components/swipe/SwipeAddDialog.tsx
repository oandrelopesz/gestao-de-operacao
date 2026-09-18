import { useEffect, useMemo, useRef, useState } from "react";
import { Upload, Link2, X, FileIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { uploadFile, ensureFolder, SwipeKeyError } from "@/lib/googleDrive";
import {
  CATEGORIAS, REDES, encontrarNicho, garantirPastas, nomeArquivo, extensaoDe, criarItem, atualizarItem, enfileirarJob, erroAmigavel,
  type SwipeCategoria, type SwipeRede, type SwipeNicho, type SwipeItem,
} from "@/lib/swipe";

const MAX_BYTES = 5 * 1024 * 1024 * 1024;

export interface SwipeAddDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  rootFolderId: string | null;
  nichos: SwipeNicho[];
  /** Item pendente/falho para completar com arquivo (mantém os dados, só sobe o arquivo) */
  completar?: SwipeItem | null;
  /** Nicho/subnicho pré-selecionados (ex.: ao adicionar a partir da árvore) */
  preset?: { nicho_id?: string; subnicho_id?: string; categoria?: SwipeCategoria };
}

function detectarRede(link: string): SwipeRede | null {
  const l = link.toLowerCase();
  if (/instagram\.com/.test(l)) return "instagram";
  if (/facebook\.com|fb\.watch/.test(l)) return "facebook";
  if (/youtube\.com|youtu\.be/.test(l)) return "youtube";
  if (/tiktok\.com/.test(l)) return "tiktok";
  if (/linkedin\.com/.test(l)) return "linkedin";
  if (/x\.com|twitter\.com/.test(l)) return "x";
  if (/pinterest\./.test(l)) return "pinterest";
  return l ? "internet" : null;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function SwipeAddDialog({ open, onClose, onSaved, rootFolderId, nichos, completar, preset }: SwipeAddDialogProps) {
  const [categoria, setCategoria] = useState<SwipeCategoria>("video_anuncio");
  const [nichoNome, setNichoNome] = useState("");
  const [subnichoNome, setSubnichoNome] = useState("");
  const [rede, setRede] = useState<SwipeRede>("instagram");
  const [redeManual, setRedeManual] = useState(false);
  const [link, setLink] = useState("");
  const [player, setPlayer] = useState("");
  const [nota, setNota] = useState("");
  const [tagsTexto, setTagsTexto] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [progresso, setProgresso] = useState<{ pct: number; texto: string } | null>(null);
  const [confirmarParecido, setConfirmarParecido] = useState<{ tipo: "nicho" | "subnicho"; digitado: string; existente: SwipeNicho; resolve: (usar: boolean) => void } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const nichosRaiz = useMemo(() => nichos.filter((n) => !n.pai_id), [nichos]);
  const nichoSelecionado = useMemo(() => encontrarNicho(nichoNome, nichosRaiz).exato, [nichoNome, nichosRaiz]);
  const subnichosDoNicho = useMemo(() => (nichoSelecionado ? nichos.filter((n) => n.pai_id === nichoSelecionado.id) : []), [nichos, nichoSelecionado]);

  useEffect(() => {
    if (!open) return;
    if (completar) {
      const n = nichos.find((x) => x.id === completar.nicho_id);
      const s = completar.subnicho_id ? nichos.find((x) => x.id === completar.subnicho_id) : null;
      setCategoria(completar.categoria);
      setNichoNome(n?.nome || "");
      setSubnichoNome(s?.nome || "");
      setRede(completar.rede);
      setRedeManual(true);
      setLink(completar.link || "");
      setPlayer(completar.player);
      setNota(completar.nota || "");
      setTagsTexto((completar.tags || []).join(", "));
    } else {
      const n = preset?.nicho_id ? nichos.find((x) => x.id === preset.nicho_id) : null;
      const s = preset?.subnicho_id ? nichos.find((x) => x.id === preset.subnicho_id) : null;
      setCategoria(preset?.categoria || "video_anuncio");
      setNichoNome(n?.nome || "");
      setSubnichoNome(s?.nome || "");
      setRede("instagram");
      setRedeManual(false);
      setLink("");
      setPlayer("");
      setNota("");
      setTagsTexto("");
    }
    setArquivos([]);
    setProgresso(null);
  }, [open, completar, preset, nichos]);

  const onLinkChange = (v: string) => {
    setLink(v);
    if (!redeManual) {
      const d = detectarRede(v);
      if (d) setRede(d);
    }
  };

  const adicionarArquivos = (lista: FileList | File[]) => {
    const novos = Array.from(lista).filter((f) => {
      if (f.size > MAX_BYTES) {
        toast.error(`${f.name} passa de 5 GB`);
        return false;
      }
      return true;
    });
    if (!novos.length) return;
    // Só carrossel aceita vários arquivos (viram cards numerados); nos demais, o último substitui
    setArquivos((prev) => (categoria === "carrossel" ? [...prev, ...novos] : [novos[novos.length - 1]]));
  };

  const confirmarUso = (tipo: "nicho" | "subnicho", digitado: string, existente: SwipeNicho) =>
    new Promise<boolean>((resolve) => setConfirmarParecido({ tipo, digitado, existente, resolve }));

  const salvar = async () => {
    if (!rootFolderId) {
      toast.error('Crie a pasta "Swipe File" no Admin antes de adicionar.');
      return;
    }
    if (!nichoNome.trim()) return toast.error("Informe o nicho");
    if (!player.trim()) return toast.error("Informe o player / empresa");
    if (!link.trim() && arquivos.length === 0) return toast.error("Cole um link ou arraste um arquivo");
    if (!link.trim() && (categoria === "landing_page" || categoria === "site") && arquivos.length === 0) return toast.error("Para LP/site, cole o link");

    setSalvando(true);
    try {
      // 1) Nicho: usa o existente (mesmo nome), pergunta se for parecido, cria se for novo
      let nichoRef: { id?: string; nome: string } = { nome: nichoNome.trim() };
      const achado = encontrarNicho(nichoNome, nichosRaiz);
      if (achado.exato) nichoRef = { id: achado.exato.id, nome: achado.exato.nome };
      else if (achado.parecido) {
        const usar = await confirmarUso("nicho", nichoNome.trim(), achado.parecido);
        if (usar) nichoRef = { id: achado.parecido.id, nome: achado.parecido.nome };
      }

      let subRef: { id?: string; nome: string } | null = null;
      if (subnichoNome.trim()) {
        subRef = { nome: subnichoNome.trim() };
        const candidatos = nichoRef.id ? nichos.filter((n) => n.pai_id === nichoRef.id) : [];
        const achadoSub = encontrarNicho(subnichoNome, candidatos);
        if (achadoSub.exato) subRef = { id: achadoSub.exato.id, nome: achadoSub.exato.nome };
        else if (achadoSub.parecido) {
          const usar = await confirmarUso("subnicho", subnichoNome.trim(), achadoSub.parecido);
          if (usar) subRef = { id: achadoSub.parecido.id, nome: achadoSub.parecido.nome };
        }
      }

      setProgresso({ pct: 0, texto: "Preparando pastas no Drive..." });
      const { nicho, subnicho, categoriaFolder } = await garantirPastas({ rootFolderId, nicho: nichoRef, subnicho: subRef, categoria, nichosAtuais: nichos });
      const base = nomeArquivo(categoria, nicho.nome, subnicho?.nome, player);
      const tags = tagsTexto.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
      const linkFinal = link.trim() ? (/^https?:\/\//i.test(link.trim()) ? link.trim() : `https://${link.trim()}`) : null;

      const comum = {
        categoria, nicho_id: nicho.id, subnicho_id: subnicho?.id ?? null, rede, link: linkFinal,
        player: player.trim(), nota: nota.trim() || null, tags, nome_arquivo: base, drive_folder_id: categoriaFolder.id,
      };

      if (arquivos.length > 0) {
        // 2a) Upload direto para o Drive
        let driveFileId: string; let webLink: string | null; let thumb: string | null; let mime: string | null; let tamanho: number;
        if (categoria === "carrossel" && arquivos.length > 1) {
          setProgresso({ pct: 0, texto: "Criando pasta do carrossel..." });
          const pasta = await ensureFolder(base, categoriaFolder.id);
          const ordenados = [...arquivos].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true }));
          for (let i = 0; i < ordenados.length; i++) {
            const f = ordenados[i];
            const nome = `${String(i + 1).padStart(2, "0")}.${extensaoDe(f)}`;
            setProgresso({ pct: Math.round((i / ordenados.length) * 100), texto: `Enviando card ${i + 1} de ${ordenados.length}...` });
            await uploadFile(f, { name: nome, parentId: pasta.id, onProgress: (p) => setProgresso({ pct: Math.round(((i + p / 100) / ordenados.length) * 100), texto: `Enviando card ${i + 1} de ${ordenados.length}...` }) });
          }
          driveFileId = pasta.id; webLink = pasta.webViewLink || null; thumb = null; mime = "application/vnd.google-apps.folder";
          tamanho = arquivos.reduce((a, f) => a + f.size, 0);
        } else {
          const f = arquivos[0];
          const nome = `${base}.${extensaoDe(f)}`;
          const up = await uploadFile(f, { name: nome, parentId: categoriaFolder.id, onProgress: (p) => setProgresso({ pct: p, texto: `Enviando ${formatBytes(f.size)}...` }) });
          driveFileId = up.id; webLink = up.webViewLink || null; thumb = up.thumbnailLink || null; mime = up.mimeType || f.type; tamanho = f.size;
        }
        const campos = { ...comum, drive_file_id: driveFileId, drive_web_link: webLink, thumbnail_link: thumb, mime, tamanho, status: "pronto" as const, erro: null };
        if (completar) await atualizarItem(completar.id, campos);
        else await criarItem(campos);
        toast.success("Salvo no Drive");
      } else {
        // 2b) Só link: entra na fila do serviço de download
        const tipo = categoria === "landing_page" || categoria === "site" ? "lp" : "download";
        const item = completar
          ? (await atualizarItem(completar.id, { ...comum, status: "pendente", erro: null }), { id: completar.id })
          : await criarItem({ ...comum, status: "pendente" });
        await enfileirarJob(item.id, tipo, { link: linkFinal, categoria, nome_arquivo: base, drive_folder_id: categoriaFolder.id, rede });
        toast.success("Na fila: o serviço baixa e sobe no Drive; se falhar, salva o link num Docs");
      }
      await onSaved();
      onClose();
    } catch (e: any) {
      if (e instanceof SwipeKeyError) toast.error(e.message);
      else toast.error(erroAmigavel(e));
    } finally {
      setSalvando(false);
      setProgresso(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o && !salvando) onClose(); }}>
        <DialogContent className="sm:max-w-[560px] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{completar ? "Enviar arquivo da referência" : "Adicionar ao swipe file"}</DialogTitle>
            <DialogDescription>
              Vai para <span className="font-mono text-xs">Swipe File / {nichoNome.trim() || "Nicho"}{subnichoNome.trim() ? ` / ${subnichoNome.trim()}` : ""} / {CATEGORIAS.find((c) => c.id === categoria)?.pasta}</span>
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); salvar(); }}>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={categoria} onValueChange={(v) => setCategoria(v as SwipeCategoria)} disabled={!!completar}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.hex }} />{c.singular}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Rede onde viu</Label>
                <Select value={rede} onValueChange={(v) => { setRede(v as SwipeRede); setRedeManual(true); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REDES.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sw-nicho">Nicho</Label>
                <Input id="sw-nicho" list="sw-nichos" placeholder="Ex.: Médico" value={nichoNome} onChange={(e) => setNichoNome(e.target.value)} disabled={!!completar} autoComplete="off" />
                <datalist id="sw-nichos">
                  {nichosRaiz.map((n) => <option key={n.id} value={n.nome} />)}
                </datalist>
                {nichoNome.trim() && !nichoSelecionado && !encontrarNicho(nichoNome, nichosRaiz).parecido && (
                  <p className="text-[11px] text-muted-foreground">Nicho novo: a pasta será criada.</p>
                )}
                {nichoNome.trim() && !nichoSelecionado && encontrarNicho(nichoNome, nichosRaiz).parecido && (
                  <p className="text-[11px] text-amber-600">Parecido com "{encontrarNicho(nichoNome, nichosRaiz).parecido!.nome}" — vou confirmar ao salvar.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sw-sub">Subnicho <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <Input id="sw-sub" list="sw-subnichos" placeholder="Ex.: Ortopedia" value={subnichoNome} onChange={(e) => setSubnichoNome(e.target.value)} disabled={!!completar} autoComplete="off" />
                <datalist id="sw-subnichos">
                  {subnichosDoNicho.map((n) => <option key={n.id} value={n.nome} />)}
                </datalist>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sw-player">Player / empresa</Label>
              <Input id="sw-player" placeholder="Quem fez (marca, expert, agência)" value={player} onChange={(e) => setPlayer(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sw-link" className="flex items-center gap-2"><Link2 size={13} /> Link {arquivos.length > 0 && <span className="text-muted-foreground font-normal">(opcional, só referência)</span>}</Label>
              <Input id="sw-link" placeholder="https://www.instagram.com/reel/... ou a URL da LP" value={link} onChange={(e) => onLinkChange(e.target.value)} />
              {!arquivos.length && link.trim() && (
                <p className="text-[11px] text-muted-foreground">
                  {categoria === "landing_page" || categoria === "site" ? "O serviço captura a página em HTML + print e sobe no Drive." : "O serviço baixa o vídeo/imagem/carrossel e sobe no Drive. Se a rede bloquear, salva o link num Docs e avisa."}
                </p>
              )}
            </div>

            {/* Arquivo */}
            <div
              className={cn("rounded-md border-2 border-dashed p-4 text-center transition-colors cursor-pointer", arrastando ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50")}
              onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
              onDragLeave={() => setArrastando(false)}
              onDrop={(e) => { e.preventDefault(); setArrastando(false); adicionarArquivos(e.dataTransfer.files); }}
              onClick={() => fileInput.current?.click()}
            >
              <input ref={fileInput} type="file" className="hidden" multiple={categoria === "carrossel"} onChange={(e) => { if (e.target.files) adicionarArquivos(e.target.files); e.target.value = ""; }} />
              <Upload size={20} className="mx-auto text-muted-foreground mb-1" />
              <p className="text-sm font-medium">{completar ? "Arraste o arquivo desta referência" : "Ou arraste o arquivo aqui"}</p>
              <p className="text-[11px] text-muted-foreground">Até 5 GB, direto para o seu Drive{categoria === "carrossel" ? " · vários arquivos viram cards 01, 02, 03…" : ""}</p>
              {arquivos.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 justify-center" onClick={(e) => e.stopPropagation()}>
                  {arquivos.map((f, i) => (
                    <Badge key={`${f.name}-${i}`} variant="secondary" className="gap-1 font-normal max-w-full">
                      <FileIcon size={11} /> <span className="truncate max-w-[180px]">{f.name}</span> <span className="opacity-60">{formatBytes(f.size)}</span>
                      <button type="button" className="ml-1 hover:text-destructive" onClick={() => setArquivos((p) => p.filter((_, j) => j !== i))} aria-label="Remover arquivo"><X size={11} /></button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sw-nota">Por que salvei <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <Textarea id="sw-nota" rows={2} placeholder="Ex.: hook forte nos 3s, oferta com garantia dupla" value={nota} onChange={(e) => setNota(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sw-tags">Tags <span className="text-muted-foreground font-normal">(separadas por vírgula)</span></Label>
                <Input id="sw-tags" placeholder="hook, prova social, vsl" value={tagsTexto} onChange={(e) => setTagsTexto(e.target.value)} />
              </div>
            </div>

            {progresso && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground"><span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> {progresso.texto}</span><span className="numeric">{progresso.pct}%</span></div>
                <Progress value={progresso.pct} className="h-1.5" />
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
              <Button type="submit" disabled={salvando}>
                {salvando ? "Salvando..." : arquivos.length > 0 ? "Enviar para o Drive" : "Salvar e baixar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmarParecido} onOpenChange={(o) => { if (!o && confirmarParecido) { confirmarParecido.resolve(false); setConfirmarParecido(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usar "{confirmarParecido?.existente.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Você digitou "{confirmarParecido?.digitado}", parecido com o {confirmarParecido?.tipo} que já existe "{confirmarParecido?.existente.nome}". Quer colocar na pasta existente ou criar uma nova?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { confirmarParecido?.resolve(false); setConfirmarParecido(null); }}>Criar "{confirmarParecido?.digitado}"</AlertDialogCancel>
            <AlertDialogAction onClick={() => { confirmarParecido?.resolve(true); setConfirmarParecido(null); }}>Usar "{confirmarParecido?.existente.nome}"</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
