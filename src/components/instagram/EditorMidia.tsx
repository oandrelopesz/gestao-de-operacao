// Editor de foto e vídeo da tela de postagem (estilo Instagram): recorte e giro, filtros, ajustes, texto por cima,
// marcar pessoas e texto alternativo (foto), trecho e som (vídeo). Sempre edita a partir do arquivo original.
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pause, Play, Plus, RotateCw, Trash2, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  EDICAO_PADRAO, FILTROS, NOMES_AJUSTES, PROPORCOES, SEM_AJUSTES, aplicarAjustes, combinar, girado, recorte,
  type EdicaoMidia, type Rotacao, type Texto,
} from "@/lib/instagramEdicao";
import { acabamento, desenharGeometria, exportarImagem, exportarVideo, precisaExportar } from "@/lib/instagramEditor";
import { ALT_TEXT_MAX, type Marcacao } from "@/lib/instagramPost";

export interface MidiaEditavel {
  tipo: "imagem" | "video";
  original: Blob;
  largura: number;
  altura: number;
  duracao?: number;
  edicao?: EdicaoMidia;
  alt_text?: string;
  marcacoes?: Marcacao[];
}

export interface ResultadoEdicao {
  blob: Blob | null; // null: o original serve (a edição não muda o arquivo)
  largura: number;
  altura: number;
  duracao?: number;
  edicao: EdicaoMidia;
  alt_text?: string;
  marcacoes?: Marcacao[];
}

