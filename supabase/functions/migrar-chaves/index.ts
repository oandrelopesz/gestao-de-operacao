// FUNÇÃO TEMPORÁRIA da migração para fora do Lovable (2026-10-07). Roda no projeto ANTIGO e copia, de servidor
// para servidor, as chaves (secrets) e os arquivos do Storage para o projeto novo. Nunca devolve valores de chave:
// só nomes, sha256 dos valores e contagens. Exige o token de gestão do Supabase do André no cabeçalho
// `x-token-gestao` (conferido na API de gestão antes de qualquer coisa). APAGAR depois da migração.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const NOVO = "uajusldnvzgakffofkhl";
const API = "https://api.supabase.com/v1";
const RUNTIME = /^(SUPABASE_|SB_|DENO_|EDGE_|HOME$|PATH$|HOSTNAME$|PWD$|TZ$|LANG$|USER$|SHLVL$|_$|OLDPWD$|TERM$)/;

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { "Content-Type": "application/json" } });

async function sha256(v: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Lista todos os objetos de um bucket (recursivo), com tamanho e tipo. */
async function listar(sb: ReturnType<typeof createClient>, bucket: string, prefixo = ""): Promise<{ name: string; size: number; type: string }[]> {
  const saida: { name: string; size: number; type: string }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.storage.from(bucket).list(prefixo, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`listar ${bucket}/${prefixo}: ${error.message}`);
    for (const o of data || []) {
      const caminho = prefixo ? `${prefixo}/${o.name}` : o.name;
      if (o.id === null) saida.push(...(await listar(sb, bucket, caminho)));
      else saida.push({ name: caminho, size: Number(o.metadata?.size || 0), type: String(o.metadata?.mimetype || "application/octet-stream") });
    }
    if (!data || data.length < 1000) break;
  }
  return saida;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);
  const token = req.headers.get("x-token-gestao") || "";
  const gestao = (path: string, init: RequestInit = {}) =>
    fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) } });
  const conferido = await gestao(`/projects/${NOVO}`);
  if (!conferido.ok) return json({ erro: "token de gestão inválido" }, 401);

  const corpo = await req.json().catch(() => ({}));
  const acao = String(corpo.acao || "");

  if (acao === "listar-chaves") {
    const env = Deno.env.toObject();
    const nomes = Object.keys(env).filter((n) => /^[A-Z][A-Z0-9_]*$/.test(n) && !RUNTIME.test(n)).sort();
    const resumo: Record<string, string> = {};
    for (const n of nomes) resumo[n] = await sha256(env[n]);
    return json({ nomes, resumo });
  }

  if (acao === "copiar-chaves") {
    const nomes: string[] = Array.isArray(corpo.nomes) ? corpo.nomes : [];
    const env = Deno.env.toObject();
    const lote = nomes.filter((n) => typeof env[n] === "string").map((n) => ({ name: n, value: env[n] }));
    if (!lote.length) return json({ erro: "nenhum nome válido" }, 400);
    const r = await gestao(`/projects/${NOVO}/secrets`, { method: "POST", body: JSON.stringify(lote) });
    return json({ status: r.status, copiadas: r.ok ? lote.map((x) => x.name) : [], erro: r.ok ? null : (await r.text()).slice(0, 300) });
  }

  if (acao === "copiar-storage") {
    const chaves = await (await gestao(`/projects/${NOVO}/api-keys?reveal=true`)).json();
    const servico = (chaves as { name: string; api_key: string }[]).find((k) => k.name === "service_role")?.api_key;
    if (!servico) return json({ erro: "chave de serviço do novo não encontrada" }, 500);
    const antigo = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const novo = createClient(`https://${NOVO}.supabase.co`, servico);
    const bucket = String(corpo.bucket || "");
    const inicio = Number(corpo.inicio || 0), quantos = Number(corpo.quantos || 100);
    const todos = await listar(antigo, bucket);
    const jaNoNovo = new Map((await listar(novo, bucket)).map((o) => [o.name, o.size]));
    const fatia = todos.slice(inicio, inicio + quantos);
    let copiados = 0, iguais = 0;
    const erros: string[] = [];
    for (const o of fatia) {
      if (jaNoNovo.get(o.name) === o.size) { iguais++; continue; }
      const { data, error } = await antigo.storage.from(bucket).download(o.name);
      if (error || !data) { erros.push(`${o.name}: ${error?.message || "sem dados"}`); continue; }
      const up = await novo.storage.from(bucket).upload(o.name, data, { contentType: o.type, upsert: true });
      if (up.error) erros.push(`${o.name}: ${up.error.message}`);
      else copiados++;
    }
    return json({ bucket, total: todos.length, inicio, fim: inicio + fatia.length, copiados, iguais, erros: erros.slice(0, 20) });
  }

  return json({ erro: "ação desconhecida" }, 400);
});
