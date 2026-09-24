import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Check, ChevronDown, Link2, Loader2, Map as MapIcon, Plus, Search, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ClientePicker } from "@/components/demandas/ClientePicker";
import { cn } from "@/lib/utils";
import { progresso } from "@/lib/processos";
import { criarProcesso, fetchProcessos, fetchTemplates, type Processo, type Template } from "@/lib/processosService";

const erroMsg = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as any).message) : "Erro ao salvar");

/** Valor do Select para "sem template". */
const SEM_TEMPLATE = "__nenhum__";

interface DemandaParaRoadmap {
  id: string;
  titulo: string;
  cliente_id: string | null;
  pessoal?: boolean;
}

interface Dono { cliente_id: string | null; pessoal: boolean }

interface EnviarParaRoadmapDialogProps {
  demanda: DemandaParaRoadmap | null;
  clientes: { id: string; nome: string; agencia?: string }[];
  onClose: () => void;
  /** Grava `roadmap_id` na demanda (e atualiza o card). Devolve false se falhou. */
  onDefinirRoadmap: (demandaId: string, roadmapId: string) => Promise<boolean>;
}

/** Envia uma demanda para o Roadmap: cria um roadmap novo a partir dela ou liga a um existente. */
export function EnviarParaRoadmapDialog({ demanda, clientes, onClose, onDefinirRoadmap }: EnviarParaRoadmapDialogProps) {
  const navigate = useNavigate();
  const aberto = !!demanda;
  const [aba, setAba] = useState<"criar" | "ligar">("criar");
  const [salvando, setSalvando] = useState(false);

  // Criar
  const [nome, setNome] = useState("");
  const [dono, setDono] = useState<Dono | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState(SEM_TEMPLATE);

  // Ligar
  const [roadmaps, setRoadmaps] = useState<Processo[] | null>(null);
  const [erroRoadmaps, setErroRoadmaps] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [escolhido, setEscolhido] = useState<string | null>(null);

  // Abrir: preenche com os dados da demanda e carrega templates + roadmaps ativos
  const requisicao = useRef(0);
  useEffect(() => {
    if (!demanda) return;
    const minha = ++requisicao.current;
    setAba("criar");
    setNome(demanda.titulo || "");
    // Roadmap é de um cliente ou Pessoal; demanda sem nenhum dos dois → a pessoa escolhe
    setDono(demanda.pessoal ? { cliente_id: null, pessoal: true } : demanda.cliente_id ? { cliente_id: demanda.cliente_id, pessoal: false } : null);
    setTemplateId(SEM_TEMPLATE);
    setTemplates([]);
    setRoadmaps(null);
    setErroRoadmaps(null);
    setBusca("");
    setMostrarTodos(!demanda.pessoal && !demanda.cliente_id);
    setEscolhido(null);
    fetchTemplates("roadmap")
      .then((t) => { if (minha === requisicao.current) setTemplates(t); })
      .catch(() => { /* template é opcional */ });
    fetchProcessos("roadmap", "ativos")
      .then((r) => { if (minha === requisicao.current) setRoadmaps(r); })
      .catch((e) => { if (minha === requisicao.current) setErroRoadmaps(erroMsg(e)); });
    // Só reabre quando muda a demanda (id); edições do card não resetam o formulário
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demanda?.id]);

  const nomeDono = (d: { cliente_id: string | null; pessoal: boolean } | null, nomeEmbed?: string | null) => {
    if (!d) return null;
    if (d.pessoal) return "Pessoal";
    return clientes.find((c) => c.id === d.cliente_id)?.nome ?? nomeEmbed ?? "Cliente";
  };

  const filtrados = useMemo(() => {
    if (!roadmaps || !demanda) return [];
    const q = busca.trim().toLowerCase();
    const temDono = !!demanda.pessoal || !!demanda.cliente_id;
    return roadmaps
      .filter((r) => {
        if (!mostrarTodos && temDono) {
          if (demanda.pessoal ? !r.pessoal : r.cliente_id !== demanda.cliente_id) return false;
        }
        if (!q) return true;
        const donoTxt = r.pessoal ? "pessoal" : (r.cliente?.nome ?? "");
        return r.nome.toLowerCase().includes(q) || donoTxt.toLowerCase().includes(q);
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [roadmaps, demanda, busca, mostrarTodos]);

  const abrirRoadmap = (id: string) => navigate({ to: "/roadmap", search: { id } });

  const podeCriar = !!nome.trim() && !!dono && !salvando;

  const criar = async () => {
    if (!demanda || !dono || !podeCriar) return;
    setSalvando(true);
    try {
      const id = await criarProcesso({
        tipo: "roadmap",
        cliente_id: dono.pessoal ? null : dono.cliente_id,
        pessoal: dono.pessoal,
        nome: nome.trim(),
        template_id: templateId === SEM_TEMPLATE ? null : templateId,
      });
      const ok = await onDefinirRoadmap(demanda.id, id);
      if (!ok) return;
      toast.success("Roadmap criado — defina os passos quando quiser", {
        action: { label: "Abrir", onClick: () => abrirRoadmap(id) },
      });
      onClose();
    } catch (e) {
      toast.error(erroMsg(e));
    } finally {
      setSalvando(false);
    }
  };

  const ligar = async () => {
    if (!demanda || !escolhido || salvando) return;
    setSalvando(true);
    try {
      const ok = await onDefinirRoadmap(demanda.id, escolhido);
      if (!ok) return;
      const r = roadmaps?.find((x) => x.id === escolhido);
      toast.success(`Demanda ligada ao roadmap "${r?.nome ?? ""}"`, {
        action: { label: "Abrir", onClick: () => abrirRoadmap(escolhido) },
      });
      onClose();
    } catch (e) {
      toast.error(erroMsg(e));
    } finally {
      setSalvando(false);
    }
  };

  const temDonoDemanda = !!demanda?.pessoal || !!demanda?.cliente_id;

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o && !salvando) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><MapIcon size={18} /> Enviar para o Roadmap</DialogTitle>
          <DialogDescription>Crie um roadmap a partir desta demanda ou ligue-a a um roadmap que já existe.</DialogDescription>
        </DialogHeader>

        <Tabs value={aba} onValueChange={(v) => setAba(v as "criar" | "ligar")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="criar">Criar roadmap</TabsTrigger>
            <TabsTrigger value="ligar">Ligar a existente</TabsTrigger>
          </TabsList>

          {/* Criar */}
          <TabsContent value="criar" className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="enviar-roadmap-nome" className="text-xs">Nome do roadmap</Label>
              <Input
                id="enviar-roadmap-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); criar(); } }}
                placeholder="Ex.: Landing page"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Cliente</Label>
              <div>
                <ClientePicker
                  clientes={clientes}
                  clienteIdAtual={dono?.cliente_id ?? null}
                  pessoalAtual={dono?.pessoal}
                  permitirSemCliente={false}
                  onEscolher={(valor) => setDono(valor.pessoal || valor.cliente_id ? valor : null)}
                >
                  <Button variant="outline" className={cn("w-full justify-between font-normal", !dono && "text-muted-foreground")}>
                    <span className="inline-flex min-w-0 items-center gap-2 truncate">
                      <User size={14} className={dono?.pessoal ? "text-violet-500" : undefined} />
                      {nomeDono(dono) ?? "Escolha o cliente ou Pessoal"}
                    </span>
                    <ChevronDown size={14} className="shrink-0 opacity-50" />
                  </Button>
                </ClientePicker>
              </div>
              {!dono && (
                <p className="text-xs text-muted-foreground">A demanda não tem cliente — escolha um cliente ou Pessoal para o roadmap.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Template <span className="font-normal text-muted-foreground">(opcional)</span></Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_TEMPLATE}>Sem template — começar do zero</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nome} · {t.passos.length} {t.passos.length === 1 ? "passo" : "passos"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
              <Button onClick={criar} disabled={!podeCriar} className="gap-1.5">
                {salvando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Criar roadmap
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* Ligar a existente */}
          <TabsContent value="ligar" className="space-y-3 pt-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar roadmap…" className="pl-8" />
              </div>
              {temDonoDemanda && (
                <Button variant="ghost" size="sm" className="shrink-0 text-xs" onClick={() => setMostrarTodos((v) => !v)}>
                  {mostrarTodos ? `Só ${nomeDono({ cliente_id: demanda?.cliente_id ?? null, pessoal: !!demanda?.pessoal })}` : "Mostrar todos"}
                </Button>
              )}
            </div>

            {erroRoadmaps ? (
              <p className="text-sm text-destructive">{erroRoadmaps}</p>
            ) : !roadmaps ? (
              <div className="flex justify-center py-8">
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
              </div>
            ) : filtrados.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                {busca.trim()
                  ? "Nenhum roadmap encontrado."
                  : !mostrarTodos && temDonoDemanda
                    ? "Nenhum roadmap ativo deste cliente — use \"Mostrar todos\" ou crie um novo."
                    : "Nenhum roadmap ativo."}
              </p>
            ) : (
              <ol className="-mx-1 max-h-64 space-y-1.5 overflow-y-auto px-1">
                {filtrados.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setEscolhido(r.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                        escolhido === r.id ? "border-primary bg-primary/5" : "border-border/70 hover:bg-muted/40",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{r.nome}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {nomeDono({ cliente_id: r.cliente_id, pessoal: r.pessoal }, r.cliente?.nome)} · {progresso(r.passos)}%
                        </span>
                      </span>
                      {escolhido === r.id && <Check size={14} className="shrink-0 text-primary" />}
                    </button>
                  </li>
                ))}
              </ol>
            )}

            <DialogFooter>
              <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
              <Button onClick={ligar} disabled={!escolhido || salvando} className="gap-1.5">
                {salvando ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                Ligar
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
