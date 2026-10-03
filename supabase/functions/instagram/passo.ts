// Publicação dos posts, uma etapa por vez: agendado → enviando → processando → publicando → publicado (ou erro).
// Toda troca de etapa é condicionada ao status no banco (UPDATE ... WHERE status = <esperado>): duas execuções ao mesmo
// tempo (relógio + "Publicar agora") nunca fazem a mesma etapa, e o media_publish roda uma vez por post.
// Nada é republicado sozinho: post parado no meio vira erro e o André decide pelo "Tentar de novo".
// Facebook (rede = facebook) é síncrono: agendado → enviando → publicado, com o token da página.
// Depois de publicar: primeiro comentário e, no Instagram, comentários desativados; falha nisso vira `aviso` (o post fica).
// deno-lint-ignore-file no-explicit-any
import {
  decidir, fbAlbum, fbFoto, fbFotoSolta, fbVideo, graph, linkFacebook, paramsCarrossel, paramsFilho, paramsUnico,
} from "./meta.ts";

export const ATIVOS = ["agendado", "enviando", "processando", "publicando"];
const MIN = 60_000;
const velho = (quando: string, ms: number) => Date.now() - new Date(quando).getTime() > ms;
const msg = (e: any) => String(e?.message ?? e);
/** Erro de permissão ganha o nome da permissão que falta no token. */
const comPermissao = (e: any, permissao: string) =>
  /Sem permissão/.test(msg(e)) ? `${msg(e)}. O token (META_TOKEN) precisa da permissão ${permissao}.` : msg(e);

/**
 * Muda o post só se o status no banco ainda for `de` (e, com `quando`, se ninguém mexeu nele desde aquela leitura);
 * devolve a linha nova ou null (outra execução já mexeu nele).
 */
