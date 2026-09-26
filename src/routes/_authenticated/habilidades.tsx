import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronUp, Sparkles, BookOpen, GraduationCap,
  ExternalLink, Lightbulb, Target, Wand2, ArrowUp, ArrowDown, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useCachedState, hasCached } from "@/lib/pageCache";
import { CACHE_KEYS } from "@/lib/data";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  type Habilidade, type Subhabilidade, type HabilidadeRecurso,
  NIVEIS, RECURSO_TIPOS, fetchHabilidades, notaDaHabilidade, notaGeral, nivelDaNota, proximoNivel, formatNota,
  updateSubhabilidade, deleteHabilidade, deleteSubhabilidade, deleteRecurso, reorderHabilidades, reorderSubhabilidades,
  gerarPromptPesquisa, subsPrioritarias, linkDoRecurso,
} from "@/lib/habilidades";
import {
  HabilidadeDialog, SubhabilidadeDialog, RecursoDialog, PromptDialog,
  type HabilidadeDialogState, type SubhabilidadeDialogState,
} from "@/components/habilidades/HabilidadeDialogs";

export const Route = createFileRoute("/_authenticated/habilidades")({
  component: HabilidadesPage,
});

interface AcervoItem {
  id: string;
  nome: string;
  extra: string | null;
  tipo: "curso" | "livro";
  concluido: boolean;
}

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Cursos e livros que o usuário já tem e que batem com a habilidade (por nome/categoria)
function acervoDaHabilidade(h: Habilidade, acervo: AcervoItem[]): AcervoItem[] {
  const termos = [h.nome, ...h.subhabilidades.map((s) => s.nome)]
    .flatMap((t) => t.split(/[\s()/,·-]+/))
    .map(normalizar)
    .filter((t) => t.length >= 4 && !["para", "com", "sem", "das", "dos", "avaliacao", "direcao", "senso", "critico", "sistemas", "gestao", "analise", "estrategia"].includes(t));
  const nomeHab = normalizar(h.nome);
  return acervo.filter((item) => {
    const texto = normalizar(`${item.nome} ${item.extra || ""}`);
    if (item.extra && (nomeHab.includes(normalizar(item.extra)) || normalizar(item.extra).includes(nomeHab))) return true;
    return termos.some((t) => texto.includes(t));
  });
}

