import { createFileRoute } from "@tanstack/react-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, CalendarDays, Clock, Download, ExternalLink, Eye, FileText, Loader2, MoreVertical, NotebookPen, Pencil, RefreshCw, Search,
  Timer, Trash2, Users, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useCachedState } from "@/lib/pageCache";
import { CACHE_KEYS, loadFireflies } from "@/lib/data";
import { supabase } from "@/integrations/supabase/client";
import {
  FIREFLIES_HOME, ROTULO_SITUACAO, ROTULO_TIPO, URL_APLICAR_AGORA, arquivoDisponivel, caminhoArquivo, dataCurta, duracaoTexto, filtrar, horario,
  intervaloAtualizacao, linkFireflies, mensagemErroFireflies, nomeArquivo, resumoParticipantes, situacao, tituloExibido,
  type FormatoDownload, type ReuniaoFireflies, type Situacao, type TipoArquivo,
} from "@/lib/fireflies";
import {
  PreviewDialog, baixarArquivoFireflies, preCarregarArquivo, salvarBlob, type AlvoPrevia,
} from "@/components/fireflies/PreviewDialog";
import { docxParaMarkdown } from "@/lib/firefliesMd";
import { MensagemBusca } from "@/components/MensagemBusca";

// Aba "Fireflies": reuniões gravadas pelo robô do Fireflies, importadas pelo worker da VPS
// (transcrição e resumo em PDF e DOCX no bucket privado "fireflies"). Renomear e excluir gravam a intenção na
// linha e pedem ao worker (pelo n8n) que aplique no Fireflies na hora; o cron de 1 min é só a rede de segurança.
export const Route = createFileRoute("/_authenticated/fireflies")({ component: FirefliesPage });

/** Cards desenhados de cada vez: o resto entra conforme a lista rola (141+ reuniões sem travar a troca de aba). */
const POR_VEZ = 25;

/** Grava na linha e confere que ela existe (a API não reclama quando nenhuma linha é alterada). */
async function gravarNaReuniao(id: string, patch: { titulo_pendente?: string; excluir?: boolean }): Promise<void> {
  const { data, error } = await supabase.from("fireflies_reunioes").update(patch).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Essa reunião não foi encontrada (pode já ter sido excluída). Atualize a lista.");
}

/** Pede ao worker que aplique agora os renomear/excluir pendentes; se falhar, o cron de 1 min aplica. */
function pedirAplicarAgora(): void {
  fetch(URL_APLICAR_AGORA, { method: "POST", mode: "no-cors", keepalive: true }).catch(() => {});
}

