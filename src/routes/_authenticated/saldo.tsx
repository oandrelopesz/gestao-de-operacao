import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import {
  AlertCircle,
  Plus,
  Search,
  Building2,
  MoreVertical,
  Pencil,
  Trash2,
  Wallet,
  TrendingUp,
  ArrowUpCircle,
  Filter,
  RefreshCw,
  History,
  UserCog,
  LayoutGrid,
  ArrowRight,
  BellOff,
  BellRing,
  CalendarClock,
  Scale,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useCachedState, hasCached } from "@/lib/pageCache";
import { CACHE_KEYS, loadSaldo } from "@/lib/data";
import { formatBRL } from "@/lib/clientes";
import { formatMoeda } from "@/lib/moedas";
import { useAgencias, agenciaBadgeStyle } from "@/lib/agencias";
import { saveCliente, loadClienteFormValues, getUserId, removerPlataformaDaOperacao } from "@/lib/clientesService";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SaldoAdsForm, SaldoAdsFormValues } from "@/components/SaldoAdsForm";
import { RecargaForm, RecargaFormValues, RecargaConta } from "@/components/RecargaForm";
import { usePlataformas } from "@/lib/plataformas";
import { ClientForm, ClientFormValues } from "@/components/ClientForm";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { useBusca } from "@/lib/useBusca";
import { MensagemBusca } from "@/components/MensagemBusca";

export const Route = createFileRoute("/_authenticated/saldo")({
  component: SaldoPage,
});

// Cores dos badges por plataforma (a lista em si vem do Admin, via usePlataformas)
const PLATAFORMA_CORES: Record<string, string> = {
  Meta: "bg-blue-500",
  Google: "bg-red-500",
  Pinterest: "bg-rose-500",
  "X Ads": "bg-black",
  LinkedIn: "bg-blue-700",
  TikTok: "bg-zinc-800",
  Taboola: "bg-blue-400",
  Outbrain: "bg-orange-500",
};
const corPlataforma = (nome: string) => PLATAFORMA_CORES[nome] || "bg-slate-500";

const STATUS_ALERTA = [
  { id: "ok", label: "OK", weight: 0 },
  { id: "alerta", label: "Alerta (até 3 dias)", weight: 1 },
  { id: "critico", label: "Crítico (1 dia)", weight: 2 },
  { id: "zerado", label: "Zerado", weight: 3 },
  { id: "sem_recarga", label: "Sem recarga", weight: -1 },
  { id: "cartao", label: "Cartão (sem monitoramento)", weight: -1 },
];

const ALERTING = ["alerta", "critico", "zerado"];

/** Registro da saldo_ads_view (campos usados aqui) */
interface SaldoRow {
  id: string;
  cliente_id: string;
  cliente_nome: string;
  cliente_agencia: string;
  cliente_status_operacional: string | null;
  metodo_pagamento: string | null;
  plataformas: string[];
  ativo: boolean;
  verba_diaria: number | null;
  verba_diaria_calc: number | null;
  saldo_total_acumulado: number;
  qtd_recargas: number;
  data_ultima_recarga: string | null;
  valor_ultima_recarga: number | null;
  /** O último lançamento é um ajuste de saldo (não uma recarga) */
  ultimo_ajuste?: boolean | null;
  saldo_atual_estimado: number;
  dias_restantes: number | null;
  data_prevista_fim: string | null;
  alerta_dispensado: boolean;
  status_alerta: string;
  observacoes: string | null;
  operacao_id: string | null;
  operacao_nome: string | null;
  operacao_ordem: number | null;
  /** Moeda da operação (BRL, USD, EUR, GBP) — saldo e recargas deste registro estão nela */
  moeda: string;
  /** BRL por 1 unidade da moeda, pela cotação mais recente gravada */
  cotacao_brl: number;
  clientes?: { status_operacional: string | null; verba_ads: number | null };
}

/** Valor do registro convertido para BRL (para somar registros de moedas diferentes) */
const emBRL = (row: SaldoRow, valor: number | null | undefined) => Number(valor || 0) * (Number(row.cotacao_brl) || 1);

interface ClienteGroup {
  cliente_id: string;
  cliente_nome: string;
  cliente_agencia: string;
  status_operacional: string | null;
  metodo_pagamento_principal: string;
  plataformas: SaldoRow[];
  /** Em BRL (soma de registros que podem estar em moedas diferentes) */
  saldo_total_consolidado: number;
  verba_diaria_total: number;
  /** Moeda única do cliente, ou null se houver operações em moedas diferentes */
  moeda_unica: string | null;
  qtd_operacoes: number;
  pior_status_alerta: string;
  data_prevista_fim_proxima: string | null;
  plataforma_mais_proxima: string;
}

/** Plataforma(s) de um registro de saldo, para o seletor de recarga */
const contaDeRecarga = (row: SaldoRow, comOperacao = false): RecargaConta => ({
  id: row.id,
  label: (comOperacao && row.operacao_nome ? `${row.operacao_nome} · ` : "") + ((row.plataformas || []).join(", ") || "Sem plataforma"),
  metodo_pagamento: row.metodo_pagamento,
  verba_diaria: row.verba_diaria_calc,
  moeda: row.moeda,
  saldo_estimado: row.saldo_atual_estimado,
});

