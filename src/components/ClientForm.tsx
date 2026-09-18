import { useForm, useFieldArray, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Trash2, Layers } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { maskBRLInput, parseBRLInput, formatBRL } from "@/lib/clientes";
import { MOEDAS, formatMoeda, simboloMoeda, paraBRL, useCotacoes, type Moeda } from "@/lib/moedas";
import { useAgencias } from "@/lib/agencias";
import { usePlataformas } from "@/lib/plataformas";
import { cn } from "@/lib/utils";

export const METODOS_PAGAMENTO = [
  { value: "pix", label: "Pix" },
  { value: "boleto", label: "Boleto" },
  { value: "cartao", label: "Cartão (sem monitoramento)" },
] as const;

const metodoPagamentoSchema = z.enum(["cartao", "pix", "boleto"]);

/** Forma de pagamento e verba de UMA plataforma (verba mensal ou total do período, conforme tipo_verba) */
const plataformaConfigSchema = z.object({
  verba: z.number().min(0),
  metodo_pagamento: metodoPagamentoSchema,
});

export type PlataformaConfig = z.infer<typeof plataformaConfigSchema>;

/**
 * Uma operação do cliente (ex.: "Canal YouTube", "E-commerce"): objetivo próprio, moeda,
 * tipo de verba, período e plataformas. Cada plataforma vira um registro de saldo.
 */
const operacaoSchema = z.object({
  id: z.string().optional(),
  nome: z.string().min(1, "Dê um nome à operação"),
  objetivo: z.string().optional(),
  moeda: z.enum(["BRL", "USD", "EUR", "GBP"]),
  tipo_verba: z.enum(["mensal", "total_periodo"]),
  /** Início e fim do período contratado (só para verba total) */
  data_inicio_verba: z.string().optional().nullable(),
  data_limite_verba: z.string().optional().nullable(),
  plataformas: z.array(z.string()),
  /** Forma de pagamento e verba de cada plataforma selecionada (chave = nome da plataforma) */
  plataformas_config: z.record(z.string(), plataformaConfigSchema),
  /** Investimento diário total na operação; se vazio, usa a verba de cada plataforma ÷ dias */
  verba_diaria: z.number().min(0).optional().nullable(),
});

export type OperacaoFormValues = z.infer<typeof operacaoSchema>;

const clientSchema = z.object({
  nome: z.string().min(2, "Nome é obrigatório"),
  agencia: z.string().min(1, "Selecione a agência"),
  nicho: z.string().optional(),
  data_inicio: z.string().min(1, "Informe a data de início"),
  observacoes: z.string().optional(),
  em_onboarding: z.boolean(),
  status_operacional: z.enum(["ativo", "pausado", "churn"]),
  /** false = cliente ainda não investe em ads (operações não entram nos totais) */
  trafego_ativo: z.boolean(),
  operacoes: z.array(operacaoSchema),
}).superRefine((values, ctx) => {
  if (!values.trafego_ativo) return;
  if (values.operacoes.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["operacoes"], message: "Adicione pelo menos uma operação ou desligue o tráfego." });
    return;
  }
  values.operacoes.forEach((op, i) => {
    if (op.plataformas.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["operacoes", i, "plataformas"], message: "Selecione pelo menos uma plataforma" });
    }
    if (op.tipo_verba === "total_periodo") {
      if (!op.data_inicio_verba) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["operacoes", i, "data_inicio_verba"], message: "Informe o início do período" });
      if (!op.data_limite_verba) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["operacoes", i, "data_limite_verba"], message: "Informe o fim do período" });
      if (op.data_inicio_verba && op.data_limite_verba && op.data_limite_verba <= op.data_inicio_verba) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["operacoes", i, "data_limite_verba"], message: "O fim precisa ser depois do início" });
      }
    }
  });
});

export type ClientFormValues = z.infer<typeof clientSchema>;

interface ClientFormProps {
  initialValues?: Partial<ClientFormValues> & {
    /** Verba estimada (ex.: lead convertido): vira a verba da primeira plataforma da primeira operação */
    verba_ads?: number | null;
    /** Forma de pagamento legada; usada como padrão das plataformas */
    metodo_pagamento?: PlataformaConfig["metodo_pagamento"];
  };
  onSubmit: (values: ClientFormValues) => void;
  loading?: boolean;
}

const toDisplay = (value: number | null | undefined) =>
  value ? maskBRLInput(String(Math.round(value * 100))) : "";

