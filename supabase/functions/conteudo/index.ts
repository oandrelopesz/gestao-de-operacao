// Aba Conteúdo (spec docs/superpowers/specs/2026-10-12-conteudo-automatico-design.md).
//   GET                                                     -> { claude, cloudflare, r2, cofre }   secrets configurados?
//   POST { acao: "passo" }                                  -> { posts }            relógio (aberta, como a do Instagram)
//   POST { acao: "cofre_hashes" }                (x-cofre-key) -> { pastas, hashes } pastas ligadas e hashes guardados
//   POST { acao: "cofre_sync", pastas?, arquivos, remover } (x-cofre-key) -> { gravados, removidos }
//   POST { acao: "cofre_ler", pasta? }                      -> { pastas, sincronizado_em } | { arquivos, total, sincronizado_em }
//        com pasta: só as notas .md do kit (nome com "Design System" ou "tom de voz"), nunca Anexos/
//   cofre_sync também aceita logos de Anexos/ com binario: true (base64 vai para o R2)
//   POST { acao: "kit_do_cofre", cliente_id, so_fontes? }             -> { kit }              monta fontes, logos, pilares, conta e Drive a partir do cofre
//   POST { acao: "drive_pastas", cliente_id }               -> { pastas }           lê as subpastas do Drive e grava no cliente
//   POST { acao: "molde", cliente_id, tipo }                -> { molde }            cria (ou refaz) um molde com prévia
//   POST { acao: "molde_ajustar", cliente_id, tipo, pedido } -> { molde }           nova versão do molde pelo pedido
//   POST { acao: "semana", segunda, cliente_id? }           -> { criados, pulados } posts da agenda da semana
//   POST { acao: "ajustar", post_id, pedido }               -> { resposta, status } pedido de mudança num post aguardando
// Fora passo e cofre_*, exige x-google-id-token (e-mail em ALLOWED_GOOGLE_EMAILS) ou x-swipe-key, como a função gmn.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import { acessoLiberado } from "../gmn/acesso.ts";
import { decodeBase64 } from "jsr:@std/encoding@1/base64";
import { arquivosConfigurados, guardar, ler } from "./arquivos.ts";
import { claudeConfigurado, gerarJson } from "./claude.ts";
import { lerPastas } from "./drive.ts";
import { passo } from "./etapas.ts";
import { gerarMolde } from "./moldes.ts";
import { ESQUEMA_AJUSTE, ESQUEMA_KIT, SYSTEM_KIT, promptAjuste } from "./prompts.ts";
import { cloudflareConfigurado, resolverFonte } from "./render.ts";
import {
  AGENDA_PADRAO, ErroHttp, LEGENDA_MAX, aplicarAlteracoes, casarConta, dimensoesImagem, ehFonteDoCofre, ehLogoDoCofre, faltaParaGerar, fontesDoCofre, linkDrive,
  montarContexto, notaDoKit, postsDaSemana, segundaDaSemana, varianteDoNome, type Alteracao, type Fonte, type Logo, type Pilar,
} from "./regras.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-swipe-key, x-google-id-token, x-cofre-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const agora = () => new Date().toISOString();
const texto = (v: unknown, max: number) => typeof v === "string" && v.length > 0 && v.length <= max;

function chaveDoCofre(req: Request): boolean {
  const chave = Deno.env.get("COFRE_SYNC_KEY") ?? "";
  const enviada = req.headers.get("x-cofre-key") ?? "";
  if (!chave || chave.length !== enviada.length) return false;
  let d = 0;
  for (let i = 0; i < chave.length; i++) d |= chave.charCodeAt(i) ^ enviada.charCodeAt(i);
  return d === 0;
}

