import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Plus, Search, Building2, Filter, AlertTriangle, TrendingUp, Users, Target, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { AGENCIAS } from "@/lib/clientes";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { NPSCard } from "@/components/NPSCard";
import { NPSForm } from "@/components/NPSForm";
import { NPSHistoryDrawer } from "@/components/NPSHistoryDrawer";
import { Dialog } from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";
import { NPS_SCORE_CATEGORIES } from "@/lib/nps";

export const Route = createFileRoute("/_authenticated/nps")({
  component: NPSPage,
});

function NPSPage() {
  const queryClient = useQueryClient();
  const [filterAgencia, setFilterAgencia] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAvaliacao, setEditingAvaliacao] = useState<any>(null);
  const [selectedCliente, setSelectedCliente] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState<string>("");

  const { data: avaliacoes, isLoading } = useQuery({
    queryKey: ["nps-avaliacoes"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("nps_avaliacoes_view")
          .select("*, clientes(nome, agencia, status_operacional, em_onboarding)")
          .order("data_avaliacao", { ascending: false });

        if (error) {
          console.error("Erro detalhado NPS query:", error);
          toast.error(`Erro ao carregar feedbacks NPS: ${error.message}`);
          throw error;
        }
        return data || [];
      } catch (err: any) {
        console.error("Erro inesperado na query NPS:", err);
        throw err;
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("nps_avaliacoes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nps-avaliacoes"] });
      toast.success("Avaliação removida");
    },
    onError: (err) => {
      toast.error("Erro ao remover avaliação");
      console.error(err);
    },
  });

  const filteredData = useMemo(() => {
    if (!avaliacoes) return [];
    return avaliacoes.filter(item => {
      const matchesAgencia = filterAgencia === "all" || item.clientes?.agencia === filterAgencia;
      const matchesCategory = filterCategory === "all" || item.categoria === filterCategory;
      const matchesSearch = item.clientes?.nome?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesAgencia && matchesSearch && matchesCategory;
    });
  }, [avaliacoes, filterAgencia, filterCategory, searchQuery]);

  const stats = useMemo(() => {
    if (!filteredData.length) return { avgScore: 0, criticalCount: 0, total: 0 };
    const total = filteredData.length;
    const avgScore = Math.round(filteredData.reduce((acc, curr) => acc + (curr.score_total || 0), 0) / total);
    const criticalCount = filteredData.filter(i => i.categoria === "critico" || i.categoria === "em_risco").length;
    
    const distribution = NPS_SCORE_CATEGORIES.map(cat => ({
      ...cat,
      count: filteredData.filter(i => i.categoria === cat.id).length
    }));

    return { avgScore, criticalCount, total, distribution };
  }, [filteredData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">NPS Multidimensional</h1>
          <p className="text-muted-foreground">Gestão estratégica de saúde e satisfação da carteira.</p>
        </div>
        <Button className="gap-2" onClick={() => setIsFormOpen(true)}>
          <Plus size={16} />
          Nova avaliação
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-muted/30 border-none shadow-none">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Users size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase opacity-60">Clientes Avaliados</p>
              <p className="text-xl font-black">{stats.total}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30 border-none shadow-none">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600">
              <TrendingUp size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase opacity-60">Score Médio</p>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-black">{stats.avgScore}</span>
                <span className="text-[10px] font-bold opacity-60">/50</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30 border-none shadow-none">
          <CardContent className="p-4 flex flex-col justify-center h-full">
            <p className="text-[10px] font-bold uppercase opacity-60 mb-2">Distribuição</p>
            <div className="flex gap-1 h-3 w-full rounded-full overflow-hidden bg-muted">
              {stats.distribution?.map((cat) => (
                <div 
                  key={cat.id} 
                  className={cn("h-full", cat.color.split(' ')[0])} 
                  style={{ width: `${(cat.count / stats.total) * 100}%` }}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30 border-none shadow-none">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-600">
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase opacity-60">Ação Imediata</p>
              <p className="text-xl font-black">{stats.criticalCount}</p>
            </div>
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
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[180px]">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {NPS_SCORE_CATEGORIES.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-20">Carregando...</div>
        ) : avaliacoes === undefined || (avaliacoes.length === 0 && !isLoading) ? (
          <div className="space-y-4">
            {!avaliacoes ? (
              <Card className="border-destructive/50 bg-destructive/5">
                <CardHeader className="flex flex-row items-center gap-2">
                  <AlertCircle className="text-destructive" size={20} />
                  <CardTitle className="text-destructive">Erro ao carregar NPS</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-destructive/80">
                    Falha na comunicação com a view de avaliações NPS.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["nps-avaliacoes"] })} className="border-destructive/30 text-destructive hover:bg-destructive/10">
                    Tentar novamente
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-lg bg-muted/30 text-center">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Target size={24} className="opacity-20" />
                </div>
                <h3 className="text-lg font-semibold">Nenhuma avaliação encontrada</h3>
                <p className="text-muted-foreground max-w-xs">Use filtros diferentes ou registre uma nova avaliação de saúde para este cliente.</p>
                <Button variant="outline" className="mt-4" onClick={() => setIsFormOpen(true)}>
                  Criar primeira avaliação
                </Button>
              </div>
            )}
          </div>
        ) : filteredData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-lg bg-muted/30 text-center">
             <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Target size={24} className="opacity-20" />
            </div>
            <h3 className="text-lg font-semibold">Nenhum resultado para os filtros</h3>
            <p className="text-muted-foreground">Tente ajustar seus critérios de busca ou agência.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredData.map((item) => (
              <NPSCard 
                key={item.id} 
                avaliacao={item} 
                onEdit={(a) => {
                  setEditingAvaliacao(a);
                  setIsFormOpen(true);
                }}
                onDelete={(id) => {
                  setDeletingId(id);
                  setDeletingName(item.clientes?.nome || "esta avaliação");
                }}
                onClick={(a) => setSelectedCliente({ id: a.cliente_id, nome: a.clientes?.nome, agencia: a.clientes?.agencia })}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog 
        open={isFormOpen} 
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) setEditingAvaliacao(null);
        }}
      >
        <NPSForm 
          onClose={() => setIsFormOpen(false)} 
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ["nps-avaliacoes"] })} 
          initialData={editingAvaliacao}
        />
      </Dialog>

      {selectedCliente && (
        <NPSHistoryDrawer 
          cliente={selectedCliente} 
          onClose={() => setSelectedCliente(null)} 
        />
      )}

      <AlertDialog open={!!deletingId} onOpenChange={(o) => { if (!o) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza que deseja remover?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A avaliação de {deletingName} será permanentemente deletada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (deletingId) deleteMutation.mutate(deletingId);
                setDeletingId(null);
              }} 
              className="bg-destructive hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
