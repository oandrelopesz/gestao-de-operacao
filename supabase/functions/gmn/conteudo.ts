// Um post completo, sem publicar: tema → texto (com checagem e 1 nova tentativa) → imagem (Drive, site, IA ou nenhuma).
// deno-lint-ignore-file no-explicit-any
import {
  ESQUEMA_POST, base64ParaBytes, checarTexto, decisaoChecagem, descricaoDaFoto, escolherPalavras, fontesDaImagem,
  fotoDiretaDoDrive, fotosDoSiteComDescricao, idPastaDrive, montarMensagensPost, montarPromptImagem, normalizarBriefing,
  opcoesDaLogo, ordemDeTentativa, proximoTema, tipoPelaAssinatura, LOGO_LADO_MAX, type Tema,
} from "./regras.ts";
import { checarImagem, fotosQueCombinam, gerarImagem, gerarJson } from "./openai.ts";
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

/** O Drive roda antes do texto: o texto precisa de pelo menos isto (2 tentativas de até 60 s cada, no pior caso) do prazo total. */
const MARGEM_DO_TEXTO_MS = 70_000;

/** Marca a foto como usada agora (rodízio). Falha só vai para o log: não derruba o post. */
async function registrarUso(sb: Sb, perfilId: string, origem: "drive" | "site", ref: string): Promise<void> {
  try {
    const { error } = await sb.from("gmn_imagens_uso").upsert(
      { perfil_id: perfilId, origem, ref, usado_em: new Date().toISOString() },
      { onConflict: "perfil_id,origem,ref" },
    );
    if (error) console.error(`Uso da foto (${origem}) não registrado:`, error.message);
  } catch (e) {
    console.error(`Uso da foto (${origem}) não registrado:`, msg(e));
  }
}

/**
 * null: o link da pasta do Drive não foi reconhecido; "vazia": nenhuma das fotos tentadas deu para usar; "demorou": o tempo
 * reservado ao Drive acabou (o texto precisa de `MARGEM_DO_TEXTO_MS` até `prazoFinal`). Só entram no rodízio as fotos que têm
 * como ser baixadas (JPG/PNG de até 5 MB ou com miniatura): as que nunca servem não ocupam as 3 tentativas. Tenta até 3 fotos,
 * na ordem do rodízio (a escolhida e, se ela falhar, as próximas), e antes de cada uma confere se ainda sobra tempo; as chamadas
 * ao Google e ao R2 também param quando o tempo reservado acaba. O uso da foto NÃO é registrado aqui: quem chama registra depois
 * que o texto passar (a cópia no R2 de um post reprovado pode ficar sem uso).
 */
async function imagemDoDrive(
  sb: Sb, perfil: any, postId: string, prazoFinal: number, total?: AbortSignal,
): Promise<Imagem | "vazia" | "demorou" | null> {
  const pastaId = idPastaDrive(String(perfil.drive_pasta_url ?? ""));
  if (!pastaId) return null;
  const orcamento = sinal(Math.max(prazoFinal - Date.now() - MARGEM_DO_TEXTO_MS, 0), total);
  const token = await tokenGoogle(sb, orcamento);
  const fotos = (await imagensDaPasta(token, pastaId, orcamento)).filter((f) => fotoDiretaDoDrive(f.mimeType, f.size) || f.thumbnailLink);
  if (!fotos.length) return "vazia";
  const { data: usos } = await sb.from("gmn_imagens_uso").select("ref, usado_em").eq("perfil_id", perfil.id).eq("origem", "drive");
  const mapa: Record<string, string> = Object.fromEntries((usos ?? []).map((u: any) => [u.ref, u.usado_em]));
  for (const ref of ordemDeTentativa(fotos.map((f) => f.id), mapa, FOTOS_TENTADAS)) {
    if (prazoFinal - Date.now() < MARGEM_DO_TEXTO_MS) return "demorou";
    const foto = fotos.find((f) => f.id === ref)!;
    let baixada: { bytes: Uint8Array; tipo: "image/jpeg" | "image/png" };
    try {
      baixada = await baixarFoto(token, foto, orcamento);
    } catch (e) {
      // Prazo total estourado: as próximas também falhariam, e o aviso certo é o do prazo. Tempo do Drive esgotado: segue sem foto.
      if (total?.aborted) throw e;
      if (orcamento.aborted) return "demorou";
      console.error(`Foto do Drive ${foto.id} (${foto.mimeType}, ${foto.size} bytes) não serviu:`, msg(e));
      continue;
    }
    const ext = baixada.tipo === "image/png" ? "png" : "jpg";
    const url = await enviarR2(`${perfil.id}/${postId}.${ext}`, baixada.bytes, baixada.tipo, orcamento);
    return { origem: "drive" as const, ref: foto.id, url, descricao: descricaoDaFoto(foto.description, foto.name) };
  }
  return "vazia";
}

/** Fotos do site que a IA pode olhar de uma vez para ver se combinam com o post. */
const FOTOS_DO_SITE_CONFERIDAS = 40;

/**
 * Foto do site (já no R2, em JPG) que combina com o texto do post, ou null. Só entram as fotos com descrição, se a chave
 * `usa_fotos_site` estiver ligada. A IA vê as descrições (as menos usadas primeiro, até 40) e diz quais combinam; entre elas
 * vale o rodízio: a menos usada (nunca usada, ou usada há mais tempo), e o uso é registrado. Nenhuma combina: null.
 */
