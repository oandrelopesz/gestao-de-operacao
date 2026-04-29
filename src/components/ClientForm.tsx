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
import { AGENCIAS, maskBRLInput, parseBRLInput, formatBRL } from "@/lib/clientes";

const clientSchema = z.object({
  nome: z.string().min(2, "Nome é obrigatório"),
  agencia: z.enum(["effect", "spike", "alt", "pessoais"]),
  nicho: z.string().optional(),
  data_inicio: z.string().min(1, "Informe a data de início"),
  verba_ads: z.number().min(0),
  observacoes: z.string().optional(),
  em_onboarding: z.boolean(),
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
    },
  });

  const [verbaDisplay, setVerbaDisplay] = useState(
    initialValues?.verba_ads ? maskBRLInput(String(Math.round((initialValues.verba_ads || 0) * 100))) : ""
  );

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

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Salvando..." : "Salvar cliente"}
        </Button>
      </form>
    </Form>
  );
}
