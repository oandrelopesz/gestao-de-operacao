import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { DollarSign, Receipt, Clock, AlertCircle, Plus, Search, Building2, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { AGENCIAS, formatBRL } from "@/lib/clientes";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SaldoForm, SaldoFormValues } from "@/components/SaldoForm";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/saldo")({
  component: SaldoPage,
});

function SaldoPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAgencia, setFilterAgencia] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSaldo();
  }, []);

  const fetchSaldo = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("saldo")
      .select("*, clientes(nome, agencia)")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar dados financeiros");
      console.error(error);
    } else {
      setData(data || []);
    }
    setLoading(false);
  };

  const handleSave = async (values: SaldoFormValues) => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      if (editing) {
        const { error } = await supabase
          .from("saldo")
          .update({ ...values })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Registro atualizado");
      } else {
        const { error } = await supabase
          .from("saldo")
          .insert([{ ...values, user_id: user.id }]);
        if (error) throw error;
        toast.success("Registro criado");
      }
      setModalOpen(false);
      setEditing(null);
      fetchSaldo();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      const { error } = await supabase.from("saldo").delete().eq("id", deletingId);
      if (error) throw error;
      toast.success("Registro removido");
      fetchSaldo();
    } catch (e: any) {
      toast.error("Erro ao remover registro");
    } finally {
      setDeletingId(null);
    }
  };

  const filteredData = useMemo(() => {
    return data.filter(item => {
      const matchesAgencia = filterAgencia === "all" || item.clientes?.agencia === filterAgencia;
      const matchesSearch = item.clientes?.nome?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesAgencia && matchesSearch;
    });
  }, [data, filterAgencia, searchQuery]);

  const metrics = useMemo(() => {
    const list = filteredData;
    const previsto = list.reduce((acc, curr) => acc + (curr.valor_previsto || 0), 0);
    const recebido = list.reduce((acc, curr) => acc + (curr.valor_recebido || 0), 0);
    const emAberto = previsto - recebido;
    const atrasado = list
      .filter(i => i.status_pagamento === "atrasado")
      .reduce((acc, curr) => acc + (curr.valor_previsto || 0), 0);
    
    return { previsto, recebido, emAberto, atrasado };
  }, [filteredData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Saldo</h1>
          <p className="text-muted-foreground">Controle financeiro por cliente e status de pagamento.</p>
        </div>
        <Button className="gap-2" onClick={() => { setEditing(null); setModalOpen(true); }}>
          <Plus size={16} />
          Registrar recebimento
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Faturamento Previsto</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBRL(metrics.previsto)}</div>
            <p className="text-xs text-muted-foreground">Total contratado (filtros aplicados)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recebido</CardTitle>
            <Receipt className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBRL(metrics.recebido)}</div>
            <p className="text-xs text-muted-foreground">Valor já compensado</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Aberto</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBRL(metrics.emAberto)}</div>
            <p className="text-xs text-muted-foreground">Aguardando pagamento</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Atrasado</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBRL(metrics.atrasado)}</div>
            <p className="text-xs text-muted-foreground">Soma dos pagamentos atrasados</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={filterAgencia} onValueChange={setFilterAgencia}>
          <SelectTrigger className="w-[180px]">
            <Building2 className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Agência" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as agências</SelectItem>
            {AGENCIAS.map(a => (
              <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Agência</TableHead>
              <TableHead>Contratado</TableHead>
              <TableHead>Recebido</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center">Carregando...</TableCell>
              </TableRow>
            ) : filteredData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  Nenhum registro financeiro encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filteredData.map((item) => (
                <TableRow key={item.id} className="group">
                  <TableCell className="font-medium">{item.clientes?.nome}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal text-[10px]">
                      {AGENCIAS.find(a => a.id === item.clientes?.agencia)?.label}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatBRL(item.valor_previsto)}</TableCell>
                  <TableCell>{formatBRL(item.valor_recebido)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {item.data_vencimento ? new Date(item.data_vencimento).toLocaleDateString("pt-BR") : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "font-normal",
                        item.status_pagamento === "em_dia" && "bg-emerald-50 text-emerald-700 border-emerald-200",
                        item.status_pagamento === "pendente" && "bg-amber-50 text-amber-700 border-amber-200",
                        item.status_pagamento === "atrasado" && "bg-red-50 text-red-700 border-red-200",
                      )}
                    >
                      {item.status_pagamento === "em_dia" ? "Em dia" : item.status_pagamento === "pendente" ? "Pendente" : "Atrasado"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical size={16} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[140px]">
                        <DropdownMenuItem onClick={() => { setEditing(item); setModalOpen(true); }}>
                          <Pencil size={14} className="mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="text-destructive focus:text-destructive" 
                          onClick={() => setDeletingId(item.id)}
                        >
                          <Trash2 size={14} className="mr-2" /> Remover
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={modalOpen} onOpenChange={(o) => { setModalOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar registro" : "Registrar recebimento"}</DialogTitle>
            <DialogDescription>
              {editing ? "Atualize os dados deste registro financeiro." : "Lance um novo registro de pagamento esperado ou recebido."}
            </DialogDescription>
          </DialogHeader>
          <SaldoForm
            loading={saving}
            onSubmit={handleSave}
            initialValues={editing ? {
              cliente_id: editing.cliente_id,
              valor_previsto: editing.valor_previsto,
              valor_recebido: editing.valor_recebido,
              data_vencimento: editing.data_vencimento,
              status_pagamento: editing.status_pagamento,
              mes_referencia: editing.mes_referencia,
            } : {}}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={(o) => if (!o) setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza que deseja remover?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O registro financeiro será permanentemente deletado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

