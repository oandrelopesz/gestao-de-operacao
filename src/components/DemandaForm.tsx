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
import { ClientePicker } from "@/components/demandas/ClientePicker";
import { clientesDaDemanda } from "@/lib/clientesDaDemanda";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const demandaSchema = z.object({
  titulo: z.string().min(2, "Título é obrigatório"),
  descricao: z.string().nullable().optional(),
  cliente_id: z.string().optional().nullable().or(z.literal("")),
  clientes_extras: z.array(z.string()).optional(),
  pessoal: z.boolean().optional(),
  status: z.string().min(1, "Selecione a coluna"),
  prioridade: z.enum(["baixa", "media", "alta", "urgente"]),
  prazo: z.string().nullable().optional(),
  recorrente: z.boolean(),
  frequencia_tipo: z.enum(["diaria", "semanal", "quinzenal", "mensal", "customizada"]).nullable().optional(),
  frequencia_dia_mes: z.number().nullable().optional(),
  frequencia_intervalo_dias: z.number().nullable().optional(),
  prospeccao_id: z.string().uuid().nullable().optional(),
});

export type DemandaFormValues = z.infer<typeof demandaSchema>;

interface DemandaFormProps {
  clientes: { id: string; nome: string; agencia?: string }[];
  columns: { id: string; title: string }[];
  onSubmit: (values: DemandaFormValues) => void;
  loading?: boolean;
}

export function DemandaForm({ clientes, columns, onSubmit, loading, initialValues }: DemandaFormProps & { initialValues?: Partial<DemandaFormValues> }) {
  const form = useForm<DemandaFormValues>({
    resolver: zodResolver(demandaSchema),
    defaultValues: {
      titulo: initialValues?.titulo || "",
      descricao: initialValues?.descricao || "",
      cliente_id: initialValues?.cliente_id || "",
      clientes_extras: initialValues?.clientes_extras ?? [],
      pessoal: initialValues?.pessoal ?? false,
      status: initialValues?.status || "fazer_hoje",
      prioridade: (initialValues?.prioridade as any) || "media",
      prazo: initialValues?.prazo || "",
      recorrente: initialValues?.recorrente || false,
      frequencia_tipo: (initialValues as any)?.frequencia_tipo || "semanal",
      frequencia_dia_mes: (initialValues as any)?.frequencia_dia_mes || null,
      frequencia_intervalo_dias: (initialValues as any)?.frequencia_intervalo_dias || null,
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="titulo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Título</FormLabel>
              <FormControl>
                <Input placeholder="O que precisa ser feito?" {...field} value={field.value || ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="cliente_id"
          render={({ field }) => {
            const extras = form.watch("clientes_extras") ?? [];
            const pessoal = !!form.watch("pessoal");
            const ids = clientesDaDemanda({ cliente_id: field.value || null, clientes_extras: extras });
            const rotulo = pessoal
              ? "Pessoal"
              : ids.length
                ? ids.map((id) => clientes.find((c) => c.id === id)?.nome ?? "Cliente").join(" + ")
                : "Sem cliente (opcional)";
            return (
              <FormItem>
                <FormLabel>Cliente(s)</FormLabel>
                <ClientePicker
                  clientes={clientes}
                  clienteIdAtual={field.value || null}
                  pessoalAtual={pessoal}
                  clientesExtrasAtuais={extras}
                  comAgencias={false}
                  variosClientes
                  onEscolher={(v) => {
                    field.onChange(v.cliente_id ?? "");
                    form.setValue("clientes_extras", v.clientes_extras);
                    form.setValue("pessoal", v.pessoal);
                  }}
                >
                  <Button type="button" variant="outline" className="w-full justify-start font-normal">
                    <span className="truncate">{rotulo}</span>
                  </Button>
                </ClientePicker>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Coluna</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Coluna" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {columns.map((col) => (
                      <SelectItem key={col.id} value={col.id}>{col.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="prioridade"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Prioridade</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Prioridade" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
          <FormField
            control={form.control}
            name="recorrente"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between">
                <div>
                  <FormLabel className="text-base font-medium">Tarefa Recorrente</FormLabel>
                  <p className="text-xs text-muted-foreground">Repetir esta tarefa periodicamente</p>
                </div>
                <FormControl>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                    checked={field.value}
                    onChange={(e) => {
                      const isChecked = e.target.checked;
                      field.onChange(isChecked);
                      if (isChecked) {
                        form.setValue("status", "recorrentes");
                      } else if (form.getValues("status") === "recorrentes") {
                        form.setValue("status", "fazer_hoje");
                      }
                    }}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          {form.watch("recorrente") && (
            <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <FormField
                control={form.control}
                name="frequencia_tipo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Frequência</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value || "semanal"}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Frequência" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="diaria">Diária</SelectItem>
                        <SelectItem value="semanal">Semanal</SelectItem>
                        <SelectItem value="quinzenal">Quinzenal</SelectItem>
                        <SelectItem value="mensal">Mensal</SelectItem>
                        <SelectItem value="customizada">Customizada</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="frequencia_intervalo_dias"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Intervalo (dias)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="Ex: 3" {...field} value={field.value || ""} onChange={e => field.onChange(parseInt(e.target.value))} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}
        </div>

        <FormField
          control={form.control}
          name="prazo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Prazo (Opcional)</FormLabel>
              <FormControl>
                <Input type="date" {...field} value={field.value || ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="descricao"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrição</FormLabel>
              <FormControl>
                <Textarea placeholder="Mais detalhes sobre a tarefa..." {...field} value={field.value || ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Salvando..." : "Criar Demanda"}
        </Button>
      </form>
    </Form>
  );
}
