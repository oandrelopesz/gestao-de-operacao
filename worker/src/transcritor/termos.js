// Termos do nicho: chave normalizada, alinhamento das palavras do Whisper aos segmentos, troca de
// correções e marcas (tempo por palavra). A regra de troca é a mesma do app (src/lib/transcritorMarcas.ts):
// mudar as duas juntas.

const PONTA_INICIAL = /^[^\p{L}\p{N}]+/u;
const PONTA_FINAL = /[^\p{L}\p{N}]+$/u;

/** Chave de comparação: sem acento, minúscula, só letras e números separados por espaço. */
export function chaveTermo(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const arredondar = (x) => Math.round(x * 100) / 100;

const tokensDoTexto = (texto) => {
  const limpo = String(texto ?? "").replace(/\s+/g, " ").trim();
  return limpo ? limpo.split(" ") : [];
};

/**
 * Segmentos do Whisper + palavras `{word, start, end}` (tempo absoluto) → segmentos com `tokens`.
 * Se a quantidade de palavras bate com a de tokens, usa os tempos delas; senão divide o tempo do
 * segmento entre os tokens, proporcional ao tamanho de cada um.
 */
export function alinharPalavras(segmentos, palavras) {
  const ultimo = segmentos.length - 1;
  const porSegmento = segmentos.map(() => []);
  for (const p of palavras || []) {
    const meio = (p.start + p.end) / 2;
    if (!Number.isFinite(meio)) continue;
    const k = segmentos.findIndex(
      (s, i) => meio >= s.start && (i === ultimo ? meio <= s.end : meio < s.end),
    );
    if (k >= 0) porSegmento[k].push(p);
  }
  return segmentos.map((seg, k) => {
    const textos = tokensDoTexto(seg.text);
    const ws = porSegmento[k];
    let tokens;
    if (ws.length === textos.length) {
      tokens = textos.map((t, i) => ({ t, s: arredondar(ws[i].start), e: arredondar(ws[i].end) }));
    } else {
      const total = textos.reduce((a, t) => a + t.length, 0);
      let cursor = seg.start;
      tokens = textos.map((t) => {
        const duracao = total ? ((seg.end - seg.start) * t.length) / total : 0;
        const token = { t, s: arredondar(cursor), e: arredondar(cursor + duracao) };
        cursor += duracao;
        return token;
      });
    }
    return { ...seg, tokens, text: tokens.map((x) => x.t).join(" ") };
  });
}

// Próximo token (a partir de i) em que as chaves não vazias unidas por espaço dão `chave`; -1 se não há.
function acharSequencia(tokens, i, chave) {
  // Token só de pontuação não abre a sequência (igual ao app)
  if (!chaveTermo(tokens[i].t)) return -1;
  let acc = "";
  for (let j = i; j < tokens.length; j++) {
    const k = chaveTermo(tokens[j].t);
    if (!k) continue;
    acc = acc ? `${acc} ${k}` : k;
    if (acc === chave) return j;
    if (acc.length >= chave.length) return -1;
  }
  return -1;
}

// Token novo que substitui `sub`, ou null se o texto ficaria igual.
function trocar(sub, para) {
  const primeiro = sub[0];
  const ultimo = sub.at(-1);
  const pre = primeiro.t.match(PONTA_INICIAL)?.[0] ?? "";
  const post = ultimo.t.match(PONTA_FINAL)?.[0] ?? "";
  // Início de frase: "roi" com R maiúsculo vira "Retorno..." e não "retorno..."
  let miolo = para;
  if (/^\p{Ll}/u.test(para) && /^\p{Lu}/u.test(primeiro.t.slice(pre.length))) {
    miolo = para.charAt(0).toUpperCase() + para.slice(1);
  }
  const novo = pre + miolo + post;
  if (novo === sub.map((x) => x.t).join(" ")) return null;
  return { t: novo, s: primeiro.s, e: ultimo.e };
}

/**
 * Troca `pares` `{de, para}` nos segmentos (dentro de cada segmento, com pares de mais palavras
 * primeiro). Não altera a entrada. `tokensTrocados` = tokens originais substituídos.
 */
export function aplicarCorrecoes(segmentos, pares) {
  let trocas = 0;
  let tokensTrocados = 0;
  const ordenados = (pares || [])
    .map((p) => ({ chave: chaveTermo(p.de), para: String(p.para ?? "").trim() }))
    // Par sem `para` daria token vazio: ignorado
    .filter((p) => p.chave && p.para)
    .sort((a, b) => b.chave.split(" ").length - a.chave.split(" ").length);

  const saida = segmentos.map((seg) => ({ ...seg, tokens: (seg.tokens || []).map((x) => ({ ...x })) }));
  for (const par of ordenados) {
    for (const seg of saida) {
      const tokens = seg.tokens;
      for (let i = 0; i < tokens.length; i++) {
        const j = acharSequencia(tokens, i, par.chave);
        if (j < 0) continue;
        const novo = trocar(tokens.slice(i, j + 1), par.para);
        if (!novo) continue;
        tokens.splice(i, j - i + 1, novo);
        trocas++;
        tokensTrocados += j - i + 1;
      }
      seg.text = tokens.map((x) => x.t).join(" ");
    }
  }
  return { segmentos: saida, trocas, tokensTrocados };
}

/** Parágrafos (arrays de segmentos com tokens) → marcas `{ v: 1, p: [[texto, início, fim], ...] }`. */
export function paragrafosParaMarcas(paragrafos) {
  const p = [];
  for (const par of paragrafos || []) {
    const palavras = [];
    for (const seg of par) for (const x of seg.tokens || []) palavras.push([x.t, x.s, x.e]);
    if (palavras.length) p.push(palavras);
  }
  return { v: 1, p };
}

/** Marcas → texto com parágrafos separados por linha em branco. */
export function textoDeMarcas(marcas) {
  return (marcas?.p || []).map((par) => par.map((w) => w[0]).join(" ")).join("\n\n");
}
