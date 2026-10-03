// Tela de postagem (estilo Business Suite): mídias, legenda, localização, reels, quando; à direita a prévia no celular.
// As mídias vão ao R2 assim que escolhidas (imagem convertida para JPG antes); o post só é salvo com tudo enviado.
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Bookmark, ChevronLeft, ChevronRight, Heart, ImagePlus, Loader2, MapPin, MessageCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ACEITA_IMAGENS, normalizarFoto } from "@/lib/gmnImagem";
import { HASHTAGS_MAX, LEGENDA_MAX, conferirPost, contarHashtags, tipoDoPost, type Midia } from "@/lib/instagramPost";
import { criarPost, enviarMidia, type ContaInstagram } from "@/lib/instagram";
import { FotoConta } from "./ContasVisiveis";

interface Item {
  id: string;
  url: string; // object URL para a prévia
  tipo: "imagem" | "video";
  largura: number;
  altura: number;
  duracao?: number;
  progresso: number;
  chave: string | null; // preenchida quando o envio ao R2 termina
  erro: string | null;
}

const ACEITA = `${ACEITA_IMAGENS},video/mp4,video/quicktime,.mp4,.mov`;
const ehVideo = (f: File) => f.type.startsWith("video/") || /\.(mp4|mov|m4v)$/i.test(f.name);
const doisDigitos = (n: number) => String(n).padStart(2, "0");

