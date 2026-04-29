import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { 
  Search, Plus, Filter, MoreVertical, Trash2, 
  ArrowRight, CheckCircle2, XCircle, Clock, Check
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/pendencias")({
  component: PendenciasPage,
});

type PendenciaStatus = "onboarding" | "ongoing" | "offboard";

interface Pendencia {
  id: string;
  cliente_id: string;
  status: PendenciaStatus;
  descricao?: string | null;
  resolvida: boolean | null;
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
  const [newDescricao, setNewDescricao] = useState("");
  const [activeTab, setActiveTab] = useState("pendentes");

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

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || 'b34bdae5-7a67-4b63-a46f-8aad43a06c63';

      const { error } = await supabase
        .from("pendencias_clientes")
        .insert([{
          cliente_id: newClienteId,
          status: newStatus,
          descricao: newDescricao,
          user_id: userId,
          resolvida: false
        }]);

      if (error) throw error;

      toast.success("Pendência adicionada");
      setIsAdding(false);
      setNewClienteId("");
      setNewDescricao("");
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

  const handleToggleResolvida = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("pendencias_clientes")
        .update({ resolvida: !currentStatus })
        .eq("id", id);

      if (error) throw error;
      
      setPendencias(prev => prev.map(p => p.id === id ? { ...p, resolvida: !currentStatus } : p));
      toast.success(!currentStatus ? "Pendência marcada como resolvida" : "Pendência marcada como aberta");
    } catch (error: any) {
      toast.error("Erro ao atualizar pendência");
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
      const matchesSearch = p.clientes.nome.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           (p.descricao?.toLowerCase() || "").includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || p.status === statusFilter;
      const matchesTab = activeTab === "pendentes" ? !p.resolvida : p.resolvida;
      return matchesSearch && matchesStatus && matchesTab;
    });
  }, [pendencias, searchQuery, statusFilter, activeTab]);

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
          <p className="text-muted-foreground">Controle simplificado do estágio atual e pendências de cada cliente.</p>
        </div>
        <Button onClick={() => setIsAdding(!isAdding)} className="gap-2">
          {isAdding ? <Filter size={16} /> : <Plus size={16} />}
          {isAdding ? "Cancelar" : "Nova Pendência"}
        </Button>
      </div>

      {isAdding && (
        <Card className="bg-muted/50 border-dashed">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <label className="text-sm font-medium">Estágio do Cliente</label>
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
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">O que é a pendência?</label>
                <Textarea 
                  placeholder="Escreva aqui qual a pendência deste cliente..." 
                  value={newDescricao}
                  onChange={(e) => setNewDescricao(e.target.value)}
                  className="min-h-[100px]"
                />
              </div>
              <div className="flex items-end md:col-span-2">
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
            placeholder="Pesquisar cliente ou pendência..." 
            className="pl-10" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="Filtrar por estágio" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Estágios</SelectItem>
            <SelectItem value="onboarding">Onboarding</SelectItem>
            <SelectItem value="ongoing">Ongoing</SelectItem>
            <SelectItem value="offboard">Offboard</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
          <TabsTrigger value="pendentes">Pendentes</TabsTrigger>
          <TabsTrigger value="resolvidas">Resolvidas</TabsTrigger>
        </TabsList>
        
        <TabsContent value="pendentes" className="mt-6">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Cliente</TableHead>
                  <TableHead>Pendência</TableHead>
                  <TableHead className="w-[150px]">Estágio</TableHead>
                  <TableHead className="text-right w-[150px]">Ações</TableHead>
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
                      Nenhuma pendência aberta.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPendencias.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-medium">{item.clientes.nome}</div>
                        <div className="text-xs text-muted-foreground capitalize">{item.clientes.agencia}</div>
                      </TableCell>
                      <TableCell className="max-w-md whitespace-pre-wrap">{item.descricao || "Sem descrição"}</TableCell>
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
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="outline" 
                            size="icon" 
                            className="h-8 w-8 text-green-600 border-green-200 hover:bg-green-50 hover:text-green-700"
                            onClick={() => handleToggleResolvida(item.id, false)}
                            title="Marcar como resolvida"
                          >
                            <Check size={16} />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
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
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="resolvidas" className="mt-6">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Cliente</TableHead>
                  <TableHead>Pendência</TableHead>
                  <TableHead className="w-[150px]">Estágio</TableHead>
                  <TableHead className="text-right w-[150px]">Ações</TableHead>
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
                      Nenhuma pendência resolvida.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPendencias.map((item) => (
                    <TableRow key={item.id} className="opacity-70">
                      <TableCell>
                        <div className="font-medium line-through">{item.clientes.nome}</div>
                        <div className="text-xs text-muted-foreground capitalize">{item.clientes.agencia}</div>
                      </TableCell>
                      <TableCell className="max-w-md whitespace-pre-wrap line-through">{item.descricao || "Sem descrição"}</TableCell>
                      <TableCell>
                        {getStatusBadge(item.status)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-xs h-8"
                            onClick={() => handleToggleResolvida(item.id, true)}
                          >
                            Reabrir
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-destructive"
                            onClick={() => handleDelete(item.id)}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
