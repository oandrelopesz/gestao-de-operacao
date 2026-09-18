import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Gauge, Plus, Pencil, Trash2, ArrowUp, ArrowDown, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  type Habilidade, type Subhabilidade,
  fetchHabilidades, notaDaHabilidade, nivelDaNota, formatNota,
  deleteHabilidade, deleteSubhabilidade, reorderHabilidades, reorderSubhabilidades,
} from "@/lib/habilidades";
import {
  HabilidadeDialog, SubhabilidadeDialog,
  type HabilidadeDialogState, type SubhabilidadeDialogState,
} from "@/components/habilidades/HabilidadeDialogs";

/**
 * Card da aba Admin para gerenciar a estrutura do roadmap (habilidades e subhabilidades).
 * As notas em si são dadas na aba Habilidades.
 */
export function HabilidadesAdminCard() {
  const [habilidades, setHabilidades] = useState<Habilidade[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<Set<string>>(new Set());
  const [habDialog, setHabDialog] = useState<HabilidadeDialogState>(null);
  const [subDialog, setSubDialog] = useState<SubhabilidadeDialogState>(null);
  const [habToDelete, setHabToDelete] = useState<Habilidade | null>(null);
  const [subToDelete, setSubToDelete] = useState<Subhabilidade | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    try {
      setHabilidades(await fetchHabilidades());
      setErro(null);
    } catch (e: any) {
      const msg: string = e?.message || "";
      setErro(/schema cache|does not exist|not find/i.test(msg)
        ? "As tabelas de habilidades ainda não existem no banco. Rode supabase/migrations/20260917130000_habilidades.sql no SQL Editor do Supabase."
        : msg || "Erro ao carregar habilidades");
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const toggle = (id: string) => {
    setAberta((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const moveHab = async (hab: Habilidade, direction: -1 | 1) => {
    const idx = habilidades.findIndex((h) => h.id === hab.id);
    const target = idx + direction;
    if (idx < 0 || target < 0 || target >= habilidades.length) return;
    const reordered = [...habilidades];
    reordered[idx] = habilidades[target];
    reordered[target] = hab;
    setHabilidades(reordered);
    try {
      await reorderHabilidades(reordered);
    } catch (e: any) {
      toast.error(e.message || "Erro ao reordenar");
      await reload();
    }
  };

  const moveSub = async (hab: Habilidade, sub: Subhabilidade, direction: -1 | 1) => {
    const idx = hab.subhabilidades.findIndex((s) => s.id === sub.id);
    const target = idx + direction;
    if (idx < 0 || target < 0 || target >= hab.subhabilidades.length) return;
    const reordered = [...hab.subhabilidades];
    reordered[idx] = hab.subhabilidades[target];
    reordered[target] = sub;
    setHabilidades((prev) => prev.map((h) => (h.id === hab.id ? { ...h, subhabilidades: reordered } : h)));
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
      await deleteSubhabilidade(subToDelete.id);
      toast.success(`Subhabilidade "${subToDelete.nome}" excluída`);
      setSubToDelete(null);
      await reload();
    } catch (e: any) {
      toast.error(e.message || "Erro ao excluir");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2"><Gauge size={18} /> Habilidades (roadmap)</CardTitle>
            <CardDescription>
              Estrutura da aba Habilidades: habilidades, subhabilidades, critérios e pesos. As notas você dá{" "}
              <Link to="/habilidades" className="underline underline-offset-2 inline-flex items-center gap-1">na própria aba <ExternalLink size={11} /></Link>.
            </CardDescription>
          </div>
          <Button size="sm" className="gap-2 shrink-0" onClick={() => setHabDialog({ mode: "create" })}>
            <Plus size={14} /> Nova habilidade
          </Button>
        </CardHeader>
        <CardContent>
          {erro && <p className="text-sm text-destructive mb-3">{erro}</p>}
          <div className="divide-y rounded-md border">
            {habilidades.map((h, idx) => {
              const nota = notaDaHabilidade(h);
              const nivel = nivelDaNota(nota);
              const open = aberta.has(h.id);
              return (
                <div key={h.id}>
                  <div className="flex items-center gap-3 px-3 py-2">
                    <button type="button" onClick={() => toggle(h.id)} className="text-muted-foreground" title={open ? "Recolher" : "Ver subhabilidades"}>
                      {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    <span className="h-3.5 w-3.5 rounded-full shrink-0" style={{ backgroundColor: nota === null ? "var(--muted)" : nivel.hex }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{h.nome}</span>
                        {h.peso !== 1 && <Badge variant="outline" className="text-[10px]">peso {formatNota(h.peso)}</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {h.subhabilidades.length} {h.subhabilidades.length === 1 ? "subhabilidade" : "subhabilidades"} · nota <span className="numeric">{formatNota(nota)}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === 0} onClick={() => moveHab(h, -1)} title="Subir"><ArrowUp size={14} /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === habilidades.length - 1} onClick={() => moveHab(h, 1)} title="Descer"><ArrowDown size={14} /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSubDialog({ mode: "create", habilidade: h })} title="Nova subhabilidade"><Plus size={14} /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setHabDialog({ mode: "edit", habilidade: h })} title="Editar"><Pencil size={14} /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setHabToDelete(h)} title="Excluir"><Trash2 size={14} /></Button>
                    </div>
                  </div>
                  {open && (
                    <div className="bg-muted/30 border-t divide-y">
                      {h.subhabilidades.map((s, sIdx) => (
                        <div key={s.id} className="flex items-center gap-3 pl-12 pr-3 py-1.5">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm truncate">{s.nome}</span>
                              {s.peso !== 1 && <Badge variant="outline" className="text-[10px] h-4 px-1">peso {formatNota(s.peso)}</Badge>}
                              <span className={cn("numeric text-xs font-semibold")} style={{ color: nivelDaNota(s.nota).hex }}>{formatNota(s.nota)}</span>
                            </div>
                            {s.criterios && <p className="text-xs text-muted-foreground truncate">{s.criterios}</p>}
                          </div>
                          <div className="flex items-center">
                            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={sIdx === 0} onClick={() => moveSub(h, s, -1)} title="Subir"><ArrowUp size={12} /></Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={sIdx === h.subhabilidades.length - 1} onClick={() => moveSub(h, s, 1)} title="Descer"><ArrowDown size={12} /></Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSubDialog({ mode: "edit", habilidade: h, sub: s })} title="Editar"><Pencil size={12} /></Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => setSubToDelete(s)} title="Excluir"><Trash2 size={12} /></Button>
                          </div>
                        </div>
                      ))}
                      {h.subhabilidades.length === 0 && (
                        <p className="pl-12 pr-3 py-2 text-xs text-muted-foreground">Nenhuma subhabilidade. Use o "+" na linha da habilidade.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {habilidades.length === 0 && !erro && (
              <p className="px-3 py-6 text-sm text-muted-foreground text-center">Nenhuma habilidade. Clique em "Nova habilidade" para criar a primeira.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <HabilidadeDialog state={habDialog} onClose={() => setHabDialog(null)} onSaved={reload} habilidades={habilidades} />
      <SubhabilidadeDialog state={subDialog} onClose={() => setSubDialog(null)} onSaved={reload} />

      <AlertDialog open={!!habToDelete} onOpenChange={(o) => { if (!o) setHabToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir habilidade "{habToDelete?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>As {habToDelete?.subhabilidades.length ?? 0} subhabilidades, notas e sugestões dela também serão apagadas. Não há como desfazer.</AlertDialogDescription>
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
            <AlertDialogTitle>Excluir subhabilidade "{subToDelete?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>A nota da habilidade será recalculada sem ela.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleDeleteSub(); }} disabled={saving} className="bg-destructive hover:bg-destructive/90">
              {saving ? "Aguarde..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
