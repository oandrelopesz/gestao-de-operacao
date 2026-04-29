import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { MessageSquare, Star, TrendingUp, Plus, Search, Building2, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { AGENCIAS, formatBRL } from "@/lib/clientes";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/nps")({
  component: NPSPage,
});

function NPSPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAgencia, setFilterAgencia] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchNPS();
  }, []);

  const fetchNPS = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("nps")
      .select("*, clientes(nome, agencia)")
      .order("data_pesquisa", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar feedbacks NPS");
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
    const total = list.length;
    if (total === 0) return { score: 0, promotores: 0, neutros: 0, detratores: 0 };

    const promotores = list.filter(i => i.nota >= 9).length;
    const neutros = list.filter(i => i.nota >= 7 && i.nota <= 8).length;
    const detratores = list.filter(i => i.nota <= 6).length;

    const score = Math.round(((promotores - detratores) / total) * 100);
    
    return { score, promotores, neutros, detratores, total };
  }, [filteredData]);

  const getPercentage = (count: number) => {
    if (!metrics.total) return 0;
    return Math.round((count / metrics.total) * 100);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">NPS de Clientes</h1>
          <p className="text-muted-foreground">Monitore a satisfação e colete feedbacks.</p>
        </div>
        <Button className="gap-2">
          <Plus size={16} />
          Registrar pesquisa
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>NPS Geral</CardTitle>
            <CardDescription>Calculado sobre {metrics.total || 0} avaliações</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center pt-2">
            <div className={cn(
              "text-6xl font-bold mb-2",
              metrics.score > 70 ? "text-emerald-500" : metrics.score > 0 ? "text-amber-500" : "text-red-500"
            )}>
              {metrics.total ? metrics.score : "—"}
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              {metrics.total ? (metrics.score >= 75 ? "Excelente" : metrics.score >= 50 ? "Muito Bom" : metrics.score >= 0 ? "Razoável" : "Crítico") : "Sem dados"}
            </p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Distribuição de Notas</CardTitle>
            <CardDescription>Promotores, Neutros e Detratores</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  Promotores (9-10)
                </span>
                <span className="font-medium">{getPercentage(metrics.promotores)}%</span>
              </div>
              <Progress value={getPercentage(metrics.promotores)} className="h-2 bg-emerald-100" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  Neutros (7-8)
                </span>
                <span className="font-medium">{getPercentage(metrics.neutros)}%</span>
              </div>
              <Progress value={getPercentage(metrics.neutros)} className="h-2 bg-amber-100" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-destructive" />
                  Detratores (0-6)
                </span>
                <span className="font-medium">{getPercentage(metrics.detratores)}%</span>
              </div>
              <Progress value={getPercentage(metrics.detratores)} className="h-2 bg-red-100" />
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
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Últimos Feedbacks</h3>
        {loading ? (
          <div className="flex justify-center py-20">Carregando...</div>
        ) : filteredData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-lg bg-muted/30">
            <MessageSquare size={32} className="text-muted-foreground mb-4 opacity-20" />
            <h3 className="text-lg font-semibold">Nenhum feedback encontrado</h3>
            <p className="text-muted-foreground">Registre sua primeira pesquisa de satisfação.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredData.map((item) => (
              <Card key={item.id} className="hover:shadow-sm transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-sm font-semibold">{item.clientes?.nome}</CardTitle>
                      <CardDescription className="text-[10px] uppercase tracking-wider">
                        {AGENCIAS.find(a => a.id === item.clientes?.agencia)?.label}
                      </CardDescription>
                    </div>
                    <Badge className={cn(
                      "text-lg h-10 w-10 flex items-center justify-center rounded-full p-0",
                      item.nota >= 9 ? "bg-emerald-500" : item.nota >= 7 ? "bg-amber-500" : "bg-red-500"
                    )}>
                      {item.nota}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground italic leading-relaxed">
                    "{item.comentario || "Sem comentários"}"
                  </p>
                  <div className="mt-4 text-[10px] text-muted-foreground flex items-center justify-between">
                    <span>{item.categoria.charAt(0).toUpperCase() + item.categoria.slice(1)}</span>
                    <span>{new Date(item.data_pesquisa).toLocaleDateString("pt-BR")}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ");
}
