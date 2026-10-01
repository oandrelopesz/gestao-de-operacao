// Posts no Google Meu Negócio — Fase 1 (sem publicar no Google).
//   GET                                          -> { openai, r2, acesso }
//   POST { acao: "briefing", perfil_id, texto_dados_internos?, contexto_posts? } -> { briefing }   (não salva)
//        extrai o briefing do contexto (contexto_posts do corpo, se veio; senão o do perfil)
//   POST { acao: "previa", perfil_id, com_imagem? } -> { post }                   (gmn_posts, origem 'previa')
//        com_imagem (padrão true): false gera só texto, sem buscar nem gerar imagem
//        409 se o perfil já tem uma prévia 'gerando' criada há menos de 3 minutos
//   POST { acao: "logo", perfil_id, tipo: "image/png", base64, origem_url? } -> { logo_url }
//        PNG convertido pela tela, até 5 MB, no R2; origem_url opcional (http/https, até 2.000 caracteres);
//        grava gmn_perfis.logo_url e logo_origem_url
//   POST { acao: "remover_logo", perfil_id }     -> { ok: true }                  (logo_url e logo_origem_url = null; o arquivo fica no R2)
// POST exige x-google-id-token (e-mail em ALLOWED_GOOGLE_EMAILS) ou x-swipe-key, como o google-token.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import { acessoConfigurado, acessoLiberado } from "./acesso.ts";
import { gerarJson, openaiConfigurada } from "./openai.ts";
import { PRAZO_TOTAL_MS } from "./prazo.ts";
import { enviarR2, r2Configurado } from "./r2.ts";
import { gerarConteudo } from "./conteudo.ts";
import { lerPng } from "./png.ts";
import { ESQUEMA_BRIEFING, base64ParaBytes, montarMensagensBriefing, normalizarBriefing, tamanhoBase64 } from "./regras.ts";

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
    // O texto da tela (ainda não salvo) vale mais que o do perfil.
    contextoPosts: typeof body.contexto_posts === "string" ? body.contexto_posts : perfil.contexto_posts ?? null,
  });
  const r = await gerarJson<unknown>(m.system, m.user, "briefing_gmn", ESQUEMA_BRIEFING, total);
  return json({ briefing: normalizarBriefing(r) });
}

// Uma prévia em andamento (linha 'gerando') mais nova que isto bloqueia outra prévia do mesmo perfil. A função é
// encerrada bem antes disso: depois da janela, a linha é de uma execução morta e não segura mais ninguém.
const JANELA_PREVIA_EM_ANDAMENTO_MS = 3 * 60_000;

