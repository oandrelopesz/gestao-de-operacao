import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  Plus,
  Search,
  Filter,
  MoreVertical,
  Pencil,
  Trash2,
  LayoutGrid,
  List as ListIcon,
  CheckCircle2,
  Clock,
  AlertCircle,
  DollarSign,
  History,
  Info,
  Building2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useCachedState, hasCached } from "@/lib/pageCache";
import { CACHE_KEYS, loadFinanceiroCompleto } from "@/lib/data";
import { formatBRL } from "@/lib/clientes";
import { hojeBrasilia } from "@/lib/entrega";
import { descreverDias, agruparHistorico, ehFracionado, nomeDoMes, parcelasDaFonte } from "@/lib/financeiro";
import {
  atrasadoDe,
  calendarioDaFonte,
  cobrancasDaFonte,
  formaDePagamento,
  INFO_SITUACAO,
  mesEscolhido,
  mesesNavegaveis,
  parcelasComForma,
  situacaoDoMesCobrado,
  totaisDe,
  type Cobranca,
  type RegistroRecebimento,
  type SituacaoCobranca,
  type SituacaoMes,
} from "@/lib/financeiroCobranca";
import {
  confirmarValorCheio,
  confirmarValorRecebido,
  desfazerCobranca,
  isentarCobranca,
  isentarMes,
} from "@/lib/financeiroAcoes";
import { TipoBadge } from "@/components/financeiro/TipoBadge";
import { FormaBadge } from "@/components/financeiro/FormaBadge";
import { CobrancaLinha } from "@/components/financeiro/CobrancaLinha";
import { ValorRecebidoDialog } from "@/components/financeiro/ValorRecebidoDialog";
import { IsentarDialog, type AlvoIsencao, type ModoIsencao } from "@/components/financeiro/IsentarDialog";
import { AtrasadoDialog } from "@/components/financeiro/AtrasadoDialog";
import { CalendarioCobranca } from "@/components/financeiro/CalendarioCobranca";
import { FonteDialog, type FinanceiroView } from "@/components/financeiro/FonteDialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ?mes=AAAA-MM: o mês mostrado na aba. Sem ele (o link de sempre, /financeiro) ou inválido, vale o mês atual.
export const Route = createFileRoute("/_authenticated/financeiro")({
  validateSearch: (s: Record<string, unknown>): { mes?: string } =>
    typeof s.mes === "string" && s.mes ? { mes: s.mes } : {},
  component: FinanceiroPage,
});

/** Uma parcela de um mês de uma fonte. As janelas guardam só isto: a cobrança é sempre lida dos dados atuais. */
interface ChaveCobranca {
  fonteId: string;
  mes: string;
  parcela: number;
}

/** O que a janela de isenção vai isentar: uma parcela (parcela/mes) ou as do mês inteiro (parcela null). */
interface ChaveIsencao {
  fonteId: string;
  modo: ModoIsencao;
  mes: string;
  parcela: number | null;
}

interface AcoesCobranca {
  onValorCheio: (c: Cobranca) => void;
  onConfigurar: (c: Cobranca) => void;
  onIsentar: (c: Cobranca) => void;
  onDesfazer: (c: Cobranca) => void;
}

/** Cobrança de uma fonte: todas as parcelas cobradas, as do mês escolhido, a situação desse mês e o atrasado até hoje. */
interface ResumoDaFonte {
  cobrancas: Cobranca[];
  doMes: Cobranca[];
  situacao: SituacaoMes;
  atrasado: { itens: Cobranca[]; total: number };
}

const SEM_COBRANCA: ResumoDaFonte = { cobrancas: [], doMes: [], situacao: "fora", atrasado: { itens: [], total: 0 } };

/** Cor da borda do card pela situação do mês (sempre junto do selo com o texto). */
const BORDA_DO_MES: Record<SituacaoMes, string> = {
  recebido: "border-emerald-200",
  parcial: "border-amber-300",
  isento: "border-sky-200",
  atrasado: "border-red-200",
  pendente: "border-amber-200",
  a_vencer: "border-zinc-200",
  fora: "border-zinc-200",
};

/** Opções do filtro de situação (do mês escolhido). */
const FILTROS_DE_SITUACAO: SituacaoCobranca[] = ["recebido", "parcial", "isento", "atrasado", "pendente", "a_vencer"];

const contagem = (n: number, uma: string, varias: string) => `${n} ${n === 1 ? uma : varias}`;

const quitadaOuIsenta = (c: Cobranca) => c.situacao === "recebido" || c.situacao === "isento";

/** As parcelas de um mês com as ações e, enquanto houver parcela em aberto, "Isentar este mês" ou "Isentar mês inteiro". */
function CobrancasDoMes({
  doMes,
  ocupado,
  acoes,
  onIsentarMes,
  grade,
}: {
  doMes: Cobranca[];
  ocupado: boolean;
  acoes: AcoesCobranca;
  onIsentarMes: () => void;
  /** Colunas da grade das parcelas (a lista usa mais de uma em telas largas). */
  grade?: string;
}) {
  if (!doMes.length) return <p className="text-xs text-muted-foreground">Fora da cobrança neste mês.</p>;
  const parcelado = doMes[0].total > 1;
  return (
    <div className="space-y-2">
      <div className={cn("grid gap-1.5", grade)}>
        {doMes.map((c) => (
          <CobrancaLinha key={`${c.mes}-${c.parcela}`} cobranca={c} ocupado={ocupado} {...acoes} />
        ))}
      </div>
      {doMes.some((c) => !quitadaOuIsenta(c)) && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={ocupado}
          onClick={(e) => { e.stopPropagation(); onIsentarMes(); }}
        >
          {parcelado ? "Isentar mês inteiro" : "Isentar este mês"}
        </Button>
      )}
    </div>
  );
}

