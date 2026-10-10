// Janela de criar/editar fonte de receita da aba Financeiro (extraída de routes/_authenticated/financeiro.tsx).
// Também usada pelo CRM para cadastrar o lead ganho. Além do pagamento: forma de pagamento (do cliente e de cada
// parcela) e "cobrar a partir de" (primeiro mês que entra na conta do atrasado).
import { useState } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { parseBRLInput, maskBRLInput } from "@/lib/clientes";
import {
  dividirEmParcelas,
  validarParcelas,
  ordenarParcelas,
  ehFracionado,
  parcelasDaFonte,
  textoDoValor,
  mudouAsParcelas,
  nomeDoMes,
  statusDaParcela,
  vencimentoNoMes,
  MIN_PARCELAS,
  type TipoFonte,
  type Parcela,
  type RecebimentoMes,
} from "@/lib/financeiro";
import { ANO_COBRANCA_MAX, ANO_COBRANCA_MIN, COBRANCA_DESDE_PADRAO, FORMAS_DE_PAGAMENTO, formaDePagamento, type FormaPagamento } from "@/lib/financeiroCobranca";
import { hojeBrasilia } from "@/lib/entrega";
import type { DadosPorCliente } from "@/lib/financeiroPorClienteDados";
import type { ModeloPorCliente, TipoRecebimento } from "@/lib/financeiroPorCliente";
import { ParcelasEditor } from "@/components/financeiro/ParcelasEditor";
import { useAgencias } from "@/lib/agencias";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Valor do item "Sem agência" no seletor (o Select do Radix não aceita valor vazio). */
const SEM_AGENCIA = "__sem_agencia__";
/** Idem para "Não informada" na forma de pagamento (grava null). */
const SEM_FORMA = "__sem_forma__";

const FORMAS = Object.keys(FORMAS_DE_PAGAMENTO) as FormaPagamento[];

/** As parcelas da fonte em ordem de dia, mantendo a forma de cada uma (parcelasDaFonte só devolve dia e valor). */
function parcelasParaEditar(fonte: FinanceiroView): Parcela[] {
  return parcelasDaFonte(fonte).map((p) => {
    const forma = formaDePagamento(fonte.parcelas?.find((o) => Number(o.dia) === p.dia)?.forma);
    return forma ? { ...p, forma } : p;
  });
}

export type FinanceiroView = {
  fonte_id: string;
  user_id: string;
  nome: string;
  tipo: TipoFonte;
  /** Só no freelancer: a agência para quem o trabalho é feito */
  agencia_id: string | null;
  valor_mensal: number;
  dia_recebimento: number;
  ativo: boolean;
  observacoes: string | null;
  mes_atual: string;
  recebimento_id: string | null;
  recebido_mes_atual: boolean;
  data_confirmacao: string | null;
  valor_recebido: number | null;
  status_mes: 'recebido' | 'atrasado' | 'pendente' | 'a_vencer';
  /** null = pagamento único; fracionado = [{ dia, valor }] */
  parcelas: Parcela[] | null;
  /** Recebimentos do mês atual, um por parcela já marcada */
  recebimentos_mes: RecebimentoMes[] | null;
  /** pix | cartao | boleto; null = não informada */
  forma_pagamento?: string | null;
  /** Primeiro mês cobrado ("YYYY-MM-DD", sempre dia 1) */
  cobranca_desde?: string | null;
  /** Último mês cobrado ("YYYY-MM-DD"); preenchido = contrato encerrado */
  cobranca_ate?: string | null;
  /** fixo (padrão) | por_cliente: o valor do mês vem dos clientes da agência */
  tipo_recebimento?: string | null;
  modelo_por_cliente?: string | null;
  valor_fixo?: number | null;
  valor_por_cliente?: number | null;
  /** Só em fonte por cliente: clientes da agência e valores personalizados (vem de enriquecerPorCliente) */
  por_cliente?: DadosPorCliente | null;
};

/** Pré-preenchimento de uma fonte nova (ex.: lead ganho no CRM) */
export type FonteInicial = { nome?: string; valorMensal?: number; observacoes?: string };

