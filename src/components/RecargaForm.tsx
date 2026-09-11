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
import { maskBRLInput, parseBRLInput, formatBRL } from "@/lib/clientes";
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
}

interface RecargaFormProps {
  defaultMetodo?: string;
  /** Plataformas do cliente; com mais de uma, o formulário pede em qual a recarga foi feita */
  contas?: RecargaConta[];
  defaultContaId?: string;
  onSubmit: (values: RecargaFormValues) => void;
  loading?: boolean;
}

const METODOS_VALIDOS = ["cartao", "pix", "boleto"];

export function RecargaForm({ defaultMetodo, contas = [], defaultContaId, onSubmit, loading }: RecargaFormProps) {
  const schema = useMemo(
    () => (contas.length > 0
      ? recargaSchema.extend({ saldo_ads_id: z.string().min(1, "Selecione a plataforma") })
      : recargaSchema),
    [contas.length],
  );
  const contaInicial = defaultContaId || (contas.length === 1 ? contas[0].id : "");
  const contaSelecionadaInicial = contas.find((c) => c.id === contaInicial);
  const metodoInicial = contaSelecionadaInicial?.metodo_pagamento || defaultMetodo;

  const form = useForm<RecargaFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      saldo_ads_id: contaInicial,
      data_recarga: new Date().toISOString().split("T")[0],
      valor: 0,
      metodo_pagamento: METODOS_VALIDOS.includes(metodoInicial || "") ? (metodoInicial as RecargaFormValues["metodo_pagamento"]) : null,
      observacoes: "",
    },
  });

  const [valorDisplay, setValorDisplay] = useState("");
  const contaSelecionada = contas.find((c) => c.id === form.watch("saldo_ads_id"));

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
                        {c.verba_diaria ? <span className="text-muted-foreground"> · {formatBRL(c.verba_diaria)}/dia</span> : null}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {contaSelecionada?.verba_diaria ? (
                  <p className="text-xs text-muted-foreground">Consumo estimado de {formatBRL(contaSelecionada.verba_diaria)}/dia nesta plataforma.</p>
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
              <FormLabel>Data da Recarga</FormLabel>
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
              <FormLabel>Valor (R$)</FormLabel>
              <FormControl>
                <Input
                  inputMode="numeric"
                  placeholder="R$ 0,00"
                  value={valorDisplay}
                  onChange={(e) => {
                    const masked = maskBRLInput(e.target.value);
                    setValorDisplay(masked);
                    field.onChange(parseBRLInput(e.target.value));
                  }}
                />
              </FormControl>
              <p className="text-xs text-muted-foreground">
                {formatBRL(field.value)}
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
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
        />

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
          {loading ? "Salvando..." : "Adicionar Recarga"}
        </Button>
      </form>
    </Form>
  );
}