async function cofreHashes(sb: any) {
  // Todas as pastas: qualquer cliente pode ser ligado e puxar o kit na hora
  const hashes: Record<string, Record<string, string>> = {};
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from("conteudo_cofre").select("pasta, caminho, hash").neq("pasta", "").order("pasta").order("caminho").range(de, de + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) (hashes[r.pasta] ??= {})[r.caminho] = r.hash;
    if ((data ?? []).length < 1000) break;
  }
  return { pastas: Object.keys(hashes), hashes };
}

async function cofreSync(sb: any, corpo: any) {
  const quando = agora();
  if (Array.isArray(corpo.pastas)) {
    const pastas = corpo.pastas.filter((p: unknown) => texto(p, 200));
    const { error } = await sb.from("conteudo_cofre")
      .upsert({ pasta: "", caminho: "__pastas__", hash: "", conteudo: JSON.stringify(pastas), atualizado_em: quando });
    if (error) throw new Error(error.message);
  }
  const TIPOS: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml", woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", otf: "font/otf" };
  const validos = (Array.isArray(corpo.arquivos) ? corpo.arquivos : [])
    .filter((a: any) => texto(a?.pasta, 200) && texto(a?.caminho, 300) && texto(a?.hash, 128) && typeof a?.conteudo === "string"
      && (a.binario === true ? (ehLogoDoCofre(a.caminho) || ehFonteDoCofre(a.caminho)) && a.conteudo.length <= 4_000_000 : a.conteudo.length <= 1_000_000));
  for (const a of validos) {
    if (a.binario !== true) continue;
    const ext = String(a.caminho.split(".").pop()).toLowerCase();
    const chave = `instagram/conteudo/cofre/${a.hash.replace(/[^a-zA-Z0-9_-]/g, "")}.${ext}`;
    await guardar(chave, decodeBase64(a.conteudo), TIPOS[ext] ?? "application/octet-stream");
    a.conteudo = chave;
  }
  const arquivos = validos
    .map((a: any) => ({ pasta: a.pasta, caminho: a.caminho, hash: a.hash, conteudo: a.conteudo, atualizado_em: quando }));
  if (arquivos.length) {
    const { error } = await sb.from("conteudo_cofre").upsert(arquivos, { onConflict: "pasta,caminho" });
    if (error) throw new Error(error.message);
  }
  let removidos = 0;
  for (const r of Array.isArray(corpo.remover) ? corpo.remover : []) {
    if (!texto(r?.pasta, 200) || !texto(r?.caminho, 300)) continue;
    const { error } = await sb.from("conteudo_cofre").delete().eq("pasta", r.pasta).eq("caminho", r.caminho);
    if (error) throw new Error(error.message);
    removidos++;
  }
  return { gravados: arquivos.length, removidos };
}

async function cofreLer(sb: any, pasta: string | null) {
  const { data: lista, error } = await sb.from("conteudo_cofre").select("conteudo, atualizado_em").eq("pasta", "").eq("caminho", "__pastas__").maybeSingle();
  if (error) throw new Error(error.message);
  const sincronizado_em = lista?.atualizado_em ?? null;
  if (pasta === null) return { pastas: lista ? JSON.parse(lista.conteudo) : [], sincronizado_em };
  const { data, error: e2 } = await sb.from("conteudo_cofre").select("caminho, conteudo").eq("pasta", pasta);
  if (e2) throw new Error(e2.message);
  const linhas = data ?? [];
  return {
    arquivos: linhas.filter((l: any) => notaDoKit(l.caminho)).map((l: any) => ({ caminho: l.caminho, conteudo: l.conteudo })),
    total: linhas.length,
    sincronizado_em,
  };
}

