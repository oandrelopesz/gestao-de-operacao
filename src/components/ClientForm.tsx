import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { X, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { maskBRLInput, parseBRLInput, formatBRL } from "@/lib/clientes";
import { useAgencias } from "@/lib/agencias";
import { usePlataformas } from "@/lib/plataformas";

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

const clientSchema = z.object({
  nome: z.string().min(2, "Nome é obrigatório"),
  agencia: z.string().min(1, "Selecione a agência"),
  nicho: z.string().optional(),
  data_inicio: z.string().min(1, "Informe a data de início"),
  /** Soma das verbas mensais das plataformas (preenchido automaticamente) */
  verba_ads: z.number().min(0),
  observacoes: z.string().optional(),
  em_onboarding: z.boolean(),
  status_operacional: z.enum(["ativo", "pausado", "churn"]),
  tipo_verba: z.enum(["mensal", "total_periodo"]),
  /** Soma das verbas totais das plataformas (preenchido automaticamente) */
  verba_total_contratada: z.union([z.number(), z.string().length(0)]).optional().nullable(),
  data_limite_verba: z.string().optional().nullable().or(z.literal("")),
  plataformas: z.array(z.string()).min(1, "Selecione pelo menos uma plataforma"),
  /** Forma de pagamento e verba de cada plataforma selecionada (chave = nome da plataforma) */
  plataformas_config: z.record(z.string(), plataformaConfigSchema),
  /** Investimento diário total em ads; se vazio, usa a verba de cada plataforma ÷ dias */
  verba_diaria: z.number().min(0).optional().nullable(),
});

export type ClientFormValues = z.infer<typeof clientSchema>;

interface ClientFormProps {
  initialValues?: Partial<ClientFormValues> & {
    /** Forma de pagamento legada (registro único de saldo); usada como padrão das plataformas */
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

export function ClientForm({ initialValues, onSubmit, loading }: ClientFormProps) {
  const { agencias } = useAgencias();
  const { nomes: plataformasDisponiveis } = usePlataformas();

  const initialConfig: Record<string, PlataformaConfig> = { ...(initialValues?.plataformas_config || {}) };
  // Garante uma entrada para cada plataforma já selecionada
  (initialValues?.plataformas || []).forEach((p) => {
    if (!initialConfig[p]) initialConfig[p] = { verba: 0, metodo_pagamento: initialValues?.metodo_pagamento || "pix" };
  });

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      nome: initialValues?.nome || "",
      agencia: initialValues?.agencia || agencias[0]?.id || "",
      nicho: initialValues?.nicho || "",
      data_inicio: initialValues?.data_inicio || new Date().toISOString().slice(0, 10),
      verba_ads: initialValues?.verba_ads ?? 0,
      observacoes: initialValues?.observacoes || "",
      em_onboarding: initialValues?.em_onboarding ?? false,
      status_operacional: initialValues?.status_operacional || "ativo",
      tipo_verba: initialValues?.tipo_verba || "mensal",
      verba_total_contratada: initialValues?.verba_total_contratada ?? null,
      data_limite_verba: initialValues?.data_limite_verba || "",
      plataformas: initialValues?.plataformas || [],
      plataformas_config: initialConfig,
      verba_diaria: initialValues?.verba_diaria ?? null,
    },
  });

  // Texto mascarado (R$) de cada campo de verba por plataforma
  const [verbaDisplay, setVerbaDisplay] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(initialConfig).map(([p, cfg]) => [p, toDisplay(cfg.verba)]))
  );
  const [verbaDiariaDisplay, setVerbaDiariaDisplay] = useState(toDisplay(initialValues?.verba_diaria));

  const plataformas = form.watch("plataformas");
  const config = form.watch("plataformas_config");
  const tipoVerba = form.watch("tipo_verba");
  const dataInicio = form.watch("data_inicio");
  const dataLimite = form.watch("data_limite_verba");

  const totalVerba = plataformas.reduce((acc, p) => acc + (config[p]?.verba || 0), 0);
  const dias = tipoVerba === "total_periodo" ? diasDoPeriodo(dataInicio, dataLimite) : 30;
  const verbaDiariaCalculada = dias ? totalVerba / dias : 0;

  const removePlataforma = (plat: string) => {
    const current = form.getValues("plataformas");
    form.setValue("plataformas", current.filter((p) => p !== plat), { shouldValidate: true });
    const { [plat]: _removida, ...rest } = form.getValues("plataformas_config");
    form.setValue("plataformas_config", rest);
  };

  const addPlataforma = (plat: string) => {
    const current = form.getValues("plataformas");
    if (current.includes(plat)) return;
    const cfg = { ...form.getValues("plataformas_config") };
    if (!cfg[plat]) {
      // Primeira plataforma de um cadastro que já tinha verba total (ex.: lead convertido): herda o valor
      const legado = current.length === 0
        ? (form.getValues("tipo_verba") === "mensal"
          ? form.getValues("verba_ads")
          : Number(form.getValues("verba_total_contratada") || 0))
        : 0;
      const ultima = current.length > 0 ? cfg[current[current.length - 1]] : undefined;
      cfg[plat] = {
        verba: legado > 0 ? legado : 0,
        metodo_pagamento: ultima?.metodo_pagamento || initialValues?.metodo_pagamento || "pix",
      };
      setVerbaDisplay((d) => ({ ...d, [plat]: toDisplay(cfg[plat].verba) }));
    }
    form.setValue("plataformas_config", cfg);
    form.setValue("plataformas", [...current, plat], { shouldValidate: true });
  };

  const setPlataformaConfig = (plat: string, patch: Partial<PlataformaConfig>) => {
    const cfg = form.getValues("plataformas_config");
    form.setValue(
      "plataformas_config",
      { ...cfg, [plat]: { ...(cfg[plat] || { verba: 0, metodo_pagamento: "pix" }), ...patch } },
      { shouldValidate: true },
    );
  };

  // Os totais do cliente são sempre a soma das plataformas selecionadas
  const handleSubmit = (values: ClientFormValues) => {
    const selecionadas = values.plataformas;
    const cfg: Record<string, PlataformaConfig> = {};
    selecionadas.forEach((p) => {
      cfg[p] = values.plataformas_config[p] || { verba: 0, metodo_pagamento: "pix" };
    });
    const soma = selecionadas.reduce((acc, p) => acc + (cfg[p].verba || 0), 0);
    onSubmit({
      ...values,
      plataformas_config: cfg,
      verba_ads: values.tipo_verba === "mensal" ? soma : values.verba_ads,
      verba_total_contratada: values.tipo_verba === "total_periodo" ? soma : values.verba_total_contratada,
    });
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

        {/* 1) Plataformas: escolhidas primeiro; cada uma abre forma de pagamento + verba abaixo */}
        <FormField
          control={form.control}
          name="plataformas"
          render={({ field }) => (
            <FormItem className="flex flex-col rounded-md border p-4 bg-muted/20">
              <FormLabel>Plataformas de mídia</FormLabel>
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
                    {plataformasDisponiveis.filter((p) => !field.value.includes(p)).map((plat) => (
                      <DropdownMenuItem key={plat} onClick={() => addPlataforma(plat)}>
                        {plat}
                      </DropdownMenuItem>
                    ))}
                    {plataformasDisponiveis.filter((p) => !field.value.includes(p)).length === 0 && (
                      <DropdownMenuItem disabled>Todas as plataformas já foram adicionadas</DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Adicione cada plataforma em que o cliente investe. Para cada uma você informa a forma de pagamento e a verba.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 2) Verba: tipo + um bloco por plataforma */}
        <div className="space-y-4 rounded-md border p-4 bg-muted/20">
          <FormField
            control={form.control}
            name="tipo_verba"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <FormLabel>Tipo de Verba</FormLabel>
                <div className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="mensal"
                      value="mensal"
                      checked={field.value === "mensal"}
                      onChange={() => field.onChange("mensal")}
                      className="h-4 w-4"
                    />
                    <label htmlFor="mensal" className="text-sm">Mensal</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="total_periodo"
                      value="total_periodo"
                      checked={field.value === "total_periodo"}
                      onChange={() => field.onChange("total_periodo")}
                      className="h-4 w-4"
                    />
                    <label htmlFor="total_periodo" className="text-sm">Total período</label>
                  </div>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {plataformas.length === 0 ? (
            <p className="text-sm text-muted-foreground rounded-md border border-dashed p-3 text-center">
              Selecione as plataformas acima para informar a forma de pagamento e a verba de cada uma.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="hidden sm:grid sm:grid-cols-[1fr_1.1fr_1.1fr] gap-2 px-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                <span>Plataforma</span>
                <span>Forma de pagamento</span>
                <span>{tipoVerba === "mensal" ? "Verba / mês" : "Verba total"}</span>
              </div>
              {plataformas.map((plat) => {
                const cfg = config[plat] || { verba: 0, metodo_pagamento: "pix" as const };
                return (
                  <div key={plat} className="grid grid-cols-1 sm:grid-cols-[1fr_1.1fr_1.1fr] gap-2 items-center rounded-md border bg-background p-2">
                    <Badge variant="secondary" className="justify-self-start">{plat}</Badge>
                    <Select
                      value={cfg.metodo_pagamento}
                      onValueChange={(v) => setPlataformaConfig(plat, { metodo_pagamento: v as PlataformaConfig["metodo_pagamento"] })}
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
                      placeholder="R$ 0,00"
                      aria-label={`${tipoVerba === "mensal" ? "Verba mensal" : "Verba total"} — ${plat}`}
                      value={verbaDisplay[plat] ?? ""}
                      onChange={(e) => {
                        setVerbaDisplay((d) => ({ ...d, [plat]: maskBRLInput(e.target.value) }));
                        setPlataformaConfig(plat, { verba: parseBRLInput(e.target.value) });
                      }}
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
                  {formatBRL(totalVerba)}{tipoVerba === "mensal" && <span className="text-[11px] font-normal text-muted-foreground">/mês</span>}
                </span>
              </div>
            </div>
          )}

          {tipoVerba === "total_periodo" && (
            <FormField
              control={form.control}
              name="data_limite_verba"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data Limite</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} value={field.value || ""} />
                  </FormControl>
                  <p className="text-[11px] text-muted-foreground">
                    {dias ? `${dias} dias de período` : "Informe a data limite para calcular o consumo diário"}
                    {dias && totalVerba > 0 ? ` · ${formatBRL(verbaDiariaCalculada)}/dia no total` : ""}.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="verba_diaria"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Investimento diário em ads <span className="text-muted-foreground font-normal">(opcional)</span></FormLabel>
                <FormControl>
                  <Input
                    inputMode="numeric"
                    placeholder="R$ 0,00 por dia"
                    value={verbaDiariaDisplay}
                    onChange={(e) => {
                      setVerbaDiariaDisplay(maskBRLInput(e.target.value));
                      const parsed = parseBRLInput(e.target.value);
                      field.onChange(parsed > 0 ? parsed : null);
                    }}
                  />
                </FormControl>
                <p className="text-[11px] text-muted-foreground">
                  Usado para calcular quando o saldo acaba. Se ficar vazio, considera a verba de cada plataforma ÷ {tipoVerba === "mensal" ? "30" : "dias do período"}
                  {totalVerba > 0 && dias ? ` (${formatBRL(verbaDiariaCalculada)}/dia no total)` : ""}.
                  {plataformas.length > 1 && " Se informado, é distribuído entre as plataformas na proporção da verba."}
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
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
