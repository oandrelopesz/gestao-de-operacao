// OpenAI: resposta em JSON (Chat Completions + JSON Schema estrito) e geração de imagem.
// deno-lint-ignore-file no-explicit-any
import { foiPrazo, PRAZO, sinal } from "./prazo.ts";

const BASE = "https://api.openai.com/v1";

export function openaiConfigurada(): boolean {
  return !!Deno.env.get("OPENAI_API_KEY");
}

function cabecalhos(): HeadersInit {
  const chave = Deno.env.get("OPENAI_API_KEY");
  if (!chave) throw new Error("Falta o secret OPENAI_API_KEY.");
  return { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" };
}

/** Mensagem fixa em português pelo status; o detalhe da OpenAI (em inglês) vai só para o log. */
function erroOpenai(status: number, detalhe: { error?: { message?: string } }): Error {
  console.error(`OpenAI respondeu ${status}:`, detalhe?.error?.message || "sem detalhe");
  if (status === 401 || status === 403) return new Error("A chave da OpenAI foi recusada (confira o secret OPENAI_API_KEY).");
  if (status === 429) return new Error("Limite de uso ou de crédito da OpenAI atingido.");
  if (status === 400) return new Error("A OpenAI recusou o pedido (conteúdo ou parâmetros).");
  if (status >= 500) return new Error("A OpenAI está com problema agora; tente de novo em alguns minutos.");
  return new Error(`A OpenAI respondeu ${status}.`);
}

/** POST na OpenAI com o prazo da chamada (`ms`) e o prazo total; devolve o JSON da resposta. */
async function chamar(
  caminho: string, corpo: unknown, ms: number, total: AbortSignal | undefined, o: "texto" | "imagem",
): Promise<any> {
  const headers = cabecalhos();
  let r: Response;
  let d: any;
  try {
    r = await fetch(`${BASE}${caminho}`, { method: "POST", headers, body: JSON.stringify(corpo), signal: sinal(ms, total) });
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

export async function gerarJson<T>(
  system: string, user: string, nome: string, schema: object, total?: AbortSignal,
): Promise<T> {
  const d = await chamar("/chat/completions", {
    model: Deno.env.get("OPENAI_MODELO_TEXTO") || "gpt-5-mini",
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    response_format: { type: "json_schema", json_schema: { name: nome, strict: true, schema } },
  }, PRAZO.texto, total, "texto");
  const conteudo = d?.choices?.[0]?.message?.content;
  if (!conteudo) throw new Error("OpenAI devolveu resposta vazia.");
  return JSON.parse(conteudo) as T;
}

/** PNG gerado pela OpenAI (paisagem). */
export async function gerarImagem(prompt: string, total?: AbortSignal): Promise<Uint8Array> {
  // quality "medium": o padrão ("auto") pode sair em "high", mais lento e caro.
  const d = await chamar("/images/generations", {
    model: Deno.env.get("OPENAI_MODELO_IMAGEM") || "gpt-image-1", prompt, size: "1536x1024", quality: "medium", n: 1,
  }, PRAZO.imagem, total, "imagem");
  const b64 = d?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI não devolveu a imagem.");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
