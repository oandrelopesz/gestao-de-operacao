// Um post completo, sem publicar: tema → texto (com checagem e 1 nova tentativa) → imagem.
// deno-lint-ignore-file no-explicit-any
import {
  ESQUEMA_POST, checarTexto, escolherImagem, escolherPalavras, idPastaDrive, montarMensagensPost, montarPromptImagem,
  normalizarBriefing, proximoTema, type Tema,
} from "./regras.ts";
import { gerarImagem, gerarJson } from "./openai.ts";
import { enviarR2 } from "./r2.ts";
import { baixarDoDrive, imagensDaPasta, tokenGoogle } from "./google.ts";

type Sb = any;

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

async function imagemDoDrive(sb: Sb, perfil: any, postId: string) {
  const pastaId = perfil.drive_pasta_url ? idPastaDrive(perfil.drive_pasta_url) : null;
  if (!pastaId) return null;
  const token = await tokenGoogle(sb);
  const fotos = await imagensDaPasta(token, pastaId);
  if (!fotos.length) return null;
  const { data: usos } = await sb.from("gmn_imagens_uso").select("ref, usado_em").eq("perfil_id", perfil.id).eq("origem", "drive");
  const mapa: Record<string, string> = Object.fromEntries((usos ?? []).map((u: any) => [u.ref, u.usado_em]));
  const ref = escolherImagem(fotos.map((f) => f.id), mapa);
  const foto = fotos.find((f) => f.id === ref)!;
  const bytes = await baixarDoDrive(token, foto.id);
  const ext = foto.mimeType === "image/png" ? "png" : "jpg";
  const url = await enviarR2(`${perfil.id}/${postId}.${ext}`, bytes, foto.mimeType);
  await sb.from("gmn_imagens_uso").upsert(
    { perfil_id: perfil.id, origem: "drive", ref: foto.id, usado_em: new Date().toISOString() },
    { onConflict: "perfil_id,origem,ref" },
  );
  return { origem: "drive" as const, ref: foto.id, url };
}

async function imagemDaIa(perfil: any, postId: string, tema: Tema) {
  const prompt = montarPromptImagem({ nome: perfil.nome, categoria: perfil.categoria, briefing: normalizarBriefing(perfil.briefing), tema });
  const bytes = await gerarImagem(prompt);
  const chave = `${perfil.id}/${postId}.png`;
  const url = await enviarR2(chave, bytes, "image/png");
  return { origem: "ia" as const, ref: chave, url };
}

export async function gerarConteudo(sb: Sb, perfil: any, postId: string): Promise<CamposPost> {
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
      motivoReprovacao: motivo,
    });
    resposta = await gerarJson<{ texto: string; palavras_chave: string[] }>(m.system, m.user, "post_gmn", ESQUEMA_POST);
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

  let imagem: { origem: "drive" | "ia"; ref: string; url: string } | null = null;
  let aviso: string | null = null;
  try {
    imagem = await imagemDoDrive(sb, perfil, postId);
  } catch (e) {
    aviso = `Pasta do Drive: ${e instanceof Error ? e.message : String(e)}`;
    console.error(aviso);
  }
  if (!imagem && perfil.usa_ia_imagem) imagem = await imagemDaIa(perfil, postId, tema);

  return {
    status: "gerado", tema, palavras_chave: usadas, texto: resposta.texto.trim(), imagem_origem: imagem?.origem ?? null,
    imagem_ref: imagem?.ref ?? null, imagem_url: imagem?.url ?? null, erro: aviso,
  };
}
