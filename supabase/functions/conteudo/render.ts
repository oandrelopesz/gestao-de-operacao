// HTML para JPG pelo Cloudflare Browser Rendering (API REST de screenshot) e o CSS das fontes do Google.
import { ALTURA, LARGURA } from "./regras.ts";

/** Limite de uso do Cloudflare (429): a montagem espera e tenta de novo, sem contar como tentativa. */
export class LimiteCloudflare extends Error {}

export const cloudflareConfigurado = () => !!Deno.env.get("CLOUDFLARE_ACCOUNT_ID") && !!Deno.env.get("CLOUDFLARE_BROWSER_TOKEN");

export async function renderizar(html: string): Promise<Uint8Array> {
  if (!cloudflareConfigurado()) throw new Error("Faltam os secrets CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_BROWSER_TOKEN.");
  const conta = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${conta}/browser-rendering/screenshot`, {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("CLOUDFLARE_BROWSER_TOKEN")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      html,
      viewport: { width: LARGURA, height: ALTURA },
      screenshotOptions: { type: "jpeg", quality: 90 },
      gotoOptions: { waitUntil: "load", timeout: 30000 },
      waitForSelector: { selector: "body[data-pronto]", timeout: 20000 },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const tipo = r.headers.get("content-type") ?? "";
  if (r.ok && tipo.startsWith("image/")) return new Uint8Array(await r.arrayBuffer());
  const corpo = await r.text().catch(() => "");
  console.error("Cloudflare", r.status, corpo.slice(0, 300));
  if (r.status === 429) throw new LimiteCloudflare("Limite do Cloudflare atingido; a montagem tenta de novo em 10 minutos.");
  throw new Error(`O Cloudflare não conseguiu montar a lâmina (${r.status}).`);
}

const NAVEGADOR = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0 Safari/537.36";

/** CSS das fontes do Google: tenta os pesos comuns e, se a família não tiver todos, menos pesos. */
export async function cssGoogle(familia: string): Promise<string> {
  const f = encodeURIComponent(familia.trim()).replace(/%20/g, "+");
  for (const pesos of [":wght@300;400;500;600;700;800", ":wght@400;700", ""]) {
    const r = await fetch(`https://fonts.googleapis.com/css2?family=${f}${pesos}&display=block`, {
      headers: { "User-Agent": NAVEGADOR }, signal: AbortSignal.timeout(15_000),
    });
    if (r.ok) return await r.text();
    await r.body?.cancel();
  }
  throw new Error(`A fonte "${familia}" não existe no Google Fonts.`);
}
