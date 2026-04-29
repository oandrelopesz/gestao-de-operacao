import React, { useState, useEffect, useCallback, useRef } from "react";
import { 
  Sheet, 
  SheetContent, 
  SheetDescription, 
  SheetHeader, 
  SheetTitle 
} from "@/components/ui/sheet";
import { Lead } from "./ProspeccaoCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  History, 
  Plus, 
  Trash2, 
  Copy, 
  Pencil, 
  Target, 
  ChevronRight, 
  Info,
  Calendar,
  DollarSign,
  MessageSquare,
  Users,
  Building2,
  MoreVertical,
  Briefcase,
  XCircle,
  FileText,
  AlertOctagon
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatBRL, parseBRLInput, maskBRLInput, AGENCIAS } from "@/lib/clientes";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ETAPAS = [
  { id: "lead", label: "Lead", color: "slate-500", hex: "#64748b" },
  { id: "contato_feito", label: "Contato feito", color: "blue-500", hex: "#3b82f6" },
  { id: "reuniao_agendada", label: "Reunião agendada", color: "violet-500", hex: "#8b5cf6" },
  { id: "proposta_enviada", label: "Proposta enviada", color: "amber-500", hex: "#f59e0b" },
  { id: "negociacao", label: "Negociação", color: "orange-500", hex: "#f97316" },
  { id: "fechado", label: "Fechado", color: "green-500", hex: "#22c55e" },
  { id: "perdido", label: "Perdido", color: "rose-400", hex: "#fb7185" },
];

const ORIGENS = [
  { id: "indicacao", label: "Indicação" },
  { id: "instagram", label: "Instagram" },
  { id: "anuncio", label: "Anúncio" },
  { id: "evento", label: "Evento" },
  { id: "inbound", label: "Inbound" },
  { id: "outbound", label: "Outbound" },
  { id: "parceiro", label: "Parceiro" },
  { id: "outros", label: "Outros" },
];

interface Interaction {
  id: string;
  tipo: string;
  descricao: string;
  data_interacao: string;
}

interface ProspeccaoDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead | null;
  onUpdate: (id: string, values: Partial<Lead>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (lead: Lead) => void;
  onCreateDemanda: (lead: Lead) => void;
  onConvert: (lead: Lead) => void;
}

