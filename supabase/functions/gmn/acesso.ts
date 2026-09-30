// Libera a chamada como o `google-token`: ID token do Google de um e-mail permitido OU a chave do swipe file.

async function verificarIdToken(idToken: string, clientId: string, permitidos: string[]): Promise<boolean> {
  if (!idToken || !clientId || permitidos.length === 0) return false;
  try {
    const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken));
    if (!r.ok) return false;
    const c = await r.json();
    const issOk = c.iss === "accounts.google.com" || c.iss === "https://accounts.google.com";
    const verificado = c.email_verified === true || c.email_verified === "true";
    return issOk && c.aud === clientId && verificado && Number(c.exp) * 1000 > Date.now() &&
      permitidos.includes(String(c.email || "").toLowerCase());
  } catch {
    return false;
  }
}

function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function acessoConfigurado(): boolean {
  return !!Deno.env.get("SWIPE_KEY") || !!Deno.env.get("ALLOWED_GOOGLE_EMAILS");
}

export async function acessoLiberado(req: Request): Promise<boolean> {
  const chave = Deno.env.get("SWIPE_KEY") || "";
  const enviada = req.headers.get("x-swipe-key") || "";
  if (chave && enviada && iguais(enviada, chave)) return true;
  const permitidos = (Deno.env.get("ALLOWED_GOOGLE_EMAILS") || "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return verificarIdToken(req.headers.get("x-google-id-token") || "", Deno.env.get("GOOGLE_CLIENT_ID") || "", permitidos);
}
