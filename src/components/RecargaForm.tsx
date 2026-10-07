import { useForm } from "react-hook-form";
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
import { maskBRLInput, parseBRLInput } from "@/lib/clientes";
import { formatMoeda, simboloMoeda } from "@/lib/moedas";
import { useMemo, useState } from "react";

const recargaSchema = z.object({
  /** Registro de saldo (plataforma) que recebeu a recarga */
  saldo_ads_id: z.string().optional(),
  data_recarga: z.string().min(1, "Data é obrigatória"),
  valor: z.number().min(0.01, "Valor deve ser maior que zero"),
  metodo_pagamento: z.enum(["cartao", "pix", "boleto"]).optional().nullable(),
  observacoes: z.string().optional(),
});

export type RecargaFormValues = z.infer<typeof recargaSchema>;

/** Uma plataforma (registro de saldo_ads) do cliente que pode receber a recarga */
export interface RecargaConta {
  id: string;
  label: string;
  metodo_pagamento?: string | null;
  verba_diaria?: number | null;
  /** Moeda da operação: a recarga é registrada nela */
  moeda?: string | null;
  /** Saldo que o sistema estima hoje (mostrado no ajuste, para comparar) */
  saldo_estimado?: number | null;
}

interface RecargaFormProps {
  defaultMetodo?: string;
  /** Plataformas do cliente; com mais de uma, o formulário pede em qual a recarga foi feita */
  contas?: RecargaConta[];
  defaultContaId?: string;
  onSubmit: (values: RecargaFormValues) => void;
  loading?: boolean;
  /** Ajuste de saldo: o valor informado SUBSTITUI o saldo estimado (pode ser zero; sem forma de pagamento) */
  ajuste?: boolean;
}

const METODOS_VALIDOS = ["cartao", "pix", "boleto"];

export function RecargaForm({ defaultMetodo, contas = [], defaultContaId, onSubmit, loading, ajuste = false }: RecargaFormProps) {
  const schema = useMemo(() => {
    const base = contas.length > 0
      ? recargaSchema.extend({ saldo_ads_id: z.string().min(1, "Selecione a plataforma") })
      : recargaSchema;
    // No ajuste o saldo pode ser zero, mas precisa ser digitado (vazio não vira zero sem querer)
    return ajuste ? base.extend({ valor: z.number({ required_error: "Informe o saldo atual" }).min(0, "Valor inválido") }) : base;
  }, [contas.length, ajuste]);
  const contaInicial = defaultContaId || (contas.length === 1 ? contas[0].id : "");
  const contaSelecionadaInicial = contas.find((c) => c.id === contaInicial);
  const metodoInicial = contaSelecionadaInicial?.metodo_pagamento || defaultMetodo;

  const form = useForm<RecargaFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      saldo_ads_id: contaInicial,
      data_recarga: new Date().toISOString().split("T")[0],
      valor: ajuste ? (undefined as unknown as number) : 0,
      metodo_pagamento: METODOS_VALIDOS.includes(metodoInicial || "") ? (metodoInicial as RecargaFormValues["metodo_pagamento"]) : null,
      observacoes: "",
    },
  });

  const [valorDisplay, setValorDisplay] = useState("");
  const contaSelecionada = contas.find((c) => c.id === form.watch("saldo_ads_id"));
  const moeda = contaSelecionada?.moeda || contas[0]?.moeda || "BRL";
  const simbolo = simboloMoeda(moeda);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {contas.length > 0 && (
          <FormField
            control={form.control}
            name="saldo_ads_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Plataforma</FormLabel>
                <Select
                  onValueChange={(v) => {
                    field.onChange(v);
                    // Sugere a forma de pagamento configurada para a plataforma escolhida
                    const conta = contas.find((c) => c.id === v);
                    if (conta?.metodo_pagamento && METODOS_VALIDOS.includes(conta.metodo_pagamento)) {
                      form.setValue("metodo_pagamento", conta.metodo_pagamento as RecargaFormValues["metodo_pagamento"]);
                    }
                  }}
                  value={field.value || ""}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Em qual plataforma foi a recarga?" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {contas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                        {c.verba_diaria ? <span className="text-muted-foreground"> · {formatMoeda(c.verba_diaria, c.moeda)}/dia</span> : null}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {contaSelecionada?.verba_diaria ? (
                  <p className="text-xs text-muted-foreground">Consumo estimado de {formatMoeda(contaSelecionada.verba_diaria, contaSelecionada.moeda)}/dia nesta plataforma.</p>
                ) : null}
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="data_recarga"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{ajuste ? "Data do saldo" : "Data da Recarga"}</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="valor"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{ajuste ? `Saldo atual na plataforma (${simbolo})` : `Valor (${simbolo})`}</FormLabel>
              <FormControl>
                <Input
                  inputMode="numeric"
                  placeholder={`${simbolo} 0,00`}
                  value={valorDisplay}
                  onChange={(e) => {
                    const masked = maskBRLInput(e.target.value);
                    setValorDisplay(masked);
                    field.onChange(parseBRLInput(e.target.value));
                  }}
                />
              </FormControl>
              <p className="text-xs text-muted-foreground">
                {formatMoeda(field.value, moeda)}{moeda !== "BRL" && <span> · registrado em {moeda}</span>}
              </p>
              {ajuste && contaSelecionada?.saldo_estimado != null && (
                <p className="text-xs text-muted-foreground">Estimado pelo sistema hoje: {formatMoeda(contaSelecionada.saldo_estimado, moeda)}. O valor informado substitui o estimado e o consumo diário continua a partir dele.</p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {!ajuste && <FormField
          control={form.control}
          name="metodo_pagamento"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Método de Pagamento</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ""}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Mesmo da plataforma" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="cartao">Cartão</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />}

        <FormField
          control={form.control}
          name="observacoes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Observações</FormLabel>
              <FormControl>
                <Textarea placeholder="Opcional..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Salvando..." : ajuste ? "Ajustar saldo" : "Adicionar Recarga"}
        </Button>
      </form>
    </Form>
  );
}
