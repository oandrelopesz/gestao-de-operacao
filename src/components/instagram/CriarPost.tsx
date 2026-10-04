// Tela de postagem (estilo Business Suite): formato (feed/story), redes (Instagram/Facebook), mídias com editor, legenda,
// primeiro comentário, localização, opções avançadas e quando; à direita a prévia no celular. Também edita post agendado.
// As mídias vão ao R2 assim que escolhidas (imagem convertida para JPG); o post só é salvo com tudo enviado.
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Bookmark, ChevronLeft, ChevronRight, Crop, Facebook, Heart, ImagePlus, Instagram, Loader2, MessageCircle, Send, SlidersHorizontal, X } from "lucide-react";
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
import {
  HASHTAGS_MAX, LEGENDA_MAX, conferirPost, contarHashtags, tipoDoPost, type Formato, type Marcacao, type Midia, type OpcoesPost,
} from "@/lib/instagramPost";
import { EDICAO_PADRAO, type EdicaoMidia } from "@/lib/instagramEdicao";
import { exportarImagem } from "@/lib/instagramEditor";
import {
  baixarMidia, criarPosts, enviarMidia, lembrarLocal, salvarEdicao, urlDaMidia, type ContaInstagram, type Lugar, type NovoPost,
  type PostInstagram,
} from "@/lib/instagram";
import { FotoConta } from "./ContasVisiveis";
import { EditorMidia, type ResultadoEdicao } from "./EditorMidia";
import { EscolherLocal } from "./EscolherLocal";
import { OpcoesAvancadas } from "./OpcoesAvancadas";
import { dataHora } from "./Posts";

interface Item {
  id: string;
  url: string; // prévia: object URL, ou o endereço do R2 numa edição
  tipo: "imagem" | "video";
  largura: number;
  altura: number;
  duracao?: number;
  progresso: number;
  chave: string | null; // preenchida quando o envio ao R2 termina
  erro: string | null;
  original: Blob | null; // arquivo sem edição (null num post antigo até ser baixado)
  chaveOriginal: string | null;
  envio?: { blob: Blob; ext: string; original: boolean }; // o último envio, para "tentar de novo" se falhar
  orig: { largura: number; altura: number; duracao?: number };
  edicao?: EdicaoMidia;
  alt_text?: string;
  marcacoes?: Marcacao[];
}

const ACEITA = `${ACEITA_IMAGENS},video/mp4,video/quicktime,.mp4,.mov`;
const ehVideo = (f: File) => f.type.startsWith("video/") || /\.(mp4|mov|m4v)$/i.test(f.name);
const doisDigitos = (n: number) => String(n).padStart(2, "0");