async function kitDoCofre(sb: any, clienteId: string, soFontes = false) {
  const { data: c, error } = await sb.from("conteudo_clientes").select("*, clientes(nome)").eq("id", clienteId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!c) throw new ErroHttp(404, "Cliente não encontrado.");
  if (!c.pasta_cofre) throw new ErroHttp(400, "Escolha a pasta do cofre deste cliente.");
  const { data: linhas, error: e2 } = await sb.from("conteudo_cofre").select("caminho, conteudo").eq("pasta", c.pasta_cofre);
  if (e2) throw new Error(e2.message);
  if (!linhas?.length) throw new ErroHttp(400, "O cofre deste cliente ainda não foi sincronizado.");
  const notas = linhas.filter((l: any) => l.caminho.endsWith(".md"));
  const ds = linhas.find((l: any) => notaDoKit(l.caminho) === "design_system");
  const tomNota = linhas.find((l: any) => notaDoKit(l.caminho) === "tom_de_voz");
  // so_fontes: sem Claude, os papéis são as famílias que o cliente já tem
  const r = soFontes
    ? { tom_de_voz: "", fontes: (c.fontes ?? []).map((f: Fonte) => ({ familia: f.familia, reservas: [] as string[] })), pilares: [] as Pilar[], saude: false }
    : await gerarJson<{ tom_de_voz: string; fontes: { familia: string; reservas: string[] }[]; pilares: Pilar[]; saude: boolean }>({
      system: SYSTEM_KIT, conteudo: montarContexto(linhas), esquema: ESQUEMA_KIT, esforco: "low", maxTokens: 4000,
    });
  const avisos: string[] = [];
  const fontes: Fonte[] = [];
  const vistas = new Set<string>();
  const arquivosFonte = linhas.filter((l: any) => ehFonteDoCofre(l.caminho)).map((l: any) => ({ caminho: l.caminho, chave: l.conteudo }));
  for (const f of r.fontes ?? []) {
    if (vistas.has(f.familia.toLowerCase())) continue;
    vistas.add(f.familia.toLowerCase());
    let achou: Fonte[] = [];
    for (const nome of [f.familia, ...(f.reservas ?? [])]) {
      achou = fontesDoCofre(nome, arquivosFonte);
      if (!achou.length) { const ok = await resolverFonte(nome, []); if (ok) achou = [ok]; }
      if (achou.length) break;
    }
    if (achou.length) fontes.push(...achou); else avisos.push(`Fonte ${f.familia} não encontrada no Google nem no Fontshare`);
  }
  if (soFontes) {
    const { error: e5 } = await sb.from("conteudo_clientes").update({ fontes: fontes.length ? fontes : c.fontes ?? [], updated_at: agora() }).eq("id", c.id);
    if (e5) throw new Error(e5.message);
    return { kit: { fontes: fontes.length, avisos } };
  }
  const logosDoCofre: Logo[] = [];
  for (const l of linhas.filter((x: any) => ehLogoDoCofre(x.caminho))) {
    const { bytes } = await ler(l.conteudo);
    const d = dimensoesImagem(bytes) ?? { largura: 0, altura: 0 };
    logosDoCofre.push({ variante: varianteDoNome(l.caminho.split("/").pop() ?? ""), chave: l.conteudo, ...d });
  }
  const variantes = new Set(logosDoCofre.map((l) => l.variante));
  const logos = [...(c.logos ?? []).filter((l: Logo) => !variantes.has(l.variante)), ...logosDoCofre];
  let conta = c.ig_conta_id ?? null;
  if (!conta) {
    const { data: contas, error: e3 } = await sb.from("ig_contas").select("id, usuario, nome").eq("ativa", true).eq("oculta", false);
    if (e3) throw new Error(e3.message);
    conta = casarConta(c.clientes?.nome ?? "", contas ?? []);
  }
  let drive = c.drive_url ?? "";
  let pastasDrive = c.drive_pastas ?? [];
  if (!drive.trim()) {
    const achado = linkDrive(notas.map((l: any) => l.conteudo).join("\n"));
    if (achado) {
      drive = achado;
      try { pastasDrive = await lerPastas(sb, achado); } catch (e: any) { avisos.push(`Drive: ${e?.message ?? e}`); }
    }
  }
  const pilares = r.pilares?.length ? r.pilares : c.pilares ?? [];
  const { error: e4 } = await sb.from("conteudo_clientes").update({
    design_system: ds ? ds.conteudo : c.design_system,
    tom_de_voz: tomNota ? tomNota.conteudo : r.tom_de_voz,
    fontes: fontes.length ? fontes : c.fontes ?? [],
    pilares, saude: !!r.saude, logos, ig_conta_id: conta, drive_url: drive, drive_pastas: pastasDrive,
    agenda: c.agenda?.length ? c.agenda : AGENDA_PADRAO, updated_at: agora(),
  }).eq("id", c.id);
  if (e4) throw new Error(e4.message);
  return { kit: { fontes: fontes.length, logos: logosDoCofre.length, pilares: r.pilares?.length ?? 0, conta: !!conta, drive: !!drive.trim(), avisos } };
}

