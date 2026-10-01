// Aba Google Meu Negócio (Fase 1: perfis à mão, contexto e prévias; nada é publicado).
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, MapPin, Plus } from "lucide-react";
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
  ABA_LIBERADA, PUBLICACAO_LIBERADA, criarPerfil, fetchClientesOpcoes, fetchPerfis, fetchUltimosPosts, salvarPerfil, traduzErroGmn,
  type ClienteOpcao, type PerfilGmn, type UltimoPost,
} from "@/lib/gmn";
import { PerfilGaveta } from "@/components/gmn/PerfilGaveta";
import { resumoAgenda } from "../../../supabase/functions/gmn/regras.ts";

export const Route = createFileRoute("/_authenticated/gmn")({ component: GmnPage });

type Filtro = "todos" | "ativos" | "desligados" | "erro" | "saude" | "sem_acesso" | "sem_briefing";
const FILTROS: { v: Filtro; rotulo: string }[] = [
  { v: "todos", rotulo: "Todos" }, { v: "ativos", rotulo: "Ativos" }, { v: "desligados", rotulo: "Desligados" },
  { v: "erro", rotulo: "Com erro" }, { v: "saude", rotulo: "Saúde" }, { v: "sem_acesso", rotulo: "Sem acesso" },
  { v: "sem_briefing", rotulo: "Sem contexto" },
];
const SEM_CLIENTE = "__sem__";

// Estado do último post, no feminino (prévia) e no masculino (post).
const ESTADO_POST: Record<UltimoPost["status"], [string, string]> = {
  gerado: ["gerada", "gerado"], pulado: ["pulada", "pulado"], erro: ["com erro", "com erro"],
  publicado: ["publicada", "publicado"], agendado: ["agendada", "agendado"], gerando: ["em geração", "em geração"],
};
const FORMATO_DIA_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** "Última prévia gerada em 30/09 21:40" (prévia no feminino; os demais casos são "post"). */
function textoUltimoPost(u: UltimoPost): string {
  const previa = u.origem === "previa";
  const p = Object.fromEntries(FORMATO_DIA_HORA.formatToParts(new Date(u.created_at)).map((x) => [x.type, x.value]));
  return `${previa ? "Última prévia" : "Último post"} ${ESTADO_POST[u.status][previa ? 0 : 1]} em ${p.day}/${p.month} ${p.hour}:${p.minute}`;
}
const comProblema = (u?: UltimoPost) => u?.status === "erro" || u?.status === "pulado";

/** Fase 1: no site publicado a aba só mostra o aviso e não toca no banco; os hooks ficam em GmnConteudo. */
function GmnPage() {
  if (!ABA_LIBERADA) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><MapPin className="h-6 w-6" />Google Meu Negócio</h1>
        <p className="text-sm text-muted-foreground">Em preparação: esta aba será liberada quando a API do Google for aprovada.</p>
      </div>
    );
  }
  return <GmnConteudo />;
}

function GmnConteudo() {
  const [perfis, setPerfis] = useState<PerfilGmn[]>([]);
  const [clientes, setClientes] = useState<ClienteOpcao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [novo, setNovo] = useState<{ nome: string; cliente_id: string | null } | null>(null);
  const [criando, setCriando] = useState(false);
  const [ultimos, setUltimos] = useState<Record<string, UltimoPost>>({});

  const carregar = useCallback(async () => {
    try {
      const [p, c, u] = await Promise.all([fetchPerfis(), fetchClientesOpcoes(), fetchUltimosPosts()]);
      setPerfis(p);
      setClientes(c);
      setUltimos(u);
      setErro(null);
    } catch (e) {
      setErro(traduzErroGmn(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const visiveis = useMemo(() => perfis.filter((p) =>
    filtro === "ativos" ? p.ativo : filtro === "desligados" ? !p.ativo : filtro === "erro" ? comProblema(ultimos[p.id])
      : filtro === "saude" ? p.saude : filtro === "sem_acesso" ? p.sem_acesso
        : filtro === "sem_briefing" ? !p.briefing_salvo_em : true), [perfis, filtro, ultimos]);
  const nomeCliente = (id: string | null) => clientes.find((c) => c.id === id)?.nome ?? null;
  const aberto = perfis.find((p) => p.id === abertoId) ?? null;

  async function alternar(p: PerfilGmn, ativo: boolean) {
    if (ativo && !p.briefing_salvo_em) {
      toast.error("Salve o contexto antes de ligar o perfil.");
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
    if (criando || !novo) return;
    if (!novo.nome.trim()) return toast.error("Informe o nome do perfil.");
    setCriando(true);
    try {
      const p = await criarPerfil(novo.nome, novo.cliente_id);
      setNovo(null);
      await carregar();
      setAbertoId(p.id);
    } catch (e) {
      toast.error(traduzErroGmn(e));
    } finally {
      setCriando(false);
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
        {visiveis.map((p) => {
          const u = ultimos[p.id];
          return (
            <Card key={p.id} role="button" tabIndex={0}
              className={cn("cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", p.sem_acesso && "opacity-60")}
              onClick={() => setAbertoId(p.id)}
              onKeyDown={(e) => {
                // só quando o foco está no próprio card (o interruptor de dentro trata o Espaço sozinho)
                if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setAbertoId(p.id); }
              }}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.nome}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {nomeCliente(p.cliente_id) ?? "Sem cliente"} · {resumoAgenda(p.agenda)}
                    {p.briefing_salvo_em ? "" : " · sem contexto"}
                  </p>
                  {u && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground" title={u.erro ?? undefined}>
                      {comProblema(u) && <Badge variant="destructive" className="h-5 shrink-0 px-1.5 text-[10px]">{u.status === "erro" ? "Erro" : "Pulado"}</Badge>}
                      <span className="truncate">{textoUltimoPost(u)}</span>
                    </p>
                  )}
                </div>
                {p.saude && <Badge variant="outline">Saúde</Badge>}
                {p.sem_acesso && <Badge variant="destructive">Sem acesso</Badge>}
                <label className="flex items-center gap-2 text-sm" onClick={(e) => e.stopPropagation()}>
                  <Switch checked={p.ativo} disabled={!PUBLICACAO_LIBERADA} onCheckedChange={(v) => alternar(p, v)} aria-label={`Posts de ${p.nome}`} />
                  {p.ativo ? "Ligado" : "Desligado"}
                </label>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <PerfilGaveta perfil={aberto} clientes={clientes} aberto={!!aberto} onFechar={() => setAbertoId(null)} onMudou={carregar} />

      <Dialog open={!!novo} onOpenChange={(v) => !v && !criando && setNovo(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo perfil</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="gmn-novo-nome">Nome (como está no Google)</Label>
              <Input id="gmn-novo-nome" autoFocus value={novo?.nome ?? ""} onChange={(e) => novo && setNovo({ ...novo, nome: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); criar(); } }} />
            </div>
            <div className="space-y-1.5">
              <Label>Cliente do sistema (opcional)</Label>
              <Select value={novo?.cliente_id ?? SEM_CLIENTE} onValueChange={(v) => novo && setNovo({ ...novo, cliente_id: v === SEM_CLIENTE ? null : v })}>
                <SelectTrigger aria-label="Cliente do sistema (opcional)"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_CLIENTE}>Sem cliente</SelectItem>
                  {clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovo(null)} disabled={criando}>Cancelar</Button>
            <Button onClick={criar} disabled={criando}>
              {criando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
