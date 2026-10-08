// Revisão por IA (Groq, gpt-oss em JSON mode): corrige termos técnicos, siglas, marcas e inglês mal
// ouvidos pelo Whisper. Trabalha em blocos de segmentos; qualquer falha deixa o bloco como está
// (a transcrição nunca falha por causa da revisão). Só JobPausado propaga.

import { checarParada, JobPausado } from "../parada.js";
import { aplicarCorrecoes, chaveTermo } from "./termos.js";

const BLOCO_MAX = 8000; // caracteres de texto por bloco
const TENTATIVAS = 3;
const LIMITE_TROCA = 0.15; // acima disso o bloco fica como está
const MEMORIA_MAX = 80;

const SISTEMA = `Você revisa transcrições de áudio em português do Brasil feitas por reconhecimento de voz.
Corrija SOMENTE termos técnicos, siglas, nomes de marcas e ferramentas e palavras em inglês que foram ouvidos errado.
Não corrija gramática, estilo, concordância nem pontuação. Na dúvida, não mude nada.
Em "de", copie exatamente como está no texto. Em "para", escreva a grafia correta.
Responda apenas com JSON no formato {"correcoes":[{"de":"...","para":"..."}]} (lista vazia se não houver o que corrigir).
Exemplos: "rói" -> "ROI"; "cê tê erre" -> "CTR"; "chat gpt" -> "ChatGPT".`;

const log = (evento, extra = {}) => console.log(JSON.stringify({ evento, ...extra }));

const esperaPadrao = (ms) => new Promise((r) => setTimeout(r, ms));

// Segmentos seguidos até passar de BLOCO_MAX caracteres (um segmento grande fica sozinho).
function dividirBlocos(segmentos) {
  const blocos = [];
  let atual = [];
  let tam = 0;
  for (const seg of segmentos) {
    const n = String(seg.text ?? "").length;
    if (atual.length && tam + n > BLOCO_MAX) {
      blocos.push(atual);
      atual = [];
      tam = 0;
    }
    atual.push(seg);
    tam += n;
  }
  if (atual.length) blocos.push(atual);
  return blocos;
}

// Memória como linhas "de → para": manuais primeiro, depois as mais usadas.
function linhasMemoria(memoria) {
  return [...memoria]
    .sort((a, b) => (b.origem === "manual") - (a.origem === "manual") || (b.vezes ?? 0) - (a.vezes ?? 0))
    .slice(0, MEMORIA_MAX)
    .map((m) => `${m.de} → ${m.para}`);
}

function mensagemUsuario(glossario, memoria, texto) {
  const partes = [];
  if (glossario.length) partes.push(`Glossário (grafia correta):\n${glossario.join(", ")}`);
  const linhas = linhasMemoria(memoria);
  if (linhas.length) partes.push(`Correções já feitas antes:\n${linhas.join("\n")}`);
  partes.push(`Texto:\n${texto}`);
  return partes.join("\n\n");
}

// Chama o Groq; devolve a lista bruta de correções ou lança em qualquer falha.
async function pedirCorrecoes(texto, { glossario, memoria, config, fetch, esperar }) {
  const corpo = JSON.stringify({
    model: config.groqModeloRevisao,
    temperature: 0,
    reasoning_effort: "low",
    response_format: { type: "json_object" },
    max_completion_tokens: 4000,
    messages: [
      { role: "system", content: SISTEMA },
      { role: "user", content: mensagemUsuario(glossario, memoria, texto) },
    ],
  });
  for (let tentativa = 1; ; tentativa++) {
    const r = await fetch(`${config.groqUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.groqKey}`, "Content-Type": "application/json" },
      body: corpo,
      signal: AbortSignal.timeout(120000),
    });
    if (r.status === 429 && tentativa < TENTATIVAS) {
      const seg = Number(r.headers?.get?.("retry-after"));
      const espera = Math.min(65, Number.isFinite(seg) && seg > 0 ? seg : 20);
      log("revisao.limite", { espera, tentativa });
      await esperar(espera * 1000);
      continue;
    }
    const bruto = await r.text();
    if (!r.ok) throw new Error(`Groq ${r.status}: ${bruto.slice(0, 200)}`);
    const conteudo = JSON.parse(bruto)?.choices?.[0]?.message?.content;
    const lista = JSON.parse(conteudo)?.correcoes;
    if (!Array.isArray(lista)) throw new Error("resposta sem lista de correções");
    return lista;
  }
}

const nPalavras = (s) => String(s).trim().split(/\s+/).length;

// Pares válidos: de/para não vazios, de até 6 palavras, para até 8, e `de` aparece no bloco.
function validar(lista, tokensDoBloco) {
  const textoBloco = ` ${tokensDoBloco.map((t) => chaveTermo(t.t)).filter(Boolean).join(" ")} `;
  const vistos = new Set();
  const validos = [];
  for (const c of lista) {
    const de = typeof c?.de === "string" ? c.de.trim() : "";
    const para = typeof c?.para === "string" ? c.para.trim() : "";
    const chave = chaveTermo(de);
    if (!de || !para || !chave || nPalavras(de) > 6 || nPalavras(para) > 8) continue;
    if (!textoBloco.includes(` ${chave} `)) continue;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    validos.push({ de, para });
  }
  return validos;
}

/**
 * Revisa os termos dos segmentos (com `tokens`) por IA. Devolve `{ segmentos, correcoes }`, com
 * `correcoes` = pares `{ de, para }` que trocaram algo (sem repetir `chaveTermo(de)`).
 */
export async function revisarTermos(
  segmentos,
  { glossario = [], memoria = [], config, fetch = globalThis.fetch, esperar = esperaPadrao, aoProgresso } = {},
) {
  if (!config?.groqKey) return { segmentos, correcoes: [] };

  const blocos = dividirBlocos(segmentos);
  const saida = [];
  const correcoes = [];
  const jaVistas = new Set();

  for (let i = 0; i < blocos.length; i++) {
    const bloco = blocos[i];
    checarParada();
    let resultado = bloco;
    try {
      const texto = bloco.map((s) => s.text).join("\n");
      const lista = await pedirCorrecoes(texto, { glossario, memoria, config, fetch, esperar });
      const tokens = bloco.flatMap((s) => s.tokens || []);
      const validos = validar(lista, tokens);
      if (validos.length) {
        const todas = aplicarCorrecoes(bloco, validos);
        if (tokens.length && todas.tokensTrocados / tokens.length > LIMITE_TROCA) {
          log("revisao.trava", { bloco: i, trocados: todas.tokensTrocados, tokens: tokens.length });
        } else if (todas.trocas > 0) {
          resultado = todas.segmentos;
          for (const par of validos) {
            const k = chaveTermo(par.de);
            if (jaVistas.has(k)) continue;
            // Só conta o par que de fato trocou algo neste bloco
            if (aplicarCorrecoes(bloco, [par]).trocas > 0) {
              jaVistas.add(k);
              correcoes.push(par);
            }
          }
        }
      }
    } catch (e) {
      if (e instanceof JobPausado) throw e;
      log("revisao.falhou", { bloco: i, erro: String(e?.message ?? e).slice(0, 200) });
    }
    saida.push(...resultado);
    aoProgresso?.((i + 1) / blocos.length);
  }
  return { segmentos: saida, correcoes };
}
