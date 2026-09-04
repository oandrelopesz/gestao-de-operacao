import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import {
  Search, Plus, MoreVertical, Trash2, Pencil, ExternalLink,
  Copy, Eye, EyeOff, Table2, KeyRound, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AGENCIAS } from "@/lib/clientes";

export const Route = createFileRoute("/_authenticated/acessos")({
  component: AcessosPage,
});

type TipoAcesso = "planilha" | "crm";

interface Acesso {
  id: string;
  nome: string;
  agencia: string;
  tipo: TipoAcesso;
  link: string;
  login: string | null;
  senha: string | null;
  observacoes: string | null;
}

interface AcessoForm {
  nome: string;
  agencia: string;
  tipo: TipoAcesso;
  link: string;
  login: string;
  senha: string;
  observacoes: string;
}

const emptyForm: AcessoForm = {
  nome: "",
  agencia: "",
  tipo: "planilha",
  link: "",
  login: "",
  senha: "",
  observacoes: "",
};

const TIPO_META: Record<TipoAcesso, { label: string; icon: React.ReactNode; classes: string }> = {
  planilha: {
    label: "Planilha",
    icon: <Table2 size={12} />,
    classes: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  },
  crm: {
    label: "CRM",
    icon: <KeyRound size={12} />,
    classes: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  },
};

