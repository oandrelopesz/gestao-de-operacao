// Um post da semana: lâminas em tamanho real, legenda e as ações (aprovar, pedir mudança, editar, trocar dia ou formato,
// descartar, tentar de novo). A tela só mexe no post em "aguardando" (ou em "erro", para tentar de novo).
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { hojeBrasilia } from "@/lib/entrega";
import { ACEITA_IMAGENS } from "@/lib/gmnImagem";
import {
  aprovarPost, descartarPost, pedirMudanca, salvarTextos, tentarDeNovo, trocarData, trocarFormato, trocarFoto, urlArquivo,
  usarAjusteNoMolde, type ClienteConteudo, type PostConteudo,
} from "@/lib/conteudo";
import { HORARIOS } from "../../../supabase/functions/gmn/regras.ts";
import {
  LEGENDA_MAX, ROTULO_FORMATO, ROTULO_STATUS, faltaParaGerar, instanteBrasilia, moldesEmUso, type Formato,
} from "../../../supabase/functions/conteudo/regras.ts";
import { horaDe } from "./Semana";

export function PostDialog({ post, cliente, fechar }: { post: PostConteudo; cliente: ClienteConteudo | null; fechar: () => void }) {
  const [i, setI] = useState(0);
  const [laminas, setLaminas] = useState(post.laminas);
  const [legenda, setLegenda] = useState(post.legenda);
  const [dia, setDia] = useState(() => hojeBrasilia(new Date(post.agendado_para)));
  const [hora, setHora] = useState(() => horaDe(post.agendado_para));
  const [pedido, setPedido] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  // A versão do banco mudou (fila andou ou outra aba salvou): o rascunho volta ao que está salvo
  useEffect(() => {
    setLaminas(post.laminas);
    setLegenda(post.legenda);
    setI((x) => Math.min(x, Math.max(0, post.laminas.length - 1)));
  }, [post.updated_at]);

  const aguardando = post.status === "aguardando";
  const l = laminas[i];
  const molde = l && cliente ? moldesEmUso(cliente.moldes)[l.molde] : undefined;
  const camposTexto = molde?.campos.filter((c) => c.tipo === "texto") ?? [];
  const aceitaFoto = !!l && (l.molde === "texto" || !!molde?.campos.some((c) => c.tipo === "imagem"));
  const editado = legenda !== post.legenda || JSON.stringify(laminas) !== JSON.stringify(post.laminas);
  const outro: Formato = post.formato === "carrossel" ? "estatico" : "carrossel";
  const horarios = HORARIOS.includes(hora) ? HORARIOS : [hora, ...HORARIOS];

  async function fazer(nome: string, acao: () => Promise<unknown>, ok?: string) {
    setOcupado(nome);
    setConfirmar(null);
    try {
      await acao();
      if (ok) toast.success(ok);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setOcupado(null);
    }
  }
  const quando = () => instanteBrasilia(dia, hora);
  const girando = (nome: string) => ocupado === nome && <Loader2 className="mr-1 h-4 w-4 animate-spin" />;
  // Primeiro clique pede confirmação; o segundo descarta (aguardando ou erro)
  function descartar() {
    if (confirmar !== "descartar") { setConfirmar("descartar"); return; }
    fazer("descartar", async () => { await descartarPost(post); fechar(); }, "Post descartado.");
  }

  return (
    <Dialog open onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="max-h-[95vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{cliente?.clientes?.nome ?? "Post"} · {ROTULO_FORMATO[post.formato]}</DialogTitle>
          <DialogDescription>{post.tema ?? "Tema em definição"}{post.pilar ? ` (pilar ${post.pilar})` : ""} · {ROTULO_STATUS[post.status]}</DialogDescription>
        </DialogHeader>
        {post.erro && <p className="text-sm text-destructive">{post.erro}</p>}
        {post.aviso && <p className="text-sm text-amber-600">{post.aviso}</p>}
        <div className="grid gap-4 md:grid-cols-[minmax(0,420px)_1fr]">
          <div className="space-y-2">
            {l?.jpg_chave
              ? <img src={urlArquivo(l.jpg_chave)} alt={`Lâmina ${i + 1}`} className="aspect-[4/5] w-full rounded border object-cover" />
              : <div className="flex aspect-[4/5] w-full items-center justify-center rounded border bg-muted text-sm text-muted-foreground">
                  {post.status === "erro" ? "Parou com erro" : laminas.length ? "Montando..." : "Escrevendo..."}
                </div>}
            {laminas.length > 1 && (
              <div className="flex items-center justify-between">
                <Button variant="outline" size="icon" aria-label="Lâmina anterior" disabled={i === 0} onClick={() => setI(i - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                <span className="text-sm">{i + 1} de {laminas.length}</span>
                <Button variant="outline" size="icon" aria-label="Próxima lâmina" disabled={i === laminas.length - 1} onClick={() => setI(i + 1)}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {aguardando && l && (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">Lâmina {i + 1}</h3>
                {camposTexto.map((c) => (
                  <div key={c.nome} className="space-y-1">
                    <Label>{c.nome} ({(l.campos[c.nome] ?? "").length}/{c.max})</Label>
                    <Textarea rows={c.max > 120 ? 4 : 2} value={l.campos[c.nome] ?? ""}
                      onChange={(e) => setLaminas(laminas.map((x, j) => (j === i ? { ...x, campos: { ...x.campos, [c.nome]: e.target.value } } : x)))} />
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  {aceitaFoto && (
                    <Button variant="outline" size="sm" asChild disabled={!!ocupado}>
                      <label className="cursor-pointer">{girando("foto")}Trocar foto
                        <input type="file" accept={ACEITA_IMAGENS} className="hidden"
                          onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ""; if (a) fazer("foto", () => trocarFoto(post, i, a), "Foto trocada; a lâmina está sendo montada."); }} />
                      </label>
                    </Button>
                  )}
                  {l.ajuste_css && cliente && (
                    <Button variant="outline" size="sm" disabled={!!ocupado}
                      onClick={() => fazer("molde", () => usarAjusteNoMolde(cliente.id, l.molde, l.ajuste_css!), "O ajuste vale para os próximos posts.")}>
                      Usar este ajuste nos próximos posts
                    </Button>
                  )}
                </div>
              </section>
            )}

            <section className="space-y-1">
              <Label>Legenda ({legenda.length}/{LEGENDA_MAX})</Label>
              <Textarea rows={8} maxLength={LEGENDA_MAX} value={legenda} disabled={!aguardando} onChange={(e) => setLegenda(e.target.value)} />
            </section>
            {aguardando && editado && (
              <Button onClick={() => fazer("textos", () => salvarTextos(post, laminas, legenda), "Alterações salvas.")} disabled={!!ocupado}>{girando("textos")}Salvar alterações</Button>
            )}

            {aguardando && (
              <section className="space-y-2">
                <Label>Pedir mudança</Label>
                <Textarea rows={3} placeholder="Ex.: capa mais direta, troca a foto da lâmina 3 por uma do salão" value={pedido} onChange={(e) => setPedido(e.target.value)} />
                <Button variant="secondary" disabled={!pedido.trim() || !!ocupado}
                  onClick={() => fazer("pedido", async () => { const r = await pedirMudanca(post.id, pedido); setPedido(""); toast.success(r.resposta); })}>
                  {girando("pedido")}Pedir mudança
                </Button>
              </section>
            )}
            {post.pedidos.length > 0 && (
              <section className="space-y-1 text-sm">
                <h3 className="font-medium">Pedidos anteriores</h3>
                {post.pedidos.map((p, j) => <p key={j} className="text-muted-foreground">"{p.texto}": {p.resultado}</p>)}
              </section>
            )}

            {aguardando && (
              <section className="flex flex-wrap items-end gap-2">
                <div className="space-y-1"><Label>Dia</Label><Input type="date" value={dia} onChange={(e) => setDia(e.target.value)} /></div>
                <div className="space-y-1">
                  <Label>Horário</Label>
                  <Select value={hora} onValueChange={setHora}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>{horarios.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Button variant="outline" disabled={!!ocupado} onClick={() => fazer("data", () => trocarData(post.id, quando()), "Dia e horário trocados.")}>Trocar dia e horário</Button>
              </section>
            )}

            {aguardando && (
              <section className="flex flex-wrap gap-2 border-t pt-4">
                <Button variant="outline" disabled={!!ocupado} onClick={() => {
                  if (confirmar !== "formato") { setConfirmar("formato"); return; }
                  const falta = cliente ? faltaParaGerar(cliente, outro) : [];
                  if (falta.length) { toast.error(`Falta: ${falta.join(", ")}.`); setConfirmar(null); return; }
                  fazer("formato", () => trocarFormato(post, outro), "O post está sendo refeito no outro formato.");
                }}>
                  {confirmar === "formato" ? `Clique de novo: refazer como ${ROTULO_FORMATO[outro].toLowerCase()}` : `Trocar para ${ROTULO_FORMATO[outro].toLowerCase()}`}
                </Button>
                <Button variant="outline" className="text-destructive" disabled={!!ocupado} onClick={descartar}>
                  {confirmar === "descartar" ? "Clique de novo para descartar" : "Descartar"}
                </Button>
                <Button disabled={!!ocupado || post.laminas.some((x) => !x.jpg_chave)}
                  onClick={() => fazer("aprovar", async () => {
                    if (editado) throw new Error("Salve as alterações antes de aprovar.");
                    await aprovarPost(post.id, quando());
                    fechar();
                  }, "Aprovado e agendado no Instagram.")}>
                  {girando("aprovar")}Aprovar e agendar
                </Button>
              </section>
            )}

            {post.status === "erro" && (
              <section className="flex flex-wrap gap-2 border-t pt-4">
                <Button disabled={!!ocupado} onClick={() => fazer("tentar", () => tentarDeNovo(post), "Tentando de novo.")}>Tentar de novo</Button>
                <Button variant="outline" className="text-destructive" disabled={!!ocupado} onClick={descartar}>
                  {confirmar === "descartar" ? "Clique de novo para descartar" : "Descartar"}
                </Button>
              </section>
            )}
            {post.status === "aprovado" && (
              <p className="text-sm text-emerald-600">Aprovado e agendado para {new Date(post.agendado_para).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}. Acompanhe na aba Instagram.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