export function ProspeccaoDrawer({
  isOpen,
  onClose,
  lead,
  onUpdate,
  onDelete,
  onDuplicate,
  onCreateDemanda,
  onConvert
}: ProspeccaoDrawerProps) {
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loadingInteractions, setLoadingInteractions] = useState(false);
  const [isAddingInteraction, setIsAddingInteraction] = useState(false);
  const [newInteraction, setNewInteraction] = useState({ tipo: 'mensagem', descricao: '', data: new Date().toISOString().slice(0, 16) });

  const fetchInteractions = async () => {
    if (!lead?.id) return;
    setLoadingInteractions(true);
    try {
      const { data, error } = await supabase
        .from("prospeccao_interacoes")
        .select("*")
        .eq("prospeccao_id", lead.id)
        .order("data_interacao", { ascending: false });
      if (error) throw error;
      setInteractions((data as any[] || []).map(i => ({
        id: i.id,
        tipo: i.tipo,
        descricao: i.descricao,
        data_interacao: i.data_interacao || ''
      })));
    } catch (error) {
      console.error("Erro interações:", error);
    } finally {
      setLoadingInteractions(false);
    }
  };

  useEffect(() => {
    if (isOpen && lead?.id) {
      fetchInteractions();
    }
  }, [isOpen, lead?.id]);

  const handleUpdate = (field: keyof Lead, value: any) => {
    if (!lead?.id) return;
    onUpdate(lead.id, { [field]: value });
  };

  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const handleUpdateObs = (val: string) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      if (lead?.id) onUpdate(lead.id, { observacoes: val });
    }, 500);
  };

  const addInteraction = async () => {
    if (!lead?.id || !newInteraction.descricao) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from("prospeccao_interacoes").insert([{
        prospeccao_id: lead.id,
        user_id: user.id,
        tipo: newInteraction.tipo,
        descricao: newInteraction.descricao,
        data_interacao: newInteraction.data
      }]);
      if (error) throw error;
      
      toast.success("Interação registrada");
      setIsAddingInteraction(false);
      setNewInteraction({ tipo: 'mensagem', descricao: '', data: new Date().toISOString().slice(0, 16) });
      fetchInteractions();
    } catch (error: any) {
      toast.error("Erro: " + error.message);
    }
  };

  const deleteInteraction = async (id: string) => {
    try {
      const { error } = await supabase.from("prospeccao_interacoes").delete().eq("id", id);
      if (error) throw error;
      setInteractions(prev => prev.filter(i => i.id !== id));
      toast.success("Interação removida");
    } catch (error) {
      toast.error("Erro ao remover");
    }
  };

  if (!lead) return null;

  const diasComoLead = Math.floor((Date.now() - new Date(lead.data_lead).getTime()) / (1000 * 60 * 60 * 24));
  const currentEtapa = ETAPAS.find(e => e.id === lead.etapa);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-xl overflow-y-auto p-0 gap-0">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-6 border-b space-y-4 shrink-0 bg-zinc-50 dark:bg-zinc-900/50 sticky top-0 z-10">
            <div className="flex items-start justify-between">
              <div className="space-y-1 flex-1 min-w-0 mr-4">
                <input
                  className="text-2xl font-bold bg-transparent border-none outline-none w-full focus:ring-0 p-0 h-auto"
                  defaultValue={lead.nome}
                  onBlur={(e) => {
                    if (e.target.value !== lead.nome) handleUpdate('nome', e.target.value);
                  }}
                />
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn("text-[10px] font-bold uppercase", `text-${currentEtapa?.color}`)} style={{ borderColor: currentEtapa?.hex, color: currentEtapa?.hex }}>
                    {currentEtapa?.label}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">
                    Lead há {diasComoLead} {diasComoLead === 1 ? 'dia' : 'dias'} (desde {new Date(lead.data_lead).toLocaleDateString('pt-BR')})
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDuplicate(lead)}>
                  <Copy size={16} />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical size={16} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem 
                      className="text-destructive focus:text-destructive"
                      onClick={() => onDelete(lead.id)}
                    >
                      <Trash2 size={14} className="mr-2" /> Remover lead
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Select value={lead.etapa} onValueChange={(v) => handleUpdate('etapa', v)}>
                <SelectTrigger className="h-8 w-auto text-xs gap-2">
                  <ChevronRight size={14} />
                  <SelectValue placeholder="Mover para..." />
                </SelectTrigger>
                <SelectContent>
                  {ETAPAS.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {lead.etapa === 'fechado' && !lead.cliente_id && (
                <Button size="sm" variant="default" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => onConvert(lead)}>
                  <Users size={14} className="mr-1.5" /> Cadastrar como Cliente
                </Button>
              )}
            </div>
          </div>

          <div className="flex-1 p-6 space-y-8 pb-12">
            {/* Seção 1: Informações */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold text-zinc-500 uppercase tracking-wider">
                <Info size={16} /> Informações Básicas
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nicho</Label>
                  <Input 
                    placeholder="Ex: Estética" 
                    defaultValue={lead.nicho} 
                    className="h-8 text-sm"
                    onBlur={(e) => handleUpdate('nicho', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Agência Destino</Label>
                  <Select value={lead.agencia_destino || undefined} onValueChange={(v) => handleUpdate('agencia_destino', v)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Selecionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      {AGENCIAS.map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Origem</Label>
                  <Select value={lead.origem || undefined} onValueChange={(v) => handleUpdate('origem', v)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Origem..." />
                    </SelectTrigger>
                    <SelectContent>
                      {ORIGENS.map(o => (
                        <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Detalhe da Origem</Label>
                  <Input 
                    placeholder="Ex: Pop Agro" 
                    defaultValue={lead.origem_detalhe || ""} 
                    className="h-8 text-sm"
                    onBlur={(e) => handleUpdate('origem_detalhe', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Valor Estimado</Label>
                  <Input 
                    inputMode="numeric"
                    defaultValue={lead.valor_estimado ? maskBRLInput(String(Math.round(lead.valor_estimado * 100))) : ""} 
                    className="h-8 text-sm font-bold text-emerald-600"
                    onChange={(e) => e.target.value = maskBRLInput(e.target.value)}
                    onBlur={(e) => handleUpdate('valor_estimado', parseBRLInput(e.target.value))}
                  />
                </div>
                <div className="space-y-3 pt-1">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs">Probabilidade</Label>
                    <span className={cn(
                      "text-xs font-bold",
                      (lead.probabilidade || 0) < 30 ? "text-red-500" : (lead.probabilidade || 0) < 70 ? "text-amber-500" : "text-emerald-500"
                    )}>
                      {lead.probabilidade || 0}%
                    </span>
                  </div>
                  <Slider 
                    defaultValue={[lead.probabilidade || 0]} 
                    max={100} 
                    step={5} 
                    onValueCommit={(v) => handleUpdate('probabilidade', v[0])}
                  />
                </div>
              </div>
            </section>

            <Separator />

            {/* Seção 2: Próximos Passos */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold text-zinc-500 uppercase tracking-wider">
                <Target size={16} /> Próximos Passos
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Data do Próximo Contato</Label>
                  <div className="flex gap-2">
                    <Input 
                      type="date" 
                      defaultValue={lead.data_proximo_contato || ""} 
                      className="h-9 text-sm"
                      onChange={(e) => handleUpdate('data_proximo_contato', e.target.value)}
                    />
                    <Button variant="outline" className="gap-2 h-9 text-xs" onClick={() => onCreateDemanda(lead)}>
                      <Plus size={14} /> Criar Demanda
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            <Separator />

            {/* Seção 3: Histórico de Interações */}
            <section className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 text-sm font-bold text-zinc-500 uppercase tracking-wider">
                  <History size={16} /> Histórico de Interações
                </div>
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5" onClick={() => setIsAddingInteraction(!isAddingInteraction)}>
                  {isAddingInteraction ? <XCircle size={14} /> : <Plus size={14} />}
                  {isAddingInteraction ? "Cancelar" : "Nova"}
                </Button>
              </div>

              {isAddingInteraction && (
                <div className="p-4 border rounded-lg bg-muted/30 space-y-3 animate-in fade-in zoom-in-95 duration-200">
                  <div className="grid grid-cols-2 gap-3">
                    <Select value={newInteraction.tipo} onValueChange={(v) => setNewInteraction({...newInteraction, tipo: v})}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mensagem">Mensagem</SelectItem>
                        <SelectItem value="reuniao">Reunião</SelectItem>
                        <SelectItem value="proposta">Proposta</SelectItem>
                        <SelectItem value="follow_up">Follow-up</SelectItem>
                        <SelectItem value="nota">Nota</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input 
                      type="datetime-local" 
                      className="h-8 text-xs" 
                      value={newInteraction.data} 
                      onChange={(e) => setNewInteraction({...newInteraction, data: e.target.value})}
                    />
                  </div>
                  <Textarea 
                    placeholder="O que aconteceu no contato?" 
                    className="text-sm min-h-[80px]"
                    value={newInteraction.descricao}
                    onChange={(e) => setNewInteraction({...newInteraction, descricao: e.target.value})}
                  />
                  <Button size="sm" className="w-full h-8 text-xs" onClick={addInteraction}>Registrar Interação</Button>
                </div>
              )}

              {loadingInteractions ? (
                <div className="space-y-2">
                  <div className="h-10 rounded border bg-card animate-pulse" />
                  <div className="h-10 rounded border bg-card animate-pulse" />
                </div>
              ) : interactions.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed rounded-lg text-muted-foreground italic text-xs">
                  Nenhuma interação registrada ainda.
                </div>
              ) : (
                <div className="space-y-3 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[1px] before:bg-border">
                  {interactions.map((it) => (
                    <div key={it.id} className="relative pl-7 group">
                      <div className="absolute left-0 top-1.5 h-6 w-6 rounded-full bg-background border flex items-center justify-center z-10">
                        {it.tipo === 'mensagem' && <MessageSquare size={12} className="text-blue-500" />}
                        {it.tipo === 'reuniao' && <Users size={12} className="text-violet-500" />}
                        {it.tipo === 'proposta' && <Briefcase size={12} className="text-amber-500" />}
                        {it.tipo === 'follow_up' && <ChevronRight size={12} className="text-zinc-500" />}
                        {it.tipo === 'nota' && <FileText size={12} className="text-zinc-500" />}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-[9px] py-0 px-1 font-bold uppercase">{it.tipo.replace('_', ' ')}</Badge>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(it.data_interacao).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => deleteInteraction(it.id)}
                          >
                            <Trash2 size={12} className="text-destructive" />
                          </Button>
                        </div>
                        <p className="text-xs leading-relaxed">{it.descricao}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <Separator />

            {/* Seção 4: Observações */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold text-zinc-500 uppercase tracking-wider">
                <FileText size={16} /> Observações Livres
              </div>
              <Textarea 
                placeholder="Notas gerais sobre o lead..." 
                className="min-h-[150px] text-sm leading-relaxed"
                defaultValue={lead.observacoes || ""}
                onChange={(e) => debouncedUpdateObs(e.target.value)}
              />
            </section>

            {/* Seção 5: Perdido */}
            {lead.etapa === 'perdido' && (
              <section className="space-y-4 p-4 border rounded-lg bg-rose-50 dark:bg-rose-950/10 border-rose-100 dark:border-rose-900/30">
                <div className="flex items-center gap-2 text-sm font-bold text-rose-600 uppercase tracking-wider">
                  <XCircle size={16} /> Motivo da Perda
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-rose-600">Descrição do motivo</Label>
                  <Textarea 
                    placeholder="Por que não fechou?" 
                    className="text-sm bg-background border-rose-200"
                    defaultValue={lead.motivo_perda || ""}
                    onBlur={(e) => handleUpdate('motivo_perda', e.target.value)}
                  />
                </div>
                <Button 
                  variant="outline" 
                  className="w-full h-8 text-xs border-rose-200 hover:bg-rose-100 dark:hover:bg-rose-900/30"
                  onClick={() => {
                    handleUpdate('etapa', 'lead');
                    handleUpdate('motivo_perda', null);
                  }}
                >
                  Reabrir Lead
                </Button>
              </section>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
