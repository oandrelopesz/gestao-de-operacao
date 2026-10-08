// Áudio + transcrição sincronizados: a palavra falada fica destacada e clicar numa palavra toca dali.
// Uma transcrição de 1 h tem ~9.000 palavras: os spans são montados uma vez e o destaque troca um
// atributo direto no DOM (sem re-render por quadro).
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { aplicarCorrecaoNasMarcas, iniciosDasPalavras, indicePalavra, type Marcas } from "@/lib/transcritorMarcas";
import { registrarTermoManual, salvarMarcas, traduzErroTranscritor, urlAudio } from "@/lib/transcritor";

const CHAVE_ACOMPANHAR = "transcritor_acompanhar";

interface Props {
  id: string;
  marcas: Marcas;
  onCorrigido: (marcas: Marcas) => void;
}

export function PlayerTranscricao({ id, marcas, onCorrigido }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const caixaRef = useRef<HTMLDivElement>(null);
  const spansRef = useRef<HTMLElement[]>([]);
  const atualRef = useRef(-1);
  const quadroRef = useRef(0);
  const acompanharRef = useRef(true);
  const selecaoRef = useRef("");
  const [semAudio, setSemAudio] = useState(false);
  const [acompanhar, setAcompanhar] = useState(true);
  const [corrigindo, setCorrigindo] = useState(false);
  const [de, setDe] = useState("");
  const [para, setPara] = useState("");
  const [salvando, setSalvando] = useState(false);

  const inicios = useMemo(() => iniciosDasPalavras(marcas), [marcas]);

  const paragrafos = useMemo(() => {
    let k = 0;
    return marcas.p.map((par, pi) => (
      <p key={pi} className="mb-3 last:mb-0">
        {par.map((w) => {
          const i = k++;
          return (
            <Fragment key={i}>
              <span data-i={i} className="rounded-sm transition-colors">{w[0]}</span>{" "}
            </Fragment>
          );
        })}
      </p>
    ));
  }, [marcas]);

  useEffect(() => {
    try { if (localStorage.getItem(CHAVE_ACOMPANHAR) === "0") setAcompanhar(false); } catch { /* sem storage */ }
    return () => cancelAnimationFrame(quadroRef.current);
  }, []);

  useEffect(() => { acompanharRef.current = acompanhar; }, [acompanhar]);

  /** Mantém a palavra visível rolando só a caixa do texto (nunca a página). */
  const manterVisivel = (el: HTMLElement) => {
    const caixa = caixaRef.current;
    if (!caixa) return;
    const topo = el.offsetTop;
    if (topo < caixa.scrollTop || topo + el.offsetHeight > caixa.scrollTop + caixa.clientHeight) {
      caixa.scrollTo({ top: Math.max(0, topo - caixa.clientHeight / 3), behavior: "smooth" });
    }
  };

  const sincronizar = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const i = indicePalavra(inicios, audio.currentTime + 0.05);
    if (i === atualRef.current) return;
    spansRef.current[atualRef.current]?.removeAttribute("data-atual");
    const el = spansRef.current[i];
    el?.setAttribute("data-atual", "");
    atualRef.current = i;
    if (el && acompanharRef.current && !audio.paused) manterVisivel(el);
  };

  // Spans novos (marcas mudaram com uma correção): refaz a lista e o destaque
  useEffect(() => {
    const caixa = caixaRef.current;
    if (!caixa) return;
    caixa.querySelectorAll("[data-atual]").forEach((el) => el.removeAttribute("data-atual"));
    spansRef.current = Array.from(caixa.querySelectorAll<HTMLElement>("[data-i]"));
    atualRef.current = -1;
    sincronizar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marcas]);

  const tocando = () => {
    cancelAnimationFrame(quadroRef.current);
    const passo = () => {
      sincronizar();
      if (audioRef.current && !audioRef.current.paused) quadroRef.current = requestAnimationFrame(passo);
    };
    passo();
  };

  const clicarPalavra = (e: React.MouseEvent) => {
    const alvo = (e.target as HTMLElement).closest<HTMLElement>("[data-i]");
    const audio = audioRef.current;
    if (!alvo || !audio || semAudio) return;
    if (window.getSelection()?.toString()) return; // está selecionando texto para corrigir
    audio.currentTime = inicios[Number(alvo.dataset.i)] ?? 0;
    audio.play().catch(() => {});
  };

  /** Guarda a seleção antes do clique no botão (o clique pode desfazer a seleção). */
  const guardarSelecao = () => {
    const sel = window.getSelection();
    const caixa = caixaRef.current;
    selecaoRef.current = sel && caixa && sel.rangeCount && caixa.contains(sel.anchorNode) ? sel.toString().replace(/\s+/g, " ").trim() : "";
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      await registrarTermoManual(de, para);
      const r = aplicarCorrecaoNasMarcas(marcas, de, para);
      if (r.trocas > 0) {
        await salvarMarcas(id, r.marcas);
        onCorrigido(r.marcas);
        toast.success(`Corrigido em ${r.trocas} ${r.trocas === 1 ? "lugar" : "lugares"}; vale para as próximas transcrições`);
      } else {
        toast.info("Não achei esse trecho no texto, mas guardei na memória para as próximas transcrições");
      }
      setCorrigindo(false);
    } catch (e) {
      toast.error(traduzErroTranscritor(e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-3">
      {semAudio ? (
        <p className="text-xs text-muted-foreground">Áudio indisponível (venceu ou é de antes do player).</p>
      ) : (
        <audio ref={audioRef} controls preload="metadata" src={urlAudio(id)} className="h-10 w-full"
          onPlay={tocando} onPause={sincronizar} onSeeked={sincronizar} onTimeUpdate={sincronizar} onEnded={sincronizar}
          onError={() => setSemAudio(true)} />
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        {!semAudio && (
          <div className="flex items-center gap-1.5">
            <Switch id={`acompanhar-${id}`} checked={acompanhar}
              onCheckedChange={(v) => { setAcompanhar(v); try { localStorage.setItem(CHAVE_ACOMPANHAR, v ? "1" : "0"); } catch { /* sem storage */ } }} />
            <Label htmlFor={`acompanhar-${id}`} className="text-xs font-normal">Acompanhar</Label>
          </div>
        )}
        <Popover open={corrigindo} onOpenChange={(aberto) => { if (aberto) { setDe(selecaoRef.current); setPara(""); } setCorrigindo(aberto); }}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onPointerDown={guardarSelecao}>
              <Pencil size={12} /> Corrigir termo
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72" align="start">
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); salvar(); }}>
              <div className="space-y-1">
                <Label htmlFor={`de-${id}`} className="text-xs">Como saiu</Label>
                <Input id={`de-${id}`} value={de} onChange={(e) => setDe(e.target.value)} placeholder="rói" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`para-${id}`} className="text-xs">Certo</Label>
                <Input id={`para-${id}`} value={para} onChange={(e) => setPara(e.target.value)} placeholder="ROI" className="h-8 text-sm" autoFocus={!!de} />
              </div>
              <p className="text-[11px] text-muted-foreground">Corrige esta transcrição e fica na memória: vale para as próximas.</p>
              <Button type="submit" size="sm" className="w-full" disabled={salvando || !de.trim() || !para.trim()}>
                {salvando ? <Loader2 size={14} className="animate-spin" /> : "Salvar"}
              </Button>
            </form>
          </PopoverContent>
        </Popover>
        {!semAudio && <span className="hidden text-muted-foreground sm:inline">Clique numa palavra para ouvir dali. Selecione um trecho e use “Corrigir termo”.</span>}
      </div>

      <div ref={caixaRef} onClick={clicarPalavra}
        className={cn(
          "relative max-h-96 overflow-y-auto text-sm leading-relaxed",
          "[&_[data-atual]]:bg-primary/25 [&_[data-atual]]:text-foreground",
          !semAudio && "[&_[data-i]]:cursor-pointer [&_[data-i]:hover]:bg-muted",
        )}>
        {paragrafos}
      </div>
    </div>
  );
}
