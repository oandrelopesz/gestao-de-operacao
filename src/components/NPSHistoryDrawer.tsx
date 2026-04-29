import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { NPS_METRICS, getScoreCategory, getMetricColor } from "@/lib/nps";
import { cn } from "@/lib/utils";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface NPSHistoryDrawerProps {
  cliente: any;
  onClose: () => void;
}

export function NPSHistoryDrawer({ cliente, onClose }: NPSHistoryDrawerProps) {
  const { data: historico, isLoading } = useQuery({
    queryKey: ["nps-historico", cliente?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("nps_avaliacoes")
        .select("*")
        .eq("cliente_id", cliente.id)
        .order("data_avaliacao", { ascending: true });
      return data || [];
    },
    enabled: !!cliente?.id,
  });

  const latest = historico?.[historico.length - 1];
  const previous = historico?.[historico.length - 2];

  const radarData = latest ? [
    { subject: "Engajamento", A: latest.engajamento, fullMark: 10 },
    { subject: "Resultados", A: latest.resultados_campanha, fullMark: 10 },
    { subject: "Conversão", A: latest.conversao_vendas, fullMark: 10 },
    { subject: "Relação", A: latest.relacionamento, fullMark: 10 },
    { subject: "Potencial", A: latest.potencial_crescimento, fullMark: 10 },
  ] : [];

  const chartData = historico?.map(h => ({
    data: format(new Date(h.data_avaliacao), "dd/MM"),
    score: h.score_total
  }));

  const getDelta = (metric: string) => {
    if (!latest || !previous) return null;
    const diff = latest[metric] - previous[metric];
    if (diff > 0) return { val: `+${diff}`, icon: <TrendingUp size={12} className="text-emerald-500" /> };
    if (diff < 0) return { val: diff, icon: <TrendingDown size={12} className="text-red-500" /> };
    return { val: "0", icon: <Minus size={12} className="text-slate-400" /> };
  };

  return (
    <Sheet open={!!cliente} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-xl overflow-y-auto">
        <SheetHeader className="pb-6">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-[10px] uppercase font-bold">
              {cliente?.agencia}
            </Badge>
          </div>
          <SheetTitle className="text-2xl font-black">{cliente?.nome}</SheetTitle>
          <SheetDescription>
            Histórico completo de saúde e evolução do cliente.
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="py-20 text-center text-muted-foreground">Carregando histórico...</div>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-muted/30 border border-muted-foreground/10">
                <p className="text-[10px] font-bold uppercase opacity-60 mb-1">Score Atual</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black">{latest?.score_total}</span>
                  <span className="text-xs font-bold text-muted-foreground">/50</span>
                </div>
              </div>
              <div className="p-4 rounded-xl bg-muted/30 border border-muted-foreground/10">
                <p className="text-[10px] font-bold uppercase opacity-60 mb-1">Evolução</p>
                <div className="flex items-center gap-2">
                  {getDelta("score_total")?.icon}
                  <span className="text-lg font-bold">
                    {getDelta("score_total")?.val || "Estreia"}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-bold uppercase tracking-wider opacity-60">Evolução do Score</h4>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#88888820" />
                    <XAxis dataKey="data" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis fontSize={10} domain={[0, 50]} tickLine={false} axisLine={false} />
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    />
                    <Line type="monotone" dataKey="score" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-bold uppercase tracking-wider opacity-60">Equilíbrio de Métricas</h4>
              <div className="h-[250px] w-full flex justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                    <PolarGrid stroke="#88888840" />
                    <PolarAngleAxis dataKey="subject" fontSize={10} />
                    <PolarRadiusAxis angle={30} domain={[0, 10]} fontSize={8} />
                    <Radar
                      name="NPS Atual"
                      dataKey="A"
                      stroke="#10b981"
                      fill="#10b981"
                      fillOpacity={0.4}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-bold uppercase tracking-wider opacity-60">Histórico de Notas</h4>
              <div className="space-y-3">
                {historico?.slice().reverse().map((h) => (
                  <div key={h.id} className="p-4 rounded-xl border border-muted-foreground/10 hover:bg-muted/10 transition-colors">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold">{format(new Date(h.data_avaliacao), "dd 'de' MMMM, yyyy", { locale: ptBR })}</span>
                      <div className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase", getScoreCategory(h.score_total).color)}>
                        {h.score_total}/50
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      {NPS_METRICS.map(m => (
                        <div key={m.id} className="text-center">
                          <div className={cn("h-1.5 w-full rounded-full mb-1", getMetricColor(h[m.id]))} />
                          <p className="text-[9px] font-bold opacity-60">{h[m.id]}</p>
                        </div>
                      ))}
                    </div>
                    {h.observacoes && (
                      <p className="text-xs text-muted-foreground mt-3 italic border-t pt-2">"{h.observacoes}"</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