async function mudar(sb: any, id: string, de: string, campos: Record<string, unknown>, quando?: string): Promise<any> {
  let q = sb.from("ig_posts").update({ ...campos, updated_at: new Date().toISOString() }).eq("id", id).eq("status", de);
  if (quando) q = q.eq("updated_at", quando);
  const { data, error } = await q.select().maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Link assinado (1 h) do arquivo no R2, pelo endereço fixo da função r2 (que responde 302 para o link). */
async function linkR2(chave: string): Promise<string> {
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/r2?c=${encodeURIComponent(chave)}`, { redirect: "manual" });
  const destino = r.headers.get("location");
  await r.body?.cancel();
  if (r.status !== 302 || !destino) throw new Error(`Não foi possível gerar o link do arquivo para a Meta (r2 respondeu ${r.status}).`);
  return destino;
}

/** Página do Facebook ligada à conta e o token dela (o usuário do sistema precisa poder criar conteúdo na página). */
async function tokenDaPagina(sb: any, token: string, contaId: string): Promise<{ pagina: string; tokenPagina: string }> {
  const { data, error } = await sb.from("ig_contas").select("pagina_id").eq("id", contaId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.pagina_id) throw new Error("Esta conta não tem página do Facebook ligada.");
  const j = await graph("GET", data.pagina_id, token, { fields: "access_token" });
  if (!j.access_token) {
    throw new Error("O usuário do sistema não pode publicar nesta página do Facebook (falta pages_manage_posts no token ou a página não está atribuída a ele).");
  }
  return { pagina: data.pagina_id, tokenPagina: j.access_token };
}

/** Primeiro comentário e (Instagram) comentários desativados, nessa ordem. Devolve o aviso ou null. */
async function depoisDePublicar(token: string, alvo: string, p: any, instagram: boolean): Promise<string | null> {
  const avisos: string[] = [];
  if (p.primeiro_comentario?.trim()) {
    await graph("POST", `${alvo}/comments`, token, { message: p.primeiro_comentario.trim() })
      .catch((e) => avisos.push(`O primeiro comentário não saiu: ${comPermissao(e, instagram ? "instagram_manage_comments" : "pages_manage_engagement")}`));
  }
  if (instagram && p.opcoes?.comentarios_desativados) {
    await graph("POST", alvo, token, { comment_enabled: "false" })
      .catch((e) => avisos.push(`Os comentários não foram desativados: ${comPermissao(e, "instagram_manage_comments")}`));
  }
  return avisos.length ? avisos.join(" ") : null;
}

/** Facebook: publica de uma vez (foto, álbum só de fotos ou vídeo) a partir do post já em `enviando`. */
async function publicarFacebook(sb: any, token: string, p: any): Promise<any> {
  let postId: string;
  let tokenPagina: string;
  try {
    const pg = await tokenDaPagina(sb, token, p.conta_id);
    tokenPagina = pg.tokenPagina;
    const urls: string[] = await Promise.all(p.midias.map((m: any) => linkR2(m.chave)));
    if (p.tipo === "reels") {
      postId = String((await graph("POST", `${pg.pagina}/videos`, tokenPagina, fbVideo(p, urls[0]))).id);
    } else if (p.tipo === "foto") {
      const j = await graph("POST", `${pg.pagina}/photos`, tokenPagina, fbFoto(p, urls[0]));
      postId = String(j.post_id ?? j.id);
    } else {
      const ids: string[] = [];
      for (const u of urls) ids.push(String((await graph("POST", `${pg.pagina}/photos`, tokenPagina, fbFotoSolta(u))).id));
      postId = String((await graph("POST", `${pg.pagina}/feed`, tokenPagina, fbAlbum(p, ids))).id);
    }
  } catch (e) {
    return mudar(sb, p.id, "enviando", { status: "erro", erro: comPermissao(e, "pages_manage_posts") });
  }
  const salvo = await mudar(sb, p.id, "enviando", { status: "publicado", media_id: postId, publicado_em: new Date().toISOString(), erro: null });
  const permalink = await graph("GET", postId, tokenPagina, { fields: "permalink_url" }).then((j) => linkFacebook(j.permalink_url), () => null);
  const aviso = await depoisDePublicar(tokenPagina, postId, p, false);
  await sb.from("ig_posts").update({ permalink, aviso }).eq("id", p.id);
  return salvo ? { ...salvo, permalink, aviso } : salvo;
}

/** Avança o post uma etapa. Devolve a linha atualizada, a mesma (esperando a Meta) ou null (outra execução pegou). */
export async function avancar(sb: any, token: string, post: any): Promise<any> {
  const id = post.id;
  const criar = (params: Record<string, string>) => graph("POST", `${post.conta_id}/media`, token, params).then((j) => String(j.id));

  if (post.status === "agendado") {
    const p = await mudar(sb, id, "agendado", { status: "enviando", tentativas: (post.tentativas ?? 0) + 1, erro: null });
    if (!p) return null;
    if (p.rede === "facebook") return publicarFacebook(sb, token, p);
    try {
      const urls = await Promise.all(p.midias.map((m: any) => linkR2(m.chave)));
      const capa = p.tipo === "reels" && p.opcoes?.capa_chave ? await linkR2(p.opcoes.capa_chave) : undefined;
      const containers = p.tipo === "carrossel"
        ? { filhos: await Promise.all(p.midias.map((m: any, i: number) => criar(paramsFilho(m, urls[i])))), principal: null }
        : { filhos: [], principal: await criar(paramsUnico(p, urls[0], capa)) };
      return await mudar(sb, id, "enviando", { status: "processando", containers });
    } catch (e) {
      return await mudar(sb, id, "enviando", { status: "erro", erro: msg(e) });
    }
  }

  if (post.status === "processando") {
    // Relê: enquanto esta execução esperava a Meta, outra pode ter criado o carrossel ou publicado
    const { data: atual, error } = await sb.from("ig_posts").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!atual || atual.status !== "processando") return atual;
    const c = atual.containers ?? { filhos: [], principal: null };
    const status = (cid: string) => graph("GET", cid, token, { fields: "status_code,status" });
    let d: ReturnType<typeof decidir>;
    try {
      d = decidir(await Promise.all(c.filhos.map(status)), c.principal ? await status(c.principal) : null);
    } catch (e) {
      d = { acao: "erro", erro: msg(e) };
    }
    if (d.acao === "erro") return mudar(sb, id, "processando", { status: "erro", erro: d.erro });
    if (d.acao === "esperar") {
      return velho(atual.updated_at, 30 * MIN)
        ? mudar(sb, id, "processando", { status: "erro", erro: "A Meta não terminou de processar a mídia em 30 minutos." })
        : atual;
    }
    if (d.acao === "criar_carrossel") {
      // Só quem ganhar a trava (updated_at da leitura) cria o principal; a outra execução sai
      if (!(await mudar(sb, id, "processando", {}, atual.updated_at))) return null;
      try {
        return await mudar(sb, id, "processando", { containers: { ...c, principal: await criar(paramsCarrossel(atual, c.filhos)) } });
      } catch (e) {
        return mudar(sb, id, "processando", { status: "erro", erro: msg(e) });
      }
    }
    // publicar: só a execução que ganhar esta troca chama o media_publish
    const p = await mudar(sb, id, "processando", { status: "publicando" });
    if (!p) return null;
    let mediaId: string;
    try {
      mediaId = String((await graph("POST", `${p.conta_id}/media_publish`, token, { creation_id: c.principal })).id);
    } catch (e) {
      return mudar(sb, id, "publicando", { status: "erro", erro: `Não publicou: ${msg(e)}` });
    }
    const salvo = await mudar(sb, id, "publicando", { status: "publicado", media_id: mediaId, publicado_em: new Date().toISOString(), erro: null });
    const permalink = await graph("GET", mediaId, token, { fields: "permalink" }).then((j) => j.permalink ?? null, () => null);
    const aviso = p.tipo === "story" ? null : await depoisDePublicar(token, mediaId, p, true);
    if (permalink || aviso) await sb.from("ig_posts").update({ permalink, aviso }).eq("id", id);
    return salvo ? { ...salvo, permalink, aviso } : salvo;
  }

  // enviando/publicando: outra execução está no meio. Parado há mais de 5 min = a função caiu no meio do caminho.
  if (post.status === "enviando" && velho(post.updated_at, 5 * MIN)) {
    return mudar(sb, id, "enviando", { status: "erro", erro: "O envio foi interrompido. Confira na rede se o post saiu antes de tentar de novo." });
  }
  if (post.status === "publicando" && velho(post.updated_at, 5 * MIN)) {
    return mudar(sb, id, "publicando", { status: "erro", erro: "A publicação não confirmou. Confira na rede se o post saiu antes de tentar de novo." });
  }
  return post;
}

/** Avança os posts da hora (até 10), cada um em laço até terminar ou acabar o tempo (`ate`, em ms). */
export async function passo(sb: any, token: string, ate = 40_000) {
  const fim = Date.now() + ate;
  const { data, error } = await sb.from("ig_posts").select("*").in("status", ATIVOS)
    .lte("agendado_para", new Date().toISOString()).order("agendado_para").order("created_at").limit(10); // stories na ordem
  if (error) throw new Error(error.message);
  const posts: { id: string; status: string }[] = [];
  for (let post of data ?? []) {
    while (post && ATIVOS.includes(post.status) && Date.now() < fim) {
      const antes = post.status;
      const quando = post.updated_at;
      post = await avancar(sb, token, post);
      if (post && post.status === antes && post.updated_at === quando) {
        if (antes !== "processando") break; // outra execução está com ele
        await new Promise((r) => setTimeout(r, 4000)); // a Meta ainda processa
      }
    }
    if (post) posts.push({ id: post.id, status: post.status });
  }
  return { posts };
}

/** Apaga na rede um post publicado pelo sistema e marca como excluído. Post que já não existe na rede também vale. */
export async function excluir(sb: any, token: string, id: string) {
  const { data: p, error } = await sb.from("ig_posts").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!p) throw new Error("Post não encontrado.");
  if (p.status !== "publicado" || !p.media_id) throw new Error("Só dá para excluir post publicado.");
  try {
    const tk = p.rede === "facebook" ? (await tokenDaPagina(sb, token, p.conta_id)).tokenPagina : token;
    await graph("DELETE", p.media_id, tk);
  } catch (e) {
    // apagado antes pelo app: segue
    if (!/does not exist/i.test(msg(e))) throw new Error(comPermissao(e, p.rede === "facebook" ? "pages_manage_posts" : "instagram_manage_contents"));
  }
  await mudar(sb, id, "publicado", { status: "excluido", excluido_em: new Date().toISOString() });
  return { ok: true };
}

/** Permissões que o META_TOKEN tem (o token não sai da função). */
export async function permissoes(token: string) {
  const j = await graph("GET", "debug_token", token, { input_token: token });
  return { valido: !!j.data?.is_valid, permissoes: (j.data?.scopes ?? []) as string[] };
}

type Lugar = { id: string; nome: string; endereco: string | null; tem_local: boolean };
const lugar = (pg: any): Lugar => ({
  id: String(pg.id),
  nome: pg.name ?? String(pg.id),
  endereco: [pg.location?.street, pg.location?.city, pg.location?.state].filter(Boolean).join(", ") || null,
  tem_local: pg.location?.latitude != null,
});

/** Busca de lugares pelo nome (Pages Search). Pode exigir a aprovação "Page Public Metadata Access" da Meta. */
export async function locais(token: string, q: string) {
  const termo = q.trim();
  if (termo.length < 2) return { lugares: [] };
  const j = await graph("GET", "pages/search", token, { q: termo, fields: "id,name,location", limit: "15" });
  return { lugares: (j.data ?? []).map(lugar).filter((l: Lugar) => l.tem_local) };
}

/** Confere a página colada (id ou nome de usuário). Sem acesso de leitura e com id numérico, aceita sem conferir. */
export async function local(token: string, ref: string) {
  try {
    return { lugar: lugar(await graph("GET", ref, token, { fields: "id,name,location" })) };
  } catch (e) {
    if (/^\d+$/.test(ref)) return { lugar: { id: ref, nome: `Lugar ${ref}`, endereco: null, tem_local: true }, sem_conferir: true };
    throw e;
  }
}