async function acaoPrevia(sb: any, body: any, total: AbortSignal, prazoFinal: number): Promise<Response> {
  const perfil = await carregarPerfil(sb, body);
  if (!perfil.briefing_salvo_em) return json({ error: "Salve o contexto antes de gerar a prévia." }, 400);
  // Confere a configuração antes de inserir a linha e de gastar com a OpenAI.
  if (!openaiConfigurada()) throw new ErroHttp(503, SEM_OPENAI);
  const comImagem = typeof body.com_imagem === "boolean" ? body.com_imagem : true;
  const podeTerImagem = !!String(perfil.drive_pasta_url ?? "").trim() || !!perfil.usa_ia_imagem;
  if (comImagem && podeTerImagem && !r2Configurado()) throw new ErroHttp(503, SEM_R2);
  // Não gasta de novo (texto, imagem e checagens) enquanto a prévia anterior do perfil ainda está sendo gerada.
  const { data: emAndamento, error: eAndamento } = await sb
    .from("gmn_posts")
    .select("id")
    .eq("perfil_id", perfil.id)
    .eq("origem", "previa")
    .eq("status", "gerando")
    .gt("created_at", new Date(Date.now() - JANELA_PREVIA_EM_ANDAMENTO_MS).toISOString())
    .limit(1);
  if (eAndamento) throw new Error(eAndamento.message);
  if ((emAndamento ?? []).length > 0) {
    throw new ErroHttp(409, "Já existe uma prévia sendo gerada para este perfil. Aguarde terminar.");
  }
  const { data: post, error } = await sb
    .from("gmn_posts")
    .insert({ perfil_id: perfil.id, origem: "previa", status: "gerando" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  let campos: Record<string, unknown>;
  try {
    campos = { ...(await gerarConteudo(sb, perfil, post.id, total, { comImagem, prazoFinal })) };
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

const LOGO_MAX_BYTES = 5 * 1024 * 1024;
// Corpo de uma requisição: a logo em base64 (5 MB viram uns 6,7 MB) mais o resto do JSON cabe com folga em 8 MB.
const CORPO_MAX_BYTES = 8 * 1024 * 1024;
const ASSINATURA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// Lado máximo da logo: um arquivo pequeno pode declarar dimensões enormes, e a leitura aloca largura x altura x 4 bytes.
const LOGO_LADO_MAX = 2048;
const LOGO_ILEGIVEL = "Não foi possível ler a logo enviada.";
const ORIGEM_URL_MAX = 2000;

/** Largura e altura que o PNG declara no IHDR (1º bloco, bytes 16 a 23, big-endian); `null` se o IHDR não está onde deveria. */
function dimensoesDoPng(b: Uint8Array): { largura: number; altura: number } | null {
  if (b.length < 24 || String.fromCharCode(b[12], b[13], b[14], b[15]) !== "IHDR") return null;
  const u32 = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  return { largura: u32(16), altura: u32(20) };
}

/** Endereço http(s) de até 2.000 caracteres, ou `null` (a origem é só informativa: valor inválido não barra a logo). */
function origemUrl(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  return t && t.length <= ORIGEM_URL_MAX && /^https?:\/\//i.test(t) ? t : null;
}

/**
 * Guarda a logo do perfil (PNG) no R2 (`logos/<perfil_id>-<carimbo>.png`) e grava a URL em `gmn_perfis.logo_url`, junto
 * com `logo_origem_url` (de onde a logo veio, se a tela informou). A tela converte qualquer imagem para PNG antes de enviar.
 */
async function acaoLogo(sb: any, body: any, total: AbortSignal): Promise<Response> {
  const perfil = await carregarPerfil(sb, body);
  if (body.tipo !== "image/png") throw new ErroHttp(400, LOGO_ILEGIVEL);
  const texto = typeof body.base64 === "string" ? body.base64 : "";
  if (!texto) throw new ErroHttp(400, LOGO_ILEGIVEL);
  // Confere o tamanho pelo texto, antes de copiar ou decodificar qualquer coisa.
  if (tamanhoBase64(texto) > LOGO_MAX_BYTES) throw new ErroHttp(400, "A logo pode ter até 5 MB.");
  // O atob ignora espaços e quebras de linha; só o prefixo "data:...;base64," precisa sair.
  const b64 = texto.startsWith("data:") ? texto.slice(texto.indexOf(",") + 1) : texto;
  let bytes: Uint8Array;
  try {
    bytes = base64ParaBytes(b64);
  } catch {
    throw new ErroHttp(400, LOGO_ILEGIVEL);
  }
  if (bytes.length > LOGO_MAX_BYTES) throw new ErroHttp(400, "A logo pode ter até 5 MB.");
  // O conteúdo precisa ser mesmo PNG: o arquivo fica público e a composição só lê PNG.
  if (!ASSINATURA_PNG.every((b, i) => bytes[i] === b)) throw new ErroHttp(400, LOGO_ILEGIVEL);
  // Dimensões do IHDR antes de ler o PNG: recusa o arquivo que declara um tamanho que esgotaria a memória.
  const dim = dimensoesDoPng(bytes);
  if (!dim || dim.largura > LOGO_LADO_MAX || dim.altura > LOGO_LADO_MAX) throw new ErroHttp(400, LOGO_ILEGIVEL);
  // Garante que a composição vai conseguir ler a logo (8 bits, RGB/RGBA, sem entrelaçamento, deflate válido).
  try {
    await lerPng(bytes);
  } catch (e) {
    console.error("Logo: PNG ilegível:", msg(e));
    throw new ErroHttp(400, LOGO_ILEGIVEL);
  }
  if (!r2Configurado()) throw new ErroHttp(503, SEM_R2);
  // Falha do R2 ou do banco: mensagem fixa (o detalhe, em inglês, vai só para o log).
  const SEM_GUARDAR = "Não foi possível guardar a logo. Tente de novo.";
  let url: string;
  try {
    url = await enviarR2(`logos/${perfil.id}-${Date.now()}.png`, bytes, "image/png", total);
  } catch (e) {
    console.error("Logo: falha ao enviar para o R2:", e);
    throw new ErroHttp(500, SEM_GUARDAR);
  }
  const { error } = await sb
    .from("gmn_perfis")
    .update({ logo_url: url, logo_origem_url: origemUrl(body.origem_url), updated_at: new Date().toISOString() })
    .eq("id", perfil.id);
  if (error) {
    console.error("Logo: falha ao gravar logo_url:", error.message);
    throw new ErroHttp(500, SEM_GUARDAR);
  }
  return json({ logo_url: url });
}

/** Tira a logo do perfil (o arquivo antigo pode ficar no R2). */
async function acaoRemoverLogo(sb: any, body: any): Promise<Response> {
  const perfil = await carregarPerfil(sb, body);
  const { error } = await sb.from("gmn_perfis").update({ logo_url: null, logo_origem_url: null, updated_at: new Date().toISOString() }).eq("id", perfil.id);
  if (error) throw new Error(error.message);
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method === "GET") return json({ openai: openaiConfigurada(), r2: r2Configurado(), acesso: acessoConfigurado() });
  if (req.method !== "POST") return json({ error: "Método não suportado" }, 405);
  // O prazo total começa antes da checagem de acesso: um tokeninfo lento também conta.
  const prazoFinal = Date.now() + PRAZO_TOTAL_MS;
  const total = AbortSignal.timeout(PRAZO_TOTAL_MS);
  if (!(await acessoLiberado(req))) return json({ error: "Acesso não autorizado. Entre com o Google ou informe a chave." }, 403);

  // Corpo grande demais (só a logo chega perto disso): recusa antes de ler e copiar o JSON inteiro.
  if (Number(req.headers.get("content-length")) > CORPO_MAX_BYTES) return json({ error: "A logo pode ter até 5 MB." }, 400);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = (await req.json().catch(() => null)) ?? {};
  try {
    if (body.acao === "briefing") return await acaoBriefing(sb, body, total);
    if (body.acao === "previa") return await acaoPrevia(sb, body, total, prazoFinal);
    if (body.acao === "logo") return await acaoLogo(sb, body, total);
    if (body.acao === "remover_logo") return await acaoRemoverLogo(sb, body);
    return json({ error: "Ação desconhecida" }, 400);
  } catch (e) {
    if (e instanceof ErroHttp) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: msg(e) }, 500);
  }
});
