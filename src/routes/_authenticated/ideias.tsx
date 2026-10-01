import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Lightbulb, Pencil, Trash2, ExternalLink, SquareKanban, CheckCircle2, Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { IdeiaDialog } from "@/components/ideias/IdeiaDialog";
import { EnviarParaDemandasDialog } from "@/components/ideias/EnviarParaDemandasDialog";
import { fetchIdeias, excluirIdeia, marcarConcluida, mensagemErro, retirarDasDemandas, type Ideia } from "@/lib/ideias";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CATEGORIA_CLIENTE, tipoIdeiaMeta, filtrarIdeias, dominioDoLink, type SituacaoIdeia } from "@/lib/ideiasTexto";
import { useCategoriasIdeias, EVENTO_CATEGORIAS_IDEIAS } from "@/lib/ideiasCategorias";
import { CategoriasIdeiasDialog } from "@/components/ideias/CategoriasIdeiasDialog";
import { useAgencias, agenciaBadgeStyle } from "@/lib/agencias";
import { CACHE_KEYS, loadClientesLite } from "@/lib/data";
import { useCachedState, hasCached } from "@/lib/pageCache";
import { toast } from "sonner";
import { MensagemBusca } from "@/components/MensagemBusca";

export const Route = createFileRoute("/_authenticated/ideias")({
  component: IdeiasPage,
});

