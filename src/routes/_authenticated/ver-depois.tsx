import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Plus, Search, ExternalLink, Trash2, Check, RotateCcw, Globe, Youtube, Instagram, LayoutTemplate, Link2, Pencil, Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ver-depois")({
  component: VerDepoisPage,
});

type Tipo = "lp" | "site" | "youtube" | "reel" | "post" | "outro";

const TIPOS: { id: Tipo; label: string; icon: React.ReactNode; hex: string }[] = [
  { id: "youtube", label: "Vídeo do YouTube", icon: <Youtube size={14} />, hex: "#ef4444" },
  { id: "reel", label: "Reel", icon: <Instagram size={14} />, hex: "#ec4899" },
  { id: "post", label: "Post", icon: <Instagram size={14} />, hex: "#a855f7" },
  { id: "lp", label: "Landing page", icon: <LayoutTemplate size={14} />, hex: "#f59e0b" },
  { id: "site", label: "Site", icon: <Globe size={14} />, hex: "#3b82f6" },
  { id: "outro", label: "Outro link", icon: <Link2 size={14} />, hex: "#64748b" },
];

const tipoMeta = (id: string) => TIPOS.find((t) => t.id === id) || TIPOS[TIPOS.length - 1];

interface Item {
  id: string;
  tipo: Tipo;
  titulo: string;
  link: string;
  observacao: string | null;
  visto: boolean;
  visto_em: string | null;
  created_at: string;
}

function normalizarLink(link: string): string {
  const l = link.trim();
  if (!l) return "";
  return /^https?:\/\//i.test(l) ? l : `https://${l}`;
}