/** Botão vermelho do atrasado acumulado da fonte (abre a lista do que está devendo). */
function BotaoAtrasado({ total, ocupado, onAbrir }: { total: number; ocupado: boolean; onAbrir: () => void }) {
  return (
    <Button
      type="button"
      variant="destructive"
      size="sm"
      disabled={ocupado}
      onClick={(e) => { e.stopPropagation(); onAbrir(); }}
    >
      <AlertCircle aria-hidden="true" />
      {`Atrasado: ${formatBRL(total)}`}
    </Button>
  );
}

function FinanceiroPage() {
  const navigate = useNavigate();
  const busca = Route.useSearch();
  const [data, setData] = useCachedState<FinanceiroView[]>(CACHE_KEYS.financeiro, []);
  const [registros, setRegistros] = useCachedState<RegistroRecebimento[]>(CACHE_KEYS.financeiroRegistros, []);
  const [loading, setLoading] = useState(!(hasCached(CACHE_KEYS.financeiro) && hasCached(CACHE_KEYS.financeiroRegistros)));
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [filterTipo, setFilterTipo] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingFonte, setEditingFonte] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Fonte do histórico (Sheet) pelo id: os dados dela vêm sempre da última carga
  const [historicoId, setHistoricoId] = useState<string | null>(null);
  const [mesHistorico, setMesHistorico] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const historicoRef = useRef<string | null>(null);

  // Ações da cobrança: uma por vez por fonte (o ref barra o clique duplo antes de o estado chegar à tela)
  const ocupadasRef = useRef<ReadonlySet<string>>(new Set());
  const [ocupadas, setOcupadas] = useState<ReadonlySet<string>>(() => new Set());
  // Janelas da cobrança, uma de cada na página. Desfazer e atrasado guardam "aberto" à parte para o conteúdo não
  // sumir durante a animação de fechar
  const [valorAlvo, setValorAlvo] = useState<ChaveCobranca | null>(null);
  const [isencaoAlvo, setIsencaoAlvo] = useState<ChaveIsencao | null>(null);
  const [desfazer, setDesfazer] = useState<{ chave: ChaveCobranca; aberto: boolean } | null>(null);
  const [janelaAtrasado, setJanelaAtrasado] = useState<{ fonteId: string; aberto: boolean } | null>(null);

  // Só a carga mais nova entra na tela (uma ação pode recarregar enquanto outra carga ainda está correndo)
  const cargaRef = useRef<{ id: number; promessa: Promise<void> } | null>(null);

  // Fontes (financeiro_view) e recebimentos desde o primeiro mês cobrado, sempre juntos
  const fetchFinanceiro = (): Promise<void> => {
    if (!hasCached(CACHE_KEYS.financeiro) || !hasCached(CACHE_KEYS.financeiroRegistros)) setLoading(true);
    const id = (cargaRef.current?.id ?? 0) + 1;
    const promessa = (async (): Promise<void> => {
      let resultado: Awaited<ReturnType<typeof loadFinanceiroCompleto>> | null = null;
      let falha: { message?: string } | null = null;
      try {
        resultado = await loadFinanceiroCompleto();
      } catch (error) {
        falha = (error ?? {}) as { message?: string };
      }
      // Começou uma carga mais nova: esta não entra, e quem pediu esta espera aquela (a tela só destrava atualizada)
      const maisNova = cargaRef.current;
      if (maisNova && maisNova.id !== id) return maisNova.promessa;
      if (resultado) {
        setData(resultado.fontes as FinanceiroView[]);
        setRegistros(resultado.registros);
      } else {
        toast.error("Erro ao carregar financeiro: " + falha?.message);
      }
      setLoading(false);
    })();
    cargaRef.current = { id, promessa };
    return promessa;
  };

  useEffect(() => {
    fetchFinanceiro();
  }, []);

  // Hoje em Brasília (o mesmo do banco); meses "YYYY-MM"
  const hoje = hojeBrasilia();
  const mesAtual = hoje.slice(0, 7);

  // Cobrança mês a mês de cada fonte, de "cobrar a partir de" até o mês atual
  const cobrancasPorFonte = useMemo(() => {
    const registrosPorFonte = new Map<string, RegistroRecebimento[]>();
    for (const r of registros) {
      const lista = registrosPorFonte.get(r.fonte_id);
      if (lista) lista.push(r);
      else registrosPorFonte.set(r.fonte_id, [r]);
    }
    return new Map(data.map((f) => [f.fonte_id, cobrancasDaFonte(f, registrosPorFonte.get(f.fonte_id) ?? [], hoje)]));
  }, [data, registros, hoje]);

  // Mês escolhido (da URL), dentro dos meses navegáveis; inválido ou fora deles vira o mês atual
  const navegaveis = useMemo(() => mesesNavegaveis(data, hoje), [data, hoje]);
  const mes = mesEscolhido(busca.mes, navegaveis, hoje);
  const posicaoDoMes = navegaveis.indexOf(mes);
  const irParaMes = (alvo: string) => {
    // O mês atual não vai para a URL: /financeiro sozinho sempre abre no mês de hoje
    navigate({ to: "/financeiro", search: alvo === mesAtual ? {} : { mes: alvo }, replace: true });
  };

  const porFonte = useMemo(
    () =>
      new Map(
        data.map((f): [string, ResumoDaFonte] => {
          const cobrancas = cobrancasPorFonte.get(f.fonte_id) ?? [];
          const doMes = cobrancas.filter((c) => c.mes === mes);
          return [f.fonte_id, { cobrancas, doMes, situacao: situacaoDoMesCobrado(doMes), atrasado: atrasadoDe(cobrancas) }];
        }),
      ),
    [data, cobrancasPorFonte, mes],
  );
  const resumoDe = (fonteId: string) => porFonte.get(fonteId) ?? SEM_COBRANCA;

  const filteredData = useMemo(() => {
    return data.filter(item => {
      const matchesTipo = filterTipo === "all" || item.tipo === filterTipo;
      const matchesStatus = filterStatus === "all" || porFonte.get(item.fonte_id)?.situacao === filterStatus;
      const matchesSearch = item.nome.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTipo && matchesStatus && matchesSearch;
    });
  }, [data, porFonte, filterTipo, filterStatus, searchQuery]);

  // Cartões do topo: os do mês escolhido somam as parcelas desse mês; o Atrasado é o acumulado até hoje
  const metrics = useMemo(() => {
    const resumos = [...porFonte.values()];
    const atrasado = atrasadoDe(resumos.flatMap((r) => r.cobrancas));
    const cobradas = resumos.filter((r) => r.situacao !== "fora");
    return {
      ...totaisDe(resumos.flatMap((r) => r.doMes)),
      atrasado: atrasado.total,
      atrasoDeMesesAnteriores: atrasado.itens.some((c) => c.mes < mesAtual),
      fontes: resumos.length,
      fontesCobradas: cobradas.length,
      fontesResolvidas: cobradas.filter((r) => r.situacao === "recebido" || r.situacao === "isento").length,
      fontesComIsencao: resumos.filter((r) => r.doMes.some((c) => c.situacao === "isento")).length,
      fontesEmAberto: resumos.filter((r) => r.doMes.some((c) => c.falta > 0)).length,
      fontesAtrasadas: resumos.filter((r) => r.atrasado.total > 0).length,
    };
  }, [porFonte, mesAtual]);

  const marcarOcupada = (fonteId: string, ocupada: boolean) => {
    const proximas = new Set(ocupadasRef.current);
    if (ocupada) proximas.add(fonteId);
    else proximas.delete(fonteId);
    ocupadasRef.current = proximas;
    setOcupadas(proximas);
  };

  const carregarHistorico = async (fonteId: string) => {
    try {
      const { data: history, error } = await supabase
        .from("financeiro_recebimentos")
        .select("*")
        .eq("fonte_id", fonteId)
        .order("mes_referencia", { ascending: false })
        .limit(72); // 12 meses de até 6 parcelas
      if (error) throw error;
      // A resposta de uma fonte que já não está aberta não entra
      if (historicoRef.current === fonteId) setHistoryData(history || []);
    } catch (error: any) {
      console.error("Erro ao carregar histórico:", error);
    }
  };

  /**
   * Grava uma ação da cobrança da fonte (uma por vez por fonte) e depois recarrega fontes, recebimentos e o histórico
   * aberto, com a fonte travada até a tela estar atualizada. `aoGravar` fecha a janela da ação; no erro ela fica aberta.
   */
  const executar = async (fonteId: string, acao: () => Promise<void>, sucesso: string, aoGravar?: () => void) => {
    if (ocupadasRef.current.has(fonteId)) return;
    marcarOcupada(fonteId, true);
    try {
      await acao();
      aoGravar?.();
      toast.success(sucesso);
    } catch (error) {
      console.error("Erro ao salvar a cobrança:", error);
      toast.error("Não foi possível salvar. Tente de novo.");
    }
    try {
      await Promise.all([fetchFinanceiro(), historicoRef.current === fonteId ? carregarHistorico(fonteId) : null]);
    } finally {
      marcarOcupada(fonteId, false);
    }
  };

  /** A cobrança atual (da última carga) de uma chave guardada numa janela. */
  const cobrancaDe = (chave: ChaveCobranca | null | undefined): Cobranca | null =>
    chave ? (cobrancasPorFonte.get(chave.fonteId)?.find((c) => c.mes === chave.mes && c.parcela === chave.parcela) ?? null) : null;

  const acoesDe = (fonteId: string): AcoesCobranca => ({
    onValorCheio: (c) => { executar(fonteId, () => confirmarValorCheio(fonteId, c), "Pagamento confirmado"); },
    onConfigurar: (c) => setValorAlvo({ fonteId, mes: c.mes, parcela: c.parcela }),
    // Pagamento único: isentar a parcela é isentar o mês
    onIsentar: (c) => setIsencaoAlvo({ fonteId, modo: c.total > 1 ? "parcela" : "mes", mes: c.mes, parcela: c.parcela }),
    onDesfazer: (c) => setDesfazer({ chave: { fonteId, mes: c.mes, parcela: c.parcela }, aberto: true }),
  });

  const isentarMesDe = (fonteId: string, doMes: Cobranca[]) => {
    const primeira = doMes[0];
    if (!primeira) return;
    const parcelado = primeira.total > 1;
    setIsencaoAlvo({ fonteId, modo: parcelado ? "mes_inteiro" : "mes", mes: primeira.mes, parcela: parcelado ? null : primeira.parcela });
  };

  // "Configurar valor recebido"
  const valorCobranca = cobrancaDe(valorAlvo);
  const valorOcupado = !!valorAlvo && ocupadas.has(valorAlvo.fonteId);
  const confirmarValor = (valor: number, dataIso: string) => {
    const c = valorCobranca;
    if (!valorAlvo || !c) return;
    const { fonteId } = valorAlvo;
    executar(fonteId, () => confirmarValorRecebido(fonteId, c, valor, dataIso), "Valor recebido salvo", () => setValorAlvo(null));
  };

  // Isentar (parcela, este mês ou mês inteiro)
  const alvoIsencao: AlvoIsencao | null = (() => {
    if (!isencaoAlvo) return null;
    const { fonteId, modo, mes: mesAlvo, parcela } = isencaoAlvo;
    const cobrancas = (cobrancasPorFonte.get(fonteId) ?? []).filter((c) => c.mes === mesAlvo && (parcela === null || c.parcela === parcela));
    return cobrancas.length ? { modo, cobrancas } : null;
  })();
  const isencaoOcupada = !!isencaoAlvo && ocupadas.has(isencaoAlvo.fonteId);
  const confirmarIsencao = (motivo: string) => {
    if (!isencaoAlvo || !alvoIsencao) return;
    const { fonteId, modo } = isencaoAlvo;
    const { cobrancas } = alvoIsencao;
    executar(
      fonteId,
      () => (modo === "mes_inteiro" ? isentarMes(fonteId, cobrancas, motivo) : isentarCobranca(fonteId, cobrancas[0], motivo)),
      modo === "parcela" ? "Parcela isentada" : "Mês isentado",
      () => setIsencaoAlvo(null),
    );
  };

  // Desfazer (com confirmação)
  const desfazerCobrancaAlvo = cobrancaDe(desfazer?.chave);
  const desfazerOcupado = !!desfazer && ocupadas.has(desfazer.chave.fonteId);
  // Isenta que já tinha pagamento só perde a isenção (o pagamento fica); o resto apaga o acerto
  const desfazerMantemPagamento = desfazerCobrancaAlvo?.situacao === "isento" && desfazerCobrancaAlvo.pago > 0;
  const fecharDesfazer = () => setDesfazer((d) => (d ? { ...d, aberto: false } : d));
  const confirmarDesfazer = () => {
    const c = desfazerCobrancaAlvo;
    if (!desfazer || !c) return;
    executar(desfazer.chave.fonteId, () => desfazerCobranca(c), "Desfeito", fecharDesfazer);
  };

  // Atrasado de uma fonte
  const fonteAtrasado = janelaAtrasado ? data.find((f) => f.fonte_id === janelaAtrasado.fonteId) ?? null : null;
  const abrirAtrasado = (fonteId: string) => setJanelaAtrasado({ fonteId, aberto: true });

  // O FonteDialog prepara o formulário ao abrir (a partir da fonte em edição, ou vazio para uma nova)
  const abrirFormulario = (fonte: FinanceiroView | null) => {
    setEditingFonte(fonte);
    setModalOpen(true);
  };

  const handleDeleteFonte = async () => {
    if (!deletingId) return;
    try {
      const { error } = await supabase.from("financeiro_fontes").delete().eq("id", deletingId);
      if (error) throw error;
      toast.success("Fonte removida com sucesso");
      fetchFinanceiro();
    } catch (error: any) {
      toast.error("Erro ao remover: " + error.message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleAtivo = async (fonte: FinanceiroView) => {
    try {
      const { error } = await supabase
        .from("financeiro_fontes")
        .update({ ativo: !fonte.ativo })
        .eq("id", fonte.fonte_id);
      if (error) throw error;
      toast.success(fonte.ativo ? "Fonte desativada" : "Fonte ativada");
      fetchFinanceiro();
    } catch (error: any) {
      toast.error("Erro ao alterar status: " + error.message);
    }
  };

  const openHistory = (fonte: FinanceiroView) => {
    if (historicoRef.current !== fonte.fonte_id) setHistoryData([]);
    historicoRef.current = fonte.fonte_id;
    setHistoricoId(fonte.fonte_id);
    // O calendário abre no mês escolhido na aba, se ele está nos 12 meses e foi cobrado
    const noCalendario = calendarioDaFonte(resumoDe(fonte.fonte_id).cobrancas, hoje, 12).some((m) => m.mes === mes && m.situacao !== "fora");
    setMesHistorico(noCalendario ? mes : null);
    setHistoryOpen(true);
    carregarHistorico(fonte.fonte_id);
  };

  const historicoPorMes = useMemo(() => agruparHistorico(historyData), [historyData]);
  const fonteHistorico = historicoId ? data.find((f) => f.fonte_id === historicoId) ?? null : null;
  const resumoHistorico = fonteHistorico ? resumoDe(fonteHistorico.fonte_id) : null;
  const calendarioHistorico = resumoHistorico ? calendarioDaFonte(resumoHistorico.cobrancas, hoje, 12) : [];
  const doMesHistorico = resumoHistorico && mesHistorico ? resumoHistorico.cobrancas.filter((c) => c.mes === mesHistorico) : [];
  const parcelasHistorico = fonteHistorico && ehFracionado(fonteHistorico) ? parcelasComForma(fonteHistorico) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financeiro</h1>
          <p className="text-muted-foreground">Receita pessoal mensal</p>
        </div>
        <Button onClick={() => abrirFormulario(null)}>
          <Plus className="mr-2 h-4 w-4" /> Nova fonte
        </Button>
      </div>

      {/* Mês mostrado nos cartões do mês e nos cards */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-lg border bg-card p-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Mês anterior"
            disabled={posicaoDoMes <= 0}
            onClick={() => irParaMes(navegaveis[posicaoDoMes - 1])}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[9.5rem] px-1 text-center text-sm font-semibold" aria-live="polite">
            {nomeDoMes(`${mes}-01`)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Próximo mês"
            disabled={posicaoDoMes < 0 || posicaoDoMes >= navegaveis.length - 1}
            onClick={() => irParaMes(navegaveis[posicaoDoMes + 1])}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        {mes !== mesAtual && (
          <Button variant="outline" size="sm" onClick={() => irParaMes(mesAtual)}>
            Mês atual
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Previsto no Mês</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBRL(metrics.previsto)}</div>
            <p className="text-xs text-muted-foreground">{contagem(metrics.fontes, "fonte ativa", "fontes ativas")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Já Recebido</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{formatBRL(metrics.recebido)}</div>
            <p className="text-xs text-muted-foreground">{metrics.fontesResolvidas} de {metrics.fontesCobradas} confirmadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Isento</CardTitle>
            <ShieldCheck className="h-4 w-4 text-sky-500" />
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", metrics.isento > 0 ? "text-sky-600" : "text-muted-foreground")}>
              {formatBRL(metrics.isento)}
            </div>
            <p className="text-xs text-muted-foreground">{contagem(metrics.fontesComIsencao, "fonte com isenção", "fontes com isenção")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Aberto</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{formatBRL(metrics.emAberto)}</div>
            <p className="text-xs text-muted-foreground">{contagem(metrics.fontesEmAberto, "fonte pendente", "fontes pendentes")}</p>
          </CardContent>
        </Card>
        <Card className="sm:max-lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Atrasado</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", metrics.atrasado > 0 ? "text-red-600" : "text-muted-foreground")}>
              {formatBRL(metrics.atrasado)}
            </div>
            <p className="text-xs text-muted-foreground">{contagem(metrics.fontesAtrasadas, "fonte em atraso", "fontes em atraso")}</p>
            {metrics.atrasoDeMesesAnteriores && (
              <p className="text-xs font-medium text-red-600">inclui meses anteriores</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar fonte..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={filterTipo} onValueChange={setFilterTipo}>
          <SelectTrigger className="w-[180px]">
            <Building2 className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Tipos</SelectItem>
            <SelectItem value="agencia">Agências</SelectItem>
            <SelectItem value="cliente_pessoal">Clientes Pessoais</SelectItem>
            <SelectItem value="freelancer">Freelancers</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[180px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Status</SelectItem>
            {FILTROS_DE_SITUACAO.map((s) => (
              <SelectItem key={s} value={s}>{INFO_SITUACAO[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex border rounded-md p-1">
          <Button
            variant={viewMode === "cards" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setViewMode("cards")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setViewMode("list")}
          >
            <ListIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 rounded-xl border bg-card animate-pulse" />
          ))}
        </div>
      ) : filteredData.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed rounded-xl bg-muted/30">
          <DollarSign size={48} className="mx-auto mb-4 opacity-20" />
          <p className="text-muted-foreground font-medium">Nenhuma fonte financeira encontrada.</p>
          <Button variant="link" onClick={() => { setSearchQuery(""); setFilterTipo("all"); setFilterStatus("all"); }}>
            Limpar filtros
          </Button>
        </div>
      ) : viewMode === "cards" ? (
        // Duas colunas até telas bem largas: as ações das parcelas precisam de uns 200 px
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredData.map((fonte) => {
            const resumo = resumoDe(fonte.fonte_id);
            const info = INFO_SITUACAO[resumo.situacao];
            const parcelas = parcelasDaFonte(fonte);
            const fracionado = ehFracionado(fonte);
            const ocupado = ocupadas.has(fonte.fonte_id);
            const resolvidas = resumo.doMes.filter(quitadaOuIsenta).length;
            return (
              <Card
                key={fonte.fonte_id}
                className={cn(
                  "group relative transition-all hover:shadow-md cursor-pointer border-l-4",
                  BORDA_DO_MES[resumo.situacao],
                  resumo.situacao === "recebido" && "bg-emerald-50/30 dark:bg-emerald-950/10"
                )}
                onClick={() => openHistory(fonte)}
              >
                <CardHeader className="p-4 pb-2 space-y-0">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="min-w-0 max-w-full text-base font-bold truncate">{fonte.nome}</CardTitle>
                        <TipoBadge tipo={fonte.tipo} agenciaId={fonte.agencia_id} className="text-[9px] py-0 px-1.5 h-4" />
                        <FormaBadge forma={formaDePagamento(fonte.forma_pagamento)} className="text-[9px] py-0 px-1.5 h-4" />
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 transition-opacity">
                          <MoreVertical size={14} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[160px]">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); abrirFormulario(fonte); }}>
                          <Pencil size={12} className="mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleToggleAtivo(fonte); }}>
                          {fonte.ativo ? (
                            <><XCircle size={12} className="mr-2" /> Desativar</>
                          ) : (
                            <><CheckCircle2 size={12} className="mr-2" /> Ativar</>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => { e.stopPropagation(); setDeletingId(fonte.fonte_id); }}
                        >
                          <Trash2 size={12} className="mr-2" /> Remover
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xl font-bold">{formatBRL(fonte.valor_mensal)}</div>
                      {resumo.atrasado.total > 0 && (
                        <BotaoAtrasado total={resumo.atrasado.total} ocupado={ocupado} onAbrir={() => abrirAtrasado(fonte.fonte_id)} />
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span>
                        {fracionado
                          ? `${parcelas.length} parcelas · ${descreverDias(parcelas)}`
                          : `Todo dia ${fonte.dia_recebimento}`}
                      </span>
                      <Badge variant="outline" className={cn("shrink-0 text-[9px] font-bold", info.classe)}>
                        {info.label}
                        {fracionado && resumo.doMes.length > 0 && resolvidas < resumo.doMes.length && ` · ${resolvidas}/${resumo.doMes.length}`}
                      </Badge>
                    </div>
                  </div>
                  <Separator />
                  <div className="pt-1">
                    <CobrancasDoMes
                      doMes={resumo.doMes}
                      ocupado={ocupado}
                      acoes={acoesDe(fonte.fonte_id)}
                      onIsentarMes={() => isentarMesDe(fonte.fonte_id, resumo.doMes)}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left py-3 px-3 sm:px-4 font-semibold">Nome</th>
                <th className="hidden md:table-cell text-left py-3 px-4 font-semibold">Tipo</th>
                <th className="hidden sm:table-cell text-left py-3 px-4 font-semibold">Valor</th>
                <th className="hidden md:table-cell py-3 px-4 font-semibold text-center">Dia</th>
                <th className="text-left py-3 px-3 sm:px-4 font-semibold">Status</th>
                <th className="text-right py-3 px-3 sm:px-4 font-semibold">Ações</th>
              </tr>
            </thead>
            {/* Um tbody por fonte: a linha do resumo e, embaixo, as parcelas do mês com as ações */}
            {filteredData.map((fonte) => {
              const resumo = resumoDe(fonte.fonte_id);
              const info = INFO_SITUACAO[resumo.situacao];
              const ocupado = ocupadas.has(fonte.fonte_id);
              const resolvidas = resumo.doMes.filter(quitadaOuIsenta).length;
              const forma = formaDePagamento(fonte.forma_pagamento);
              return (
                <tbody
                  key={fonte.fonte_id}
                  className={cn(
                    "border-b transition-colors hover:bg-muted/30 cursor-pointer",
                    resumo.situacao === "recebido" && "bg-emerald-50/30 dark:bg-emerald-950/10"
                  )}
                  onClick={() => openHistory(fonte)}
                >
                  <tr>
                    <td className="py-3 px-3 sm:px-4 font-medium">
                      <div>{fonte.nome}</div>
                      <div className="sm:hidden text-xs font-bold text-muted-foreground">{formatBRL(fonte.valor_mensal)}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1 md:hidden">
                        <TipoBadge tipo={fonte.tipo} agenciaId={fonte.agencia_id} className="text-[10px] py-0 px-2 h-4" />
                        <FormaBadge forma={forma} className="text-[10px] py-0 px-2 h-4" />
                      </div>
                    </td>
                    <td className="hidden md:table-cell py-3 px-4">
                      <div className="flex flex-wrap items-center gap-1">
                        <TipoBadge tipo={fonte.tipo} agenciaId={fonte.agencia_id} className="text-[10px] py-0 px-2 h-4" />
                        <FormaBadge forma={forma} className="text-[10px] py-0 px-2 h-4" />
                      </div>
                    </td>
                    <td className="hidden sm:table-cell py-3 px-4 font-bold">{formatBRL(fonte.valor_mensal)}</td>
                    <td className="hidden md:table-cell py-3 px-4 text-center">{parcelasDaFonte(fonte).map((p) => p.dia).join(" · ")}</td>
                    <td className="py-3 px-3 sm:px-4">
                      <Badge variant="outline" className={cn("text-[10px] font-bold", info.classe)}>
                        {info.label}
                        {ehFracionado(fonte) && resumo.doMes.length > 0 && resolvidas < resumo.doMes.length && ` · ${resolvidas}/${resumo.doMes.length}`}
                      </Badge>
                    </td>
                    <td className="py-3 px-3 sm:px-4 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); abrirFormulario(fonte); }}>
                          <Pencil size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); setDeletingId(fonte.fonte_id); }}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={6} className="px-3 pb-3 sm:px-4">
                      <div className="space-y-2">
                        {resumo.atrasado.total > 0 && (
                          <BotaoAtrasado total={resumo.atrasado.total} ocupado={ocupado} onAbrir={() => abrirAtrasado(fonte.fonte_id)} />
                        )}
                        <CobrancasDoMes
                          doMes={resumo.doMes}
                          ocupado={ocupado}
                          acoes={acoesDe(fonte.fonte_id)}
                          onIsentarMes={() => isentarMesDe(fonte.fonte_id, resumo.doMes)}
                          grade="sm:grid-cols-2 xl:grid-cols-3"
                        />
                      </div>
                    </td>
                  </tr>
                </tbody>
              );
            })}
          </table>
        </Card>
      )}

      {/* Modal Criar/Editar Fonte */}
      <FonteDialog
        aberto={modalOpen}
        fonte={editingFonte}
        onFechar={() => { setModalOpen(false); setEditingFonte(null); }}
        onSalvo={fetchFinanceiro}
      />

      {/* Histórico e Detalhes - Sheet */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {fonteHistorico && (
                <>
                  <TipoBadge tipo={fonteHistorico.tipo} agenciaId={fonteHistorico.agencia_id} className="text-[9px] uppercase tracking-tighter" />
                  <FormaBadge forma={formaDePagamento(fonteHistorico.forma_pagamento)} className="text-[9px]" />
                </>
              )}
              {resumoHistorico?.situacao === 'recebido' && (
                <Badge className="bg-emerald-500 text-[9px] h-4">✓ Recebido</Badge>
              )}
            </div>
            <SheetTitle className="text-xl font-bold">{fonteHistorico?.nome}</SheetTitle>
            <SheetDescription>
              Histórico de faturamento e detalhes do contrato
            </SheetDescription>
          </SheetHeader>

          <div className="mt-8 space-y-8 pb-8">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-muted/50 border space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Valor Mensal</p>
                <p className="text-xl font-bold">{formatBRL(fonteHistorico?.valor_mensal)}</p>
              </div>
              <div className="p-4 rounded-xl bg-muted/50 border space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                  {parcelasHistorico.length ? `Em ${parcelasHistorico.length} parcelas` : "Dia Recebimento"}
                </p>
                <p className="text-xl font-bold">
                  {parcelasHistorico.length ? descreverDias(parcelasHistorico) : `Todo dia ${fonteHistorico?.dia_recebimento}`}
                </p>
              </div>
            </div>

            {parcelasHistorico.length > 0 && (
              <div className="space-y-1.5">
                {parcelasHistorico.map((p, i) => (
                  <div key={p.dia} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                    <span className="text-muted-foreground">{i + 1}ª parcela · dia {p.dia}</span>
                    <span className="flex items-center gap-2">
                      <FormaBadge forma={p.forma} className="text-[10px]" />
                      <span className="font-bold">{formatBRL(p.valor)}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Calendário dos últimos 12 meses: escolher um mês mostra as parcelas dele com as ações */}
            <div className="space-y-3">
              <h4 className="text-sm font-bold flex items-center gap-2">
                <CalendarDays className="h-4 w-4" /> Calendário de cobrança
              </h4>
              <CalendarioCobranca
                meses={calendarioHistorico}
                selecionado={mesHistorico}
                onSelecionar={(m) => setMesHistorico((atual) => (atual === m ? null : m))}
              />
              {fonteHistorico && mesHistorico ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">{nomeDoMes(`${mesHistorico}-01`)}</p>
                  <CobrancasDoMes
                    doMes={doMesHistorico}
                    ocupado={ocupadas.has(fonteHistorico.fonte_id)}
                    acoes={acoesDe(fonteHistorico.fonte_id)}
                    onIsentarMes={() => isentarMesDe(fonteHistorico.fonte_id, doMesHistorico)}
                  />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Escolha um mês para ver as parcelas dele.</p>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <History className="h-4 w-4" /> Histórico (Últimos 12 meses)
                </h4>
              </div>

              {historicoPorMes.length === 0 ? (
                <div className="text-center py-10 border rounded-xl bg-muted/20">
                  <p className="text-sm text-muted-foreground">Nenhum recebimento registrado ainda.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {historicoPorMes.map((mesHist) => (
                    <div key={mesHist.mes} className="p-3 border rounded-lg bg-card shadow-sm space-y-2">
                      <span className="text-sm font-bold capitalize">{mesHist.nome}</span>
                      {mesHist.itens.map((rec) => {
                        // Isento e parcial (valor menor que o devido) vieram com a cobrança mês a mês
                        const isento = !!rec.isento;
                        const parcial = !isento && !!rec.recebido && rec.valor_devido != null && rec.valor_recebido != null
                          && Number(rec.valor_recebido) < Number(rec.valor_devido) - 0.005;
                        return (
                          <div key={rec.id} className="flex items-center justify-between gap-2">
                            <span className="text-[10px] text-muted-foreground">
                              {mesHist.itens.length > 1 || (rec.parcela ?? 1) > 1 ? `${rec.parcela ?? 1}ª parcela · ` : ""}
                              {isento
                                ? "Isento"
                                : rec.recebido
                                  ? `Recebido${rec.data_confirmacao ? ` em ${new Date(rec.data_confirmacao).toLocaleDateString('pt-BR')}` : ""}`
                                  : 'Não recebido'}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className={cn("text-sm font-bold", rec.recebido ? "text-emerald-600" : "text-muted-foreground")}>
                                {rec.valor_recebido != null ? formatBRL(rec.valor_recebido) : "—"}
                              </span>
                              {isento ? (
                                <Badge variant="outline" className={cn("text-[9px] h-4 py-0", INFO_SITUACAO.isento.classe)}>Isento</Badge>
                              ) : parcial ? (
                                <Badge variant="outline" className={cn("text-[9px] h-4 py-0", INFO_SITUACAO.parcial.classe)}>Parcial</Badge>
                              ) : rec.recebido ? (
                                <Badge variant="outline" className="text-[9px] h-4 py-0 border-emerald-200 text-emerald-600 bg-emerald-50">Confirmado</Badge>
                              ) : (
                                <Badge variant="outline" className="text-[9px] h-4 py-0 text-muted-foreground">Pendente</Badge>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {fonteHistorico?.observacoes && (
              <div className="space-y-2">
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <Info className="h-4 w-4" /> Observações
                </h4>
                <div className="p-4 rounded-xl bg-muted/30 border text-xs leading-relaxed italic text-muted-foreground">
                  {fonteHistorico.observacoes}
                </div>
              </div>
            )}

            <div className="pt-4">
              <Button className="w-full" variant="outline" onClick={() => { setHistoryOpen(false); abrirFormulario(fonteHistorico); }}>
                <Pencil size={14} className="mr-2" /> Editar Configurações da Fonte
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Janelas da cobrança: uma de cada na página (fora dos cards, para o clique nelas não abrir o histórico) */}
      <AtrasadoDialog
        aberto={!!janelaAtrasado?.aberto && !!fonteAtrasado}
        onFechar={() => setJanelaAtrasado((j) => (j ? { ...j, aberto: false } : j))}
        nome={fonteAtrasado?.nome ?? ""}
        atrasado={fonteAtrasado ? resumoDe(fonteAtrasado.fonte_id).atrasado : SEM_COBRANCA.atrasado}
        {...acoesDe(fonteAtrasado?.fonte_id ?? "")}
        ocupado={!!fonteAtrasado && ocupadas.has(fonteAtrasado.fonte_id)}
      />

      <ValorRecebidoDialog
        cobranca={valorCobranca}
        fonteId={valorAlvo?.fonteId}
        ocupado={valorOcupado}
        onFechar={() => setValorAlvo(null)}
        onConfirmar={confirmarValor}
      />

      <IsentarDialog
        alvo={alvoIsencao}
        fonteId={isencaoAlvo?.fonteId}
        ocupado={isencaoOcupada}
        onFechar={() => setIsencaoAlvo(null)}
        onConfirmar={confirmarIsencao}
      />

      <AlertDialog open={!!desfazer?.aberto} onOpenChange={(o) => { if (!o && !desfazerOcupado) fecharDesfazer(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desfazer o acerto desta parcela?</AlertDialogTitle>
            <AlertDialogDescription>
              {desfazerMantemPagamento
                ? "A isenção sai e o valor já recebido continua registrado."
                : "O acerto desta parcela é apagado e ela volta a ficar em aberto."}
            </AlertDialogDescription>
            {desfazerCobrancaAlvo && (
              <p className="text-sm font-medium">
                {nomeDoMes(`${desfazerCobrancaAlvo.mes}-01`)}
                {desfazerCobrancaAlvo.total > 1 ? ` · parcela ${desfazerCobrancaAlvo.parcela}/${desfazerCobrancaAlvo.total}` : ""}
                {` · ${formatBRL(desfazerCobrancaAlvo.valor)}`}
              </p>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={desfazerOcupado}>Cancelar</AlertDialogCancel>
            <Button type="button" disabled={desfazerOcupado || !desfazerCobrancaAlvo} onClick={confirmarDesfazer}>
              {desfazerOcupado ? "Desfazendo..." : "Desfazer"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog Remover */}
      <AlertDialog open={!!deletingId} onOpenChange={(o) => { if (!o) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover fonte financeira?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os recebimentos históricos de <strong>{data.find(f => f.fonte_id === deletingId)?.nome}</strong> serão deletados permanentemente. Esta ação não pode ser desfeita.
              <br/><br/>
              <em>Dica: Você pode apenas desativar a fonte para manter o histórico mas removê-la dos cálculos mensais.</em>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                if (deletingId) {
                  const f = data.find(it => it.fonte_id === deletingId);
                  if (f) handleToggleAtivo(f);
                }
                setDeletingId(null);
              }}
            >
              Apenas desativar
            </Button>
            <AlertDialogAction onClick={handleDeleteFonte} className="bg-destructive hover:bg-destructive/90">
              Remover permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