function IdeiasPage() {
  const navigate = useNavigate();
  const { agencias, meta: agenciaMeta } = useAgencias();
  // Cache em memória: voltar para a aba mostra a lista na hora e atualiza por trás
  const [ideias, setIdeias] = useCachedState<Ideia[]>(CACHE_KEYS.ideias, []);
  const [clientes, setClientes] = useCachedState<{ id: string; nome: string; agencia: string }[]>(CACHE_KEYS.clientesLite, []);
  const [loading, setLoading] = useState(!hasCached(CACHE_KEYS.ideias));
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroAgencia, setFiltroAgencia] = useState("todas");
  const [situacao, setSituacao] = useState<SituacaoIdeia>("abertas");
  const [dialog, setDialog] = useState<{ ideia?: Ideia } | null>(null);
  const [enviando, setEnviando] = useState<Ideia | null>(null);
  const [toDelete, setToDelete] = useState<Ideia | null>(null);
  const [retirando, setRetirando] = useState<Ideia | null>(null);
  const { categorias } = useCategoriasIdeias();
  const [gerenciandoCategorias, setGerenciandoCategorias] = useState(false);

  // Categoria excluída: o filtro dela some, então volta para "Todas"
  useEffect(() => {
    if (filtroTipo !== "todos" && !categorias.some((c) => c.id === filtroTipo)) setFiltroTipo("todos");
  }, [categorias, filtroTipo]);

  // Exclusão de categoria move as ideias dela no banco: recarrega a lista a cada alteração de categorias
  useEffect(() => {
    const ouvir = () => { load(); };
    window.addEventListener(EVENTO_CATEGORIAS_IDEIAS, ouvir);
    return () => window.removeEventListener(EVENTO_CATEGORIAS_IDEIAS, ouvir);
  }, []);

  const load = async () => {
    try {
      setIdeias(await fetchIdeias());
      setErro(null);
    } catch (e: any) {
      setErro(mensagemErro(e));
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    loadClientesLite().then(setClientes).catch((e) => console.error("Erro ao buscar clientes:", e));
  }, []);

  // Busca tolerante (sem acento, com erro de digitação): situação, tipo e agência valem antes
  const resultadoBusca = useMemo(
    () => filtrarIdeias(ideias, { tipo: filtroTipo, agencia: filtroAgencia, busca, situacao }),
    [ideias, filtroTipo, filtroAgencia, busca, situacao],
  );
  const filtradas = resultadoBusca.itens;

  const totalConcluidas = useMemo(() => ideias.filter((i) => i.concluida_em).length, [ideias]);

  // Contagem por tipo respeitando o filtro de agência e a situação (o de tipo não, senão as abas zerariam)
  const contagem = useMemo(() => {
    const c: Record<string, number> = { todos: 0 };
    ideias.forEach((i) => {
      if (filtroAgencia !== "todas" && i.agencia !== filtroAgencia) return;
      if (!!i.concluida_em !== (situacao === "concluidas")) return;
      c.todos += 1;
      c[i.tipo] = (c[i.tipo] || 0) + 1;
    });
    return c;
  }, [ideias, filtroAgencia, situacao]);

  const nomeCliente = (id: string | null) => clientes.find((c) => c.id === id)?.nome;

  const alternarConclusao = async (ideia: Ideia, concluir: boolean) => {
    const antes = { concluida_em: ideia.concluida_em, concluida_por: ideia.concluida_por };
    const depois = concluir
      ? { concluida_em: new Date().toISOString(), concluida_por: "manual" as const }
      : { concluida_em: null, concluida_por: null };
    setIdeias((prev) => prev.map((i) => (i.id === ideia.id ? { ...i, ...depois } : i)));
    try {
      await marcarConcluida(ideia.id, concluir);
      toast.success(concluir ? `"${ideia.titulo}" concluída` : `"${ideia.titulo}" voltou para as abertas`, {
        action: { label: "Desfazer", onClick: () => alternarConclusao({ ...ideia, ...depois }, !concluir) },
      });
    } catch (e: any) {
      setIdeias((prev) => prev.map((i) => (i.id === ideia.id ? { ...i, ...antes } : i)));
      toast.error(mensagemErro(e));
    }
  };

  // Ideia já enviada: o botão vira "Já enviada" e pergunta se é para tirar o card do Kanban
  const retirar = async () => {
    if (!retirando) return;
    const ideia = retirando;
    setRetirando(null);
    try {
      await retirarDasDemandas(ideia);
      setIdeias((prev) => prev.map((i) => (i.id === ideia.id ? { ...i, demanda_id: null } : i)));
      toast.success(`"${ideia.titulo}" saiu da aba de Demandas`);
    } catch (e: any) {
      toast.error(mensagemErro(e));
      load();
    }
  };

  const excluir = async () => {
    if (!toDelete) return;
    try {
      await excluirIdeia(toDelete.id);
      setIdeias((prev) => prev.filter((i) => i.id !== toDelete.id));
      toast.success("Ideia removida");
    } catch (e: any) {
      toast.error(mensagemErro(e));
    }
    setToDelete(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ideias</h1>
          <p className="text-muted-foreground text-sm">
            Ideias de implementação para este sistema, outros sistemas ou clientes. Quando chegar a hora, envie para as demandas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
            {(["abertas", "concluidas"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSituacao(s)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                  situacao === s ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s === "concluidas" && <CheckCircle2 size={14} className="text-emerald-500" />}
                {s === "abertas" ? "Abertas" : "Concluídas"}
                <Badge variant="secondary" className="px-1.5 h-4 text-[10px] leading-none">
                  {s === "abertas" ? ideias.length - totalConcluidas : totalConcluidas}
                </Badge>
              </button>
            ))}
          </div>
          <Button className="gap-2" onClick={() => setDialog({})}>
            <Plus size={18} /> Adicionar ideia
          </Button>
        </div>
      </div>

      {erro && (
        <Card className="border-destructive/40"><CardContent className="p-4 text-sm text-destructive">{erro}</CardContent></Card>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Tabs value={filtroTipo} onValueChange={setFiltroTipo} className="flex-1 min-w-0">
            <TabsList className="w-full justify-start overflow-x-auto h-auto p-1 bg-muted/50">
              <TabsTrigger value="todos" className="gap-2 shrink-0">
                Todas <Badge variant="secondary" className="px-1.5 h-4 text-[10px] leading-none">{contagem.todos || 0}</Badge>
              </TabsTrigger>
              {categorias.map((t) => (
                <TabsTrigger key={t.id} value={t.id} className="gap-2 shrink-0">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.hex }} />
                  {t.label}
                  <Badge variant="secondary" className="px-1.5 h-4 text-[10px] leading-none">{contagem[t.id] || 0}</Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setGerenciandoCategorias(true)} title="Criar, renomear, reordenar ou excluir categorias">
            <Plus size={14} /> Categoria
          </Button>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <Input placeholder="Buscar por nome, descrição ou link..." className="pl-10" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <Select value={filtroAgencia} onValueChange={setFiltroAgencia}>
            <SelectTrigger className="sm:w-[200px]"><SelectValue placeholder="Agência" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as agências</SelectItem>
              {agencias.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: a.hex }} />
                    {a.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!loading && resultadoBusca.modo === "parecidos" && <MensagemBusca resultado={resultadoBusca} className="-mb-3" />}
      {filtradas.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
          <div className="bg-muted rounded-full p-4"><Lightbulb size={36} className="text-muted-foreground" /></div>
          {resultadoBusca.modo === "nenhum" ? (
            <MensagemBusca resultado={resultadoBusca} className="text-lg font-medium text-foreground" />
          ) : (
            <>
              <h3 className="text-lg font-medium">
                {situacao === "concluidas" ? "Nenhuma ideia concluída ainda" : ideias.length === 0 ? "Nenhuma ideia ainda" : "Nenhuma ideia nesse filtro"}
              </h3>
              <p className="text-muted-foreground max-w-xs text-sm">
                {situacao === "concluidas"
                  ? "Conclua pelo botão ✓ no card, ou movendo para Feito a demanda criada a partir da ideia."
                  : "Anote a ideia agora; quando for a hora, ela vira demanda com um clique."}
              </p>
              {situacao === "abertas" && <Button onClick={() => setDialog({})}>Adicionar a primeira ideia</Button>}
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtradas.map((ideia) => {
            const tipo = tipoIdeiaMeta(ideia.tipo, categorias);
            const ag = ideia.agencia ? agenciaMeta(ideia.agencia) : undefined;
            const cliente = ideia.tipo === CATEGORIA_CLIENTE ? nomeCliente(ideia.cliente_id) : undefined;
            return (
              <Card key={ideia.id} className={cn("overflow-hidden group flex flex-col", ideia.concluida_em && "opacity-90")}>
                <div className="h-2 w-full" style={{ backgroundColor: tipo.hex }} />
                <div className="p-4 pb-2 space-y-2 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge className="text-[10px] h-5 text-white border-transparent" style={{ backgroundColor: tipo.hex }}>{tipo.label}</Badge>
                    {ag && (
                      <Badge variant="outline" className="text-[10px] h-5" style={agenciaBadgeStyle(ag.hex)}>{ag.label}</Badge>
                    )}
                    {ideia.demanda_id && (
                      <Badge variant="outline" className="text-[10px] h-5 gap-1 text-emerald-600 border-emerald-600/40" title="Já existe uma demanda criada a partir desta ideia">
                        <CheckCircle2 size={10} /> Nas demandas
                      </Badge>
                    )}
                  </div>
                  <h3 className={cn("font-semibold leading-snug", ideia.concluida_em && "line-through decoration-emerald-500/60")}>{ideia.titulo}</h3>
                  {ideia.concluida_em && (
                    <p className="flex items-center gap-1 text-[11px] text-emerald-600">
                      <CheckCircle2 size={11} /> Concluída em {format(new Date(ideia.concluida_em), "dd/MM/yyyy")}
                      {ideia.concluida_por === "demanda" ? " (demanda em Feito)" : ""}
                    </p>
                  )}
                  {cliente && <p className="text-[11px] text-muted-foreground">Cliente: {cliente}</p>}
                  {ideia.descricao && <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-line">{ideia.descricao}</p>}
                  {ideia.links.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {ideia.links.map((l) => (
                        <a
                          key={l}
                          href={l}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                          title={l}
                        >
                          <ExternalLink size={10} /> {dominioDoLink(l)}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                <CardContent className="p-4 pt-2 mt-auto">
                  <div className="flex items-center gap-1.5">
                    {ideia.concluida_em ? (
                      <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={() => alternarConclusao(ideia, false)} title="Volta para as ideias abertas">
                        <RotateCcw size={14} /> Desmarcar como concluída
                      </Button>
                    ) : (
                      <>
                        {ideia.demanda_id ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 gap-1.5 text-emerald-600 border-emerald-600/40 bg-emerald-500/10 hover:bg-emerald-500/15 hover:text-emerald-700"
                            onClick={() => setRetirando(ideia)}
                            title="Clique para retirar da aba de Demandas"
                          >
                            <CheckCircle2 size={14} /> Já enviada para demandas
                          </Button>
                        ) : (
                          <Button size="sm" className="flex-1 gap-1.5" onClick={() => setEnviando(ideia)}>
                            <SquareKanban size={14} /> Enviar para demandas
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-600 hover:bg-emerald-500/10"
                          onClick={() => alternarConclusao(ideia, true)}
                          title="Concluir ideia"
                        >
                          <Check size={15} />
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setDialog({ ideia })} title="Editar"><Pencil size={14} /></Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => setToDelete(ideia)} title="Remover"><Trash2 size={14} /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <IdeiaDialog state={dialog} clientes={clientes} onClose={() => setDialog(null)} onSaved={load} />

      <CategoriasIdeiasDialog open={gerenciandoCategorias} onOpenChange={setGerenciandoCategorias} />

      <EnviarParaDemandasDialog
        ideia={enviando}
        onClose={() => setEnviando(null)}
        onEnviada={(demandaId, coluna) => {
          setIdeias((prev) => prev.map((i) => (i.id === enviando?.id ? { ...i, demanda_id: demandaId } : i)));
          toast.success(`Demanda criada em "${coluna.title}"`, {
            action: { label: "Ver demandas", onClick: () => navigate({ to: "/" }) },
          });
        }}
      />

      <AlertDialog open={!!retirando} onOpenChange={(o) => { if (!o) setRetirando(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirar "{retirando?.titulo}" da aba de Demandas?</AlertDialogTitle>
            <AlertDialogDescription>O card sai do Kanban e a ideia continua aqui, pronta para ser enviada de novo quando quiser.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={retirar}>Retirar das demandas</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover "{toDelete?.titulo}"?</AlertDialogTitle>
            <AlertDialogDescription>A ideia sai da lista. Demandas já criadas a partir dela continuam no Kanban.</AlertDialogDescription>
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
