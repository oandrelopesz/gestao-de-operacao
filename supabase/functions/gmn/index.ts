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
//   POST { acao: "site", perfil_id, tipo: "logos" | "fotos", url? } -> { logos: CandidatoSite[] } | { fotos: CandidatoSite[] }
//        lê o site do perfil (ou a url enviada) e a IA separa logo de foto; não grava nada
//   POST { acao: "baixar_imagem", url }          -> bytes da imagem (Content-Type da imagem; não é JSON)
//        baixa uma imagem de outro site para a tela converter (o navegador não pode, por CORS)
//   POST { acao: "imagem_site", perfil_id, base64 (JPG), origem_url, descricao } -> { imagens_site: ImagemSite[] }
//        guarda a foto do site (JPG já convertido pela tela) no R2 e a acrescenta a gmn_perfis.imagens_site
// POST exige x-google-id-token (e-mail em ALLOWED_GOOGLE_EMAILS) ou x-swipe-key, como o google-token.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import { acessoConfigurado, acessoLiberado } from "./acesso.ts";
import { classificarImagem, descreverImagem, gerarJson, openaiConfigurada } from "./openai.ts";
import { PRAZO_TOTAL_MS, sinal } from "./prazo.ts";
import { enviarR2, r2Configurado } from "./r2.ts";
import { gerarConteudo } from "./conteudo.ts";
import { lerPng } from "./png.ts";
import {
  ESQUEMA_BRIEFING, LOGO_LADO_MAX, base64ParaBytes, fotosDoSiteComDescricao, montarMensagensBriefing, normalizarBriefing,
  normalizarImagensSite, tamanhoBase64, visaoLeFormato,
} from "./regras.ts";
import {
  candidatosDeFoto, candidatosDeLogo, deduplicar, imagensDoBundle, imagensDoHtml, scriptsDoSite, urlPublicaHttp,
  type CandidatoSite,
} from "./site.ts";

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
  const podeTerImagem = !!String(perfil.drive_pasta_url ?? "").trim() || !!perfil.usa_ia_imagem || fotosDoSiteComDescricao(perfil).length > 0;
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
  // Dimensões do IHDR antes de ler o PNG: um arquivo pequeno pode declarar um tamanho que esgotaria a memória (a leitura
  // aloca largura x altura x 4 bytes). Conferência barata; o lerPng repete o teto abaixo, como garantia.
  const dim = dimensoesDoPng(bytes);
  if (!dim || dim.largura > LOGO_LADO_MAX || dim.altura > LOGO_LADO_MAX) throw new ErroHttp(400, LOGO_ILEGIVEL);
  // Garante que a composição vai conseguir ler a logo (8 bits, RGB/RGBA, sem entrelaçamento, deflate válido). O lerPng
  // também recusa IHDR repetido e lado acima do teto, e não descomprime além do tamanho declarado.
  try {
    await lerPng(bytes, LOGO_LADO_MAX);
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

// ------------------------------------------------------------------ imagens e logo do site do cliente

const UA = "Mozilla/5.0 (compatible; GestaoDeOperacao/1.0; +https://gestao.andrelopes.digital)";
const REDIRECIONAMENTOS_MAX = 5;
const SITE_HTML_MAX_BYTES = 3 * 1024 * 1024;
const SITE_SCRIPT_MAX_BYTES = 5 * 1024 * 1024;
const IMAGEM_EXTERNA_MAX = 20 * 1024 * 1024;
const IMAGEM_SITE_MAX_BYTES = 5 * 1024 * 1024;
const CLASSIFICAR_EM_PARALELO = 6;
const CLASSIFICAR_PRAZO_MS = 20_000;
const DESCRICAO_FOTO_MIN = 10;
const SEM_LER_IMAGEM = "Não foi possível ler a imagem enviada.";

/** Lê até `max` bytes de uma resposta (corta o resto). */
async function lerAte(r: Response, max: number): Promise<Uint8Array> {
  const leitor = r.body?.getReader();
  if (!leitor) return new Uint8Array(0);
  const partes: Uint8Array[] = [];
  let n = 0;
  while (n < max) {
    const { done, value } = await leitor.read();
    if (done || !value) break;
    partes.push(value);
    n += value.length;
  }
  await leitor.cancel().catch(() => {});
  const out = new Uint8Array(Math.min(n, max));
  let o = 0;
  for (const p of partes) {
    const pedaco = p.subarray(0, out.length - o);
    out.set(pedaco, o);
    o += pedaco.length;
    if (o >= out.length) break;
  }
  return out;
}

/**
 * GET em endereço público com o prazo `ms` (e o prazo total, que vale também para a leitura do corpo). Os redirecionamentos
 * são seguidos à mão (até 5) e cada destino passa por `urlPublicaHttp`: um site público não pode mandar a função para a rede
 * interna. Devolve a resposta e o endereço final (base dos caminhos relativos da página).
 */
async function buscarPublico(
  alvo: URL, headers: Record<string, string>, ms: number, total: AbortSignal,
): Promise<{ r: Response; url: string }> {
  const signal = sinal(ms, total);
  let url = alvo;
  for (let i = 0; i <= REDIRECIONAMENTOS_MAX; i++) {
    const r = await fetch(url.href, { headers, redirect: "manual", signal });
    const destino = [301, 302, 303, 307, 308].includes(r.status) ? r.headers.get("location") : null;
    if (!destino) return { r, url: url.href };
    await r.body?.cancel().catch(() => {});
    let proximo: URL | null = null;
    try {
      proximo = urlPublicaHttp(new URL(destino, url).href);
    } catch { /* Location ilegível */ }
    if (!proximo) throw new Error("redirecionamento para um endereço que não é público");
    url = proximo;
  }
  throw new Error("redirecionamentos demais");
}

/** Endereço digitado como `loja.com.br` vale como `https://loja.com.br`; só http(s) de host público passa. */
function enderecoPublico(v: unknown): URL | null {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? urlPublicaHttp(/^https?:\/\//i.test(t) ? t : `https://${t}`) : null;
}

/** Roda `f` em todos os itens, até `limite` ao mesmo tempo, e devolve os resultados na ordem dos itens (`f` não deve lançar). */
async function emParalelo<T, R>(itens: T[], limite: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(itens.length);
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < itens.length) {
      const i = proximo++;
      out[i] = await f(itens[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
  return out;
}

/**
 * O que a IA diz de uma imagem do site: logo, foto ou outro (com a descrição, se foto). Sem OpenAI, em formato que o modelo
 * não lê (SVG, ICO…) ou com erro na chamada, vale a pista do HTML: `pista` ("logo" na busca de logos, "foto" na de fotos,
 * com o alt como descrição).
 */
async function classificarCandidato(
  c: CandidatoSite, pista: "logo" | "foto", total: AbortSignal,
): Promise<{ tipo: "logo" | "foto" | "outro"; descricao: string }> {
  try {
    if (openaiConfigurada() && visaoLeFormato(c.url)) return await classificarImagem(c.url, sinal(CLASSIFICAR_PRAZO_MS, total));
  } catch (e) {
    console.error("Classificar imagem:", msg(e));
  }
  return { tipo: pista, descricao: c.descricao };
}

/**
 * Busca no site do perfil (ou na `url` enviada) as logos (`tipo: "logos"`) ou as fotos (`tipo: "fotos"`). Lê o HTML e os .js
 * do próprio site, separa os candidatos pela pista do HTML e a IA confere cada um (logo, foto ou outro). Não grava nada.
 * Fotos: só as classificadas como foto, com descrição (da IA ou, sem ela, o alt) de pelo menos 10 caracteres.
 */
async function acaoSite(sb: any, body: any, total: AbortSignal): Promise<Response> {
  if (body.tipo !== "logos" && body.tipo !== "fotos") throw new ErroHttp(400, "Escolha buscar a logo ou as fotos.");
  const perfil = await carregarPerfil(sb, body);
  const alvo = enderecoPublico(typeof body.url === "string" && body.url.trim() ? body.url : perfil.site);
  if (!alvo) throw new ErroHttp(400, "Informe o site do perfil (http ou https) na aba Agenda.");
  let html: string;
  let base: string;
  try {
    const { r, url } = await buscarPublico(alvo, { "user-agent": UA, accept: "text/html" }, 15_000, total);
    if (!r.ok) {
      await r.body?.cancel().catch(() => {});
      throw new ErroHttp(502, `O site respondeu ${r.status}.`);
    }
    html = new TextDecoder().decode(await lerAte(r, SITE_HTML_MAX_BYTES));
    base = url;
  } catch (e) {
    if (e instanceof ErroHttp) throw e;
    console.error("Site:", msg(e));
    throw new ErroHttp(502, "Não foi possível abrir o site.");
  }
  let lista = imagensDoHtml(html, base);
  for (const s of scriptsDoSite(html, base)) {
    const alvoJs = urlPublicaHttp(s);
    if (!alvoJs) continue;
    try {
      const { r } = await buscarPublico(alvoJs, { "user-agent": UA }, 10_000, total);
      if (r.ok) lista = deduplicar([...lista, ...imagensDoBundle(new TextDecoder().decode(await lerAte(r, SITE_SCRIPT_MAX_BYTES)), s)]);
      else await r.body?.cancel().catch(() => {});
    } catch (e) {
      console.error("Site, script:", msg(e));
    }
  }
  // Endereço de imagem que não é público não serve (a tela não consegue baixar nem a IA ver).
  lista = lista.filter((c) => urlPublicaHttp(c.url));

  if (body.tipo === "logos") {
    const candidatos = candidatosDeLogo(lista);
    const veredito = await emParalelo(candidatos, CLASSIFICAR_EM_PARALELO, (c) => classificarCandidato(c, "logo", total));
    return json({ logos: candidatos.filter((_, i) => veredito[i].tipo === "logo").map((c) => ({ ...c, logo: true })) });
  }
  const candidatos = candidatosDeFoto(lista);
  const veredito = await emParalelo(candidatos, CLASSIFICAR_EM_PARALELO, (c) => classificarCandidato(c, "foto", total));
  const fotos: CandidatoSite[] = [];
  candidatos.forEach((c, i) => {
    const descricao = (veredito[i].descricao || c.descricao).trim().slice(0, 300);
    if (veredito[i].tipo === "foto" && descricao.length >= DESCRICAO_FOTO_MIN) fotos.push({ ...c, descricao, logo: false });
  });
  return json({ fotos });
}

/** Baixa uma imagem de outro site para o navegador converter (o navegador não pode, por CORS). Devolve os bytes dela. */
async function acaoBaixarImagem(body: any, total: AbortSignal): Promise<Response> {
  const alvo = urlPublicaHttp(typeof body.url === "string" ? body.url.trim() : "");
  if (!alvo) throw new ErroHttp(400, "Endereço de imagem inválido.");
  const SEM_BAIXAR = "Não foi possível baixar a imagem.";
  const GRANDE = "A imagem passa de 20 MB.";
  let r: Response;
  try {
    r = (await buscarPublico(alvo, { "user-agent": UA, accept: "image/*" }, 20_000, total)).r;
  } catch (e) {
    console.error("Baixar imagem:", msg(e));
    throw new ErroHttp(502, SEM_BAIXAR);
  }
  const tipo = (r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const recusa = !r.ok ? new ErroHttp(502, SEM_BAIXAR)
    : Number(r.headers.get("content-length")) > IMAGEM_EXTERNA_MAX ? new ErroHttp(400, GRANDE)
    : tipo && !tipo.startsWith("image/") && tipo !== "application/octet-stream" ? new ErroHttp(400, "O endereço não é de uma imagem.")
    : null;
  if (recusa) {
    await r.body?.cancel().catch(() => {});
    throw recusa;
  }
  let bytes: Uint8Array;
  try {
    bytes = await lerAte(r, IMAGEM_EXTERNA_MAX + 1);
  } catch (e) {
    console.error("Baixar imagem:", msg(e));
    throw new ErroHttp(502, SEM_BAIXAR);
  }
  if (bytes.length > IMAGEM_EXTERNA_MAX) throw new ErroHttp(400, GRANDE);
  return new Response(bytes as BlobPart, {
    status: 200, headers: { ...cors, "Content-Type": tipo.startsWith("image/") ? tipo : "application/octet-stream" },
  });
}

/**
 * Guarda no R2 (`site/<perfil_id>/<id>.jpg`) uma imagem do site já convertida em JPG pela tela e a acrescenta a
 * `gmn_perfis.imagens_site` (a mesma `origem_url` de antes é substituída). Descrição curta (menos de 15 caracteres): a IA
 * descreve a foto.
 */
async function acaoImagemSite(sb: any, body: any, total: AbortSignal): Promise<Response> {
  const perfil = await carregarPerfil(sb, body);
  const origem = urlPublicaHttp(typeof body.origem_url === "string" ? body.origem_url.trim() : "");
  if (!origem || origem.href.length > ORIGEM_URL_MAX) throw new ErroHttp(400, "Endereço de imagem inválido.");
  const texto = typeof body.base64 === "string" ? body.base64 : "";
  if (!texto) throw new ErroHttp(400, SEM_LER_IMAGEM);
  if (tamanhoBase64(texto) > IMAGEM_SITE_MAX_BYTES) throw new ErroHttp(400, "A imagem convertida passa de 5 MB.");
  let bytes: Uint8Array;
  try {
    bytes = base64ParaBytes(texto.startsWith("data:") ? texto.slice(texto.indexOf(",") + 1) : texto);
  } catch {
    throw new ErroHttp(400, SEM_LER_IMAGEM);
  }
  // A tela converte tudo para JPG: o arquivo fica público e é servido como image/jpeg.
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) throw new ErroHttp(400, SEM_LER_IMAGEM);
  if (!r2Configurado()) throw new ErroHttp(503, SEM_R2);
  const SEM_GUARDAR = "Não foi possível guardar a imagem. Tente de novo.";
  const id = crypto.randomUUID();
  let url: string;
  try {
    url = await enviarR2(`site/${perfil.id}/${id}.jpg`, bytes, "image/jpeg", total);
  } catch (e) {
    console.error("Imagem do site: R2:", msg(e));
    throw new ErroHttp(500, SEM_GUARDAR);
  }
  let descricao = typeof body.descricao === "string" ? body.descricao.trim().slice(0, 300) : "";
  if (descricao.length < 15 && openaiConfigurada()) {
    try {
      descricao = (await descreverImagem(url, total)) || descricao;
    } catch (e) {
      console.error("Descrever imagem:", msg(e));
    }
  }
  // Relê a lista agora (o envio e a descrição levam segundos): uma imagem guardada nesse meio-tempo não se perde.
  const { data: atual, error: eLer } = await sb.from("gmn_perfis").select("imagens_site").eq("id", perfil.id).maybeSingle();
  if (eLer) {
    console.error("Imagem do site: banco:", eLer.message);
    throw new ErroHttp(500, SEM_GUARDAR);
  }
  const lista = normalizarImagensSite(atual ? atual.imagens_site : perfil.imagens_site).filter((i) => i.origem_url !== origem.href);
  lista.push({ id, url, origem_url: origem.href, descricao });
  const { error } = await sb.from("gmn_perfis").update({ imagens_site: lista, updated_at: new Date().toISOString() }).eq("id", perfil.id);
  if (error) {
    console.error("Imagem do site: banco:", error.message);
    throw new ErroHttp(500, SEM_GUARDAR);
  }
  return json({ imagens_site: lista });
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
    if (body.acao === "site") return await acaoSite(sb, body, total);
    if (body.acao === "baixar_imagem") return await acaoBaixarImagem(body, total);
    if (body.acao === "imagem_site") return await acaoImagemSite(sb, body, total);
    return json({ error: "Ação desconhecida" }, 400);
  } catch (e) {
    if (e instanceof ErroHttp) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: msg(e) }, 500);
  }
});
