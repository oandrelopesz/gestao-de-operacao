// Arquivos do sistema no Cloudflare R2 (spec docs/superpowers/specs/2026-09-30-arquivos-r2-design.md).
//   GET                                   -> { r2 }                          os secrets do R2 estão configurados?
//   GET ?c=notas/<arquivo>                -> 302 para URL assinada           endereço fixo das imagens das notas
//   POST { acao: "enviar", chave }        -> { url }                         URL assinada de PUT (15 min)
//   POST { acao: "ler", chave }           -> { url } | 404                   URL assinada de GET (1 h)
//   POST { acao: "apagar", chaves }       -> { apagados }
//   POST { acao: "copiar", de, para }     -> { ok } | 404
//   POST { acao: "listar", prefixo }      -> { chaves }
//   POST { acao: "migrar", modulo, direcao, limite } -> { copiados, existentes, faltam, total, invalidos }  (x-swipe-key)
//   POST { acao: "conferir", modulo }     -> { iguais, soNoSupabase, soNoR2, tamanhoDiferente }         (x-swipe-key)
// POST exige o cabeçalho apikey com a chave pública do projeto: o mesmo nível de acesso que o Storage tinha.
// deno-lint-ignore-file no-explicit-any
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-swipe-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

class ErroHttp extends Error {
  constructor(public status: number, mensagem: string) {
    super(mensagem);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const env = (k: string) => Deno.env.get(k) || "";

// ------------------------------------------------------------------ chaves

/** Módulo do sistema → bucket onde os arquivos dele ficavam no Supabase (igual a src/lib/r2Chaves.ts). */
const MODULOS: Record<string, string> = { arquivos: "pdfs", notas: "notas", fluxogramas: "fluxogramas" };

/** Mesma regra de src/lib/r2Chaves.ts (esta função é publicada sozinha e não importa código do app). */
function chaveValida(chave: unknown): chave is string {
  if (typeof chave !== "string" || chave.length > 512) return false;
  const barra = chave.indexOf("/");
  if (barra < 1 || !Object.prototype.hasOwnProperty.call(MODULOS, chave.slice(0, barra))) return false;
  const caminho = chave.slice(barra + 1);
  if (!caminho || caminho.startsWith("/") || caminho.includes("//") || caminho.includes("\\")) return false;
  if (caminho.split("/").some((parte) => parte === ".." || parte === ".")) return false;
  for (const ch of caminho) {
    const codigo = ch.charCodeAt(0);
    if (codigo < 32 || codigo === 127) return false;
  }
  return true;
}

function exigirChave(chave: unknown): string {
  if (!chaveValida(chave)) throw new ErroHttp(400, "Chave de arquivo inválida.");
  return chave;
}

/** Prefixo de listagem: `<modulo>/` ou `<modulo>/<pasta>/`. */
function exigirPrefixo(prefixo: unknown): string {
  if (typeof prefixo !== "string" || !prefixo.endsWith("/")) throw new ErroHttp(400, "Prefixo inválido.");
  const semBarra = prefixo.slice(0, -1);
  if (!Object.prototype.hasOwnProperty.call(MODULOS, semBarra) && !chaveValida(semBarra)) throw new ErroHttp(400, "Prefixo inválido.");
  return prefixo;
}

function exigirModulo(modulo: unknown): string {
  if (typeof modulo !== "string" || !Object.prototype.hasOwnProperty.call(MODULOS, modulo)) throw new ErroHttp(400, "Módulo inválido.");
  return modulo;
}

// ------------------------------------------------------------------ acesso

/** Chave pública do projeto (a mesma que o app usa): a do ambiente ou um JWT anon deste projeto. */
function chavePublicaValida(apikey: string): boolean {
  if (!apikey) return false;
  if (env("SUPABASE_ANON_KEY") && apikey === env("SUPABASE_ANON_KEY")) return true;
  try {
    const ref = new URL(env("SUPABASE_URL")).hostname.split(".")[0];
    const carga = JSON.parse(atob(apikey.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return carga.role === "anon" && carga.ref === ref;
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

function exigirChaveDoSwipe(req: Request): void {
  const chave = env("SWIPE_KEY");
  const enviada = req.headers.get("x-swipe-key") || "";
  if (!chave || !enviada || !iguais(enviada, chave)) throw new ErroHttp(403, "Esta ação exige a chave do swipe (x-swipe-key).");
}

// ------------------------------------------------------------------ R2 (API S3)

const SECRETS_R2 = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_ARQUIVOS"];
const r2Configurado = () => SECRETS_R2.every((k) => !!env(k));

function r2() {
  const faltam = SECRETS_R2.filter((k) => !env(k));
  if (faltam.length) throw new ErroHttp(503, `Faltam secrets do R2: ${faltam.join(", ")}.`);
  return {
    aws: new AwsClient({ accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY"), service: "s3", region: "auto" }),
    base: `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com/${env("R2_BUCKET_ARQUIVOS")}`,
  };
}

const codificar = (chave: string) => chave.split("/").map(encodeURIComponent).join("/");

async function assinar(metodo: "GET" | "PUT", chave: string, segundos: number): Promise<string> {
  const { aws, base } = r2();
  const url = new URL(`${base}/${codificar(chave)}`);
  url.searchParams.set("X-Amz-Expires", String(segundos));
  const assinado = await aws.sign(url.toString(), { method: metodo, aws: { signQuery: true } });
  return assinado.url;
}

async function existe(chave: string): Promise<boolean> {
  const { aws, base } = r2();
  const r = await aws.fetch(`${base}/${codificar(chave)}`, { method: "HEAD" });
  if (r.status === 404) return false;
  if (!r.ok) throw new ErroHttp(502, `R2 respondeu ${r.status} ao conferir o arquivo.`);
  return true;
}

async function apagar(chaves: string[]): Promise<number> {
  const { aws, base } = r2();
  let apagados = 0;
  for (let i = 0; i < chaves.length; i += 10) {
    const lote = chaves.slice(i, i + 10);
    const respostas = await Promise.all(lote.map((c) => aws.fetch(`${base}/${codificar(c)}`, { method: "DELETE" })));
    for (const r of respostas) {
      if (!r.ok && r.status !== 404) throw new ErroHttp(502, `R2 respondeu ${r.status} ao apagar um arquivo.`);
      apagados++;
    }
  }
  return apagados;
}

async function copiar(de: string, para: string): Promise<void> {
  if (!(await existe(de))) throw new ErroHttp(404, "Arquivo de origem não está no R2.");
  const { aws, base } = r2();
  const r = await aws.fetch(`${base}/${codificar(para)}`, {
    method: "PUT",
    headers: { "x-amz-copy-source": `/${env("R2_BUCKET_ARQUIVOS")}/${codificar(de)}` },
  });
  if (!r.ok) throw new ErroHttp(502, `R2 respondeu ${r.status} ao copiar: ${(await r.text()).slice(0, 200)}`);
}

function desfazerXml(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

/** Objetos com o prefixo: chave → tamanho em bytes (segue a paginação do ListObjectsV2). */
async function listar(prefixo: string): Promise<Map<string, number>> {
  const { aws, base } = r2();
  const objetos = new Map<string, number>();
  let token = "";
  do {
    const u = new URL(base);
    u.searchParams.set("list-type", "2");
    u.searchParams.set("prefix", prefixo);
    u.searchParams.set("max-keys", "1000");
    if (token) u.searchParams.set("continuation-token", token);
    const r = await aws.fetch(u.toString());
    const xml = await r.text();
    if (!r.ok) throw new ErroHttp(502, `R2 respondeu ${r.status} ao listar: ${xml.slice(0, 200)}`);
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const chave = /<Key>([\s\S]*?)<\/Key>/.exec(m[1])?.[1];
      const tamanho = Number(/<Size>(\d+)<\/Size>/.exec(m[1])?.[1] ?? 0);
      if (chave) objetos.set(desfazerXml(chave), tamanho);
    }
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
      ? desfazerXml(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1] ?? "")
      : "";
  } while (token);
  return objetos;
}

// ------------------------------------------------------------------ Supabase (bucket antigo)

/** Arquivos do bucket antigo, com subpastas: caminho → tamanho em bytes. */
async function listarSupabase(sb: any, bucket: string, pasta = "", mapa = new Map<string, number>()): Promise<Map<string, number>> {
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.storage.from(bucket).list(pasta, { limit: 1000, offset });
    if (error) throw new ErroHttp(502, `Supabase respondeu ao listar ${bucket}: ${error.message}`);
    const itens = data ?? [];
    for (const o of itens) {
      if (o.name === ".emptyFolderPlaceholder") continue;
      const caminho = pasta ? `${pasta}/${o.name}` : o.name;
      if (o.id) mapa.set(caminho, Number(o.metadata?.size ?? 0));
      else await listarSupabase(sb, bucket, caminho, mapa);
    }
    if (itens.length < 1000) return mapa;
  }
}

/** Objetos do módulo no R2, com o caminho relativo ao módulo: caminho → tamanho. */
async function listarModuloNoR2(modulo: string): Promise<Map<string, number>> {
  const noR2 = await listar(`${modulo}/`);
  return new Map([...noR2].map(([chave, tamanho]) => [chave.slice(modulo.length + 1), tamanho]));
}

async function migrar(sb: any, modulo: string, direcao: "para-r2" | "para-supabase", limite: number) {
  const bucket = MODULOS[modulo];
  const noSupabase = await listarSupabase(sb, bucket);
  const noR2 = await listarModuloNoR2(modulo);
  const [origem, destino] = direcao === "para-r2" ? [noSupabase, noR2] : [noR2, noSupabase];
  const invalidos = [...origem.keys()].filter((c) => !chaveValida(`${modulo}/${c}`));
  const faltando = [...origem.keys()].filter((c) => !destino.has(c) && chaveValida(`${modulo}/${c}`));
  const lote = faltando.slice(0, limite);
  const { aws, base } = r2();
  for (const caminho of lote) {
    const url = `${base}/${codificar(`${modulo}/${caminho}`)}`;
    if (direcao === "para-r2") {
      const { data, error } = await sb.storage.from(bucket).download(caminho);
      if (error || !data) throw new ErroHttp(502, `Supabase não entregou ${caminho}: ${error?.message ?? "arquivo vazio"}`);
      const r = await aws.fetch(url, { method: "PUT", body: data, headers: { "Content-Type": data.type || "application/octet-stream" } });
      if (!r.ok) throw new ErroHttp(502, `R2 respondeu ${r.status} ao gravar ${caminho}.`);
    } else {
      const r = await aws.fetch(url);
      if (!r.ok) throw new ErroHttp(502, `R2 respondeu ${r.status} ao ler ${caminho}.`);
      const blob = await r.blob();
      const { error } = await sb.storage.from(bucket).upload(caminho, blob, {
        contentType: r.headers.get("content-type") || "application/octet-stream",
        upsert: false,
      });
      if (error) throw new ErroHttp(502, `Supabase recusou ${caminho}: ${error.message}`);
    }
  }
  return { copiados: lote.length, existentes: origem.size - faltando.length - invalidos.length, faltam: faltando.length - lote.length, total: origem.size, invalidos };
}

async function conferir(sb: any, modulo: string) {
  const noSupabase = await listarSupabase(sb, MODULOS[modulo]);
  const noR2 = await listarModuloNoR2(modulo);
  const soNoSupabase = [...noSupabase.keys()].filter((c) => !noR2.has(c));
  const soNoR2 = [...noR2.keys()].filter((c) => !noSupabase.has(c));
  const tamanhoDiferente = [...noSupabase].filter(([c, t]) => noR2.has(c) && noR2.get(c) !== t).map(([c]) => c);
  const iguais = [...noSupabase].filter(([c, t]) => noR2.get(c) === t).length;
  return { iguais, soNoSupabase, soNoR2, tamanhoDiferente };
}

// ------------------------------------------------------------------ rotas

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (req.method === "GET") {
      const c = new URL(req.url).searchParams.get("c");
      if (!c) return json({ r2: r2Configurado() });
      const chave = exigirChave(c);
      if (!chave.startsWith("notas/")) throw new ErroHttp(403, "Só as imagens das notas têm endereço público.");
      return new Response(null, {
        status: 302,
        headers: { ...cors, Location: await assinar("GET", chave, 3600), "Cache-Control": "private, max-age=300" },
      });
    }
    if (req.method !== "POST") return json({ error: "Método não suportado" }, 405);
    if (!chavePublicaValida(req.headers.get("apikey") || "")) return json({ error: "Acesso não autorizado." }, 401);

    const body = await req.json().catch(() => ({}));
    switch (body.acao) {
      case "enviar":
        return json({ url: await assinar("PUT", exigirChave(body.chave), 900) });
      case "ler": {
        const chave = exigirChave(body.chave);
        if (!(await existe(chave))) throw new ErroHttp(404, "Arquivo não está no R2.");
        return json({ url: await assinar("GET", chave, 3600) });
      }
      case "apagar": {
        const chaves = Array.isArray(body.chaves) ? body.chaves.map(exigirChave) : [];
        if (chaves.length > 1000) throw new ErroHttp(400, "No máximo 1.000 arquivos por chamada.");
        return json({ apagados: await apagar(chaves) });
      }
      case "copiar":
        await copiar(exigirChave(body.de), exigirChave(body.para));
        return json({ ok: true });
      case "listar":
        return json({ chaves: [...(await listar(exigirPrefixo(body.prefixo))).keys()] });
      case "migrar":
      case "conferir": {
        exigirChaveDoSwipe(req);
        const modulo = exigirModulo(body.modulo);
        const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
        if (body.acao === "conferir") return json(await conferir(sb, modulo));
        const direcao = body.direcao === "para-supabase" ? "para-supabase" : "para-r2";
        const limite = Math.min(Math.max(Number(body.limite) || 20, 1), 100);
        return json(await migrar(sb, modulo, direcao, limite));
      }
      default:
        return json({ error: "Ação desconhecida" }, 400);
    }
  } catch (e) {
    if (e instanceof ErroHttp) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
