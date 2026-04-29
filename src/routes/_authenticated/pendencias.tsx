import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { 
  Search, Plus, Filter, MoreVertical, Trash2, 
  ArrowRight, CheckCircle2, XCircle, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/pendencias")({
  component: PendenciasPage,
});

type PendenciaStatus = "onboarding" | "ongoing" | "offboard";

interface Pendencia {
  id: string;
  cliente_id: string;
  status: PendenciaStatus;
  clientes: {
    nome: string;
    agencia: string;
  };
}

function PendenciasPage() {
  const [pendencias, setPendencias] = useState<Pendencia[]>([]);
  const [clientesDisponiveis, setClientesDisponiveis] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isAdding, setIsAdding] = useState(false);
  const [newClienteId, setNewClienteId] = useState<string>("");
  const [newStatus, setNewStatus] = useState<PendenciaStatus>("onboarding");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch pendencias
      const { data: pendenciasData, error: pendenciasError } = await supabase
        .from("pendencias_clientes")
        .select("*, clientes(nome, agencia)")
        .order("created_at", { ascending: false });

      if (pendenciasError) throw pendenciasError;

      // Fetch all active clients to populate selector
      const { data: clientesData, error: clientesError } = await supabase
        .from("clientes")
        .select("id, nome, agencia")
        .eq("arquivado", false)
        .order("nome");

      if (clientesError) throw clientesError;

      setPendencias(pendenciasData || []);
      setClientesDisponiveis(clientesData || []);
    } catch (error: any) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar pendências");
    } finally {
      setLoading(false);
    }
  };

  const handleAddPendencia = async () => {
    if (!newClienteId) {
      toast.error("Selecione um cliente");
      return;
    }

    // Check if already exists
    if (pendencias.some(p => p.cliente_id === newClienteId)) {
      toast.error("Este cliente já possui uma pendência registrada");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || 'b34bdae5-7a67-4b63-a46f-8aad43a06c63';

      const { error } = await supabase
        .from("pendencias_clientes")
        .insert([{
          cliente_id: newClienteId,
          status: newStatus,
          user_id: userId
        }]);

      if (error) throw error;

      toast.success("Pendência adicionada");
      setIsAdding(false);
      setNewClienteId("");
      fetchData();
    } catch (error: any) {
      toast.error(error.message || "Erro ao adicionar pendência");
    }
  };

  const handleUpdateStatus = async (id: string, status: PendenciaStatus) => {
    try {
      const { error } = await supabase
        .from("pendencias_clientes")
        .update({ status })
        .eq("id", id);

      if (error) throw error;
      
      setPendencias(prev => prev.map(p => p.id === id ? { ...p, status } : p));
      toast.success("Status atualizado");
    } catch (error: any) {
      toast.error("Erro ao atualizar status");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from("pendencias_clientes")
        .delete()
        .eq("id", id);

      if (error) throw error;
      
      setPendencias(prev => prev.filter(p => p.id !== id));
      toast.success("Pendência removida");
    } catch (error: any) {
      toast.error("Erro ao remover pendência");
    }
  };

  const filteredPendencias = useMemo(() => {
    return pendencias.filter(p => {
      const matchesSearch = p.clientes.nome.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [pendencias, searchQuery, statusFilter]);

  const getStatusBadge = (status: PendenciaStatus) => {
    switch (status) {
      case "onboarding":
        return <Badge className="bg-blue-500 hover:bg-blue-600 gap-1.5"><Clock size={12} /> Onboarding</Badge>;
      case "ongoing":
        return <Badge className="bg-green-500 hover:bg-green-600 gap-1.5"><CheckCircle2 size={12} /> Ongoing</Badge>;
      case "offboard":
        return <Badge className="bg-slate-500 hover:bg-slate-600 gap-1.5"><XCircle size={12} /> Offboard</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pendências de Clientes</h1>
          <p className="text-muted-foreground">Controle simplificado do estágio atual de cada cliente.</p>
        </div>
        <Button onClick={() => setIsAdding(!isAdding)} className="gap-2">
          {isAdding ? <Filter size={16} /> : <Plus size={16} />}
          {isAdding ? "Cancelar" : "Adicionar Cliente"}
        </Button>
      </div>

      {isAdding && (
        <Card className="bg-muted/50 border-dashed">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Cliente</label>
                <Select value={newClienteId} onValueChange={setNewClienteId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um cliente..." />
                  </SelectTrigger>
                  <SelectContent>
                    {clientesDisponiveis.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome} ({c.agencia})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Status Inicial</label>
                <Select value={newStatus} onValueChange={(v: any) => setNewStatus(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="onboarding">Onboarding</SelectItem>
                    <SelectItem value="ongoing">Ongoing</SelectItem>
                    <SelectItem value="offboard">Offboard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={handleAddPendencia} className="w-full">Confirmar Adição</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <Input 
            placeholder="Pesquisar cliente..." 
            className="pl-10" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Status</SelectItem>
            <SelectItem value="onboarding">Onboarding</SelectItem>
            <SelectItem value="ongoing">Ongoing</SelectItem>
            <SelectItem value="offboard">Offboard</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Agência</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">Carregando...</TableCell>
              </TableRow>
            ) : filteredPendencias.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  Nenhuma pendência encontrada.
                </TableCell>
              </TableRow>
            ) : (
              filteredPendencias.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.clientes.nome}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">{item.clientes.agencia}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="focus:outline-none transition-opacity hover:opacity-80">
                          {getStatusBadge(item.status)}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem onClick={() => handleUpdateStatus(item.id, "onboarding")} className="gap-2">
                          <Clock size={14} /> Onboarding
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleUpdateStatus(item.id, "ongoing")} className="gap-2">
                          <CheckCircle2 size={14} /> Ongoing
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleUpdateStatus(item.id, "offboard")} className="gap-2">
                          <XCircle size={14} /> Offboard
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical size={16} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem 
                          className="text-destructive focus:text-destructive gap-2"
                          onClick={() => handleDelete(item.id)}
                        >
                          <Trash2 size={14} /> Remover
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
