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
import { AGENCIAS, maskBRLInput, parseBRLInput, formatBRL } from "@/lib/clientes";

const PLATAFORMAS_DISPONIVEIS = [
  "Meta",
  "Google",
  "Pinterest",
  "X Ads",
  "LinkedIn",
  "TikTok",
  "Taboola",
  "Outbrain",
];

const clientSchema = z.object({
  nome: z.string().min(2, "Nome é obrigatório"),
  agencia: z.enum(["effect", "spike", "alt", "pessoais"]),
  nicho: z.string().optional(),
  data_inicio: z.string().min(1, "Informe a data de início"),
  verba_ads: z.number().min(0),
  observacoes: z.string().optional(),
  em_onboarding: z.boolean(),
  status_operacional: z.enum(["ativo", "pausado", "churn"]),
  tipo_verba: z.enum(["mensal", "total_periodo"]),
  verba_total_contratada: z.union([z.number(), z.string().length(0)]).optional().nullable(),
  data_limite_verba: z.string().optional().nullable().or(z.literal("")),
  metodo_pagamento: z.enum(["cartao", "pix", "boleto"]),
  plataformas: z.array(z.string()).min(1, "Selecione pelo menos uma plataforma"),
});

export type ClientFormValues = z.infer<typeof clientSchema>;

interface ClientFormProps {
  initialValues?: Partial<ClientFormValues>;
  onSubmit: (values: ClientFormValues) => void;
  loading?: boolean;
}

export function ClientForm({ initialValues, onSubmit, loading }: ClientFormProps) {
  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      nome: initialValues?.nome || "",
      agencia: (initialValues?.agencia as any) || "effect",
      nicho: initialValues?.nicho || "",
      data_inicio: initialValues?.data_inicio || new Date().toISOString().slice(0, 10),
      verba_ads: initialValues?.verba_ads ?? 0,
      observacoes: initialValues?.observacoes || "",
      em_onboarding: initialValues?.em_onboarding ?? false,
      status_operacional: initialValues?.status_operacional || "ativo",
      tipo_verba: initialValues?.tipo_verba || "mensal",
      verba_total_contratada: initialValues?.verba_total_contratada ?? null,
      data_limite_verba: initialValues?.data_limite_verba || "",
      metodo_pagamento: initialValues?.metodo_pagamento || "pix",
      plataformas: initialValues?.plataformas || [],
    },
  });

  const [verbaDisplay, setVerbaDisplay] = useState(
    initialValues?.verba_ads ? maskBRLInput(String(Math.round((initialValues.verba_ads || 0) * 100))) : ""
  );

  const removePlataforma = (plat: string) => {
    const current = form.getValues("plataformas");
    form.setValue("plataformas", current.filter((p) => p !== plat), { shouldValidate: true });
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
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {AGENCIAS.map((a) => (
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

          {form.watch("tipo_verba") === "mensal" ? (
            <FormField
              control={form.control}
              name="verba_ads"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Verba de ads / mês</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="numeric"
                      placeholder="R$ 0,00"
                      value={verbaDisplay}
                      onChange={(e) => {
                        const masked = maskBRLInput(e.target.value);
                        setVerbaDisplay(masked);
                        field.onChange(parseBRLInput(e.target.value));
                      }}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">{formatBRL(field.value)}</p>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="verba_total_contratada"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Verba Total Contratada</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        placeholder="R$ 0,00"
                        value={field.value ? formatBRL(field.value) : ""}
                        onChange={(e) => {
                          field.onChange(parseBRLInput(e.target.value));
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="data_limite_verba"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data Limite</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}
        </div>
        </div>


        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-md border p-4 bg-muted/20">
          <FormField
            control={form.control}
            name="metodo_pagamento"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Forma de pagamento</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="pix">Pix</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                    <SelectItem value="cartao">Cartão (sem monitoramento)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Define como o saldo de mídia será monitorado.
                </p>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="plataformas"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Plataformas de mídia</FormLabel>
                <div className="flex flex-wrap gap-2 min-h-[40px] p-2 border rounded-md items-center bg-background">
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
                      <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full" type="button">
                        <Plus size={14} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {PLATAFORMAS_DISPONIVEIS.filter((p) => !field.value.includes(p)).map((plat) => (
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