function FirefliesPage() {
  const [lista, setLista] = useCachedState<ReuniaoFireflies[] | null>(CACHE_KEYS.fireflies, null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState("");
  const [previa, setPrevia] = useState<AlvoPrevia | null>(null);
  const [renomear, setRenomear] = useState<ReuniaoFireflies | null>(null);
  const [paraExcluir, setParaExcluir] = useState<ReuniaoFireflies | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  /** Arquivo sendo baixado agora: "<id>:<tipo>_<formato>" */
  const [baixando, setBaixando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setLista(await loadFireflies());
      setErro(null);
    } catch (e) {
      setErro(mensagemErroFireflies(e));
    } finally {
      setCarregando(false);
    }
  }, [setLista]);

  useEffect(() => { carregar(); }, [carregar]);

  // Renomeando/excluindo: confere a cada 3 s (o worker aplica na hora); importando: a cada 15 s. Só com a aba visível.
  const intervalo = useMemo(() => intervaloAtualizacao(lista ?? []), [lista]);
  useEffect(() => {
    if (!intervalo) return;
    const t = window.setInterval(() => { if (document.visibilityState === "visible") carregar(); }, intervalo);
    return () => window.clearInterval(t);
  }, [intervalo, carregar]);

  // Busca tolerante (sem acento, com erro de digitação) no título e nos participantes
  const resultadoBusca = useMemo(() => filtrar(lista ?? [], busca), [lista, busca]);
  const visiveis = resultadoBusca.itens;

  // Desenha POR_VEZ cards e acrescenta mais quando o fim da lista chega perto da tela
  const [limite, setLimite] = useState(POR_VEZ);
  useEffect(() => { setLimite(POR_VEZ); }, [busca]);
  const fimDaLista = useRef<HTMLDivElement | null>(null);
  const temMais = visiveis.length > limite;
  useEffect(() => {
    const alvo = fimDaLista.current;
    if (!alvo || !temMais) return;
    const obs = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) setLimite((l) => l + POR_VEZ);
    }, { rootMargin: "800px 0px" });
    obs.observe(alvo);
    return () => obs.disconnect();
  }, [temMais, limite]);

  const atualizarLocal = useCallback((id: string, patch: Partial<ReuniaoFireflies>) =>
    setLista((prev) => prev && prev.map((r) => (r.id === id ? { ...r, ...patch } : r))), [setLista]);

  const baixar = useCallback(async (r: ReuniaoFireflies, tipo: TipoArquivo, formato: FormatoDownload) => {
    const origem = formato === "md" ? "docx" : formato;
    if (!caminhoArquivo(r, tipo, origem)) return;
    const chave = `${r.id}:${tipo}_${formato}`;
    setBaixando(chave);
    try {
      const blob = await baixarArquivoFireflies(r, tipo, origem);
      salvarBlob(
        formato === "md"
          ? new Blob([docxParaMarkdown(await blob.arrayBuffer())], { type: "text/markdown;charset=utf-8" })
          : blob,
        nomeArquivo(r, tipo, formato),
      );
    } catch (e) {
      toast.error(mensagemErroFireflies(e));
    } finally {
      setBaixando((atual) => (atual === chave ? null : atual));
    }
  }, []);

  const ver = useCallback((r: ReuniaoFireflies, tipo: TipoArquivo) => setPrevia({ reuniao: r, tipo }), []);
  const abrirRenomear = useCallback((r: ReuniaoFireflies) => setRenomear(r), []);
  const abrirExcluir = useCallback((r: ReuniaoFireflies) => setParaExcluir(r), []);

  const salvarNome = async (r: ReuniaoFireflies, novo: string) => {
    await gravarNaReuniao(r.id, { titulo_pendente: novo });
    atualizarLocal(r.id, { titulo_pendente: novo });
    pedirAplicarAgora();
    toast.success("Nome trocado. No Fireflies, em alguns segundos.");
  };

  const confirmarExclusao = async () => {
    if (!paraExcluir) return;
    setExcluindo(true);
    try {
      await gravarNaReuniao(paraExcluir.id, { excluir: true });
      atualizarLocal(paraExcluir.id, { excluir: true });
      pedirAplicarAgora();
      toast.success("Excluindo… some daqui e do Fireflies em alguns segundos.");
      setParaExcluir(null);
    } catch (e) {
      toast.error(mensagemErroFireflies(e));
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
            <NotebookPen size={20} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Fireflies</h1>
            <p className="text-sm text-muted-foreground">Transcrições e resumos das suas reuniões, importados automaticamente</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" className="gap-2">
            <a href={FIREFLIES_HOME} target="_blank" rel="noopener noreferrer" title="Abrir o Fireflies completo">
              <ExternalLink size={16} /> Abrir Fireflies
            </a>
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => carregar()} disabled={carregando} title="Buscar as reuniões de novo">
            <RefreshCw size={16} className={cn(carregando && "animate-spin")} /> Atualizar
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
        <Input
          placeholder="Buscar por nome da reunião ou participante..."
          className="pl-10 pr-10 pointer-coarse:h-10"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {busca && (
          <button
            type="button"
            onClick={() => setBusca("")}
            className="absolute right-0.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground pointer-coarse:h-10 pointer-coarse:w-10"
            title="Limpar busca"
            aria-label="Limpar busca"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {erro && (
        <Card className="border-destructive/40">
          <CardContent className="flex items-start gap-3 p-4 text-sm text-destructive">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <span>{erro}</span>
          </CardContent>
        </Card>
      )}

      {lista === null ? (
        !erro && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 w-full rounded-xl sm:h-28" />)}
          </div>
        )
      ) : lista.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><NotebookPen size={26} /></span>
            <p className="text-base font-semibold">Nenhuma reunião ainda</p>
            <p className="max-w-md text-sm text-muted-foreground">
              As reuniões aparecem aqui assim que o Fireflies termina de processar.
            </p>
          </CardContent>
        </Card>
      ) : (
        <section className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {busca.trim()
              ? `${visiveis.length} de ${lista.length} ${lista.length === 1 ? "reunião" : "reuniões"}`
              : `${lista.length} ${lista.length === 1 ? "reunião" : "reuniões"}`}
          </p>
          {resultadoBusca.modo === "parecidos" && <MensagemBusca resultado={resultadoBusca} />}
          {visiveis.length === 0 ? (
            resultadoBusca.modo === "nenhum" ? (
              <MensagemBusca resultado={resultadoBusca} className="py-10 text-center" />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma reunião com esse nome ou participante.</p>
            )
          ) : (
            <>
              {visiveis.slice(0, limite).map((r) => (
                <CartaoReuniao
                  key={r.id}
                  r={r}
                  baixando={baixando?.startsWith(`${r.id}:`) ? baixando : null}
                  onVer={ver}
                  onBaixar={baixar}
                  onRenomear={abrirRenomear}
                  onExcluir={abrirExcluir}
                />
              ))}
              {temMais && (
                <div ref={fimDaLista} className="flex justify-center py-4">
                  <Button variant="ghost" size="sm" onClick={() => setLimite((l) => l + POR_VEZ)}>
                    Mostrar mais ({visiveis.length - limite})
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      <PreviewDialog alvo={previa} onClose={() => setPrevia(null)} />

      <RenomearDialog reuniao={renomear} onClose={() => setRenomear(null)} onSalvar={salvarNome} />

      <AlertDialog open={!!paraExcluir} onOpenChange={(o) => { if (!o && !excluindo) setParaExcluir(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta reunião?</AlertDialogTitle>
            <AlertDialogDescription>
              Ela será apagada também no Fireflies.
              {paraExcluir && <span className="mt-2 block font-medium text-foreground">{tituloExibido(paraExcluir)}</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmarExclusao(); }}
              disabled={excluindo}
              className="bg-destructive hover:bg-destructive/90"
            >
              {excluindo ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------- Card da reunião

const ESTILO_SITUACAO: Record<Exclude<Situacao, "pronto">, string> = {
  importando: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  renomeando: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  excluindo: "bg-destructive/10 text-destructive",
  erro: "bg-destructive/10 text-destructive",
};

function SeloSituacao({ situacao: s }: { situacao: Situacao }) {
  if (s === "pronto") return null;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", ESTILO_SITUACAO[s])}>
      {s === "erro" ? <AlertTriangle size={11} /> : <Loader2 size={11} className="animate-spin" />}
      {ROTULO_SITUACAO[s]}
    </span>
  );
}

interface CartaoReuniaoProps {
  r: ReuniaoFireflies;
  /** Arquivo desta reunião sendo baixado agora ("<id>:<tipo>_<formato>"), ou null */
  baixando: string | null;
  onVer: (r: ReuniaoFireflies, tipo: TipoArquivo) => void;
  onBaixar: (r: ReuniaoFireflies, tipo: TipoArquivo, formato: FormatoDownload) => void;
  onRenomear: (r: ReuniaoFireflies) => void;
  onExcluir: (r: ReuniaoFireflies) => void;
}

// Memorizado: baixar um arquivo ou abrir a prévia não redesenha os outros cards
const CartaoReuniao = memo(function CartaoReuniao({ r, baixando, onVer, onBaixar, onRenomear, onExcluir }: CartaoReuniaoProps) {
  const s = situacao(r);
  const titulo = tituloExibido(r);
  const data = dataCurta(r.data_hora);
  const hora = horario(r.data_hora, r.duracao_min);
  const duracao = duracaoTexto(r.duracao_min);
  const { visiveis, resto } = resumoParticipantes(r.participantes, 3);
  const saindo = s === "excluindo";

  return (
    <Card className={cn("overflow-hidden", saindo && "opacity-60")}>
      <div className="flex items-start gap-3 p-4">
        <span className="mt-0.5 hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
          <NotebookPen size={18} />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="min-w-0 max-w-full truncate text-[15px] font-semibold leading-snug" title={titulo}>{titulo}</h3>
            <SeloSituacao situacao={s} />
          </div>
          {(data || hora || duracao) && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {data && <span className="inline-flex items-center gap-1"><CalendarDays size={12} /> {data}</span>}
              {hora && <span className="inline-flex items-center gap-1"><Clock size={12} /> {hora}</span>}
              {duracao && <span className="inline-flex items-center gap-1"><Timer size={12} /> {duracao}</span>}
            </p>
          )}
          {visiveis.length > 0 && (
            <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground" title={r.participantes.join(", ")}>
              <Users size={12} className="shrink-0" />
              <span className="truncate">{visiveis.join(", ")}</span>
              {resto > 0 && (
                <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[11px] font-medium text-foreground/70">+{resto}</span>
              )}
            </p>
          )}
          {s === "erro" && r.erro && <p className="text-xs text-destructive">{r.erro}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {saindo ? (
            <Button variant="outline" size="sm" className="gap-1.5 pointer-coarse:min-w-10" disabled>
              <ExternalLink size={14} /> <span className="hidden sm:inline">Abrir no Fireflies</span>
            </Button>
          ) : (
            <Button asChild variant="outline" size="sm" className="gap-1.5 pointer-coarse:min-w-10">
              <a href={linkFireflies(r)} target="_blank" rel="noopener noreferrer" title="Abrir no Fireflies" aria-label="Abrir no Fireflies">
                <ExternalLink size={14} /> <span className="hidden sm:inline">Abrir no Fireflies</span>
              </a>
            </Button>
          )}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Mais opções" aria-label="Mais opções" disabled={saindo}>
                <MoreVertical size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onRenomear(r)}><Pencil size={14} className="mr-2" /> Renomear</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onExcluir(r)}>
                <Trash2 size={14} className="mr-2" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Arquivos: no celular um grupo embaixo do outro; do tablet em diante, lado a lado */}
      <div className="flex flex-col gap-2 border-t bg-muted/30 px-4 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
        <GrupoArquivos r={r} tipo="transcricao" baixando={baixando} onVer={onVer} onBaixar={onBaixar} />
        <span className="hidden h-6 w-px bg-border sm:block" aria-hidden />
        <GrupoArquivos r={r} tipo="resumo" baixando={baixando} onVer={onVer} onBaixar={onBaixar} />
        {s === "importando" && (
          <span className="text-[11px] text-muted-foreground sm:ml-auto">Os arquivos aparecem quando a importação terminar.</span>
        )}
      </div>
    </Card>
  );
});

interface GrupoArquivosProps {
  r: ReuniaoFireflies;
  tipo: TipoArquivo;
  baixando: string | null;
  onVer: (r: ReuniaoFireflies, tipo: TipoArquivo) => void;
  onBaixar: (r: ReuniaoFireflies, tipo: TipoArquivo, formato: FormatoDownload) => void;
}

function GrupoArquivos({ r, tipo, baixando, onVer, onBaixar }: GrupoArquivosProps) {
  const pdf = arquivoDisponivel(r, tipo, "pdf");
  const docx = arquivoDisponivel(r, tipo, "docx");
  const rotulo = ROTULO_TIPO[tipo];
  // Ponteiro chegando no botão (mouse por cima, dedo encostando, foco pelo teclado): o arquivo já começa a vir,
  // e o clique abre/baixa na hora
  const preCarregar = (formato: FormatoDownload, ok: boolean) => (ok ? () => preCarregarArquivo(r, tipo, formato === "md" ? "docx" : formato) : undefined);
  const botao = (formato: FormatoDownload, ok: boolean) => {
    const ativo = baixando === `${r.id}:${tipo}_${formato}`;
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 px-2.5"
        disabled={!ok || ativo}
        onPointerEnter={preCarregar(formato, ok)}
        onPointerDown={preCarregar(formato, ok)}
        onFocus={preCarregar(formato, ok)}
        onClick={() => onBaixar(r, tipo, formato)}
        title={`Baixar ${rotulo.toLowerCase()} em ${formato.toUpperCase()}`}
        aria-label={`Baixar ${rotulo.toLowerCase()} em ${formato.toUpperCase()}`}
      >
        {ativo ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} {formato.toUpperCase()}
      </Button>
    );
  };
  return (
    <div className="flex items-center justify-between gap-3 sm:justify-start">
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <FileText size={13} className="shrink-0" /> {rotulo}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 px-2.5"
          disabled={!pdf}
          onPointerEnter={preCarregar("pdf", pdf)}
          onPointerDown={preCarregar("pdf", pdf)}
          onFocus={preCarregar("pdf", pdf)}
          onClick={() => onVer(r, tipo)}
          title={`Ver ${rotulo.toLowerCase()} (PDF)`}
          aria-label={`Ver ${rotulo.toLowerCase()}`}
        >
          <Eye size={14} /> Ver
        </Button>
        {botao("pdf", pdf)}
        {botao("docx", docx)}
        {botao("md", docx)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Renomear

interface RenomearDialogProps {
  reuniao: ReuniaoFireflies | null;
  onClose: () => void;
  onSalvar: (r: ReuniaoFireflies, novo: string) => Promise<void>;
}

function RenomearDialog({ reuniao, onClose, onSalvar }: RenomearDialogProps) {
  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (reuniao) setNome(tituloExibido(reuniao));
  }, [reuniao]);

  const salvar = async () => {
    if (!reuniao) return;
    const novo = nome.replace(/\s+/g, " ").trim();
    if (!novo) { toast.error("Dê um nome para a reunião"); return; }
    if (novo === tituloExibido(reuniao)) { onClose(); return; }
    setSalvando(true);
    try {
      await onSalvar(reuniao, novo);
      onClose();
    } catch (e) {
      toast.error(mensagemErroFireflies(e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={!!reuniao} onOpenChange={(o) => { if (!o && !salvando) onClose(); }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Renomear reunião</DialogTitle>
          <DialogDescription>O nome muda aqui na hora e no Fireflies em até 1 minuto (os arquivos são gerados de novo com ele).</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); salvar(); }}>
          <div className="space-y-2">
            <Label htmlFor="fireflies-nome">Nome</Label>
            <Input id="fireflies-nome" autoFocus maxLength={200} value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
            <Button type="submit" disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
