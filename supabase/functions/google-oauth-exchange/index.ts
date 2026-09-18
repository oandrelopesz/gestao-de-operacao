// Callback do OAuth do Google: troca o `code` por tokens e grava em google_oauth_tokens.
// O `state` traz (em base64 JSON) o user_id e a URL de retorno do app, então a função
// funciona com qualquer domínio do app sem precisar reconfigurar (APP_URL é só fallback).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface StatePayload {
  user_id?: string;
  return_to?: string;
}

function parseState(raw: string): StatePayload {
  try {
    const decoded = atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
    const json = JSON.parse(decoded);
    if (json && typeof json === "object") return json as StatePayload;
  } catch {
    // formato antigo: state era só o user_id (talvez em base64)
  }
  try {
    return { user_id: atob(raw) };
  } catch {
    return { user_id: raw };
  }
}

// Só aceita voltar para URLs https (ou localhost em desenvolvimento)
function safeReturnTo(url: string | undefined, fallback: string): string {
  if (!url) return fallback;
  try {
    const u = new URL(url);
    if (u.protocol === "https:" || u.hostname === "localhost" || u.hostname === "127.0.0.1") {
      return `${u.origin}${u.pathname}`;
    }
  } catch {
    // ignora
  }
  return fallback;
}

function redirect(base: string, params: Record<string, string>): Response {
  const u = new URL(base);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  return Response.redirect(u.toString(), 302);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const APP_URL = Deno.env.get("APP_URL") || "https://gestao-de-operacao.lovable.app";
  const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
  const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const GOOGLE_REDIRECT_URI = Deno.env.get("GOOGLE_REDIRECT_URI") || `${url.origin}${url.pathname}`;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  const state = stateRaw ? parseState(stateRaw) : {};
  const returnTo = safeReturnTo(state.return_to, `${APP_URL}/admin`);

  if (oauthError) {
    return redirect(returnTo, { google_error: oauthError });
  }
  if (!code || !state.user_id) {
    return redirect(returnTo, { google_error: "missing_params" });
  }
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return redirect(returnTo, { google_error: "missing_secrets" });
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error("Google token error:", tokenData.error_description || tokenData.error);
      return redirect(returnTo, { google_error: String(tokenData.error) });
    }

    const { access_token, refresh_token, expires_in, scope } = tokenData;
    const expires_at = new Date(Date.now() + Number(expires_in || 3600) * 1000).toISOString();

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Sem refresh_token (usuário já tinha autorizado antes sem prompt=consent): mantém o antigo
    let refreshToUse: string = refresh_token || "";
    if (!refreshToUse) {
      const { data: existing } = await supabase
        .from("google_oauth_tokens")
        .select("refresh_token")
        .eq("user_id", state.user_id)
        .maybeSingle();
      refreshToUse = existing?.refresh_token || "";
    }

    const { error: upsertError } = await supabase
      .from("google_oauth_tokens")
      .upsert(
        {
          user_id: state.user_id,
          access_token,
          refresh_token: refreshToUse,
          expires_at,
          scope,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (upsertError) {
      console.error("Database error:", upsertError);
      return redirect(returnTo, { google_error: "database_error" });
    }

    return redirect(returnTo, { google_connected: "1" });
  } catch (error) {
    console.error("Unexpected error:", error);
    return redirect(returnTo, { google_error: "unexpected_error" });
  }
});