function HabilidadesPage() {
  const [habilidades, setHabilidades] = useCachedState<Habilidade[]>(CACHE_KEYS.habilidades, []);
  const [loading, setLoading] = useState(!hasCached(CACHE_KEYS.habilidades));
  const [erro, setErro] = useState<string | null>(null);
  const [acervo, setAcervo] = useState<AcervoItem[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [habDialog, setHabDialog] = useState<HabilidadeDialogState>(null);
  const [subDialog, setSubDialog] = useState<SubhabilidadeDialogState>(null);
  const [recursoDialog, setRecursoDialog] = useState<Habilidade | null>(null);
  const [promptHab, setPromptHab] = useState<Habilidade | null>(null);
  const [habToDelete, setHabToDelete] = useState<Habilidade | null>(null);
  const [subToDelete, setSubToDelete] = useState<{ hab: Habilidade; sub: Subhabilidade } | null>(null);
  const [saving, setSaving] = useState(false);

  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const reload = async () => {
    try {
      setHabilidades(await fetchHabilidades());
      setErro(null);
    } catch (e: any) {
      const msg: string = e?.message || "";
      setErro(/schema cache|does not exist|not find/i.test(msg)
        ? "As tabelas de habilidades ainda não existem no banco. Rode supabase/migrations/20260917130000_habilidades.sql no SQL Editor."
        : msg || "Erro ao carregar habilidades");
    } finally {
      setLoading(false);
    }
  };

  const loadAcervo = async () => {
    const [cursos, livros] = await Promise.all([
      supabase.from("cursos").select("id, nome, em_andamento, curso_categorias(nome)"),
      supabase.from("livros").select("id, nome, autor, lido"),
    ]);
    const itens: AcervoItem[] = [
      ...((cursos.data || []) as any[]).map((c) => ({ id: c.id, nome: c.nome, extra: c.curso_categorias?.nome ?? null, tipo: "curso" as const, concluido: false })),
      ...((livros.data || []) as any[]).map((l) => ({ id: l.id, nome: l.nome, extra: l.autor ?? null, tipo: "livro" as const, concluido: !!l.lido })),
    ];
    setAcervo(itens);
  };

  useEffect(() => {
    reload();
    loadAcervo();
  }, []);

  const geral = useMemo(() => notaGeral(habilidades), [habilidades]);
  const nivelGeral = nivelDaNota(geral);
  const totalSubs = habilidades.reduce((acc, h) => acc + h.subhabilidades.length, 0);

  const distribuicao = useMemo(() => {
    const d: Record<string, number> = {};
    NIVEIS.forEach((n) => { d[n.id] = 0; });
    habilidades.forEach((h) => {
      const nota = notaDaHabilidade(h);
      if (nota !== null) d[nivelDaNota(nota).id] += 1;
    });
    return d;
  }, [habilidades]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const abrirCard = (id: string) => {
    setExpanded((prev) => new Set(prev).add(id));
    setTimeout(() => cardRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  // Gravação da nota: debounce por subhabilidade e uma escrita por vez, para que
  // mudanças rápidas (arrastar, setas) não disparem PATCHes concorrentes que chegam fora de ordem
  const notaTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const notaQueue = useRef<Record<string, Promise<void>>>({});
  const notaPendente = useRef<Record<string, number>>({});

  const handleNota = (hab: Habilidade, sub: Subhabilidade, nota: number) => {
    // Otimista: a nota já aparece na hora e o banco recebe em seguida
    setHabilidades((prev) => prev.map((h) => h.id !== hab.id ? h : {
      ...h,
      subhabilidades: h.subhabilidades.map((s) => (s.id === sub.id ? { ...s, nota } : s)),
    }));
    notaPendente.current[sub.id] = nota;
    clearTimeout(notaTimers.current[sub.id]);
    notaTimers.current[sub.id] = setTimeout(() => {
      const anterior = notaQueue.current[sub.id] ?? Promise.resolve();
      notaQueue.current[sub.id] = anterior.then(async () => {
        const valor = notaPendente.current[sub.id];
        try {
          await updateSubhabilidade(sub.id, { nota: valor });
        } catch (e: any) {
          toast.error(e.message || "Erro ao salvar nota");
          await reload();
        }
      });
    }, 400);
  };

  const moveHab = async (hab: Habilidade, direction: -1 | 1) => {
    const idx = habilidades.findIndex((h) => h.id === hab.id);
    const target = idx + direction;
    if (idx < 0 || target < 0 || target >= habilidades.length) return;
    const reordered = [...habilidades];
    reordered[idx] = habilidades[target];
    reordered[target] = hab;
    setHabilidades(reordered.map((h, i) => ({ ...h, ordem: i })));
    try {
      await reorderHabilidades(reordered);
    } catch (e: any) {
      toast.error(e.message || "Erro ao reordenar");
      await reload();
    }
  };

  const moveSub = async (hab: Habilidade, sub: Subhabilidade, direction: -1 | 1) => {
    const subs = hab.subhabilidades;
    const idx = subs.findIndex((s) => s.id === sub.id);
    const target = idx + direction;
    if (idx < 0 || target < 0 || target >= subs.length) return;
    const reordered = [...subs];
    reordered[idx] = subs[target];
    reordered[target] = sub;
    setHabilidades((prev) => prev.map((h) => (h.id === hab.id ? { ...h, subhabilidades: reordered.map((s, i) => ({ ...s, ordem: i })) } : h)));
    try {
      await reorderSubhabilidades(reordered);
    } catch (e: any) {
      toast.error(e.message || "Erro ao reordenar");
      await reload();
    }
  };

  const handleDeleteHab = async () => {
    if (!habToDelete) return;
    setSaving(true);
    try {
      await deleteHabilidade(habToDelete.id);
      toast.success(`Habilidade "${habToDelete.nome}" excluída`);
      setHabToDelete(null);
      await reload();
    } catch (e: any) {
      toast.error(e.message || "Erro ao excluir");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSub = async () => {
    if (!subToDelete) return;
    setSaving(true);
    try {
      await deleteSubhabilidade(subToDelete.sub.id);
      toast.success(`Subhabilidade "${subToDelete.sub.nome}" excluída`);
      setSubToDelete(null);
      await reload();
    } catch (e: any) {
      toast.error(e.message || "Erro ao excluir");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRecurso = async (r: HabilidadeRecurso) => {
    try {
      await deleteRecurso(r.id);
      setHabilidades((prev) => prev.map((h) => (h.id === r.habilidade_id ? { ...h, recursos: h.recursos.filter((x) => x.id !== r.id) } : h)));
    } catch (e: any) {
      toast.error(e.message || "Erro ao remover sugestão");
      return;
    }
    toast.success("Sugestão removida");
  };

  const promptTexto = useMemo(() => (promptHab ? gerarPromptPesquisa(promptHab) : ""), [promptHab]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Habilidades</h1>
            <p className="text-muted-foreground text-sm">Roadmap do estrategista digital: avalie cada subhabilidade de 0 a 10 e gere prompts de pesquisa para evoluir.</p>
          </div>
          <Button className="gap-2" onClick={() => setHabDialog({ mode: "create" })}>
            <Plus size={18} /> Nova habilidade
          </Button>
        </div>

        {erro && (
          <Card className="border-destructive/40">
            <CardContent className="p-4 text-sm text-destructive">{erro}</CardContent>
          </Card>
        )}

        {/* Nota geral */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-0">
              <div className="p-6 flex items-center gap-5 border-b lg:border-b-0 lg:border-r">
                <div
                  className="h-24 w-24 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: `conic-gradient(${nivelGeral.hex} ${((geral ?? 0) / 10) * 360}deg, var(--muted) 0deg)` }}
                >
                  <div className="h-[76px] w-[76px] rounded-full bg-card flex flex-col items-center justify-center">
                    <span className="numeric text-2xl font-bold leading-none" style={{ color: nivelGeral.hex }}>{formatNota(geral)}</span>
                    <span className="text-[10px] text-muted-foreground mt-1">de 10</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Nota como estrategista digital</p>
                  <p className="text-xl font-bold mt-1" style={{ color: nivelGeral.hex }}>{geral === null ? "Sem avaliação" : nivelGeral.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Média ponderada de {habilidades.length} {habilidades.length === 1 ? "habilidade" : "habilidades"} · {totalSubs} subhabilidades
                  </p>
                </div>
              </div>
              <div className="p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Mapa das habilidades</p>
                  <div className="hidden sm:flex items-center gap-3 text-[11px] text-muted-foreground">
                    {NIVEIS.map((n) => (
                      <span key={n.id} className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: n.hex }} /> {n.label} <span className="numeric">({distribuicao[n.id] || 0})</span>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-2">
                  {habilidades.map((h) => {
                    const nota = notaDaHabilidade(h);
                    const nivel = nivelDaNota(nota);
                    return (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => abrirCard(h.id)}
                        className="text-left group rounded-md px-2 py-1.5 -mx-2 hover:bg-muted/60 transition-colors"
                        title="Abrir habilidade"
                      >
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate group-hover:text-foreground">{h.nome}</span>
                          <span className="numeric font-semibold shrink-0" style={{ color: nota === null ? undefined : nivel.hex }}>{formatNota(nota)}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted mt-1 overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${((nota ?? 0) / 10) * 100}%`, backgroundColor: nivel.hex }} />
                        </div>
                      </button>
                    );
                  })}
                  {habilidades.length === 0 && !loading && (
                    <p className="text-sm text-muted-foreground col-span-full">Nenhuma habilidade ainda. Crie a primeira ou rode a migration com o roadmap padrão.</p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cards */}
        <div className="space-y-4">
          {habilidades.map((h, idx) => (
            <div key={h.id} ref={(el) => { cardRefs.current[h.id] = el; }} className="scroll-mt-4">
              <HabilidadeCard
                habilidade={h}
                open={expanded.has(h.id)}
                onToggle={() => toggle(h.id)}
                isFirst={idx === 0}
                isLast={idx === habilidades.length - 1}
                onMove={(d) => moveHab(h, d)}
                onEdit={() => setHabDialog({ mode: "edit", habilidade: h })}
                onDelete={() => setHabToDelete(h)}
                onAddSub={() => setSubDialog({ mode: "create", habilidade: h })}
                onEditSub={(s) => setSubDialog({ mode: "edit", habilidade: h, sub: s })}
                onDeleteSub={(s) => setSubToDelete({ hab: h, sub: s })}
                onMoveSub={(s, d) => moveSub(h, s, d)}
                onNota={(s, n) => handleNota(h, s, n)}
                onPrompt={() => setPromptHab(h)}
                onAddRecurso={() => setRecursoDialog(h)}
                onDeleteRecurso={handleDeleteRecurso}
                acervo={acervoDaHabilidade(h, acervo)}
              />
            </div>
          ))}
        </div>

        <HabilidadeDialog state={habDialog} onClose={() => setHabDialog(null)} onSaved={reload} habilidades={habilidades} />
        <SubhabilidadeDialog state={subDialog} onClose={() => setSubDialog(null)} onSaved={reload} />
        <RecursoDialog habilidade={recursoDialog} onClose={() => setRecursoDialog(null)} onSaved={reload} />
        <PromptDialog habilidade={promptHab} prompt={promptTexto} onClose={() => setPromptHab(null)} />

        <AlertDialog open={!!habToDelete} onOpenChange={(o) => { if (!o) setHabToDelete(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir "{habToDelete?.nome}"?</AlertDialogTitle>
              <AlertDialogDescription>
                As {habToDelete?.subhabilidades.length ?? 0} subhabilidades e as sugestões dela também serão apagadas. Não há como desfazer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={(e) => { e.preventDefault(); handleDeleteHab(); }} disabled={saving} className="bg-destructive hover:bg-destructive/90">
                {saving ? "Aguarde..." : "Excluir habilidade"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!subToDelete} onOpenChange={(o) => { if (!o) setSubToDelete(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir "{subToDelete?.sub.nome}"?</AlertDialogTitle>
              <AlertDialogDescription>A nota de {subToDelete?.hab.nome} será recalculada sem ela.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={(e) => { e.preventDefault(); handleDeleteSub(); }} disabled={saving} className="bg-destructive hover:bg-destructive/90">
                {saving ? "Aguarde..." : "Excluir"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------- Card de habilidade

function HabilidadeCard({
  habilidade: h, open, onToggle, isFirst, isLast, onMove, onEdit, onDelete,
  onAddSub, onEditSub, onDeleteSub, onMoveSub, onNota, onPrompt, onAddRecurso, onDeleteRecurso, acervo,
}: {
  habilidade: Habilidade;
  open: boolean;
  onToggle: () => void;
  isFirst: boolean;
  isLast: boolean;
  onMove: (d: -1 | 1) => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddSub: () => void;
  onEditSub: (s: Subhabilidade) => void;
  onDeleteSub: (s: Subhabilidade) => void;
  onMoveSub: (s: Subhabilidade, d: -1 | 1) => void;
  onNota: (s: Subhabilidade, nota: number) => void;
  onPrompt: () => void;
  onAddRecurso: () => void;
  onDeleteRecurso: (r: HabilidadeRecurso) => void;
  acervo: AcervoItem[];
}) {
  const nota = notaDaHabilidade(h);
  const nivel = nivelDaNota(nota);
  const proximo = proximoNivel(nivel);
  const precisaAtencao = nota !== null && nota < 5;
  const prioritarias = subsPrioritarias(h);
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  const sugestoesAbertas = mostrarSugestoes || precisaAtencao;

  const recursosPorTipo = useMemo(() => {
    const grupos: { tipo: string; label: string; itens: HabilidadeRecurso[] }[] = [];
    RECURSO_TIPOS.forEach((t) => {
      const itens = h.recursos.filter((r) => r.tipo === t.id);
      if (itens.length) grupos.push({ tipo: t.id, label: t.label, itens });
    });
    return grupos;
  }, [h.recursos]);

  return (
    <Card className={cn("transition-shadow", open && "shadow-md", precisaAtencao && "border-l-4")} style={precisaAtencao ? { borderLeftColor: nivel.hex } : undefined}>
      <CardHeader className="p-4 pb-3">
        <div className="flex items-start gap-3">
          <button type="button" onClick={onToggle} className="flex-1 min-w-0 text-left" aria-expanded={open}>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-base leading-tight">{h.nome}</h2>
              <Badge className="text-[10px] h-5 text-white border-transparent" style={{ backgroundColor: nivel.hex }}>{nota === null ? "Sem subhabilidades" : nivel.label}</Badge>
              {h.peso !== 1 && <Badge variant="outline" className="text-[10px] h-5">peso {formatNota(h.peso)}</Badge>}
            </div>
            {h.descricao && <p className="text-xs text-muted-foreground mt-1">{h.descricao}</p>}
            <div className="flex items-center gap-3 mt-2">
              <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${((nota ?? 0) / 10) * 100}%`, backgroundColor: nivel.hex }} />
              </div>
              <span className="text-xs text-muted-foreground shrink-0">{h.subhabilidades.length} sub · {proximo && nota !== null ? `faltam ${formatNota(Math.max(0, proximo.min - nota))} para ${proximo.label.toLowerCase()}` : nota === null ? "avalie" : "nível máximo"}</span>
            </div>
          </button>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="numeric text-3xl font-bold leading-none" style={{ color: nota === null ? undefined : nivel.hex }}>{formatNota(nota)}</span>
            <div className="flex items-center">
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={isFirst} onClick={() => onMove(-1)} title="Subir"><ArrowUp size={14} /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={isLast} onClick={() => onMove(1)} title="Descer"><ArrowDown size={14} /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} title="Editar"><Pencil size={14} /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete} title="Excluir"><Trash2 size={14} /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggle} title={open ? "Recolher" : "Expandir"}>
                {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="p-4 pt-0 space-y-5">
          {/* Subhabilidades */}
          <div className="space-y-1">
            {h.subhabilidades.map((s, idx) => (
              <SubRow
                key={s.id}
                sub={s}
                prioritaria={prioritarias.some((p) => p.id === s.id) && s.nota < 7}
                isFirst={idx === 0}
                isLast={idx === h.subhabilidades.length - 1}
                onNota={(n) => onNota(s, n)}
                onEdit={() => onEditSub(s)}
                onDelete={() => onDeleteSub(s)}
                onMove={(d) => onMoveSub(s, d)}
              />
            ))}
            {h.subhabilidades.length === 0 && (
              <p className="text-sm text-muted-foreground py-3 text-center">Sem subhabilidades. Adicione a primeira para a nota aparecer.</p>
            )}
            <Button variant="outline" size="sm" className="gap-2 mt-2" onClick={onAddSub}>
              <Plus size={14} /> Subhabilidade
            </Button>
          </div>

          {/* Ações */}
          <div className="rounded-lg border bg-muted/30 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <p className="font-medium text-sm flex items-center gap-2"><Wand2 size={15} className="text-primary" /> Prompt de pesquisa profunda</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {prioritarias.length && h.subhabilidades.length
                  ? <>Foco em: {prioritarias.slice(0, 4).map((p) => p.nome).join(", ")}{prioritarias.length > 4 ? ` e mais ${prioritarias.length - 4}` : ""}. Saída em .docx com livros, cursos, newsletters, artigos e perfis.</>
                  : "Adicione subhabilidades para o prompt ter contexto."}
              </p>
            </div>
            <Button className="gap-2 shrink-0" onClick={onPrompt} disabled={h.subhabilidades.length === 0}>
              <Sparkles size={14} /> Gerar prompt
            </Button>
          </div>

          {/* Sugestões */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={() => setMostrarSugestoes((v) => !v)} className="flex items-center gap-2 text-sm font-medium">
                <Lightbulb size={15} style={{ color: precisaAtencao ? nivel.hex : undefined }} className={cn(!precisaAtencao && "text-muted-foreground")} />
                Sugestões para subir a nota
                <Badge variant="secondary" className="px-1.5 h-4 text-[10px] leading-none">{h.recursos.length + acervo.length}</Badge>
                {sugestoesAbertas ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
              </button>
              <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs" onClick={onAddRecurso}>
                <Plus size={12} /> Sugestão
              </Button>
            </div>
            {precisaAtencao && (
              <p className="text-xs rounded-md px-3 py-2" style={{ backgroundColor: `${nivel.hex}1a`, color: nivel.hex }}>
                <Target size={12} className="inline mr-1 -mt-0.5" />
                Nota {formatNota(nota)} ({nivel.label.toLowerCase()}): vale começar por aqui. Use o prompt acima para uma pesquisa completa e os itens abaixo como ponto de partida. O que não fizer sentido para você, remova pelo ×.
              </p>
            )}
            {sugestoesAbertas && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {acervo.length > 0 && (
                  <div className="space-y-1.5 md:col-span-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Já no seu acervo</p>
                    <div className="flex flex-wrap gap-1.5">
                      {acervo.map((item) => (
                        <Badge key={`${item.tipo}-${item.id}`} variant="outline" className={cn("gap-1 font-normal", item.concluido && "opacity-60 line-through")}>
                          {item.tipo === "curso" ? <GraduationCap size={11} /> : <BookOpen size={11} />}
                          {item.nome}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {recursosPorTipo.map((g) => (
                  <div key={g.tipo} className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</p>
                    <ul className="space-y-1">
                      {g.itens.map((r) => (
                        <li key={r.id} className="group flex items-start gap-2 text-sm">
                          <a href={linkDoRecurso(r)} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 hover:underline">
                            <span className="font-medium">{r.titulo}</span>
                            {r.autor && <span className="text-muted-foreground"> · {r.autor}</span>}
                            {r.observacao && <span className="block text-xs text-muted-foreground">{r.observacao}</span>}
                          </a>
                          <ExternalLink size={12} className="mt-1 text-muted-foreground shrink-0" />
                          <button type="button" onClick={() => onDeleteRecurso(r)} className="mt-0.5 rounded p-0.5 text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10 transition-colors" title="Não é relevante para mim: remover sugestão" aria-label={`Remover sugestão ${r.titulo}`}>
                            <X size={13} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {recursosPorTipo.length === 0 && acervo.length === 0 && (
                  <p className="text-sm text-muted-foreground md:col-span-2">Nenhuma sugestão cadastrada. Gere o prompt e depois adicione aqui o que valeu a pena.</p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- Linha de subhabilidade

function SubRow({ sub, prioritaria, isFirst, isLast, onNota, onEdit, onDelete, onMove }: {
  sub: Subhabilidade;
  prioritaria: boolean;
  isFirst: boolean;
  isLast: boolean;
  onNota: (nota: number) => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (d: -1 | 1) => void;
}) {
  // Valor local para o slider responder na hora; o banco só recebe ao soltar
  const [valor, setValor] = useState(sub.nota);
  useEffect(() => { setValor(sub.nota); }, [sub.nota]);
  const nivel = nivelDaNota(valor);

  return (
    <div className={cn("group grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_260px_auto] gap-x-4 gap-y-1 items-center rounded-md px-2 py-2 -mx-2 hover:bg-muted/40", prioritaria && "bg-muted/20")}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{sub.nome}</span>
          {sub.peso !== 1 && <Badge variant="outline" className="text-[10px] h-4 px-1">peso {formatNota(sub.peso)}</Badge>}
          {prioritaria && <Badge className="text-[10px] h-4 px-1 text-white border-transparent" style={{ backgroundColor: nivel.hex }}>prioridade</Badge>}
        </div>
        {sub.criterios && (
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-xs text-muted-foreground line-clamp-1 cursor-help">{sub.criterios}</p>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start" className="max-w-sm text-xs">
              <p className="font-semibold mb-1">Nota 10 seria:</p>{sub.criterios}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Slider
          min={0}
          max={10}
          step={0.5}
          value={[valor]}
          onValueChange={([v]) => setValor(v)}
          onValueCommit={([v]) => { if (v !== sub.nota) onNota(v); }}
          className="flex-1"
          aria-label={`Nota de ${sub.nome}`}
        />
        <span className="numeric w-9 text-right font-semibold text-sm" style={{ color: nivel.hex }}>{formatNota(valor)}</span>
      </div>
      <div className="flex items-center opacity-60 group-hover:opacity-100 pointer-coarse:opacity-100 transition-opacity justify-end">
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={isFirst} onClick={() => onMove(-1)} title="Subir"><ArrowUp size={13} /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={isLast} onClick={() => onMove(1)} title="Descer"><ArrowDown size={13} /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} title="Editar"><Pencil size={13} /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete} title="Excluir"><Trash2 size={13} /></Button>
      </div>
    </div>
  );
}
