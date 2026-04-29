import React, { useEffect, useState } from "react";
import { Bell, AlertTriangle, XCircle, Info } from "lucide-react";
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

interface SaldoAlerta {
  id: string;
  cliente_nome: string;
  cliente_agencia: string;
  plataformas: string[];
  saldo_atual_estimado: number;
  dias_restantes: number;
  status_alerta: 'baixo' | 'zerado' | 'ok';
}

export function NotificationBell() {
  const [alertas, setAlertas] = useState<SaldoAlerta[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAlertas = async () => {
    try {
      const { data, error } = await supabase
        .from("saldo_ads_view" as any)
        .select("*")
        .neq("status_alerta", "ok")
        .eq("ativo", true);

      if (error) throw error;
      setAlertas(data as any[] || []);
    } catch (error) {
      console.error("Erro ao buscar alertas de saldo:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlertas();
    
    // Inscrever para mudanças (opcional, mas bom para tempo real)
    const channel = supabase
      .channel('saldo-alertas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saldo_ads' }, () => {
        fetchAlertas();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recargas' }, () => {
        fetchAlertas();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const count = alertas.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell size={20} className={cn(count > 0 && "text-primary animate-pulse-slow")} />
          {count > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-[10px]"
            >
              {count}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          Notificações
          {count > 0 && (
            <Badge variant="outline" className="text-[10px] font-normal">
              {count} {count === 1 ? 'alerta' : 'alertas'}
            </Badge>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-xs text-muted-foreground">Carregando...</div>
          ) : count === 0 ? (
            <div className="p-8 text-center space-y-2">
              <div className="flex justify-center">
                <Info className="text-muted-foreground opacity-20" size={32} />
              </div>
              <p className="text-sm text-muted-foreground">Tudo certo por aqui!</p>
              <p className="text-[11px] text-muted-foreground/60">Nenhum saldo crítico detectado.</p>
            </div>
          ) : (
            alertas.map((alerta) => (
              <DropdownMenuItem 
                key={alerta.id} 
                className="p-3 cursor-default focus:bg-accent/50"
              >
                <div className="flex gap-3 w-full">
                  <div className="mt-1">
                    {alerta.status_alerta === 'zerado' ? (
                      <XCircle className="text-destructive" size={16} />
                    ) : (
                      <AlertTriangle className="text-amber-500" size={16} />
                    )}
                  </div>
                  <div className="space-y-1 flex-1">
                    <p className="text-xs font-semibold leading-none">
                      {alerta.cliente_nome}
                    </p>
                    <p className="text-[11px] text-muted-foreground line-clamp-1">
                      {alerta.plataformas.join(", ")}
                    </p>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] font-medium text-destructive">
                        Saldo: {formatBRL(alerta.saldo_atual_estimado)}
                      </span>
                      <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                        {alerta.dias_restantes <= 0 
                          ? 'Saldo zerado' 
                          : `${Math.floor(alerta.dias_restantes)} ${Math.floor(alerta.dias_restantes) === 1 ? 'dia restante' : 'dias restantes'}`
                        }
                      </span>
                    </div>
                  </div>
                </div>
              </DropdownMenuItem>
            ))
          )}
        </div>
        
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-center justify-center text-xs text-muted-foreground p-2 cursor-pointer">
          Ver todos os saldos
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
