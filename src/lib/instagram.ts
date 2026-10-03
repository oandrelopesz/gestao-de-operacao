// Aba Instagram: contas (ig_contas) e chamadas à função instagram.
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type ContaInstagram = Tables<"ig_contas">;

const FUNCAO = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram`;

async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
  const r = await fetch(FUNCAO, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.erro ?? `A função instagram respondeu ${r.status}.`);
  return j as T;
}

export async function fetchContas(): Promise<ContaInstagram[]> {
  const { data, error } = await supabase.from("ig_contas").select("*").order("ativa", { ascending: false }).order("nome");
  if (error) throw error;
  return data ?? [];
}

export const sincronizarContas = () => chamar<{ contas: number; paginas: number }>({ acao: "sincronizar" });

export async function vincularCliente(contaId: string, clienteId: string | null): Promise<void> {
  const { error } = await supabase.from("ig_contas").update({ cliente_id: clienteId }).eq("id", contaId);
  if (error) throw error;
}
