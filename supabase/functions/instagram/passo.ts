// Publicação dos posts, uma etapa por vez: agendado → enviando → processando → publicando → publicado (ou erro).
// Toda troca de etapa é condicionada ao status no banco (UPDATE ... WHERE status = <esperado>): duas execuções ao mesmo
// tempo (relógio + "Publicar agora") nunca fazem a mesma etapa, e o media_publish roda uma vez por post.
// Nada é republicado sozinho: post parado no meio vira erro e o André decide pelo "Tentar de novo".
// deno-lint-ignore-file no-explicit-any
import { decidir, graph, paramsCarrossel, paramsFilho, paramsUnico } from "./meta.ts";

export const ATIVOS = ["agendado", "enviando", "processando", "publicando"];
const MIN = 60_000;
const velho = (quando: string, ms: number) => Date.now() - new Date(quando).getTime() > ms;
const msg = (e: any) => String(e?.message ?? e);

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

/** Avança o post uma etapa. Devolve a linha atualizada, a mesma (esperando a Meta) ou null (outra execução pegou). */
export async function avancar(sb: any, token: string, post: any): Promise<any> {
  const id = post.id;
  const criar = (params: Record<string, string>) => graph("POST", `${post.conta_id}/media`, token, params).then((j) => String(j.id));

  if (post.status === "agendado") {
    const p = await mudar(sb, id, "agendado", { status: "enviando", tentativas: (post.tentativas ?? 0) + 1, erro: null });
    if (!p) return null;
    try {
      const urls = await Promise.all(p.midias.map((m: any) => linkR2(m.chave)));
      const containers = p.tipo === "carrossel"
        ? { filhos: await Promise.all(p.midias.map((m: any, i: number) => criar(paramsFilho(m, urls[i])))), principal: null }
        : { filhos: [], principal: await criar(paramsUnico(p, urls[0])) };
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
    if (permalink) await sb.from("ig_posts").update({ permalink }).eq("id", id);
    return salvo ? { ...salvo, permalink } : salvo;
  }

  // enviando/publicando: outra execução está no meio. Parado há mais de 5 min = a função caiu no meio do caminho.
  if (post.status === "enviando" && velho(post.updated_at, 5 * MIN)) {
    return mudar(sb, id, "enviando", { status: "erro", erro: "O envio foi interrompido. Clique em Tentar de novo." });
  }
  if (post.status === "publicando" && velho(post.updated_at, 5 * MIN)) {
    return mudar(sb, id, "publicando", { status: "erro", erro: "A publicação não confirmou. Confira no Instagram antes de tentar de novo." });
  }
  return post;
}

/** Avança os posts da hora (até 10), cada um em laço até terminar ou acabar o tempo (`ate`, em ms). */
export async function passo(sb: any, token: string, ate = 40_000) {
  const fim = Date.now() + ate;
  const { data, error } = await sb.from("ig_posts").select("*").in("status", ATIVOS)
    .lte("agendado_para", new Date().toISOString()).order("agendado_para").limit(10);
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
