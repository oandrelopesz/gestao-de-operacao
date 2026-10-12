// Aba Conteúdo (spec docs/superpowers/specs/2026-10-12-conteudo-automatico-design.md).
//   GET                                                     -> { claude, cloudflare, r2, cofre }   secrets configurados?
//   POST { acao: "passo" }                                  -> { posts }            relógio (aberta, como a do Instagram)
//   POST { acao: "cofre_hashes" }                (x-cofre-key) -> { pastas, hashes } pastas ligadas e hashes guardados
//   POST { acao: "cofre_sync", pastas?, arquivos, remover } (x-cofre-key) -> { gravados, removidos }
//   POST { acao: "cofre_ler", pasta? }                      -> { pastas, sincronizado_em } | { arquivos, total, sincronizado_em }
//        com pasta: só os arquivos do kit (nome com "Design System" ou "tom de voz")
//   POST { acao: "drive_pastas", cliente_id }               -> { pastas }           lê as subpastas do Drive e grava no cliente
//   POST { acao: "molde", cliente_id, tipo }                -> { molde }            cria (ou refaz) um molde com prévia
//   POST { acao: "molde_ajustar", cliente_id, tipo, pedido } -> { molde }           nova versão do molde pelo pedido
//   POST { acao: "semana", segunda, cliente_id? }           -> { criados, pulados } posts da agenda da semana
//   POST { acao: "ajustar", post_id, pedido }               -> { resposta, status } pedido de mudança num post aguardando
// Fora passo e cofre_*, exige x-google-id-token (e-mail em ALLOWED_GOOGLE_EMAILS) ou x-swipe-key, como a função gmn.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import { acessoLiberado } from "../gmn/acesso.ts";
import { arquivosConfigurados } from "./arquivos.ts";
import { claudeConfigurado, gerarJson } from "./claude.ts";
import { lerPastas } from "./drive.ts";
import { passo } from "./etapas.ts";
import { gerarMolde } from "./moldes.ts";
import { ESQUEMA_AJUSTE, promptAjuste } from "./prompts.ts";
import { cloudflareConfigurado } from "./render.ts";
import { ErroHttp, LEGENDA_MAX, aplicarAlteracoes, faltaParaGerar, postsDaSemana, segundaDaSemana, type Alteracao } from "./regras.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-swipe-key, x-google-id-token, x-cofre-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const agora = () => new Date().toISOString();
const texto = (v: unknown, max: number) => typeof v === "string" && v.length > 0 && v.length <= max;
const DO_KIT = /design system|tom[\s_-]*de[\s_-]*voz/i;

function chaveDoCofre(req: Request): boolean {
  const chave = Deno.env.get("COFRE_SYNC_KEY") ?? "";
  const enviada = req.headers.get("x-cofre-key") ?? "";
  if (!chave || chave.length !== enviada.length) return false;
  let d = 0;
  for (let i = 0; i < chave.length; i++) d |= chave.charCodeAt(i) ^ enviada.charCodeAt(i);
  return d === 0;
}

async function cofreHashes(sb: any) {
  const { data: ligados, error } = await sb.from("conteudo_clientes").select("pasta_cofre").not("pasta_cofre", "is", null);
  if (error) throw new Error(error.message);
  const pastas = [...new Set((ligados ?? []).map((x: any) => x.pasta_cofre as string))];
  const hashes: Record<string, Record<string, string>> = {};
  if (pastas.length) {
    const { data, error: e2 } = await sb.from("conteudo_cofre").select("pasta, caminho, hash").in("pasta", pastas);
    if (e2) throw new Error(e2.message);
    for (const r of data ?? []) (hashes[r.pasta] ??= {})[r.caminho] = r.hash;
  }
  return { pastas, hashes };
}

async function cofreSync(sb: any, corpo: any) {
  const quando = agora();
  if (Array.isArray(corpo.pastas)) {
    const pastas = corpo.pastas.filter((p: unknown) => texto(p, 200));
    const { error } = await sb.from("conteudo_cofre")
      .upsert({ pasta: "", caminho: "__pastas__", hash: "", conteudo: JSON.stringify(pastas), atualizado_em: quando });
    if (error) throw new Error(error.message);
  }
  const arquivos = (Array.isArray(corpo.arquivos) ? corpo.arquivos : [])
    .filter((a: any) => texto(a?.pasta, 200) && texto(a?.caminho, 300) && texto(a?.hash, 128) && typeof a?.conteudo === "string" && a.conteudo.length <= 1_000_000)
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
    arquivos: linhas.filter((l: any) => DO_KIT.test(l.caminho.split("/").pop() ?? "")).map((l: any) => ({ caminho: l.caminho, conteudo: l.conteudo })),
    total: linhas.length,
    sincronizado_em,
  };
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
  let q = sb.from("conteudo_clientes").select("*, clientes(nome)");
  if (clienteId) q = q.eq("id", clienteId);
  const { data: clientes, error } = await q;
  if (error) throw new Error(error.message);
  let criados = 0;
  const pulados: { cliente: string; motivo: string }[] = [];
  for (const c of clientes ?? []) {
    const nome = c.clientes?.nome ?? "Cliente";
    const itens = postsDaSemana(segunda, c.agenda ?? []);
    if (!itens.length) {
      pulados.push({ cliente: nome, motivo: "sem dias na agenda" });
      continue;
    }
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
  const { data: c, error: e2 } = await sb.from("conteudo_clientes").select("moldes, drive_pastas").eq("id", post.conteudo_cliente_id).single();
  if (e2) throw new Error(e2.message);
  const m = promptAjuste({ laminas: post.laminas, legenda: post.legenda, moldes: c.moldes, pastas: c.drive_pastas ?? [], pedido });
  const r = await gerarJson<{ resposta: string; alteracoes: Alteracao[] }>({ system: m.system, conteudo: m.user, esquema: ESQUEMA_AJUSTE, esforco: "low" });
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
