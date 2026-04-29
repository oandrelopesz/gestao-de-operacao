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
  descricao: z.string().optional(),
  cliente_id: z.string().min(1, "Selecione um cliente"),
  status: z.enum(["fazer_hoje", "fazer_amanha", "fazer_depois_amanha", "standby", "feito"]),
  prioridade: z.enum(["baixa", "media", "alta", "urgente"]),
  prazo: z.string().optional(),
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
