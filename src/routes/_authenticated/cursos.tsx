import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  Plus, Search, MoreVertical, Pencil, Trash2,
  ExternalLink, Copy, Check, Eye, EyeOff,
  PlayCircle, PauseCircle, BookOpen, Send, CheckCircle2
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
import { parseAulas, tipoAcessoDe } from "@/lib/cursoAcesso";
import { estadoExpiracao, type NivelExpiracao } from "@/lib/cursoExpiracao";
import {
  agruparCursos, contarConclusao, estaConcluido, filtrarPorConclusao, lerFiltroConclusao,
  patchConclusao, rotuloConclusao, type FiltroConclusao,
} from "@/lib/cursoConclusao";
import { hojeBrasilia } from "@/lib/entrega";
import { useBusca } from "@/lib/useBusca";
import { MensagemBusca } from "@/components/MensagemBusca";

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
  tipo_acesso?: string | null;
  aulas?: unknown;
  expira_em?: string | null;
  /** AAAA-MM-DD; vazio = não concluído */
  concluido_em?: string | null;
}

const SITUACOES: { id: FiltroConclusao; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "nao_concluidos", label: "Não concluídos" },
  { id: "concluidos", label: "Concluídos" },
];

const SEM_CATEGORIA = { id: "sem_categoria", label: "Sem categoria", hex: "#94a3b8" };

// Cor da etiqueta de expiração: verde longe, âmbar em até 30 dias, vermelho na última semana
const COR_EXPIRACAO: Record<NivelExpiracao, string> = {
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  atencao: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  urgente: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
  expirado: "border-transparent bg-slate-500 text-white",
};

export const Route = createFileRoute("/_authenticated/cursos")({
  // ?tema=<categoria> e ?situacao=nao_concluidos|concluidos ("todos" não vai para a URL)
  validateSearch: (s: Record<string, unknown>): { tema?: string; situacao?: FiltroConclusao } => {
    const situacao = lerFiltroConclusao(s.situacao);
    return {
      ...(typeof s.tema === "string" && s.tema ? { tema: s.tema } : {}),
      ...(situacao !== "todos" ? { situacao } : {}),
    };
  },
  component: CursosPage,
});

