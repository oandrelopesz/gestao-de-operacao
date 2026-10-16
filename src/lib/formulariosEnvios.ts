// Avisos que os formulários públicos gravam em formularios_envios (RPC registrar_envio_formulario).
// Alimentam o contador do menu, os selos "Novo" e a recarga da sub-aba aberta. Tempo real via Realtime.
import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AvisoFormulario, FormularioId } from "@/lib/dadosInternos";

// O types.ts gerado ainda não conhece a tabela nova: por isso `as any`.
const tabela = () => supabase.from("formularios_envios" as any) as any;

export async function buscarNaoVistos(): Promise<AvisoFormulario[]> {
  const { data, error } = await tabela().select("*").is("visto_em", null).order("recebido_em", { ascending: false }).limit(500);
  if (error) throw error;
  return (data ?? []) as AvisoFormulario[];
}

export async function marcarVistos(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await tabela().update({ visto_em: new Date().toISOString() }).in("id", ids);
  if (error) throw error;
}

/** Sem argumento limpa todos os formulários (botão "Limpar notificações"). */
export async function marcarTodosVistos(formulario?: FormularioId): Promise<void> {
  let q = tabela().update({ visto_em: new Date().toISOString() }).is("visto_em", null);
  if (formulario) q = q.eq("formulario", formulario);
  const { error } = await q;
  if (error) throw error;
}

/** Avisos não vistos, sempre atualizados: Realtime + recarga ao voltar para a janela (só o banco do app). */
export function useAvisosFormularios(): { naoVistos: AvisoFormulario[]; carregado: boolean; recarregar: () => Promise<void> } {
  const [naoVistos, setNaoVistos] = useState<AvisoFormulario[]>([]);
  const [carregado, setCarregado] = useState(false);
  const canal = `formularios-envios-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const recarregar = useCallback(async () => {
    try {
      setNaoVistos(await buscarNaoVistos());
    } catch {
      // tabela ainda não aplicada ou rede fora: mantém o que tinha
    } finally {
      setCarregado(true);
    }
  }, []);

  useEffect(() => {
    void recarregar();
    const ch = supabase
      .channel(canal)
      .on("postgres_changes", { event: "*", schema: "public", table: "formularios_envios" }, () => void recarregar())
      .subscribe();
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void recarregar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      supabase.removeChannel(ch);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [canal, recarregar]);

  return { naoVistos, carregado, recarregar };
}
