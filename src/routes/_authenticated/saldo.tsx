import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { DollarSign, Receipt, Clock, AlertCircle, Plus, Search, Building2, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { AGENCIAS, AgenciaId, formatBRL } from "@/lib/clientes";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/saldo")({
  component: SaldoPage,
});

function SaldoPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAgencia, setFilterAgencia] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

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
        <Button className="gap-2">
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
                <TableRow key={item.id}>
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
                    <Button variant="ghost" size="sm">Editar</Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// Helper needed for the conditional classes
function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ");
}
