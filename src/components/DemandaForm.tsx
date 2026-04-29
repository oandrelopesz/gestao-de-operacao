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

const demandaSchema = z.object({
  titulo: z.string().min(2, "Título é obrigatório"),
  descricao: z.string().optional().nullable(),
  cliente_id: z.string().min(1, "Selecione um cliente"),
  status: z.enum(["recorrentes", "fazer_hoje", "fazer_amanha", "fazer_depois_amanha", "standby", "feito"]),
  prioridade: z.enum(["baixa", "media", "alta", "urgente"]),
  prazo: z.string().optional().nullable(),
  recorrente: z.boolean(),
  frequencia: z.enum(["diaria", "semanal", "quinzenal", "mensal", "customizada"]).optional().nullable(),
  dia_referencia: z.string().optional().nullable(),
});

export type DemandaFormValues = z.infer<typeof demandaSchema>;

interface DemandaFormProps {
  clientes: { id: string; nome: string; agencia?: string }[];
  onSubmit: (values: DemandaFormValues) => void;
  loading?: boolean;
}

export function DemandaForm({ clientes, onSubmit, loading, initialValues }: DemandaFormProps & { initialValues?: Partial<DemandaFormValues> }) {
  const form = useForm<DemandaFormValues>({
    resolver: zodResolver(demandaSchema),
    defaultValues: {
      titulo: initialValues?.titulo || "",
      descricao: initialValues?.descricao || "",
      cliente_id: initialValues?.cliente_id || "",
      status: initialValues?.status || "fazer_hoje",
      prioridade: initialValues?.prioridade || "media",
      prazo: initialValues?.prazo || "",
      recorrente: initialValues?.recorrente || false,
      frequencia: initialValues?.frequencia || "semanal",
      dia_referencia: initialValues?.dia_referencia || "",
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
                <Input placeholder="O que precisa ser feito?" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="cliente_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cliente</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um cliente" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome} {c.agencia && `— ${c.agencia.charAt(0).toUpperCase() + c.agencia.slice(1)}`}
                    </SelectItem>
                  ))}
                  {clientes.length === 0 && (
                    <SelectItem value="none" disabled>Nenhum cliente cadastrado</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
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
                    <SelectItem value="recorrentes">Recorrentes</SelectItem>
                    <SelectItem value="fazer_hoje">Fazer hoje</SelectItem>
                    <SelectItem value="fazer_amanha">Fazer amanhã</SelectItem>
                    <SelectItem value="fazer_depois_amanha">Fazer depois de amanhã</SelectItem>
                    <SelectItem value="standby">Standby</SelectItem>
                    <SelectItem value="feito">Feito</SelectItem>
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
                  <FormLabel className="text-base">Tarefa Recorrente</FormLabel>
                  <p className="text-xs text-muted-foreground">Repetir esta tarefa periodicamente</p>
                </div>
                <FormControl>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    checked={field.value}
                    onChange={(e) => {
                      field.onChange(e.target.checked);
                      if (e.target.checked) {
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
                name="frequencia"
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
                name="dia_referencia"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dia de Referência</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Toda segunda" {...field} value={field.value || ""} />
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
                <Input type="date" {...field} />
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
                <Textarea placeholder="Mais detalhes sobre a tarefa..." {...field} />
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