export interface FonteDialogProps {
  aberto: boolean;
  onFechar: () => void;
  /** Fonte em edição; null = fonte nova */
  fonte: FinanceiroView | null;
  inicial?: FonteInicial;
  /** Chamado depois de gravar, antes de `onFechar` */
  onSalvo: () => void;
}

export function FonteDialog({ aberto, onFechar, fonte, inicial, onSalvo }: FonteDialogProps) {
  // Fonte em edição e pré-preenchimento fixados ao abrir (não mudam enquanto a janela fecha)
  const [editingFonte, setEditingFonte] = useState<FinanceiroView | null>(null);
  const [inicialAberto, setInicialAberto] = useState<FonteInicial | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  // Valor/dia do pagamento único e as parcelas do fracionado (o resto do formulário é lido pelo FormData)
  const [valorMensalTexto, setValorMensalTexto] = useState("");
  const [diaTexto, setDiaTexto] = useState("1");
  const [fracionado, setFracionado] = useState(false);
  const [parcelasForm, setParcelasForm] = useState<Parcela[]>([]);
  const [tipoForm, setTipoForm] = useState<TipoFonte>("agencia");
  const [agenciaForm, setAgenciaForm] = useState<string | null>(null);
  // Forma de pagamento do cliente (SEM_FORMA = não informada) e primeiro mês cobrado ("YYYY-MM")
  const [formaForm, setFormaForm] = useState<string>(SEM_FORMA);
  const [cobrancaDesdeForm, setCobrancaDesdeForm] = useState("");
  // Encerrar contrato (freelancer): liga e o último mês cobrado ("YYYY-MM")
  const [encerrarForm, setEncerrarForm] = useState(false);
  const [cobrancaAteForm, setCobrancaAteForm] = useState("");
  // Recebimento fixo ou por cliente (modelo, fixo e valor padrão por cliente)
  const [recebimentoForm, setRecebimentoForm] = useState<TipoRecebimento>("fixo");
  const [modeloForm, setModeloForm] = useState<ModeloPorCliente>("fixo_variavel");
  const [valorFixoTexto, setValorFixoTexto] = useState("");
  const [valorPorClienteTexto, setValorPorClienteTexto] = useState("");
  const { todasAgencias } = useAgencias();

  // Ao abrir, prepara o formulário (ajuste de estado durante o render: o conteúdo já monta com os valores certos,
  // o que importa para os campos não controlados — nome, ativo e observações)
  const [estavaAberto, setEstavaAberto] = useState(false);
  const [abertura, setAbertura] = useState(0);
  if (aberto !== estavaAberto) {
    setEstavaAberto(aberto);
    if (aberto) {
      setAbertura(abertura + 1);
      setEditingFonte(fonte);
      setInicialAberto(fonte ? undefined : inicial);
      const emParcelas = fonte && ehFracionado(fonte) ? parcelasParaEditar(fonte) : null;
      setFracionado(!!emParcelas);
      setParcelasForm(emParcelas || []);
      // O valor vai para a máscara em reais (a máscara lê dígitos como centavos: 3500 viraria "35,00")
      setValorMensalTexto(
        fonte
          ? textoDoValor(fonte.valor_mensal)
          : inicial?.valorMensal
            ? maskBRLInput(String(Math.round(inicial.valorMensal * 100)))
            : "",
      );
      setDiaTexto(String(fonte?.dia_recebimento || 1));
      setTipoForm(fonte?.tipo || "agencia");
      setAgenciaForm(fonte?.agencia_id ?? null);
      setFormaForm(formaDePagamento(fonte?.forma_pagamento) ?? SEM_FORMA);
      setRecebimentoForm(fonte?.tipo_recebimento === "por_cliente" ? "por_cliente" : "fixo");
      setModeloForm(fonte?.modelo_por_cliente === "so_variavel" ? "so_variavel" : "fixo_variavel");
      setValorFixoTexto(fonte?.valor_fixo ? textoDoValor(fonte.valor_fixo) : "");
      setValorPorClienteTexto(fonte?.valor_por_cliente ? textoDoValor(fonte.valor_por_cliente) : "");
      // Fonte nova começa a ser cobrada neste mês; fonte antiga sem o campo (cache de antes da migration) em setembro de 2026
      setEncerrarForm(!!fonte?.cobranca_ate);
      setCobrancaAteForm(String(fonte?.cobranca_ate ?? hojeBrasilia()).slice(0, 7));
      setCobrancaDesdeForm(String(fonte ? (fonte.cobranca_desde ?? COBRANCA_DESDE_PADRAO) : hojeBrasilia()).slice(0, 7));
    }
  }

  // Hoje e o mês atual em Brasília ("YYYY-MM-DD" e "YYYY-MM")
  const hoje = hojeBrasilia();
  const mesAtual = hoje.slice(0, 7);
  // As parcelas como estão no formulário (pagamento único = uma parcela com o valor e o dia)
  const parcelasDoFormulario: Parcela[] = fracionado
    ? parcelasForm
    : [{ dia: parseInt(diaTexto), valor: parseBRLInput(valorMensalTexto) }];
  // Editar a quantidade, os dias ou os valores refaz a cobrança dos meses que já passaram (cada mês usa as parcelas
  // atuais): com "cobrar a partir de" antes deste mês, avisa e oferece cobrar só daqui para frente
  const porCliente = recebimentoForm === "por_cliente";
  const avisoMesesAnteriores =
    !!editingFonte &&
    !porCliente &&
    /^\d{4}-\d{2}$/.test(cobrancaDesdeForm) &&
    cobrancaDesdeForm < mesAtual &&
    mudouAsParcelas(parcelasDaFonte(editingFonte), parcelasDoFormulario);
  // Cobrança começando neste mês com o (primeiro) vencimento já passado da tolerância: o mês nasce atrasado
  const primeiroDia = ordenarParcelas(parcelasDoFormulario)[0]?.dia;
  const diaDoAviso =
    typeof primeiroDia === "number" && Number.isInteger(primeiroDia) && primeiroDia >= 1 && primeiroDia <= 31 ? primeiroDia : null;
  const comecaAtrasado =
    cobrancaDesdeForm === mesAtual &&
    diaDoAviso !== null &&
    statusDaParcela(vencimentoNoMes(diaDoAviso, hoje), false, hoje) === "atrasado";

  const alternarFracionado = (ativo: boolean) => {
    setFracionado(ativo);
    // Ao ligar, sugere o valor atual dividido em 2 parcelas espalhadas pelo mês
    if (ativo && parcelasForm.length < MIN_PARCELAS) {
      setParcelasForm(dividirEmParcelas(parseBRLInput(valorMensalTexto), MIN_PARCELAS, parseInt(diaTexto) || 1));
    }
  };

  const handleSaveFonte = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // parcelas como tipo literal (não a interface Parcela) para caber no Json do Supabase
    let pagamento: { valor_mensal: number; dia_recebimento: number; parcelas: { dia: number; valor: number; forma?: string }[] | null };
    // Chrome aceita ano de até 6 dígitos no campo de mês: "26" vira 0026 e não pode ser gravado
    const anoCobranca = Number(cobrancaDesdeForm.slice(0, 4));
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(cobrancaDesdeForm) || anoCobranca < ANO_COBRANCA_MIN || anoCobranca > ANO_COBRANCA_MAX) {
      toast.error(`Informe o mês e o ano (de ${ANO_COBRANCA_MIN} a ${ANO_COBRANCA_MAX}).`);
      return;
    }
    const encerra = tipoForm === "freelancer" && encerrarForm;
    if (encerra && (!/^\d{4}-(0[1-9]|1[0-2])$/.test(cobrancaAteForm) || cobrancaAteForm < cobrancaDesdeForm)) {
      toast.error('O último mês cobrado precisa ser um mês válido, igual ou depois de "Cobrar a partir de".');
      return;
    }
    if (porCliente) {
      if (!agenciaForm) {
        toast.error("Escolha a agência: os clientes dela entram na conta.");
        return;
      }
      if (!(parseBRLInput(valorPorClienteTexto) >= 0) || !valorPorClienteTexto) {
        toast.error("Informe o valor por cliente.");
        return;
      }
      // valor_mensal fica só como base guardada (o valor do mês é calculado com os clientes na hora de mostrar)
      pagamento = {
        valor_mensal: modeloForm === "fixo_variavel" ? parseBRLInput(valorFixoTexto) : 0,
        dia_recebimento: parseInt(diaTexto),
        parcelas: null,
      };
    } else if (fracionado) {
      const erro = validarParcelas(parcelasForm);
      if (erro) {
        toast.error(erro);
        return;
      }
      // A forma da parcela só é gravada quando escolhida (sem ela vale a forma do cliente)
      const parcelas = ordenarParcelas(parcelasForm).map((p) => {
        const forma = formaDePagamento(p.forma);
        return forma ? { dia: p.dia, valor: p.valor, forma } : { dia: p.dia, valor: p.valor };
      });
      const total = parcelas.reduce((t, p) => t + p.valor, 0);
      pagamento = { valor_mensal: Math.round(total * 100) / 100, dia_recebimento: parcelas[0].dia, parcelas };
    } else {
      pagamento = { valor_mensal: parseBRLInput(valorMensalTexto), dia_recebimento: parseInt(diaTexto), parcelas: null };
    }
    setSaving(true);
    const formData = new FormData(e.currentTarget);
    const values = {
      nome: formData.get("nome") as string,
      tipo: tipoForm,
      agencia_id: tipoForm === "freelancer" || porCliente ? agenciaForm : null,
      ...pagamento,
      tipo_recebimento: recebimentoForm,
      modelo_por_cliente: porCliente ? modeloForm : null,
      valor_fixo: porCliente && modeloForm === "fixo_variavel" ? parseBRLInput(valorFixoTexto) : null,
      valor_por_cliente: porCliente ? parseBRLInput(valorPorClienteTexto) : null,
      forma_pagamento: formaDePagamento(formaForm),
      cobranca_desde: `${cobrancaDesdeForm}-01`,
      cobranca_ate: encerra ? `${cobrancaAteForm}-01` : null,
      ativo: formData.get("ativo") === "on",
      observacoes: formData.get("observacoes") as string,
    };

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || 'b34bdae5-7a67-4b63-a46f-8aad43a06c63';
      // if (!user) throw new Error("Usuário não autenticado");

      if (editingFonte) {
        // forma_pagamento e cobranca_desde ainda não estão nos tipos gerados do Supabase (types.ts)
        const { error } = await supabase
          .from("financeiro_fontes")
          .update(values as any)
          .eq("id", editingFonte.fonte_id);
        if (error) throw error;
        toast.success("Fonte atualizada com sucesso");
      } else {
        const { error } = await supabase
          .from("financeiro_fontes")
          .insert([{ ...values, user_id: userId }]);
        if (error) throw error;
        toast.success("Fonte criada com sucesso");
      }
      // onSalvo antes de onFechar: quem encadeia outra janela (CRM) sabe que não foi cancelamento
      onSalvo();
      onFechar();
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
      <Dialog open={aberto} onOpenChange={(o) => { if (!o) onFechar(); }}>
        <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
          <form key={abertura} onSubmit={handleSaveFonte}>
            <DialogHeader>
              <DialogTitle>{editingFonte ? "Editar Fonte" : "Nova Fonte de Receita"}</DialogTitle>
              <DialogDescription>
                Configure os detalhes da sua fonte de faturamento pessoal.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="nome">Nome da Fonte</Label>
                <Input id="nome" name="nome" placeholder="Ex: Agência Effect, Cliente João..." defaultValue={editingFonte?.nome ?? inicialAberto?.nome} required />
              </div>
              <div className="grid gap-2">
                <Label>Tipo de Fonte</Label>
                <RadioGroup name="tipo" value={tipoForm} onValueChange={(v) => setTipoForm(v as TipoFonte)} className="flex flex-wrap gap-x-4 gap-y-2">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="agencia" id="agencia" />
                    <Label htmlFor="agencia" className="font-normal cursor-pointer">Agência</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="cliente_pessoal" id="cliente_pessoal" />
                    <Label htmlFor="cliente_pessoal" className="font-normal cursor-pointer">Cliente Pessoal</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="freelancer" id="freelancer" />
                    <Label htmlFor="freelancer" className="font-normal cursor-pointer">Freelancer</Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="grid gap-2">
                <Label>Como você recebe</Label>
                <RadioGroup value={recebimentoForm} onValueChange={(v) => setRecebimentoForm(v as TipoRecebimento)} className="flex flex-wrap gap-x-4 gap-y-2">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="fixo" id="recebimento_fixo" />
                    <Label htmlFor="recebimento_fixo" className="font-normal cursor-pointer">Pagamento fixo</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="por_cliente" id="recebimento_por_cliente" />
                    <Label htmlFor="recebimento_por_cliente" className="font-normal cursor-pointer">Recebimento por cliente</Label>
                  </div>
                </RadioGroup>
              </div>
              {porCliente && (
                <div className="grid gap-4 rounded-md border bg-muted/30 p-3">
                  <RadioGroup value={modeloForm} onValueChange={(v) => setModeloForm(v as ModeloPorCliente)} className="flex flex-wrap gap-x-4 gap-y-2">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="fixo_variavel" id="modelo_fixo_variavel" />
                      <Label htmlFor="modelo_fixo_variavel" className="font-normal cursor-pointer">Fixo + variável por cliente</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="so_variavel" id="modelo_so_variavel" />
                      <Label htmlFor="modelo_so_variavel" className="font-normal cursor-pointer">Apenas variável</Label>
                    </div>
                  </RadioGroup>
                  <div className="grid grid-cols-2 gap-4">
                    {modeloForm === "fixo_variavel" && (
                      <div className="grid gap-2">
                        <Label htmlFor="valor_fixo">Valor fixo mensal</Label>
                        <Input id="valor_fixo" placeholder="R$ 0,00" value={valorFixoTexto} onChange={(e) => setValorFixoTexto(maskBRLInput(e.target.value))} />
                      </div>
                    )}
                    <div className="grid gap-2">
                      <Label htmlFor="valor_por_cliente">Valor por cliente</Label>
                      <Input id="valor_por_cliente" placeholder="R$ 0,00" value={valorPorClienteTexto} onChange={(e) => setValorPorClienteTexto(maskBRLInput(e.target.value))} />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    O valor do mês é calculado com os clientes ativos da agência. Cliente em churn sai da conta, e na ficha da fonte você muda o valor de um cliente específico.
                  </p>
                </div>
              )}
              {(tipoForm === "freelancer" || porCliente) && (
                <div className="grid gap-2">
                  <Label htmlFor="agencia_id">Agência</Label>
                  <Select value={agenciaForm || SEM_AGENCIA} onValueChange={(v) => setAgenciaForm(v === SEM_AGENCIA ? null : v)}>
                    <SelectTrigger id="agencia_id">
                      <SelectValue placeholder="Escolha a agência" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEM_AGENCIA}>Sem agência</SelectItem>
                      {todasAgencias
                        .filter((a) => a.ativa || a.id === agenciaForm)
                        .map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {porCliente ? "Os clientes ativos dessa agência entram na conta do mês." : "Para qual agência você faz esse trabalho."}
                  </p>
                </div>
              )}
              {!porCliente && (
                <ParcelasEditor
                  ativo={fracionado}
                  onAtivoChange={alternarFracionado}
                  parcelas={parcelasForm}
                  onChange={setParcelasForm}
                />
              )}
              {(porCliente || !fracionado) && (
                <div className="grid grid-cols-2 gap-4">
                  {!porCliente ? (
                    <div className="grid gap-2">
                      <Label htmlFor="valor_mensal">Valor Mensal</Label>
                      <Input
                        id="valor_mensal"
                        name="valor_mensal"
                        placeholder="R$ 0,00"
                        value={valorMensalTexto}
                        onChange={(e) => setValorMensalTexto(maskBRLInput(e.target.value))}
                        required
                      />
                    </div>
                  ) : null}
                  <div className="grid gap-2">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="dia_recebimento">Dia do Recebimento</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info size={12} className="text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[200px]">
                            <p className="text-xs">Se o dia for 30 ou 31 e o mês não tiver, considera o último dia do mês.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      id="dia_recebimento"
                      name="dia_recebimento"
                      type="number"
                      min="1"
                      max="31"
                      value={diaTexto}
                      onChange={(e) => setDiaTexto(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid content-start gap-2">
                  <Label htmlFor="forma_pagamento">Forma de pagamento</Label>
                  <Select value={formaForm} onValueChange={setFormaForm}>
                    <SelectTrigger id="forma_pagamento" aria-label="Forma de pagamento">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FORMAS.map((f) => (
                        <SelectItem key={f} value={f}>{FORMAS_DE_PAGAMENTO[f]}</SelectItem>
                      ))}
                      <SelectItem value={SEM_FORMA}>Não informada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid content-start gap-2">
                  <Label htmlFor="cobranca_desde">Cobrar a partir de</Label>
                  <Input
                    id="cobranca_desde"
                    type="month"
                    min={`${ANO_COBRANCA_MIN}-01`}
                    max={`${ANO_COBRANCA_MAX}-12`}
                    placeholder="AAAA-MM"
                    value={cobrancaDesdeForm}
                    onChange={(e) => setCobrancaDesdeForm(e.target.value)}
                    aria-describedby={comecaAtrasado ? "cobranca_desde_ajuda cobranca_desde_atraso" : "cobranca_desde_ajuda"}
                    required
                  />
                  <p id="cobranca_desde_ajuda" className="text-xs text-muted-foreground">Meses antes disso não entram no atrasado.</p>
                  {comecaAtrasado && (
                    <p id="cobranca_desde_atraso" className="text-xs font-medium text-amber-700 dark:text-amber-400">
                      {`Com o vencimento no dia ${diaDoAviso}, este mês já começa como atrasado.`}
                    </p>
                  )}
                </div>
              </div>
              {avisoMesesAnteriores && (
                <div
                  role="note"
                  className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                >
                  <p>
                    {"Os meses anteriores passam a ser cobrados com as parcelas novas (pode aparecer atraso que não existia). Para não mexer no que já passou, cobre a partir deste mês (os meses anteriores saem da conta, inclusive o que ainda estiver em aberto neles)."}
                  </p>
                  <Button type="button" variant="outline" size="sm" className="whitespace-normal text-left" onClick={() => setCobrancaDesdeForm(mesAtual)}>
                    {`Cobrar a partir de ${nomeDoMes(hoje)}`}
                  </Button>
                </div>
              )}
              {tipoForm === "freelancer" && (
                <div className="grid gap-2 rounded-md border bg-muted/30 p-3">
                  <div className="flex items-center space-x-2">
                    <Switch id="encerrar" checked={encerrarForm} onCheckedChange={setEncerrarForm} />
                    <Label htmlFor="encerrar">Encerrar contrato</Label>
                  </div>
                  {encerrarForm && (
                    <div className="grid gap-2">
                      <Label htmlFor="cobranca_ate">Último mês cobrado</Label>
                      <Input id="cobranca_ate" type="month" min={cobrancaDesdeForm || undefined} max={`${ANO_COBRANCA_MAX}-12`} value={cobrancaAteForm} onChange={(e) => setCobrancaAteForm(e.target.value)} required />
                      <p className="text-xs text-muted-foreground">Depois desse mês não cobra mais nem avisa. O que já foi cobrado e recebido continua no histórico.</p>
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center space-x-2 py-2">
                <Switch id="ativo" name="ativo" defaultChecked={editingFonte ? editingFonte.ativo : true} />
                <Label htmlFor="ativo">Fonte ativa para faturamento</Label>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="observacoes">Observações (Opcional)</Label>
                <Textarea id="observacoes" name="observacoes" placeholder="Notas sobre o contrato, forma de pagamento..." defaultValue={editingFonte?.observacoes || inicialAberto?.observacoes || ""} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onFechar()}>Cancelar</Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando..." : editingFonte ? "Salvar Alterações" : "Criar Fonte"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
  );
}
