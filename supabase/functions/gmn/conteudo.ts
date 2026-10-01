// Um post completo, sem publicar: tema → texto (com checagem e 1 nova tentativa) → imagem (Drive, IA ou nenhuma).
// deno-lint-ignore-file no-explicit-any
import {
  ESQUEMA_POST, base64ParaBytes, checarTexto, decidirImagem, decisaoChecagem, descricaoDaFoto, escolherPalavras,
  fotoDiretaDoDrive, idPastaDrive, montarMensagensPost, montarPromptImagem, normalizarBriefing, opcoesDaLogo, ordemDeTentativa,
  proximoTema, tipoPelaAssinatura, LOGO_LADO_MAX, type Tema,
} from "./regras.ts";
import { checarImagem, gerarImagem, gerarJson } from "./openai.ts";
import { lerPng, gravarPng, type ImagemRgba } from "./png.ts";
import { aplicarLogo } from "./compor.ts";
import { enviarR2 } from "./r2.ts";
import { baixarDoDrive, baixarMiniatura, imagensDaPasta, tokenGoogle, type ImagemDrive } from "./google.ts";
import { PRAZO, sinal } from "./prazo.ts";

type Sb = any;
/** `descricao`: o que a foto mostra (descrição ou nome do arquivo no Drive; vazia na imagem da IA), para o texto do post. */
type Imagem = { origem: "drive" | "ia" | "site"; ref: string; url: string; descricao: string };

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export interface CamposPost {
  status: "gerado" | "pulado";
  tema: Tema;
  palavras_chave: string[];
  texto: string;
  imagem_origem: "drive" | "ia" | "site" | null;
  imagem_ref: string | null;
  imagem_url: string | null;
  erro: string | null;
}

const FOTOS_TENTADAS = 3;

/**
 * Bytes da foto do Drive: JPG/PNG de até 5 MB vão como estão, desde que os bytes confirmem o tipo (um WEBP salvo como .jpg
 * não passa); o resto (HEIC, WEBP, TIFF… ou arquivo grande) usa a miniatura grande que o Google gera. O tipo devolvido é
 * sempre o lido dos bytes. Sem miniatura (ou com erro) lança, e quem chama passa para a próxima foto.
 */
async function baixarFoto(
  token: string, foto: ImagemDrive, total?: AbortSignal,
): Promise<{ bytes: Uint8Array; tipo: "image/jpeg" | "image/png" }> {
  if (fotoDiretaDoDrive(foto.mimeType, foto.size)) {
    const bytes = await baixarDoDrive(token, foto.id, total);
    const tipo = tipoPelaAssinatura(bytes);
    if (tipo) return { bytes, tipo };
    console.error(`Foto do Drive ${foto.id}: o Drive diz ${foto.mimeType}, mas os bytes não são JPG nem PNG; usando a miniatura.`);
  }
  if (!foto.thumbnailLink) throw new Error("o Drive não gerou miniatura para esta foto");
  return await baixarMiniatura(token, foto.thumbnailLink, total);
}

/**
 * null: o link da pasta do Drive não foi reconhecido; "vazia": nenhuma das fotos tentadas deu para usar. Só entram no rodízio
 * as fotos que têm como ser baixadas (JPG/PNG de até 5 MB ou com miniatura): as que nunca servem não ocupam as 3 tentativas.
 * Tenta até 3 fotos, na ordem do rodízio (a escolhida e, se ela falhar, as próximas); o uso só é registrado para a foto que entrou.
 */
