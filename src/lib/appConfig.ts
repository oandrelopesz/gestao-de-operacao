import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Configurações simples do sistema (tabela app_config: chave → valor JSON). */
export async function getConfig<T>(chave: string, padrao: T): Promise<T> {
  const { data, error } = await supabase.from("app_config" as any).select("valor").eq("chave", chave).maybeSingle();
  if (error || !data) return padrao;
  return ((data as any).valor ?? padrao) as T;
}

export async function setConfig(chave: string, valor: unknown): Promise<void> {
  const { error } = await supabase.from("app_config" as any).upsert({ chave, valor, updated_at: new Date().toISOString() } as any);
  if (error) throw error;
}

export function useConfig<T>(chave: string, padrao: T): [T, (v: T) => Promise<void>, boolean] {
  const [valor, setValor] = useState<T>(padrao);
  const [carregando, setCarregando] = useState(true);
  useEffect(() => {
    let vivo = true;
    getConfig(chave, padrao).then((v) => { if (vivo) { setValor(v); setCarregando(false); } });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  const salvar = async (v: T) => {
    const antes = valor;
    setValor(v);
    try { await setConfig(chave, v); } catch (e) { setValor(antes); throw e; }
  };
  return [valor, salvar, carregando];
}