function CursosPage() {
  const navigate = useNavigate();
  const searchParams = Route.useSearch();
  const currentTema = searchParams.tema || "todos";
  const situacao = lerFiltroConclusao(searchParams.situacao);

  const [cursos, setCursos] = useCachedState<Curso[]>(CACHE_KEYS.cursos, []);
  const [categorias, setCategorias] = useCachedState<Categoria[]>(CACHE_KEYS.cursoCategorias, []);
  const [loading, setLoading] = useState(!hasCached(CACHE_KEYS.cursos));
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Curso | null>(null);
  const [deletingCourse, setDeletingCourse] = useState<Curso | null>(null);
  // Cursos cuja conclusão está sendo gravada (a ref barra o clique duplo antes do próximo render)
  const [gravandoConclusao, setGravandoConclusao] = useState<string[]>([]);
  const gravandoRef = useRef(new Set<string>());

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

  // Marca ou desmarca o curso como concluído (concluir desliga o "em andamento"; desmarcar o deixa pausado)
  const handleToggleConclusao = async (curso: Curso) => {
    if (gravandoRef.current.has(curso.id)) return;
    gravandoRef.current.add(curso.id);
    setGravandoConclusao(prev => [...prev, curso.id]);
    const concluir = !estaConcluido(curso);
    const patch = patchConclusao(concluir, hojeBrasilia());
    try {
      // `as any`: o types.ts do Supabase ainda não conhece a coluna concluido_em (o Lovable o regenera depois)
      const { error } = await supabase
        .from("cursos")
        .update(patch as any)
        .eq("id", curso.id);

      if (error) throw error;

      setCursos(prev => prev.map(c =>
        c.id === curso.id ? { ...c, ...patch } : c
      ));

      toast.success(concluir ? "Curso concluído" : "Conclusão desmarcada", {
        // Sob um filtro que esconde o card, diz para onde ele foi
        description: concluir && situacao === "nao_concluidos" ? "Ele agora aparece no filtro Concluídos."
          : !concluir && situacao === "concluidos" ? "Ele agora aparece no filtro Não concluídos." : undefined,
      });
    } catch (error: any) {
      toast.error("Erro ao atualizar o curso");
    } finally {
      gravandoRef.current.delete(curso.id);
      setGravandoConclusao(prev => prev.filter(id => id !== curso.id));
    }
  };

  // Categoria, situação e ordem da tela, sem o texto da busca (a busca tolerante vem depois, em `resultadoBusca`)
  const cursosDaTela = useMemo(() => {
    const porCategoria = cursos.filter(c => {
      return currentTema === "todos" || c.categoria_id === currentTema || (currentTema === SEM_CATEGORIA.id && !c.categoria_id);
    });
    return filtrarPorConclusao(porCategoria, situacao)
      .sort((a, b) => {
        if (a.em_andamento !== b.em_andamento) {
          return a.em_andamento ? -1 : 1;
        }
        return a.nome.localeCompare(b.nome);
      });
  }, [cursos, currentTema, situacao]);

  // Busca tolerante no nome do curso e no nome da categoria
  const resultadoBusca = useBusca(cursosDaTela, searchQuery, (c) => [c.nome, c.curso_categorias?.nome]);
  const filteredCursos = resultadoBusca.itens;

  const stats = useMemo(() => contarConclusao(filteredCursos), [filteredCursos]);

  const grupos = useMemo(() => agruparCursos(filteredCursos), [filteredCursos]);

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

  // Categoria e situação convivem na URL: trocar uma mantém a outra ("todos" da situação não vai para a URL)
  const setTema = (tema: string) => {
    navigate({
      to: "/cursos",
      search: { tema, ...(situacao !== "todos" ? { situacao } : {}) },
    });
  };

  const setSituacao = (nova: FiltroConclusao) => {
    navigate({
      to: "/cursos",
      search: { ...(searchParams.tema ? { tema: searchParams.tema } : {}), ...(nova !== "todos" ? { situacao: nova } : {}) },
    });
  };

  const { emAndamento: inProgress, outros: others, concluidos: done } = grupos;

  // Texto do estado vazio quando o filtro de situação está ligado (respeita categoria e busca)
  const nomeCategoriaAtual = currentTema === "todos" ? null : allTabs.find(t => t.id === currentTema)?.label ?? null;
  const buscaAtual = searchQuery.trim();
  const escopoVazio = [nomeCategoriaAtual && `categoria "${nomeCategoriaAtual}"`, buscaAtual && `busca "${buscaAtual}"`]
    .filter(Boolean)
    .join(" e ");

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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
              <p className="text-2xl font-bold text-emerald-600">{stats.emAndamento}</p>
              <p className="text-xs text-muted-foreground mt-1">{stats.emAndamento} {stats.emAndamento === 1 ? "curso ativo" : "cursos ativos"}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-slate-500/20">
            <CardHeader className="p-4 pb-2">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Não iniciados / pausados</p>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-2xl font-bold text-slate-600">{stats.pausados}</p>
              <p className="text-xs text-muted-foreground mt-1">{stats.pausados} {stats.pausados === 1 ? "curso parado" : "cursos parados"}</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30">
            <CardHeader className="p-4 pb-2">
              <p className="flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                <CheckCircle2 size={13} className="shrink-0" /> Concluídos
              </p>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{stats.concluidos}</p>
              <p className="text-xs text-muted-foreground mt-1">{stats.concluidos} {stats.concluidos === 1 ? "curso finalizado" : "cursos finalizados"}</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <Input
              placeholder="Buscar por nome do curso..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div role="group" aria-label="Filtrar por situação" className="inline-flex shrink-0 self-start md:self-auto rounded-md bg-muted/50 p-1 gap-1">
            {SITUACOES.map(s => (
              <Button
                key={s.id}
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={situacao === s.id}
                onClick={() => setSituacao(s.id)}
                className={cn("h-8 px-3", situacao === s.id ? "bg-background text-foreground shadow-sm hover:bg-background" : "text-muted-foreground")}
              >
                {s.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-8">
        {resultadoBusca.modo === "parecidos" && <MensagemBusca resultado={resultadoBusca} className="-mb-4" />}
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
                  onToggleConclusao={() => handleToggleConclusao(curso)}
                  gravandoConclusao={gravandoConclusao.includes(curso.id)}
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
                  onToggleConclusao={() => handleToggleConclusao(curso)}
                  gravandoConclusao={gravandoConclusao.includes(curso.id)}
                />
              ))}
            </div>
          </div>
        )}

        {done.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="text-emerald-600 dark:text-emerald-400" size={18} />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Concluídos</h2>
              <div className="h-[1px] flex-1 bg-emerald-100 dark:bg-emerald-900/50" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {done.map(curso => (
                <CourseCard
                  key={curso.id}
                  curso={curso}
                  onEdit={() => handleEditCourse(curso)}
                  onDelete={() => setDeletingCourse(curso)}
                  onToggleStatus={() => handleToggleStatus(curso.id, curso.em_andamento)}
                  onToggleConclusao={() => handleToggleConclusao(curso)}
                  gravandoConclusao={gravandoConclusao.includes(curso.id)}
                />
              ))}
            </div>
          </div>
        )}

        {filteredCursos.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className="bg-muted rounded-full p-4">
              {situacao === "concluidos" ? <CheckCircle2 size={40} className="text-muted-foreground" /> : <BookOpen size={40} className="text-muted-foreground" />}
            </div>
            {situacao === "todos" ? (
              <>
                <div className="space-y-2">
                  {resultadoBusca.modo === "nenhum" ? (
                    <MensagemBusca resultado={resultadoBusca} className="text-lg font-medium text-foreground" />
                  ) : (
                    <>
                      <h3 className="text-lg font-medium">Nenhum curso cadastrado ainda</h3>
                      <p className="text-muted-foreground max-w-xs">
                        {currentTema === "todos"
                          ? "Comece adicionando seu primeiro curso."
                          : `Nenhum curso no tema "${allTabs.find(t => t.id === currentTema)?.label}" cadastrado.`}
                      </p>
                    </>
                  )}
                </div>
                {resultadoBusca.modo !== "nenhum" && <Button onClick={handleAddCourse}>Criar primeiro curso</Button>}
              </>
            ) : (
              <>
                <div className="space-y-2">
                  {resultadoBusca.modo === "nenhum" ? (
                    <MensagemBusca resultado={resultadoBusca} className="text-lg font-medium text-foreground" />
                  ) : (
                    <h3 className="text-lg font-medium">
                      {situacao === "concluidos" ? "Nenhum curso concluído ainda." : "Nenhum curso pendente."}
                    </h3>
                  )}
                  <p className="text-muted-foreground max-w-xs">
                    {escopoVazio
                      ? `Filtros ativos: ${escopoVazio}.`
                      : situacao === "concluidos"
                        ? "Use \"Marcar como concluído\" no card do curso."
                        : cursos.length === 0
                          ? "Comece adicionando seu primeiro curso."
                          : "Todos os cursos já foram concluídos."}
                  </p>
                </div>
                <Button variant="outline" onClick={() => setSituacao("todos")}>Ver todos os cursos</Button>
              </>
            )}
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

function CourseCard({ curso, onEdit, onDelete, onToggleStatus, onToggleConclusao, gravandoConclusao }: {
  curso: Curso;
  onEdit: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
  onToggleConclusao: () => void;
  gravandoConclusao: boolean;
}) {
  const tipoAcesso = tipoAcessoDe(curso.tipo_acesso);
  const aulas = parseAulas(curso.aulas);
  const expiracao = estadoExpiracao(curso.expira_em);
  const expirado = expiracao?.nivel === "expirado";
  const concluido = estaConcluido(curso);
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
      // Concluído: verde em volta toda, mesmo se também estiver expirado (a etiqueta de expiração continua).
      // O `surface` do Card pinta o fundo com gradientes (background-image): sem o `!` o verde ficaria por baixo deles.
      concluido
        ? "border-emerald-500 bg-none! bg-emerald-100! dark:bg-emerald-900/40! shadow-sm"
        : curso.em_andamento && !expirado ? "border-l-4 border-l-emerald-500 shadow-sm" : "opacity-75",
      // Expirado: cinza, mas tudo continua clicável (nada é apagado)
      expirado && !concluido && "bg-muted/60 grayscale opacity-80"
    )}>
      <CardHeader className="p-4 space-y-0">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <h3 className="font-bold text-base leading-tight">{curso.nome}</h3>
            <div className="flex flex-wrap items-center gap-1">
              <Badge className="text-[10px] h-5 text-white border-transparent" style={{ backgroundColor: theme.hex }}>
                {theme.label}
              </Badge>
              {concluido && (
                <Badge className="h-5 gap-1 border-transparent bg-emerald-700 text-[10px] font-semibold text-white hover:bg-emerald-700">
                  <CheckCircle2 size={11} className="shrink-0" />
                  {rotuloConclusao(curso.concluido_em!)}
                </Badge>
              )}
              {expiracao && (
                <Badge variant="outline" className={cn("h-5 gap-1 text-[10px] font-semibold", COR_EXPIRACAO[expiracao.nivel])} title={expiracao.rotulo}>
                  {expirado ? "Expirado" : expiracao.rotulo}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* Curso concluído não está em andamento: a chave some */}
            {!concluido && (
              <Switch
                checked={curso.em_andamento}
                onCheckedChange={onToggleStatus}
                aria-label={`Em andamento: ${curso.nome}`}
                className="data-[state=checked]:bg-emerald-500"
              />
            )}
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
        {tipoAcesso === "drive" && (
          <div className="bg-muted/50 rounded-lg p-3 border border-muted-foreground/10">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Aulas no Google Drive · {aulas.length}</span>
            {aulas.length === 0 ? (
              <p className="text-xs text-muted-foreground mt-1">Nenhuma aula cadastrada. Edite o curso para adicionar.</p>
            ) : (
              <ul className="mt-1.5 space-y-1 max-h-40 overflow-y-auto pr-1">
                {aulas.map((a, i) => (
                  <li key={i}>
                    <a href={a.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs rounded px-1.5 py-1 hover:bg-muted transition-colors group/aula">
                      <PlayCircle size={12} className="text-muted-foreground group-hover/aula:text-primary shrink-0" />
                      <span className="truncate flex-1">{a.titulo || `Aula ${i + 1}`}</span>
                      <ExternalLink size={11} className="text-muted-foreground opacity-0 group-hover/aula:opacity-100 shrink-0" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {tipoAcesso === "telegram" && (
          <div className="bg-muted/50 rounded-lg p-3 border border-muted-foreground/10 text-xs text-muted-foreground flex items-center gap-2">
            <Send size={13} className="text-sky-500" /> Curso no Telegram — abre direto no app.
          </div>
        )}
        <div className={cn("bg-muted/50 rounded-lg p-3 space-y-3 border border-muted-foreground/10", tipoAcesso !== "membros" && "hidden")}>
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

      <CardFooter className="flex-col items-stretch gap-2 p-4 pt-4">
        {tipoAcesso === "drive" ? (
          <Button
            variant={aulas[0] ? "default" : "secondary"}
            className="w-full gap-2"
            disabled={!aulas[0]}
            asChild={!!aulas[0]}
          >
            {aulas[0] ? (
              <a href={aulas[0].link} target="_blank" rel="noopener noreferrer">
                Começar pela {aulas[0].titulo || "Aula 1"}
                <ExternalLink size={14} />
              </a>
            ) : (
              <span>Sem aulas cadastradas</span>
            )}
          </Button>
        ) : (
          <Button
            variant={curso.link_area_membros ? "default" : "secondary"}
            className={cn("w-full gap-2", tipoAcesso === "telegram" && curso.link_area_membros && "bg-sky-500 hover:bg-sky-600 text-white")}
            disabled={!curso.link_area_membros}
            asChild={!!curso.link_area_membros}
          >
            {curso.link_area_membros ? (
              <a href={curso.link_area_membros} target="_blank" rel="noopener noreferrer">
                {tipoAcesso === "telegram" ? <><Send size={14} /> Abrir no Telegram</> : <>Acessar área de membros<ExternalLink size={14} /></>}
              </a>
            ) : (
              <span>Link não cadastrado</span>
            )}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("w-full gap-2", concluido && "border-emerald-500/60 text-emerald-700 hover:text-emerald-800 dark:text-emerald-400")}
          onClick={onToggleConclusao}
          disabled={gravandoConclusao}
        >
          <CheckCircle2 size={14} />
          {concluido ? "Desmarcar conclusão" : "Marcar como concluído"}
        </Button>
      </CardFooter>
    </Card>
  );
}
