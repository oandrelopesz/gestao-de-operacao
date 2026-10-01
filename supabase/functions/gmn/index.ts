// Posts no Google Meu Negócio — Fase 1 (sem publicar no Google).
//   GET                                          -> { openai, r2, acesso }
//   POST { acao: "briefing", perfil_id, texto_dados_internos? } -> { briefing }   (não salva)
//   POST { acao: "previa", perfil_id }           -> { post }                      (gmn_posts, origem 'previa')
// POST exige x-google-id-token (e-mail em ALLOWED_GOOGLE_EMAILS) ou x-swipe-key, como o google-token.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import { acessoConfigurado, acessoLiberado } from "./acesso.ts";
import { gerarJson, openaiConfigurada } from "./openai.ts";
import { PRAZO_TOTAL_MS } from "./prazo.ts";
import { r2Configurado } from "./r2.ts";
import { gerarConteudo } from "./conteudo.ts";
import { ESQUEMA_BRIEFING, montarMensagensBriefing, normalizarBriefing } from "./regras.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-swipe-key, x-google-id-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Erro com status HTTP próprio (entrada inválida, perfil inexistente, configuração faltando). */
class ErroHttp extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const SEM_OPENAI = "A chave da OpenAI ainda não foi cadastrada (secret OPENAI_API_KEY).";
const SEM_R2 = "Faltam os secrets do R2 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE).";

async function carregarPerfil(sb: any, body: any) {
  const id = typeof body.perfil_id === "string" ? body.perfil_id.trim() : "";
  if (!id) throw new ErroHttp(400, "Informe o perfil.");
  const { data, error } = await sb.from("gmn_perfis").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ErroHttp(404, "Perfil não encontrado.");
  return data;
}

async function acaoBriefing(sb: any, body: any, total: AbortSignal): Promise<Response> {
  const perfil = await carregarPerfil(sb, body);
  if (!openaiConfigurada()) throw new ErroHttp(503, SEM_OPENAI);
  let nicho: string | null = null;
  if (perfil.cliente_id) {
    const { data } = await sb.from("clientes").select("nicho").eq("id", perfil.cliente_id).maybeSingle();
    nicho = data?.nicho ?? null;
  }
  const m = montarMensagensBriefing({
    nome: perfil.nome, categoria: perfil.categoria, site: perfil.site, endereco: perfil.endereco, nicho,
    briefingAtual: normalizarBriefing(perfil.briefing),
    textoDadosInternos: typeof body.texto_dados_internos === "string" ? body.texto_dados_internos : null,
  });
  const r = await gerarJson<unknown>(m.system, m.user, "briefing_gmn", ESQUEMA_BRIEFING, total);
  return json({ briefing: normalizarBriefing(r) });
}

async function acaoPrevia(sb: any, body: any, total: AbortSignal): Promise<Response> {
  const perfil = await carregarPerfil(sb, body);
  if (!perfil.briefing_salvo_em) return json({ error: "Salve o briefing antes de gerar a prévia." }, 400);
  // Confere a configuração antes de inserir a linha e de gastar com a OpenAI.
  if (!openaiConfigurada()) throw new ErroHttp(503, SEM_OPENAI);
  const podeTerImagem = !!String(perfil.drive_pasta_url ?? "").trim() || !!perfil.usa_ia_imagem;
  if (podeTerImagem && !r2Configurado()) throw new ErroHttp(503, SEM_R2);
  const { data: post, error } = await sb
    .from("gmn_posts")
    .insert({ perfil_id: perfil.id, origem: "previa", status: "gerando" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  let campos: Record<string, unknown>;
  try {
    campos = { ...(await gerarConteudo(sb, perfil, post.id, total)) };
  } catch (e) {
    campos = { status: "erro", erro: msg(e) };
  }
  const { data: final, error: e2 } = await sb
    .from("gmn_posts")
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq("id", post.id)
    .select("*")
    .single();
  if (e2) throw new Error(e2.message);
  return json({ post: final });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method === "GET") return json({ openai: openaiConfigurada(), r2: r2Configurado(), acesso: acessoConfigurado() });
  if (req.method !== "POST") return json({ error: "Método não suportado" }, 405);
  // O prazo total começa antes da checagem de acesso: um tokeninfo lento também conta.
  const total = AbortSignal.timeout(PRAZO_TOTAL_MS);
  if (!(await acessoLiberado(req))) return json({ error: "Acesso não autorizado. Entre com o Google ou informe a chave." }, 403);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = (await req.json().catch(() => null)) ?? {};
  try {
    if (body.acao === "briefing") return await acaoBriefing(sb, body, total);
    if (body.acao === "previa") return await acaoPrevia(sb, body, total);
    return json({ error: "Ação desconhecida" }, 400);
  } catch (e) {
    if (e instanceof ErroHttp) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: msg(e) }, 500);
  }
});
