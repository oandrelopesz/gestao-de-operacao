import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoreVertical, Edit2, Trash2, Calendar, Target } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getScoreCategory, getMetricColor, isFridayToday, getDiasAteProximaSexta, getProximaSextaFormatada } from "@/lib/nps";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface NPSCardProps {
  avaliacao: any;
  onEdit: (avaliacao: any) => void;
  onDelete: (id: string) => void;
  onClick: (avaliacao: any) => void;
}

export function NPSCard({ avaliacao, onEdit, onDelete, onClick }: NPSCardProps) {
  const isFriday = isFridayToday();
  const category = getScoreCategory(avaliacao.score_total);
  const metrics = [
    { label: "Engajamento", value: avaliacao.engajamento },
    { label: "Resultados", value: avaliacao.resultados_campanha },
    { label: "Conversão", value: avaliacao.conversao_vendas },
    { label: "Relação", value: avaliacao.relacionamento },
    { label: "Potencial", value: avaliacao.potencial_crescimento },
  ];

  return (
    <Card 
      className={cn(
        "group hover:shadow-md transition-all cursor-pointer border-2 border-transparent hover:border-muted-foreground/10 outline-none focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2",
        avaliacao.cliente_status_operacional === "pausado" && "opacity-75"
      )}
      onClick={() => onClick(avaliacao)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Delete" || e.key === "Backspace") {
          e.stopPropagation();
          onDelete(avaliacao.id);
        }
      }}
    >
      <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0 relative">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-lg leading-tight">{avaliacao.cliente_nome}</h3>
            <Badge variant="outline" className={cn(
              "text-[10px] uppercase font-bold px-1.5 py-0",
              avaliacao.cliente_agencia === "alt" ? "text-amber-600 border-amber-200 bg-amber-50" : ""
            )}>
              {avaliacao.cliente_agencia}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-1">
            {avaliacao.cliente_status_operacional === "pausado" && (
              <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-200 bg-amber-50 h-4 px-1.5 font-bold uppercase">PAUSADO</Badge>
            )}
            {avaliacao.cliente_em_onboarding && (
              <Badge className="bg-emerald-500 hover:bg-emerald-600 text-[10px] h-4 px-1.5 font-bold uppercase">ONBOARDING</Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar size={12} />
            <span>
              {new Date(avaliacao.data_avaliacao).toLocaleDateString("pt-BR")} — {" "}
              {formatDistanceToNow(new Date(avaliacao.data_avaliacao), { addSuffix: true, locale: ptBR })}
            </span>
          </div>
        </div>

        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <TooltipProvider>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[140px]">
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <div className="w-full">
                      <DropdownMenuItem 
                        disabled={!isFriday}
                        onClick={(e) => { e.stopPropagation(); if (isFriday) onEdit(avaliacao); }}
                        className={cn(!isFriday && "opacity-50 cursor-not-allowed")}
                      >
                        <Edit2 size={14} className="mr-2" /> Editar
                      </DropdownMenuItem>
                    </div>
                  </TooltipTrigger>
                  {!isFriday && (
                    <TooltipContent side="left">
                      <p>Edição bloqueada fora de sexta-feira.</p>
                    </TooltipContent>
                  )}
                </Tooltip>

                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <div className="w-full">
                      <DropdownMenuItem 
                        disabled={!isFriday}
                        className={cn("text-destructive focus:text-destructive", !isFriday && "opacity-50 cursor-not-allowed")} 
                        onClick={(e) => { e.stopPropagation(); if (isFriday) onDelete(avaliacao.id); }}
                      >
                        <Trash2 size={14} className="mr-2" /> Remover
                      </DropdownMenuItem>
                    </div>
                  </TooltipTrigger>
                  {!isFriday && (
                    <TooltipContent side="left">
                      <p>Remoção bloqueada fora de sexta-feira.</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </DropdownMenuContent>
            </DropdownMenu>
          </TooltipProvider>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-baseline gap-1">
              <span className={cn("text-4xl font-black", 
                category.id === "ancora" ? "text-emerald-700" :
                category.id === "saudavel" ? "text-emerald-500" :
                category.id === "em_risco" ? "text-amber-500" :
                "text-red-500"
              )}>
                {avaliacao.score_total}
              </span>
              <span className="text-sm font-bold text-muted-foreground">/50</span>
            </div>
            <div className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase inline-block", category.color)}>
              {category.label}
            </div>
          </div>

          <div className="text-right flex-1 bg-muted/30 p-2 rounded-lg border border-muted-foreground/5">
            <p className="text-[9px] font-bold opacity-60 uppercase flex items-center justify-end gap-1 mb-1">
              <Target size={10} /> Ação Sugerida
            </p>
            <p className="text-[11px] font-semibold leading-tight line-clamp-2">{category.action}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {metrics.map((m) => (
            <div 
              key={m.label} 
              className={cn(
                "px-2 py-1 rounded-md text-[9px] font-bold flex flex-col items-center gap-0.5 border shadow-sm",
                getMetricColor(m.value).replace("bg-", "bg-opacity-10 text-").replace("text-", "text-"),
                "bg-opacity-10 border-current/20"
              )}
            >
              <span className="opacity-70 uppercase leading-none">{m.label}</span>
              <span className="text-xs leading-none">{m.value}</span>
            </div>
          ))}
        </div>

        {avaliacao.observacoes && (
          <div className="text-xs text-muted-foreground bg-muted/20 p-2 rounded italic line-clamp-2">
            "{avaliacao.observacoes}"
          </div>
        )}
      </CardContent>
    </Card>
  );
}
