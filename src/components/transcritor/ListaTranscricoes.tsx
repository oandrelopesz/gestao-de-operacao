import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, Check, CheckSquare, ChevronDown, ChevronRight, Clock, Copy, Download, FileAudio, Link2, Loader2, Pencil, RotateCcw, Trash2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  VALIDADE_MAX, formatarDuracao, nomeExibido, ordenarProntas, rotuloPlataforma, rotuloValidade, nomeIdioma, type OrdemProntas } from "@/lib/transcritorTexto";
import { definirValidade, excluir, renomear, tentarDeNovo, textos, traduzErroTranscritor, type Transcricao } from "@/lib/transcritor";

const CHAVE_ORDEM = "transcritor_ordem";

function nomeDeArquivo(t: { nome: string | null; created_at: string }): string {
  return `${nomeExibido(t).replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 120) || "transcricao"}.txt`;
}

function baixarTxt(nome: string, texto: string) {
  const url = URL.createObjectURL(new Blob([texto], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Escolha de 1 a 15 dias a partir de agora (renovável). */
function ValidadeEscolha({ onAplicar, children }: { onAplicar: (dias: number) => Promise<void>; children: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const [dias, setDias] = useState("3");
  const [salvando, setSalvando] = useState(false);
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-60 space-y-3" align="end">
        <p className="text-sm font-medium">Manter por quanto tempo?</p>
        <Select value={dias} onValueChange={setDias}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Array.from({ length: VALIDADE_MAX }, (_, i) => i + 1).map((d) => (
              <SelectItem key={d} value={String(d)}>{d} {d === 1 ? "dia" : "dias"} a partir de agora</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">Depois disso é apagada de vez (sem lixeira). Dá para renovar de novo quando quiser.</p>
        <Button size="sm" className="w-full" disabled={salvando}
          onClick={async () => { setSalvando(true); try { await onAplicar(Number(dias)); setAberto(false); } finally { setSalvando(false); } }}>
          {salvando ? <Loader2 size={14} className="animate-spin" /> : "Aplicar"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

interface Props {
  concluidas: Transcricao[];
  onMudou: () => Promise<void> | void;
}

export function ListaTranscricoes({ concluidas, onMudou }: Props) {
  const [ordem, setOrdem] = useState<OrdemProntas>("recentes");
  const [aberta, setAberta] = useState<string | null>(null);
  const [textoAberto, setTextoAberto] = useState<Record<string, string>>({});
  const [editando, setEditando] = useState<{ id: string; nome: string } | null>(null);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [paraExcluir, setParaExcluir] = useState<string[] | null>(null);
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    try { const v = localStorage.getItem(CHAVE_ORDEM) as OrdemProntas | null; if (v) setOrdem(v); } catch { /* sem storage */ }
    const t = window.setInterval(() => setAgora(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const lista = useMemo(() => ordenarProntas(concluidas, ordem), [concluidas, ordem]);
  const ids = new Set(lista.map((t) => t.id));
  const marcadas = [...selecionadas].filter((id) => ids.has(id));
  const prontasMarcadas = marcadas.filter((id) => lista.find((t) => t.id === id)?.status === "pronta");

  const alternar = (id: string) => setSelecionadas((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const tentar = async (fn: () => Promise<void>, sucesso?: string) => {
    try {
      await fn();
      if (sucesso) toast.success(sucesso);
    } catch (e) {
      toast.error(traduzErroTranscritor(e));
    } finally {
      await onMudou();
    }
  };

  const buscarTexto = async (id: string): Promise<string | null> => {
    if (textoAberto[id] != null) return textoAberto[id];
    const [t] = await textos([id]);
    const texto = t?.texto ?? null;
    if (texto != null) setTextoAberto((prev) => ({ ...prev, [id]: texto }));
    return texto;
  };

  const copiar = (t: Transcricao) => tentar(async () => {
    const texto = await buscarTexto(t.id);
    if (!texto) throw new Error("Transcrição sem texto");
    await navigator.clipboard.writeText(texto);
  }, "Texto copiado");

  const baixar = async (idsBaixar: string[]) => {
    try {
      const itens = await textos(idsBaixar);
      for (const t of itens) {
        if (!t.texto) continue;
        baixarTxt(nomeDeArquivo(t), t.texto);
        await new Promise((r) => setTimeout(r, 250)); // o navegador baixa um por vez
      }
    } catch (e) {
      toast.error(traduzErroTranscritor(e));
    }
  };

  const abrir = async (t: Transcricao) => {
    if (aberta === t.id) { setAberta(null); return; }
    setAberta(t.id);
    if (t.status === "pronta") await buscarTexto(t.id).catch((e) => toast.error(traduzErroTranscritor(e)));
  };

  const salvarNome = async () => {
    if (!editando) return;
    const { id, nome } = editando;
    setEditando(null);
    await tentar(() => renomear(id, nome));
  };

  if (!lista.length) return null;

  return (
    <section className={cn("space-y-3", marcadas.length > 0 && "pb-20")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Transcrições <span className="font-normal text-muted-foreground">({lista.length})</span></h2>
        <div className="flex items-center gap-2">
          <Select value={ordem} onValueChange={(v) => { setOrdem(v as OrdemProntas); try { localStorage.setItem(CHAVE_ORDEM, v); } catch { /* sem storage */ } }}>
            <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="recentes">Mais recentes primeiro</SelectItem>
              <SelectItem value="az">Nome: A → Z</SelectItem>
              <SelectItem value="za">Nome: Z → A</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
            onClick={() => setSelecionadas(marcadas.length === lista.length ? new Set() : new Set(lista.map((t) => t.id)))}>
            <CheckSquare size={13} /> {marcadas.length === lista.length ? "Desmarcar todas" : "Selecionar todas"}
          </Button>
        </div>
      </div>

      <Card className="divide-y overflow-hidden">
        {lista.map((t) => {
          const marcada = selecionadas.has(t.id);
          const falhou = t.status === "falhou";
          const expandida = aberta === t.id;
          return (
            <div key={t.id} className={cn("group", marcada && "bg-primary/5")}>
              <div className="flex items-center gap-3 px-3 py-2.5">
                <button type="button" role="checkbox" aria-checked={marcada} aria-label={marcada ? "Desmarcar" : "Selecionar"} onClick={() => alternar(t.id)}
                  className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-opacity",
                    marcada ? "border-primary bg-primary text-primary-foreground" : cn("border-zinc-300 hover:border-primary dark:border-zinc-600", marcadas.length ? "opacity-100" : "opacity-0 group-hover:opacity-100"))}>
                  {marcada && <Check size={10} />}
                </button>
                <button type="button" onClick={() => abrir(t)} className="text-muted-foreground hover:text-foreground" aria-label={expandida ? "Fechar texto" : "Ver texto"}>
                  {expandida ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", falhou ? "bg-red-500/10 text-red-500" : "bg-primary/10 text-primary")}>
                  {falhou ? <AlertTriangle size={15} /> : t.origem === "link" ? <Link2 size={15} /> : <FileAudio size={15} />}
                </span>
                <div className="min-w-0 flex-1">
                  {editando?.id === t.id ? (
                    <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); salvarNome(); }}>
                      <Input autoFocus value={editando.nome} className="h-7 text-sm" placeholder="Nome (vazio = sem nome)"
                        onChange={(e) => setEditando({ id: t.id, nome: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Escape") setEditando(null); }} />
                      <Button type="submit" size="icon" variant="ghost" className="h-7 w-7" aria-label="Salvar nome"><Check size={14} /></Button>
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditando(null)} aria-label="Cancelar"><X size={14} /></Button>
                    </form>
                  ) : (
                    <button type="button" onClick={() => abrir(t)} className="block max-w-full truncate text-left text-sm font-medium hover:underline">
                      {nomeExibido(t)}
                    </button>
                  )}
                  <p className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                    <span>{rotuloPlataforma(t)}</span>
                    {t.duracao_seg != null && <><span>·</span><span>{formatarDuracao(t.duracao_seg)}</span></>}
                    {t.idioma && <><span>·</span><span>{nomeIdioma(t.idioma)}</span></>}
                    {falhou && t.erro && <><span>·</span><span className="text-destructive">{t.erro}</span></>}
                  </p>
                </div>
                {t.expira_em && (
                  <span className="hidden shrink-0 items-center gap-1 text-[11px] text-muted-foreground sm:inline-flex" title={new Date(t.expira_em).toLocaleString("pt-BR")}>
                    <Clock size={11} /> {rotuloValidade(t.expira_em, agora)}
                  </span>
                )}
                <div className="flex shrink-0 items-center gap-0.5">
                  {!falhou && (
                    <>
                      <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2" onClick={() => copiar(t)} title="Copiar o texto">
                        <Copy size={14} /> <span className="hidden md:inline">Copiar</span>
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2" onClick={() => baixar([t.id])} title="Baixar .txt">
                        <Download size={14} /> <span className="hidden md:inline">.txt</span>
                      </Button>
                    </>
                  )}
                  {falhou && t.origem === "link" && (
                    <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2" onClick={() => tentar(() => tentarDeNovo([t.id]), "De volta à fila")}>
                      <RotateCcw size={14} /> <span className="hidden md:inline">Tentar de novo</span>
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditando({ id: t.id, nome: t.nome ?? "" })} title="Renomear"><Pencil size={14} /></Button>
                  <ValidadeEscolha onAplicar={(dias) => tentar(() => definirValidade([t.id], dias), `Fica por mais ${dias} ${dias === 1 ? "dia" : "dias"}`)}>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Validade (1 a 15 dias)"><Clock size={14} /></Button>
                  </ValidadeEscolha>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setParaExcluir([t.id])} title="Excluir de vez">
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
              {expandida && !falhou && (
                <div className="border-t bg-muted/20 px-4 py-3">
                  {textoAberto[t.id] == null ? (
                    <Loader2 size={16} className="animate-spin text-muted-foreground" />
                  ) : (
                    <div className="max-h-96 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed">{textoAberto[t.id]}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </Card>

      {marcadas.length > 0 && (
        <div className="fixed bottom-5 left-1/2 z-40 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 animate-in slide-in-from-bottom-4 duration-200">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-popover px-3 py-2 shadow-xl">
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <CheckSquare size={15} className="text-primary" /> {marcadas.length} {marcadas.length === 1 ? "selecionada" : "selecionadas"}
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <ValidadeEscolha onAplicar={(dias) => tentar(() => definirValidade(marcadas, dias), `Validade de ${dias} ${dias === 1 ? "dia" : "dias"} em ${marcadas.length}`)}>
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs"><Clock size={13} /> Validade</Button>
              </ValidadeEscolha>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={!prontasMarcadas.length} onClick={() => baixar(prontasMarcadas)}>
                <Download size={13} /> Baixar .txt
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive" onClick={() => setParaExcluir(marcadas)}>
                <Trash2 size={13} /> Excluir
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setSelecionadas(new Set())} aria-label="Limpar seleção"><X size={15} /></Button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={!!paraExcluir} onOpenChange={(o) => { if (!o) setParaExcluir(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{paraExcluir?.length === 1 ? "Excluir esta transcrição?" : `Excluir ${paraExcluir?.length} transcrições?`}</AlertDialogTitle>
            <AlertDialogDescription>{paraExcluir?.length === 1 ? "É apagada de vez, sem lixeira." : "São apagadas de vez, sem lixeira."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                const alvo = paraExcluir ?? [];
                setParaExcluir(null);
                setSelecionadas((prev) => new Set([...prev].filter((id) => !alvo.includes(id))));
                tentar(() => excluir(alvo), alvo.length === 1 ? "Transcrição excluída" : `${alvo.length} transcrições excluídas`);
              }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
