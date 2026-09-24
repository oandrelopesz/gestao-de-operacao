import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  Layers,
  Loader2,
  MoreHorizontal,
  Pencil,
  Save,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { diasDeAtraso, formatarDataCurta, hojeBrasilia } from "@/lib/entrega";
import { previsaoTermino, progresso } from "@/lib/processos";
import {
  aplicarTemplate,
  atualizarProcesso,
  encerrarProcesso,
  salvarComoTemplate,
  type Processo,
  type RoadmapLigado,
} from "@/lib/processosService";
import { Trilha } from "./Trilha";
import { EscolherTemplateDialog } from "./EscolherTemplateDialog";
import { ConcluirOnboardingDialog, dataBrasilia } from "./ConcluirOnboardingDialog";

interface ProcessoCardProps {
  processo: Processo;
  roadmaps: RoadmapLigado[];
  /** Destaca o card (vindo de ?cliente= / ?id=). */
  destaque?: boolean;
  /** Bloco à direita do cabeçalho: verba (onboarding) ou prazo final (roadmap). */
  extraCabecalho?: React.ReactNode;
  /** Itens extras do menu ⋯ (DropdownMenuItem). */
  acoesMenu?: React.ReactNode;
  onMudou: () => void;
  onAbrirRoadmap?: (id: string) => void;
}

const erroMsg = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as any).message) : "Erro ao salvar");

