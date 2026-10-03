// Conferências do post no navegador, antes de salvar (specs 2026-10-02-instagram-posts-design.md e
// 2026-10-03-instagram-etapas-2-3-design.md). Fora disso o post não é salvo.
import type { Marcacao, Midia, OpcoesPost } from "../../supabase/functions/instagram/meta.ts";

export type { Marcacao, Midia, OpcoesPost };

export const LEGENDA_MAX = 2200;
export const HASHTAGS_MAX = 30;
export const CARROSSEL_MAX = 10;
export const COLABORADORES_MAX = 3;
export const ALT_TEXT_MAX = 1000;

export type Formato = "feed" | "story";

/** Feed: 1 imagem = foto, 1 vídeo = reels, 2 ou mais = carrossel. Story: cada mídia vira um story. */
export function tipoDoPost(midias: readonly Midia[], formato: Formato = "feed"): "foto" | "carrossel" | "reels" | "story" | null {
  if (midias.length === 0) return null;
  if (formato === "story") return "story";
  if (midias.length > 1) return "carrossel";
  return midias[0].tipo === "video" ? "reels" : "foto";
}

export const contarHashtags = (texto: string) => (texto.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;

/** "@ana, bia @ana" → ["ana", "bia"]. */
export const limparUsuarios = (texto: string) =>
  [...new Set(texto.split(/[\s,;]+/).map((u) => u.replace(/^@+/, "").trim()).filter(Boolean))];

const proporcao = (m: Midia) => m.largura / m.altura;
const fmt = (r: number) => r.toFixed(2).replace(".", ",");
const foraDoFeed = (r: number) => r < 0.8 - 0.01 || r > 1.91 + 0.01;
const longe916 = (r: number) => Math.abs(r - 9 / 16) > 0.02;

export interface EntradaPost {
  midias: readonly Midia[];
  legenda: string;
  agendarPara: Date | null;
  formato?: Formato;
  instagram?: boolean; // padrão: sim
  facebook?: boolean;
  primeiroComentario?: string;
  colaboradores?: string[];
}

export function conferirPost(e: EntradaPost, agora = new Date()): { erros: string[]; avisos: string[] } {
  const erros: string[] = [];
  const avisos: string[] = [];
  const { midias, legenda } = e;
  const story = e.formato === "story";
  const tipo = tipoDoPost(midias, e.formato);
  if (!tipo) erros.push(story ? "Adicione uma foto ou um vídeo para o story." : "Adicione uma foto, um vídeo ou várias mídias para um carrossel.");
  if (midias.length > CARROSSEL_MAX) erros.push(`${story ? "Dá para enviar" : "O carrossel aceita"} até ${CARROSSEL_MAX} itens de uma vez (tem ${midias.length}).`);
  if (e.instagram === false && !e.facebook) erros.push("Escolha pelo menos uma rede (Instagram ou Facebook).");
  if (story && e.facebook) erros.push("Story vai só para o Instagram: desmarque o Facebook.");
  if (!story && e.facebook && midias.length > 1 && midias.some((m) => m.tipo === "video")) {
    erros.push("No Facebook, post com várias mídias aceita só fotos: tire o vídeo ou desmarque o Facebook.");
  }
  midias.forEach((m, i) => {
    const n = midias.length > 1 ? ` ${i + 1}` : "";
    const r = proporcao(m);
    const dur = m.duracao ?? 0;
    if (story) {
      if (m.tipo === "video" && (dur < 3 || dur > 60)) erros.push(`O vídeo${n} do story precisa ter de 3 a 60 segundos.`);
      if (longe916(r)) avisos.push(`A mídia${n} não está em 9:16: no story aparece com bordas (use Editar para ajustar).`);
    } else if (m.tipo === "imagem") {
      if (foraDoFeed(r)) erros.push(`A imagem${n} tem proporção ${fmt(r)}:1; o Instagram aceita de 4:5 (0,80:1, em pé) a 1,91:1 (deitada). Use Editar para recortar.`);
    } else if (tipo === "reels") {
      if (dur < 3 || dur > 900) erros.push("O reels precisa ter de 3 segundos a 15 minutos.");
      if (longe916(r)) avisos.push("O reels fica melhor em 9:16 (em pé); em outra proporção aparece com bordas.");
    } else {
      if (dur < 3 || dur > 60) erros.push(`O vídeo${n} do carrossel precisa ter de 3 a 60 segundos.`);
      if (foraDoFeed(r)) erros.push(`O vídeo${n} tem proporção ${fmt(r)}:1; no carrossel vale de 4:5 a 1,91:1. Use Editar para recortar.`);
    }
  });
  if (legenda.length > LEGENDA_MAX) erros.push(`A legenda tem ${legenda.length} caracteres; o limite é ${LEGENDA_MAX}.`);
  const hashtags = contarHashtags(legenda);
  if (hashtags > HASHTAGS_MAX) erros.push(`A legenda tem ${hashtags} hashtags; o limite é ${HASHTAGS_MAX}.`);
  if ((e.primeiroComentario?.length ?? 0) > LEGENDA_MAX) erros.push(`O primeiro comentário passou de ${LEGENDA_MAX} caracteres.`);
  if ((e.colaboradores?.length ?? 0) > COLABORADORES_MAX) erros.push(`Dá para convidar até ${COLABORADORES_MAX} colaboradores.`);
  if (e.agendarPara && e.agendarPara.getTime() <= agora.getTime() + 60_000) erros.push("Escolha um horário no futuro (ou use Agora).");
  return { erros, avisos };
}