const formatDate = (iso?: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

const formatDias = (dias?: number | null) => {
  if (dias === null || dias === undefined) return "—";
  const d = Math.floor(dias);
  return `${d} ${d === 1 ? "dia" : "dias"}`;
};

// Status efetivo: um alerta dispensado é tratado como "ok" até a próxima recarga
const statusEfetivo = (row: SaldoRow) =>
  ALERTING.includes(row.status_alerta) && row.alerta_dispensado ? "dispensado" : row.status_alerta;

function SaldoPage() {
  const { agencias, label: agenciaLabelOf, meta: agenciaMetaOf } = useAgencias();
  const { nomes: plataformasDisponiveis } = usePlataformas();
  const [data, setData] = useCachedState<SaldoRow[]>(CACHE_KEYS.saldo, []);
  const [loading, setLoading] = useState(!hasCached(CACHE_KEYS.saldo));
  const [filterAgencia, setFilterAgencia] = useState<string>("all");
  const [filterPlataforma, setFilterPlataforma] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showPausados, setShowPausados] = useState(false);
  const [showCartao, setShowCartao] = useState(true);
  const [sortBy, setSortBy] = useState<string>("dias_restantes");
  const { cliente_id: searchClientId, highlight: searchHighlight } = Route.useSearch() as any;

  const [modalOpen, setModalOpen] = useState(false);
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [recargaModalOpen, setRecargaModalOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editing, setEditing] = useState<SaldoRow | null>(null);
  const [editingClient, setEditingClient] = useState<any>(null);
  /** Recarga (ou ajuste de saldo) em andamento: plataformas do cliente (o usuário escolhe em qual foi) e a sugerida */
  const [recargaTarget, setRecargaTarget] = useState<{ cliente_nome: string; contas: SaldoRow[]; defaultId?: string; ajuste?: boolean } | null>(null);
  const [novoRegistroClienteId, setNovoRegistroClienteId] = useState<string | null>(null);
  const [selectedForHistory, setSelectedForHistory] = useState<SaldoRow | null>(null);
  const [historyIsConsolidated, setHistoryIsConsolidated] = useState(false);
  /** Conta cuja plataforma está sendo removida da operação (guardada além do diálogo para o texto não sumir ao fechar) */
  const [removendo, setRemovendo] = useState<SaldoRow | null>(null);
  const [confirmRemover, setConfirmRemover] = useState(false);
  /** Impede duas remoções ao mesmo tempo: cada uma recarrega e regrava o cadastro do cliente */
  const [removendoAndamento, setRemovendoAndamento] = useState(false);
  const [saving, setSaving] = useState(false);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [confirmDismissAll, setConfirmDismissAll] = useState(false);

  useEffect(() => {
    if (searchClientId) {
      setSearchQuery("");
      setFilterAgencia("all");
      setFilterPlataforma("all");
      setFilterStatus("all");
      setShowPausados(true);
    }
    if (searchHighlight) {
      setHighlightedId(searchHighlight);
      setTimeout(() => {
        const el = document.getElementById(`card-${searchClientId || searchHighlight}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 500);
      const timer = setTimeout(() => setHighlightedId(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [searchClientId, searchHighlight]);

  useEffect(() => {
    fetchSaldo();
    // Recargas e registros alterados em outras abas refletem aqui na hora
    const channel = supabase
      .channel("saldo-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "saldo_ads" }, () => fetchSaldo(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "recargas" }, () => fetchSaldo(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "clientes" }, () => fetchSaldo(true))
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchSaldo = async (silent = false) => {
    if (!silent && !hasCached(CACHE_KEYS.saldo)) setLoading(true);
    try {
      // loadSaldo já deixa de fora as plataformas desativadas no cadastro do cliente
      setData((await loadSaldo()) as unknown as SaldoRow[]);
    } catch (error) {
      toast.error("Erro ao carregar saldos de mídia");
      console.error(error);
    }
    setLoading(false);
  };

  // ---------- Ações ----------
  const handleSave = async (values: SaldoAdsFormValues) => {
    setSaving(true);
    try {
      const userId = await getUserId();
      if (editing) {
        const { error } = await supabase.from("saldo_ads").update({ ...values }).eq("id", editing.id);
        if (error) throw error;
        toast.success(
          editing.metodo_pagamento !== values.metodo_pagamento && values.metodo_pagamento === "cartao"
            ? "Migrado para cartão: monitoramento desativado"
            : "Registro atualizado"
        );
      } else {
        // Registro avulso entra na primeira operação ativa do cliente (cria "Principal" se não houver)
        let operacaoId: string | null = null;
        if (values.cliente_id) {
          const { data: ops } = await supabase
            .from("operacoes").select("id").eq("cliente_id", values.cliente_id).eq("ativa", true)
            .order("ordem").order("created_at").limit(1);
          operacaoId = ops?.[0]?.id ?? null;
          if (!operacaoId) {
            const { data: nova, error: erroOp } = await supabase
              .from("operacoes").insert([{ cliente_id: values.cliente_id, nome: "Principal" }]).select("id").single();
            if (erroOp) throw erroOp;
            operacaoId = nova.id;
          }
        }
        const { data: newRecord, error } = await supabase
          .from("saldo_ads")
          .insert([{ ...values, user_id: userId, operacao_id: operacaoId }])
          .select()
          .single();
        if (error) throw error;
        toast.success("Registro criado");
        if (values.metodo_pagamento !== "cartao") {
          openRecarga([newRecord as any], newRecord as any, "");
        }
      }
      setModalOpen(false);
      setEditing(null);
      fetchSaldo(true);
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateClient = async (values: ClientFormValues) => {
    if (!editingClient) return;
    setSaving(true);
    try {
      // Mesmo fluxo da aba Clientes: atualiza cliente e sincroniza saldo_ads
      await saveCliente(values, editingClient.id);
      toast.success("Dados do cliente atualizados");
      setClientModalOpen(false);
      setEditingClient(null);
      fetchSaldo(true);
    } catch (e: any) {
      toast.error(e.message || "Erro ao atualizar cliente");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Abre o modal de recarga: o usuário escolhe a plataforma entre as que o cliente roda (Pix/Boleto).
   * Com `ajuste`, o valor informado substitui o saldo estimado (ver 20261007150000_saldo_ajuste.sql).
   */
  const openRecarga = (contas: SaldoRow[], sugerida?: SaldoRow, clienteNome?: string, ajuste = false) => {
    const monitoradas = contas.filter((c) => c.metodo_pagamento !== "cartao");
    setRecargaTarget({
      cliente_nome: clienteNome ?? (sugerida?.cliente_nome || monitoradas[0]?.cliente_nome || ""),
      contas: monitoradas.length > 0 ? monitoradas : contas,
      defaultId: sugerida?.id,
      ajuste,
    });
    setRecargaModalOpen(true);
  };

  const handleRecarga = async (values: RecargaFormValues) => {
    const { saldo_ads_id, ...recarga } = values;
    const alvo = saldo_ads_id || recargaTarget?.defaultId;
    if (!alvo) return;
    setSaving(true);
    try {
      const ajuste = !!recargaTarget?.ajuste;
      const { error } = await supabase
        .from("recargas")
        .insert([{ ...recarga, saldo_ads_id: alvo, ...(ajuste ? { ajuste: true, metodo_pagamento: null } : {}) }]);
      if (error) throw error;
      const plataforma = recargaTarget?.contas.find((c) => c.id === alvo)?.plataformas?.join(", ");
      const oQue = ajuste ? "Saldo ajustado" : "Recarga registrada";
      toast.success(plataforma ? `${oQue} em ${plataforma} — previsão recalculada` : `${oQue} — previsão recalculada`);
      setRecargaModalOpen(false);
      setRecargaTarget(null);
      fetchSaldo(true);
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar recarga");
    } finally {
      setSaving(false);
    }
  };

  /**
   * "Remover plataforma": tira a plataforma da operação do cliente pelo mesmo caminho do cadastro
   * (saveCliente). A conta fica inativa e as recargas ficam guardadas; nada é apagado.
   */
  const handleRemoverPlataforma = async () => {
    if (!removendo || removendoAndamento) return;
    const alvo = removendo;
    const nome = (alvo.plataformas || []).join(", ") || "Plataforma";
    setRemovendoAndamento(true);
    // A gravação leva alguns segundos: o aviso de progresso vira o de sucesso ou de erro (mesmo id)
    const aviso = toast.loading("Removendo a plataforma…");
    try {
      await removerPlataformaDaOperacao(alvo.cliente_id, alvo.operacao_id, alvo.plataformas || []);
      toast.success(`${nome} removida de ${alvo.cliente_nome}. As recargas ficam guardadas.`, { id: aviso });
      fetchSaldo(true);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao remover a plataforma", { id: aviso });
    } finally {
      setRemovendoAndamento(false);
    }
  };

  const setDismissed = async (ids: string[], dismissed: boolean) => {
    if (ids.length === 0) return;
    const { error } = await supabase
      .from("saldo_ads")
      .update({ alerta_dispensado_em: dismissed ? new Date().toISOString() : null })
      .in("id", ids);
    if (error) {
      toast.error(error.message.includes("alerta_dispensado_em")
        ? "Aplique a migration do Saldo para habilitar a dispensa de alertas"
        : "Erro ao atualizar alerta");
      return;
    }
    toast.success(dismissed
      ? (ids.length === 1 ? "Alerta dispensado até a próxima recarga" : `${ids.length} alertas dispensados`)
      : "Alerta reativado");
    fetchSaldo(true);
  };

  const fetchHistory = async (record: SaldoRow, consolidated = false) => {
    setSelectedForHistory(record);
    setHistoryIsConsolidated(consolidated);
    setHistoryOpen(true);

    let query = supabase.from("recargas").select("*, saldo_ads!inner(plataformas, operacoes(nome, moeda))");
    query = consolidated ? query.eq("saldo_ads.cliente_id", record.cliente_id) : query.eq("saldo_ads_id", record.id);
    const { data, error } = await query.order("data_recarga", { ascending: false }).order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar histórico");
    else setHistoryData(data || []);
  };

  // ---------- Derivados ----------
  const activeAlerts = useMemo(
    () => data.filter((r) => ALERTING.includes(r.status_alerta) && !r.alerta_dispensado),
    [data]
  );

  const groupedData = useMemo<ClienteGroup[]>(() => {
    const groups: Record<string, ClienteGroup> = {};

    data.forEach((item) => {
      const clientId = item.cliente_id;
      if (!groups[clientId]) {
        groups[clientId] = {
          cliente_id: clientId,
          cliente_nome: item.cliente_nome,
          cliente_agencia: item.cliente_agencia,
          status_operacional: item.clientes?.status_operacional ?? item.cliente_status_operacional,
          metodo_pagamento_principal: item.metodo_pagamento || "pix",
          plataformas: [],
          saldo_total_consolidado: 0,
          verba_diaria_total: 0,
          moeda_unica: item.moeda || "BRL",
          qtd_operacoes: 0,
          pior_status_alerta: "ok",
          data_prevista_fim_proxima: null,
          plataforma_mais_proxima: "",
        };
      }
      const group = groups[clientId];
      group.plataformas.push(item);
      if (group.moeda_unica !== null && (item.moeda || "BRL") !== group.moeda_unica) group.moeda_unica = null;
      group.qtd_operacoes = new Set(group.plataformas.map((p) => p.operacao_id || "")).size;

      if (item.metodo_pagamento !== group.metodo_pagamento_principal) group.metodo_pagamento_principal = "misto";

      if (item.metodo_pagamento !== "cartao") {
        group.saldo_total_consolidado += emBRL(item, item.saldo_atual_estimado);
        group.verba_diaria_total += emBRL(item, item.verba_diaria_calc);

        const status = statusEfetivo(item);
        const currentWeight = STATUS_ALERTA.find((s) => s.id === status)?.weight ?? 0;
        const worstWeight = STATUS_ALERTA.find((s) => s.id === group.pior_status_alerta)?.weight ?? 0;
        if (currentWeight > worstWeight) group.pior_status_alerta = status;

        if (item.data_prevista_fim) {
          if (!group.data_prevista_fim_proxima || item.data_prevista_fim < group.data_prevista_fim_proxima) {
            group.data_prevista_fim_proxima = item.data_prevista_fim;
            group.plataforma_mais_proxima = item.plataformas?.[0] || "";
          }
        }
      } else if (group.pior_status_alerta === "ok") {
        group.pior_status_alerta = "cartao";
      }
    });

    return Object.values(groups);
  }, [data]);

  // Mesmo critério da linha da tabela (qtd_operacoes > 1): o diálogo de remover diz de qual operação a plataforma sai
  const removendoDeVariasOperacoes = !!removendo && (groupedData.find((g) => g.cliente_id === removendo.cliente_id)?.qtd_operacoes ?? 0) > 1;

  // Filtros e ordenação da tela, sem o texto da busca (a busca tolerante vem depois, em `resultadoBusca`)
  const baseData = useMemo(() => {
    const result = groupedData.filter((group) => {
      const matchesAgencia = filterAgencia === "all" || group.cliente_agencia === filterAgencia;
      const isPausado = group.status_operacional === "pausado";
      const matchesPausados = showPausados || !isPausado;
      const hasPlataforma = filterPlataforma === "all" || group.plataformas.some((p) => p.plataformas?.includes(filterPlataforma));
      const hasStatus = filterStatus === "all" || group.plataformas.some((p) => statusEfetivo(p) === filterStatus || p.status_alerta === filterStatus);
      const hasCartao = showCartao || group.plataformas.some((p) => p.metodo_pagamento !== "cartao");
      return matchesAgencia && matchesPausados && hasPlataforma && hasStatus && hasCartao;
    });

    result.sort((a, b) => {
      if (sortBy === "dias_restantes") {
        if (!a.data_prevista_fim_proxima) return 1;
        if (!b.data_prevista_fim_proxima) return -1;
        return a.data_prevista_fim_proxima.localeCompare(b.data_prevista_fim_proxima);
      }
      if (sortBy === "nome") return (a.cliente_nome || "").localeCompare(b.cliente_nome || "");
      if (sortBy === "valor") return (b.saldo_total_consolidado || 0) - (a.saldo_total_consolidado || 0);
      return 0;
    });

    return result;
  }, [groupedData, filterAgencia, filterPlataforma, filterStatus, sortBy, showPausados, showCartao]);

  // Busca tolerante no nome do cliente e nas plataformas dele
  const resultadoBusca = useBusca(baseData, searchQuery, (group) => [
    group.cliente_nome,
    group.plataformas.map((p) => (p.plataformas || []).join(" ")).join(" "),
  ]);
  const filteredData = resultadoBusca.itens;

  const metrics = useMemo(() => {
    const monitored = data.filter((i) => i.metodo_pagamento !== "cartao");
    const onCartao = data.filter((i) => i.metodo_pagamento === "cartao");
    const uniqueClients = new Set(data.map((i) => i.cliente_id)).size;
    const criticalClient = [...monitored]
      .filter((i) => i.data_prevista_fim && !i.alerta_dispensado && ALERTING.includes(i.status_alerta))
      .sort((a, b) => (a.data_prevista_fim || "").localeCompare(b.data_prevista_fim || ""))[0];

    return {
      totalContas: data.length,
      uniqueClients,
      saldoTotal: monitored.reduce((acc, curr) => acc + emBRL(curr, curr.saldo_atual_estimado), 0),
      temMoedaEstrangeira: monitored.some((i) => (i.moeda || "BRL") !== "BRL"),
      emAlerta: activeAlerts.filter((i) => i.status_alerta === "alerta").length,
      criticos: activeAlerts.filter((i) => i.status_alerta === "critico" || i.status_alerta === "zerado").length,
      dispensados: data.filter((i) => ALERTING.includes(i.status_alerta) && i.alerta_dispensado).length,
      totalCartao: onCartao.length,
      criticalClientName: criticalClient?.cliente_nome,
      criticalClientDate: criticalClient?.data_prevista_fim,
    };
  }, [data, activeAlerts]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ok": return "border-l-emerald-500";
      case "alerta": return "border-l-amber-500";
      case "critico": return "border-l-red-500";
      case "zerado": return "border-l-red-700";
      case "dispensado": return "border-l-zinc-400";
      case "cartao": return "border-l-blue-300";
      default: return "border-l-border";
    }
  };

  const getProgressColor = (status: string) => {
    switch (status) {
      case "ok": return "bg-emerald-500";
      case "alerta": return "bg-amber-500";
      case "critico": return "bg-red-500";
      case "zerado": return "bg-red-700";
      case "dispensado": return "bg-zinc-400";
      default: return "bg-primary";
    }
  };

  const openClientEditor = (clienteId: string) => {
    // Carrega o cadastro completo antes de abrir, para não sobrescrever dados com defaults
    setEditingClient(null);
    setClientModalOpen(true);
    loadClienteFormValues(clienteId)
      .then(setEditingClient)
      .catch(() => { toast.error("Erro ao carregar cliente"); setClientModalOpen(false); });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Monitor de Saldo de Mídia</h1>
          <p className="text-muted-foreground">Cada recarga recalcula o saldo e a data prevista de término; você é avisado 3 dias antes.</p>
        </div>
        <div className="flex gap-2">
          {activeAlerts.length > 0 && (
            <Button variant="outline" className="gap-2" onClick={() => setConfirmDismissAll(true)}>
              <BellOff size={16} /> Zerar alertas ({activeAlerts.length})
            </Button>
          )}
          <Button className="gap-2" onClick={() => { setEditing(null); setNovoRegistroClienteId(null); setModalOpen(true); }}>
            <Plus size={16} /> Novo registro
          </Button>
          <Button variant="outline" size="icon" onClick={() => fetchSaldo()} disabled={loading} title="Atualizar">
            <RefreshCw size={16} className={cn(loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      <TooltipProvider>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Contas monitoradas</CardTitle>
                  <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="numeric text-2xl font-semibold">{metrics.totalContas}</div>
                  <p className="text-xs text-muted-foreground">{metrics.uniqueClients} clientes</p>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent><p>Registros por plataforma / clientes distintos</p></TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Saldo total</CardTitle>
                  <Wallet className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <div className="numeric text-2xl font-semibold">{formatBRL(metrics.saldoTotal)}</div>
                  <p className="text-xs text-muted-foreground">Soma dos registros Pix/Boleto{metrics.temMoedaEstrangeira ? ", convertida pela cotação do dia" : ""}</p>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent><p>Saldo estimado hoje, recarga a recarga</p></TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Em alerta / críticos</CardTitle>
                  <AlertCircle className="h-4 w-4 text-destructive" />
                </CardHeader>
                <CardContent>
                  <div className="numeric text-2xl font-semibold">{metrics.criticos + metrics.emAlerta}</div>
                  <p className="text-xs text-muted-foreground">
                    {metrics.criticos} críticos, {metrics.emAlerta} em alerta
                    {metrics.dispensados > 0 && ` · ${metrics.dispensados} dispensados`}
                  </p>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent><p>Alerta: acaba em até 3 dias · Crítico: 1 dia ou zerado</p></TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Card className={cn(metrics.criticalClientName && "bg-red-50/50 border-red-100 dark:bg-red-950/20 dark:border-red-900/40")}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className={cn("text-sm font-medium", metrics.criticalClientName && "text-red-800 dark:text-red-300")}>Mais urgente</CardTitle>
                  <ArrowRight className={cn("h-4 w-4", metrics.criticalClientName ? "text-red-600" : "text-muted-foreground")} />
                </CardHeader>
                <CardContent>
                  <div className={cn("text-base font-bold line-clamp-1", metrics.criticalClientName && "text-red-700 dark:text-red-300")}>
                    {metrics.criticalClientName || "Nenhum"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {metrics.criticalClientDate ? `Zera em ${formatDate(metrics.criticalClientDate)}` : "Nenhum saldo perto de acabar"}
                  </p>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent><p>Cliente cujo saldo termina primeiro</p></TooltipContent>
          </Tooltip>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">No cartão</CardTitle>
              <Building2 className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="numeric text-2xl font-semibold">{metrics.totalCartao}</div>
              <p className="text-xs text-muted-foreground">Pagamento direto, sem monitoramento</p>
            </CardContent>
          </Card>
        </div>
      </TooltipProvider>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar cliente..." className="pl-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <Select value={filterAgencia} onValueChange={setFilterAgencia}>
          <SelectTrigger className="w-[150px]">
            <Building2 className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Agência" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {agencias.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterPlataforma} onValueChange={setFilterPlataforma}>
          <SelectTrigger className="w-[150px]">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Plataforma" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Plataformas</SelectItem>
            {plataformasDisponiveis.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[190px]">
            <AlertCircle className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {STATUS_ALERTA.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
            ))}
            <SelectItem value="dispensado">Alerta dispensado</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 bg-muted/30 px-3 py-1.5 rounded-md border text-xs h-10">
          <span className="font-medium text-muted-foreground">Pausados</span>
          <Checkbox checked={showPausados} onCheckedChange={(v) => setShowPausados(!!v)} />
        </div>
        <div className="flex items-center gap-2 bg-muted/30 px-3 py-1.5 rounded-md border text-xs h-10">
          <span className="font-medium text-muted-foreground">Cartão</span>
          <Checkbox checked={showCartao} onCheckedChange={(v) => setShowCartao(!!v)} />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Ordenar por:</span>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="dias_restantes">Acaba primeiro</SelectItem>
              <SelectItem value="nome">Nome do cliente</SelectItem>
              <SelectItem value="valor">Maior saldo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
        {!loading && resultadoBusca.modo === "parecidos" && <MensagemBusca resultado={resultadoBusca} className="col-span-full" />}
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[300px] rounded-xl border bg-card animate-pulse" />)
        ) : filteredData.length === 0 ? (
          <div className="col-span-full h-64 flex flex-col items-center justify-center border-2 border-dashed rounded-xl bg-muted/30 text-muted-foreground">
            <Wallet size={48} className="mb-4 opacity-20" />
            {resultadoBusca.modo === "nenhum" && baseData.length > 0 ? (
              <MensagemBusca resultado={resultadoBusca} />
            ) : (
              <p>{data.length === 0 ? "Nenhum cliente monitorado ainda. Cadastre um cliente com Pix/Boleto em Clientes Ativos." : "Nenhum registro encontrado."}</p>
            )}
            {data.length > 0 && (
              <Button variant="link" onClick={() => { setFilterAgencia("all"); setFilterPlataforma("all"); setFilterStatus("all"); setSearchQuery(""); }}>
                Limpar filtros
              </Button>
            )}
          </div>
        ) : (
          filteredData.map((group) => {
            const hasMultiple = group.plataformas.length > 1;
            const isPausado = group.status_operacional === "pausado";
            const isCartaoOnly = group.plataformas.every((p) => p.metodo_pagamento === "cartao");

            return (
              <Card
                key={group.cliente_id}
                id={`card-${group.cliente_id}`}
                className={cn(
                  "group relative border-l-4 transition-all hover:shadow-md flex flex-col",
                  getStatusColor(group.pior_status_alerta),
                  isPausado && "opacity-75",
                  highlightedId && (highlightedId === group.cliente_id || group.plataformas.some((p) => p.id === highlightedId)) && "ring-2 ring-primary animate-pulse shadow-lg"
                )}
              >
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <CardTitle className="text-lg font-bold">{group.cliente_nome}</CardTitle>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="text-[10px] font-semibold uppercase py-0" style={agenciaBadgeStyle(agenciaMetaOf(group.cliente_agencia)?.hex)}>
                          {agenciaLabelOf(group.cliente_agencia)}
                        </Badge>
                        {isPausado && (
                          <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 text-[10px] uppercase py-0">Pausado</Badge>
                        )}
                        <Badge variant="secondary" className="text-[10px] uppercase py-0">
                          {group.metodo_pagamento_principal === "misto" ? "Misto" : group.metodo_pagamento_principal}
                        </Badge>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2"><MoreVertical size={16} /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[220px]">
                        <DropdownMenuItem onClick={() => openClientEditor(group.cliente_id)}>
                          <UserCog size={14} className="mr-2" /> Editar cliente
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setEditing(null); setNovoRegistroClienteId(group.cliente_id); setModalOpen(true); }}>
                          <Plus size={14} className="mr-2" /> Nova plataforma
                        </DropdownMenuItem>
                        {!isCartaoOnly && (
                          <DropdownMenuItem onClick={() => openRecarga(group.plataformas, undefined, group.cliente_nome)}>
                            <ArrowUpCircle size={14} className="mr-2" /> Adicionar recarga
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => fetchHistory(group.plataformas[0], true)}>
                          <History size={14} className="mr-2" /> Histórico consolidado
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 space-y-4 pb-4">
                  {hasMultiple && (
                    <div className="bg-muted/30 rounded-lg p-3 border space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-0.5">
                          <p className="text-[10px] text-muted-foreground uppercase font-semibold">Saldo total</p>
                          <p className="text-xl font-bold tracking-tight text-primary">
                            {group.moeda_unica && group.moeda_unica !== "BRL"
                              ? formatMoeda(group.plataformas.filter((p) => p.metodo_pagamento !== "cartao").reduce((a, p) => a + (p.saldo_atual_estimado || 0), 0), group.moeda_unica)
                              : formatBRL(group.saldo_total_consolidado)}
                            {!group.moeda_unica && <span className="ml-1 text-[10px] font-normal text-muted-foreground">em R$</span>}
                          </p>
                        </div>
                        <div className="space-y-0.5 text-right">
                          <p className="text-[10px] text-muted-foreground uppercase font-semibold">Verba diária total</p>
                          <p className="text-sm font-bold">
                            {group.moeda_unica && group.moeda_unica !== "BRL"
                              ? formatMoeda(group.plataformas.filter((p) => p.metodo_pagamento !== "cartao").reduce((a, p) => a + (p.verba_diaria_calc || 0), 0), group.moeda_unica)
                              : formatBRL(group.verba_diaria_total)}<span className="text-[10px] text-muted-foreground font-normal">/dia</span>
                          </p>
                        </div>
                      </div>
                      {!isCartaoOnly && group.data_prevista_fim_proxima && (
                        <div className="flex items-center justify-between text-[11px] bg-background/50 p-2 rounded border border-dashed">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <CalendarClock size={12} className="text-amber-500" /> Próximo fim previsto:
                          </span>
                          <span className="font-bold text-amber-700 dark:text-amber-400">
                            {formatDate(group.data_prevista_fim_proxima)}
                            <span className="ml-1 text-[10px] font-normal opacity-70">({group.plataforma_mais_proxima})</span>
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    {group.plataformas.map((plat) => {
                      const isFilteringThis = filterPlataforma !== "all" && plat.plataformas?.includes(filterPlataforma);
                      const isFilteringOther = filterPlataforma !== "all" && !isFilteringThis;
                      const isCartao = plat.metodo_pagamento === "cartao";
                      const status = statusEfetivo(plat);
                      const isAlerting = ALERTING.includes(plat.status_alerta);
                      const dias = plat.dias_restantes;

                      return (
                        <div
                          key={plat.id}
                          className={cn(
                            "relative group/row rounded-md border p-2.5 transition-all",
                            isFilteringThis ? "bg-primary/5 border-primary/20" : "bg-card",
                            isFilteringOther && "opacity-40 grayscale-[0.2]",
                            !hasMultiple && "border-none p-0 bg-transparent"
                          )}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              {group.qtd_operacoes > 1 && plat.operacao_nome && (
                                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{plat.operacao_nome}</span>
                              )}
                              {plat.plataformas?.map((p) => (
                                <Badge key={p} className={cn("text-[10px] px-1.5 py-0", corPlataforma(p))}>{p}</Badge>
                              ))}
                              {(plat.moeda || "BRL") !== "BRL" && <Badge variant="outline" className="text-[9px] h-4 py-0">{plat.moeda}</Badge>}
                              {isCartao && <Badge variant="outline" className="text-[9px] h-4 py-0 text-blue-600 border-blue-200">Cartão</Badge>}
                              {status === "dispensado" && (
                                <Badge variant="outline" className="text-[9px] h-4 py-0 text-zinc-500 gap-1"><BellOff size={9} /> Alerta dispensado</Badge>
                              )}
                              {status === "zerado" && <Badge className="text-[9px] h-4 py-0 bg-red-700">Zerado</Badge>}
                              {status === "critico" && <Badge className="text-[9px] h-4 py-0 bg-red-500">Crítico</Badge>}
                              {status === "alerta" && <Badge className="text-[9px] h-4 py-0 bg-amber-500">Alerta</Badge>}
                            </div>

                            <div className="flex items-center gap-3">
                              {isCartao ? (
                                <span className="text-xs font-semibold text-blue-600 uppercase">Cartão</span>
                              ) : (
                                <span className="text-sm font-bold">{formatMoeda(plat.saldo_atual_estimado, plat.moeda)}</span>
                              )}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover/row:opacity-100 transition-opacity">
                                    <MoreVertical size={12} />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-[210px]">
                                  <DropdownMenuItem onClick={() => { setEditing(plat); setModalOpen(true); }}>
                                    <Pencil size={12} className="mr-2" /> Editar registro
                                  </DropdownMenuItem>
                                  {!isCartao && (
                                    <>
                                      <DropdownMenuItem onClick={() => openRecarga(group.plataformas, plat)}>
                                        <Plus size={12} className="mr-2" /> Adicionar recarga
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => openRecarga([plat], plat, group.cliente_nome, true)}>
                                        <Scale size={12} className="mr-2" /> Ajustar saldo
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => fetchHistory(plat)}>
                                        <History size={12} className="mr-2" /> Ver histórico
                                      </DropdownMenuItem>
                                      {isAlerting && (
                                        plat.alerta_dispensado ? (
                                          <DropdownMenuItem onClick={() => setDismissed([plat.id], false)}>
                                            <BellRing size={12} className="mr-2" /> Reativar alerta
                                          </DropdownMenuItem>
                                        ) : (
                                          <DropdownMenuItem onClick={() => setDismissed([plat.id], true)}>
                                            <BellOff size={12} className="mr-2" /> Dispensar alerta
                                          </DropdownMenuItem>
                                        )
                                      )}
                                    </>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-destructive" disabled={removendoAndamento} onClick={() => { setRemovendo(plat); setConfirmRemover(true); }}>
                                    <Trash2 size={12} className="mr-2" /> Remover plataforma
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>

                          {!isCartao ? (
                            <div className="space-y-1.5">
                              <div className="flex justify-between text-[10px] font-medium text-muted-foreground">
                                <span>
                                  {plat.qtd_recargas === 0
                                    ? "Sem recarga registrada"
                                    : dias !== null && dias !== undefined
                                      ? `${formatDias(dias)} restantes · acaba em ${formatDate(plat.data_prevista_fim)}`
                                      : "Sem verba diária definida"}
                                </span>
                                <span>
                                  {plat.data_ultima_recarga
                                    ? `${plat.ultimo_ajuste ? "Ajustado" : "Última"}: ${formatMoeda(plat.valor_ultima_recarga, plat.moeda)} em ${formatDate(plat.data_ultima_recarga)}`
                                    : "—"}
                                </span>
                              </div>
                              <Progress
                                value={Math.min(100, ((dias ?? 0) / 30) * 100)}
                                className="h-1.5"
                                indicatorClassName={getProgressColor(status)}
                              />
                            </div>
                          ) : !hasMultiple && (
                            <div className="h-10 flex items-center justify-center bg-muted/30 rounded-md border border-dashed">
                              <p className="text-[11px] text-muted-foreground italic">Pagamento direto no cartão</p>
                            </div>
                          )}

                          {!hasMultiple && (
                            <div className="grid grid-cols-3 gap-2 text-[11px] pt-3 mt-3 border-t">
                              <div className="space-y-0.5">
                                <p className="text-muted-foreground">Verba diária</p>
                                <p className="font-semibold">{formatMoeda(plat.verba_diaria_calc, plat.moeda)}</p>
                              </div>
                              <div className="space-y-0.5 text-center">
                                <p className="text-muted-foreground">Verba mensal</p>
                                <p className="font-semibold">{formatMoeda((plat.verba_diaria_calc || 0) * 30, plat.moeda)}</p>
                              </div>
                              <div className="space-y-0.5 text-right">
                                <p className="text-muted-foreground">{isCartao ? "Recargas" : "Total investido"}</p>
                                <p className="font-semibold">{isCartao ? plat.qtd_recargas : formatMoeda(plat.saldo_total_acumulado, plat.moeda)}</p>
                              </div>
                            </div>
                          )}

                          {!isCartao && !hasMultiple && (
                            <Button
                              className="w-full h-8 text-xs gap-2 mt-4"
                              variant="outline"
                              onClick={(e) => { e.stopPropagation(); openRecarga(group.plataformas, plat); }}
                            >
                              <ArrowUpCircle size={14} /> Adicionar recarga
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Modais */}
      <Dialog open={modalOpen} onOpenChange={(o) => { setModalOpen(o); if (!o) { setEditing(null); setNovoRegistroClienteId(null); } }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar registro" : "Novo registro de saldo"}</DialogTitle>
            <DialogDescription>Configure o monitoramento de verba para uma plataforma de anúncios.</DialogDescription>
          </DialogHeader>
          <SaldoAdsForm
            loading={saving}
            onSubmit={handleSave}
            initialValues={editing ? {
              cliente_id: editing.cliente_id,
              plataformas: editing.plataformas || [],
              metodo_pagamento: (editing.metodo_pagamento || "pix") as SaldoAdsFormValues["metodo_pagamento"],
              verba_diaria: editing.verba_diaria,
              observacoes: editing.observacoes || "",
            } : novoRegistroClienteId ? { cliente_id: novoRegistroClienteId } : {}}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={clientModalOpen} onOpenChange={(o) => { setClientModalOpen(o); if (!o) setEditingClient(null); }}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar cliente</DialogTitle>
            <DialogDescription>Verba e forma de pagamento aqui refletem no monitoramento.</DialogDescription>
          </DialogHeader>
          {editingClient ? (
            <ClientForm loading={saving} onSubmit={handleUpdateClient} initialValues={editingClient} />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando cliente...</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={recargaModalOpen} onOpenChange={(o) => { setRecargaModalOpen(o); if (!o) setRecargaTarget(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{recargaTarget?.ajuste ? "Ajustar saldo" : "Adicionar recarga"}</DialogTitle>
            <DialogDescription>
              {recargaTarget?.ajuste ? (
                <>Informe o saldo que está agora na conta de <strong>{recargaTarget.cliente_nome || "o cliente"}</strong>. Não conta como investimento.</>
              ) : (
                <>
                  Novo aporte para <strong>{recargaTarget?.cliente_nome || "o cliente"}</strong>
                  {recargaTarget && recargaTarget.contas.length > 1 ? " — escolha em qual plataforma a recarga foi feita" : ""}.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {recargaTarget && (
            <RecargaForm
              loading={saving}
              contas={(() => { const multi = new Set(recargaTarget.contas.map((c) => c.operacao_id || "")).size > 1; return recargaTarget.contas.map((c) => contaDeRecarga(c, multi)); })()}
              defaultContaId={recargaTarget.defaultId}
              defaultMetodo={recargaTarget.contas.find((c) => c.id === recargaTarget.defaultId)?.metodo_pagamento || undefined}
              onSubmit={handleRecarga}
              ajuste={!!recargaTarget.ajuste}
            />
          )}
        </DialogContent>
      </Dialog>

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              {historyIsConsolidated ? "Histórico consolidado" : "Histórico de recargas"}
            </SheetTitle>
            <SheetDescription>
              {selectedForHistory?.cliente_nome} {historyIsConsolidated ? "— todas as plataformas" : `— ${selectedForHistory?.plataformas?.join(", ")}`}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-8 space-y-6">
            {!historyIsConsolidated && selectedForHistory && (
              <div className="p-4 rounded-xl bg-muted/50 border space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status atual</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] text-muted-foreground">{selectedForHistory.metodo_pagamento === "cartao" ? "Método" : "Saldo"}</p>
                    <p className="text-lg font-bold">
                      {selectedForHistory.metodo_pagamento === "cartao" ? "Cartão" : formatMoeda(selectedForHistory.saldo_atual_estimado, selectedForHistory.moeda)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">{selectedForHistory.metodo_pagamento === "cartao" ? "Monitoramento" : "Previsão"}</p>
                    <p className="text-lg font-bold">
                      {selectedForHistory.metodo_pagamento === "cartao"
                        ? "Desativado"
                        : `${formatDias(selectedForHistory.dias_restantes)} · ${formatDate(selectedForHistory.data_prevista_fim)}`}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <h4 className="text-sm font-semibold">Todas as recargas</h4>
              {historyData.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">Nenhuma recarga registrada.</p>
              ) : (
                <div className="relative space-y-4 before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-px before:bg-border">
                  {historyData.map((recarga) => (
                    <div key={recarga.id} className="relative pl-8">
                      <div className="absolute left-0 top-1 h-7 w-7 rounded-full bg-background border flex items-center justify-center">
                        {recarga.ajuste ? <Scale size={14} className="text-sky-500" /> : <TrendingUp size={14} className="text-emerald-500" />}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold">{formatMoeda(recarga.valor, recarga.saldo_ads?.operacoes?.moeda || selectedForHistory?.moeda)}</p>
                            {historyIsConsolidated && recarga.saldo_ads?.plataformas?.map((p: string) => (
                              <Badge key={p} variant="outline" className="text-[9px] h-4 py-0">{p}</Badge>
                            ))}
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono">{formatDate(recarga.data_recarga)}</span>
                        </div>
                        <p className={cn("text-xs text-muted-foreground", !recarga.ajuste && "capitalize")}>{recarga.ajuste ? "Ajuste de saldo (substitui o estimado)" : recarga.metodo_pagamento?.replace("_", " ")}</p>
                        {recarga.observacoes && (
                          <p className="text-[10px] bg-muted/50 p-1.5 rounded italic">"{recarga.observacoes}"</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmRemover} onOpenChange={setConfirmRemover}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remover {(removendo?.plataformas || []).join(", ") || "a plataforma"} de {removendo?.cliente_nome}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removendoDeVariasOperacoes && removendo?.operacao_nome
                ? `A plataforma sai da operação "${removendo.operacao_nome}" do cliente (as outras operações não mudam) e a verba é recalculada. `
                : "A plataforma sai do cadastro do cliente e a verba é recalculada. "}
              As recargas ficam guardadas e voltam se a plataforma for adicionada de novo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoverPlataforma} className="bg-destructive hover:bg-destructive/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDismissAll} onOpenChange={setConfirmDismissAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zerar alertas ativos?</AlertDialogTitle>
            <AlertDialogDescription>
              {activeAlerts.length} {activeAlerts.length === 1 ? "alerta será dispensado" : "alertas serão dispensados"}. Eles voltam automaticamente quando houver uma nova recarga com saldo perto de acabar, e você pode reativar cada um no menu da plataforma.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setDismissed(activeAlerts.map((a) => a.id), true); setConfirmDismissAll(false); }}>
              Zerar alertas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