/** Valor do <input type="datetime-local"> (hora do aparelho) para uma data. */
const paraCampo = (d: Date) =>
  `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}T${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
function daquiUmaHora(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return paraCampo(d);
}

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

export function CriarPost({ conta, contas, edicao, onFechar }: {
  conta: ContaInstagram;
  contas: ContaInstagram[];
  edicao?: PostInstagram[]; // linhas agendadas do mesmo grupo (modo edição)
  onFechar: (salvou: boolean) => void;
}) {
  const base = edicao?.[0];
  const [itens, setItens] = useState<Item[]>(() => (base?.midias ?? []).map((m) => ({
    id: crypto.randomUUID(), url: urlDaMidia(m.chave), tipo: m.tipo, largura: m.largura, altura: m.altura, duracao: m.duracao,
    progresso: 1, chave: m.chave, erro: null, original: null, chaveOriginal: m.chave,
    orig: { largura: m.largura, altura: m.altura, duracao: m.duracao }, alt_text: m.alt_text, marcacoes: m.marcacoes,
  })));
  const [formato, setFormato] = useState<Formato>(base?.tipo === "story" ? "story" : "feed");
  const [instagram, setInstagram] = useState(edicao ? edicao.some((p) => p.rede === "instagram") : true);
  const [facebook, setFacebook] = useState(edicao ? edicao.some((p) => p.rede === "facebook") : false);
  const [legenda, setLegenda] = useState(base?.legenda ?? "");
  const [comentario, setComentario] = useState(base?.primeiro_comentario ?? "");
  const [local, setLocal] = useState<Lugar | null>(base?.local_id ? { id: base.local_id, nome: base.local_nome ?? base.local_id, endereco: null } : null);
  const [opcoes, setOpcoes] = useState<OpcoesPost>(base?.opcoes ?? {});
  const [reelsNoFeed, setReelsNoFeed] = useState(base?.reels_no_feed ?? true);
  const [capaMs, setCapaMs] = useState(base?.capa_ms ?? 0);
  // Na edição, horário que já passou (post com erro) volta como "Agora"
  const futuro = !!base && new Date(base.agendado_para).getTime() > Date.now() + 60_000;
  const [modo, setModo] = useState<"agora" | "agendar">(futuro ? "agendar" : "agora");
  const [quando, setQuando] = useState(() => (base && futuro ? paraCampo(new Date(base.agendado_para)) : daquiUmaHora()));
  const [salvando, setSalvando] = useState(false);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [preparando, setPreparando] = useState(0);
  const [editando, setEditando] = useState<{ item: Item; original: Blob } | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const novaUrl = (b: Blob) => { const u = URL.createObjectURL(b); urls.current.push(u); return u; };
  const mudarItem = (id: string, campos: Partial<Item>) => setItens((prev) => prev.map((i) => (i.id === id ? { ...i, ...campos } : i)));
  const enviar = (id: string, blob: Blob, ext: string, original: boolean) => {
    mudarItem(id, { chave: null, erro: null, progresso: 0, envio: { blob, ext, original } });
    enviarMidia(blob, ext, (p) => mudarItem(id, { progresso: p }))
      .then((chave) => mudarItem(id, { chave, progresso: 1, ...(original ? { chaveOriginal: chave } : {}) }))
      .catch((e) => mudarItem(id, { erro: e?.message || "Falha no envio" }));
  };

  async function adicionar(arquivos: File[]) {
    setPreparando((n) => n + arquivos.length);
    for (const f of arquivos) {
      const id = crypto.randomUUID();
      try {
        let blob: Blob;
        let ext: string;
        let medidas: { largura: number; altura: number; duracao?: number };
        if (ehVideo(f)) {
          ext = /\.mov$/i.test(f.name) || f.type === "video/quicktime" ? "mov" : "mp4";
          blob = f.type ? f : new Blob([f], { type: ext === "mov" ? "video/quicktime" : "video/mp4" });
          medidas = await medidasDoVideo(novaUrl(blob));
        } else {
          blob = await normalizarFoto(f); // o Instagram só aceita JPG
          ext = "jpg";
          const bmp = await createImageBitmap(blob);
          medidas = { largura: bmp.width, altura: bmp.height };
          bmp.close();
        }
        setItens((prev) => [...prev, {
          id, url: novaUrl(blob), tipo: ext === "jpg" ? "imagem" : "video", ...medidas, progresso: 0, chave: null, erro: null,
          original: blob, chaveOriginal: null, orig: medidas,
        }]);
        enviar(id, blob, ext, true);
      } catch (e: any) {
        toast.error(`${f.name}: ${e?.message || "não foi possível abrir"}`);
      } finally {
        setPreparando((n) => n - 1);
      }
    }
  }

  /** Abre o editor; num post antigo, baixa o arquivo antes. */
  async function abrirEditor(item: Item) {
    let original = item.original;
    if (!original) {
      if (!item.chave) return;
      try {
        original = await baixarMidia(item.chave);
        mudarItem(item.id, { original });
      } catch (e: any) {
        toast.error(e?.message || "Não foi possível baixar a mídia para editar.");
        return;
      }
    }
    setEditando({ item: { ...item, original }, original });
  }

  function aplicarEdicao(item: Item, r: ResultadoEdicao) {
    const meta = { edicao: r.edicao, alt_text: r.alt_text, marcacoes: r.marcacoes };
    if (r.blob) {
      mudarItem(item.id, { ...meta, url: novaUrl(r.blob), largura: r.largura, altura: r.altura, duracao: r.duracao });
      enviar(item.id, r.blob, item.tipo === "video" ? "mp4" : "jpg", false);
    } else {
      // Sem mudança no arquivo: volta ao original (já enviado)
      mudarItem(item.id, {
        ...meta, url: item.original ? novaUrl(item.original) : item.url, ...item.orig,
        chave: item.chaveOriginal ?? item.chave, progresso: 1, erro: null,
      });
    }
  }

  /** Recorte centralizado de todas as imagens na mesma proporção. */
  async function recortarTodas(r: number) {
    for (const i of itens.filter((x) => x.tipo === "imagem")) {
      try {
        const original = i.original ?? (i.chave ? await baixarMidia(i.chave) : null);
        if (!original) continue;
        const edicao = { ...EDICAO_PADRAO, ...(i.edicao ?? {}), proporcao: r, zoom: 1, cx: 0.5, cy: 0.5 };
        const out = await exportarImagem(original, edicao);
        aplicarEdicao({ ...i, original }, { blob: out.blob, largura: out.largura, altura: out.altura, edicao, alt_text: i.alt_text, marcacoes: i.marcacoes });
        if (!i.original) mudarItem(i.id, { original });
      } catch (e: any) {
        toast.error(e?.message || "Não foi possível recortar uma das imagens.");
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

  const story = formato === "story";
  const midias: Midia[] = itens.map((i) => ({
    chave: i.chave ?? "", tipo: i.tipo, largura: i.largura, altura: i.altura,
    ...(i.duracao != null ? { duracao: i.duracao } : {}),
    ...(i.alt_text ? { alt_text: i.alt_text } : {}),
    ...(i.marcacoes?.length ? { marcacoes: i.marcacoes } : {}),
  }));
  const tipo = tipoDoPost(midias, formato);
  const agendarPara = modo === "agendar" && quando ? new Date(quando) : null;
  const { erros, avisos } = conferirPost({
    midias, legenda: story ? "" : legenda, agendarPara, formato, instagram, facebook: facebook && !story,
    primeiroComentario: story ? "" : comentario, colaboradores: opcoes.colaboradores,
  });
  if (modo === "agendar" && !quando) erros.push("Escolha a data e a hora.");
  const enviando = preparando > 0 || itens.some((i) => !i.chave && !i.erro);
  const falhou = itens.some((i) => i.erro);
  const reels = tipo === "reels" ? itens[0] : null;
  const imagens = itens.filter((i) => i.tipo === "imagem").length;
  const temPagina = !!conta.pagina_id;

  async function salvar() {
    if (!tipo) return;
    setSalvando(true);
    const agendado = (agendarPara ?? new Date()).toISOString();
    const comum = {
      conta_id: conta.id,
      legenda: story ? "" : legenda,
      local_id: !story && local ? local.id : null,
      local_nome: !story && local ? local.nome : null,
      reels_no_feed: reelsNoFeed,
      capa_ms: reels && !opcoes.capa_chave ? capaMs : null,
      primeiro_comentario: !story && comentario.trim() ? comentario.trim() : null,
      opcoes,
    };
    try {
      if (edicao) {
        const n = await salvarEdicao(edicao.map((p) => p.id), { ...comum, tipo, midias, agendado_para: agendado });
        if (n < edicao.length) toast.warning(`${edicao.length - n} ${edicao.length - n === 1 ? "post já tinha" : "posts já tinham"} começado a ser enviado e não mudou.`);
        else toast.success(agendarPara ? `Post alterado para ${dataHora(agendado)}.` : "Alterado e enviando agora.");
      } else {
        const grupo = crypto.randomUUID();
        const linhas: NovoPost[] = story
          // Cada mídia vira um story; um segundo entre eles mantém a ordem
          ? midias.map((m, i) => ({ ...comum, grupo, rede: "instagram", tipo: "story", midias: [m], agendado_para: new Date(new Date(agendado).getTime() + i * 1000).toISOString() }))
          : [
            ...(instagram ? [{ ...comum, grupo, rede: "instagram", tipo, midias, agendado_para: agendado }] : []),
            ...(facebook && temPagina ? [{ ...comum, grupo, rede: "facebook", tipo, midias, agendado_para: agendado, local_id: null, local_nome: null }] : []),
          ];
        await criarPosts(linhas);
        toast.success(agendarPara ? `Agendado para ${dataHora(agendado)}.` : "Enviando agora. Acompanhe na aba Posts.");
      }
      if (local && !story) lembrarLocal(local).catch(() => {});
      onFechar(true);
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível salvar o post.");
      setSalvando(false);
    }
  }

  const redeBotao = (ativa: boolean, set: (v: boolean) => void, rotulo: string, icone: React.ReactNode, desligada?: string) => (
    <label className={cn("flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm", desligada && "opacity-50")} title={desligada}>
      <Checkbox checked={ativa && !desligada} disabled={!!edicao || !!desligada} onCheckedChange={(v) => set(v === true)} /> {icone} {rotulo}
    </label>
  );

  return (
    <>
      <Dialog open onOpenChange={(aberto) => !aberto && !editando && onFechar(false)}>
        <DialogContent className="max-h-[94vh] max-w-5xl grid-cols-1 overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FotoConta conta={conta} className="h-7 w-7" /> {edicao ? "Editar post de" : "Postar em"} @{conta.usuario}</DialogTitle>
            <DialogDescription>
              {story ? "Cada foto ou vídeo vira um story, na ordem." : "1 imagem vira foto, 1 vídeo vira reels e 2 a 10 mídias viram carrossel."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_280px]">
            <div className="min-w-0 space-y-5">
              {/* Formato e redes */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-md border p-0.5">
                  {(["feed", "story"] as Formato[]).map((f) => (
                    <Button key={f} type="button" size="sm" variant={formato === f ? "default" : "ghost"} className="h-7" disabled={!!edicao} aria-pressed={formato === f} onClick={() => setFormato(f)}>
                      {f === "feed" ? "Feed" : "Story"}
                    </Button>
                  ))}
                </div>
                {redeBotao(instagram, setInstagram, "Instagram", <Instagram size={14} className="text-pink-600" />)}
                {redeBotao(facebook, setFacebook, "Facebook", <Facebook size={14} className="text-[#1877F2]" />,
                  !temPagina ? "Esta conta não tem página do Facebook ligada." : story ? "Story vai só para o Instagram." : undefined)}
              </div>

              {/* Mídias */}
              <div className="space-y-2">
                <Label>Fotos e vídeos {itens.length > 1 && <span className="font-normal text-muted-foreground">· arraste para mudar a ordem</span>}</Label>
                <div className="flex flex-wrap gap-2 rounded-lg border border-dashed p-2" onDragOver={(e) => e.preventDefault()} onDrop={(e) => soltarNaGrade(e, null)}>
                  {itens.map((i, n) => (
                    <div
                      key={i.id}
                      draggable
                      onDragStart={() => setArrastando(i.id)}
                      onDragEnd={() => setArrastando(null)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.stopPropagation(); soltarNaGrade(e, i.id); }}
                      className={cn("relative h-24 w-20 cursor-grab overflow-hidden rounded-md border bg-muted", arrastando === i.id && "opacity-40")}
                    >
                      {i.tipo === "imagem"
                        ? <img src={i.url} alt="" className="h-full w-full object-cover" />
                        : <video src={i.url} muted preload="metadata" className="h-full w-full object-cover" />}
                      <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">{n + 1}</span>
                      {i.erro && (
                        <button
                          type="button"
                          title={i.erro}
                          onClick={() => i.envio && enviar(i.id, i.envio.blob, i.envio.ext, i.envio.original)}
                          className="absolute inset-0 flex flex-col items-center justify-center bg-destructive/80 p-1 text-center text-[10px] leading-tight text-white"
                        >Falhou<br />tentar de novo</button>
                      )}
                      <button type="button" aria-label="Remover" onClick={() => setItens((prev) => prev.filter((x) => x.id !== i.id))} className="absolute right-1 top-1 z-10 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"><X size={12} /></button>
                      <button
                        type="button"
                        onClick={() => abrirEditor(i)}
                        disabled={!i.chave && !i.original}
                        className="absolute inset-x-1 bottom-2 z-10 flex items-center justify-center gap-1 rounded bg-black/65 py-0.5 text-[10px] text-white hover:bg-black/80 disabled:opacity-50"
                        aria-label={`Editar a mídia ${n + 1}`}
                      ><SlidersHorizontal size={10} /> Editar</button>
                      {!i.chave && !i.erro && (
                        <span className="absolute inset-x-0 bottom-0 h-1.5 bg-black/30"><span className="block h-full bg-primary" style={{ width: `${Math.round(i.progresso * 100)}%` }} /></span>
                      )}
                    </div>
                  ))}
                  {preparando > 0 && (
                    <span className="flex h-24 w-20 flex-col items-center justify-center gap-1 rounded-md border bg-muted/50 text-[11px] text-muted-foreground">
                      <Loader2 size={16} className="animate-spin" /> Preparando{preparando > 1 ? ` ${preparando}` : ""}
                    </span>
                  )}
                  <button type="button" onClick={() => entrada.current?.click()} className="flex h-24 w-20 flex-col items-center justify-center gap-1 rounded-md border text-[11px] text-muted-foreground hover:bg-muted">
                    <ImagePlus size={18} /> Adicionar
                  </button>
                  <input ref={entrada} type="file" multiple accept={ACEITA} className="hidden" onChange={(e) => { adicionar([...(e.target.files ?? [])]); e.target.value = ""; }} />
                </div>
                {imagens > 0 && (story || imagens > 1 || erros.some((m) => /proporção/.test(m))) && (
                  <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    <Crop size={12} /> Recortar {imagens > 1 ? "todas as imagens" : "a imagem"} em:
                    {(story ? [{ r: 9 / 16, t: "9:16" }] : [{ r: 1, t: "1:1" }, { r: 0.8, t: "4:5" }, { r: 1.91, t: "1,91:1" }]).map((p) => (
                      <Button key={p.t} type="button" size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => recortarTodas(p.r)}>{p.t}</Button>
                    ))}
                  </div>
                )}
              </div>

              {!story && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="ig-legenda">Legenda</Label>
                    <Textarea id="ig-legenda" rows={6} value={legenda} onChange={(e) => setLegenda(e.target.value)} placeholder="Escreva a legenda..." />
                    <p className="text-right text-xs text-muted-foreground">{legenda.length}/{LEGENDA_MAX} caracteres · {contarHashtags(legenda)}/{HASHTAGS_MAX} hashtags</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ig-comentario">Primeiro comentário (opcional)</Label>
                    <Textarea id="ig-comentario" rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Ex.: as hashtags, um link ou um chamado para ação" />
                  </div>
                  {instagram && (
                    <div className="space-y-2">
                      <Label>Localização (Instagram)</Label>
                      <EscolherLocal valor={local} onMudar={setLocal} contas={contas} />
                    </div>
                  )}
                </>
              )}

              {reels && (
                <div className="space-y-3 rounded-lg border p-3">
                  <label className="flex items-center justify-between gap-2 text-sm">
                    Mostrar o reels também no feed
                    <Switch checked={reelsNoFeed} onCheckedChange={setReelsNoFeed} />
                  </label>
                  {!opcoes.capa_chave && (
                    <div className="space-y-2">
                      <Label>Capa: quadro em {(capaMs / 1000).toFixed(1).replace(".", ",")} s</Label>
                      <Slider min={0} max={Math.max(0, Math.floor((reels.duracao ?? 0) * 1000) - 100)} step={100} value={[capaMs]} onValueChange={([v]) => setCapaMs(v)} />
                    </div>
                  )}
                </div>
              )}

              {!story && <OpcoesAvancadas opcoes={opcoes} onMudar={setOpcoes} reels={!!reels} instagram={instagram} />}

              {/* Quando */}
              <div className="space-y-2">
                <Label>Quando</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" aria-pressed={modo === "agora"} variant={modo === "agora" ? "default" : "outline"} onClick={() => setModo("agora")}>Agora</Button>
                  <Button type="button" size="sm" aria-pressed={modo === "agendar"} variant={modo === "agendar" ? "default" : "outline"} onClick={() => setModo("agendar")}>Agendar</Button>
                  {modo === "agendar" && <Input type="datetime-local" aria-label="Data e hora (Brasília)" className="w-auto" value={quando} onChange={(e) => setQuando(e.target.value)} />}
                </div>
              </div>

              {itens.length > 0 && (erros.length > 0 || avisos.length > 0) && (
                <ul className="space-y-1 text-sm">
                  {erros.map((m) => <li key={m} className="text-destructive">{m}</li>)}
                  {avisos.map((m) => <li key={m} className="text-amber-600 dark:text-amber-400">{m}</li>)}
                </ul>
              )}
            </div>

            <Previa conta={conta} itens={itens} legenda={story ? "" : legenda} local={!story && local ? local.nome : null} story={story} reels={!!reels} capaMs={capaMs} />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => onFechar(false)} disabled={salvando}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando || enviando || falhou || erros.length > 0} className="gap-2">
              {(salvando || enviando) && <Loader2 size={14} className="animate-spin" />}
              {enviando ? "Enviando mídias..." : edicao ? "Salvar alterações" : modo === "agora" ? "Publicar agora" : "Agendar post"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editando && (
        <EditorMidia
          midia={{
            tipo: editando.item.tipo, original: editando.original, largura: editando.item.orig.largura, altura: editando.item.orig.altura,
            duracao: editando.item.orig.duracao, edicao: editando.item.edicao ?? (story ? { ...EDICAO_PADRAO } : undefined),
            alt_text: editando.item.alt_text, marcacoes: editando.item.marcacoes,
          }}
          onCancelar={() => setEditando(null)}
          onAplicar={(r) => { aplicarEdicao(editando.item, r); setEditando(null); }}
        />
      )}
    </>
  );
}

/** Prévia no celular: feed (foto/carrossel com setas e pontinhos), reels ou story 9:16. */
function Previa({ conta, itens, legenda, local, story, reels, capaMs }: {
  conta: ContaInstagram; itens: Item[]; legenda: string; local: string | null; story: boolean; reels: boolean; capaMs: number;
}) {
  const [atual, setAtual] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const i = Math.min(atual, Math.max(0, itens.length - 1));
  const item = itens[i];
  const primeiro = itens[0];
  const proporcao = story || reels ? 9 / 16 : primeiro ? Math.min(1.91, Math.max(0.8, primeiro.largura / primeiro.altura)) : 1;

  useEffect(() => { if (reels && video.current) video.current.currentTime = capaMs / 1000; }, [reels, capaMs, item?.url]);

  const midia = !item ? (
    <span className="absolute inset-0 flex items-center justify-center text-xs text-zinc-500">A prévia aparece aqui</span>
  ) : item.tipo === "imagem" ? (
    <img src={item.url} alt="" className={cn("absolute inset-0 h-full w-full", story ? "object-contain" : "object-cover")} />
  ) : (
    <video ref={video} src={item.url} muted playsInline className={cn("absolute inset-0 h-full w-full", story ? "object-contain" : "object-cover")} />
  );
  const setas = itens.length > 1 && (
    <>
      {i > 0 && <button type="button" aria-label="Anterior" onClick={() => setAtual(i - 1)} className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-0.5 text-zinc-900"><ChevronLeft size={16} /></button>}
      {i < itens.length - 1 && <button type="button" aria-label="Próxima" onClick={() => setAtual(i + 1)} className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-0.5 text-zinc-900"><ChevronRight size={16} /></button>}
    </>
  );

  if (story) {
    return (
      <div className="mx-auto w-[240px] self-start overflow-hidden rounded-[1.75rem] border-[6px] border-zinc-900 bg-zinc-900 shadow-xl dark:border-zinc-700">
        <div className="relative w-full" style={{ aspectRatio: String(proporcao) }}>
          {midia}
          <div className="absolute inset-x-2 top-2 flex gap-1">{itens.map((x, n) => <span key={x.id} className={cn("h-0.5 flex-1 rounded", n <= i ? "bg-white" : "bg-white/40")} />)}</div>
          <div className="absolute left-2 top-4 flex items-center gap-1.5 text-[11px] font-semibold text-white"><FotoConta conta={conta} className="h-6 w-6" /> {conta.usuario}</div>
          {setas}
        </div>
      </div>
    );
  }

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
        {midia}
        {itens.length > 1 && <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">{i + 1}/{itens.length}</span>}
        {setas}
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
