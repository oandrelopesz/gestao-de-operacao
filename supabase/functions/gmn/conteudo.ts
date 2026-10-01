// Um post completo, sem publicar: tema → texto (com checagem e 1 nova tentativa) → imagem (Drive, IA ou nenhuma).
// deno-lint-ignore-file no-explicit-any
import {
  ESQUEMA_POST, base64ParaBytes, checarTexto, decidirImagem, decisaoChecagem, escolherImagem, escolherPalavras,
  idPastaDrive, montarMensagensPost, montarPromptImagem, normalizarBriefing, proximoTema, type Tema,
} from "./regras.ts";
import { checarImagem, gerarImagem, gerarJson, type Logo } from "./openai.ts";
import { enviarR2 } from "./r2.ts";
import { baixarDoDrive, imagensDaPasta, tokenGoogle } from "./google.ts";
import { PRAZO, sinal } from "./prazo.ts";

type Sb = any;
type Imagem = { origem: "drive" | "ia"; ref: string; url: string };

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export interface CamposPost {
  status: "gerado" | "pulado";
  tema: Tema;
  palavras_chave: string[];
  texto: string;
  imagem_origem: "drive" | "ia" | null;
  imagem_ref: string | null;
  imagem_url: string | null;
  erro: string | null;
}

/** null: o link da pasta do Drive não foi reconhecido; "vazia": a pasta não tem nenhuma foto aceita. */
async function imagemDoDrive(sb: Sb, perfil: any, postId: string, total?: AbortSignal): Promise<Imagem | "vazia" | null> {
  const pastaId = idPastaDrive(String(perfil.drive_pasta_url ?? ""));
  if (!pastaId) return null;
  const token = await tokenGoogle(sb, total);
  const fotos = await imagensDaPasta(token, pastaId, total);
  if (!fotos.length) return "vazia";
  const { data: usos } = await sb.from("gmn_imagens_uso").select("ref, usado_em").eq("perfil_id", perfil.id).eq("origem", "drive");
  const mapa: Record<string, string> = Object.fromEntries((usos ?? []).map((u: any) => [u.ref, u.usado_em]));
  const ref = escolherImagem(fotos.map((f) => f.id), mapa);
  const foto = fotos.find((f) => f.id === ref)!;
  const bytes = await baixarDoDrive(token, foto.id, total);
  const ext = foto.mimeType === "image/png" ? "png" : "jpg";
  const url = await enviarR2(`${perfil.id}/${postId}.${ext}`, bytes, foto.mimeType, total);
  await sb.from("gmn_imagens_uso").upsert(
    { perfil_id: perfil.id, origem: "drive", ref: foto.id, usado_em: new Date().toISOString() },
    { onConflict: "perfil_id,origem,ref" },
  );
  return { origem: "drive" as const, ref: foto.id, url };
}

const LOGO_BAIXAR_MAX_BYTES = 6 * 1024 * 1024;
const AVISO_LOGO = "Não foi possível usar a logo do perfil.";

/**
 * Baixa a logo do perfil. Só aceita URL do próprio bucket (`R2_PUBLIC_BASE`, onde a ação `logo` grava) e arquivo de
 * até 6 MB (conferido pelo `Content-Length` e pelo tamanho lido). Qualquer falha lança: sem a logo a imagem da IA não
 * sai, porque a logo é obrigatória quando existe.
 */
async function baixarLogo(url: string, total?: AbortSignal): Promise<Logo> {
  const base = (Deno.env.get("R2_PUBLIC_BASE") ?? "").replace(/\/+$/, "");
  if (!base || !url.startsWith(base + "/")) throw new Error(`logo fora do bucket: ${url}`);
  const r = await fetch(url, { signal: sinal(PRAZO.r2, total) });
  if (!r.ok) throw new Error(`logo respondeu ${r.status}`);
  if (Number(r.headers.get("content-length")) > LOGO_BAIXAR_MAX_BYTES) throw new Error("logo grande demais");
  const mime = (r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const tipo = mime === "image/png" || mime === "image/jpeg" ? mime : /\.png(\?|$)/i.test(url) ? "image/png" : "image/jpeg";
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.length > LOGO_BAIXAR_MAX_BYTES) throw new Error("logo grande demais");
  return { bytes, tipo, url };
}

const AVISO_PESSOAS_OU_TEXTO = "A imagem da IA tinha pessoas ou texto; o post seguiu só com texto.";
const AVISO_LINK_DRIVE = "O link da pasta do Drive não foi reconhecido.";

/**
 * Imagem da IA (JPG), com a logo do perfil como referência quando houver (logo que não baixa: sem imagem e com aviso).
 * A imagem passa sempre por uma checagem (pessoas e texto em destaque; a marca da logo não conta; com
 * `permitir_pessoas_ia` só o texto reprova): reprovada, gera de novo uma vez, só se sobrar tempo até `prazoFinal`;
 * se ainda reprovar (ou não der tempo), o post fica sem imagem e com aviso. Checagem que falha também deixa o post sem
 * imagem (não dá para garantir que não há pessoas).
 */
