import { useState, useEffect } from "react";
import { DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle, CalendarIcon, Info } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { NPS_METRICS, getScoreCategory, getMetricColor } from "@/lib/nps";
import { useAgencias } from "@/lib/agencias";
import { getUserId } from "@/lib/clientesService";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

interface NPSFormProps {
  onSuccess: () => void;
  onClose: () => void;
  initialData?: any;
  /** Cliente pré-selecionado ao abrir a partir da lista */
  defaultClienteId?: string;
}

export function NPSForm({ onSuccess, onClose, initialData, defaultClienteId }: NPSFormProps) {
  const { label: agenciaLabelOf } = useAgencias();
  const [loading, setLoading] = useState(false);
  const [clienteId, setClienteId] = useState(initialData?.cliente_id || defaultClienteId || "");
  const [dataAvaliacao, setDataAvaliacao] = useState<Date>(initialData ? new Date(initialData.data_avaliacao) : new Date());
  const [observacoes, setObservacoes] = useState(initialData?.observacoes || "");
  
  const [metrics, setMetrics] = useState<Record<string, number>>({
    engajamento: initialData?.engajamento ?? 8,
    resultados_campanha: initialData?.resultados_campanha ?? 8,
    conversao_vendas: initialData?.conversao_vendas ?? 8,
    relacionamento: initialData?.relacionamento ?? 8,
    potencial_crescimento: initialData?.potencial_crescimento ?? 8,
  });

  const { data: clientes } = useQuery({
    queryKey: ["clientes-ativos"],
    queryFn: async () => {
      const { data } = await supabase
        .from("clientes")
        .select("id, nome, agencia")
        .eq("arquivado", false)
        .order("nome");
      return data || [];
    },
  });

  const scoreTotal = Object.values(metrics).reduce((a, b) => a + b, 0);
  const category = getScoreCategory(scoreTotal);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!clienteId) {
      toast.error("Selecione um cliente");
      return;
    }

    setLoading(true);
    const userId = await getUserId();

    const payload = {
      user_id: userId,
      cliente_id: clienteId,
      data_avaliacao: format(dataAvaliacao, "yyyy-MM-dd"),
      engajamento: metrics.engajamento,
      resultados_campanha: metrics.resultados_campanha,
      conversao_vendas: metrics.conversao_vendas,
      relacionamento: metrics.relacionamento,
      potencial_crescimento: metrics.potencial_crescimento,
      score_total: scoreTotal,
      observacoes,
    };

    let error;
    if (initialData?.id) {
      const { error: updateError } = await supabase
        .from("nps_avaliacoes")
        .update(payload)
        .eq("id", initialData.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from("nps_avaliacoes")
        .insert([payload]);
      error = insertError;
    }

    if (error) {
      toast.error("Erro ao salvar avaliação");
      console.error(error);
    } else {
      toast.success("Avaliação salva com sucesso");
      onSuccess();
      onClose();
    }
    setLoading(false);
  };

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{initialData ? "Editar Avaliação NPS" : "Nova Avaliação NPS"}</DialogTitle>
        <DialogDescription>
          Avalie o cliente em 5 métricas estratégicas para calcular o score de saúde.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-6 pt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Cliente</Label>
            <Select value={clienteId} onValueChange={setClienteId} disabled={!!initialData}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o cliente" />
              </SelectTrigger>
              <SelectContent>
                {clientes?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome} — <span className="opacity-60">{agenciaLabelOf(c.agencia)}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Data da Avaliação</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !dataAvaliacao && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dataAvaliacao ? format(dataAvaliacao, "PPP", { locale: ptBR }) : <span>Selecione a data</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={dataAvaliacao}
                  onSelect={(date) => date && setDataAvaliacao(date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="space-y-8 py-4">
          {NPS_METRICS.map((metric) => (
            <div key={metric.id} className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-semibold">{metric.label}</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle size={14} className="text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs space-y-2 p-3">
                        <p className="font-bold border-b pb-1">{metric.description}</p>
                        <div className="space-y-1 text-[11px]">
                          <p className="text-emerald-500">{metric.criteria.verde}</p>
                          <p className="text-slate-400">{metric.criteria.neutro}</p>
                          <p className="text-amber-500">{metric.criteria.amarelo}</p>
                          <p className="text-red-500">{metric.criteria.vermelho}</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className={cn(
                  "px-2 py-0.5 rounded text-xs font-bold text-white transition-colors",
                  getMetricColor(metrics[metric.id])
                )}>
                  {metrics[metric.id]}/10
                </div>
              </div>
              <Slider
                value={[metrics[metric.id]]}
                min={0}
                max={10}
                step={1}
                onValueChange={([val]) => setMetrics(prev => ({ ...prev, [metric.id]: val }))}
                className="py-1"
              />
            </div>
          ))}
        </div>

        <div className={cn(
          "p-4 rounded-lg flex items-center justify-between border-2 transition-colors",
          category.color.includes("emerald") ? "border-emerald-500/20 bg-emerald-500/5" : 
          category.color.includes("amber") ? "border-amber-500/20 bg-amber-500/5" : 
          "border-red-500/20 bg-red-500/5"
        )}>
          <div>
            <p className="text-xs uppercase tracking-wider font-bold opacity-70">Score Consolidado</p>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-black">{scoreTotal}/50</span>
              <div className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase", category.color)}>
                {category.label}
              </div>
            </div>
          </div>
          <div className="text-right hidden sm:block max-w-[200px]">
            <p className="text-[10px] font-bold opacity-60 uppercase">Ação Sugerida</p>
            <p className="text-xs font-medium leading-tight">{category.action}</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Observações e próximos passos</Label>
          <Textarea 
            placeholder="Ex: Cliente ríspido na última reunião, precisa de atenção no comercial..."
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            className="min-h-[100px]"
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Salvando..." : initialData ? "Atualizar Avaliação" : "Salvar Avaliação"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