// Garante que o link abra como URL absoluta mesmo se o usuário colar sem protocolo
function normalizeLink(link: string): string {
  const trimmed = link.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

async function copyToClipboard(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copiado`);
  } catch {
    toast.error(`Não foi possível copiar ${label.toLowerCase()}`);
  }
}

function AcessosPage() {
  const [acessos, setAcessos] = useState<Acesso[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [agenciaFilter, setAgenciaFilter] = useState<string>("todos");

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AcessoForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Acesso | null>(null);

  useEffect(() => {
    fetchAcessos();
  }, []);

  const fetchAcessos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("acessos_clientes")
        .select("*")
        .order("nome");
      if (error) throw error;
      setAcessos((data || []) as Acesso[]);
    } catch (error: any) {
      console.error("Erro ao carregar acessos:", error);
      toast.error("Erro ao carregar acessos");
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, agencia: agenciaFilter !== "todos" ? agenciaFilter : "" });
    setIsDialogOpen(true);
  };

  const openEdit = (acesso: Acesso) => {
    setEditingId(acesso.id);
    setForm({
      nome: acesso.nome,
      agencia: acesso.agencia,
      tipo: acesso.tipo,
      link: acesso.link,
      login: acesso.login || "",
      senha: acesso.senha || "",
      observacoes: acesso.observacoes || "",
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome.trim()) {
      toast.error("Informe o nome do cliente");
      return;
    }
    if (!form.agencia) {
      toast.error("Selecione a agência");
      return;
    }
    if (!form.link.trim()) {
      toast.error(form.tipo === "crm" ? "Informe o link do CRM" : "Informe o link da planilha");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const isCrm = form.tipo === "crm";
      const payload = {
        nome: form.nome.trim(),
        agencia: form.agencia,
        tipo: form.tipo,
        link: normalizeLink(form.link),
        login: isCrm ? form.login.trim() || null : null,
        senha: isCrm ? form.senha || null : null,
        observacoes: form.observacoes.trim() || null,
      };

      if (editingId) {
        const { error } = await supabase
          .from("acessos_clientes")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
        toast.success("Acesso atualizado");
      } else {
        const { error } = await supabase
          .from("acessos_clientes")
          .insert([{ ...payload, user_id: user.id }]);
        if (error) throw error;
        toast.success("Acesso adicionado");
      }

      setIsDialogOpen(false);
      fetchAcessos();
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar acesso");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const { error } = await supabase
        .from("acessos_clientes")
        .delete()
        .eq("id", deleteTarget.id);
      if (error) throw error;
      setAcessos((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      toast.success("Acesso removido");
    } catch (error: any) {
      toast.error("Erro ao remover acesso");
    } finally {
      setDeleteTarget(null);
    }
  };

  const counts = useMemo(() => {
    return acessos.reduce<Record<string, number>>((acc, a) => {
      acc[a.agencia] = (acc[a.agencia] || 0) + 1;
      return acc;
    }, {});
  }, [acessos]);

  const filteredAcessos = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return acessos.filter((a) => {
      const matchesAgencia = agenciaFilter === "todos" || a.agencia === agenciaFilter;
      const matchesSearch = !q || a.nome.toLowerCase().includes(q) || (a.login || "").toLowerCase().includes(q);
      return matchesAgencia && matchesSearch;
    });
  }, [acessos, agenciaFilter, searchQuery]);

  const isCrm = form.tipo === "crm";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Planilha/CRM</h1>
          <p className="text-muted-foreground">Links de planilhas e acessos de CRM dos clientes, por agência.</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus size={16} />
          Adicionar
        </Button>
      </div>

      <Tabs value={agenciaFilter} onValueChange={setAgenciaFilter} className="w-full">
        <TabsList>
          <TabsTrigger value="todos" className="gap-2">
            Todos
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{acessos.length}</Badge>
          </TabsTrigger>
          {AGENCIAS.map((a) => (
            <TabsTrigger key={a.id} value={a.id} className="gap-2">
              {a.label}
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{counts[a.id] || 0}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
        <Input
          placeholder="Pesquisar cliente..."
          className="pl-10"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="h-24 flex items-center justify-center text-muted-foreground">Carregando...</div>
      ) : filteredAcessos.length === 0 ? (
        <Card className="h-32 flex flex-col items-center justify-center text-muted-foreground gap-2 border-dashed">
          <span>Nenhum acesso cadastrado{agenciaFilter !== "todos" ? " nesta agência" : ""}.</span>
          <Button variant="ghost" size="sm" className="gap-2" onClick={openCreate}>
            <Plus size={14} /> Adicionar o primeiro
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredAcessos.map((acesso) => (
            <AcessoCard
              key={acesso.id}
              acesso={acesso}
              onEdit={() => openEdit(acesso)}
              onDelete={() => setDeleteTarget(acesso)}
            />
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar acesso" : "Novo acesso"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="acesso-nome">Nome do cliente</Label>
              <Input
                id="acesso-nome"
                autoFocus
                placeholder="Ex.: Clínica Sorriso"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Agência</Label>
                <Select value={form.agencia} onValueChange={(v) => setForm({ ...form, agencia: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {AGENCIAS.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Tipo</Label>
                <div className="grid grid-cols-2 gap-1 p-1 rounded-md bg-muted">
                  {(["planilha", "crm"] as TipoAcesso[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm({ ...form, tipo: t })}
                      className={cn(
                        "flex items-center justify-center gap-1.5 h-8 rounded-sm text-sm font-medium transition-colors",
                        form.tipo === t
                          ? "bg-background shadow-sm text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {TIPO_META[t].icon}
                      {TIPO_META[t].label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="acesso-link">{isCrm ? "Link do CRM" : "Link da planilha"}</Label>
              <Input
                id="acesso-link"
                placeholder="https://..."
                value={form.link}
                onChange={(e) => setForm({ ...form, link: e.target.value })}
              />
            </div>

            {isCrm && (
              <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="space-y-2">
                  <Label htmlFor="acesso-login">Login</Label>
                  <Input
                    id="acesso-login"
                    placeholder="usuário ou e-mail"
                    autoComplete="off"
                    value={form.login}
                    onChange={(e) => setForm({ ...form, login: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="acesso-senha">Senha</Label>
                  <Input
                    id="acesso-senha"
                    type="text"
                    placeholder="senha"
                    autoComplete="off"
                    value={form.senha}
                    onChange={(e) => setForm({ ...form, senha: e.target.value })}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="acesso-obs">Observações <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Textarea
                id="acesso-obs"
                placeholder="Ex.: aba 'Leads', usar perfil do gestor..."
                className="min-h-[70px]"
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover acesso?</AlertDialogTitle>
            <AlertDialogDescription>
              O acesso de <strong>{deleteTarget?.nome}</strong> será removido. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface AcessoCardProps {
  acesso: Acesso;
  onEdit: () => void;
  onDelete: () => void;
}

function AcessoCard({ acesso, onEdit, onDelete }: AcessoCardProps) {
  const [showSenha, setShowSenha] = useState(false);
  const agenciaMeta = AGENCIAS.find((a) => a.id === acesso.agencia);
  const tipoMeta = TIPO_META[acesso.tipo] ?? TIPO_META.planilha;

  return (
    <Card className={cn("border-l-4 p-4 flex flex-col gap-3", agenciaMeta?.border || "border-l-primary")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold leading-tight truncate">{acesso.nome}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground">{agenciaMeta?.label || acesso.agencia}</span>
            <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px] gap-1 font-medium", tipoMeta.classes)}>
              {tipoMeta.icon}
              {tipoMeta.label}
            </Badge>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 -mr-2 -mt-1">
              <MoreVertical size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit} className="gap-2">
              <Pencil size={14} /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="gap-2 text-destructive focus:text-destructive">
              <Trash2 size={14} /> Remover
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {acesso.tipo === "crm" && (
        <div className="space-y-1.5 text-sm">
          <CredentialRow
            label="Login"
            value={acesso.login}
            onCopy={() => acesso.login && copyToClipboard(acesso.login, "Login")}
          />
          <CredentialRow
            label="Senha"
            value={acesso.senha}
            masked={!showSenha}
            onToggle={() => setShowSenha((s) => !s)}
            onCopy={() => acesso.senha && copyToClipboard(acesso.senha, "Senha")}
          />
        </div>
      )}

      {acesso.observacoes && (
        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{acesso.observacoes}</p>
      )}

      <Button asChild variant="outline" size="sm" className="gap-2 mt-auto">
        <a href={acesso.link} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={14} />
          {acesso.tipo === "crm" ? "Abrir CRM" : "Abrir planilha"}
        </a>
      </Button>
    </Card>
  );
}

interface CredentialRowProps {
  label: string;
  value: string | null;
  masked?: boolean;
  onToggle?: () => void;
  onCopy: () => void;
}

function CredentialRow({ label, value, masked, onToggle, onCopy }: CredentialRowProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!value) return;
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground w-11 shrink-0">{label}</span>
      <span className={cn("flex-1 font-mono text-xs truncate", !value && "text-muted-foreground italic")}>
        {value ? (masked ? "••••••••" : value) : "não informado"}
      </span>
      {onToggle && value && (
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onToggle} title={masked ? "Mostrar" : "Ocultar"}>
          {masked ? <Eye size={13} /> : <EyeOff size={13} />}
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={handleCopy}
        disabled={!value}
        title={`Copiar ${label.toLowerCase()}`}
      >
        {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
      </Button>
    </div>
  );
}
