import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { 
  Plus, Search, MoreVertical, Pencil, Trash2, 
  ExternalLink, Copy, Check, Eye, EyeOff, 
  PlayCircle, PauseCircle, BookOpen
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useCachedState, hasCached } from "@/lib/pageCache";
import { CACHE_KEYS, loadCursos } from "@/lib/data";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CourseForm } from "@/components/cursos/CourseForm";
import { corDaCategoria, type CursoCategoriaDef } from "@/lib/cursoCategorias";

type Tema = string; // enum legado; a classificação agora é por categoria_id

type Categoria = CursoCategoriaDef;

interface Curso {
  id: string;
  nome: string;
  tema: Tema;
  categoria_id: string | null;
  link_area_membros: string | null;
  login: string | null;
  senha: string | null;
  em_andamento: boolean;
  observacoes: string | null;
  ordem: number;
  curso_categorias?: Categoria | null;
}

const SEM_CATEGORIA = { id: "sem_categoria", label: "Sem categoria", hex: "#94a3b8" };

export const Route = createFileRoute("/_authenticated/cursos")({
  component: CursosPage,
});

function CursosPage() {
  const navigate = useNavigate();
  const searchParams = Route.useSearch() as { tema?: string };
  const currentTema = (searchParams.tema as string) || "todos";

  const [cursos, setCursos] = useCachedState<Curso[]>(CACHE_KEYS.cursos, []);
  const [categorias, setCategorias] = useCachedState<Categoria[]>(CACHE_KEYS.cursoCategorias, []);
  const [loading, setLoading] = useState(!hasCached(CACHE_KEYS.cursos));
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Curso | null>(null);
  const [deletingCourse, setDeletingCourse] = useState<Curso | null>(null);

  useEffect(() => {
    fetchData();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "n" && !isModalOpen && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        handleAddCourse();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const fetchData = async () => {
    if (!hasCached(CACHE_KEYS.cursos)) setLoading(true);
    try {
      const { cursos: lista, categorias: cats } = await loadCursos();
      setCursos(lista as Curso[]);
      setCategorias(cats as Categoria[]);
    } catch (error: any) {
      toast.error("Erro ao carregar cursos");
    } finally {
      setLoading(false);
    }
  };

  const fetchCursos = fetchData; // Keep the name for backward compatibility if needed

  const handleAddCourse = () => {
    setEditingCourse(null);
    setIsModalOpen(true);
  };

  const handleEditCourse = (curso: Curso) => {
    setEditingCourse(curso);
    setIsModalOpen(true);
  };

  const handleDeleteCourse = async () => {
    if (!deletingCourse) return;
    try {
      const { error } = await supabase
        .from("cursos")
        .delete()
        .eq("id", deletingCourse.id);

      if (error) throw error;
      toast.success("Curso removido com sucesso");
      setCursos(prev => prev.filter(c => c.id !== deletingCourse.id));
    } catch (error: any) {
      toast.error("Erro ao remover curso");
    } finally {
      setDeletingCourse(null);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      const newStatus = !currentStatus;
      const { error } = await supabase
        .from("cursos")
        .update({ em_andamento: newStatus })
        .eq("id", id);

      if (error) throw error;
      
      setCursos(prev => prev.map(c => 
        c.id === id ? { ...c, em_andamento: newStatus } : c
      ));
      
      toast.success(newStatus ? "Curso marcado como em andamento" : "Curso pausado");
    } catch (error: any) {
      toast.error("Erro ao atualizar status");
    }
  };

  const filteredCursos = useMemo(() => {
    return cursos
      .filter(c => {
        const matchesTema = currentTema === "todos" || c.categoria_id === currentTema || (currentTema === SEM_CATEGORIA.id && !c.categoria_id);
        const matchesSearch = c.nome.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesTema && matchesSearch;
      })
      .sort((a, b) => {
        if (a.em_andamento !== b.em_andamento) {
          return a.em_andamento ? -1 : 1;
        }
        return a.nome.localeCompare(b.nome);
      });
  }, [cursos, currentTema, searchQuery]);

  const stats = useMemo(() => {
    const activeOnes = filteredCursos.filter(c => c.em_andamento).length;
    return {
      total: filteredCursos.length,
      active: activeOnes,
      paused: filteredCursos.length - activeOnes,
    };
  }, [filteredCursos]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { todos: cursos.length };
    cursos.forEach(c => {
      const key = c.categoria_id || SEM_CATEGORIA.id;
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [cursos]);

  const allTabs = useMemo(() => {
    const tabs: { id: string; label: string; hex?: string }[] = [{ id: "todos", label: "Todos" }];
    
    categorias.forEach(cat => {
      tabs.push({ id: cat.id, label: cat.nome, hex: corDaCategoria(cat.cor) });
    });

    // Cursos sem categoria (ex.: categoria excluída no Admin) ficam numa aba própria
    if (cursos.some(c => !c.categoria_id)) tabs.push(SEM_CATEGORIA);

    return tabs;
  }, [categorias, cursos]);

  const setTema = (tema: string) => {
    navigate({
      to: "/cursos",
      search: { tema },
    });
  };

  const inProgress = filteredCursos.filter(c => c.em_andamento);
  const others = filteredCursos.filter(c => !c.em_andamento);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cursos</h1>
          <p className="text-muted-foreground text-sm">Repositório pessoal de cursos por categoria. Gerencie as categorias na aba Admin.</p>
        </div>
        <Button onClick={handleAddCourse} className="gap-2">
          <Plus size={18} />
          Novo curso
        </Button>
      </div>

      <div className="flex flex-col gap-4">
        <Tabs value={currentTema} onValueChange={setTema} className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto h-auto p-1 bg-muted/50">
            {allTabs.map(t => (
              <TabsTrigger key={t.id} value={t.id} className="gap-2 shrink-0">
                {t.hex && <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: t.hex }} />}
                {t.label}
                <Badge variant="secondary" className="px-1.5 h-4 text-[10px] leading-none">
                  {categoryCounts[t.id] || 0}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-card/50">
            <CardHeader className="p-4 pb-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total de cursos</p>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-2xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-emerald-500/20">
            <CardHeader className="p-4 pb-2">
              <p className="text-xs font-medium text-emerald-500 uppercase tracking-wider">Em andamento</p>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-2xl font-bold text-emerald-600">{stats.active}</p>
              <p className="text-xs text-muted-foreground mt-1">{stats.active} cursos ativos</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-slate-500/20">
            <CardHeader className="p-4 pb-2">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Não iniciados / pausados</p>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-2xl font-bold text-slate-600">{stats.paused}</p>
              <p className="text-xs text-muted-foreground mt-1">{stats.paused} cursos parados</p>
            </CardContent>
          </Card>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <Input
            placeholder="Buscar por nome do curso..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-8">
        {inProgress.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <PlayCircle className="text-emerald-500" size={18} />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-emerald-600">Em andamento</h2>
              <div className="h-[1px] flex-1 bg-emerald-100" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {inProgress.map(curso => (
                <CourseCard 
                  key={curso.id} 
                  curso={curso} 
                  onEdit={() => handleEditCourse(curso)}
                  onDelete={() => setDeletingCourse(curso)}
                  onToggleStatus={() => handleToggleStatus(curso.id, curso.em_andamento)}
                />
              ))}
            </div>
          </div>
        )}

        {others.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <PauseCircle className="text-slate-400" size={18} />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Outros cursos</h2>
              <div className="h-[1px] flex-1 bg-slate-100" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {others.map(curso => (
                <CourseCard 
                  key={curso.id} 
                  curso={curso} 
                  onEdit={() => handleEditCourse(curso)}
                  onDelete={() => setDeletingCourse(curso)}
                  onToggleStatus={() => handleToggleStatus(curso.id, curso.em_andamento)}
                />
              ))}
            </div>
          </div>
        )}

        {filteredCursos.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className="bg-muted rounded-full p-4">
              <BookOpen size={40} className="text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-medium">Nenhum curso cadastrado ainda</h3>
              <p className="text-muted-foreground max-w-xs">
                {currentTema === "todos" 
                  ? "Comece adicionando seu primeiro curso."
                  : `Nenhum curso no tema "${allTabs.find(t => t.id === currentTema)?.label}" cadastrado.`}
              </p>
            </div>
            <Button onClick={handleAddCourse}>Criar primeiro curso</Button>
          </div>
        )}
      </div>

      <AlertDialog open={!!deletingCourse} onOpenChange={(open) => !open && setDeletingCourse(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover "{deletingCourse?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              O login e a senha serão deletados permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCourse} className="bg-red-500 hover:bg-red-600">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CourseForm
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        editingCourse={editingCourse}
        onSuccess={fetchCursos}
      />
    </div>
  );
}

function CourseCard({ curso, onEdit, onDelete, onToggleStatus }: { 
  curso: Curso; 
  onEdit: () => void; 
  onDelete: () => void;
  onToggleStatus: () => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [copiedLogin, setCopiedLogin] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);

  useEffect(() => {
    let timer: any;
    if (showPassword) {
      timer = setTimeout(() => setShowPassword(false), 10000);
    }
    return () => clearTimeout(timer);
  }, [showPassword]);

  const copyToClipboard = async (text: string, type: 'login' | 'pass') => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    if (type === 'login') {
      setCopiedLogin(true);
      setTimeout(() => setCopiedLogin(false), 2000);
      toast.success("Login copiado");
    } else {
      setCopiedPass(true);
      setTimeout(() => setCopiedPass(false), 2000);
      toast.success("Senha copiada");
    }
  };

  // Cor da categoria configurada no Admin
  const theme = curso.curso_categorias?.nome
    ? { label: curso.curso_categorias.nome, hex: corDaCategoria(curso.curso_categorias.cor) }
    : { label: SEM_CATEGORIA.label, hex: SEM_CATEGORIA.hex };

  return (
    <Card className={cn(
      "overflow-hidden transition-all duration-300",
      curso.em_andamento ? "border-l-4 border-l-emerald-500 shadow-sm" : "opacity-75"
    )}>
      <CardHeader className="p-4 space-y-0">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <h3 className="font-bold text-base leading-tight">{curso.nome}</h3>
            <Badge className="text-[10px] h-5 text-white border-transparent" style={{ backgroundColor: theme.hex }}>
              {theme.label}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Switch 
              checked={curso.em_andamento} 
              onCheckedChange={onToggleStatus}
              className="data-[state=checked]:bg-emerald-500"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit} className="gap-2">
                  <Pencil size={14} /> Editar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDelete} className="gap-2 text-red-500 focus:text-red-500">
                  <Trash2 size={14} /> Remover
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 py-0 space-y-3">
        <div className="bg-muted/50 rounded-lg p-3 space-y-3 border border-muted-foreground/10">
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Login</span>
            <div className="flex items-center justify-between gap-2">
              <code className="text-xs break-all font-mono">{curso.login || "---"}</code>
              {curso.login && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6 shrink-0" 
                  onClick={() => copyToClipboard(curso.login!, 'login')}
                >
                  {copiedLogin ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                </Button>
              )}
            </div>
          </div>
          
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Senha</span>
            <div className="flex items-center justify-between gap-2">
              <code className="text-xs font-mono">
                {showPassword ? curso.senha : "••••••••"}
              </code>
              <div className="flex items-center gap-1 shrink-0">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6" 
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={12} /> : <Eye size={12} />}
                </Button>
                {curso.senha && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6" 
                    onClick={() => copyToClipboard(curso.senha!, 'pass')}
                  >
                    {copiedPass ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {curso.observacoes && (
          <p className="text-xs text-muted-foreground line-clamp-2 italic">
            "{curso.observacoes}"
          </p>
        )}
      </CardContent>

      <CardFooter className="p-4 pt-4">
        <Button 
          variant={curso.link_area_membros ? "default" : "secondary"} 
          className="w-full gap-2" 
          disabled={!curso.link_area_membros}
          asChild={!!curso.link_area_membros}
        >
          {curso.link_area_membros ? (
            <a href={curso.link_area_membros} target="_blank" rel="noopener noreferrer">
              Acessar área de membros
              <ExternalLink size={14} />
            </a>
          ) : (
            <span>Link não cadastrado</span>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
