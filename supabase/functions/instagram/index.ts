// Agendador do Instagram (spec docs/superpowers/specs/2026-10-02-instagram-posts-design.md).
//   GET                          -> { ok, servico, token }   (token = o segredo META_TOKEN existe)
//   POST { acao: "sincronizar" } -> { contas, paginas }      lê as páginas do usuário do sistema e grava ig_contas
//   POST { acao: "passo" }       -> { posts: [{id, status}] } avança os posts da hora (relógio a cada minuto e "Publicar agora")
//   POST { acao: "excluir", id }  -> { ok }                    apaga na rede um post publicado e marca excluido
//   POST { acao: "locais", q }    -> { lugares }               busca de lugares pelo nome (pode exigir aprovação da Meta)
//   POST { acao: "local", ref }   -> { lugar, sem_conferir? }  confere a página colada (id ou nome de usuário)
//   POST { acao: "permissoes" }   -> { valido, permissoes, paginas } permissões do META_TOKEN e tarefas em cada página
//   POST { acao: "comentar", id }  -> { ok }                    tenta de novo o primeiro comentário de um post publicado
// verify_jwt = false (supabase/config.toml); sem chave de acesso, por decisão do André até o projeto de segurança.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import { GRAPH, contasDasPaginas, listarTudo } from "./meta.ts";
import { comentar, excluir, local, locais, passo, permissoes } from "./passo.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function sincronizar(sb: any, token: string) {
  const campos = "id,name,location,instagram_business_account{id,username,name,profile_picture_url}";
  const paginas = await listarTudo(`${GRAPH}/me/accounts?fields=${encodeURIComponent(campos)}&limit=100&access_token=${encodeURIComponent(token)}`);
  const contas = contasDasPaginas(paginas);
  const agora = new Date().toISOString();
  if (contas.length) {
    // Upsert só com as colunas da Meta: cliente_id (escolhido na tela) não é tocado
    const { error } = await sb.from("ig_contas").upsert(contas.map((c) => ({ ...c, ativa: true, sincronizada_em: agora })), { onConflict: "id" });
    if (error) throw new Error(error.message);
    const ids = contas.map((c) => `"${c.id}"`).join(",");
    const { error: e2 } = await sb.from("ig_contas").update({ ativa: false }).not("id", "in", `(${ids})`);
    if (e2) throw new Error(e2.message);
  }
  return { contas: contas.length, paginas: paginas.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const token = Deno.env.get("META_TOKEN") ?? "";
  if (req.method === "GET") return json({ ok: true, servico: "instagram", token: !!token });
  if (!token) return json({ erro: "Falta o segredo META_TOKEN no Lovable." }, 500);
  let corpo: any;
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: "Corpo inválido." }, 400);
  }
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  try {
    if (corpo?.acao === "sincronizar") return json(await sincronizar(sb, token));
    if (corpo?.acao === "passo") return json(await passo(sb, token));
    if (corpo?.acao === "excluir") return json(await excluir(sb, token, String(corpo.id ?? "")));
    if (corpo?.acao === "locais") return json(await locais(token, String(corpo.q ?? "")));
    if (corpo?.acao === "local") return json(await local(token, String(corpo.ref ?? "")));
    if (corpo?.acao === "permissoes") return json(await permissoes(token));
    if (corpo?.acao === "comentar") return json(await comentar(sb, token, String(corpo.id ?? "")));
    return json({ erro: `Ação desconhecida: ${String(corpo?.acao ?? "")}` }, 400);
  } catch (e: any) {
    console.error(corpo?.acao, e);
    return json({ erro: String(e?.message ?? e) }, 502);
  }
});