/** Dias do período contratado (mínimo 1) — mesmo cálculo usado no monitor de saldo */
export function diasDoPeriodo(dataInicio?: string | null, dataLimite?: string | null): number | null {
  if (!dataInicio || !dataLimite) return null;
  const inicio = new Date(dataInicio);
  const fim = new Date(dataLimite);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) return null;
  return Math.max(1, Math.ceil((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)));
}

/** Soma das verbas das plataformas de uma operação (na moeda dela) */
export function totalDaOperacao(op: Pick<OperacaoFormValues, "plataformas" | "plataformas_config">): number {
  return op.plataformas.reduce((acc, p) => acc + (op.plataformas_config[p]?.verba || 0), 0);
}

/** Verba mensal equivalente da operação, na moeda dela (total do período ÷ dias × 30) */
export function verbaMensalDaOperacao(op: OperacaoFormValues): number {
  const total = totalDaOperacao(op);
  if (op.tipo_verba === "mensal") return total;
  const dias = diasDoPeriodo(op.data_inicio_verba, op.data_limite_verba);
  return dias ? (total / dias) * 30 : 0;
}

export function novaOperacao(partial: Partial<OperacaoFormValues> = {}): OperacaoFormValues {
  return {
    nome: "",
    objetivo: "",
    moeda: "BRL",
    tipo_verba: "mensal",
    data_inicio_verba: "",
    data_limite_verba: "",
    plataformas: [],
    plataformas_config: {},
    verba_diaria: null,
    ...partial,
  };
}