/** Adivinha o tipo pelo link (o usuário pode trocar) */
function detectarTipo(link: string): Tipo | null {
  const l = link.toLowerCase();
  if (/youtube\.com|youtu\.be/.test(l)) return "youtube";
  if (/instagram\.com\/reels?\//.test(l) || /tiktok\.com/.test(l)) return "reel";
  if (/instagram\.com\/p\//.test(l) || /linkedin\.com\/posts|x\.com\/|twitter\.com\//.test(l)) return "post";
  return null;
}

function youtubeId(link: string): string | null {
  const m = link.match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}

function dominio(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return link;
  }
}

function VerDepoisPage() {
  const [itens, setItens] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [mostrarVistos, setMostrarVistos] = useState(false);
  const [dialog, setDialog] = useState<{ item?: Item } | null>(null);
  const [toDelete, setToDelete] = useState<Item | null>(null);

  const load = async () => {
    const { data, error } = await supabase.from("ver_depois").select("*").order("visto").order("created_at", { ascending: false });
    if (error) {
      setErro(/schema cache|does not exist|not find/i.test(error.message)
        ? "A tabela ver_depois ainda não existe. Rode supabase/migrations/20260918110000_cursos_acesso_ver_depois.sql no SQL Editor."
        : error.message);
    } else {
      setItens((data || []) as Item[]);
      setErro(null);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter((i) =>
      (mostrarVistos || !i.visto) &&
      (filtroTipo === "todos" || i.tipo === filtroTipo) &&
      (!q || i.titulo.toLowerCase().includes(q) || i.link.toLowerCase().includes(q) || (i.observacao || "").toLowerCase().includes(q)),
    );
  }, [itens, busca, filtroTipo, mostrarVistos]);

  const contagem = useMemo(() => {
    const c: Record<string, number> = { todos: 0 };
    itens.forEach((i) => {
      if (i.visto && !mostrarVistos) return;
      c.todos += 1;
      c[i.tipo] = (c[i.tipo] || 0) + 1;
    });
    return c;
  }, [itens, mostrarVistos]);

  const pendentes = itens.filter((i) => !i.visto).length;

  const marcarVisto = async (item: Item, visto: boolean) => {
    setItens((prev) => prev.map((i) => (i.id === item.id ? { ...i, visto, visto_em: visto ? new Date().toISOString() : null } : i)));
    const { error } = await supabase.from("ver_depois").update({ visto, visto_em: visto ? new Date().toISOString() : null }).eq("id", item.id);
    if (error) {
      toast.error(error.message);
      load();
    } else if (visto) {
      toast.success("Marcado como visto", { action: { label: "Desfazer", onClick: () => marcarVisto(item, false) } });
    }
  };

  const abrir = (item: Item) => {
    window.open(item.link, "_blank", "noopener,noreferrer");
  };

  const copiar = async (item: Item) => {
    try {
      await navigator.clipboard.writeText(item.link);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const excluir = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from("ver_depois").delete().eq("id", toDelete.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Removido");
      setItens((prev) => prev.filter((i) => i.id !== toDelete.id));
    }
    setToDelete(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ver depois</h1>
          <p className="text-muted-foreground text-sm">
            Links para consumir com calma: vídeos, reels, posts, landing pages e sites. {pendentes > 0 ? `${pendentes} pendente${pendentes === 1 ? "" : "s"}.` : "Nada pendente."}
          </p>
        </div>
        <Button className="gap-2" onClick={() => setDialog({})}>
          <Plus size={18} /> Adicionar link
        </Button>
      </div>

      {erro && (
        <Card className="border-destructive/40"><CardContent className="p-4 text-sm text-destructive">{erro}</CardContent></Card>
      )}

      <div className="flex flex-col gap-3">
        <Tabs value={filtroTipo} onValueChange={setFiltroTipo}>
          <TabsList className="w-full justify-start overflow-x-auto h-auto p-1 bg-muted/50">
            <TabsTrigger value="todos" className="gap-2 shrink-0">
              Todos <Badge variant="secondary" className="px-1.5 h-4 text-[10px] leading-none">{contagem.todos || 0}</Badge>
            </TabsTrigger>
            {TIPOS.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="gap-2 shrink-0">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.hex }} />
                {t.label}
                <Badge variant="secondary" className="px-1.5 h-4 text-[10px] leading-none">{contagem[t.id] || 0}</Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <Input placeholder="Buscar por título, link ou nota..." className="pl-10" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <Button variant={mostrarVistos ? "default" : "outline"} className="gap-2" onClick={() => setMostrarVistos((v) => !v)}>
            <Check size={14} /> {mostrarVistos ? "Mostrando vistos" : "Mostrar vistos"}
          </Button>
        </div>
      </div>

      {filtrados.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
          <div className="bg-muted rounded-full p-4"><Link2 size={36} className="text-muted-foreground" /></div>
          <h3 className="text-lg font-medium">{itens.length === 0 ? "Nada salvo ainda" : "Nenhum item nesse filtro"}</h3>
          <p className="text-muted-foreground max-w-xs text-sm">Cole um link, dê um título e ele fica aqui até você ver.</p>
          <Button onClick={() => setDialog({})}>Adicionar o primeiro link</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtrados.map((item) => {
            const meta = tipoMeta(item.tipo);
            const yt = item.tipo === "youtube" ? youtubeId(item.link) : null;
            return (
              <Card key={item.id} className={cn("overflow-hidden group flex flex-col transition-all", item.visto && "opacity-60")}>
                <button type="button" onClick={() => abrir(item)} className="text-left w-full" title="Abrir link">
                  {yt ? (
                    <div className="relative aspect-video bg-muted">
                      <img src={`https://img.youtube.com/vi/${yt}/hqdefault.jpg`} alt="" className="h-full w-full object-cover" loading="lazy" />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                        <Youtube size={36} className="text-white drop-shadow" />
                      </div>
                    </div>
                  ) : (
                    <div className="h-2 w-full" style={{ backgroundColor: meta.hex }} />
                  )}
                  <div className="p-4 pb-2 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Badge className="text-[10px] h-5 text-white border-transparent gap-1" style={{ backgroundColor: meta.hex }}>
                        {meta.icon} {meta.label}
                      </Badge>
                      {item.visto && <Badge variant="outline" className="text-[10px] h-5">Visto</Badge>}
                    </div>
                    <h3 className={cn("font-semibold leading-snug line-clamp-2", item.visto && "line-through")}>{item.titulo}</h3>
                    <p className="text-[11px] text-muted-foreground truncate">{dominio(item.link)}</p>
                    {item.observacao && <p className="text-xs text-muted-foreground line-clamp-2 italic">{item.observacao}</p>}
                  </div>
                </button>
                <CardContent className="p-4 pt-2 mt-auto">
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" className="flex-1 gap-1.5" onClick={() => abrir(item)}>
                      <ExternalLink size={14} /> Abrir
                    </Button>
                    <Button size="sm" variant={item.visto ? "outline" : "secondary"} className="gap-1.5" onClick={() => marcarVisto(item, !item.visto)} title={item.visto ? "Voltar para pendente" : "Marcar como visto"}>
                      {item.visto ? <RotateCcw size={14} /> : <Check size={14} />}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => copiar(item)} title="Copiar link"><Copy size={14} /></Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setDialog({ item })} title="Editar"><Pencil size={14} /></Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => setToDelete(item)} title="Remover"><Trash2 size={14} /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ItemDialog state={dialog} onClose={() => setDialog(null)} onSaved={load} />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover "{toDelete?.titulo}"?</AlertDialogTitle>
            <AlertDialogDescription>O link sai da lista. Não há como desfazer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={excluir} className="bg-destructive hover:bg-destructive/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ItemDialog({ state, onClose, onSaved }: { state: { item?: Item } | null; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const [tipo, setTipo] = useState<Tipo>("youtube");
  const [tipoManual, setTipoManual] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [link, setLink] = useState("");
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state) return;
    setTipo(state.item?.tipo || "youtube");
    setTipoManual(!!state.item);
    setTitulo(state.item?.titulo || "");
    setLink(state.item?.link || "");
    setObservacao(state.item?.observacao || "");
  }, [state]);

  const onLinkChange = (v: string) => {
    setLink(v);
    if (!tipoManual) {
      const d = detectarTipo(v);
      if (d) setTipo(d);
    }
  };

  const save = async () => {
    const l = normalizarLink(link);
    if (!l) { toast.error("Cole o link"); return; }
    if (!titulo.trim()) { toast.error("Dê um título para reconhecer depois"); return; }
    setSaving(true);
    const payload = { tipo, titulo: titulo.trim(), link: l, observacao: observacao.trim() || null };
    const { error } = state?.item
      ? await supabase.from("ver_depois").update(payload).eq("id", state.item.id)
      : await supabase.from("ver_depois").insert([payload]);
    setSaving(false);
    if (error) {
      toast.error(/schema cache|does not exist|not find/i.test(error.message)
        ? "A tabela ver_depois ainda não existe. Rode supabase/migrations/20260918110000_cursos_acesso_ver_depois.sql no SQL Editor."
        : error.message);
      return;
    }
    toast.success(state?.item ? "Atualizado" : "Salvo para ver depois");
    await onSaved();
    onClose();
  };

  return (
    <Dialog open={!!state} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{state?.item ? "Editar link" : "Adicionar para ver depois"}</DialogTitle>
          <DialogDescription>Cole o link, escolha o tipo e dê um título curto para reconhecer no card.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <div className="space-y-2">
            <Label htmlFor="vd-link">Link</Label>
            <Input id="vd-link" autoFocus placeholder="https://..." value={link} onChange={(e) => onLinkChange(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vd-tipo">Tipo</Label>
            <Select value={tipo} onValueChange={(v) => { setTipo(v as Tipo); setTipoManual(true); }}>
              <SelectTrigger id="vd-tipo"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="vd-titulo">Título</Label>
            <Input id="vd-titulo" placeholder="Ex.: VSL do curso X — ver estrutura do pitch" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vd-obs">Nota (opcional)</Label>
            <Input id="vd-obs" placeholder="Por que quero ver" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : state?.item ? "Salvar" : "Adicionar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
