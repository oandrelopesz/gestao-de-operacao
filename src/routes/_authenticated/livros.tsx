import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { 
  Plus, 
  Search, 
  Book, 
  BookOpen, 
  CheckCircle2, 
  MoreVertical, 
  Pencil, 
  Trash2, 
  History,
  TrendingUp,
  Clock,
  ArrowRight,
  ChevronDown,
  X,
  Library
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/livros")({
  component: LivrosPage,
});

type Livro = {
  id: string;
  nome: string;
  autor: string;
  em_andamento: boolean;
  lido: boolean;
  data_inicio: string | null;
  data_conclusao: string | null;
  observacoes: string | null;
  ordem: number;
};

function LivrosPage() {
  const [aba, setAba] = useState<string>("estante");
  const [livros, setLivros] = useState<Livro[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLivro, setEditingLivro] = useState<Partial<Livro> | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState("");
  const [movingId, setMovingId] = useState<string | null>(null);
  const [movingName, setMovingName] = useState("");
  const [fadeId, setFadeId] = useState<string | null>(null);

  const fetchLivros = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("livros")
        .select("*")
        .order("nome");
      if (error) throw error;
      setLivros((data as any[]) || []);
    } catch (error: any) {
      toast.error("Erro ao carregar livros: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLivros();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "n" && !isModalOpen && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        setEditingLivro({});
        setIsModalOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const metrics = useMemo(() => {
    const total = livros.length;
    const emAndamento = livros.filter(l => l.em_andamento && !l.lido).length;
    const esteAno = livros.filter(l => l.lido && l.data_conclusao && new Date(l.data_conclusao).getFullYear() === new Date().getFullYear()).length;
    return { total, emAndamento, esteAno };
  }, [livros]);

  const filteredLivros = useMemo(() => {
    const search = searchQuery.toLowerCase();
    const filtered = livros.filter(l => 
      l.nome.toLowerCase().includes(search) || 
      l.autor.toLowerCase().includes(search)
    );

    if (aba === "estante") {
      return filtered.filter(l => !l.lido).sort((a, b) => {
        if (a.em_andamento && !b.em_andamento) return -1;
        if (!a.em_andamento && b.em_andamento) return 1;
        return a.nome.localeCompare(b.nome);
      });
    } else {
      return filtered.filter(l => l.lido).sort((a, b) => {
        const dateA = a.data_conclusao ? new Date(a.data_conclusao).getTime() : 0;
        const dateB = b.data_conclusao ? new Date(b.data_conclusao).getTime() : 0;
        return dateB - dateA;
      });
    }
  }, [livros, aba, searchQuery]);

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const userId = 'b34bdae5-7a67-4b63-a46f-8aad43a06c63';
    
    const values: any = {
      nome: formData.get("nome") as string,
      autor: formData.get("autor") as string,
      em_andamento: formData.get("em_andamento") === "on",
      lido: formData.get("lido") === "on",
      observacoes: formData.get("observacoes") as string,
      data_inicio: formData.get("data_inicio") || null,
      data_conclusao: formData.get("data_conclusao") || null,
      user_id: userId
    };

    try {
      if (editingLivro?.id) {
        const { error } = await supabase.from("livros").update(values).eq("id", editingLivro.id);
        if (error) throw error;
        toast.success("Livro atualizado!");
      } else {
        const { error } = await supabase.from("livros").insert([values]);
        if (error) throw error;
        toast.success("Livro adicionado!");
      }
      setIsModalOpen(false);
      fetchLivros();
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    }
  };

  const handleMarkAsRead = async (livro: Livro) => {
    setFadeId(livro.id);
    setTimeout(async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const { error } = await supabase
          .from("livros")
          .update({ 
            lido: true, 
            em_andamento: false, 
            data_conclusao: today 
          })
          .eq("id", livro.id);
        if (error) throw error;
        toast.success(`📚 ${livro.nome} adicionado aos lidos!`);
        setFadeId(null);
        fetchLivros();
      } catch (error: any) {
        toast.error("Erro ao atualizar status");
        setFadeId(null);
      }
    }, 400);
  };

  const handleToggleAndamento = async (livro: Livro) => {
    const newVal = !livro.em_andamento;
    const updates: any = { em_andamento: newVal };
    
    if (newVal && !livro.data_inicio) {
      updates.data_inicio = new Date().toISOString().split('T')[0];
    }

    try {
      const { error } = await supabase.from("livros").update(updates).eq("id", livro.id);
      if (error) throw error;
      fetchLivros();
    } catch (error) {
      toast.error("Erro ao atualizar");
    }
  };

  const handleMoveToShelf = async (id: string) => {
    try {
      const { error } = await supabase
        .from("livros")
        .update({ lido: false, em_andamento: false, data_conclusao: null })
        .eq("id", id);
      if (error) throw error;
      toast.success("Livro movido de volta para a estante");
      setMovingId(null);
      fetchLivros();
    } catch (error) {
      toast.error("Erro ao mover livro");
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      const { error } = await supabase.from("livros").delete().eq("id", deletingId);
      if (error) throw error;
      toast.success("Livro removido");
      setDeletingId(null);
      fetchLivros();
    } catch (error) {
      toast.error("Erro ao remover");
    }
  };

  return (
    <div className="space-y-6 flex flex-col h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Livros</h1>
          <p className="text-muted-foreground">Biblioteca pessoal e controle de leitura</p>
        </div>
        <Button onClick={() => { setEditingLivro({}); setIsModalOpen(true); }} className="gap-2">
          <Plus size={18} /> Novo livro
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-muted/20 border-none shadow-none">
          <CardHeader className="p-4 pb-1">
            <CardTitle className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
              <Library size={14} /> Total na biblioteca
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold">{metrics.total}</div>
          </CardContent>
        </Card>
        <Card className="bg-emerald-500/10 border-emerald-500/20 shadow-none cursor-pointer hover:bg-emerald-500/15 transition-colors" onClick={() => setAba("estante")}>
          <CardHeader className="p-4 pb-1">
            <CardTitle className="text-xs font-bold uppercase text-emerald-600 flex items-center gap-2">
              <BookOpen size={14} /> Em andamento
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-emerald-600">{metrics.emAndamento}</div>
          </CardContent>
        </Card>
        <Card className="bg-blue-500/10 border-blue-500/20 shadow-none cursor-pointer hover:bg-blue-500/15 transition-colors" onClick={() => setAba("lidos")}>
          <CardHeader className="p-4 pb-1">
            <CardTitle className="text-xs font-bold uppercase text-blue-600 flex items-center gap-2">
              <CheckCircle2 size={14} /> Lidos em {new Date().getFullYear()}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-blue-600">{metrics.esteAno}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b pb-4">
        <Tabs value={aba} onValueChange={setAba} className="w-full sm:w-auto">
          <TabsList>
            <TabsTrigger value="estante" className="gap-2">
              Estante
              <Badge variant="secondary" className="px-1.5 h-4 text-[10px]">{livros.filter(l => !l.lido).length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="lidos" className="gap-2">
              Lidos
              <Badge variant="secondary" className="px-1.5 h-4 text-[10px]">{livros.filter(l => l.lido).length}</Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por nome ou autor..." 
            className="pl-9 h-9 text-xs" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {filteredLivros.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Book className="size-12 text-muted-foreground/20 mb-4" />
            <p className="text-muted-foreground font-medium">
              {aba === "estante" 
                ? "Sua estante está vazia. Adicione livros pra começar a controlar suas leituras." 
                : "Você ainda não concluiu nenhum livro. Que tal começar agora?"}
            </p>
            <Button variant="link" onClick={() => aba === "estante" ? setIsModalOpen(true) : setAba("estante")} className="mt-2">
              {aba === "estante" ? "Adicionar meu primeiro livro" : "Ver minha estante"}
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            {aba === "estante" && (
              <>
                {filteredLivros.some(l => l.em_andamento) && (
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">Lendo agora</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {filteredLivros.filter(l => l.em_andamento).map(livro => (
                        <BookCard 
                          key={livro.id} 
                          livro={livro} 
                          onMarkRead={handleMarkAsRead}
                          onToggleAndamento={handleToggleAndamento}
                          onEdit={(l) => { setEditingLivro(l); setIsModalOpen(true); }}
                          onDelete={(id, name) => { setDeletingId(id); setDeletingName(name); }}
                          fade={fadeId === livro.id}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {filteredLivros.some(l => !l.em_andamento) && (
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">Na fila</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {filteredLivros.filter(l => !l.em_andamento).map(livro => (
                        <BookCard 
                          key={livro.id} 
                          livro={livro} 
                          onMarkRead={handleMarkAsRead}
                          onToggleAndamento={handleToggleAndamento}
                          onEdit={(l) => { setEditingLivro(l); setIsModalOpen(true); }}
                          onDelete={(id, name) => { setDeletingId(id); setDeletingName(name); }}
                          fade={fadeId === livro.id}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            {aba === "lidos" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {filteredLivros.map(livro => (
                  <BookCard 
                    key={livro.id} 
                    livro={livro} 
                    isLidoView
                    onEdit={(l) => { setEditingLivro(l); setIsModalOpen(true); }}
                    onDelete={(id, name) => { setDeletingId(id); setDeletingName(name); }}
                    onMoveBack={(id, name) => { setMovingId(id); setMovingName(name); }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingLivro?.id ? "Editar Livro" : "Novo Livro"}</DialogTitle>
            <DialogDescription>Preencha os detalhes do livro para sua biblioteca.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome do livro</Label>
              <Input id="nome" name="nome" defaultValue={editingLivro?.nome} required placeholder="Ex: O Oceano Azul" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="autor">Autor</Label>
              <Input id="autor" name="autor" defaultValue={editingLivro?.autor} required placeholder="Ex: W. Chan Kim" />
            </div>

            <div className="flex flex-col gap-4 p-4 border rounded-lg bg-muted/20">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Em andamento</Label>
                  <p className="text-[10px] text-muted-foreground">Estou lendo este livro no momento</p>
                </div>
                <Switch 
                  id="em_andamento_switch" 
                  name="em_andamento" 
                  defaultChecked={editingLivro?.em_andamento}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      const lidoSwitch = document.getElementById("lido_switch") as HTMLInputElement;
                      if (lidoSwitch && lidoSwitch.checked) {
                        lidoSwitch.click();
                      }
                    }
                  }}
                />
              </div>

              <div className="flex items-center justify-between border-t pt-4">
                <div className="space-y-0.5">
                  <Label>Já lido?</Label>
                  <p className="text-[10px] text-muted-foreground">Marcar como concluído</p>
                </div>
                <Switch 
                  id="lido_switch" 
                  name="lido" 
                  defaultChecked={editingLivro?.lido}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      const andamentoSwitch = document.getElementById("em_andamento_switch") as HTMLInputElement;
                      if (andamentoSwitch && andamentoSwitch.checked) {
                        andamentoSwitch.click();
                      }
                    }
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="data_inicio">Data de Início</Label>
                <Input type="date" id="data_inicio" name="data_inicio" defaultValue={editingLivro?.data_inicio || ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="data_conclusao">Data de Conclusão</Label>
                <Input type="date" id="data_conclusao" name="data_conclusao" defaultValue={editingLivro?.data_conclusao || ""} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea id="observacoes" name="observacoes" defaultValue={editingLivro?.observacoes || ""} placeholder="Takeaways, quem indicou, etc..." rows={3} />
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
              <Button type="submit">Salvar Livro</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover "{deletingName}"?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. O livro será removido permanentemente da sua biblioteca.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!movingId} onOpenChange={(o) => !o && setMovingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover "{movingName}" de volta pra estante?</AlertDialogTitle>
            <AlertDialogDescription>A data de conclusão será apagada e o livro voltará para a lista de "Não iniciados".</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => movingId && handleMoveToShelf(movingId)}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BookCard({ 
  livro, 
  isLidoView, 
  onMarkRead, 
  onToggleAndamento, 
  onEdit, 
  onDelete,
  onMoveBack,
  fade
}: { 
  livro: Livro, 
  isLidoView?: boolean, 
  onMarkRead?: (l: Livro) => void,
  onToggleAndamento?: (l: Livro) => void,
  onEdit: (l: Livro) => void,
  onDelete: (id: string, name: string) => void,
  onMoveBack?: (id: string, name: string) => void,
  fade?: boolean
}) {
  const diffDays = livro.data_inicio && livro.data_conclusao 
    ? differenceInDays(new Date(livro.data_conclusao), new Date(livro.data_inicio))
    : null;

  return (
    <Card className={cn(
      "group flex flex-col transition-all duration-400 border-l-4",
      fade ? "opacity-0 scale-95" : "opacity-100 scale-100",
      isLidoView ? "border-l-blue-400 bg-zinc-50/50 dark:bg-zinc-900/30 opacity-90" : 
      livro.em_andamento ? "border-l-emerald-500 shadow-sm" : "border-l-zinc-300 dark:border-l-zinc-800 opacity-80"
    )}>
      <CardHeader className="p-4 pb-2">
        <div className="flex justify-between items-start">
          <div className="space-y-1 pr-8">
            <h4 className="font-bold text-sm leading-tight line-clamp-2">{livro.nome}</h4>
            <p className="text-[11px] text-muted-foreground truncate">{livro.autor}</p>
          </div>
          <div className="absolute top-3 right-3 flex items-center gap-1">
            {!isLidoView && (
              <Switch 
                checked={livro.em_andamento} 
                onCheckedChange={() => onToggleAndamento?.(livro)}
                className="scale-75 origin-right"
              />
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <MoreVertical size={14} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(livro)} className="gap-2 text-xs">
                  <Pencil size={12} /> Editar
                </DropdownMenuItem>
                {isLidoView ? (
                  <DropdownMenuItem onClick={() => onMoveBack?.(livro.id, livro.nome)} className="gap-2 text-xs">
                    <History size={12} /> Mover para estante
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => onMarkRead?.(livro)} className="gap-2 text-xs">
                    <CheckCircle2 size={12} /> Marcar como lido
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onDelete(livro.id, livro.nome)} className="gap-2 text-xs text-destructive focus:text-destructive">
                  <Trash2 size={12} /> Remover
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-1 flex-1 flex flex-col justify-between gap-4">
        <div className="space-y-2">
          {isLidoView ? (
            <div className="space-y-1.5">
              <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-[10px]">Lido</Badge>
              <div className="flex flex-col gap-0.5">
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 size={10} /> Lido em {livro.data_conclusao ? format(new Date(livro.data_conclusao + "T12:00:00"), "dd/MM/yyyy") : "—"}
                </p>
                {diffDays !== null && (
                  <p className="text-[10px] text-muted-foreground font-medium pl-3.5">
                    Tempo: {diffDays} {diffDays === 1 ? 'dia' : 'dias'}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {livro.em_andamento && (
                <>
                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">Lendo</Badge>
                  {livro.data_inicio && (
                    <p className="text-[10px] text-emerald-600 font-medium flex items-center gap-1 mt-0.5">
                      <Clock size={10} /> Iniciado em {format(new Date(livro.data_inicio + "T12:00:00"), "dd/MM")}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
          {livro.observacoes && (
            <p className="text-[10px] text-muted-foreground line-clamp-2 italic">"{livro.observacoes}"</p>
          )}
        </div>

        {!isLidoView && (
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full h-8 text-xs gap-1.5 mt-2 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition-colors"
            onClick={() => onMarkRead?.(livro)}
          >
            <Check size={14} /> Marcar como lido
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function Check({ size, className }: { size?: number, className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size || 24} 
      height={size || 24} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
