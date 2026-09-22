// Entrega ao app um access token válido do Google Drive (renovando com o refresh token quando
// preciso). Como o app roda sem login, o token do Drive é liberado por uma de duas provas:
//   1) Login Google: o navegador manda `x-google-id-token` (ID token do Google Identity Services);
//      a função valida a assinatura/emissor/expiração e libera se o e-mail estiver em
//      ALLOWED_GOOGLE_EMAILS. É o caminho que funciona em qualquer navegador/dispositivo.
//   2) Chave: `x-swipe-key` batendo com o secret SWIPE_KEY (fallback dos navegadores já configurados).
//   GET  ?action=status  -> { connected, expires_at, scope, google_login, key_configured, client_id }
//   POST                 -> { access_token, expires_at }   (com x-google-id-token OU x-swipe-key)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-swipe-key, x-google-id-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

/**
 * Valida um ID token do Google pelo endpoint oficial tokeninfo (checa assinatura e expiração) e
 * confere emissor, `aud` (nosso client) e que o e-mail verificado está na lista permitida. Devolve
 * o e-mail quando válido, ou null. Volume é baixo (app de um usuário), então tokeninfo dá conta.
 */
async function verificarIdToken(idToken: string, clientId: string, permitidos: string[]): Promise<string | null> {
  if (!idToken || !clientId || permitidos.length === 0) return null;
  try {
    const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken));
    if (!r.ok) return null;
    const c = await r.json();
    const issOk = c.iss === "accounts.google.com" || c.iss === "https://accounts.google.com";
    const audOk = c.aud === clientId;
    const emailVerificado = c.email_verified === true || c.email_verified === "true";
    const naoExpirou = Number(c.exp) * 1000 > Date.now();
    const email = String(c.email || "").toLowerCase();
    if (issOk && audOk && emailVerificado && naoExpirou && permitidos.includes(email)) return email;
    return null;
  } catch {
    return null;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
  const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const SWIPE_KEY = Deno.env.get("SWIPE_KEY") || "";
  const ALLOWED_EMAILS = (Deno.env.get("ALLOWED_GOOGLE_EMAILS") || "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const url = new URL(req.url);

  // Token mais recente (app de usuário único)
  const { data: row, error } = await supabase
    .from("google_oauth_tokens")
    .select("id, user_id, access_token, refresh_token, expires_at, scope")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);

  if (req.method === "GET" || url.searchParams.get("action") === "status") {
    return json({
      connected: !!row?.refresh_token,
      expires_at: row?.expires_at ?? null,
      scope: row?.scope ?? null,
      key_configured: SWIPE_KEY.length > 0,
      google_login: ALLOWED_EMAILS.length > 0,
      client_id: GOOGLE_CLIENT_ID ?? null,
      redirect_uri: Deno.env.get("GOOGLE_REDIRECT_URI") ?? null,
    });
  }

  if (!SWIPE_KEY && ALLOWED_EMAILS.length === 0) {
    return json({ error: "Acesso não configurado: defina ALLOWED_GOOGLE_EMAILS (login Google) ou SWIPE_KEY." }, 503);
  }
  // Libera por login Google (qualquer navegador) OU pela chave (fallback). Basta uma das provas.
  const providedKey = req.headers.get("x-swipe-key") || "";
  const chaveOk = SWIPE_KEY.length > 0 && providedKey.length > 0 && timingSafeEqual(providedKey, SWIPE_KEY);
  const emailAutorizado = chaveOk
    ? null
    : await verificarIdToken(req.headers.get("x-google-id-token") || "", GOOGLE_CLIENT_ID || "", ALLOWED_EMAILS);
  if (!chaveOk && !emailAutorizado) {
    return json({ error: "Acesso ao swipe file não autorizado. Entre com o Google ou informe a chave em Admin." }, 403);
  }
  if (!row?.refresh_token) return json({ error: "Google Drive não conectado" }, 409);

  const expiresAt = new Date(row.expires_at).getTime();
  const precisaRenovar = !row.access_token || Number.isNaN(expiresAt) || expiresAt - Date.now() < 120_000;

  if (!precisaRenovar) {
    return json({ access_token: row.access_token, expires_at: row.expires_at });
  }

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return json({ error: "Credenciais do Google ausentes" }, 503);

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: row.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const data = await resp.json();
  if (data.error) {
    console.error("Refresh error:", data);
    return json({ error: `Google recusou renovar o token (${data.error}). Reconecte o Drive no Admin.` }, 502);
  }

  const newExpires = new Date(Date.now() + Number(data.expires_in || 3600) * 1000).toISOString();
  await supabase
    .from("google_oauth_tokens")
    .update({ access_token: data.access_token, expires_at: newExpires, updated_at: new Date().toISOString() })
    .eq("id", row.id);

  return json({ access_token: data.access_token, expires_at: newExpires });
});