/** Card largo de um processo (onboarding ou roadmap): cabeçalho com progresso, trilha e menu de ações. */
export function ProcessoCard({ processo, roadmaps, destaque, extraCabecalho, acoesMenu, onMudou, onAbrirRoadmap }: ProcessoCardProps) {
  const [escolherTemplate, setEscolherTemplate] = useState(false);
  const [nomeDialog, setNomeDialog] = useState<"renomear" | "template" | null>(null);
  const [nome, setNome] = useState("");
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [confirmarEncerrar, setConfirmarEncerrar] = useState(false);
  const [encerrando, setEncerrando] = useState(false);
  const [concluirAberto, setConcluirAberto] = useState(false);

  const ehOnboarding = processo.tipo === "onboarding";
  const hoje = hojeBrasilia();
  const pct = progresso(processo.passos);
  const total = processo.passos.length;
  const feitos = processo.passos.filter((p) => p.concluido_em).length;
  const previsao = ehOnboarding ? previsaoTermino(processo.passos) : null;
  const atrasados = useMemo(
    () => processo.passos.filter((p) => !p.concluido_em && diasDeAtraso(p.data, hoje) > 0).length,
    [processo.passos, hoje],
  );
  const temConcluidos = feitos > 0;
  const tudoConcluido = ehOnboarding && total > 0 && pct === 100;
  const entrouEm = dataBrasilia((ehOnboarding ? processo.cliente?.onboarding_desde : null) ?? processo.iniciado_em);

  useEffect(() => {
    if (!nomeDialog) return;
    setNome(processo.nome || "");
  }, [nomeDialog, processo.nome]);

  const aplicar = async (templateId: string, modo: "substituir" | "acrescentar") => {
    try {
      await aplicarTemplate(processo.id, templateId, modo);
      toast.success(modo === "substituir" ? "Template aplicado" : "Passos do template acrescentados");
      onMudou();
    } catch (e) {
      toast.error(erroMsg(e));
      onMudou();
      throw e;
    }
  };

  const salvarNome = async () => {
    const limpo = nome.trim();
    if (!limpo || salvandoNome || !nomeDialog) return;
    setSalvandoNome(true);
    try {
      if (nomeDialog === "template") {
        await salvarComoTemplate(processo, limpo);
        toast.success(`Template "${limpo}" criado`);
      } else {
        await atualizarProcesso(processo.id, { nome: limpo });
        toast.success("Nome atualizado");
      }
      setNomeDialog(null);
      onMudou();
    } catch (e) {
      toast.error(erroMsg(e));
    } finally {
      setSalvandoNome(false);
    }
  };

  const encerrar = async () => {
    if (encerrando) return;
    setEncerrando(true);
    try {
      await encerrarProcesso(processo.id);
      if (ehOnboarding && processo.cliente_id) {
        const { error } = await supabase.from("clientes").update({ em_onboarding: false } as any).eq("id", processo.cliente_id);
        if (error) throw error;
      }
      toast.success(ehOnboarding ? `Onboarding de ${processo.cliente?.nome ?? "cliente"} encerrado` : "Roadmap encerrado");
      setConfirmarEncerrar(false);
      onMudou();
    } catch (e) {
      toast.error(erroMsg(e));
      onMudou();
    } finally {
      setEncerrando(false);
    }
  };

  return (
    <Card
      className={cn(
        "overflow-hidden transition-shadow duration-500",
        destaque && "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg",
      )}
    >
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 p-5 pb-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold tracking-tight">{processo.pessoal ? "Pessoal" : processo.cliente?.nome ?? "Cliente"}</h2>
            <Badge variant="secondary" className="gap-1 font-normal">
              <Layers size={11} /> {processo.nome || "Personalizado"}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarCheck2 size={13} /> {ehOnboarding ? "Entrou em" : "Início"} {formatarDataCurta(entrouEm)}
            </span>
            {ehOnboarding && (
              <span className="inline-flex items-center gap-1">
                <CalendarClock size={13} />
                {previsao ? <>Previsão de término {formatarDataCurta(previsao)}</> : "Sem previsão (passos sem data)"}
              </span>
            )}
            {atrasados > 0 && (
              <span className="inline-flex items-center gap-1 font-medium text-red-600 dark:text-red-400">
                <AlertTriangle size={13} /> {atrasados} {atrasados === 1 ? "atrasado" : "atrasados"}
              </span>
            )}
          </div>

          <div className="flex max-w-md items-center gap-3">
            <Progress
              value={pct}
              className="h-2 flex-1"
              indicatorClassName={cn(pct === 100 ? "bg-emerald-500" : atrasados > 0 ? "bg-amber-500" : "bg-primary")}
            />
            <span className="w-10 text-right text-sm font-semibold tabular-nums">{pct}%</span>
            <span className="hidden whitespace-nowrap text-xs text-muted-foreground sm:inline">
              {feitos} de {total} {total === 1 ? "passo" : "passos"}
            </span>
          </div>
        </div>

        <div className="flex items-start gap-2 md:shrink-0">
          {extraCabecalho}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Ações do processo">
                <MoreHorizontal size={18} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={() => setEscolherTemplate(true)}>
                <Layers size={14} className="mr-2" /> Aplicar template
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setNomeDialog("template")} disabled={total === 0}>
                <Save size={14} className="mr-2" /> Salvar como template
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setNomeDialog("renomear")}>
                <Pencil size={14} className="mr-2" /> Renomear
              </DropdownMenuItem>
              {acoesMenu}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setConfirmarEncerrar(true)}
                className="text-destructive focus:text-destructive"
              >
                <XCircle size={14} className="mr-2" /> Encerrar sem concluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Trilha */}
      <div className="px-3 pb-3">
        <Trilha processo={processo} roadmaps={roadmaps} onMudou={onMudou} onAbrirRoadmap={onAbrirRoadmap} />
      </div>

      {/* Tudo concluído */}
      {tudoConcluido && (
        <div className="flex flex-col gap-3 border-t border-emerald-500/20 bg-emerald-500/10 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 size={17} /> Todos os passos concluídos
          </div>
          <Button size="sm" className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-600/90" onClick={() => setConcluirAberto(true)}>
            <CheckCircle2 size={14} /> Concluir onboarding
          </Button>
        </div>
      )}

      <EscolherTemplateDialog
        aberto={escolherTemplate}
        tipo={processo.tipo}
        processoTemConcluidos={temConcluidos}
        onEscolher={aplicar}
        onClose={() => setEscolherTemplate(false)}
      />

      <Dialog open={nomeDialog !== null} onOpenChange={(o) => { if (!o && !salvandoNome) setNomeDialog(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{nomeDialog === "template" ? "Salvar como template" : "Renomear"}</DialogTitle>
            <DialogDescription>
              {nomeDialog === "template"
                ? `Os ${total} ${total === 1 ? "passo vira" : "passos viram"} um template reutilizável (sem as datas).`
                : "O nome aparece no card e no Histórico."}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); salvarNome(); } }}
            placeholder={nomeDialog === "template" ? "Nome do template" : "Nome do processo"}
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNomeDialog(null)} disabled={salvandoNome}>Cancelar</Button>
            <Button onClick={salvarNome} disabled={!nome.trim() || salvandoNome} className="gap-1.5">
              {salvandoNome && <Loader2 size={14} className="animate-spin" />}
              {nomeDialog === "template" ? "Salvar template" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmarEncerrar} onOpenChange={(o) => { if (!encerrando) setConfirmarEncerrar(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar sem concluir?</AlertDialogTitle>
            <AlertDialogDescription>
              {ehOnboarding
                ? "O cliente continua marcado como em onboarding? Não — ele sai da aba e o processo vai para o Histórico como encerrado."
                : "O roadmap sai da lista e vai para o Histórico como encerrado."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={encerrando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); encerrar(); }}
              disabled={encerrando}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {encerrando && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              Encerrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {ehOnboarding && (concluirAberto || tudoConcluido) && (
        <ConcluirOnboardingDialog
          aberto={concluirAberto}
          processo={processo}
          onClose={() => setConcluirAberto(false)}
          onMudou={onMudou}
        />
      )}
    </Card>
  );
}
