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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { maskBRLInput, parseBRLInput, formatBRL } from "@/lib/clientes";

const saldoAdsSchema = z.object({
  cliente_id: z.string().min(1, "Selecione um cliente"),
  plataforma: z.enum(["meta", "google", "tiktok", "outras"]),
  metodo_pagamento: z.enum(["dinheiro", "cartao_credito", "cartao_debito", "pix", "boleto", "outros"]),
  verba_diaria: z.number().min(0, "Valor inválido").optional().nullable(),
  observacoes: z.string().optional(),
});

export type SaldoAdsFormValues = z.infer<typeof saldoAdsSchema>;

interface SaldoAdsFormProps {
  initialValues?: Partial<SaldoAdsFormValues>;
  onSubmit: (values: SaldoAdsFormValues) => void;
  loading?: boolean;
}

export function SaldoAdsForm({ initialValues, onSubmit, loading }: SaldoAdsFormProps) {
  const [clientes, setClientes] = useState<{ id: string; nome: string; agencia: string; verba_ads: number }[]>([]);

  const form = useForm<SaldoAdsFormValues>({
    resolver: zodResolver(saldoAdsSchema),
    defaultValues: {
      cliente_id: initialValues?.cliente_id || "",
      plataforma: initialValues?.plataforma || "meta",
      metodo_pagamento: initialValues?.metodo_pagamento || "outros",
      verba_diaria: initialValues?.verba_diaria ?? undefined,
      observacoes: initialValues?.observacoes || "",
    },
  });

  const [verbaDiariaDisplay, setVerbaDiariaDisplay] = useState(
    initialValues?.verba_diaria ? maskBRLInput(String(Math.round((initialValues.verba_diaria || 0) * 100))) : ""
  );

  useEffect(() => {
    const fetchClientes = async () => {
      const { data } = await supabase.from("clientes").select("id, nome, agencia, verba_ads").order("nome");
      if (data) setClientes(data as any);
    };
    fetchClientes();
  }, []);

  // Update verba_diaria when cliente_id changes and it's a new record
  const selectedClienteId = form.watch("cliente_id");
  useEffect(() => {
    if (!initialValues?.cliente_id && selectedClienteId) {
      const cliente = clientes.find(c => c.id === selectedClienteId);
      if (cliente && !form.getValues("verba_diaria")) {
        const calculated = (cliente.verba_ads || 0) / 30;
        form.setValue("verba_diaria", calculated);
        setVerbaDiariaDisplay(maskBRLInput(String(Math.round(calculated * 100))));
      }
    }
  }, [selectedClienteId, clientes]);

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
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome} — <span className="capitalize">{c.agencia}</span>
                    </SelectItem>
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
            name="plataforma"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Plataforma</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="meta">Meta</SelectItem>
                    <SelectItem value="google">Google Ads</SelectItem>
                    <SelectItem value="tiktok">TikTok Ads</SelectItem>
                    <SelectItem value="outras">Outras</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="metodo_pagamento"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Método Padrão</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
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
        </div>

        <FormField
          control={form.control}
          name="verba_diaria"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Verba Diária (R$)</FormLabel>
              <FormControl>
                <Input
                  inputMode="numeric"
                  placeholder="R$ 0,00"
                  value={verbaDiariaDisplay}
                  onChange={(e) => {
                    const masked = maskBRLInput(e.target.value);
                    setVerbaDiariaDisplay(masked);
                    field.onChange(parseBRLInput(e.target.value));
                  }}
                />
              </FormControl>
              <p className="text-xs text-muted-foreground">
                Sugerido: {formatBRL(field.value || 0)}
              </p>
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
          {loading ? "Salvando..." : "Salvar Registro"}
        </Button>
      </form>
    </Form>
  );
}