async function imagemDoDrive(sb: Sb, perfil: any, postId: string, total?: AbortSignal): Promise<Imagem | "vazia" | null> {
  const pastaId = idPastaDrive(String(perfil.drive_pasta_url ?? ""));
  if (!pastaId) return null;
  const token = await tokenGoogle(sb, total);
  const fotos = (await imagensDaPasta(token, pastaId, total)).filter((f) => fotoDiretaDoDrive(f.mimeType, f.size) || f.thumbnailLink);
  if (!fotos.length) return "vazia";
  const { data: usos } = await sb.from("gmn_imagens_uso").select("ref, usado_em").eq("perfil_id", perfil.id).eq("origem", "drive");
  const mapa: Record<string, string> = Object.fromEntries((usos ?? []).map((u: any) => [u.ref, u.usado_em]));
  for (const ref of ordemDeTentativa(fotos.map((f) => f.id), mapa, FOTOS_TENTADAS)) {
    const foto = fotos.find((f) => f.id === ref)!;
    let baixada: { bytes: Uint8Array; tipo: "image/jpeg" | "image/png" };
    try {
      baixada = await baixarFoto(token, foto, total);
    } catch (e) {
      // Prazo total estourado: as próximas também falhariam, e o aviso certo é o do prazo.
      if (total?.aborted) throw e;
      console.error(`Foto do Drive ${foto.id} (${foto.mimeType}, ${foto.size} bytes) não serviu:`, msg(e));
      continue;
    }
    const ext = baixada.tipo === "image/png" ? "png" : "jpg";
    const url = await enviarR2(`${perfil.id}/${postId}.${ext}`, baixada.bytes, baixada.tipo, total);
    await sb.from("gmn_imagens_uso").upsert(
      { perfil_id: perfil.id, origem: "drive", ref: foto.id, usado_em: new Date().toISOString() },
      { onConflict: "perfil_id,origem,ref" },
    );
    return { origem: "drive" as const, ref: foto.id, url, descricao: descricaoDaFoto(foto.description, foto.name) };
  }
  return "vazia";
}

const LOGO_BAIXAR_MAX_BYTES = 6 * 1024 * 1024;
const AVISO_LOGO = "Não foi possível usar a logo do perfil.";
const AVISO_APLICAR_LOGO = "Não foi possível aplicar a logo na imagem.";
const AVISO_LOGO_ANTIGA = "Envie a logo do perfil de novo: o formato antigo não é mais aceito.";
const AVISO_FORMATO_IA = "A OpenAI devolveu a imagem num formato inesperado.";
const ASSINATURA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const ehPng = (b: Uint8Array) => ASSINATURA_PNG.every((v, i) => b[i] === v);

/** Erro cuja mensagem já é o aviso final, em português fixo (nada em inglês de biblioteca ou da OpenAI chega à tela). */
class ErroDeAviso extends Error {}

/**
 * Baixa a logo do perfil (PNG). Só aceita URL do próprio bucket (`R2_PUBLIC_BASE`, onde a ação `logo` grava) e arquivo de
 * até 6 MB (conferido pelo `Content-Length` e pelo tamanho lido) que comece com a assinatura PNG (logo antiga em JPG lança
 * um `ErroDeAviso` pedindo o reenvio). Qualquer falha lança: sem a logo a imagem da IA não sai, porque a logo é obrigatória
 * quando existe.
 */
async function baixarLogo(url: string, total?: AbortSignal): Promise<Uint8Array> {
  const base = (Deno.env.get("R2_PUBLIC_BASE") ?? "").replace(/\/+$/, "");
  if (!base || !url.startsWith(base + "/")) throw new Error(`logo fora do bucket: ${url}`);
  const r = await fetch(url, { signal: sinal(PRAZO.r2, total) });
  if (!r.ok) throw new Error(`logo respondeu ${r.status}`);
  if (Number(r.headers.get("content-length")) > LOGO_BAIXAR_MAX_BYTES) throw new Error("logo grande demais");
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.length > LOGO_BAIXAR_MAX_BYTES) throw new Error("logo grande demais");
  if (!ehPng(bytes)) throw new ErroDeAviso(AVISO_LOGO_ANTIGA);
  return bytes;
}

/** Bytes da imagem que a OpenAI devolveu; base64 inválido ou conteúdo que não é PNG vira um aviso fixo (detalhe só no log). */
function bytesDaImagemDaIa(b64: string): Uint8Array {
  let bytes: Uint8Array;
  try {
    bytes = base64ParaBytes(b64);
  } catch (e) {
    console.error("Imagem da IA com base64 inválido:", msg(e));
    throw new ErroDeAviso(AVISO_FORMATO_IA);
  }
  if (!ehPng(bytes)) throw new ErroDeAviso(AVISO_FORMATO_IA);
  return bytes;
}

