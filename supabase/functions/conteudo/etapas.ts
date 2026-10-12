// Fila dos posts: cada passada pega até 3 posts livres e avança cada um uma etapa (texto → imagens → montando → aguardando).
// Trava: `processando_desde` (só pega post livre ou travado há mais de 10 min); toda gravação confere o status.
// Imagens e montagem gravam a cada lâmina e param perto de 90 s: a próxima passada continua de onde parou.
// deno-lint-ignore-file no-explicit-any
import { decodeBase64, encodeBase64 } from "jsr:@std/encoding@1/base64";
import { baixarMiniatura, imagensDaPasta, tokenGoogle } from "../gmn/google.ts";
import { gerarImagem } from "../gmn/openai.ts";
import { ordemDeTentativa } from "../gmn/regras.ts";
import { dataUri, guardar } from "./arquivos.ts";
import { gerarJson } from "./claude.ts";
import { carregarRecursos, montarLamina } from "./montagem.ts";
import { ESQUEMA_ESCOLHA, ESQUEMA_TEXTO, SYSTEM_ESCOLHA, pedidoEscolha, promptImagem, promptTexto } from "./prompts.ts";
import { LimiteCloudflare, renderizar } from "./render.ts";
import {
  CAMPO_FOTO, MOLDES_DO_FORMATO, laminasDaResposta, montarContexto, motivosDoTexto, proximoPilar, usosDeFotos,
  type Formato, type Lamina, type Molde, type RespostaTexto, type StatusPost,
} from "./regras.ts";

const TRAVA_MS = 10 * 60_000;
const ORCAMENTO_MS = 90_000;
const MAX_TENTATIVAS = 3;
const msg = (e: any) => String(e?.message ?? e);
const livre = () => `processando_desde.is.null,processando_desde.lt."${new Date(Date.now() - TRAVA_MS).toISOString()}"`;

export async function passo(sb: any): Promise<{ posts: { id: string; status: string; erro?: string }[] }> {
  const { data, error } = await sb.from("conteudo_posts").select("id, status")
    .in("status", ["texto", "imagens", "montando"]).or(livre()).order("created_at").limit(3);
  if (error) throw new Error(error.message);
  const feitos = await Promise.all((data ?? []).map((p: any) => avancar(sb, p.id, p.status)));
  return { posts: feitos.filter((x) => x !== null) as { id: string; status: string; erro?: string }[] };
}

async function gravar(sb: any, id: string, status: string, campos: Record<string, unknown>): Promise<void> {
  const { error } = await sb.from("conteudo_posts").update({ ...campos, updated_at: new Date().toISOString() }).eq("id", id).eq("status", status);
  if (error) throw new Error(error.message);
}

async function avancar(sb: any, id: string, status: StatusPost): Promise<{ id: string; status: string; erro?: string } | null> {
  const { data: post } = await sb.from("conteudo_posts").update({ processando_desde: new Date().toISOString() })
    .eq("id", id).eq("status", status).or(livre()).select("*").maybeSingle();
  if (!post) return null; // outra passada pegou primeiro
  try {
    const { data: cliente, error } = await sb.from("conteudo_clientes").select("*").eq("id", post.conteudo_cliente_id).single();
    if (error) throw new Error(error.message);
    const campos = status === "texto" ? await etapaTexto(sb, post, cliente)
      : status === "imagens" ? await etapaImagens(sb, post, cliente)
      : await etapaMontagem(sb, post, cliente);
    await gravar(sb, id, status, { ...campos, processando_desde: null, tentativas: 0, erro: null, erro_etapa: null });
    return { id, status: String(campos.status) };
  } catch (e) {
    console.error("conteudo", status, id, e);
    // Limite do Cloudflare: não conta tentativa; a trava (processando_desde) segura o post por 10 minutos
    if (e instanceof LimiteCloudflare) {
      await gravar(sb, id, status, { aviso: msg(e) });
      return { id, status, erro: msg(e) };
    }
    const tentativas = (post.tentativas ?? 0) + 1;
    const fim = tentativas >= MAX_TENTATIVAS;
    await gravar(sb, id, status, fim
      ? { status: "erro", erro_etapa: status, erro: msg(e), tentativas, processando_desde: null }
      : { erro: msg(e), tentativas, processando_desde: null });
    return { id, status: fim ? "erro" : status, erro: msg(e) };
  }
}

