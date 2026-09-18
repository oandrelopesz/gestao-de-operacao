// Entrega ao app um access token válido do Google Drive (renovando com o refresh token quando
// preciso). Como o app roda sem login, a proteção é a chave SWIPE_KEY (secret do projeto):
// o navegador manda `x-swipe-key` e só recebe o token se bater.
//   GET  ?action=status  -> { connected, expires_at, scope }   (sem chave)
//   POST                 -> { access_token, expires_at }        (com x-swipe-key)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-swipe-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

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
      client_id: GOOGLE_CLIENT_ID ?? null,
      redirect_uri: Deno.env.get("GOOGLE_REDIRECT_URI") ?? null,
    });
  }

  if (!SWIPE_KEY) return json({ error: "SWIPE_KEY não configurada no projeto" }, 503);
  const provided = req.headers.get("x-swipe-key") || "";
  if (!provided || !timingSafeEqual(provided, SWIPE_KEY)) {
    return json({ error: "Chave do swipe file inválida" }, 403);
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
