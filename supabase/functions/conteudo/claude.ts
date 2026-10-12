// Claude na aba Conteúdo: resposta em JSON pela saída estruturada (output_config.format), com o fallback do servidor
// ligado (fallbacks "default": se o modelo recusar por política, a própria API tenta outro modelo na mesma chamada).
// deno-lint-ignore-file no-explicit-any
import Anthropic from "npm:@anthropic-ai/sdk@0.133.0";

let cliente: Anthropic | null = null;
export const claudeConfigurado = () => !!Deno.env.get("ANTHROPIC_API_KEY");

function api(): Anthropic {
  if (!claudeConfigurado()) throw new Error("Falta o secret ANTHROPIC_API_KEY.");
  return (cliente ??= new Anthropic({ maxRetries: 1, timeout: 120_000 }));
}

const modelo = () => Deno.env.get("CLAUDE_MODELO") || "claude-sonnet-5-5";

function erroClaude(e: any): Error {
  const status = Number(e?.status ?? 0);
  console.error("Claude:", status, e?.message);
  if (status === 401) return new Error("A chave do Claude foi recusada (confira o secret ANTHROPIC_API_KEY).");
  if (status === 429) return new Error("Limite de uso do Claude atingido; tenta de novo em instantes.");
  if (status === 400) return new Error("O Claude recusou o pedido (parâmetros).");
  if (status >= 500) return new Error("O Claude está com problema agora; tenta de novo em alguns minutos.");
  return new Error("Não foi possível falar com o Claude.");
}

/** `conteudo`: texto ou blocos (texto com cache_control, imagens em base64). Devolve o JSON já lido. */
export async function gerarJson<T>(o: {
  system: string; conteudo: string | any[]; esquema: object; esforco: "low" | "medium" | "high"; maxTokens?: number;
}): Promise<T> {
  const params: any = {
    model: modelo(),
    max_tokens: o.maxTokens ?? 16000,
    system: o.system,
    messages: [{ role: "user", content: o.conteudo }],
    output_config: { effort: o.esforco, format: { type: "json_schema", schema: o.esquema } },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  };
  let r: any;
  try {
    r = await api().beta.messages.create(params);
  } catch (e) {
    throw erroClaude(e);
  }
  if (r.stop_reason === "refusal") throw new Error("O Claude recusou o pedido.");
  if (r.stop_reason === "max_tokens") throw new Error("A resposta do Claude ficou longa demais.");
  const texto = (r.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  try {
    return JSON.parse(texto) as T;
  } catch {
    console.error("Claude devolveu JSON ilegível:", texto.slice(0, 300));
    throw new Error("O Claude devolveu uma resposta que não deu para ler.");
  }
}
