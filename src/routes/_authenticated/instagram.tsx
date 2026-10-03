import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Eye, ExternalLink, Film, Images, Loader2, RefreshCw, RotateCcw, Search, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MensagemBusca } from "@/components/MensagemBusca";
import { ContasVisiveis, FotoConta, alternarNaLista } from "@/components/instagram/ContasVisiveis";
import { CriarPost, dataHora } from "@/components/instagram/CriarPost";
import { supabase } from "@/integrations/supabase/client";
import { useBusca } from "@/lib/useBusca";
import {
  cancelarPost, fetchContas, fetchPosts, sincronizarContas, tentarDeNovo, urlDaMidia,
  type ContaInstagram, type PostInstagram,
} from "@/lib/instagram";

export const Route = createFileRoute("/_authenticated/instagram")({ component: InstagramPage });

const NA_FILA = ["agendado", "enviando", "processando", "publicando"];

function InstagramPage() {
  const [contas, setContas] = useState<ContaInstagram[] | null>(null);
  const [posts, setPosts] = useState<PostInstagram[] | null>(null);
  const [aba, setAba] = useState("contas");
  const [busca, setBusca] = useState("");
  const [postarEm, setPostarEm] = useState<ContaInstagram | null>(null);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Instagram</h1>
          <p className="text-sm text-muted-foreground">Escolha a conta e clique em Postar. Publique na hora ou agende.</p>
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
                      <Button size="sm" className="gap-2" onClick={() => setPostarEm(c)}><Send size={14} /> Postar</Button>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="posts">
          <ListaPosts posts={posts} contaPorId={contaPorId} />
        </TabsContent>
      </Tabs>

      {postarEm && (
        <CriarPost
          key={postarEm.id}
          conta={postarEm}
          onFechar={(criou) => { setPostarEm(null); if (criou) setAba("posts"); }}
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

const SITUACAO: Record<string, { texto: string; classe: string }> = {
  agendado: { texto: "Agendado", classe: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  enviando: { texto: "Enviando…", classe: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  processando: { texto: "Enviando…", classe: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  publicando: { texto: "Publicando…", classe: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  publicado: { texto: "Publicado", classe: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  erro: { texto: "Erro", classe: "bg-destructive/15 text-destructive" },
  cancelado: { texto: "Cancelado", classe: "bg-muted text-muted-foreground" },
};

const TIPO = { foto: "Foto", carrossel: "Carrossel", reels: "Reels" } as Record<string, string>;

function ListaPosts({ posts, contaPorId }: { posts: PostInstagram[] | null; contaPorId: Map<string, ContaInstagram> }) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  // Na fila primeiro (o próximo no topo); depois os outros, do mais novo para o mais velho
  const ordenados = useMemo(() => {
    const naFila = (p: PostInstagram) => (NA_FILA.includes(p.status) ? 0 : 1);
    return [...(posts ?? [])].sort((a, b) => naFila(a) - naFila(b)
      || (naFila(a) === 0 ? a.agendado_para.localeCompare(b.agendado_para) : b.created_at.localeCompare(a.created_at)));
  }, [posts]);

  const agir = async (id: string, f: () => Promise<void>, ok: string) => {
    setOcupado(id);
    try {
      await f();
      toast.success(ok);
    } catch (e: any) {
      toast.error(e?.message || "Não deu certo.");
    } finally {
      setOcupado(null);
    }
  };

  if (posts === null) return <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Carregando...</div>;
  if (!posts.length) return <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">Nenhum post ainda. Vá em Contas e clique em Postar.</CardContent></Card>;

  return (
    <Card>
      <div className="divide-y">
        {ordenados.map((p) => {
          const conta = contaPorId.get(p.conta_id);
          const m = p.midias[0];
          const s = SITUACAO[p.status] ?? SITUACAO.erro;
          return (
            <div key={p.id} className="flex gap-3 p-3">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                {m?.tipo === "imagem" && <img src={urlDaMidia(m.chave)} alt="" loading="lazy" className="h-full w-full object-cover" />}
                {m?.tipo === "video" && <video src={urlDaMidia(m.chave)} muted preload="metadata" className="h-full w-full object-cover" />}
                {p.tipo !== "foto" && (
                  <span className="absolute right-0.5 top-0.5 rounded bg-black/60 p-0.5 text-white">
                    {p.tipo === "reels" ? <Film size={10} /> : <Images size={10} />}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-medium">@{conta?.usuario ?? p.conta_id}</span>
                  <span className="text-muted-foreground">{TIPO[p.tipo]}{p.tipo === "carrossel" ? ` · ${p.midias.length}` : ""}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${s.classe}`}>{s.texto}</span>
                  <span className="text-muted-foreground">
                    {p.status === "publicado" && p.publicado_em ? `em ${dataHora(p.publicado_em)}` : p.status === "cancelado" ? "" : `para ${dataHora(p.agendado_para)}`}
                  </span>
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">{p.legenda || "(sem legenda)"}</p>
                {p.status === "erro" && p.erro && <p className="text-xs text-destructive">{p.erro}</p>}
              </div>
              <div className="flex shrink-0 items-start gap-1">
                {p.status === "agendado" && (
                  <Button size="sm" variant="ghost" disabled={ocupado === p.id} onClick={() => agir(p.id, () => cancelarPost(p.id), "Post cancelado.")}>Cancelar</Button>
                )}
                {p.status === "erro" && (
                  <Button size="sm" variant="outline" className="gap-1" disabled={ocupado === p.id} onClick={() => agir(p.id, () => tentarDeNovo(p), "De volta para a fila.")}>
                    <RotateCcw size={13} /> Tentar de novo
                  </Button>
                )}
                {p.status === "publicado" && p.permalink && (
                  <Button size="sm" variant="ghost" className="gap-1" asChild>
                    <a href={p.permalink} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Ver no Instagram</a>
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