async function etapaTexto(sb: any, post: any, c: any): Promise<Record<string, unknown>> {
  const formato = post.formato as Formato;
  const sem = MOLDES_DO_FORMATO[formato].filter((t) => !c.moldes?.[t]?.aprovado_em);
  if (sem.length) throw new Error(`Faltam moldes aprovados: ${sem.join(", ")}.`);
  const { data: arquivos, error } = await sb.from("conteudo_cofre").select("caminho, conteudo").eq("pasta", c.pasta_cofre ?? "");
  if (error) throw new Error(error.message);
  const contexto = montarContexto(arquivos ?? []);
  if (!contexto) throw new Error("O cofre deste cliente ainda não foi sincronizado.");
  const { data: recentes } = await sb.from("conteudo_posts").select("pilar, tema").eq("conteudo_cliente_id", c.id)
    .neq("id", post.id).not("tema", "is", null).order("created_at", { ascending: false }).limit(30);
  const pilares = c.pilares ?? [];
  const pilar = post.pilar
    ? pilares.find((p: any) => p.nome === post.pilar) ?? { nome: post.pilar, descricao: "" }
    : proximoPilar(pilares, (recentes ?? []).map((r: any) => r.pilar));
  const p = promptTexto({
    formato, pilar, tema: post.tema, temasRecentes: (recentes ?? []).map((r: any) => r.tema), tomDeVoz: c.tom_de_voz,
    moldes: c.moldes, pastas: c.drive_pastas ?? [], saude: c.saude,
  });
  // O contexto do cliente vai num bloco com cache: os posts do mesmo cliente na mesma semana reaproveitam
  const blocos: any[] = [
    { type: "text", text: `Contexto do cliente (cofre do Obsidian):\n\n${contexto}`, cache_control: { type: "ephemeral" } },
    { type: "text", text: p.pedido },
  ];
  let r = await gerarJson<RespostaTexto>({ system: p.system, conteudo: blocos, esquema: ESQUEMA_TEXTO, esforco: "medium" });
  let motivos = motivosDoTexto(r, formato, c);
  if (motivos.length) {
    r = await gerarJson<RespostaTexto>({
      system: p.system, esquema: ESQUEMA_TEXTO, esforco: "medium",
      conteudo: [...blocos, { type: "text", text: `Uma versão anterior foi recusada por: ${motivos.join("; ")}. Corrija esses pontos.` }],
    });
    motivos = motivosDoTexto(r, formato, c);
  }
  if (motivos.length) throw new Error(`O texto veio com problema: ${motivos.join("; ")}.`);
  const laminas = laminasDaResposta(r, c.moldes);
  return {
    status: laminas.some((l) => l.imagem?.pendente) ? "imagens" : "montando",
    tema: r.tema, pilar: pilar?.nome ?? null, laminas, legenda: r.legenda,
  };
}

async function usosDoCliente(sb: any, clienteId: string): Promise<Record<string, string>> {
  const desde = new Date(Date.now() - 56 * 86_400_000).toISOString();
  const { data, error } = await sb.from("conteudo_posts").select("laminas, created_at").eq("conteudo_cliente_id", clienteId).gte("created_at", desde);
  if (error) throw new Error(error.message);
  return usosDeFotos(data ?? []);
}

