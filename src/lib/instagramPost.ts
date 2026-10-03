// Conferências do post no navegador, antes de salvar (spec 2026-10-02-instagram-posts-design.md, seção 5).
// Fora disso o post não é salvo: cortar e redimensionar é a etapa 2.
import type { Midia } from "../../supabase/functions/instagram/meta.ts";

export type { Midia };

export const LEGENDA_MAX = 2200;
export const HASHTAGS_MAX = 30;
export const CARROSSEL_MAX = 10;

/** 1 imagem = foto, 1 vídeo = reels, 2 ou mais = carrossel. */
export function tipoDoPost(midias: readonly Midia[]): "foto" | "carrossel" | "reels" | null {
  if (midias.length === 0) return null;
  if (midias.length > 1) return "carrossel";
  return midias[0].tipo === "video" ? "reels" : "foto";
}

export const contarHashtags = (texto: string) => (texto.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;

const proporcao = (m: Midia) => m.largura / m.altura;
const fmt = (r: number) => r.toFixed(2).replace(".", ",");
const foraDoFeed = (r: number) => r < 0.8 - 0.01 || r > 1.91 + 0.01;

export function conferirPost(
  midias: readonly Midia[],
  legenda: string,
  agendarPara: Date | null,
  agora = new Date(),
): { erros: string[]; avisos: string[] } {
  const erros: string[] = [];
  const avisos: string[] = [];
  const tipo = tipoDoPost(midias);
  if (!tipo) erros.push("Adicione uma foto, um vídeo ou várias mídias para um carrossel.");
  if (midias.length > CARROSSEL_MAX) erros.push(`O carrossel aceita até ${CARROSSEL_MAX} itens (tem ${midias.length}).`);
  midias.forEach((m, i) => {
    const n = midias.length > 1 ? ` ${i + 1}` : "";
    const r = proporcao(m);
    const dur = m.duracao ?? 0;
    if (m.tipo === "imagem") {
      if (foraDoFeed(r)) erros.push(`A imagem${n} tem proporção ${fmt(r)}:1; o Instagram aceita de 4:5 (0,80:1, em pé) a 1,91:1 (deitada).`);
    } else if (tipo === "reels") {
      if (dur < 3 || dur > 900) erros.push("O reels precisa ter de 3 segundos a 15 minutos.");
      if (Math.abs(r - 9 / 16) > 0.02) avisos.push("O reels fica melhor em 9:16 (em pé); em outra proporção aparece com bordas.");
    } else {
      if (dur < 3 || dur > 60) erros.push(`O vídeo${n} do carrossel precisa ter de 3 a 60 segundos.`);
      if (foraDoFeed(r)) erros.push(`O vídeo${n} tem proporção ${fmt(r)}:1; no carrossel vale de 4:5 a 1,91:1.`);
    }
  });
  if (legenda.length > LEGENDA_MAX) erros.push(`A legenda tem ${legenda.length} caracteres; o limite é ${LEGENDA_MAX}.`);
  const hashtags = contarHashtags(legenda);
  if (hashtags > HASHTAGS_MAX) erros.push(`A legenda tem ${hashtags} hashtags; o limite é ${HASHTAGS_MAX}.`);
  if (agendarPara && agendarPara.getTime() <= agora.getTime() + 60_000) erros.push("Escolha um horário no futuro (ou use Publicar agora).");
  return { erros, avisos };
}