/** Valor do <input type="datetime-local"> (hora do aparelho) para daqui a 1 hora, em hora cheia. */
function daquiUmaHora(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}T${doisDigitos(d.getHours())}:00`;
}

export const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function medidasDoVideo(url: string): Promise<{ largura: number; altura: number; duracao: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => resolve({ largura: v.videoWidth, altura: v.videoHeight, duracao: v.duration });
    v.onerror = () => reject(new Error("Não foi possível abrir este vídeo neste navegador (use MP4 ou MOV)."));
    v.src = url;
  });
}

export function CriarPost({ conta, onFechar }: { conta: ContaInstagram; onFechar: (criou: boolean) => void }) {
  const [itens, setItens] = useState<Item[]>([]);
  const [legenda, setLegenda] = useState("");
  const [usarLocal, setUsarLocal] = useState(false);
  const [reelsNoFeed, setReelsNoFeed] = useState(true);
  const [capaMs, setCapaMs] = useState(0);
  const [modo, setModo] = useState<"agora" | "agendar">("agora");
  const [quando, setQuando] = useState(daquiUmaHora);
  const [salvando, setSalvando] = useState(false);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const mudarItem = (id: string, campos: Partial<Item>) => setItens((prev) => prev.map((i) => (i.id === id ? { ...i, ...campos } : i)));

  async function adicionar(arquivos: File[]) {
    for (const f of arquivos) {
      const id = crypto.randomUUID();
      try {
        let blob: Blob;
        let ext: string;
        let medidas: { largura: number; altura: number; duracao?: number };
        let url: string;
        if (ehVideo(f)) {
          ext = /\.mov$/i.test(f.name) || f.type === "video/quicktime" ? "mov" : "mp4";
          blob = f.type ? f : new Blob([f], { type: ext === "mov" ? "video/quicktime" : "video/mp4" });
          url = URL.createObjectURL(blob);
          medidas = await medidasDoVideo(url);
        } else {
          blob = await normalizarFoto(f); // o Instagram só aceita JPG
          ext = "jpg";
          url = URL.createObjectURL(blob);
          const bmp = await createImageBitmap(blob);
          medidas = { largura: bmp.width, altura: bmp.height };
          bmp.close();
        }
        urls.current.push(url);
        setItens((prev) => [...prev, { id, url, tipo: ext === "jpg" ? "imagem" : "video", ...medidas, progresso: 0, chave: null, erro: null }]);
        enviarMidia(blob, ext, (p) => mudarItem(id, { progresso: p }))
          .then((chave) => mudarItem(id, { chave, progresso: 1 }))
          .catch((e) => mudarItem(id, { erro: e?.message || "Falha no envio" }));
      } catch (e: any) {
        toast.error(`${f.name}: ${e?.message || "não foi possível abrir"}`);
      }
    }
  }

  function soltarNaGrade(e: React.DragEvent, alvo: string | null) {
    e.preventDefault();
    if (e.dataTransfer.files.length) {
      adicionar([...e.dataTransfer.files]);
    } else if (arrastando && alvo && arrastando !== alvo) {
      setItens((prev) => {
        const de = prev.findIndex((i) => i.id === arrastando);
        const para = prev.findIndex((i) => i.id === alvo);
        const nova = [...prev];
        nova.splice(para, 0, ...nova.splice(de, 1));
        return nova;
      });
    }
    setArrastando(null);
  }

  const midias: Midia[] = itens.map((i) => ({ chave: i.chave ?? "", tipo: i.tipo, largura: i.largura, altura: i.altura, duracao: i.duracao }));
  const tipo = tipoDoPost(midias);
  const agendarPara = modo === "agendar" && quando ? new Date(quando) : null;
  const { erros, avisos } = conferirPost(midias, legenda, agendarPara);
  if (modo === "agendar" && !quando) erros.push("Escolha a data e a hora.");
  const enviando = itens.some((i) => !i.chave && !i.erro);
  const falhou = itens.some((i) => i.erro);
  const reels = tipo === "reels" ? itens[0] : null;

  async function salvar() {
    if (!tipo) return;
    setSalvando(true);
    try {
      await criarPost({
        conta_id: conta.id, tipo, midias, legenda,
        local_id: usarLocal ? conta.pagina_id : null, local_nome: usarLocal ? conta.nome : null,
        reels_no_feed: reelsNoFeed, capa_ms: reels ? capaMs : null,
        agendado_para: (agendarPara ?? new Date()).toISOString(),
      });
      toast.success(agendarPara ? `Agendado para ${dataHora(agendarPara.toISOString())}.` : "Enviando para o Instagram. Acompanhe na aba Posts.");
      onFechar(true);
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível salvar o post.");
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar(false)}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FotoConta conta={conta} className="h-7 w-7" /> Postar em @{conta.usuario}</DialogTitle>
          <DialogDescription>1 imagem vira foto, 1 vídeo vira reels e 2 a 10 mídias viram carrossel.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[1fr_280px]">
          <div className="min-w-0 space-y-5">
            {/* Mídias */}
            <div className="space-y-2">
              <Label>Fotos e vídeos {itens.length > 1 && <span className="font-normal text-muted-foreground">· arraste para mudar a ordem</span>}</Label>
              <div
                className="flex flex-wrap gap-2 rounded-lg border border-dashed p-2"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => soltarNaGrade(e, null)}
              >
                {itens.map((i, n) => (
                  <div
                    key={i.id}
                    draggable
                    onDragStart={() => setArrastando(i.id)}
                    onDragEnd={() => setArrastando(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.stopPropagation(); soltarNaGrade(e, i.id); }}
                    className={cn("relative h-20 w-20 cursor-grab overflow-hidden rounded-md border bg-muted", arrastando === i.id && "opacity-40")}
                  >
                    {i.tipo === "imagem"
                      ? <img src={i.url} alt="" className="h-full w-full object-cover" />
                      : <video src={i.url} muted className="h-full w-full object-cover" />}
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">{n + 1}</span>
                    <button
                      type="button"
                      aria-label="Remover"
                      onClick={() => setItens((prev) => prev.filter((x) => x.id !== i.id))}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                    ><X size={12} /></button>
                    {!i.chave && !i.erro && (
                      <span className="absolute inset-x-0 bottom-0 h-1.5 bg-black/30"><span className="block h-full bg-primary" style={{ width: `${Math.round(i.progresso * 100)}%` }} /></span>
                    )}
                    {i.erro && <span className="absolute inset-0 flex items-center justify-center bg-destructive/80 p-1 text-center text-[10px] text-white" title={i.erro}>Falhou</span>}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => entrada.current?.click()}
                  className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border text-[11px] text-muted-foreground hover:bg-muted"
                >
                  <ImagePlus size={18} /> Adicionar
                </button>
                <input
                  ref={entrada}
                  type="file"
                  multiple
                  accept={ACEITA}
                  className="hidden"
                  onChange={(e) => { adicionar([...(e.target.files ?? [])]); e.target.value = ""; }}
                />
              </div>
            </div>

            {/* Legenda */}
            <div className="space-y-2">
              <Label htmlFor="ig-legenda">Legenda</Label>
              <Textarea id="ig-legenda" rows={6} value={legenda} onChange={(e) => setLegenda(e.target.value)} placeholder="Escreva a legenda..." />
              <p className="text-right text-xs text-muted-foreground">
                {legenda.length}/{LEGENDA_MAX} caracteres · {contarHashtags(legenda)}/{HASHTAGS_MAX} hashtags
              </p>
            </div>

            {/* Localização */}
            {conta.pagina_tem_local && conta.pagina_id && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={usarLocal} onCheckedChange={(v) => setUsarLocal(v === true)} />
                <MapPin size={14} /> Marcar a localização do perfil
              </label>
            )}

            {/* Reels */}
            {reels && (
              <div className="space-y-3 rounded-lg border p-3">
                <label className="flex items-center justify-between gap-2 text-sm">
                  Mostrar o reels também no feed
                  <Switch checked={reelsNoFeed} onCheckedChange={setReelsNoFeed} />
                </label>
                <div className="space-y-2">
                  <Label>Capa: {(capaMs / 1000).toFixed(1).replace(".", ",")} s</Label>
                  <Slider min={0} max={Math.max(0, Math.floor((reels.duracao ?? 0) * 1000) - 100)} step={100} value={[capaMs]} onValueChange={([v]) => setCapaMs(v)} />
                </div>
              </div>
            )}

            {/* Quando */}
            <div className="space-y-2">
              <Label>Quando</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant={modo === "agora" ? "default" : "outline"} onClick={() => setModo("agora")}>Publicar agora</Button>
                <Button type="button" size="sm" variant={modo === "agendar" ? "default" : "outline"} onClick={() => setModo("agendar")}>Agendar</Button>
                {modo === "agendar" && (
                  <Input type="datetime-local" aria-label="Data e hora (Brasília)" className="w-auto" value={quando} onChange={(e) => setQuando(e.target.value)} />
                )}
              </div>
            </div>

            {itens.length > 0 && (erros.length > 0 || avisos.length > 0) && (
              <ul className="space-y-1 text-sm">
                {erros.map((m) => <li key={m} className="text-destructive">{m}</li>)}
                {avisos.map((m) => <li key={m} className="text-amber-600 dark:text-amber-400">{m}</li>)}
              </ul>
            )}
          </div>

          <Previa conta={conta} itens={itens} legenda={legenda} local={usarLocal ? conta.nome : null} reels={!!reels} capaMs={capaMs} />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onFechar(false)} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || enviando || falhou || erros.length > 0} className="gap-2">
            {(salvando || enviando) && <Loader2 size={14} className="animate-spin" />}
            {enviando ? "Enviando mídias..." : modo === "agora" ? "Publicar agora" : "Agendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Prévia no celular: feed (foto/carrossel com setas e pontinhos) ou reels 9:16. */
function Previa({ conta, itens, legenda, local, reels, capaMs }: {
  conta: ContaInstagram; itens: Item[]; legenda: string; local: string | null; reels: boolean; capaMs: number;
}) {
  const [atual, setAtual] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const i = Math.min(atual, Math.max(0, itens.length - 1));
  const item = itens[i];
  const primeiro = itens[0];
  const proporcao = reels ? 9 / 16 : primeiro ? Math.min(1.91, Math.max(0.8, primeiro.largura / primeiro.altura)) : 1;

  useEffect(() => { if (reels && video.current) video.current.currentTime = capaMs / 1000; }, [reels, capaMs, item?.url]);

  return (
    <div className="mx-auto w-[280px] self-start overflow-hidden rounded-[1.75rem] border-[6px] border-zinc-900 bg-white text-zinc-900 shadow-xl dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="flex items-center gap-2 px-3 py-2">
        <FotoConta conta={conta} className="h-7 w-7" />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-xs font-semibold">{conta.usuario}</p>
          {local && <p className="truncate text-[10px]">{local}</p>}
        </div>
      </div>
      <div className="relative w-full bg-zinc-100 dark:bg-zinc-900" style={{ aspectRatio: String(proporcao) }}>
        {!item ? (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-zinc-500">A prévia aparece aqui</span>
        ) : item.tipo === "imagem" ? (
          <img src={item.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <video ref={video} src={item.url} muted playsInline className="absolute inset-0 h-full w-full object-cover" />
        )}
        {itens.length > 1 && (
          <>
            <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">{i + 1}/{itens.length}</span>
            {i > 0 && (
              <button type="button" aria-label="Anterior" onClick={() => setAtual(i - 1)} className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-0.5 text-zinc-900"><ChevronLeft size={16} /></button>
            )}
            {i < itens.length - 1 && (
              <button type="button" aria-label="Próxima" onClick={() => setAtual(i + 1)} className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-0.5 text-zinc-900"><ChevronRight size={16} /></button>
            )}
          </>
        )}
      </div>
      <div className="flex items-center gap-3 px-3 pt-2">
        <Heart size={18} /><MessageCircle size={18} /><Send size={18} />
        {itens.length > 1 && (
          <span className="flex flex-1 justify-center gap-1">
            {itens.map((x, n) => <span key={x.id} className={cn("h-1.5 w-1.5 rounded-full", n === i ? "bg-sky-500" : "bg-zinc-300")} />)}
          </span>
        )}
        <Bookmark size={18} className="ml-auto" />
      </div>
      <p className="line-clamp-4 whitespace-pre-wrap px-3 pb-3 pt-1.5 text-xs">
        <span className="font-semibold">{conta.usuario}</span> {legenda}
      </p>
    </div>
  );
}
