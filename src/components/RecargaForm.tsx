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
import { useState } from "react";

const recargaSchema = z.object({
  data_recarga: z.string().min(1, "Data é obrigatória"),
  valor: z.number().min(0.01, "Valor deve ser maior que zero"),
  metodo_pagamento: z.enum(["dinheiro", "cartao_credito", "cartao_debito", "pix", "boleto", "outros"]).optional().nullable(),
  observacoes: z.string().optional(),
});

export type RecargaFormValues = z.infer<typeof recargaSchema>;

interface RecargaFormProps {
  defaultMetodo?: string;
  onSubmit: (values: RecargaFormValues) => void;
  loading?: boolean;
}

export function RecargaForm({ defaultMetodo, onSubmit, loading }: RecargaFormProps) {
  const form = useForm<RecargaFormValues>({
    resolver: zodResolver(recargaSchema),
    defaultValues: {
      data_recarga: new Date().toISOString().split("T")[0],
      valor: 0,
      metodo_pagamento: (defaultMetodo as any) || "outros",
      observacoes: "",
    },
  });

  const [valorDisplay, setValorDisplay] = useState("");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                    <SelectValue placeholder="Mesmo do registro pai" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                  <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                  <SelectItem value="outros">Outros</SelectItem>
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
