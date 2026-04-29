import React, { useEffect, useState, useMemo } from "react";
import { Bell, AlertTriangle, AlertOctagon, XCircle, Info, ArrowRight, DollarSign, Wallet } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/clientes";
import { useNavigate } from "@tanstack/react-router";

interface SaldoAlerta {
  id: string;
  cliente_id: string;
  cliente_nome: string;
  cliente_agencia: string;
  plataformas: string[];
  saldo_atual_estimado: number;
  dias_restantes: number;
  status_alerta: 'alerta' | 'critico' | 'zerado' | 'ok' | 'pausado' | 'cartao' | 'inativo' | 'sem_recarga' | 'sem_verba';
  data_ultima_recarga?: string;
  saldo_total_acumulado?: number;
}

interface FinanceiroAlerta {
  fonte_id: string;
  nome: string;
  valor_mensal: number;
  dia_recebimento: number;
  status_mes: 'recebido' | 'atrasado' | 'pendente' | 'a_vencer';
}

export function NotificationBell() {
  const [alertas, setAlertas] = useState<SaldoAlerta[]>([]);
  const [financeiroAlertas, setFinanceiroAlertas] = useState<FinanceiroAlerta[]>([]);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchAlertas = async () => {
    try {
      const { data: saldoData, error: saldoError } = await supabase
        .from("saldo_ads_view" as any)
        .select("*")
        .in("status_alerta", ["alerta", "critico", "zerado"])
        .order("dias_restantes", { ascending: true });

      if (saldoError) throw saldoError;

      const { data: finData, error: finError } = await supabase
        .from("financeiro_view" as any)
        .select("*")
        .in("status_mes", ["pendente", "atrasado"]);

      if (finError) throw finError;

      setAlertas(saldoData as any[] || []);
      setFinanceiroAlertas(finData as any[] || []);
    } catch (error) {
      console.error("Erro ao buscar alertas:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlertas();
    
    // Carregar IDs ocultos do localStorage
    const saved = localStorage.getItem("hidden_notification_ids");
    if (saved) {
      try {
        setHiddenIds(JSON.parse(saved));
      } catch (e) {
        console.error("Erro ao carregar notificações ocultas", e);
      }
    }
    
    // Inscrever para mudanças
    const channel = supabase
      .channel('notificacoes-bell-global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saldo_ads' }, () => fetchAlertas())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recargas' }, () => fetchAlertas())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'financeiro_fontes' }, () => fetchAlertas())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'financeiro_recebimentos' }, () => fetchAlertas())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const visibleAlertas = useMemo(() => alertas.filter(a => !hiddenIds.includes(a.id)), [alertas, hiddenIds]);
  const visibleFinAlertas = useMemo(() => financeiroAlertas.filter(a => !hiddenIds.includes(a.fonte_id)), [financeiroAlertas, hiddenIds]);
  const count = visibleAlertas.length + visibleFinAlertas.length;

  // Ordenação: Zerados > Críticos > Alertas (por dias_restantes)
  const sortedAlertas = useMemo(() => {
    const statusOrder = { zerado: 0, critico: 1, alerta: 2 };
    return [...visibleAlertas].sort((a, b) => {
      const orderA = statusOrder[a.status_alerta as keyof typeof statusOrder] ?? 99;
      const orderB = statusOrder[b.status_alerta as keyof typeof statusOrder] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      return (a.dias_restantes || 0) - (b.dias_restantes || 0);
    });
  }, [visibleAlertas]);

  const hasZerado = visibleAlertas.some(a => a.status_alerta === 'zerado');
  const hasCritico = visibleAlertas.some(a => a.status_alerta === 'critico');
  const hasAtrasadoFin = visibleFinAlertas.some(a => a.status_mes === 'atrasado');

  const handleClearAll = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const allIds = [...alertas.map(a => a.id), ...financeiroAlertas.map(a => a.fonte_id)];
    const newHiddenIds = Array.from(new Set([...hiddenIds, ...allIds]));
    setHiddenIds(newHiddenIds);
    localStorage.setItem("hidden_notification_ids", JSON.stringify(newHiddenIds));
  };

  const formatDate = (iso?: string) => {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}`;
  };

  const handleItemClick = (alerta: SaldoAlerta) => {
    navigate({ 
      to: "/saldo", 
      search: (prev: any) => ({ ...prev, cliente_id: alerta.cliente_id, highlight: alerta.id }) 
    });
  };

  const handleFinClick = (fonteId: string) => {
    navigate({ to: "/financeiro" });
  };

  const zerados = sortedAlertas.filter(a => a.status_alerta === 'zerado');
  const criticos = sortedAlertas.filter(a => a.status_alerta === 'critico');
  const apenasAlertas = sortedAlertas.filter(a => a.status_alerta === 'alerta');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell 
            size={20} 
            className={cn(
              count > 0 && "animate-pulse-slow",
              (hasZerado || hasAtrasadoFin) ? "text-red-600 dark:text-red-400" : (hasCritico || count > 0) ? "text-primary" : ""
            )} 
          />
          {count > 0 && (
            <Badge 
              className={cn(
                "absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-[10px] font-bold border-2 border-background",
                (hasZerado || hasAtrasadoFin) ? "bg-red-700 animate-pulse" : (hasCritico ? "bg-red-500" : "bg-amber-500")
              )}
            >
              {count}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 md:w-96 p-0 overflow-hidden">
        <DropdownMenuLabel className="flex items-center justify-between p-3 bg-muted/30">
          <div className="flex flex-col">
            <span className="text-sm font-bold">Notificações</span>
            {count > 0 && (
              <span className="text-[10px] text-muted-foreground font-normal">
                {count} {count === 1 ? 'alerta pendente' : 'alertas pendentes'}
              </span>
            )}
          </div>
          {count > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 px-2 text-[10px] text-muted-foreground hover:text-foreground hover:bg-background/50"
              onClick={handleClearAll}
            >
              Limpar tudo
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="m-0" />
        
        <div className="max-h-[32rem] overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">Carregando...</div>
          ) : count === 0 ? (
            <div className="p-10 text-center space-y-2">
              <div className="flex justify-center">
                <Info className="text-muted-foreground/30" size={40} />
              </div>
              <p className="text-sm font-medium">Tudo certo por aqui!</p>
              <p className="text-[11px] text-muted-foreground">Nenhuma notificação crítica no momento.</p>
            </div>
          ) : (
            <div className="py-1">
              {/* Seção de Saldo Ads */}
              {(zerados.length > 0 || criticos.length > 0 || apenasAlertas.length > 0) && (
                <div className="px-3 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 bg-muted/20">
                  <Wallet size={10} /> Saldo de Mídia
                </div>
              )}

              {zerados.length > 0 && (
                <>
                  <div className="px-3 py-1 text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                    <XCircle size={10} /> ZERADO ({zerados.length})
                  </div>
                  {zerados.map(alerta => (
                    <NotificationItem key={alerta.id} alerta={alerta} onClick={() => handleItemClick(alerta)} formatDate={formatDate} />
                  ))}
                </>
              )}

              {criticos.length > 0 && (
                <>
                  <div className="px-3 py-1 text-[10px] font-bold text-red-500 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertOctagon size={10} /> CRÍTICO — 1 DIA ({criticos.length})
                  </div>
                  {criticos.map(alerta => (
                    <NotificationItem key={alerta.id} alerta={alerta} onClick={() => handleItemClick(alerta)} formatDate={formatDate} />
                  ))}
                </>
              )}

              {apenasAlertas.length > 0 && (
                <>
                  <div className="px-3 py-1 text-[10px] font-bold text-amber-500 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle size={10} /> ATENÇÃO — 2-3 DIAS ({apenasAlertas.length})
                  </div>
                  {apenasAlertas.map(alerta => (
                    <NotificationItem key={alerta.id} alerta={alerta} onClick={() => handleItemClick(alerta)} formatDate={formatDate} />
                  ))}
                </>
              )}

              {/* Seção de Financeiro */}
              {visibleFinAlertas.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <div className="px-3 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 bg-muted/20">
                    <DollarSign size={10} /> Financeiro Pessoal
                  </div>
                  {visibleFinAlertas.map(alerta => (
                    <FinanceiroNotificationItem key={alerta.fonte_id} alerta={alerta} onClick={() => handleFinClick(alerta.fonte_id)} />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
        
        <DropdownMenuSeparator className="m-0" />
        <DropdownMenuItem 
          className="text-center justify-center text-xs font-medium p-3 cursor-pointer hover:bg-muted/50 gap-2"
          onClick={() => navigate({ to: "/saldo" })}
        >
          Ver todos os saldos <ArrowRight size={12} />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationItem({ alerta, onClick, formatDate }: { alerta: SaldoAlerta, onClick: () => void, formatDate: (d?: string) => string }) {
  const isZerado = alerta.status_alerta === 'zerado';
  const isCritico = alerta.status_alerta === 'critico';
  
  return (
    <DropdownMenuItem 
      className={cn(
        "p-3 mx-1 my-0.5 cursor-pointer rounded-md transition-all flex flex-col gap-1 border-l-2",
        isZerado ? "bg-red-100/50 dark:bg-red-900/30 border-l-red-700 focus:bg-red-100 dark:focus:bg-red-900/40" : 
        isCritico ? "bg-red-50 dark:bg-red-950/20 border-l-red-500 focus:bg-red-100/50 dark:focus:bg-red-950/30" : 
        "bg-amber-50 dark:bg-amber-950/20 border-l-amber-500 focus:bg-amber-100/50 dark:focus:bg-amber-950/30"
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between w-full gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-bold truncate">{alerta.cliente_nome}</span>
            <span className="text-[10px] text-muted-foreground shrink-0">— {alerta.cliente_agencia}</span>
          </div>
          <div className="text-[10px] text-muted-foreground truncate opacity-80">
            [{alerta.plataformas.join(", ")}]
          </div>
        </div>
        <div className={cn("mt-0.5 shrink-0", isZerado && "animate-pulse")}>
          {isZerado ? <XCircle className="text-red-700" size={16} /> : 
           isCritico ? <AlertOctagon className="text-red-500" size={16} /> : 
           <AlertTriangle className="text-amber-500" size={16} />}
        </div>
      </div>

      <div className="flex flex-col gap-0.5 mt-1">
        <div className="flex items-center justify-between">
          <span className={cn(
            "text-[11px] font-bold",
            isZerado ? "text-red-700" : isCritico ? "text-red-600" : "text-amber-600"
          )}>
            {isZerado ? (
              `🚨 Saldo zerado desde ${formatDate(alerta.data_ultima_recarga)}`
            ) : (
              `⏱ Acaba em ${Math.floor(alerta.dias_restantes)} ${Math.floor(alerta.dias_restantes) === 1 ? 'dia' : 'dias'} (${formatDate(new Date(Date.now() + (alerta.dias_restantes * 24 * 60 * 60 * 1000)).toISOString().split('T')[0])})`
            )}
          </span>
          <span className="text-[11px] font-bold">
            {formatBRL(alerta.saldo_atual_estimado)}
          </span>
        </div>
      </div>
    </DropdownMenuItem>
  );
}

function FinanceiroNotificationItem({ alerta, onClick }: { alerta: FinanceiroAlerta, onClick: () => void }) {
  const isAtrasado = alerta.status_mes === 'atrasado';
  
  return (
    <DropdownMenuItem 
      className={cn(
        "p-3 mx-1 my-0.5 cursor-pointer rounded-md transition-all flex flex-col gap-1 border-l-2",
        isAtrasado ? "bg-red-100/50 dark:bg-red-900/30 border-l-red-700" : "bg-amber-50 dark:bg-amber-950/20 border-l-amber-500"
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between w-full gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-bold truncate">{alerta.nome}</span>
            <span className="text-[10px] text-muted-foreground shrink-0">— Financeiro</span>
          </div>
        </div>
        <div className={cn("mt-0.5 shrink-0", isAtrasado && "animate-pulse")}>
          {isAtrasado ? <AlertOctagon className="text-red-700" size={16} /> : <AlertTriangle className="text-amber-500" size={16} />}
        </div>
      </div>

      <div className="flex flex-col gap-0.5 mt-1">
        <div className="flex items-center justify-between">
          <span className={cn(
            "text-[11px] font-bold",
            isAtrasado ? "text-red-700" : "text-amber-600"
          )}>
            {isAtrasado ? `🚨 Pagamento atrasado!` : `⏱ Vence hoje (Dia ${alerta.dia_recebimento})`}
          </span>
          <span className="text-[11px] font-bold">
            {formatBRL(alerta.valor_mensal)}
          </span>
        </div>
      </div>
    </DropdownMenuItem>
  );
}
