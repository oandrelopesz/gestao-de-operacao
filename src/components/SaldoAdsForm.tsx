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
import { useAgencias } from "@/lib/agencias";
import { Badge } from "@/components/ui/badge";
import { X, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePlataformas } from "@/lib/plataformas";

const METODOS_PAGAMENTO = [
  { value: "cartao", label: "Cartão" },
  { value: "pix", label: "Pix" },
  { value: "boleto", label: "Boleto" }
];

const saldoAdsSchema = z.object({
  cliente_id: z.string().min(1, "Selecione um cliente"),
  plataformas: z.array(z.string()).min(1, "Selecione pelo menos uma plataforma"),
  metodo_pagamento: z.enum(["cartao", "pix", "boleto"]),
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
  const { nomes: plataformasDisponiveis } = usePlataformas();
  const { label: agenciaLabelOf } = useAgencias();
  const [clientes, setClientes] = useState<{ id: string; nome: string; agencia: string; verba_ads: number; tipo_verba: string; verba_total_contratada: number; data_inicio: string; data_limite_verba: string }[]>([]);

  const form = useForm<SaldoAdsFormValues>({
    resolver: zodResolver(saldoAdsSchema),
    defaultValues: {
      cliente_id: initialValues?.cliente_id || "",
      plataformas: initialValues?.plataformas || [],
      metodo_pagamento: initialValues?.metodo_pagamento || "pix",
      verba_diaria: initialValues?.verba_diaria ?? undefined,
      observacoes: initialValues?.observacoes || "",
    },
  });

  const [verbaDiariaDisplay, setVerbaDiariaDisplay] = useState(
    initialValues?.verba_diaria ? maskBRLInput(String(Math.round((initialValues.verba_diaria || 0) * 100))) : ""
  );

  useEffect(() => {
    const fetchClientes = async () => {
      const { data } = await supabase.from("clientes").select("id, nome, agencia, verba_ads, tipo_verba, verba_total_contratada, data_inicio, data_limite_verba").order("nome");
      if (data) setClientes(data as any);
    };
    fetchClientes();
  }, []);

  const selectedClienteId = form.watch("cliente_id");
  useEffect(() => {
    if (!initialValues?.cliente_id && selectedClienteId) {
      const cliente = clientes.find(c => c.id === selectedClienteId);
      if (cliente && !form.getValues("verba_diaria")) {
        let calculated = 0;
        if (cliente.tipo_verba === "total_periodo" && cliente.data_limite_verba && cliente.data_inicio) {
          const inicio = new Date(cliente.data_inicio);
          const fim = new Date(cliente.data_limite_verba);
          const dias = Math.max(1, Math.ceil((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)));
          calculated = (cliente.verba_total_contratada || 0) / dias;
        } else {
          calculated = (cliente.verba_ads || 0) / 30;
        }
        form.setValue("verba_diaria", calculated);
        setVerbaDiariaDisplay(maskBRLInput(String(Math.round(calculated * 100))));
      }
    }
  }, [selectedClienteId, clientes]);

  const removePlataforma = (plat: string) => {
    const current = form.getValues("plataformas");
    form.setValue("plataformas", current.filter(p => p !== plat), { shouldValidate: true });
  };

  const addPlataforma = (plat: string) => {
    const current = form.getValues("plataformas");
    if (!current.includes(plat)) {
      form.setValue("plataformas", [...current, plat], { shouldValidate: true });
    }
  };

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
                      {c.nome} — <span>{agenciaLabelOf(c.agencia)}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="plataformas"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Plataformas</FormLabel>
                <div className="flex flex-wrap gap-2 min-h-[40px] p-2 border rounded-md items-center">
                  {field.value.map((plat) => (
                    <Badge key={plat} variant="secondary" className="gap-1 pr-1">
                      {plat}
                      <button
                        type="button"
                        onClick={() => removePlataforma(plat)}
                        className="hover:text-destructive"
                      >
                        <X size={12} />
                      </button>
                    </Badge>
                  ))}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full">
                        <Plus size={14} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {plataformasDisponiveis.filter(p => !field.value.includes(p)).map((plat) => (
                        <DropdownMenuItem key={plat} onClick={() => addPlataforma(plat)}>
                          {plat}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
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
                    {METODOS_PAGAMENTO.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
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
