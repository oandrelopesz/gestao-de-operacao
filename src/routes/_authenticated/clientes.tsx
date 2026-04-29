import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import {
  Plus, Search, Users as UsersIcon, DollarSign, TrendingUp, Smile,
  Pencil, Archive, Trash2, LayoutGrid, Table as TableIcon, Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ClientForm, ClientFormValues } from "@/components/ClientForm";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AGENCIAS, AgenciaId, formatBRL, tempoDeCasa,
  NPS_STATUS_META, PAGAMENTO_META,
} from "@/lib/clientes";
import { cn } from "@/lib/utils";

type SearchParams = { agencia?: AgenciaId; view?: "cards" | "tabela" };

export const Route = createFileRoute("/_authenticated/clientes")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    agencia: (["effect", "spike", "alt", "pessoais"].includes(search.agencia as string)
      ? (search.agencia as AgenciaId)
      : "effect"),
    view: search.view === "tabela" ? "tabela" : "cards",
  }),
  component: ClientesPage,
});

interface ClienteView {
  id: string;
  nome: string;
  agencia: AgenciaId;
  nicho: string | null;
  data_inicio: string;
  verba_ads: number;
  observacoes: string | null;
  arquivado: boolean;
  ultima_nps_score: number | null;
  ultima_nps_data: string | null;
  nps_status: "ancora" | "saudavel" | "em_risco" | "critico" | "sem_avaliacao";
  demandas_ativas: number;
  status_pagamento_mes: "em_dia" | "pendente" | "atrasado" | null;
}