async function drivePastas(sb: any, clienteId: string) {
  const { data: c, error } = await sb.from("conteudo_clientes").select("id, drive_url").eq("id", clienteId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!c) throw new ErroHttp(404, "Cliente não encontrado.");
  if (!c.drive_url.trim()) throw new ErroHttp(400, "Cole o link da pasta do Drive antes.");
  const pastas = await lerPastas(sb, c.drive_url);
  const { error: e2 } = await sb.from("conteudo_clientes").update({ drive_pastas: pastas, updated_at: agora() }).eq("id", c.id);
  if (e2) throw new Error(e2.message);
  return { pastas };
}

async function gerarSemana(sb: any, segunda: string, clienteId: string | null) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(segunda) || segundaDaSemana(segunda) !== segunda) {
    throw new ErroHttp(400, "Informe a segunda-feira da semana (AAAA-MM-DD).");
  }
  let q = sb.from("conteudo_clientes").select("*, clientes(nome)").eq("oculto", false);
  q = clienteId ? q.eq("id", clienteId) : q.eq("ativo", true); // só os ligados; um cliente pedido gera mesmo desligado
  const { data: clientes, error } = await q;
  if (error) throw new Error(error.message);
  let criados = 0;
  const pulados: { cliente: string; motivo: string }[] = [];
  for (const c of clientes ?? []) {
    const nome = c.clientes?.nome ?? "Cliente";
    const itens = postsDaSemana(segunda, c.agenda ?? []);
    if (!itens.length) continue;
    const faltas = [...new Set(itens.flatMap((p) => faltaParaGerar(c, p.formato)))];
    if (faltas.length) pulados.push({ cliente: nome, motivo: `falta ${faltas.join(", ")}` });
    const prontos = itens.filter((p) => !faltaParaGerar(c, p.formato).length);
    if (!prontos.length) continue;
    const { data, error: e2 } = await sb.from("conteudo_posts")
      .upsert(prontos.map((p) => ({ ...p, conteudo_cliente_id: c.id, status: "texto" })), { onConflict: "conteudo_cliente_id,origem_data", ignoreDuplicates: true })
      .select("id");
    if (e2) throw new Error(e2.message);
    criados += data?.length ?? 0;
  }
  return { criados, pulados };
}

