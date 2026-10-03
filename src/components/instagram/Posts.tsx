// Posts da aba Instagram: a linha de um post (com as ações de cada situação) e a lista com filtro por conta.
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Facebook, Film, Images, Instagram, Loader2, MessageCircle, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  cancelarPost, comentarDeNovo, excluirPost, removerPost, tentarDeNovo, urlDaMidia, type ContaInstagram, type PostInstagram,
} from "@/lib/instagram";

export const NA_FILA = ["agendado", "enviando", "processando", "publicando"];

export const SITUACAO: Record<string, { texto: string; classe: string; ponto: string }> = {
  agendado: { texto: "Agendado", classe: "bg-sky-500/15 text-sky-700 dark:text-sky-300", ponto: "bg-sky-500" },
  enviando: { texto: "Enviando…", classe: "bg-amber-500/15 text-amber-700 dark:text-amber-300", ponto: "bg-amber-500" },
  processando: { texto: "Enviando…", classe: "bg-amber-500/15 text-amber-700 dark:text-amber-300", ponto: "bg-amber-500" },
  publicando: { texto: "Publicando…", classe: "bg-amber-500/15 text-amber-700 dark:text-amber-300", ponto: "bg-amber-500" },
  publicado: { texto: "Publicado", classe: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", ponto: "bg-emerald-500" },
  erro: { texto: "Erro", classe: "bg-destructive/15 text-destructive", ponto: "bg-destructive" },
  cancelado: { texto: "Cancelado", classe: "bg-muted text-muted-foreground", ponto: "bg-muted-foreground" },
  excluido: { texto: "Excluído", classe: "bg-muted text-muted-foreground", ponto: "bg-muted-foreground" },
};

export const TIPO: Record<string, string> = { foto: "Foto", carrossel: "Carrossel", reels: "Reels", story: "Story" };

export const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const REDE = { instagram: "Instagram", facebook: "Facebook" } as Record<string, string>;

/** Uma linha de post com as ações da situação dele. */
export function LinhaPost({ post: p, conta, onEditar }: {
  post: PostInstagram;
  conta?: ContaInstagram;
  onEditar: (p: PostInstagram) => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const m = p.midias[0];
  const s = SITUACAO[p.status] ?? SITUACAO.erro;
  const rede = REDE[p.rede] ?? "Instagram";

  const agir = async (f: () => Promise<unknown>, ok: string) => {
    setOcupado(true);
    try {
      await f();
      toast.success(ok);
    } catch (e: any) {
      toast.error(e?.message || "Não deu certo.");
    } finally {
      setOcupado(false);
    }
  };

  const botao = (rotulo: string, icone: React.ReactNode, onClick: () => void, variante: "ghost" | "outline" = "ghost") => (
    <Button size="sm" variant={variante} className="h-8 gap-1 px-2" disabled={ocupado} onClick={onClick} aria-label={rotulo} title={rotulo}>
      {icone} <span className="hidden sm:inline">{rotulo}</span>
    </Button>
  );

  return (
    <div className="flex gap-3 p-3">
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
        {m?.tipo === "imagem" && <img src={urlDaMidia(m.chave)} alt="" loading="lazy" className="h-full w-full object-cover" />}
        {m?.tipo === "video" && <video src={urlDaMidia(m.chave)} muted preload="metadata" className="h-full w-full object-cover" />}
        {p.tipo !== "foto" && (
          <span className="absolute right-0.5 top-0.5 rounded bg-black/60 p-0.5 text-white">
            {p.tipo === "reels" || p.tipo === "story" ? <Film size={10} /> : <Images size={10} />}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span title={rede}>{p.rede === "facebook" ? <Facebook size={13} className="text-[#1877F2]" /> : <Instagram size={13} className="text-pink-600" />}</span>
          <span className="font-medium">@{conta?.usuario ?? p.conta_id}</span>
          <span className="text-muted-foreground">{TIPO[p.tipo]}{p.tipo === "carrossel" ? ` · ${p.midias.length}` : ""}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${s.classe}`}>{s.texto}</span>
          <span className="text-muted-foreground">
            {p.status === "publicado" && p.publicado_em ? `em ${dataHora(p.publicado_em)}`
              : p.status === "excluido" && p.excluido_em ? `em ${dataHora(p.excluido_em)}`
              : p.status === "cancelado" ? "" : `para ${dataHora(p.agendado_para)}`}
          </span>
        </div>
        {p.tipo !== "story" && <p className="line-clamp-2 text-sm text-muted-foreground">{p.legenda || "(sem legenda)"}</p>}
        {p.status === "erro" && p.erro && <p className="text-xs text-destructive">{p.erro}</p>}
        {p.aviso && <p className="text-xs text-amber-700 dark:text-amber-400">{p.aviso}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-start justify-end gap-1">
        {ocupado && <Loader2 size={14} className="mt-2 animate-spin text-muted-foreground" />}
        {p.status === "agendado" && botao("Editar", <Pencil size={13} />, () => onEditar(p))}
        {p.status === "agendado" && botao("Cancelar", <X size={13} />, () => agir(() => cancelarPost(p.id), "Post cancelado."))}
        {p.status === "erro" && botao("Tentar de novo", <RotateCcw size={13} />, () => agir(() => tentarDeNovo(p), "De volta para a fila."), "outline")}
        {p.status === "publicado" && p.permalink && (
          <Button size="sm" variant="ghost" className="h-8 gap-1 px-2" asChild>
            <a href={p.permalink} target="_blank" rel="noreferrer" aria-label={`Ver no ${rede}`} title={`Ver no ${rede}`}>
              <ExternalLink size={13} /> <span className="hidden sm:inline">Ver</span>
            </a>
          </Button>
        )}
        {p.status === "publicado" && p.primeiro_comentario && /primeiro comentário/.test(p.aviso ?? "") &&
          botao("Comentar de novo", <MessageCircle size={13} />, () => agir(() => comentarDeNovo(p.id), "Comentário publicado."), "outline")}
        {p.status === "publicado" && botao("Excluir", <Trash2 size={13} />, () => setConfirmar(true))}
        {["cancelado", "erro", "excluido"].includes(p.status) && botao("Remover", <Trash2 size={13} />, () => agir(() => removerPost(p.id), "Removido da lista."))}
      </div>

      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir do {rede}?</AlertDialogTitle>
            <AlertDialogDescription>
              O post sai do perfil @{conta?.usuario ?? ""} no {rede}, com curtidas e comentários. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => agir(() => excluirPost(p.id), `Excluído do ${rede}.`)}
            >Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const TODAS = "__todas__";

export function ListaPosts({ posts, contaPorId, onEditar }: {
  posts: PostInstagram[] | null;
  contaPorId: Map<string, ContaInstagram>;
  onEditar: (p: PostInstagram) => void;
}) {
  const [conta, setConta] = useState(TODAS);
  // Na fila primeiro (o próximo no topo); depois os outros, do mais novo para o mais velho
  const ordenados = useMemo(() => {
    const naFila = (p: PostInstagram) => (NA_FILA.includes(p.status) ? 0 : 1);
    return (posts ?? []).filter((p) => conta === TODAS || p.conta_id === conta).sort((a, b) => naFila(a) - naFila(b)
      || (naFila(a) === 0 ? a.agendado_para.localeCompare(b.agendado_para) : b.created_at.localeCompare(a.created_at)));
  }, [posts, conta]);
  const comPosts = useMemo(() => [...new Set((posts ?? []).map((p) => p.conta_id))]
    .map((id) => contaPorId.get(id)).filter((c): c is ContaInstagram => !!c), [posts, contaPorId]);

  if (posts === null) return <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Carregando...</div>;
  if (!posts.length) return <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">Nenhum post ainda. Vá em Contas e clique em Postar.</CardContent></Card>;

  return (
    <div className="space-y-3">
      {comPosts.length > 1 && (
        <Select value={conta} onValueChange={setConta}>
          <SelectTrigger className="w-full sm:w-64" aria-label="Filtrar por conta"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas as contas</SelectItem>
            {comPosts.map((c) => <SelectItem key={c.id} value={c.id}>@{c.usuario}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      <Card>
        <div className="divide-y">
          {ordenados.map((p) => <LinhaPost key={p.id} post={p} conta={contaPorId.get(p.conta_id)} onEditar={onEditar} />)}
        </div>
      </Card>
    </div>
  );
}
