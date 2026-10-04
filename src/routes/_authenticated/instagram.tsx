import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Eye, Loader2, RefreshCw, Search, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MensagemBusca } from "@/components/MensagemBusca";
import { ContasVisiveis, FotoConta, alternarNaLista } from "@/components/instagram/ContasVisiveis";
import { CriarPost } from "@/components/instagram/CriarPost";
import { Calendario } from "@/components/instagram/Calendario";
import { ListaPosts, NA_FILA } from "@/components/instagram/Posts";
import { supabase } from "@/integrations/supabase/client";
import { useBusca } from "@/lib/useBusca";
import { fetchContas, fetchPosts, sincronizarContas, type ContaInstagram, type PostInstagram } from "@/lib/instagram";

export const Route = createFileRoute("/_authenticated/instagram")({ component: InstagramPage });

function InstagramPage() {
  const [contas, setContas] = useState<ContaInstagram[] | null>(null);
  const [posts, setPosts] = useState<PostInstagram[] | null>(null);
  const [aba, setAba] = useState("contas");
  const [busca, setBusca] = useState("");
  const [postar, setPostar] = useState<{ conta: ContaInstagram; edicao?: PostInstagram[] } | null>(null);
  const [gerenciar, setGerenciar] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);

  const carregarContas = () => fetchContas().then(setContas).catch((e) => toast.error(e.message));
  const carregarPosts = () => fetchPosts().then(setPosts).catch((e) => toast.error(e.message));
  useEffect(() => {
    carregarContas();
    carregarPosts();
    const canal = supabase.channel("ig-posts")
      .on("postgres_changes", { event: "*", schema: "public", table: "ig_posts" }, () => carregarPosts())
      .subscribe();
    return () => { supabase.removeChannel(canal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sincronizar = async () => {
    setSincronizando(true);
    try {
      const r = await sincronizarContas();
      toast.success(`${r.contas} ${r.contas === 1 ? "conta de Instagram" : "contas de Instagram"} em ${r.paginas} ${r.paginas === 1 ? "página" : "páginas"}`);
      await carregarContas();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSincronizando(false);
    }
  };

  const visiveis = useMemo(() => (contas ?? []).filter((c) => c.ativa && !c.oculta), [contas]);
  const resultado = useBusca(visiveis, busca, (c) => [c.nome, c.usuario]);
  const contaPorId = useMemo(() => new Map((contas ?? []).map((c) => [c.id, c])), [contas]);
  const naFilaPorConta = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of posts ?? []) if (NA_FILA.includes(p.status)) m.set(p.conta_id, (m.get(p.conta_id) ?? 0) + 1);
    return m;
  }, [posts]);
  const totalNaFila = [...naFilaPorConta.values()].reduce((a, b) => a + b, 0);

  /** Editar: as linhas do mesmo grupo ainda agendadas ou com erro (Instagram e Facebook juntos); story edita só a dele. */
  const editar = (p: PostInstagram) => {
    const conta = contaPorId.get(p.conta_id);
    if (!conta) return;
    const grupo = p.grupo && p.tipo !== "story" ? (posts ?? []).filter((x) => x.grupo === p.grupo && (x.status === "agendado" || x.status === "erro")) : [p];
    setPostar({ conta, edicao: grupo.length ? grupo : [p] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Instagram</h1>
          <p className="text-sm text-muted-foreground">Escolha a conta e clique em Postar. Publique na hora ou agende, no Instagram e no Facebook.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setGerenciar(true)}><Eye size={16} /> Contas visíveis</Button>
          <Button variant="outline" className="gap-2" onClick={sincronizar} disabled={sincronizando}>
            {sincronizando ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Sincronizar contas
          </Button>
        </div>
      </div>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="contas">Contas{contas ? ` (${visiveis.length})` : ""}</TabsTrigger>
          <TabsTrigger value="posts">Posts{totalNaFila ? ` (${totalNaFila} na fila)` : ""}</TabsTrigger>
          <TabsTrigger value="calendario">Calendário</TabsTrigger>
        </TabsList>

        <TabsContent value="contas" className="space-y-3">
          <div className="relative max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar conta..." className="pl-9" aria-label="Buscar conta" />
          </div>
          <MensagemBusca resultado={resultado} />
          {contas === null ? (
            <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Carregando...</div>
          ) : visiveis.length === 0 ? (
            <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">Nenhuma conta visível. Clique em "Sincronizar contas" ou em "Contas visíveis".</CardContent></Card>
          ) : (
            <Card>
              <div className="divide-y">
                {resultado.itens.map((c) => {
                  const n = naFilaPorConta.get(c.id) ?? 0;
                  return (
                    <div key={c.id} className="flex items-center gap-3 p-3">
                      <FotoConta conta={c} className="h-10 w-10" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.nome}</p>
                        <p className="truncate text-xs text-muted-foreground">@{c.usuario}</p>
                      </div>
                      {n > 0 && <Badge variant="secondary" className="hidden text-[10px] sm:inline-flex">{n} na fila</Badge>}
                      <Button size="sm" className="gap-2" onClick={() => setPostar({ conta: c })}><Send size={14} /> Postar</Button>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="posts">
          <ListaPosts posts={posts} contaPorId={contaPorId} onEditar={editar} />
        </TabsContent>

        <TabsContent value="calendario">
          <Calendario posts={posts} contaPorId={contaPorId} onEditar={editar} />
        </TabsContent>
      </Tabs>

      {postar && (
        <CriarPost
          key={`${postar.conta.id}-${postar.edicao?.[0]?.id ?? "novo"}`}
          conta={postar.conta}
          contas={contas ?? []}
          edicao={postar.edicao}
          onFechar={(salvou) => { setPostar(null); if (salvou && aba === "contas") setAba("posts"); }}
        />
      )}

      <Dialog open={gerenciar} onOpenChange={setGerenciar}>
        <DialogContent className="max-h-[85vh] grid-cols-1 overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Contas visíveis</DialogTitle>
            <DialogDescription>Desligue as contas que não quer ver na lista. Também dá para mudar em Admin → Instagram.</DialogDescription>
          </DialogHeader>
          <ContasVisiveis contas={(contas ?? []).filter((c) => c.ativa)} onAlternar={(c, v) => alternarNaLista(c, v, setContas)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