const AVISO_PESSOAS_OU_TEXTO = "A imagem da IA tinha pessoas ou texto; o post seguiu só com texto.";
const AVISO_LINK_DRIVE = "O link da pasta do Drive não foi reconhecido.";
const AVISO_PASTA_SEM_FOTO = "A pasta do Drive não tem nenhuma foto que deu para usar.";

/**
 * Imagem da IA (PNG), gerada sem a logo e com a logo do perfil aplicada por cima, sem a IA (compor.ts), quando houver
 * (logo que não baixa: sem imagem e com aviso). A imagem da IA passa sempre por uma checagem, ainda sem a logo (pessoas e
 * texto em destaque; com `permitir_pessoas_ia` só o texto reprova): reprovada, gera de novo uma vez, só se sobrar tempo
 * até `prazoFinal`; se ainda reprovar (ou não der tempo), o post fica sem imagem e com aviso. Checagem que falha também
 * deixa o post sem imagem (não dá para garantir que não há pessoas). Logo que não dá para aplicar, ou imagem da OpenAI que
 * não é PNG: sem imagem e com aviso.
 */
async function imagemDaIa(
  perfil: any, postId: string, tema: Tema, prazoFinal: number, total?: AbortSignal,
): Promise<{ imagem: Imagem | null; aviso: string | null }> {
  const permitirPessoas = !!perfil.permitir_pessoas_ia;
  const opcoes = opcoesDaLogo(perfil);
  // A logo é baixada e lida antes de gerar: logo que não serve não deixa pagar pela imagem e pela checagem à toa.
  let logo: ImagemRgba | null = null;
  if (perfil.logo_url) {
    let logoPng: Uint8Array;
    try {
      logoPng = await baixarLogo(String(perfil.logo_url), total);
    } catch (e) {
      console.error("Logo do perfil:", msg(e));
      return { imagem: null, aviso: e instanceof ErroDeAviso ? e.message : AVISO_LOGO };
    }
    try {
      logo = await lerPng(logoPng, LOGO_LADO_MAX);
    } catch (e) {
      console.error("Ler a logo do perfil:", msg(e));
      return { imagem: null, aviso: AVISO_APLICAR_LOGO };
    }
  }
  let versaoAnterior: { tem_pessoas: boolean; tem_texto: boolean } | null = null;
  for (const tentativa of [1, 2] as const) {
    const prompt = montarPromptImagem({
      nome: perfil.nome, categoria: perfil.categoria, briefing: normalizarBriefing(perfil.briefing), tema,
      contextoImagens: perfil.contexto_imagens ?? null, permitirPessoas,
      cantoLivre: logo ? opcoes.posicao : null, versaoAnterior,
    });
    const b64 = await gerarImagem(prompt, total);
    // A checagem roda na imagem da IA, ainda sem a logo.
    const c = await checarImagem(b64, "image/png", total);
    const decisao = decisaoChecagem(tentativa, c, prazoFinal - Date.now(), permitirPessoas);
    if (decisao === "desistir") return { imagem: null, aviso: AVISO_PESSOAS_OU_TEXTO };
    if (decisao === "repetir") {
      versaoAnterior = permitirPessoas ? { tem_pessoas: false, tem_texto: c.tem_texto } : c;
      continue;
    }
    let bytes: Uint8Array;
    try {
      bytes = bytesDaImagemDaIa(b64);
      if (logo) {
        const inicio = Date.now();
        bytes = await gravarPng(aplicarLogo(await lerPng(bytes), logo, opcoes));
        // Medida em produção: mostra quanto da CPU do isolate a composição usa (o Deno pode ser mais lento que o Node).
        console.log("Logo aplicada em", Date.now() - inicio, "ms");
      }
    } catch (e) {
      console.error("Imagem da IA ou aplicação da logo:", msg(e));
      return { imagem: null, aviso: e instanceof ErroDeAviso ? e.message : AVISO_APLICAR_LOGO };
    }
    const chave = `${perfil.id}/${postId}.png`;
    const url = await enviarR2(chave, bytes, "image/png", total);
    return { imagem: { origem: "ia" as const, ref: chave, url, descricao: "" }, aviso: null };
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
      if (doDrive === "vazia") avisos.push(AVISO_PASTA_SEM_FOTO);
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