function ClientesPage() {
  const { agencia, view } = Route.useSearch();
  const navigate = Route.useNavigate();

  const [clientes, setClientes] = useState<ClienteView[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ClienteView | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchClientes(); }, []);

  const fetchClientes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("clientes_view" as any)
      .select("*")
      .eq("arquivado", false)
      .order("nome");
    if (error) { toast.error("Erro ao carregar clientes"); console.error(error); }
    else setClientes((data as any) || []);
    setLoading(false);
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { effect: 0, spike: 0, alt: 0, pessoais: 0 };
    clientes.forEach((cli) => { c[cli.agencia] = (c[cli.agencia] || 0) + 1; });
    return c;
  }, [clientes]);

  const filtered = useMemo(() => {
    return clientes
      .filter((c) => c.agencia === agencia)
      .filter((c) => statusFilter === "all" || c.nps_status === statusFilter)
      .filter((c) => !search || c.nome.toLowerCase().includes(search.toLowerCase()));
  }, [clientes, agencia, statusFilter, search]);

  const metrics = useMemo(() => {
    const list = clientes.filter((c) => c.agencia === agencia);
    const total = list.length;
    const verbaTotal = list.reduce((s, c) => s + Number(c.verba_ads || 0), 0);
    const verbaMedia = total > 0 ? verbaTotal / total : 0;
    const promotores = list.filter((c) => c.nps_status === "promotor").length;
    const neutros = list.filter((c) => c.nps_status === "neutro").length;
    const detratores = list.filter((c) => c.nps_status === "detrator").length;
    return { total, verbaTotal, verbaMedia, promotores, neutros, detratores };
  }, [clientes, agencia]);

  const agenciaMeta = AGENCIAS.find((a) => a.id === agencia)!;

  const handleSave = async (values: ClientFormValues) => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      if (editing) {
        const { error } = await supabase.from("clientes")
          .update({ ...values } as any).eq("id", editing.id);
        if (error) throw error;
        toast.success("Cliente atualizado");
      } else {
        const { error } = await supabase.from("clientes").insert([{
          ...values,
          user_id: user.id,
        }] as any);
        if (error) throw error;
        toast.success("Cliente criado");
      }
      setModalOpen(false);
      setEditing(null);
      fetchClientes();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (id: string) => {
    const { error } = await supabase.from("clientes")
      .update({ arquivado: true } as any).eq("id", id);
    if (error) toast.error("Erro ao arquivar");
    else { toast.success("Cliente arquivado"); fetchClientes(); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deletar este cliente? Esta ação não pode ser desfeita.")) return;
    const { error } = await supabase.from("clientes").delete().eq("id", id);
    if (error) toast.error("Erro ao deletar");
    else { toast.success("Cliente deletado"); fetchClientes(); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes Ativos</h1>
          <p className="text-muted-foreground">Visão por agência, com NPS e financeiro consolidados.</p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(v) => navigate({ search: { agencia, view: v as any } })}>
            <TabsList>
              <TabsTrigger value="cards" className="gap-1.5"><LayoutGrid size={14} />Cards</TabsTrigger>
              <TabsTrigger value="tabela" className="gap-1.5"><TableIcon size={14} />Tabela</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button className="gap-2" onClick={() => { setEditing(null); setModalOpen(true); }}>
            <Plus size={16} /> Novo cliente
          </Button>
        </div>
      </div>

      {/* Sub-tabs por agência */}
      <Tabs value={agencia} onValueChange={(v) => navigate({ search: { view, agencia: v as AgenciaId } })}>
        <TabsList>
          {AGENCIAS.map((a) => (
            <TabsTrigger key={a.id} value={a.id} className="gap-2">
              {a.label}
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{counts[a.id] || 0}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Métricas */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={<UsersIcon size={16} />} label="Clientes ativos" value={String(metrics.total)} hint={`Agência ${agenciaMeta.label}`} />
        <MetricCard icon={<DollarSign size={16} />} label="Verba total / mês" value={formatBRL(metrics.verbaTotal)} hint="Soma das verbas" />
        <MetricCard icon={<TrendingUp size={16} />} label="Verba média / cliente" value={formatBRL(metrics.verbaMedia)} hint="Por cliente ativo" />
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Distribuição NPS</CardTitle>
            <Smile size={16} className="text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2 text-sm">
              <span className="text-emerald-600 font-bold text-lg">{metrics.promotores}</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-amber-600 font-bold text-lg">{metrics.neutros}</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-red-600 font-bold text-lg">{metrics.detratores}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Promotores / Neutros / Detratores</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status NPS</SelectItem>
            <SelectItem value="promotor">Promotores</SelectItem>
            <SelectItem value="neutro">Neutros</SelectItem>
            <SelectItem value="detrator">Detratores</SelectItem>
            <SelectItem value="sem_avaliacao">Sem avaliação</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-56 rounded-lg bg-muted/40 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-lg bg-muted/20">
          <UsersIcon size={36} className="text-muted-foreground mb-3 opacity-50" />
          <h3 className="text-lg font-semibold">Nenhum cliente em {agenciaMeta.label}</h3>
          <p className="text-muted-foreground mb-4 text-sm">Cadastre o primeiro cliente desta agência.</p>
          <Button className="gap-2" onClick={() => { setEditing(null); setModalOpen(true); }}>
            <Plus size={16} /> Novo cliente
          </Button>
        </div>
      ) : view === "cards" ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((c) => (
            <ClienteCard
              key={c.id}
              cliente={c}
              borderClass={agenciaMeta.border}
              onEdit={() => { setEditing(c); setModalOpen(true); }}
              onArchive={() => handleArchive(c.id)}
              onDelete={() => handleDelete(c.id)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Nicho</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Verba/mês</TableHead>
                <TableHead>NPS</TableHead>
                <TableHead>Demandas</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const nps = NPS_STATUS_META[c.nps_status];
                const pag = c.status_pagamento_mes ? PAGAMENTO_META[c.status_pagamento_mes] : null;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.nome}</TableCell>
                    <TableCell className="text-muted-foreground">{c.nicho || "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{tempoDeCasa(c.data_inicio)}</TableCell>
                    <TableCell>{formatBRL(c.verba_ads)}</TableCell>
                    <TableCell><Badge variant="outline" className={cn("font-normal", nps.classes)}>{nps.label}</Badge></TableCell>
                    <TableCell>{c.demandas_ativas}</TableCell>
                    <TableCell>{pag ? <Badge variant="outline" className={cn("font-normal", pag.classes)}>{pag.label}</Badge> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => { setEditing(c); setModalOpen(true); }}><Pencil size={14} /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={(o) => { setModalOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cliente" : "Novo cliente"}</DialogTitle>
            <DialogDescription>Preencha os dados do cliente. O status é calculado a partir do NPS.</DialogDescription>
          </DialogHeader>
          <ClientForm
            loading={saving}
            onSubmit={handleSave}
            initialValues={editing ? {
              nome: editing.nome,
              agencia: editing.agencia,
              nicho: editing.nicho || "",
              data_inicio: editing.data_inicio,
              verba_ads: Number(editing.verba_ads || 0),
              observacoes: editing.observacoes || "",
            } : { agencia }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </CardContent>
    </Card>
  );
}

function ClienteCard({
  cliente, borderClass, onEdit, onArchive, onDelete,
}: {
  cliente: ClienteView;
  borderClass: string;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const nps = NPS_STATUS_META[cliente.nps_status];
  const pag = cliente.status_pagamento_mes ? PAGAMENTO_META[cliente.status_pagamento_mes] : null;
  const obsTrim = cliente.observacoes && cliente.observacoes.length > 110
    ? cliente.observacoes.slice(0, 110) + "…"
    : cliente.observacoes;

  return (
    <Card className={cn("border-l-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-default flex flex-col", borderClass)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold truncate">{cliente.nome}</CardTitle>
            {cliente.nicho && <p className="text-xs text-muted-foreground mt-0.5 truncate">{cliente.nicho}</p>}
          </div>
          <Badge variant="outline" className={cn("font-normal text-[10px] shrink-0", nps.classes)}>
            <span className={cn("w-1.5 h-1.5 rounded-full mr-1", nps.dot)} />
            {nps.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3 pb-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground flex items-center gap-1"><Calendar size={11} />{tempoDeCasa(cliente.data_inicio)}</span>
          <span className="text-muted-foreground">desde {new Date(cliente.data_inicio).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}</span>
        </div>

        <div className="rounded-md bg-muted/40 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Verba de ads / mês</p>
          <p className="text-lg font-bold">{formatBRL(cliente.verba_ads)}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Última NPS</p>
            <p className="font-medium">
              {cliente.ultima_nps_nota !== null
                ? <>Nota {cliente.ultima_nps_nota} <span className="text-muted-foreground font-normal">· {cliente.ultima_nps_data ? new Date(cliente.ultima_nps_data).toLocaleDateString("pt-BR") : ""}</span></>
                : <span className="text-muted-foreground">—</span>}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Demandas ativas</p>
            <p className="font-medium">{cliente.demandas_ativas}</p>
          </div>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Pagamento do mês</p>
          {pag ? (
            <Badge variant="outline" className={cn("font-normal", pag.classes)}>{pag.label}</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">Sem registro</span>
          )}
        </div>

        {obsTrim && (
          <div className="text-xs text-muted-foreground border-t pt-2 leading-relaxed">{obsTrim}</div>
        )}
      </CardContent>
      <div className="flex items-center justify-end gap-1 px-4 py-2 border-t bg-muted/20">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} title="Editar"><Pencil size={13} /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onArchive} title="Arquivar"><Archive size={13} /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={onDelete} title="Deletar"><Trash2 size={13} /></Button>
      </div>
    </Card>
  );
}
