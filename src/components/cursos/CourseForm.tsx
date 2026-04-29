import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  Command, 
  CommandEmpty, 
  CommandGroup, 
  CommandInput, 
  CommandItem, 
  CommandList 
} from "@/components/ui/command";
import { Eye, EyeOff, Plus, Check, ChevronsUpDown, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const courseSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  tema: z.string().optional(),
  categoria_id: z.string().optional().nullable(),
  link_area_membros: z.string().optional().or(z.literal("")),
  login: z.string().optional().or(z.literal("")),
  senha: z.string().optional().or(z.literal("")),
  em_andamento: z.boolean(),
  observacoes: z.string().optional().or(z.literal("")),
});

type CourseFormValues = z.infer<typeof courseSchema>;

interface CourseFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingCourse: any | null;
  onSuccess: () => void;
}

export function CourseForm({ open, onOpenChange, editingCourse, onSuccess }: CourseFormProps) {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [categorias, setCategorias] = useState<{ id: string; nome: string }[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isAddingCategory, setIsAddingCategory] = useState(false);

  const form = useForm<CourseFormValues>({
    resolver: zodResolver(courseSchema),
    defaultValues: {
      nome: "",
      tema: "outros",
      categoria_id: null,
      link_area_membros: "",
      login: "",
      senha: "",
      em_andamento: false,
      observacoes: "",
    },
  });

  useEffect(() => {
    if (open) {
      fetchCategorias();
    }
  }, [open]);

  const fetchCategorias = async () => {
    try {
      const { data, error } = await supabase
        .from("curso_categorias")
        .select("id, nome")
        .order("nome");
      
      if (error) throw error;
      setCategorias(data || []);
    } catch (error) {
      console.error("Erro ao buscar categorias:", error);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || 'b34bdae5-7a67-4b63-a46f-8aad43a06c63';

      const { data, error } = await supabase
        .from("curso_categorias")
        .insert([{ nome: newCategoryName.trim(), user_id: userId }])
        .select()
        .single();

      if (error) throw error;

      toast.success("Categoria criada!");
      setCategorias(prev => [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome)));
      form.setValue("categoria_id", data.id);
      setNewCategoryName("");
      setIsAddingCategory(false);
    } catch (error: any) {
      toast.error("Erro ao criar categoria");
    }
  };

  useEffect(() => {
    if (open) {
      if (editingCourse) {
        form.reset({
          nome: editingCourse.nome || "",
          tema: (editingCourse.tema as any) || "outros",
          categoria_id: editingCourse.categoria_id || null,
          link_area_membros: editingCourse.link_area_membros || "",
          login: editingCourse.login || "",
          senha: editingCourse.senha || "",
          em_andamento: !!editingCourse.em_andamento,
          observacoes: editingCourse.observacoes || "",
        });
      } else {
        form.reset({
          nome: "",
          tema: "outros",
          categoria_id: null,
          link_area_membros: "",
          login: "",
          senha: "",
          em_andamento: false,
          observacoes: "",
        });
      }
    }
  }, [editingCourse, open, form]);

  const onSubmit = async (values: CourseFormValues) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || 'b34bdae5-7a67-4b63-a46f-8aad43a06c63';

      let finalLink = values.link_area_membros;
      if (finalLink && !finalLink.startsWith("http://") && !finalLink.startsWith("https://")) {
        finalLink = `https://${finalLink}`;
      }

      const payload = {
        ...values,
        link_area_membros: finalLink,
        user_id: userId
      } as any;

      if (editingCourse) {
        const { error } = await supabase
          .from("cursos")
          .update(payload)
          .eq("id", editingCourse.id);
        if (error) throw error;
        toast.success("Curso atualizado!");
      } else {
        const { error } = await supabase
          .from("cursos")
          .insert([payload]);
        if (error) throw error;
        toast.success("Curso criado!");
      }
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar curso");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{editingCourse ? "Editar Curso" : "Novo Curso"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do Curso</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Formação IA" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="categoria_id"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="flex items-center justify-between">
                      Categoria
                      {!isAddingCategory && (
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 px-2 text-[10px] gap-1"
                          onClick={() => setIsAddingCategory(true)}
                        >
                          <Plus size={10} /> Nova
                        </Button>
                      )}
                    </FormLabel>
                    {isAddingCategory ? (
                      <div className="flex gap-2">
                        <Input 
                          placeholder="Nome da categoria" 
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          className="h-9"
                          autoFocus
                        />
                        <Button 
                          type="button" 
                          size="sm" 
                          onClick={handleAddCategory}
                          className="h-9 px-3"
                        >
                          OK
                        </Button>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => setIsAddingCategory(false)}
                          className="h-9 px-3"
                        >
                          X
                        </Button>
                      </div>
                    ) : (
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione uma categoria" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categorias.map(cat => (
                            <SelectItem key={cat.id} value={cat.id}>{cat.nome}</SelectItem>
                          ))}
                          {categorias.length === 0 && (
                            <div className="p-2 text-xs text-center text-muted-foreground">
                              Nenhuma categoria criada
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="em_andamento"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="mb-2 h-6 flex items-center">Em andamento</FormLabel>
                    <FormControl>
                      <div className="flex items-center h-10">
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          className="data-[state=checked]:bg-emerald-500"
                        />
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="tema"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tema (Legado)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um tema" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ia">IA</SelectItem>
                      <SelectItem value="trafego_pago">Tráfego Pago</SelectItem>
                      <SelectItem value="trackeamento">Trackeamento</SelectItem>
                      <SelectItem value="copywriting">Copywriting</SelectItem>
                      <SelectItem value="gestao">Gestão</SelectItem>
                      <SelectItem value="vendas">Vendas</SelectItem>
                      <SelectItem value="multiplos_temas">Múltiplos Temas</SelectItem>
                      <SelectItem value="outros">Outros</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="link_area_membros"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Link da Área de Membros</FormLabel>
                  <FormControl>
                    <Input placeholder="https://..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="login"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Login</FormLabel>
                    <FormControl>
                      <Input placeholder="Email ou usuário" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="senha"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Senha</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="Senha de acesso"
                          {...field}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </Button>
                      </div>
                    </FormControl>
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
                    <Textarea 
                      placeholder="Anotações sobre o curso..." 
                      className="resize-none h-20"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Salvando..." : editingCourse ? "Salvar Alterações" : "Criar Curso"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}