import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState, useEffect } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { maskBRLInput, parseBRLInput, formatBRL } from "@/lib/clientes";

const saldoSchema = z.object({
  cliente_id: z.string().min(1, "Selecione um cliente"),
  valor_previsto: z.number().min(0, "Valor inválido"),
  valor_recebido: z.number().min(0, "Valor inválido"),
  data_vencimento: z.string().optional().nullable(),
  status_pagamento: z.enum(["em_dia", "pendente", "atrasado"]),
  mes_referencia: z.string().min(1, "Mês de referência é obrigatório"),
});

export type SaldoFormValues = z.infer<typeof saldoSchema>;

interface SaldoFormProps {
  initialValues?: Partial<SaldoFormValues>;
  onSubmit: (values: SaldoFormValues) => void;
  loading?: boolean;
}

export function SaldoForm({ initialValues, onSubmit, loading }: SaldoFormProps) {
  const [clientes, setClientes] = useState<{ id: string; nome: string }[]>([]);

  const form = useForm<SaldoFormValues>({
    resolver: zodResolver(saldoSchema),
    defaultValues: {
      cliente_id: initialValues?.cliente_id || "",
      valor_previsto: initialValues?.valor_previsto ?? 0,
      valor_recebido: initialValues?.valor_recebido ?? 0,
      data_vencimento: initialValues?.data_vencimento || "",
      status_pagamento: initialValues?.status_pagamento || "pendente",
      mes_referencia: initialValues?.mes_referencia || new Date().toISOString().slice(0, 7), // YYYY-MM
    },
  });

  const [valorPrevistoDisplay, setValorPrevistoDisplay] = useState(
    initialValues?.valor_previsto ? maskBRLInput(String(Math.round((initialValues.valor_previsto || 0) * 100))) : ""
  );
  const [valorRecebidoDisplay, setValorRecebidoDisplay] = useState(
    initialValues?.valor_recebido ? maskBRLInput(String(Math.round((initialValues.valor_recebido || 0) * 100))) : ""
  );

  useEffect(() => {
    const fetchClientes = async () => {
      const { data } = await supabase.from("clientes").select("id, nome").order("nome");
      if (data) setClientes(data);
    };
    fetchClientes();
  }, []);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="cliente_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cliente</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um cliente" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="valor_previsto"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Valor Previsto</FormLabel>
                <FormControl>
                  <Input
                    inputMode="numeric"
                    placeholder="R$ 0,00"
                    value={valorPrevistoDisplay}
                    onChange={(e) => {
                      const masked = maskBRLInput(e.target.value);
                      setValorPrevistoDisplay(masked);
                      field.onChange(parseBRLInput(e.target.value));
                    }}
                  />
                </FormControl>
                <p className="text-xs text-muted-foreground">{formatBRL(field.value)}</p>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="valor_recebido"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Valor Recebido</FormLabel>
                <FormControl>
                  <Input
                    inputMode="numeric"
                    placeholder="R$ 0,00"
                    value={valorRecebidoDisplay}
                    onChange={(e) => {
                      const masked = maskBRLInput(e.target.value);
                      setValorRecebidoDisplay(masked);
                      field.onChange(parseBRLInput(e.target.value));
                    }}
                  />
                </FormControl>
                <p className="text-xs text-muted-foreground">{formatBRL(field.value)}</p>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="data_vencimento"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Vencimento</FormLabel>
                <FormControl>
                  <Input type="date" value={field.value || ""} onChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="mes_referencia"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mês de Referência</FormLabel>
                <FormControl>
                  <Input type="month" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="status_pagamento"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status de Pagamento</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="em_dia">Em dia</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="atrasado">Atrasado</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Salvando..." : "Salvar Registro"}
        </Button>
      </form>
    </Form>
  );
}
