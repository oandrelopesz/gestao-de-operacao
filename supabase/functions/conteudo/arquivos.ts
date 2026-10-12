// Arquivos da aba Conteúdo no bucket de arquivos do sistema (R2, dentro de instagram/conteudo/), lidos e gravados pela função.
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const VARS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_ARQUIVOS"];
export const arquivosConfigurados = () => VARS.every((v) => !!Deno.env.get(v));

function r2() {
  const faltam = VARS.filter((v) => !Deno.env.get(v));
  if (faltam.length) throw new Error(`Faltam secrets do R2: ${faltam.join(", ")}.`);
  return {
    // retries: 2 (o padrão do aws4fetch é 10, com espera crescente: estouraria o tempo da função)
    aws: new AwsClient({
      accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!, secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
      service: "s3", region: "auto", retries: 2,
    }),
    base: `https://${Deno.env.get("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com/${Deno.env.get("R2_BUCKET_ARQUIVOS")}`,
  };
}

const codificar = (chave: string) => chave.split("/").map(encodeURIComponent).join("/");

export async function guardar(chave: string, bytes: Uint8Array, tipo: string): Promise<void> {
  const { aws, base } = r2();
  const r = await aws.fetch(`${base}/${codificar(chave)}`, {
    method: "PUT", body: bytes as unknown as BodyInit, headers: { "Content-Type": tipo }, signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) {
    console.error("R2 PUT", r.status, (await r.text().catch(() => "")).slice(0, 300));
    throw new Error(`Não foi possível guardar o arquivo (R2 respondeu ${r.status}).`);
  }
}

export async function ler(chave: string): Promise<{ bytes: Uint8Array; tipo: string }> {
  const { aws, base } = r2();
  const r = await aws.fetch(`${base}/${codificar(chave)}`, { method: "GET", signal: AbortSignal.timeout(30_000) });
  if (!r.ok) {
    await r.body?.cancel();
    throw new Error(`Arquivo não encontrado no R2 (${r.status}): ${chave}`);
  }
  return { bytes: new Uint8Array(await r.arrayBuffer()), tipo: r.headers.get("content-type") || "application/octet-stream" };
}

export const base64 = (bytes: Uint8Array): string => encodeBase64(bytes);

export async function dataUri(chave: string): Promise<string> {
  const a = await ler(chave);
  return `data:${a.tipo};base64,${base64(a.bytes)}`;
}
