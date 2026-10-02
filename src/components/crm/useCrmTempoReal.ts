// O CRM se atualiza sozinho quando um lead muda fora desta tela (pela planilha, por exemplo): escuta `prospeccao` e
// `crm_eventos` e recarrega com 1 s de espera, juntando avisos em rajada. Spec 2026-10-01-banco-de-leads §8.1.
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCrm } from "@/components/crm/CrmContexto";

export function useCrmTempoReal() {
  const { recarregar } = useCrm();
  const ref = useRef(recarregar);
  ref.current = recarregar;
  useEffect(() => {
    let espera: number | undefined;
    const agendar = () => {
      window.clearTimeout(espera);
      espera = window.setTimeout(() => void ref.current(), 1000);
    };
    const canal = supabase
      .channel("crm-tempo-real")
      .on("postgres_changes", { event: "*", schema: "public", table: "prospeccao" }, agendar)
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_eventos" }, agendar)
      .subscribe();
    return () => {
      window.clearTimeout(espera);
      void supabase.removeChannel(canal);
    };
  }, []);
}
