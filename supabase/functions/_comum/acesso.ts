// Acesso das edge functions que o navegador e os robôs chamam (segurança, 17/11/2026).
// Libera a chamada se vier (1) a sessão do Supabase de um e-mail permitido (Authorization: Bearer <jwt do login Google>)
// ou (2) a chave interna dos robôs/cron (x-cron-key = secret CRON_KEY). A chave pública sozinha NÃO libera nada.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

const PADRAO = "contato@andrelopes.digital";

export function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function acessoLiberado(req: Request): Promise<boolean> {
  const cron = Deno.env.get("CRON_KEY") || "";
  const enviada = req.headers.get("x-cron-key") || "";
  if (cron.length >= 32 && enviada && iguais(enviada, cron)) return true;

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token || token.split(".").length !== 3) return false;
  const permitidos = (Deno.env.get("ALLOWED_GOOGLE_EMAILS") || PADRAO).split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return false;
    return permitidos.includes(String(data.user.email || "").toLowerCase());
  } catch {
    return false;
  }
}