async function imagemDoSite(sb: Sb, perfil: any, texto: string, total?: AbortSignal): Promise<Imagem | null> {
  const lista = fotosDoSiteComDescricao(perfil);
  if (!lista.length) return null;
  const { data: usos } = await sb.from("gmn_imagens_uso").select("ref, usado_em").eq("perfil_id", perfil.id).eq("origem", "site");
  const mapa: Record<string, string> = Object.fromEntries((usos ?? []).map((u: any) => [u.ref, u.usado_em]));
  const ordem = ordemDeTentativa(lista.map((f) => f.id), mapa, FOTOS_DO_SITE_CONFERIDAS);
  const combinam = new Set(await fotosQueCombinam(texto, ordem.map((id) => lista.find((f) => f.id === id)!), total));
  // `ordem` já vai da menos usada para a mais usada: a primeira que combina é a do rodízio.
  const ref = ordem.find((id) => combinam.has(id));
  if (!ref) return null;
  const item = lista.find((f) => f.id === ref)!;
  await registrarUso(sb, perfil.id, "site", item.id);
  return { origem: "site" as const, ref: item.id, url: item.url, descricao: item.descricao };
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
const AVISO_DRIVE_DEMOROU = "O Drive demorou demais; o post seguiu só com texto.";
const AVISO_SITE_SEM_FOTO = "Nenhuma foto do site combinou com este post.";
const AVISO_SITE_NAO_CONFERIDA = "Não foi possível conferir as fotos do site.";

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
 * `opcoes.comImagem` (padrão true): false gera só texto, sem buscar nem gerar imagem. Fontes da imagem (`fontesDaImagem`):
 *  - com pasta do Drive preenchida, só o Drive (falhou, vazia ou link não reconhecido: sem imagem e com aviso, sem cair para
 *    outra fonte); a foto é escolhida ANTES do texto (a descrição dela vai para o prompt do post) com tempo próprio: o texto
 *    precisa de 70 s até `prazoFinal`, e se o Drive passar disso o post segue só com texto e com aviso. A foto só conta como
 *    usada no rodízio depois que o texto passa;
 *  - sem pasta, a foto do site (só com a chave `usa_fotos_site` ligada e foto com descrição) e depois a IA, se ligada. A foto
 *    do site é escolhida DEPOIS do texto e só entra se a IA conferir que combina com ele; nenhuma combina: segue para a IA
 *    (ou, sem IA, o post sai só com texto e com aviso).
 * `opcoes.prazoFinal` (ms desde 1970, obrigatório): fim do prazo total da execução, o mesmo de `total` (a nova tentativa da
 * imagem da IA só acontece se sobrarem 45 s).
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
  const fontes = fontesDaImagem({
    comImagem: opcoes.comImagem ?? true,
    temPasta: String(perfil.drive_pasta_url ?? "").trim() !== "",
    temFotosSite: fotosDoSiteComDescricao(perfil).length > 0,
    usaIa: !!perfil.usa_ia_imagem,
  });

  // Imagem que falha não derruba o texto (já gerado e pago): vira aviso em `erro` e o post segue sem imagem.
  let imagem: Imagem | null = null;
  const avisos: string[] = [];
  // Foto do Drive é escolhida antes do texto: a descrição dela vai para o prompt do post.
  if (fontes[0] === "drive") {
    try {
      const doDrive = await imagemDoDrive(sb, perfil, postId, prazoFinal, total);
      if (doDrive === "vazia") avisos.push(AVISO_PASTA_SEM_FOTO);
      else if (doDrive === "demorou") avisos.push(AVISO_DRIVE_DEMOROU);
      else if (doDrive === null) avisos.push(AVISO_LINK_DRIVE);
      else imagem = doDrive;
    } catch (e) {
      avisos.push(`Pasta do Drive: ${msg(e)}`);
    }
  }

  let motivo: string | null = null;
  let resposta = { texto: "", palavras_chave: [] as string[] };
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const m = montarMensagensPost({
      nome: perfil.nome, categoria: perfil.categoria, briefing, saude: perfil.saude, tema, palavras, anteriores,
      motivoReprovacao: motivo, contextoPosts: perfil.contexto_posts ?? null, descricaoImagem: imagem?.descricao || null,
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

  // O texto passou: só agora a foto do Drive conta como usada no rodízio (reprovado, a foto volta para a fila).
  if (fontes[0] === "drive" && imagem) await registrarUso(sb, perfil.id, "drive", imagem.ref);

  // Sem Drive: depois do texto, tenta cada fonte na ordem e para na primeira que dá imagem (site: só se combinar com o texto).
  if (fontes[0] !== "drive") {
    for (const fonte of fontes) {
      if (imagem) break;
      if (fonte === "site") {
        let conferiu = true;
        try {
          imagem = await imagemDoSite(sb, perfil, resposta.texto.trim(), total);
        } catch (e) {
          // A conferência da IA falhou (prazo ou resposta ilegível): não é "nenhuma combinou", e o detalhe vai só para o log.
          conferiu = false;
          console.error("Imagem do site:", msg(e));
        }
        // Com a IA depois do site, ela é quem avisa se também não sair imagem.
        if (!imagem && !fontes.includes("ia")) avisos.push(conferiu ? AVISO_SITE_SEM_FOTO : AVISO_SITE_NAO_CONFERIDA);
      } else if (fonte === "ia") {
        try {
          const r = await imagemDaIa(perfil, postId, tema, prazoFinal, total);
          imagem = r.imagem;
          if (r.aviso) avisos.push(r.aviso);
        } catch (e) {
          avisos.push(`Imagem da IA: ${msg(e)}`);
        }
      }
    }
  }
  if (avisos.length) console.error(avisos.join(" · "));

  return {
    status: "gerado", tema, palavras_chave: usadas, texto: resposta.texto.trim(), imagem_origem: imagem?.origem ?? null,
    imagem_ref: imagem?.ref ?? null, imagem_url: imagem?.url ?? null, erro: avisos.length ? avisos.join(" · ") : null,
  };
}
