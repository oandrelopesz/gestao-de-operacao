import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Plus, List, Kanban as KanbanIcon, Search, MoreVertical, Pencil, Trash2, Repeat, Calendar as CalendarIcon, ChevronDown, ChevronUp, X, Check, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { DemandaForm, DemandaFormValues } from "@/components/DemandaForm";
import { KanbanColumn } from "@/components/KanbanColumn";
import { DemandaDrawer } from "@/components/demandas/DemandaDrawer";
import { EnviarParaRoadmapDialog } from "@/components/demandas/EnviarParaRoadmapDialog";
import { supabase } from "@/integrations/supabase/client";
import { useCachedState, hasCached } from "@/lib/pageCache";
import { CACHE_KEYS, loadDemandas, loadClientesLite, loadColunas } from "@/lib/data";
import { toast } from "sonner";
import { useAgencias } from "@/lib/agencias";
import { useSensoresArrastar } from "@/lib/arrastar";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  closestCenter,
  pointerWithin,
  CollisionDetection,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  defaultDropAnimationSideEffects,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { KanbanCardView } from "@/components/KanbanCard";
import { useKanbanDnd } from "@/lib/useKanbanDnd";
import { cn } from "@/lib/utils";
import { KanbanColumnDef, COLUMN_COLORS, slugifyColumnId, RegraData } from "@/lib/demandaColunas";
import { RegraDataCampos } from "@/components/demandas/RegraDataCampos";
import { msAteProximaVirada } from "@/lib/viradaDia";
import { hojeBrasilia, siglaDoDia } from "@/lib/entrega";
import { somarDias } from "@/lib/recorrencia";
import {
  mapaDias as montarMapaDias,
  containerIdsDoQuadro,
  containerDe,
  aplicarContainer,
  moverParaDia,
  camposParaSalvar,
  parseSecao,
  secaoId,
  NOMES_DIA,
  moverVariosPara,
  ordenarPeloQuadro,
} from "@/lib/colunasDias";
import { ehEsquemaDesatualizado, recarregarUmaVez } from "@/lib/recuperacaoErro";
import { EscolherDiaDialog } from "@/components/EscolherDiaDialog";
import { SelecaoBarra } from "@/components/demandas/SelecaoBarra";
import { montarCopiaDemanda, colunaDaCopia, proximaOrdem } from "@/lib/demandaCopia";
import { useBusca } from "@/lib/useBusca";
import { MensagemBusca } from "@/components/MensagemBusca";

type ColumnDialogState =
  | { mode: "create"; title: string; hex: string; regra: RegraData; dias: number[] }
  | { mode: "rename"; id: string; title: string; hex: string; regra: RegraData; dias: number[] };

type ColumnConfirmState = { type: "clear" | "delete"; column: KanbanColumnDef };

export const Route = createFileRoute("/_authenticated/")({
  component: DemandasPage,
});