/** Até 3 fotos da subpasta, as menos usadas; o Claude olha e escolhe a que combina (ou nenhuma). */
async function fotoDoDrive(sb: any, descricao: string, pastaId: string | null, usos: Record<string, string>): Promise<{ drive_id: string; chave: string } | null> {
  if (!pastaId) return null;
  const token = await tokenGoogle(sb);
  const lista = (await imagensDaPasta(token, pastaId)).filter((f) => f.thumbnailLink);
  const fotos: { id: string; bytes: Uint8Array; tipo: "image/jpeg" | "image/png" }[] = [];
  for (const id of ordemDeTentativa(lista.map((f) => f.id), usos, 3)) {
    const f = lista.find((x) => x.id === id)!;
    try {
      fotos.push({ id, ...(await baixarMiniatura(token, f.thumbnailLink!)) });
    } catch (e) {
      console.error("miniatura do Drive", id, e);
    }
  }
  if (!fotos.length) return null;
  const r = await gerarJson<{ escolhida: number }>({
    system: SYSTEM_ESCOLHA, esquema: ESQUEMA_ESCOLHA, esforco: "low", maxTokens: 4000,
    conteudo: [
      ...fotos.map((f) => ({ type: "image", source: { type: "base64", media_type: f.tipo, data: encodeBase64(f.bytes) } })),
      { type: "text", text: pedidoEscolha(descricao, fotos.length) },
    ],
  });
  const f = fotos[r.escolhida];
  if (!f) return null;
  const chave = `instagram/conteudo/fotos/${f.id}.${f.tipo === "image/png" ? "png" : "jpg"}`;
  await guardar(chave, f.bytes, f.tipo);
  usos[f.id] = new Date().toISOString();
  return { drive_id: f.id, chave };
}

async function etapaImagens(sb: any, post: any, c: any): Promise<Record<string, unknown>> {
  const inicio = Date.now();
  const laminas: Lamina[] = post.laminas;
  const usos = await usosDoCliente(sb, c.id);
  let aviso: string | null = post.aviso;
  for (let i = 0; i < laminas.length; i++) {
    const l = laminas[i];
    if (!l.imagem?.pendente) continue;
    if (Date.now() - inicio > ORCAMENTO_MS) return { status: "imagens", laminas, aviso };
    const drive = await fotoDoDrive(sb, l.imagem.descricao, l.imagem.pasta_id ?? null, usos).catch((e) => {
      console.error("foto do Drive", e);
      return null;
    });
    if (drive) laminas[i] = { ...l, imagem: { ...l.imagem, pendente: false, origem: "drive", ...drive }, jpg_chave: null };
    else {
      try {
        const b64 = await gerarImagem(promptImagem(l.imagem.descricao, c.ia_pode_pessoas), undefined, { size: "1024x1536", formato: "jpeg" });
        const chave = `instagram/conteudo/ia/${crypto.randomUUID()}.jpg`;
        await guardar(chave, decodeBase64(b64), "image/jpeg");
        laminas[i] = { ...l, imagem: { ...l.imagem, pendente: false, origem: "ia", chave }, jpg_chave: null };
      } catch (e) {
        if (l.molde !== "foto") throw e; // capa e estático com foto não montam sem ela: a etapa tenta de novo
        laminas[i] = { molde: "texto", campos: l.campos, jpg_chave: null };
        aviso = `A imagem da lâmina ${i + 1} falhou (${msg(e)}); ela saiu só com texto.`;
      }
    }
    await gravar(sb, post.id, "imagens", { laminas, aviso });
  }
  return { status: "montando", laminas, aviso };
}

async function etapaMontagem(sb: any, post: any, c: any): Promise<Record<string, unknown>> {
  const inicio = Date.now();
  const laminas: Lamina[] = post.laminas;
  const recursos = await carregarRecursos(c);
  for (let i = 0; i < laminas.length; i++) {
    const l = laminas[i];
    if (l.jpg_chave) continue;
    if (Date.now() - inicio > ORCAMENTO_MS) return { status: "montando", laminas };
    const molde: Molde | undefined = c.moldes?.[l.molde];
    if (!molde) throw new Error(`O molde ${l.molde} não existe mais.`);
    const valores: Record<string, string> = { ...l.campos };
    if (l.imagem?.chave) valores[CAMPO_FOTO] = await dataUri(l.imagem.chave);
    const jpg = await renderizar(montarLamina(molde.html, molde.campos, valores, recursos, l.ajuste_css));
    const chave = `instagram/conteudo/posts/${post.id}/${i + 1}-${Date.now()}.jpg`;
    await guardar(chave, jpg, "image/jpeg");
    laminas[i] = { ...l, jpg_chave: chave };
    await gravar(sb, post.id, "montando", { laminas });
  }
  return { status: "aguardando", laminas };
}
