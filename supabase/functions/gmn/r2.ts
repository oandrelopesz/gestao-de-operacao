// Upload no Cloudflare R2 (API S3, assinatura via aws4fetch) e URL pública do bucket.
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const VARS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_BASE"];

export function r2Configurado(): boolean {
  return VARS.every((v) => !!Deno.env.get(v));
}

/** Envia e devolve a URL pública (`R2_PUBLIC_BASE/chave`). */
export async function enviarR2(chave: string, bytes: Uint8Array, tipo: string): Promise<string> {
  if (!r2Configurado()) throw new Error(`Faltam secrets do R2 (${VARS.join(", ")}).`);
  const aws = new AwsClient({
    accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
    secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
    service: "s3",
    region: "auto",
  });
  const url = `https://${Deno.env.get("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com/${Deno.env.get("R2_BUCKET")}/${chave}`;
  const r = await aws.fetch(url, { method: "PUT", body: bytes, headers: { "Content-Type": tipo } });
  if (!r.ok) throw new Error(`R2 respondeu ${r.status} ao enviar a imagem: ${(await r.text()).slice(0, 200)}`);
  return `${Deno.env.get("R2_PUBLIC_BASE")!.replace(/\/+$/, "")}/${chave}`;
}
