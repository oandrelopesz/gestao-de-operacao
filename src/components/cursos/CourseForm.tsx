import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useForm, useFieldArray } from "react-hook-form";
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
import { Eye, EyeOff, Plus, Check, ChevronsUpDown, X, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TIPOS_ACESSO, tipoAcessoDe } from "@/lib/cursoAcesso";
import { hojeBrasilia } from "@/lib/entrega";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fetchCursoCategorias, createCursoCategoria, corDaCategoria, type CursoCategoriaDef } from "@/lib/cursoCategorias";

const courseSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  tema: z.string().optional(),
  categoria_id: z.string().optional().nullable(),
  tipo_acesso: z.enum(["membros", "drive", "telegram"]),
  /** Tipo drive: uma aula por linha, cada uma com link */
  aulas: z.array(z.object({ titulo: z.string(), link: z.string() })),
  link_area_membros: z.string().optional().or(z.literal("")),
  login: z.string().optional().or(z.literal("")),
  senha: z.string().optional().or(z.literal("")),
  em_andamento: z.boolean(),
  /** Curso concluído: ao salvar vira `concluido_em` (data) e desliga o "em andamento" */
  concluido: z.boolean(),
  observacoes: z.string().optional().or(z.literal("")),
  /** "AAAA-MM-DD" ou vazio (sem expiração) */
  expira_em: z.string().optional().or(z.literal("")),
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
  const [categorias, setCategorias] = useState<CursoCategoriaDef[]>([]);
  const [openCombobox, setOpenCombobox] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const creatingCategoryRef = useRef(false);

  const form = useForm<CourseFormValues>({
    resolver: zodResolver(courseSchema),
    defaultValues: {
      nome: "",
      tema: "outros",
      categoria_id: null,
      tipo_acesso: "membros",
      aulas: [],
      link_area_membros: "",
      login: "",
      senha: "",
      em_andamento: false,
      concluido: false,
      observacoes: "",
      expira_em: "",
    },
  });

  useEffect(() => {
    if (open) {
      fetchCategorias();
    }
  }, [open]);

  const fetchCategorias = async () => {
    try {
      setCategorias(await fetchCursoCategorias());
    } catch (error) {
      console.error("Erro ao buscar categorias:", error);
    }
  };

  const selecionarCategoria = (id: string | null) => {
    form.setValue("categoria_id", id, { shouldDirty: true, shouldValidate: true });
    setSearchQuery("");
    setOpenCombobox(false);
  };

  // Cria a categoria direto do combobox (ou seleciona a existente com o mesmo nome)
  const handleAddCategory = async (nameOverride?: string) => {
    const nameToUse = (nameOverride || searchQuery).trim();
    if (!nameToUse) return null;
    if (creatingCategoryRef.current) return null;
    creatingCategoryRef.current = true;

    try {
      const jaExiste = categorias.some((cat) => cat.nome.toLowerCase() === nameToUse.toLowerCase());
      const categoria = await createCursoCategoria(nameToUse);
      if (!jaExiste) {
        toast.success(`Categoria "${categoria.nome}" criada`);
        setCategorias((prev) => [...prev, categoria]);
      }
      selecionarCategoria(categoria.id);
      return categoria.id;
    } catch (error: any) {
      toast.error(error?.message || "Erro ao criar categoria");
      return null;
    } finally {
      creatingCategoryRef.current = false;
    }
  };

  useEffect(() => {
    if (open) {
      if (editingCourse) {
        form.reset({
          nome: editingCourse.nome || "",
          tema: (editingCourse.tema as any) || "outros",
          categoria_id: editingCourse.categoria_id || null,
          tipo_acesso: tipoAcessoDe(editingCourse.tipo_acesso),
          aulas: Array.isArray(editingCourse.aulas) ? editingCourse.aulas.map((a: any) => ({ titulo: String(a?.titulo || ""), link: String(a?.link || "") })) : [],
          link_area_membros: editingCourse.link_area_membros || "",
          login: editingCourse.login || "",
          senha: editingCourse.senha || "",
          em_andamento: !!editingCourse.em_andamento && !editingCourse.concluido_em,
          concluido: !!editingCourse.concluido_em,
          observacoes: editingCourse.observacoes || "",
          expira_em: editingCourse.expira_em ? String(editingCourse.expira_em).slice(0, 10) : "",
        });
      } else {
        form.reset({
          nome: "",
          tema: "outros",
          categoria_id: null,
          tipo_acesso: "membros",
      aulas: [],
      link_area_membros: "",
          login: "",
          senha: "",
          em_andamento: false,
          concluido: false,
          observacoes: "",
          expira_em: "",
        });
      }
    }
  }, [editingCourse, open, form]);

  const normalizarLink = (link: string) => {
    const l = link.trim();
    if (!l) return "";
    return /^https?:\/\//i.test(l) ? l : `https://${l}`;
  };

  const { fields: aulas, append: addAula, remove: removeAula } = useFieldArray({ control: form.control, name: "aulas" });
  const tipoAcesso = form.watch("tipo_acesso");
  const concluido = form.watch("concluido");

  const onSubmit = async (values: CourseFormValues) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || "b34bdae5-7a67-4b63-a46f-8aad43a06c63";

      if (!userId) {
        toast.error("Usuário não autenticado");
        setLoading(false);
        return;
      }

      let finalLink = values.link_area_membros;
      if (finalLink && !finalLink.startsWith("http://") && !finalLink.startsWith("https://")) {
        finalLink = `https://${finalLink}`;
      }

      const payload: any = {
        nome: values.nome,
        tema: values.tema || "outros",
        categoria_id: values.categoria_id,
        link_area_membros: finalLink,
        tipo_acesso: values.tipo_acesso,
        // Só aulas preenchidas; links sem protocolo ganham https://
        aulas: values.tipo_acesso === "drive"
          ? values.aulas
              .filter((a) => a.titulo.trim() || a.link.trim())
              .map((a, i) => ({ titulo: a.titulo.trim() || `Aula ${i + 1}`, link: normalizarLink(a.link) }))
          : [],
        login: values.login,
        senha: values.senha,
        // Concluído não está em andamento. A data de conclusão que já existia é mantida; senão vale hoje
        em_andamento: values.concluido ? false : values.em_andamento,
        concluido_em: values.concluido
          ? (editingCourse?.concluido_em ? String(editingCourse.concluido_em).slice(0, 10) : hojeBrasilia())
          : null,
        observacoes: values.observacoes,
        expira_em: values.expira_em || null,
        user_id: userId
      };

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
                render={({ field }) => {
                  const selecionada = categorias.find((cat) => cat.id === field.value);
                  return (
                  <FormItem className="flex flex-col">
                    <FormLabel>Categoria</FormLabel>
                    <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={openCombobox}
                            className={cn(
                              "w-full justify-between font-normal",
                              !selecionada && "text-muted-foreground"
                            )}
                          >
                            <span className="flex items-center gap-2 truncate">
                              {selecionada && (
                                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: corDaCategoria(selecionada.cor) }} />
                              )}
                              {selecionada ? selecionada.nome : "Selecione ou crie..."}
                            </span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[240px] p-0" align="start">
                        <Command>
                          <CommandInput
                            placeholder="Buscar ou criar..."
                            value={searchQuery}
                            onValueChange={setSearchQuery}
                          />
                          <CommandList>
                            {categorias.length > 0 && (
                              <CommandGroup heading="Categorias">
                                {categorias.map((cat) => (
                                  <CommandItem
                                    key={cat.id}
                                    value={cat.nome}
                                    onSelect={() => selecionarCategoria(cat.id)}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        field.value === cat.id ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    <span className="mr-2 h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: corDaCategoria(cat.cor) }} />
                                    {cat.nome}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            )}
                            {searchQuery.trim() && !categorias.some((c) => c.nome.toLowerCase() === searchQuery.trim().toLowerCase()) && (
                              <CommandGroup heading="Nova categoria">
                                <CommandItem
                                  value={`criar-${searchQuery}`}
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    void handleAddCategory(searchQuery);
                                  }}
                                  onSelect={() => {
                                    void handleAddCategory(searchQuery);
                                  }}
                                  className="gap-2 text-primary cursor-pointer"
                                >
                                  <Plus size={14} /> Criar "{searchQuery.trim()}"
                                </CommandItem>
                              </CommandGroup>
                            )}
                            {field.value && (
                              <CommandGroup>
                                <CommandItem value="__sem_categoria" onSelect={() => selecionarCategoria(null)} className="text-muted-foreground">
                                  <X className="mr-2 h-4 w-4" /> Remover categoria
                                </CommandItem>
                              </CommandGroup>
                            )}
                            <CommandEmpty>
                              <p className="p-2 text-xs text-muted-foreground">
                                {categorias.length === 0 ? "Digite um nome para criar a primeira categoria." : "Nenhuma categoria encontrada."}
                              </p>
                            </CommandEmpty>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                  );
                }}
              />

              <div className="flex flex-col gap-2">
                <FormField
                  control={form.control}
                  name="em_andamento"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel className="mb-2 h-6 flex items-center">Em andamento</FormLabel>
                      <div className="flex items-center h-10">
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={concluido}
                            className="data-[state=checked]:bg-emerald-500"
                          />
                        </FormControl>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="concluido"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel className="mb-2 h-6 flex items-center">Curso concluído</FormLabel>
                      <div className="flex items-center h-10">
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={(v) => {
                              field.onChange(v);
                              // Um curso concluído não está em andamento
                              if (v) form.setValue("em_andamento", false, { shouldDirty: true });
                            }}
                            className="data-[state=checked]:bg-emerald-500"
                          />
                        </FormControl>
                      </div>
                    </FormItem>
                  )}
                />
              </div>
            </div>


            <FormField
              control={form.control}
              name="expira_em"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Acesso expira em <span className="font-normal text-muted-foreground">(opcional)</span></FormLabel>
                  <div className="flex items-center gap-2">
                    <FormControl>
                      <Input type="date" className="w-[180px]" {...field} />
                    </FormControl>
                    {field.value && (
                      <Button type="button" variant="ghost" size="sm" className="h-9 gap-1 text-muted-foreground" onClick={() => field.onChange("")}>
                        <X size={14} /> Sem data
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">O último dia de acesso. Depois disso o card fica cinza com "Expirado" — nada é apagado.</p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tipo_acesso"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Onde o curso está</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TIPOS_ACESSO.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {tipoAcesso === "drive" ? (
              <div className="space-y-2 rounded-md border p-3 bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium leading-none">Aulas (Google Drive)</span>
                  <Button type="button" variant="outline" size="sm" className="gap-1 h-7" onClick={() => addAula({ titulo: `Aula ${aulas.length + 1}`, link: "" })}>
                    <Plus size={12} /> Aula
                  </Button>
                </div>
                {aulas.length === 0 && (
                  <p className="text-xs text-muted-foreground">Adicione cada aula com o link do arquivo no Drive.</p>
                )}
                {aulas.map((a, i) => (
                  <div key={a.id} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] gap-2 items-center">
                    <FormField
                      control={form.control}
                      name={`aulas.${i}.titulo`}
                      render={({ field }) => (
                        <FormItem><FormControl><Input placeholder={`Aula ${i + 1}`} className="h-8 text-sm" {...field} /></FormControl></FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`aulas.${i}.link`}
                      render={({ field }) => (
                        <FormItem><FormControl><Input placeholder="https://drive.google.com/..." className="h-8 text-sm" {...field} /></FormControl></FormItem>
                      )}
                    />
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => removeAula(i)} title="Remover aula">
                      <Trash2 size={13} />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <FormField
                control={form.control}
                name="link_area_membros"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{tipoAcesso === "telegram" ? "Link do Telegram" : "Link da Área de Membros"}</FormLabel>
                    <FormControl>
                      <Input placeholder={tipoAcesso === "telegram" ? "https://t.me/..." : "https://..."} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className={cn("grid grid-cols-2 gap-4", tipoAcesso !== "membros" && "hidden")}>
              <FormField
                control={form.control}
                name="login"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Login</FormLabel>
                    <FormControl>
                      <Input placeholder="Email ou usuário" autoComplete="off" data-1p-ignore data-lpignore="true" data-bwignore {...field} />
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
                        {/* Senha da plataforma do curso, não do sistema: campo de texto mascarado por CSS (e não
                            type="password") para o Chrome não oferecer salvá-la como login do GestorPro */}
                        <Input
                          type="text"
                          autoComplete="off"
                          data-1p-ignore
                          data-lpignore="true"
                          data-bwignore
                          className={cn(!showPassword && "[-webkit-text-security:disc]")}
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