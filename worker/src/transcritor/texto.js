// Monta o texto final da transcrição a partir dos segmentos do Whisper: frases corridas, parágrafo
// novo só onde faz sentido (pausa longa depois de fim de frase, ou texto muito longo sem pausa),
// nunca no meio de uma frase. É o mesmo texto do "Copiar" e do .txt.

const PAUSA_PARAGRAFO_S = 1.5;
const PALAVRAS_POR_PARAGRAFO = 120;
const FIM_DE_FRASE = /[.!?…]["'”’)\]]*$/;

const limpar = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/** Segmentos `{ start, end, text }` → texto com parágrafos separados por uma linha em branco. */
export function montarTexto(segmentos) {
  const paragrafos = [];
  let atual = [];
  let palavras = 0;
  let fimAnterior = null;

  const fechar = () => {
    if (atual.length) paragrafos.push(atual.join(" "));
    atual = [];
    palavras = 0;
  };

  for (const s of segmentos || []) {
    const texto = limpar(s.text);
    if (!texto) continue;
    const anterior = atual.at(-1);
    const acabouFrase = anterior != null && FIM_DE_FRASE.test(anterior);
    const pausa = fimAnterior != null && Number.isFinite(s.start) ? s.start - fimAnterior : 0;
    if (acabouFrase && (pausa >= PAUSA_PARAGRAFO_S || palavras >= PALAVRAS_POR_PARAGRAFO)) fechar();
    atual.push(texto);
    palavras += texto.split(" ").length;
    if (Number.isFinite(s.end)) fimAnterior = s.end;
  }
  fechar();
  return paragrafos.join("\n\n");
}

const unicos = (termos) => [...new Set((termos || []).map((t) => String(t).trim()).filter(Boolean))];

/**
 * Glossário → `prompt` do Whisper (contexto que puxa a grafia certa dos termos). O Whisper só usa
 * ~224 tokens do prompt; passar do ponto não ajuda e pode fazer o modelo "repetir" o prompt.
 */
export function glossarioParaPrompt(termos, maxCaracteres = 800) {
  const lista = unicos(termos);
  if (!lista.length) return undefined;
  const escolhidos = [];
  let tamanho = "Termos que podem aparecer: .".length;
  for (const t of lista) {
    const extra = (escolhidos.length ? 2 : 0) + t.length;
    if (tamanho + extra > maxCaracteres) break;
    escolhidos.push(t);
    tamanho += extra;
  }
  return `Termos que podem aparecer: ${escolhidos.join(", ")}.`;
}

/** Glossário → `hotwords` do faster-whisper (reforço extra de reconhecimento). */
export function glossarioParaHotwords(termos, maxCaracteres = 400) {
  const lista = unicos(termos);
  let saida = "";
  for (const t of lista) {
    const proximo = saida ? `${saida} ${t}` : t;
    if (proximo.length > maxCaracteres) break;
    saida = proximo;
  }
  return saida || undefined;
}