type Aba = "recorte" | "filtros" | "ajustes" | "texto" | "marcar" | "alt" | "trecho";
const CORES = ["#ffffff", "#000000", "#facc15", "#f43f5e", "#22c55e", "#3b82f6"];
const PREVIA_L = 440;
const PREVIA_A = 460;
const seg = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function EditorMidia({ midia, onCancelar, onAplicar }: {
  midia: MidiaEditavel;
  onCancelar: () => void;
  onAplicar: (r: ResultadoEdicao) => void;
}) {
  const video = midia.tipo === "video";
  const duracao = midia.duracao ?? 0;
  const [e, setE] = useState<EdicaoMidia>(() => ({ ...EDICAO_PADRAO, ...(midia.edicao ?? {}), ...(video ? { inicio: midia.edicao?.inicio ?? 0, fim: midia.edicao?.fim ?? duracao } : {}) }));
  const [aba, setAba] = useState<Aba>("recorte");
  const [alt, setAlt] = useState(midia.alt_text ?? "");
  const [marc, setMarc] = useState<Marcacao[]>(midia.marcacoes ?? []);
  const [quem, setQuem] = useState("");
  const [textoSel, setTextoSel] = useState(0);
  const [progresso, setProgresso] = useState<number | null>(null);
  const [tocando, setTocando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [miniaturas, setMiniaturas] = useState<Record<string, string>>({});
  const canvas = useRef<HTMLCanvasElement>(null);
  const videoEl = useRef<HTMLVideoElement>(null);
  const imagem = useRef<ImageBitmap | null>(null);
  const arrasto = useRef<{ x: number; y: number } | null>(null);
  const [url, setUrl] = useState<string>();

  // Criado e revogado no mesmo efeito (com useMemo, a montagem dupla do React revogava o endereço ainda em uso)
  useEffect(() => {
    const u = URL.createObjectURL(midia.original);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [midia.original]);
  useEffect(() => {
    if (video) return;
    let vivo = true;
    createImageBitmap(midia.original).then((b) => { if (vivo) { imagem.current = b; setPronto(true); } else b.close(); })
      .catch(() => toast.error("Não foi possível abrir a imagem."));
    return () => { vivo = false; imagem.current?.close(); };
  }, [midia.original, video]);

  const mudar = (parcial: Partial<EdicaoMidia>) => setE((atual) => ({ ...atual, ...parcial }));
  const g = girado(midia.largura, midia.altura, e.rotacao);
  const r = e.proporcao ?? g.w / g.h;
  let pw = PREVIA_L;
  let ph = pw / r;
  if (ph > PREVIA_A) { ph = PREVIA_A; pw = ph * r; }
  const rect = recorte(g.w, g.h, r, e.zoom, e.cx, e.cy);
  const fonte = (): CanvasImageSource | null => (video ? (videoEl.current && videoEl.current.readyState >= 2 ? videoEl.current : null) : imagem.current);

  const desenhar = useCallback(() => {
    const c = canvas.current;
    const f = fonte();
    if (!c || !f) return;
    c.width = Math.round(pw);
    c.height = Math.round(ph);
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, c.width, c.height);
    desenharGeometria(ctx, f, midia.largura, midia.altura, e.rotacao, rect, c.width, c.height);
    acabamento(ctx, c.width, c.height, e);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e, pw, ph, pronto, midia.largura, midia.altura]);

  useEffect(() => { const id = requestAnimationFrame(desenhar); return () => cancelAnimationFrame(id); }, [desenhar]);

  // Vídeo tocando: redesenha a cada quadro e volta ao início do trecho no fim
  useEffect(() => {
    const v = videoEl.current;
    if (!video || !v || !tocando) return;
    let id = 0;
    const laço = () => {
      if (v.currentTime >= (e.fim ?? duracao) - 0.05) v.currentTime = e.inicio ?? 0;
      desenhar();
      id = requestAnimationFrame(laço);
    };
    v.muted = !!e.semSom;
    v.play().catch(() => setTocando(false));
    id = requestAnimationFrame(laço);
    return () => { cancelAnimationFrame(id); v.pause(); };
  }, [tocando, video, desenhar, e.inicio, e.fim, e.semSom, duracao]);

  // Miniaturas dos filtros, a partir do recorte atual (pequenas, para ser rápido)
  useEffect(() => {
    if (aba !== "filtros") return;
    const f = fonte();
    if (!f) return;
    const lado = 72;
    const base = document.createElement("canvas");
    base.width = lado;
    base.height = Math.round(lado / r);
    const bctx = base.getContext("2d", { willReadFrequently: true })!;
    desenharGeometria(bctx, f, midia.largura, midia.altura, e.rotacao, rect, base.width, base.height);
    const pixels = bctx.getImageData(0, 0, base.width, base.height);
    const novas: Record<string, string> = {};
    for (const fl of FILTROS) {
      const copia = new ImageData(new Uint8ClampedArray(pixels.data), base.width, base.height);
      const { ajustes, cinza } = combinar(fl.id, 100, SEM_AJUSTES);
      aplicarAjustes(copia.data, base.width, base.height, ajustes, cinza);
      bctx.putImageData(copia, 0, 0);
      novas[fl.id] = base.toDataURL("image/jpeg", 0.7);
    }
    setMiniaturas(novas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, pronto, e.rotacao, e.proporcao, e.zoom, e.cx, e.cy]);

  // Ponteiro na prévia: arrasta o recorte, posiciona o texto ou marca uma pessoa (conforme a aba)
  const ponto = (ev: React.PointerEvent) => {
    const b = canvas.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (ev.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (ev.clientY - b.top) / b.height)) };
  };
  const apertar = (ev: React.PointerEvent) => {
    if (aba === "marcar") {
      const u = quem.replace(/^@+/, "").trim();
      if (!u) { toast.info("Escreva o @ de quem vai marcar e clique na imagem."); return; }
      const p = ponto(ev);
      setMarc((m) => [...m.filter((t) => t.usuario !== u), { usuario: u, x: Number(p.x.toFixed(3)), y: Number(p.y.toFixed(3)) }]);
      setQuem("");
      return;
    }
    (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
    arrasto.current = { x: ev.clientX, y: ev.clientY };
    if (aba === "texto" && e.textos[textoSel]) moverTexto(ponto(ev));
  };
  const moverTexto = (p: { x: number; y: number }) =>
    setE((a) => ({ ...a, textos: a.textos.map((t, i) => (i === textoSel ? { ...t, x: p.x, y: p.y } : t)) }));
  const mover = (ev: React.PointerEvent) => {
    if (!arrasto.current) return;
    if (aba === "texto") { if (e.textos[textoSel]) moverTexto(ponto(ev)); return; }
    if (aba !== "recorte") return;
    const dx = ev.clientX - arrasto.current.x;
    const dy = ev.clientY - arrasto.current.y;
    arrasto.current = { x: ev.clientX, y: ev.clientY };
    const novo = recorte(g.w, g.h, r, e.zoom, e.cx - (dx * rect.w) / pw / g.w, e.cy - (dy * rect.h) / ph / g.h);
    mudar({ cx: (novo.x + novo.w / 2) / g.w, cy: (novo.y + novo.h / 2) / g.h });
  };
  const soltar = () => { arrasto.current = null; };

  const girar = () => mudar({ rotacao: (((e.rotacao + 90) % 360) as Rotacao), cx: 0.5, cy: 0.5 });
  const adicionarTexto = () => {
    const t: Texto = { texto: "Seu texto", cor: "#ffffff", tamanho: 0.08, x: 0.5, y: 0.5 };
    setE((a) => ({ ...a, textos: [...a.textos, t] }));
    setTextoSel(e.textos.length);
  };
  const mudarTexto = (parcial: Partial<Texto>) =>
    setE((a) => ({ ...a, textos: a.textos.map((t, i) => (i === textoSel ? { ...t, ...parcial } : t)) }));

  async function aplicar() {
    const comuns = { edicao: e, alt_text: alt.trim() || undefined, marcacoes: marc.length ? marc : undefined };
    if (!precisaExportar(midia.tipo, midia.largura, e, duracao)) {
      onAplicar({ blob: null, largura: midia.largura, altura: midia.altura, duracao: midia.duracao, ...comuns });
      return;
    }
    setTocando(false);
    setProgresso(0);
    try {
      if (!video) {
        const r = await exportarImagem(midia.original, e);
        onAplicar({ ...r, ...comuns });
      } else {
        const r = await exportarVideo(midia.original, midia.largura, midia.altura, duracao, e, setProgresso);
        if (r.aviso) toast.warning(r.aviso);
        onAplicar({ blob: r.blob, largura: r.largura, altura: r.altura, duracao: r.duracao, ...comuns });
      }
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível aplicar a edição.");
      setProgresso(null);
    }
  }

  const abas: { id: Aba; nome: string }[] = [
    { id: "recorte", nome: "Recorte" },
    { id: "filtros", nome: "Filtros" },
    { id: "ajustes", nome: "Ajustes" },
    { id: "texto", nome: "Texto" },
    ...(video ? [{ id: "trecho" as Aba, nome: "Trecho e som" }] : [{ id: "marcar" as Aba, nome: "Marcar pessoas" }, { id: "alt" as Aba, nome: "Texto alternativo" }]),
  ];
  const t = e.textos[textoSel];

  return (
    <Dialog open onOpenChange={(v) => !v && progresso === null && onCancelar()}>
      <DialogContent className="max-h-[94vh] max-w-5xl grid-cols-1 overflow-y-auto" onInteractOutside={(ev) => ev.preventDefault()}>
        <DialogHeader><DialogTitle>Editar {video ? "vídeo" : "foto"}</DialogTitle></DialogHeader>
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
          <div className="flex flex-col items-center gap-2">
            <div className="relative" style={{ width: pw, height: ph, maxWidth: "100%" }}>
              <canvas
                ref={canvas}
                className={cn("h-full w-full touch-none rounded-md bg-black", aba === "recorte" && "cursor-grab", (aba === "texto" || aba === "marcar") && "cursor-crosshair")}
                style={{ aspectRatio: String(r) }}
                onPointerDown={apertar}
                onPointerMove={mover}
                onPointerUp={soltar}
                onPointerCancel={soltar}
              />
              {aba === "recorte" && (
                <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                  {Array.from({ length: 9 }).map((_, i) => <span key={i} className="border border-white/20" />)}
                </div>
              )}
              {!video && aba === "marcar" && marc.map((m) => (
                <span key={m.usuario} className="absolute -translate-x-1/2 -translate-y-1/2 rounded bg-black/75 px-1.5 py-0.5 text-[11px] text-white" style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}>
                  @{m.usuario}
                </span>
              ))}
              {!pronto && !video && <span className="absolute inset-0 flex items-center justify-center"><Loader2 className="animate-spin text-white" /></span>}
            </div>
            {video && (
              <>
                <video
                  ref={videoEl}
                  src={url}
                  muted
                  playsInline
                  preload="auto"
                  // invisível, mas no layout (com display:none o navegador pode não carregar os quadros)
                  className="pointer-events-none absolute h-px w-px opacity-0"
                  // Vídeo fora da vista só carrega os metadados: pular para o início do trecho obriga a carregar o quadro
                  onLoadedMetadata={() => { if (videoEl.current) videoEl.current.currentTime = Math.max(0.001, e.inicio ?? 0); }}
                  onSeeked={() => { setPronto(true); desenhar(); }}
                />
                <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => setTocando((v) => !v)} disabled={!pronto}>
                  {tocando ? <Pause size={14} /> : <Play size={14} />} {tocando ? "Pausar" : "Tocar trecho"}
                </Button>
              </>
            )}
            {aba === "recorte" && <p className="text-xs text-muted-foreground">Arraste a imagem para posicionar.</p>}
            {aba === "texto" && <p className="text-xs text-muted-foreground">Clique ou arraste na imagem para posicionar o texto escolhido.</p>}
          </div>

          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap gap-1">
              {abas.map((a) => (
                <Button key={a.id} type="button" size="sm" variant={aba === a.id ? "default" : "outline"} className="h-8" onClick={() => setAba(a.id)}>{a.nome}</Button>
              ))}
            </div>

            {aba === "recorte" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Proporção</Label>
                  <div className="flex flex-wrap gap-1">
                    {PROPORCOES.map((p) => (
                      <Button key={p.rotulo} type="button" size="sm" variant={e.proporcao === p.r ? "default" : "outline"} className="h-8" onClick={() => mudar({ proporcao: p.r, zoom: 1, cx: 0.5, cy: 0.5 })}>{p.rotulo}</Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Zoom</Label>
                  <Slider min={1} max={3} step={0.01} value={[e.zoom]} onValueChange={([v]) => mudar({ zoom: v })} />
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" className="gap-2" onClick={girar}><RotateCw size={14} /> Girar 90°</Button>
                  <Button type="button" size="sm" variant="ghost" className="gap-2" onClick={() => mudar({ proporcao: null, zoom: 1, cx: 0.5, cy: 0.5, rotacao: 0 })}><Undo2 size={14} /> Restaurar</Button>
                </div>
              </div>
            )}

            {aba === "filtros" && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {FILTROS.map((f) => (
                    <button key={f.id} type="button" onClick={() => mudar({ filtro: f.id, intensidade: 100 })} className={cn("space-y-1 rounded-md p-1 text-center text-[11px]", e.filtro === f.id ? "ring-2 ring-primary" : "hover:bg-muted")}>
                      <span className="block aspect-square overflow-hidden rounded bg-muted">
                        {miniaturas[f.id] && <img src={miniaturas[f.id]} alt="" className="h-full w-full object-cover" />}
                      </span>
                      {f.nome}
                    </button>
                  ))}
                </div>
                {e.filtro !== "normal" && (
                  <div className="space-y-2">
                    <Label>Intensidade: {e.intensidade}</Label>
                    <Slider min={0} max={100} step={1} value={[e.intensidade]} onValueChange={([v]) => mudar({ intensidade: v })} />
                  </div>
                )}
              </div>
            )}

            {aba === "ajustes" && (
              <div className="space-y-3">
                {NOMES_AJUSTES.map((a) => (
                  <div key={a.chave} className="space-y-1">
                    <Label className="flex justify-between"><span>{a.nome}</span><span className="text-muted-foreground">{e.ajustes[a.chave]}</span></Label>
                    <Slider min={a.min} max={100} step={1} value={[e.ajustes[a.chave]]} onValueChange={([v]) => mudar({ ajustes: { ...e.ajustes, [a.chave]: v } })} />
                  </div>
                ))}
                <Button type="button" size="sm" variant="ghost" className="gap-2" onClick={() => mudar({ ajustes: SEM_AJUSTES })}><Undo2 size={14} /> Zerar ajustes</Button>
              </div>
            )}

            {aba === "texto" && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1">
                  {e.textos.map((x, i) => (
                    <Button key={i} type="button" size="sm" variant={i === textoSel ? "default" : "outline"} className="h-8 max-w-40" onClick={() => setTextoSel(i)}>
                      <span className="truncate">{x.texto.trim() || `Texto ${i + 1}`}</span>
                    </Button>
                  ))}
                  <Button type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={adicionarTexto}><Plus size={14} /> Adicionar texto</Button>
                </div>
                {t && (
                  <div className="space-y-3">
                    <Textarea rows={2} value={t.texto} onChange={(ev) => mudarTexto({ texto: ev.target.value })} aria-label="Texto" />
                    <div className="flex flex-wrap items-center gap-1">
                      {CORES.map((c) => (
                        <button key={c} type="button" aria-label={`Cor ${c}`} onClick={() => mudarTexto({ cor: c })} className={cn("h-7 w-7 rounded-full border", t.cor === c && "ring-2 ring-primary ring-offset-1")} style={{ background: c }} />
                      ))}
                      <input type="color" aria-label="Outra cor" value={t.cor} onChange={(ev) => mudarTexto({ cor: ev.target.value })} className="h-7 w-9 cursor-pointer rounded border bg-transparent" />
                    </div>
                    <div className="space-y-1">
                      <Label>Tamanho</Label>
                      <Slider min={0.03} max={0.2} step={0.005} value={[t.tamanho]} onValueChange={([v]) => mudarTexto({ tamanho: v })} />
                    </div>
                    <label className="flex items-center justify-between text-sm">Fundo escuro atrás do texto <Switch checked={!!t.fundo} onCheckedChange={(v) => mudarTexto({ fundo: v })} /></label>
                    <Button type="button" size="sm" variant="ghost" className="gap-2 text-destructive" onClick={() => { setE((a) => ({ ...a, textos: a.textos.filter((_, i) => i !== textoSel) })); setTextoSel(0); }}>
                      <Trash2 size={14} /> Remover este texto
                    </Button>
                  </div>
                )}
              </div>
            )}

            {aba === "marcar" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="ig-marcar">Quem marcar</Label>
                  <Input id="ig-marcar" value={quem} onChange={(ev) => setQuem(ev.target.value)} placeholder="@usuario, depois clique na imagem" />
                </div>
                {marc.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {marc.map((m) => (
                      <span key={m.usuario} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                        @{m.usuario}
                        <button type="button" aria-label={`Tirar @${m.usuario}`} onClick={() => setMarc((x) => x.filter((y) => y.usuario !== m.usuario))}><X size={12} /></button>
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">A marcação vale para a imagem já recortada: recorte antes de marcar.</p>
              </div>
            )}

            {aba === "alt" && (
              <div className="space-y-1">
                <Label htmlFor="ig-alt">Texto alternativo (para quem usa leitor de tela)</Label>
                <Textarea id="ig-alt" rows={4} maxLength={ALT_TEXT_MAX} value={alt} onChange={(ev) => setAlt(ev.target.value)} placeholder="Descreva o que aparece na imagem" />
                <p className="text-right text-xs text-muted-foreground">{alt.length}/{ALT_TEXT_MAX}</p>
              </div>
            )}

            {aba === "trecho" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Trecho: {seg(e.inicio ?? 0)} até {seg(e.fim ?? duracao)} ({((e.fim ?? duracao) - (e.inicio ?? 0)).toFixed(1).replace(".", ",")} s)</Label>
                  <Slider
                    min={0}
                    max={Math.max(0.1, duracao)}
                    step={0.1}
                    minStepsBetweenThumbs={10}
                    value={[e.inicio ?? 0, e.fim ?? duracao]}
                    onValueChange={([a, b]) => {
                      mudar({ inicio: a, fim: b });
                      if (videoEl.current && !tocando) videoEl.current.currentTime = a !== (e.inicio ?? 0) ? a : b;
                    }}
                  />
                </div>
                <label className="flex items-center justify-between text-sm">Sem som <Switch checked={!!e.semSom} onCheckedChange={(v) => mudar({ semSom: v })} /></label>
              </div>
            )}
          </div>
        </div>

        {progresso !== null && (
          <div className="space-y-1">
            <Progress value={Math.round(progresso * 100)} />
            <p className="text-xs text-muted-foreground">{video ? `Processando o vídeo… ${Math.round(progresso * 100)}%` : "Gerando a imagem…"}</p>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancelar} disabled={progresso !== null}>Cancelar</Button>
          <Button onClick={aplicar} disabled={progresso !== null || !pronto} className="gap-2">
            {progresso !== null && <Loader2 size={14} className="animate-spin" />} Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