async function imagemDaIa(
  perfil: any, postId: string, tema: Tema, prazoFinal: number, total?: AbortSignal,
): Promise<{ imagem: Imagem | null; aviso: string | null }> {
  const permitirPessoas = !!perfil.permitir_pessoas_ia;
  let logo: Logo | undefined;
  if (perfil.logo_url) {
    try {
      logo = await baixarLogo(String(perfil.logo_url), total);
    } catch (e) {
      console.error("Logo do perfil:", msg(e));
      return { imagem: null, aviso: AVISO_LOGO };
    }
  }
  let versaoAnterior: { tem_pessoas: boolean; tem_texto: boolean } | null = null;
  for (const tentativa of [1, 2] as const) {
    const prompt = montarPromptImagem({
      nome: perfil.nome, categoria: perfil.categoria, briefing: normalizarBriefing(perfil.briefing), tema,
      contextoImagens: perfil.contexto_imagens ?? null, permitirPessoas, comLogo: !!logo, versaoAnterior,
    });
    const b64 = await gerarImagem(prompt, total, logo);
    // A checagem roda sempre: com pessoas permitidas, `tem_pessoas` é ignorado e só o texto em destaque reprova.
    const c = await checarImagem(b64, "image/jpeg", total, logo);
    const decisao = decisaoChecagem(tentativa, c, prazoFinal - Date.now(), permitirPessoas);
    if (decisao === "desistir") return { imagem: null, aviso: AVISO_PESSOAS_OU_TEXTO };
    if (decisao === "repetir") {
      versaoAnterior = permitirPessoas ? { tem_pessoas: false, tem_texto: c.tem_texto } : c;
      continue;
    }
    const chave = `${perfil.id}/${postId}.jpg`;
    const url = await enviarR2(chave, base64ParaBytes(b64), "image/jpeg", total);
    return { imagem: { origem: "ia" as const, ref: chave, url }, aviso: null };
  }
  return { imagem: null, aviso: AVISO_PESSOAS_OU_TEXTO };
}

/**
 * `opcoes.comImagem` (padrão true): false gera só texto, sem buscar nem gerar imagem. Com pasta do Drive preenchida a
 * imagem sai sempre dela (falhou, vazia ou link não reconhecido: sem imagem e com aviso, sem cair para a IA); sem pasta,
 * da IA se estiver ligada. `opcoes.prazoFinal` (ms desde 1970, obrigatório): fim do prazo total da execução, o mesmo
 * de `total` (a nova tentativa da imagem da IA só acontece se sobrarem 45 s).
 */
export async function gerarConteudo(
  sb: Sb, perfil: any, postId: string, total: AbortSignal | undefined, opcoes: { comImagem?: boolean; prazoFinal: number },
): Promise<CamposPost> {
  const prazoFinal = opcoes.prazoFinal;
  const briefing = normalizarBriefing(perfil.briefing);
  const { data: hist } = await sb
    .from("gmn_posts")
    .select("tema, palavras_chave, texto")
    .eq("perfil_id", perfil.id)
    .in("status", ["publicado", "gerado"])
    .neq("id", postId)
    .order("created_at", { ascending: false })
    .limit(10);
  const historico = (hist ?? []) as { tema: string | null; palavras_chave: string[] | null; texto: string | null }[];
  const tema = proximoTema(historico.map((h) => h.tema));
  const palavras = escolherPalavras(briefing.palavras_chave, historico.map((h) => h.palavras_chave ?? []));
  const anteriores = historico.map((h) => h.texto).filter((t): t is string => !!t);

  let motivo: string | null = null;
  let resposta = { texto: "", palavras_chave: [] as string[] };
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const m = montarMensagensPost({
      nome: perfil.nome, categoria: perfil.categoria, briefing, saude: perfil.saude, tema, palavras, anteriores,
      motivoReprovacao: motivo, contextoPosts: perfil.contexto_posts ?? null,
    });
    resposta = await gerarJson<{ texto: string; palavras_chave: string[] }>(m.system, m.user, "post_gmn", ESQUEMA_POST, total);
    const c = checarTexto(resposta.texto, { termosProibidos: briefing.termos_proibidos, saude: perfil.saude });
    motivo = c.ok ? null : c.motivos.join("; ");
    if (c.ok) break;
  }
  // O rodízio conta as palavras escolhidas aqui (a IA pode reescrever a palavra e ela nunca "sairia da fila").
  const usadas = palavras.length ? palavras : resposta.palavras_chave ?? [];
  if (motivo) {
    return {
      status: "pulado", tema, palavras_chave: usadas, texto: resposta.texto, imagem_origem: null, imagem_ref: null,
      imagem_url: null, erro: `Texto reprovado na checagem: ${motivo}`,
    };
  }

  // Imagem que falha não derruba o texto (já gerado e pago): vira aviso em `erro` e o post segue sem imagem.
  let imagem: Imagem | null = null;
  const avisos: string[] = [];
  const origem = decidirImagem({
    comImagem: opcoes.comImagem ?? true,
    temPasta: String(perfil.drive_pasta_url ?? "").trim() !== "",
    usaIa: !!perfil.usa_ia_imagem,
  });
  if (origem === "drive") {
    try {
      const doDrive = await imagemDoDrive(sb, perfil, postId, total);
      if (doDrive === "vazia") avisos.push("A pasta do Drive não tem fotos JPG ou PNG de até 5 MB.");
      else if (doDrive === null) avisos.push(AVISO_LINK_DRIVE);
      else imagem = doDrive;
    } catch (e) {
      avisos.push(`Pasta do Drive: ${msg(e)}`);
    }
  } else if (origem === "ia") {
    try {
      const r = await imagemDaIa(perfil, postId, tema, prazoFinal, total);
      imagem = r.imagem;
      if (r.aviso) avisos.push(r.aviso);
    } catch (e) {
      avisos.push(`Imagem da IA: ${msg(e)}`);
    }
  }
  if (avisos.length) console.error(avisos.join(" · "));

  return {
    status: "gerado", tema, palavras_chave: usadas, texto: resposta.texto.trim(), imagem_origem: imagem?.origem ?? null,
    imagem_ref: imagem?.ref ?? null, imagem_url: imagem?.url ?? null, erro: avisos.length ? avisos.join(" · ") : null,
  };
}
