// Aba Google Meu Negócio (Fase 1: perfis à mão, briefing e prévias; nada é publicado).
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  PUBLICACAO_LIBERADA, criarPerfil, fetchClientesOpcoes, fetchPerfis, salvarPerfil, traduzErroGmn,
  type ClienteOpcao, type PerfilGmn,
} from "@/lib/gmn";
import { PerfilGaveta } from "@/components/gmn/PerfilGaveta";
import { resumoAgenda } from "../../../supabase/functions/gmn/regras.ts";

export const Route = createFileRoute("/_authenticated/gmn")({ component: GmnPage });

type Filtro = "todos" | "ativos" | "desligados" | "saude" | "sem_briefing";
const FILTROS: { v: Filtro; rotulo: string }[] = [
  { v: "todos", rotulo: "Todos" }, { v: "ativos", rotulo: "Ativos" }, { v: "desligados", rotulo: "Desligados" },
  { v: "saude", rotulo: "Saúde" }, { v: "sem_briefing", rotulo: "Sem briefing" },
];
const SEM_CLIENTE = "__sem__";

function GmnPage() {
  const [perfis, setPerfis] = useState<PerfilGmn[]>([]);
  const [clientes, setClientes] = useState<ClienteOpcao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [novo, setNovo] = useState<{ nome: string; cliente_id: string | null } | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([fetchPerfis(), fetchClientesOpcoes()]);
      setPerfis(p);
      setClientes(c);
      setErro(null);
    } catch (e) {
      setErro(traduzErroGmn(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const visiveis = useMemo(() => perfis.filter((p) =>
    filtro === "ativos" ? p.ativo : filtro === "desligados" ? !p.ativo : filtro === "saude" ? p.saude
      : filtro === "sem_briefing" ? !p.briefing_salvo_em : true), [perfis, filtro]);
  const nomeCliente = (id: string | null) => clientes.find((c) => c.id === id)?.nome ?? null;
  const aberto = perfis.find((p) => p.id === abertoId) ?? null;

  async function alternar(p: PerfilGmn, ativo: boolean) {
    if (ativo && !p.briefing_salvo_em) {
      toast.error("Salve o briefing antes de ligar o perfil.");
      setAbertoId(p.id);
      return;
    }
    try {
      await salvarPerfil(p.id, { ativo });
      await carregar();
    } catch (e) {
      toast.error(traduzErroGmn(e));
    }
  }

  async function criar() {
    if (!novo?.nome.trim()) return toast.error("Informe o nome do perfil.");
    try {
      const p = await criarPerfil(novo.nome, novo.cliente_id);
      setNovo(null);
      await carregar();
      setAbertoId(p.id);
    } catch (e) {
      toast.error(traduzErroGmn(e));
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><MapPin className="h-6 w-6" />Google Meu Negócio</h1>
          <p className="text-sm text-muted-foreground">
            Posts automáticos nos perfis dos clientes.
            {!PUBLICACAO_LIBERADA && " Publicação liberada quando a API do Google for aprovada — por enquanto, só prévias."}
          </p>
        </div>
        <Button onClick={() => setNovo({ nome: "", cliente_id: null })}><Plus className="mr-2 h-4 w-4" />Novo perfil</Button>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtro">
        {FILTROS.map((f) => (
          <Button key={f.v} size="sm" variant={filtro === f.v ? "default" : "outline"} aria-pressed={filtro === f.v} onClick={() => setFiltro(f.v)}>
            {f.rotulo}
          </Button>
        ))}
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}
      {carregando && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>}
      {!carregando && !erro && visiveis.length === 0 && <p className="text-sm text-muted-foreground">Nenhum perfil neste filtro.</p>}

      <div className="space-y-2">
        {visiveis.map((p) => (
          <Card key={p.id} className={cn("cursor-pointer transition-colors hover:bg-muted/50", p.sem_acesso && "opacity-60")} onClick={() => setAbertoId(p.id)}>
            <CardContent className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.nome}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {nomeCliente(p.cliente_id) ?? "Sem cliente"} · {resumoAgenda(p.agenda)}
                  {p.briefing_salvo_em ? "" : " · sem briefing"}
                </p>
              </div>
              {p.saude && <Badge variant="outline">Saúde</Badge>}
              {p.sem_acesso && <Badge variant="destructive">Sem acesso</Badge>}
              <label className="flex items-center gap-2 text-sm" onClick={(e) => e.stopPropagation()}>
                <Switch checked={p.ativo} disabled={!PUBLICACAO_LIBERADA} onCheckedChange={(v) => alternar(p, v)} aria-label={`Posts de ${p.nome}`} />
                {p.ativo ? "Ligado" : "Desligado"}
              </label>
            </CardContent>
          </Card>
        ))}
      </div>

      <PerfilGaveta perfil={aberto} clientes={clientes} aberto={!!aberto} onFechar={() => setAbertoId(null)} onMudou={carregar} />

      <Dialog open={!!novo} onOpenChange={(v) => !v && setNovo(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo perfil</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="gmn-novo-nome">Nome (como está no Google)</Label>
              <Input id="gmn-novo-nome" autoFocus value={novo?.nome ?? ""} onChange={(e) => novo && setNovo({ ...novo, nome: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Cliente do sistema (opcional)</Label>
              <Select value={novo?.cliente_id ?? SEM_CLIENTE} onValueChange={(v) => novo && setNovo({ ...novo, cliente_id: v === SEM_CLIENTE ? null : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_CLIENTE}>Sem cliente</SelectItem>
                  {clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovo(null)}>Cancelar</Button>
            <Button onClick={criar}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