export function ClientForm({ initialValues, onSubmit, loading }: ClientFormProps) {
  const { agencias } = useAgencias();
  const { nomes: plataformasDisponiveis } = usePlataformas();
  const cotacoes = useCotacoes();

  const operacoesIniciais: OperacaoFormValues[] = (initialValues?.operacoes && initialValues.operacoes.length > 0)
    ? initialValues.operacoes.map((op) => novaOperacao(op))
    : [novaOperacao({ nome: "Principal" })];

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      nome: initialValues?.nome || "",
      agencia: initialValues?.agencia || agencias[0]?.id || "",
      nicho: initialValues?.nicho || "",
      data_inicio: initialValues?.data_inicio || new Date().toISOString().slice(0, 10),
      observacoes: initialValues?.observacoes || "",
      em_onboarding: initialValues?.em_onboarding ?? false,
      status_operacional: initialValues?.status_operacional || "ativo",
      trafego_ativo: initialValues?.trafego_ativo ?? true,
      operacoes: operacoesIniciais,
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "operacoes" });
  const trafegoAtivo = form.watch("trafego_ativo");
  const operacoes = form.watch("operacoes");

  const totalMensalBRL = operacoes.reduce((acc, op) => acc + paraBRL(verbaMensalDaOperacao(op), op.moeda, cotacoes), 0);
  const temMoedaEstrangeira = operacoes.some((op) => op.moeda !== "BRL");

  // Os totais de cada operação são sempre a soma das plataformas selecionadas
  const handleSubmit = (values: ClientFormValues) => {
    onSubmit({
      ...values,
      operacoes: values.operacoes.map((op) => {
        const cfg: Record<string, PlataformaConfig> = {};
        op.plataformas.forEach((p) => {
          cfg[p] = op.plataformas_config[p] || { verba: 0, metodo_pagamento: "pix" };
        });
        return {
          ...op,
          nome: op.nome.trim(),
          plataformas_config: cfg,
          data_inicio_verba: op.tipo_verba === "total_periodo" ? op.data_inicio_verba || null : null,
          data_limite_verba: op.tipo_verba === "total_periodo" ? op.data_limite_verba || null : null,
        };
      }),
    });
  };

  const adicionarOperacao = () => {
    const n = fields.length + 1;
    append(novaOperacao({ nome: n === 1 ? "Principal" : `Operação ${n}` }));
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="nome"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome do cliente</FormLabel>
              <FormControl>
                <Input placeholder="Ex: Atend Já" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="agencia"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Agência</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {agencias.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="nicho"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nicho</FormLabel>
                <FormControl>
                  <Input placeholder="Ex: Saúde, Educação..." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="data_inicio"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data de início</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="status_operacional"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status Operacional</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="pausado">Pausado</SelectItem>
                    <SelectItem value="churn">Churn</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Alavanca de tráfego */}
        <FormField
          control={form.control}
          name="trafego_ativo"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between gap-4 rounded-md border p-4">
              <div className="space-y-1 leading-none">
                <FormLabel>Investindo em ads (tráfego ativo)</FormLabel>
                <p className="text-sm text-muted-foreground">
                  {field.value
                    ? "A verba das operações entra nos totais e o saldo é monitorado."
                    : "Cliente ainda sem verba de ads: nada entra nos totais e o saldo fica pausado. Ligue quando começar a investir."}
                </p>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} className="data-[state=checked]:bg-emerald-500" />
              </FormControl>
            </FormItem>
          )}
        />

        {/* Operações */}
        <div className={cn("space-y-3", !trafegoAtivo && "opacity-70")}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium flex items-center gap-2"><Layers size={15} /> Operações de mídia</p>
              <p className="text-[11px] text-muted-foreground">
                Uma por objetivo (ex.: canal no YouTube, e-commerce). Cada uma tem moeda, tipo de verba e plataformas próprias.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" className="gap-1 shrink-0" onClick={adicionarOperacao}>
              <Plus size={14} /> Operação
            </Button>
          </div>

          {fields.map((f, index) => (
            <OperacaoEditor
              key={f.id}
              form={form}
              index={index}
              plataformasDisponiveis={plataformasDisponiveis}
              metodoPadrao={initialValues?.metodo_pagamento || "pix"}
              verbaLegada={index === 0 && !initialValues?.operacoes?.length ? Number(initialValues?.verba_ads || 0) : 0}
              onRemove={fields.length > 0 ? () => remove(index) : undefined}
            />
          ))}

          {fields.length === 0 && (
            <p className="text-sm text-muted-foreground rounded-md border border-dashed p-3 text-center">
              {trafegoAtivo ? "Adicione uma operação para informar plataformas e verba." : "Sem operações. Quando o cliente começar a investir, ligue o tráfego e adicione a operação."}
            </p>
          )}
          {form.formState.errors.operacoes?.root?.message || (typeof form.formState.errors.operacoes?.message === "string" && form.formState.errors.operacoes.message) ? (
            <p className="text-sm font-medium text-destructive">{form.formState.errors.operacoes?.root?.message || (form.formState.errors.operacoes as any)?.message}</p>
          ) : null}

          {operacoes.length > 0 && (
            <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                Total mensal em reais{operacoes.length > 1 && <span className="text-[11px]"> ({operacoes.length} operações)</span>}
                {temMoedaEstrangeira && (
                  <span className="text-[11px]"> · câmbio {cotacoes ? (cotacoes.indisponivel ? "indisponível (1:1)" : `de ${cotacoes.data ? new Date(cotacoes.data + "T12:00:00").toLocaleDateString("pt-BR") : "hoje"}`) : "carregando..."}</span>
                )}
              </span>
              <span className={cn("font-semibold", !trafegoAtivo && "line-through text-muted-foreground")}>
                {formatBRL(totalMensalBRL)}<span className="text-[11px] font-normal text-muted-foreground">/mês</span>
              </span>
            </div>
          )}
        </div>

        <FormField
          control={form.control}
          name="observacoes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Observações</FormLabel>
              <FormControl>
                <Textarea rows={3} placeholder="Notas, contexto, links..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="em_onboarding"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>
                  Em Onboarding
                </FormLabel>
                <p className="text-sm text-muted-foreground">
                  Marque para exibir um destaque de onboarding no card do cliente.
                </p>
              </div>
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Salvando..." : "Salvar cliente"}
        </Button>
      </form>
    </Form>
  );
}

// ---------------------------------------------------------------- Editor de uma operação