function DemandasPage() {
  const { label: agenciaLabelOf } = useAgencias();
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clientes, setClientes] = useCachedState<{ id: string; nome: string; agencia: string }[]>(CACHE_KEYS.clientesLite, []);
  const [demandas, setDemandas] = useCachedState<any[]>(CACHE_KEYS.demandas, []);
  const [activeDemanda, setActiveDemanda] = useState<any | null>(null);
  const [editingDemanda, setEditingDemanda] = useState<any | null>(null);
  const [columns, setColumns] = useCachedState<KanbanColumnDef[]>(CACHE_KEYS.colunas, []);
  // Ref para handlers registrados uma vez (atalho "n") enxergarem as colunas atuais
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const [columnDialog, setColumnDialog] = useState<ColumnDialogState | null>(null);
  const [columnConfirm, setColumnConfirm] = useState<ColumnConfirmState | null>(null);
  const [columnSaving, setColumnSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState<string>("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedDemanda, setSelectedDemanda] = useState<any | null>(null);
  // Demanda em "Enviar para o Roadmap" (diálogo aberto quando não é null)
  const [enviarRoadmap, setEnviarRoadmap] = useState<any | null>(null);
  const [showCalendar, setShowCalendar] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = window.localStorage.getItem("demandas_calendar_visible");
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [calendarMode, setCalendarMode] = useState<"7days" | "30days">("7days");
  const [popoverConfig, setPopoverConfig] = useState<{ id: string; x: number; y: number } | null>(null);

  const toggleCalendar = () => {
    setShowCalendar((prev: boolean) => {
      localStorage.setItem("demandas_calendar_visible", JSON.stringify(!prev));
      return !prev;
    });
  };

  const sensors = useSensoresArrastar(3, sortableKeyboardCoordinates);

  useEffect(() => {
    fetchColumns();
    fetchClientes();
    fetchDemandas();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "n" && !isModalOpen && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        openNewDemanda();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // A virada do dia (00:00, no banco) muda as colunas: recarrega depois dela e quando a aba volta
  // a aparecer (em aba escondida o navegador congela o timer)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const agendar = () => {
      timer = setTimeout(() => { fetchDemandas(); agendar(); }, msAteProximaVirada(new Date()));
    };
    const aoVoltar = () => { if (document.visibilityState === "visible") fetchDemandas(); };
    agendar();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", aoVoltar); };
  }, []);

  const fetchClientes = async () => {
    try {
      setClientes(await loadClientesLite());
    } catch (error) {
      console.error("Erro ao buscar clientes:", error);
    }
  };

  // Removido catchUpRecorrentes para evitar materialização automática em Fazer Hoje

  const fetchColumns = async () => {
    setColumns(await loadColunas());
  };

  const handleSaveColumn = async () => {
    if (!columnDialog) return;
    const title = columnDialog.title.trim();
    if (!title) {
      toast.error("Informe o nome da coluna");
      return;
    }
    if (columnDialog.regra === "dias_semana" && columnDialog.dias.length === 0) {
      toast.error("Marque pelo menos um dia");
      return;
    }
    setColumnSaving(true);
    try {
      if (columnDialog.mode === "rename") {
        const { error } = await supabase
          .from("demanda_colunas")
          .update({ titulo: title, hex: columnDialog.hex, regra_data: columnDialog.regra, dias_semana: columnDialog.dias })
          .eq("id", columnDialog.id);
        if (error) throw error;
        toast.success("Coluna atualizada");
      } else {
        // Nova coluna entra antes de "Feito" (última coluna de sistema), se existir
        const feitoIdx = columns.findIndex((c) => c.id === "feito");
        const ordem = feitoIdx >= 0 ? feitoIdx : columns.length;
        const { error } = await supabase
          .from("demanda_colunas")
          .insert([{ id: slugifyColumnId(title), titulo: title, hex: columnDialog.hex, ordem, regra_data: columnDialog.regra, dias_semana: columnDialog.dias }]);
        if (error) throw error;
        // Empurra as colunas seguintes para manter a ordem consistente
        await Promise.all(
          columns.slice(ordem).map((c, i) =>
            supabase.from("demanda_colunas").update({ ordem: ordem + 1 + i }).eq("id", c.id)
          )
        );
        toast.success("Coluna criada");
      }
      setColumnDialog(null);
      fetchColumns();
      fetchDemandas();
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar coluna");
    } finally {
      setColumnSaving(false);
    }
  };

  const handleConfirmColumnAction = async () => {
    if (!columnConfirm) return;
    const { type, column } = columnConfirm;
    setColumnSaving(true);
    try {
      if (type === "clear") {
        const { error } = await supabase.from("demandas").delete().eq("status", column.id);
        if (error) throw error;
        toast.success(`Coluna "${column.title}" zerada`);
      } else {
        if (column.sistema) throw new Error("Esta coluna não pode ser excluída");
        // Remove as demandas primeiro (o FK também faria em cascata, mas assim fica explícito)
        const { error: delDemandas } = await supabase.from("demandas").delete().eq("status", column.id);
        if (delDemandas) throw delDemandas;
        const { error } = await supabase.from("demanda_colunas").delete().eq("id", column.id);
        if (error) throw error;
        toast.success(`Coluna "${column.title}" excluída`);
      }
      setColumnConfirm(null);
      fetchColumns();
      fetchDemandas();
    } catch (error: any) {
      toast.error(error.message || "Erro ao executar ação");
    } finally {
      setColumnSaving(false);
    }
  };

  const fetchDemandas = async () => {
    try {
      setDemandas(await loadDemandas());
    } catch (error) {
      console.error("Erro ao buscar demandas:", error);
    }
  };

  const openNewDemanda = (status?: string) => {
    // Coluna padrão: "fazer_hoje" se existir; senão a primeira coluna não fixa (ou a primeira)
    const cols = columnsRef.current;
    const fallback = cols.find((c) => c.id === "fazer_hoje")?.id ?? cols.find((c) => !c.sistema)?.id ?? cols[0]?.id ?? "fazer_hoje";
    setEditingDemanda({ status: status || fallback });
    setIsModalOpen(true);
  };

  const handleCreateOrUpdateDemanda = async (values: DemandaFormValues) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || 'b34bdae5-7a67-4b63-a46f-8aad43a06c63';

      // Sanitize values
      const sanitizedValues: any = { ...values };
      if (sanitizedValues.cliente_id === "" || sanitizedValues.cliente_id === "none") {
        sanitizedValues.cliente_id = null;
      }
      if (sanitizedValues.prazo === "") {
        sanitizedValues.prazo = null;
      }
      if (sanitizedValues.frequencia_dia_mes === "") {
        sanitizedValues.frequencia_dia_mes = null;
      }
      if (sanitizedValues.frequencia_intervalo_dias === "" || isNaN(sanitizedValues.frequencia_intervalo_dias)) {
        sanitizedValues.frequencia_intervalo_dias = null;
      }
      const diasCol = mapa[sanitizedValues.status];
      sanitizedValues.dia_semana = diasCol?.length
        ? (diasCol.includes(editingDemanda?.dia_semana) ? editingDemanda.dia_semana : diasCol[0])
        : null;

      if (editingDemanda?.id) {
        const { error } = await supabase
          .from("demandas")
          .update(sanitizedValues)
          .eq("id", editingDemanda.id);
        if (error) throw error;
        toast.success("Demanda atualizada!");
      } else {
        const columnDemandas = demandas.filter(d => d.status === sanitizedValues.status);
        const maxOrder = columnDemandas.length > 0 ? Math.max(...columnDemandas.map(d => d.ordem || 0)) : -1;
        
        const { error } = await supabase.from("demandas").insert([{
          ...sanitizedValues,
          user_id: userId,
          ordem: maxOrder + 1
        }]);
        if (error) throw error;
        toast.success("Demanda criada!");
      }

      setIsModalOpen(false);
      setEditingDemanda(null);
      fetchDemandas();
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar demanda");
    } finally {
      setLoading(false);
    }
  };

  /** Devolve true se salvou (erros já viram toast). */
  const handleUpdateDemanda = async (id: string, values: any): Promise<boolean> => {
    try {
      // Devolve a linha atualizada: gatilhos do banco podem recalcular prazo/dia_semana (ex.: ao
      // mudar o status pelo menu "Mover para"), e o join com clientes mantém nome/agência em dia
      // no painel e no card quando o cliente muda.
      const { data, error } = await supabase
        .from("demandas")
        .update(values)
        .eq("id", id)
        .select("*, clientes(nome, agencia)")
        .single();
      if (error) throw error;

      setDemandas((prev: any[]) => prev.map(d => d.id === id ? { ...d, ...data } : d));
      if (selectedDemanda?.id === id) {
        setSelectedDemanda((prev: any) => ({ ...prev, ...data }));
      }

      // Silently sync
      fetchDemandas();
      return true;
    } catch (error: any) {
      if (ehEsquemaDesatualizado(error) && recarregarUmaVez()) return false;
      toast.error("Erro ao salvar alterações");
      return false;
    }
  };

  const handleDesligarRoadmap = async (id: string) => {
    if (await handleUpdateDemanda(id, { roadmap_id: null })) toast.success("Demanda desligada do roadmap");
  };

  const handleDuplicateDemanda = async (demanda: any) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || 'b34bdae5-7a67-4b63-a46f-8aad43a06c63';


      // Concluída (Feito) volta como cópia no Standby, sem entrega; as outras ficam na mesma coluna.
      // A cópia entra no fim da coluna de destino e não repete o passo de onboarding (UNIQUE).
      const destino = colunaDaCopia(demanda.status);
      if (!columns.some((c) => c.id === destino)) {
        toast.error(
          demanda.status === "feito"
            ? "A coluna Standby não existe mais. Recrie a coluna para duplicar uma demanda concluída."
            : "A coluna de destino não existe mais. Recarregue a página.",
        );
        return;
      }
      const copia = montarCopiaDemanda(demanda, proximaOrdem(demandas, destino));

      const { error } = await supabase.from("demandas").insert([{
        ...copia,
        user_id: userId,
      }]);

      if (error) throw error;
      // A cópia de uma demanda concluída vai para outra coluna (Standby): o aviso diz onde ela foi parar
      toast.success(destino !== demanda.status ? "Cópia criada no Standby." : "Demanda duplicada!");
      fetchDemandas();
    } catch (error: any) {
      toast.error("Erro ao duplicar demanda");
    }
  };

  const handleOpenDrawer = (demanda: any) => {
    setSelectedDemanda(demanda);
    setIsDrawerOpen(true);
  };

  const handleQuickAdd = async (status: string, titulo: string, event?: React.MouseEvent | React.TouchEvent) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || 'b34bdae5-7a67-4b63-a46f-8aad43a06c63';


      const columnDemandas = demandas.filter(d => d.status === status);
      const maxOrder = columnDemandas.length > 0 ? Math.max(...columnDemandas.map(d => d.ordem || 0)) : -1;

      const isRecorrente = status === "recorrentes";

      const { data, error } = await supabase.from("demandas").insert([{
        titulo,
        status: status as any,
        user_id: userId,
        cliente_id: null,
        prioridade: "media" as const,
        ordem: maxOrder + 1,
        recorrente: isRecorrente
      }]).select().single();

      if (error) throw error;
      
      // Optimistic update
      setDemandas(prev => [...prev, data]);
      
      if (isRecorrente && event) {
        setPopoverConfig({
          id: data.id,
          x: (event as any).clientX || 200,
          y: (event as any).clientY || 200
        });
      }

      // Silently fetch to sync relationships
      fetchDemandas();
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar demanda");
    }
  };

  const handleDeleteDemanda = async () => {
    if (!deletingId) return;
    try {
      const { error } = await supabase.from("demandas").delete().eq("id", deletingId);
      if (error) throw error;
      toast.success("Demanda deletada!");
      fetchDemandas();
    } catch (error: any) {
      toast.error(error.message || "Erro ao deletar");
    } finally {
      setDeletingId(null);
    }
  };

  const handleCompleteExecution = async (id: string) => {
    try {
      // Dia de Brasília: depois das 21h o UTC já está no dia seguinte
      const today = hojeBrasilia();
      
      // Registrar no histórico
      const { error: execError } = await supabase
        .from("demanda_execucoes")
        .insert([{ demanda_id: id, data_execucao: today }]);
      
      if (execError) throw execError;

      const demanda = demandas.find(d => d.id === id);
      if (demanda?.recorrente) {
        // Recalcular próxima execução
        const { data: proximaData } = await supabase.rpc('calcular_proxima_execucao', {
            p_tipo: demanda.frequencia_tipo,
            p_dias_semana: demanda.frequencia_dias_semana,
            p_dia_mes: demanda.frequencia_dia_mes,
            p_intervalo_dias: demanda.frequencia_intervalo_dias,
            p_ultima_execucao: today,
            p_data_referencia: today
        });

        const { error: updateError } = await supabase
            .from("demandas")
            .update({ 
                ultima_execucao: today,
                proxima_execucao: proximaData
            })
            .eq("id", id);
        
        if (updateError) throw updateError;
      } else {
        const { error } = await supabase
            .from("demandas")
            .update({ ultima_execucao: today })
            .eq("id", id);
        if (error) throw error;
      }

      toast.success("Execução registrada!");
      fetchDemandas();
    } catch (error: any) {
      toast.error("Erro ao registrar execução");
    }
  };

  // Busca tolerante (sem acento, com erro de digitação): só filtra, os cards seguem a ordem das colunas
  const resultadoBusca = useBusca(
    demandas,
    searchQuery,
    (d) => [d.titulo, d.clientes?.nome, d.pessoal ? "Pessoal" : null],
    { manterOrdem: true },
  );
  const filteredDemandas = resultadoBusca.itens;

  // Drag and Drop Logic
  const byOrdem = (a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0);

  // Estado do quadro antes do arrasto: se o popup de dia for cancelado, volta para ele
  const antesDoArrastoRef = useRef<any[]>([]);
  const [escolhaDia, setEscolhaDia] = useState<{ id: string; origem: string; coluna: string; sugerido: number } | null>(null);
  const mapa = useMemo(() => montarMapaDias(columns), [columns]);
  const containerIds = useMemo(() => containerIdsDoQuadro(columns), [columns]);
  const getContainer = useCallback((d: any) => containerDe(d, mapa), [mapa]);

  /**
   * Persiste status + ordem + dia dos cards que estão nos containers informados.
   * O gatilho do banco recalcula `prazo` (e normaliza `dia_semana`) a partir da coluna/dia
   * salvos; por isso cada update devolve a linha e o retorno é mesclado no estado, senão o
   * card continua mostrando a entrega antiga até o próximo fetch.
   */
  const salvarContainers = async (lista: any[], containers: string[]) => {
    const afetados = new Set(containers);
    try {
      const results = await Promise.all(
        lista
          .filter((d) => afetados.has(getContainer(d)))
          .map((d) =>
            supabase
              .from("demandas")
              .update(camposParaSalvar(d, mapa) as any)
              .eq("id", d.id)
              .select("id, prazo, dia_semana")
              .single()
          )
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
      const atualizados = new Map(results.map((r) => [r.data!.id, r.data!]));
      setDemandas((prev: any[]) => prev.map((d) => (atualizados.has(d.id) ? { ...d, ...atualizados.get(d.id) } : d)));
    } catch (erro) {
      // Aba aberta numa versão anterior do site depois de mudança no banco: recarrega sozinha
      if (ehEsquemaDesatualizado(erro) && recarregarUmaVez()) return;
      toast.error("Erro ao sincronizar movimento");
      fetchDemandas();
    }
  };

  // Drag-and-drop do Kanban (mover entre colunas e reordenar) - ver src/lib/useKanbanDnd.ts.
  // Colunas por dias da semana viram várias seções (uma por dia) - ver src/lib/colunasDias.ts
  const { collisionDetection, measuring, autoScroll, onDragStart, onDragOver, onDragEnd, onDragCancel } = useKanbanDnd<any>({
    items: demandas,
    setItems: setDemandas,
    containerIds,
    getContainer,
    setContainer: aplicarContainer,
    // Cards recorrentes (mãe) ficam travados e nada entra na coluna deles via drag
    isItemLocked: (d) => d.status === "recorrentes",
    isContainerLocked: (id) => id === "recorrentes",
    onStart: (d) => {
      antesDoArrastoRef.current = demandas;
      setActiveDemanda(d);
    },
    onCancel: () => setActiveDemanda(null),
    onDrop: async (finalList, activeId, origin, target) => {
      setActiveDemanda(null);
      // Arrastou um card selecionado: o grupo todo vai junto, logo depois dele (na seção em que caiu)
      if (selecionadas.has(activeId) && selecionadas.size > 1) {
        const ids = idsSelecionados(antesDoArrastoRef.current).filter((id) => id !== activeId);
        if (ids.length) {
          await moverGrupo(finalList, ids, target, activeId, origin);
          return;
        }
      }
      // Entrou numa coluna por dias vinda de outra coluna: pergunta o dia antes de salvar
      // (a menos que a coluna só tenha um dia possível — o card já caiu na seção certa)
      const alvo = parseSecao(target);
      if (alvo && parseSecao(origin)?.coluna !== alvo.coluna && (mapa[alvo.coluna]?.length ?? 0) > 1) {
        setEscolhaDia({ id: activeId, origem: origin, coluna: alvo.coluna, sugerido: alvo.dia });
        return;
      }
      await salvarContainers(finalList, [origin, target]);
    },
  });

  const escolherDia = async (dia: number) => {
    if (!escolhaDia) return;
    const lista = moverParaDia(demandas, escolhaDia.id, dia, mapa);
    setDemandas(lista);
    setEscolhaDia(null);
    await salvarContainers(lista, [escolhaDia.origem, ...(mapa[escolhaDia.coluna] ?? []).map((d) => secaoId(escolhaDia.coluna, d))]);
  };

  const cancelarEscolhaDia = () => {
    setDemandas(antesDoArrastoRef.current);
    setEscolhaDia(null);
  };

  // ---------------------------------------------------------------- Seleção em massa
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [modoSelecao, setModoSelecao] = useState(false);
  const [salvandoMassa, setSalvandoMassa] = useState(false);
  const alternarSelecao = useCallback((id: string) => {
    setSelecionadas((prev) => {
      const nova = new Set(prev);
      if (nova.has(id)) nova.delete(id); else nova.add(id);
      return nova;
    });
  }, []);
  const limparSelecao = useCallback(() => { setSelecionadas(new Set()); setModoSelecao(false); }, []);
  const selecaoAtiva = modoSelecao || selecionadas.size > 0;

  // Esc sai da seleção (se nenhum diálogo estiver aberto por cima)
  useEffect(() => {
    if (!selecaoAtiva) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[role="dialog"], [role="alertdialog"]')) limparSelecao();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [selecaoAtiva, limparSelecao]);

  /** Ids selecionados que ainda existem, na ordem em que aparecem no quadro (recorrentes ficam de fora). */
  const idsSelecionados = (lista: any[] = demandas) =>
    ordenarPeloQuadro(lista.filter((d) => selecionadas.has(d.id) && d.status !== "recorrentes"), [...selecionadas], containerIds, mapa);

  // "Selecionar todas": as abertas que aparecem no quadro (sem recorrentes nem concluídas)
  const selecionaveis = useMemo(
    () => filteredDemandas.filter((d) => d.status !== "recorrentes" && d.status !== "feito"),
    [filteredDemandas],
  );

  /** Move o grupo para o destino e renumera as colunas de onde saiu; `depoisDe` = card solto no arrasto. */
  const moverGrupo = async (base: any[], ids: string[], destino: string, depoisDe?: string, origemExtra?: string) => {
    const porId = new Map(base.map((d) => [d.id, d]));
    const afetados = new Set([destino, ...ids.map((id) => getContainer(porId.get(id))), ...(origemExtra ? [origemExtra] : [])]);
    const lista = moverVariosPara(base, ids, destino, mapa, depoisDe);
    setDemandas(lista);
    await salvarContainers(lista, [...afetados]);
  };

  const moverSelecionadas = async (destino: string, rotulo: string) => {
    const ids = idsSelecionados();
    if (!ids.length) return;
    setSalvandoMassa(true);
    try {
      await moverGrupo(demandas, ids, destino);
      toast.success(`${ids.length} ${ids.length === 1 ? "demanda movida" : "demandas movidas"} para ${rotulo}`);
      limparSelecao();
    } finally {
      setSalvandoMassa(false);
    }
  };

  const concluirSelecionadas = async () => {
    const feito = columns.find((c) => c.id === "feito");
    await moverSelecionadas("feito", feito?.title ?? "Feito");
  };

  /** Mesmos campos em várias demandas de uma vez (cliente, entrega). Devolve quantas mudaram. */
  const atualizarSelecionadas = async (campos: Record<string, unknown>, filtro: (d: any) => boolean = () => true) => {
    const ids = idsSelecionados().filter((id) => filtro(demandas.find((d) => d.id === id)));
    if (!ids.length) return 0;
    setSalvandoMassa(true);
    try {
      const { error } = await supabase.from("demandas").update(campos as any).in("id", ids);
      if (error) throw error;
      await fetchDemandas();
      return ids.length;
    } catch (erro) {
      if (ehEsquemaDesatualizado(erro) && recarregarUmaVez()) return 0;
      toast.error("Erro ao salvar nas demandas selecionadas");
      return 0;
    } finally {
      setSalvandoMassa(false);
    }
  };

  const clienteSelecionadas = async (valor: { cliente_id: string | null; pessoal: boolean }) => {
    // Cards de passo de onboarding ficam com o cliente do onboarding
    const total = idsSelecionados().length;
    const n = await atualizarSelecionadas(valor, (d) => !d?.processo_passo_id);
    if (!n) {
      if (total) toast.info("As selecionadas são de onboarding: o cliente vem do passo");
      return;
    }
    const nome = valor.pessoal ? "Pessoal" : valor.cliente_id ? clientes.find((c) => c.id === valor.cliente_id)?.nome ?? "cliente" : "sem cliente";
    toast.success(`${n} ${n === 1 ? "demanda" : "demandas"} → ${nome}${total > n ? ` (${total - n} de onboarding mantidas)` : ""}`);
  };

  const entregaSelecionadas = async (prazo: string | null) => {
    const n = await atualizarSelecionadas({ prazo });
    if (!n) return;
    const qtd = `${n} ${n === 1 ? "demanda" : "demandas"}`;
    toast.success(prazo ? `Entrega ${prazo.split("-").reverse().slice(0, 2).join("/")} em ${qtd}` : `Entrega removida de ${qtd}`);
  };

  const mudarDia = async (id: string, dia: number) => {
    const card = demandas.find((d) => d.id === id);
    if (!card) return;
    const lista = moverParaDia(demandas, id, dia, mapa);
    if (lista === demandas) return;
    setDemandas(lista);
    await salvarContainers(lista, (mapa[card.status] ?? []).map((d) => secaoId(card.status, d)));
  };

  return (
    <div className="space-y-4 flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight">Demandas</h1>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 text-xs text-zinc-500 gap-1.5" 
            onClick={toggleCalendar}
          >
            <CalendarIcon size={14} />
            {showCalendar ? "Ocultar Calendário" : "Mostrar Calendário"}
            {showCalendar ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </Button>
        </div>
        
        <div className="flex items-center gap-2">
            <Tabs value={view} onValueChange={(v) => setView(v as any)} className="h-8">
            <TabsList className="h-8 p-0.5">
                <TabsTrigger value="kanban" className="gap-1.5 text-xs px-2 h-7">
                <KanbanIcon size={12} />
                Board
                </TabsTrigger>
                <TabsTrigger value="list" className="gap-1.5 text-xs px-2 h-7">
                <List size={12} />
                Lista
                </TabsTrigger>
            </TabsList>
            </Tabs>
            <Button size="sm" className="gap-1.5 text-xs h-8" onClick={() => openNewDemanda()}>
                <Plus size={14} />
                Nova
            </Button>
        </div>
      </div>

      {showCalendar && (
        <div className="bg-zinc-50/50 dark:bg-zinc-900/50 rounded-lg p-3 border animate-in slide-in-from-top duration-300">
           {/* Calendário será implementado em componente separado ou inline */}
           <div className="flex items-center justify-between mb-3">
             <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Previsão de Recorrências</div>
             <div className="flex items-center gap-1 bg-zinc-200/50 dark:bg-zinc-800/50 p-0.5 rounded-md">
                <Button 
                  variant={calendarMode === "7days" ? "secondary" : "ghost"} 
                  size="sm" 
                  className="h-6 text-[10px] px-2"
                  onClick={() => setCalendarMode("7days")}
                >7 dias</Button>
                <Button 
                  variant={calendarMode === "30days" ? "secondary" : "ghost"} 
                  size="sm" 
                  className="h-6 text-[10px] px-2"
                  onClick={() => setCalendarMode("30days")}
                >30 dias</Button>
             </div>
           </div>
           <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {Array.from({ length: calendarMode === "7days" ? 7 : 30 }).map((_, i) => {
                // Dias contados a partir de hoje em Brasília: o servidor (UTC) e o navegador desenham os mesmos dias
                const dia = somarDias(hojeBrasilia(), i);
                const isToday = i === 0;
                const dayName = siglaDoDia(dia);
                const dayNum = Number(dia.slice(8, 10));
                
                return (
                  <div 
                    key={i} 
                    className={cn(
                      "flex-1 min-w-[100px] max-w-[150px] p-2 rounded-md border border-dashed flex flex-col gap-1.5",
                      isToday ? "bg-primary/5 border-primary/20" : "bg-white/50 dark:bg-zinc-950/50 border-zinc-200 dark:border-zinc-800"
                    )}
                  >
                    <div className="flex items-baseline gap-1">
                      <span className="text-[10px] font-bold text-zinc-400">{dayName}</span>
                      <span className={cn("text-xs font-bold", isToday ? "text-primary" : "text-zinc-600 dark:text-zinc-400")}>{dayNum}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      {demandas.filter(d => d.recorrente && d.proxima_execucao === dia).slice(0, 3).map(d => (
                        <div key={d.id} className="text-[9px] bg-white dark:bg-zinc-900 border rounded px-1 py-0.5 truncate cursor-pointer hover:border-primary transition-colors" onClick={() => handleOpenDrawer(d)}>
                          {d.titulo}
                        </div>
                      ))}
                      {demandas.filter(d => d.recorrente && d.proxima_execucao === dia).length > 3 && (
                        <div className="text-[8px] text-zinc-400 text-center">
                          + {demandas.filter(d => d.recorrente && d.proxima_execucao === dia).length - 3} mais
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
           </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <div className="relative w-full max-w-[200px]">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            className="pl-7 h-8 text-xs"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {view === "kanban" && (
          <Button
            size="sm"
            variant={selecaoAtiva ? "default" : "outline"}
            className="h-8 gap-1.5 text-xs"
            onClick={() => (selecaoAtiva ? limparSelecao() : setModoSelecao(true))}
            title="Selecionar várias demandas para mover, concluir, atribuir cliente ou data de entrega"
          >
            <CheckSquare size={13} /> {selecaoAtiva ? "Sair da seleção" : "Selecionar"}
          </Button>
        )}
      </div>

      {/* Na lista, "nenhum resultado" aparece no lugar da lista (estado vazio abaixo) */}
      {(resultadoBusca.modo === "parecidos" || (view === "kanban" && resultadoBusca.modo === "nenhum" && demandas.length > 0)) && (
        <MensagemBusca resultado={resultadoBusca} className="shrink-0" />
      )}

      <div className="flex-1 min-h-0 overflow-hidden">
        {view === "kanban" ? (
          <div className={cn("h-full overflow-x-auto pb-4", selecaoAtiva && "pb-20")}>
            <DndContext
              sensors={sensors}
              collisionDetection={collisionDetection}
              measuring={measuring}
              autoScroll={autoScroll}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragEnd={onDragEnd}
              onDragCancel={onDragCancel}
            >
              <div className="flex gap-4 h-full min-w-max pb-4">
                {columns.map((col) => {
                  const cards = filteredDemandas.filter((d) => d.status === col.id).sort(byOrdem);
                  const secoes = col.dias.length
                    ? col.dias.map((dia) => ({ id: secaoId(col.id, dia), titulo: NOMES_DIA[dia], demandas: cards.filter((d) => getContainer(d) === secaoId(col.id, dia)) }))
                    : undefined;
                  return (
                  <KanbanColumn
                    key={col.id}
                    id={col.id}
                    title={col.title}
                    color={col.color}
                    hex={col.hex}
                    isSystem={col.sistema}
                    onRenameColumn={() => setColumnDialog({ mode: "rename", id: col.id, title: col.title, hex: col.hex, regra: col.regra, dias: col.dias })}
                    onClearColumn={() => setColumnConfirm({ type: "clear", column: col })}
                    onDeleteColumn={() => setColumnConfirm({ type: "delete", column: col })}
                    demandas={cards}
                    secoes={secoes}
                    diasDaColuna={col.dias}
                    onSetDia={mudarDia}
                    onAtribuirCliente={(id, valor) => handleUpdateDemanda(id, valor)}
                    onEnviarRoadmap={setEnviarRoadmap}
                    onDesligarRoadmap={handleDesligarRoadmap}
                    onDuplicate={handleDuplicateDemanda}
                    clientes={clientes}
                    selecionadas={selecionadas}
                    modoSelecao={modoSelecao}
                    onAlternarSelecao={alternarSelecao}
                    onQuickAdd={handleQuickAdd}
                    onFullAdd={(status) => {
                      setEditingDemanda({ status });
                      setIsModalOpen(true);
                    }}
                    onEdit={handleOpenDrawer}
                    onDelete={async (id) => {
                      try {
                        const { error } = await supabase.from("demandas").delete().eq("id", id);
                        if (error) throw error;
                        toast.success("Demanda deletada!");
                        fetchDemandas();
                      } catch (error: any) {
                        toast.error(error.message || "Erro ao deletar");
                      }
                    }}
                    onComplete={handleCompleteExecution}
                    onMoveToDone={async (id) => {
                      try {
                        const { error } = await supabase
                          .from("demandas")
                          .update({ status: "feito" as any })
                          .eq("id", id);
                        if (error) throw error;
                        fetchDemandas();
                      } catch (err) {
                        toast.error("Erro ao mover para concluído");
                      }
                    }}
                  />
                  );
                })}

                <button
                  type="button"
                  onClick={() => setColumnDialog({ mode: "create", title: "", hex: COLUMN_COLORS[columns.length % COLUMN_COLORS.length], regra: "nenhuma", dias: [] })}
                  className="flex flex-col items-center justify-center gap-2 w-[200px] shrink-0 h-full max-h-[160px] rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors text-sm"
                  title="Nova coluna"
                >
                  <Plus size={20} />
                  Nova coluna
                </button>
              </div>

              <DragOverlay dropAnimation={{
                  duration: 150,
                  sideEffects: defaultDropAnimationSideEffects({
                    styles: {
                      active: {
                        opacity: "0.5",
                      },
                    },
                  }),
                }}>
                {activeDemanda ? (
                  <KanbanCardView
                    demanda={activeDemanda}
                    onEdit={() => {}}
                    onDelete={() => {}}
                    diasDaColuna={columns.find((c) => c.id === activeDemanda.status)?.dias}
                    selecionada={selecionadas.has(activeDemanda.id)}
                    qtdNoArrasto={selecionadas.has(activeDemanda.id) ? idsSelecionados().length : 0}
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
            {selecaoAtiva && (
              <SelecaoBarra
                qtd={idsSelecionados().length}
                qtdSelecionaveis={selecionaveis.length}
                colunas={columns}
                clientes={clientes}
                ocupado={salvandoMassa}
                onMover={moverSelecionadas}
                onConcluir={concluirSelecionadas}
                onCliente={clienteSelecionadas}
                onEntrega={entregaSelecionadas}
                onSelecionarTodas={() => setSelecionadas(new Set(selecionaveis.map((d) => d.id)))}
                onLimpar={limparSelecao}
              />
            )}
          </div>
        ) : (
          <div className="overflow-y-auto h-full border rounded-lg bg-card">
              {/* List view placeholder */}
              {filteredDemandas.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-20 text-muted-foreground">
                      <List size={40} className="mb-4 opacity-20" />
                      {resultadoBusca.modo === "nenhum" && demandas.length > 0 ? <MensagemBusca resultado={resultadoBusca} /> : <p>Nenhuma demanda encontrada.</p>}
                  </div>
              ) : (
                <div className="divide-y">
                    {filteredDemandas.map(d => (
                        <div key={d.id} className="p-4 flex items-center justify-between hover:bg-muted/50 cursor-pointer" onClick={() => handleOpenDrawer(d)}>
                            <div className="flex items-center gap-3">
                                <div className={`w-2 h-2 rounded-full ${d.status === 'feito' ? 'bg-emerald-500' : 'bg-primary'}`} />
                                <div>
                                    <h4 className={`font-medium ${d.status === 'feito' ? 'line-through text-muted-foreground' : ''}`}>
                                        {d.titulo}
                                    </h4>
                                    <p className="text-xs text-muted-foreground">
                                        {d.clientes?.nome} — {agenciaLabelOf(d.clientes?.agencia)} • {columns.find(c => c.id === d.status)?.title}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button variant="ghost" size="icon" onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenDrawer(d);
                                }}>
                                    <Plus className="rotate-45" size={16} />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
              )}
          </div>
        )}
      </div>

      <Dialog open={!!columnDialog} onOpenChange={(open) => { if (!open) setColumnDialog(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{columnDialog?.mode === "rename" ? "Editar coluna" : "Nova coluna"}</DialogTitle>
          </DialogHeader>
          {columnDialog && (
            <form
              className="space-y-4"
              onSubmit={(e) => { e.preventDefault(); handleSaveColumn(); }}
            >
              <div className="space-y-2">
                <Label htmlFor="coluna-nome">Nome</Label>
                <Input
                  id="coluna-nome"
                  autoFocus
                  placeholder="Ex.: Esta semana"
                  value={columnDialog.title}
                  onChange={(e) => setColumnDialog({ ...columnDialog, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Cor</Label>
                <div className="flex flex-wrap gap-2">
                  {COLUMN_COLORS.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setColumnDialog({ ...columnDialog, hex })}
                      className={cn(
                        "h-7 w-7 rounded-full flex items-center justify-center transition-transform hover:scale-110",
                        columnDialog.hex === hex && "ring-2 ring-offset-2 ring-offset-background ring-zinc-900 dark:ring-zinc-100"
                      )}
                      style={{ backgroundColor: hex }}
                      title={hex}
                    >
                      {columnDialog.hex === hex && <Check size={14} className="text-white" />}
                    </button>
                  ))}
                </div>
              </div>
              <RegraDataCampos
                regra={columnDialog.regra}
                dias={columnDialog.dias}
                onChange={(regra, dias) => setColumnDialog({ ...columnDialog, regra, dias })}
              />
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setColumnDialog(null)} disabled={columnSaving}>Cancelar</Button>
                <Button type="submit" disabled={columnSaving}>
                  {columnSaving ? "Salvando..." : columnDialog.mode === "rename" ? "Salvar" : "Criar coluna"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!columnConfirm} onOpenChange={(o) => { if (!o) setColumnConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {columnConfirm?.type === "delete" ? "Excluir coluna?" : "Zerar demandas da coluna?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {columnConfirm && (() => {
                const count = demandas.filter(d => d.status === columnConfirm.column.id).length;
                const plural = count === 1 ? "demanda" : "demandas";
                return columnConfirm.type === "delete"
                  ? `A coluna "${columnConfirm.column.title}" e ${count} ${plural} serão removidas permanentemente.`
                  : `${count} ${plural} da coluna "${columnConfirm.column.title}" serão removidas permanentemente.`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={columnSaving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleConfirmColumnAction(); }}
              disabled={columnSaving}
              className="bg-destructive hover:bg-destructive/90"
            >
              {columnSaving ? "Aguarde..." : columnConfirm?.type === "delete" ? "Excluir coluna" : "Zerar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DemandaDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        demanda={selectedDemanda}
        onUpdate={handleUpdateDemanda}
        onDelete={async (id) => {
          try {
            const { error } = await supabase.from("demandas").delete().eq("id", id);
            if (error) throw error;
            toast.success("Demanda deletada!");
            setIsDrawerOpen(false);
            fetchDemandas();
          } catch (err) {
            toast.error("Erro ao deletar");
          }
        }}
        onDuplicate={handleDuplicateDemanda}
        onEnviarRoadmap={setEnviarRoadmap}
        clientes={clientes}
        columns={columns}
      />

      <EnviarParaRoadmapDialog
        demanda={enviarRoadmap}
        clientes={clientes}
        onClose={() => setEnviarRoadmap(null)}
        onDefinirRoadmap={(demandaId, roadmapId) => handleUpdateDemanda(demandaId, { roadmap_id: roadmapId })}
      />

      <Dialog open={isModalOpen} onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) setEditingDemanda(null);
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingDemanda?.id ? "Editar Demanda" : "Nova Demanda"}</DialogTitle>
            <DialogDescription>
              Preencha os detalhes da tarefa abaixo.
            </DialogDescription>
          </DialogHeader>
          <DemandaForm
            clientes={clientes}
            columns={columns}
            onSubmit={handleCreateOrUpdateDemanda} 
            loading={loading}
            initialValues={editingDemanda}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={(o) => { if (!o) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza que deseja remover?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A demanda "{deletingName}" será permanentemente deletada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteDemanda} 
              className="bg-destructive hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EscolherDiaDialog
        aberto={!!escolhaDia}
        titulo={columns.find((c) => c.id === escolhaDia?.coluna)?.title ?? ""}
        dias={escolhaDia ? mapa[escolhaDia.coluna] ?? [] : []}
        sugerido={escolhaDia?.sugerido ?? null}
        onEscolher={escolherDia}
        onCancelar={cancelarEscolhaDia}
      />
      {popoverConfig && (
        <div 
          className="fixed z-[100] w-64 bg-white dark:bg-zinc-950 border rounded-lg shadow-xl p-4 animate-in zoom-in duration-200"
          style={{ left: popoverConfig.x, top: popoverConfig.y }}
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold uppercase tracking-wider">Quando repetir?</h4>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPopoverConfig(null)}><X size={14} /></Button>
          </div>
          <div className="grid gap-2">
            {[
              { label: 'Diária', value: 'diaria', desc: 'Todos os dias' },
              { label: 'Semanal', value: 'semanal', desc: 'Uma vez por semana' },
              { label: 'Quinzenal', value: 'quinzenal', desc: 'A cada 15 dias' },
              { label: 'Mensal', value: 'mensal', desc: 'Mesmo dia todo mês' },
              { label: 'Customizada', value: 'customizada', desc: 'Intervalo de dias' }
            ].map((opt) => (
              <Button 
                key={opt.value} 
                variant="outline" 
                className="justify-start h-auto py-2 px-3 text-left"
                onClick={async () => {
                  // Dia de Brasília: depois das 21h o UTC já está no dia seguinte
                  const today = hojeBrasilia();
                  
                  // Calcular primeira proxima_execucao baseada no tipo (simplificado para o popover inicial)
                  let proxima = today; 
                  if (opt.value === 'diaria') {
                    proxima = somarDias(today, 1);
                  }

                  await supabase.from("demandas").update({
                    frequencia_tipo: opt.value,
                    proxima_execucao: proxima
                  }).eq("id", popoverConfig.id);
                  
                  setPopoverConfig(null);
                  fetchDemandas();
                  toast.success("Recorrência configurada!");
                  
                  // Removido catchUpRecorrentes para evitar materialização automática em Fazer Hoje
                }}
              >
                <div className="flex flex-col">
                  <span className="text-sm font-semibold">{opt.label}</span>
                  <span className="text-[10px] text-zinc-400">{opt.desc}</span>
                </div>
              </Button>
            ))}
            <Button variant="ghost" className="text-xs h-8" onClick={() => setPopoverConfig(null)}>Configurar depois</Button>
          </div>
        </div>
      )}
    </div>
  );
}


