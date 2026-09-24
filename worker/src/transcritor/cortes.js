// Áudio longo é transcrito em trechos de ~3 min cortados em silêncios (não corta palavra no meio):
// dá progresso real, usa pouca memória e cada trecho recebe o final do anterior como contexto.

export const TRECHO_ALVO_S = 180;
const JANELA_S = 20;
const CONTEXTO_CARACTERES = 200;
const PROMPT_MAX = 900;

/** Saída do `ffmpeg -af silencedetect` → meio de cada silêncio (segundos). */
export function lerSilencios(stderr) {
  const meios = [];
  let inicio = null;
  for (const linha of String(stderr || "").split(/\r?\n/)) {
    const ini = /silence_start:\s*(-?[\d.]+)/.exec(linha);
    if (ini) { inicio = Math.max(0, Number(ini[1])); continue; }
    const fim = /silence_end:\s*([\d.]+)/.exec(linha);
    if (fim && inicio != null) {
      meios.push(Math.round(((inicio + Number(fim[1])) / 2) * 100) / 100);
      inicio = null;
    }
  }
  return meios;
}

/** Pontos de corte perto de cada múltiplo de `alvo` (no silêncio mais próximo dentro da janela). */
export function escolherCortes(silencios, duracao, alvo = TRECHO_ALVO_S, janela = JANELA_S) {
  const cortes = [];
  for (let t = alvo; t < duracao - alvo / 5; t += alvo) {
    const perto = silencios.filter((s) => Math.abs(s - t) <= janela && (!cortes.length || s > cortes.at(-1) + 1));
    const melhor = perto.sort((a, b) => Math.abs(a - t) - Math.abs(b - t))[0];
    cortes.push(melhor ?? t);
  }
  return cortes;
}

export function trechos(cortes, duracao) {
  const pontos = [0, ...cortes, duracao];
  return pontos.slice(0, -1).map((inicio, i) => ({ inicio, fim: pontos[i + 1] }));
}

export function deslocarSegmentos(segmentos, deslocamento) {
  return (segmentos || []).map((s) => ({ ...s, start: (s.start ?? 0) + deslocamento, end: (s.end ?? 0) + deslocamento }));
}

/** Prompt do trecho: glossário + o final do texto anterior (continuidade de assunto e grafia). */
export function promptComContexto(promptGlossario, textoAnterior) {
  const contexto = String(textoAnterior || "").slice(-CONTEXTO_CARACTERES).trim();
  const partes = [promptGlossario, contexto].filter(Boolean);
  if (!partes.length) return undefined;
  const junto = partes.join(" ");
  return junto.length > PROMPT_MAX ? junto.slice(0, PROMPT_MAX) : junto;
}
