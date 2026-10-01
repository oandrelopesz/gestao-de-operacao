// OpenAI: resposta em JSON (Chat Completions + JSON Schema estrito), geração de imagem (PNG, sem a logo) e checagem da
// imagem gerada.
// deno-lint-ignore-file no-explicit-any
import { foiPrazo, PRAZO, sinal } from "./prazo.ts";
import { ESQUEMA_CHECAGEM_IMAGEM, promptChecagemImagem } from "./regras.ts";

const BASE = "https://api.openai.com/v1";

export function openaiConfigurada(): boolean {
  return !!Deno.env.get("OPENAI_API_KEY");
}

/** `json: false` no envio multipart: o fetch define o Content-Type (com o boundary) sozinho. */
function cabecalhos(json = true): HeadersInit {
  const chave = Deno.env.get("OPENAI_API_KEY");
  if (!chave) throw new Error("Falta o secret OPENAI_API_KEY.");
  return json ? { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" } : { Authorization: `Bearer ${chave}` };
}

/** Mensagem fixa em português pelo status; o detalhe da OpenAI (em inglês) vai só para o log. */
function erroOpenai(status: number, detalhe: { error?: { message?: string } }): Error {
  console.error(`OpenAI respondeu ${status}:`, detalhe?.error?.message || "sem detalhe");
  if (status === 401) return new Error("A chave da OpenAI foi recusada (confira o secret OPENAI_API_KEY).");
  if (status === 403) return new Error("A OpenAI negou acesso a este modelo (a organização pode precisar de verificação em platform.openai.com).");
  if (status === 429) return new Error("Limite de uso ou de crédito da OpenAI atingido.");
  if (status === 400) return new Error("A OpenAI recusou o pedido (conteúdo ou parâmetros).");
  if (status >= 500) return new Error("A OpenAI está com problema agora; tente de novo em alguns minutos.");
  return new Error(`A OpenAI respondeu ${status}.`);
}

/**
 * POST na OpenAI com o prazo da chamada (`ms`) e o prazo total; devolve o JSON da resposta.
 * `corpo` que é FormData vai como multipart; qualquer outro valor vai como JSON.
 */
async function chamar(
  caminho: string, corpo: unknown, ms: number, total: AbortSignal | undefined, o: "texto" | "imagem",
): Promise<any> {
  const multipart = corpo instanceof FormData;
  const headers = cabecalhos(!multipart);
  let r: Response;
  let d: any;
  try {
    r = await fetch(`${BASE}${caminho}`, {
      method: "POST", headers, body: multipart ? corpo : JSON.stringify(corpo), signal: sinal(ms, total),
    });
    // O sinal vale também para a leitura do corpo; corpo que não é JSON cai nas checagens de resposta vazia abaixo.
    d = await r.json().catch((e) => {
      if (foiPrazo(e)) throw e;
      return {};
    });
  } catch (e) {
    if (!foiPrazo(e)) console.error("Falha de rede com a OpenAI:", e);
    throw new Error(foiPrazo(e) ? `A OpenAI demorou demais para responder (${o}).` : `Não foi possível falar com a OpenAI (${o}).`);
  }
  if (!r.ok) throw erroOpenai(r.status, d);
  return d;
}

/** O JSON que o modelo devolveu em `choices[0].message.content`. */
function conteudoJson<T>(d: any): T {
  const conteudo = d?.choices?.[0]?.message?.content;
  if (!conteudo) throw new Error("OpenAI devolveu resposta vazia.");
  try {
    return JSON.parse(conteudo) as T;
  } catch (e) {
    console.error("OpenAI devolveu JSON ilegível:", e);
    throw new Error("A OpenAI devolveu uma resposta que não deu para ler.");
  }
}

function modeloTexto(): string {
  return Deno.env.get("OPENAI_MODELO_TEXTO") || "gpt-5-mini";
}

/** Modelo que olha a imagem na checagem: secret opcional OPENAI_MODELO_VISAO; sem ele, o mesmo modelo de texto. */
function modeloVisao(): string {
  return Deno.env.get("OPENAI_MODELO_VISAO") || modeloTexto();
}

export async function gerarJson<T>(
  system: string, user: string, nome: string, schema: object, total?: AbortSignal,
): Promise<T> {
  const d = await chamar("/chat/completions", {
    model: modeloTexto(),
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    response_format: { type: "json_schema", json_schema: { name: nome, strict: true, schema } },
  }, PRAZO.texto, total, "texto");
  return conteudoJson<T>(d);
}

/**
 * PNG gerado pela OpenAI (paisagem), em base64, como a OpenAI devolveu. Sempre sem a logo: ela é aplicada depois, por
 * cima, pela função (compor.ts), para nunca ser redesenhada. PNG porque a composição lê PNG sem biblioteca.
 */
export async function gerarImagem(prompt: string, total?: AbortSignal): Promise<string> {
  const model = Deno.env.get("OPENAI_MODELO_IMAGEM") || "gpt-image-1";
  // quality "medium": o padrão ("auto") pode sair em "high", mais lento e caro.
  const d = await chamar("/images/generations", {
    model, prompt, size: "1536x1024", quality: "medium", n: 1, output_format: "png",
  }, PRAZO.imagem, total, "imagem");
  const b64 = d?.data?.[0]?.b64_json;
  if (!b64 || typeof b64 !== "string") throw new Error("OpenAI não devolveu a imagem.");
  return b64;
}

/**
 * O modelo de visão olha a imagem gerada (`imagemB64`, o base64 que a OpenAI devolveu, ainda sem a logo): tem pessoas?
 * tem texto legível e em destaque? `detail: "high"`: gente pequena ao fundo conta.
 */
export async function checarImagem(
  imagemB64: string, tipoMime: string, total?: AbortSignal,
): Promise<{ tem_pessoas: boolean; tem_texto: boolean }> {
  const d = await chamar("/chat/completions", {
    model: modeloVisao(),
    messages: [{
      role: "user",
      content: [
        { type: "text", text: promptChecagemImagem() },
        { type: "image_url", image_url: { url: `data:${tipoMime};base64,${imagemB64}`, detail: "high" } },
      ],
    }],
    response_format: { type: "json_schema", json_schema: { name: "checagem_imagem_gmn", strict: true, schema: ESQUEMA_CHECAGEM_IMAGEM } },
  }, PRAZO.texto, total, "imagem");
  const r = conteudoJson<{ tem_pessoas?: unknown; tem_texto?: unknown }>(d);
  if (typeof r.tem_pessoas !== "boolean" || typeof r.tem_texto !== "boolean") {
    throw new Error("A OpenAI devolveu uma checagem da imagem que não deu para ler.");
  }
  return { tem_pessoas: r.tem_pessoas, tem_texto: r.tem_texto };
}