async function ajustar(sb: any, postId: string, pedido: string) {
  if (!pedido.trim()) throw new ErroHttp(400, "Escreva o que mudar.");
  const { data: post, error } = await sb.from("conteudo_posts").select("*").eq("id", postId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!post) throw new ErroHttp(404, "Post não encontrado.");
  if (post.status !== "aguardando") throw new ErroHttp(409, "O post não está aguardando aprovação.");
  const { data: c, error: e2 } = await sb.from("conteudo_clientes").select("moldes, drive_pastas, pasta_cofre").eq("id", post.conteudo_cliente_id).single();
  if (e2) throw new Error(e2.message);
  const { data: arquivos } = c.pasta_cofre ? await sb.from("conteudo_cofre").select("caminho, conteudo").eq("pasta", c.pasta_cofre) : { data: [] };
  const contexto = montarContexto(arquivos ?? []);
  const m = promptAjuste({ laminas: post.laminas, legenda: post.legenda, moldes: c.moldes, pastas: c.drive_pastas ?? [], pedido });
  const conteudo = contexto
    ? [{ type: "text", text: `Contexto do cliente (cofre do Obsidian):\n\n${contexto}`, cache_control: { type: "ephemeral" } }, { type: "text", text: m.user }]
    : m.user;
  const r = await gerarJson<{ resposta: string; alteracoes: Alteracao[] }>({ system: m.system, conteudo, esquema: ESQUEMA_AJUSTE, esforco: "low" });
  const novo = aplicarAlteracoes(post.laminas, post.legenda, r.alteracoes);
  if (novo.legenda.length > LEGENDA_MAX) throw new ErroHttp(400, `A legenda ficaria com ${novo.legenda.length} caracteres (máximo ${LEGENDA_MAX}); peça uma mais curta.`);
  const remontar = novo.laminas.some((l) => !l.jpg_chave);
  const status = novo.imagens ? "imagens" : remontar ? "montando" : "aguardando";
  const pedidos = [...(post.pedidos ?? []), { texto: pedido.trim(), em: agora(), resultado: r.resposta }];
  const { data: gravado, error: e3 } = await sb.from("conteudo_posts")
    .update({ laminas: novo.laminas, legenda: novo.legenda, status, pedidos, tentativas: 0, erro: null, updated_at: agora() })
    .eq("id", post.id).eq("status", "aguardando").select("id").maybeSingle();
  if (e3) throw new Error(e3.message);
  if (!gravado) throw new ErroHttp(409, "O post mudou enquanto o pedido era feito; abra de novo.");
  return { resposta: r.resposta, status };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method === "GET") {
    return json({ claude: claudeConfigurado(), cloudflare: cloudflareConfigurado(), r2: arquivosConfigurados(), cofre: !!Deno.env.get("COFRE_SYNC_KEY") });
  }
  let corpo: any;
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: "Corpo inválido." }, 400);
  }
  const acao = String(corpo?.acao ?? "");
  const doCofre = acao === "cofre_hashes" || acao === "cofre_sync";
  const liberado = doCofre ? chaveDoCofre(req) : acao === "passo" || (await acessoLiberado(req));
  if (!liberado) return json({ erro: "Acesso negado." }, 401);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  try {
    switch (acao) {
      case "passo": return json(await passo(sb));
      case "cofre_hashes": return json(await cofreHashes(sb));
      case "cofre_sync": return json(await cofreSync(sb, corpo));
      case "cofre_ler": return json(await cofreLer(sb, corpo.pasta ? String(corpo.pasta) : null));
      case "kit_do_cofre": return json(await kitDoCofre(sb, String(corpo.cliente_id ?? ""), corpo.so_fontes === true));
      case "drive_pastas": return json(await drivePastas(sb, String(corpo.cliente_id ?? "")));
      case "molde": return json({ molde: await gerarMolde(sb, String(corpo.cliente_id ?? ""), corpo.tipo) });
      case "molde_ajustar": {
        const pedido = String(corpo.pedido ?? "").trim();
        if (!pedido) throw new ErroHttp(400, "Escreva o que mudar no molde.");
        return json({ molde: await gerarMolde(sb, String(corpo.cliente_id ?? ""), corpo.tipo, pedido) });
      }
      case "semana": return json(await gerarSemana(sb, String(corpo.segunda ?? ""), corpo.cliente_id ? String(corpo.cliente_id) : null));
      case "ajustar": return json(await ajustar(sb, String(corpo.post_id ?? ""), String(corpo.pedido ?? "")));
      default: return json({ erro: `Ação desconhecida: ${acao}` }, 400);
    }
  } catch (e: any) {
    if (e instanceof ErroHttp) return json({ erro: e.message }, e.status);
    console.error(acao, e);
    return json({ erro: String(e?.message ?? e) }, 502);
  }
});