function OperacaoEditor({ form, index, plataformasDisponiveis, metodoPadrao, verbaLegada, onRemove }: {
  form: UseFormReturn<ClientFormValues>;
  index: number;
  plataformasDisponiveis: string[];
  metodoPadrao: PlataformaConfig["metodo_pagamento"];
  /** Verba herdada de um cadastro antigo/lead: vai para a primeira plataforma adicionada */
  verbaLegada: number;
  onRemove?: () => void;
}) {
  const base = `operacoes.${index}` as const;
  const op = form.watch(base);
  const moeda = (op?.moeda || "BRL") as Moeda;
  const simbolo = simboloMoeda(moeda);
  const tipoVerba = op?.tipo_verba || "mensal";
  const plataformas = op?.plataformas || [];
  const config = op?.plataformas_config || {};
  const totalVerba = totalDaOperacao({ plataformas, plataformas_config: config });
  const dias = tipoVerba === "total_periodo" ? diasDoPeriodo(op?.data_inicio_verba, op?.data_limite_verba) : 30;
  const verbaDiariaCalculada = dias ? totalVerba / dias : 0;
  const erros = form.formState.errors.operacoes?.[index];

  const setConfig = (plat: string, patch: Partial<PlataformaConfig>) => {
    const cfg = form.getValues(`${base}.plataformas_config`);
    form.setValue(
      `${base}.plataformas_config`,
      { ...cfg, [plat]: { ...(cfg[plat] || { verba: 0, metodo_pagamento: metodoPadrao }), ...patch } },
      { shouldValidate: true },
    );
  };

  const addPlataforma = (plat: string) => {
    const atuais = form.getValues(`${base}.plataformas`);
    if (atuais.includes(plat)) return;
    const cfg = { ...form.getValues(`${base}.plataformas_config`) };
    if (!cfg[plat]) {
      const ultima = atuais.length > 0 ? cfg[atuais[atuais.length - 1]] : undefined;
      cfg[plat] = {
        verba: atuais.length === 0 && verbaLegada > 0 ? verbaLegada : 0,
        metodo_pagamento: ultima?.metodo_pagamento || metodoPadrao,
      };
    }
    form.setValue(`${base}.plataformas_config`, cfg);
    form.setValue(`${base}.plataformas`, [...atuais, plat], { shouldValidate: true });
  };

  const removePlataforma = (plat: string) => {
    const atuais = form.getValues(`${base}.plataformas`);
    form.setValue(`${base}.plataformas`, atuais.filter((p) => p !== plat), { shouldValidate: true });
    const { [plat]: _removida, ...rest } = form.getValues(`${base}.plataformas_config`);
    form.setValue(`${base}.plataformas_config`, rest);
  };

  const disponiveis = plataformasDisponiveis.filter((p) => !plataformas.includes(p));

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/20">
      {/* Cabeçalho: nome, moeda, remover */}
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-start">
        <FormField
          control={form.control}
          name={`${base}.nome`}
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">Operação</FormLabel>
              <FormControl>
                <Input placeholder="Ex.: Canal YouTube, E-commerce" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`${base}.moeda`}
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">Moeda</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="w-[130px]" aria-label="Moeda da operação">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {MOEDAS.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        <div className="pt-6">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-destructive hover:text-destructive"
            onClick={onRemove}
            disabled={!onRemove}
            title="Remover operação"
          >
            <Trash2 size={15} />
          </Button>
        </div>
      </div>

      <FormField
        control={form.control}
        name={`${base}.objetivo`}
        render={({ field }) => (
          <FormItem className="space-y-1">
            <FormControl>
              <Input placeholder="Objetivo (opcional): ex. impulsionar canal, vender no e-commerce" className="h-8 text-sm" {...field} value={field.value || ""} />
            </FormControl>
          </FormItem>
        )}
      />

      {/* Plataformas */}
      <FormField
        control={form.control}
        name={`${base}.plataformas`}
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">Plataformas de mídia</FormLabel>
            <div className="flex flex-wrap gap-2 min-h-[40px] p-2 border rounded-md items-center bg-background">
              {field.value.map((plat) => (
                <Badge key={plat} variant="secondary" className="gap-1 pr-1">
                  {plat}
                  <button
                    type="button"
                    onClick={() => removePlataforma(plat)}
                    className="hover:text-destructive"
                    aria-label={`Remover ${plat}`}
                  >
                    <X size={12} />
                  </button>
                </Badge>
              ))}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full" type="button" aria-label="Adicionar plataforma">
                    <Plus size={14} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {disponiveis.map((plat) => (
                    <DropdownMenuItem key={plat} onClick={() => addPlataforma(plat)}>
                      {plat}
                    </DropdownMenuItem>
                  ))}
                  {disponiveis.length === 0 && (
                    <DropdownMenuItem disabled>Todas as plataformas já foram adicionadas</DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Tipo de verba + verba por plataforma */}
      <FormField
        control={form.control}
        name={`${base}.tipo_verba`}
        render={({ field }) => (
          <FormItem className="space-y-2">
            <div className="flex items-center gap-4">
              <FormLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">Tipo de verba</FormLabel>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="radio" checked={field.value === "mensal"} onChange={() => field.onChange("mensal")} className="h-4 w-4" />
                Mensal
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="radio" checked={field.value === "total_periodo"} onChange={() => field.onChange("total_periodo")} className="h-4 w-4" />
                Total do período
              </label>
            </div>
            <FormMessage />
          </FormItem>
        )}
      />

      {plataformas.length === 0 ? (
        <p className="text-sm text-muted-foreground rounded-md border border-dashed p-3 text-center">
          Selecione as plataformas para informar a forma de pagamento e a verba de cada uma.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="hidden sm:grid sm:grid-cols-[1fr_1.1fr_1.1fr] gap-2 px-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            <span>Plataforma</span>
            <span>Forma de pagamento</span>
            <span>{tipoVerba === "mensal" ? `Verba / mês (${simbolo})` : `Verba total (${simbolo})`}</span>
          </div>
          {plataformas.map((plat) => {
            const cfg = config[plat] || { verba: 0, metodo_pagamento: metodoPadrao };
            return (
              <div key={plat} className="grid grid-cols-1 sm:grid-cols-[1fr_1.1fr_1.1fr] gap-2 items-center rounded-md border bg-background p-2">
                <Badge variant="secondary" className="justify-self-start">{plat}</Badge>
                <Select
                  value={cfg.metodo_pagamento}
                  onValueChange={(v) => setConfig(plat, { metodo_pagamento: v as PlataformaConfig["metodo_pagamento"] })}
                >
                  <SelectTrigger aria-label={`Forma de pagamento — ${plat}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METODOS_PAGAMENTO.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  inputMode="numeric"
                  placeholder={`${simbolo} 0,00`}
                  aria-label={`${tipoVerba === "mensal" ? "Verba mensal" : "Verba total"} — ${plat}`}
                  value={toDisplay(cfg.verba)}
                  onChange={(e) => setConfig(plat, { verba: parseBRLInput(e.target.value) })}
                />
              </div>
            );
          })}

          <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              {tipoVerba === "mensal" ? "Total mensal" : "Total contratado"}
              {plataformas.length > 1 && <span className="text-[11px]"> ({plataformas.length} plataformas)</span>}
            </span>
            <span className="font-semibold">
              {formatMoeda(totalVerba, moeda)}{tipoVerba === "mensal" && <span className="text-[11px] font-normal text-muted-foreground">/mês</span>}
            </span>
          </div>
        </div>
      )}

      {tipoVerba === "total_periodo" && (
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name={`${base}.data_inicio_verba`}
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">Início do período</FormLabel>
                <FormControl>
                  <Input type="date" {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={`${base}.data_limite_verba`}
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">Fim do período</FormLabel>
                <FormControl>
                  <Input type="date" {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <p className="col-span-2 text-[11px] text-muted-foreground -mt-1">
            {dias ? `${dias} dias de período` : "Informe início e fim para calcular o consumo diário"}
            {dias && totalVerba > 0 ? ` · ${formatMoeda(verbaDiariaCalculada, moeda)}/dia · equivale a ${formatMoeda((totalVerba / dias) * 30, moeda)}/mês` : ""}.
          </p>
        </div>
      )}

      <FormField
        control={form.control}
        name={`${base}.verba_diaria`}
        render={({ field }) => (
          <FormItem className="space-y-1">
            <FormLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Investimento diário <span className="normal-case font-normal">(opcional)</span>
            </FormLabel>
            <FormControl>
              <Input
                inputMode="numeric"
                placeholder={`${simbolo} 0,00 por dia`}
                value={toDisplay(field.value)}
                onChange={(e) => {
                  const parsed = parseBRLInput(e.target.value);
                  field.onChange(parsed > 0 ? parsed : null);
                }}
              />
            </FormControl>
            <p className="text-[11px] text-muted-foreground">
              Usado para calcular quando o saldo acaba. Vazio = verba de cada plataforma ÷ {tipoVerba === "mensal" ? "30" : "dias do período"}
              {totalVerba > 0 && dias ? ` (${formatMoeda(verbaDiariaCalculada, moeda)}/dia)` : ""}.
            </p>
            <FormMessage />
          </FormItem>
        )}
      />
      {erros && typeof (erros as any).message === "string" && <p className="text-sm font-medium text-destructive">{(erros as any).message}</p>}
    </div>
  );
}
