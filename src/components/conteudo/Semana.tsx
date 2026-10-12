// Aba Conteúdo, área Semana: posts de segunda a domingo, Gerar a semana, Novo post e a aprovação de cada post.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2, Plus, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { hojeBrasilia } from "@/lib/entrega";
import { fetchPostsDaSemana, gerarSemana, novoPost, urlArquivo, type ClienteConteudo, type PostConteudo } from "@/lib/conteudo";
import { HORARIOS } from "../../../supabase/functions/gmn/regras.ts";
import {
  ROTULO_FORMATO, ROTULO_STATUS, faltaParaGerar, instanteBrasilia, segundaDaSemana, somarDias, type Formato,
} from "../../../supabase/functions/conteudo/regras.ts";
import { Campo } from "./Clientes";
import { PostDialog } from "./PostDialog";

const TODOS = "todos";
export const horaDe = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const rotuloDia = (dia: string) => new Date(`${dia}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit" });

export function Semana({ clientes }: { clientes: ClienteConteudo[] }) {
  const [segunda, setSegunda] = useState(() => segundaDaSemana(hojeBrasilia()));
  const [filtro, setFiltro] = useState(TODOS);
  const [posts, setPosts] = useState<PostConteudo[] | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [novo, setNovo] = useState(false);
  const carregar = () => fetchPostsDaSemana(segunda).then(setPosts).catch((e) => toast.error(e.message));
  useEffect(() => {
    setPosts(null);
    carregar();
    const canal = supabase.channel(`conteudo-${segunda}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conteudo_posts" }, () => carregar())
      .subscribe();
    return () => { supabase.removeChannel(canal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segunda]);
  const nomes = useMemo(() => new Map(clientes.map((c) => [c.id, c.clientes?.nome ?? "Cliente"])), [clientes]);
  // listas de escolha: sem os ocultos, em ordem alfabética
  const escolhas = useMemo(() => clientes.filter((c) => !c.oculto).sort((a, b) => (a.clientes?.nome ?? "").localeCompare(b.clientes?.nome ?? "", "pt-BR")), [clientes]);
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(segunda, i));
  const visiveis = (posts ?? []).filter((p) => filtro === TODOS || p.conteudo_cliente_id === filtro);
  const post = posts?.find((p) => p.id === aberto) ?? null;

  async function gerar() {
    setGerando(true);
    try {
      const r = await gerarSemana(segunda, filtro === TODOS ? undefined : filtro);
      if (!r.clientes) toast.warning("Nenhum cliente ligado. Ligue a chave do cliente na área Clientes.");
      else toast.success(r.criados ? `${r.criados} ${r.criados === 1 ? "post na fila" : "posts na fila"}. Eles aparecem aqui quando ficarem prontos.` : "Nenhum post novo: os dias da agenda já têm post.");
      for (const p of r.pulados) toast.warning(`${p.cliente}: ${p.motivo}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Semana anterior" onClick={() => setSegunda(somarDias(segunda, -7))}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="text-sm font-medium">Semana de {rotuloDia(segunda)}</span>
        <Button variant="outline" size="icon" aria-label="Próxima semana" onClick={() => setSegunda(somarDias(segunda, 7))}><ChevronRight className="h-4 w-4" /></Button>
        <Select value={filtro} onValueChange={setFiltro}>
          <SelectTrigger className="w-48" aria-label="Filtrar por cliente"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os clientes</SelectItem>
            {escolhas.map((c) => <SelectItem key={c.id} value={c.id}>{c.clientes?.nome ?? "Cliente"}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex gap-2 sm:ml-auto">
          <Button variant="outline" onClick={() => setNovo(true)} disabled={!clientes.length}><Plus className="mr-1 h-4 w-4" />Novo post</Button>
          <Button onClick={gerar} disabled={gerando || !clientes.length}>
            {gerando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1 h-4 w-4" />}Gerar a semana
          </Button>
        </div>
      </div>
      {!posts ? <Loader2 className="h-5 w-5 animate-spin" /> : (
        <div className="grid gap-2 md:grid-cols-7">
          {dias.map((dia) => {
            const doDia = visiveis.filter((p) => hojeBrasilia(new Date(p.agendado_para)) === dia);
            return (
              <div key={dia} className="min-h-24 rounded-md border p-2">
                <div className="mb-2 text-xs font-medium capitalize text-muted-foreground">{rotuloDia(dia)}</div>
                <div className="space-y-2">
                  {doDia.map((p) => <CartaoPost key={p.id} post={p} nome={nomes.get(p.conteudo_cliente_id) ?? ""} abrir={() => setAberto(p.id)} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {post && <PostDialog post={post} cliente={clientes.find((c) => c.id === post.conteudo_cliente_id) ?? null} fechar={() => setAberto(null)} />}
      <NovoPost aberto={novo} fechar={() => setNovo(false)} clientes={escolhas} segunda={segunda} />
    </div>
  );
}

function CartaoPost({ post, nome, abrir }: { post: PostConteudo; nome: string; abrir: () => void }) {
  const capa = post.laminas[0]?.jpg_chave;
  const andando = post.status === "texto" || post.status === "imagens" || post.status === "montando";
  const cor = post.status === "erro" ? "text-destructive" : post.status === "aguardando" ? "text-amber-600"
    : post.status === "aprovado" ? "text-emerald-600" : "text-muted-foreground";
  return (
    <button type="button" onClick={abrir} className="w-full rounded border bg-card p-1.5 text-left hover:bg-muted/50">
      {capa
        ? <img src={urlArquivo(capa)} alt="" loading="lazy" className="mb-1 aspect-[4/5] w-full rounded object-cover" />
        : <div className="mb-1 flex aspect-[4/5] w-full items-center justify-center rounded bg-muted">{andando && <Loader2 className="h-4 w-4 animate-spin" />}</div>}
      <div className="truncate text-xs font-medium">{nome}</div>
      <div className="text-[11px] text-muted-foreground">{horaDe(post.agendado_para)} · {ROTULO_FORMATO[post.formato]}</div>
      <div className={`text-[11px] ${cor}`}>{ROTULO_STATUS[post.status]}</div>
    </button>
  );
}

function NovoPost({ aberto, fechar, clientes, segunda }: { aberto: boolean; fechar: () => void; clientes: ClienteConteudo[]; segunda: string }) {
  const [cliente, setCliente] = useState("");
  const [dia, setDia] = useState(segunda);
  const [hora, setHora] = useState("09:00");
  const [formato, setFormato] = useState<Formato>("carrossel");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { if (aberto) setDia(segunda > hojeBrasilia() ? segunda : hojeBrasilia()); }, [aberto, segunda]);
  const c = clientes.find((x) => x.id === cliente);
  const falta = c ? faltaParaGerar(c, formato) : [];
  async function criar() {
    setSalvando(true);
    try {
      const quando = instanteBrasilia(dia, hora);
      if (Date.parse(quando) <= Date.now()) throw new Error("Escolha um dia e horário no futuro.");
      await novoPost({ conteudo_cliente_id: cliente, formato, agendado_para: quando });
      toast.success("Post na fila. Ele aparece aqui quando ficar pronto.");
      fechar();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSalvando(false);
    }
  }
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo post</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Campo rotulo="Cliente">
            <Select value={cliente} onValueChange={setCliente}>
              <SelectTrigger><SelectValue placeholder="Escolha o cliente" /></SelectTrigger>
              <SelectContent>{clientes.map((x) => <SelectItem key={x.id} value={x.id}>{x.clientes?.nome ?? "Cliente"}</SelectItem>)}</SelectContent>
            </Select>
          </Campo>
          <div className="flex flex-wrap gap-3">
            <Campo rotulo="Dia"><Input type="date" value={dia} onChange={(e) => setDia(e.target.value)} /></Campo>
            <Campo rotulo="Horário">
              <Select value={hora} onValueChange={setHora}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>{HORARIOS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
              </Select>
            </Campo>
            <Campo rotulo="Formato">
              <Select value={formato} onValueChange={(v) => setFormato(v as Formato)}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>{(["carrossel", "estatico"] as Formato[]).map((f) => <SelectItem key={f} value={f}>{ROTULO_FORMATO[f]}</SelectItem>)}</SelectContent>
              </Select>
            </Campo>
          </div>
          {falta.length > 0 && <p className="text-sm text-amber-600">Falta: {falta.join(", ")}.</p>}
        </div>
        <DialogFooter>
          <Button onClick={criar} disabled={!cliente || falta.length > 0 || salvando}>{salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Criar post</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
