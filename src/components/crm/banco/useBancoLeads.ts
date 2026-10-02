// Estado do Banco de leads: abas, leads e estado da sincronização, com Realtime (o que muda na planilha aparece
// sozinho).
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AbaBanco, LeadBanco } from "@/lib/bancoLeads";
import { carregarAbasBanco, carregarLeadsBanco, statusPlanilha, type StatusPlanilha } from "@/lib/bancoLeadsDados";

function doPayload(n: any): LeadBanco {
  return { id: n.id, aba_id: n.aba_id, posicao: n.posicao, dados: n.dados ?? {}, lead_crm_id: n.lead_crm_id ?? null, updated_at: n.updated_at };
}

export function useBancoLeads() {
  const [abas, setAbas] = useState<AbaBanco[]>([]);
  const [leads, setLeads] = useState<LeadBanco[]>([]);
  const [status, setStatus] = useState<StatusPlanilha | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    try {
      const [a, l, s] = await Promise.all([carregarAbasBanco(), carregarLeadsBanco(), statusPlanilha().catch(() => null)]);
      setAbas(a);
      setLeads(l);
      setStatus(s);
      setErro(null);
    } catch (e: any) {
      setErro(e?.message ?? String(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void recarregar();
    const canal = supabase
      .channel("banco-leads")
      .on("postgres_changes", { event: "*", schema: "public", table: "banco_leads" }, (p: any) => {
        if (p.eventType === "DELETE") {
          const id = p.old?.id;
          if (id) setLeads((prev) => prev.filter((l) => l.id !== id));
          return;
        }
        if (!p.new?.id) return;
        const novo = doPayload(p.new);
        setLeads((prev) => {
          const i = prev.findIndex((l) => l.id === novo.id);
          if (i < 0) return [...prev, novo];
          const copia = prev.slice();
          copia[i] = novo;
          return copia;
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "banco_leads_abas" }, () => {
        void carregarAbasBanco().then(setAbas).catch(() => {});
      })
      .subscribe();
    const relogio = window.setInterval(() => {
      void statusPlanilha().then(setStatus).catch(() => {});
    }, 60_000);
    return () => {
      window.clearInterval(relogio);
      void supabase.removeChannel(canal);
    };
  }, [recarregar]);

  return { abas, leads, setLeads, status, carregando, erro, recarregar };
}
