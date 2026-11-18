// Cabeçalhos para as edge functions que exigem a sessão do André (r2, instagram): o token do login Google, não a chave pública.
import { supabase } from "@/integrations/supabase/client";

const CHAVE_PUBLICA = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export async function cabecalhosDaSessao(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession(); // renova o token vencido sozinho
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada: entre de novo com o Google.");
  return { apikey: CHAVE_PUBLICA, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}
