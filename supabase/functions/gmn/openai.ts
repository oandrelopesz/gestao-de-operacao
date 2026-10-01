// OpenAI: resposta em JSON (Chat Completions + JSON Schema estrito), geração de imagem (com ou sem logo de referência)
// e checagem da imagem gerada.
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

/** Logo do cliente usada como imagem de referência. */
export interface Logo { bytes: Uint8Array; tipo: string }

/**
 * JPEG gerado pela OpenAI (paisagem). Sem `logo`: geração a partir do prompt. Com `logo`: edição de imagem
 * (multipart), com a logo como referência em `image[]`.
 */
export async function gerarImagem(prompt: string, total?: AbortSignal, logo?: Logo): Promise<Uint8Array> {
  const model = Deno.env.get("OPENAI_MODELO_IMAGEM") || "gpt-image-1";
  // quality "medium": o padrão ("auto") pode sair em "high", mais lento e caro.
  // Sem `input_fidelity`: nos modelos gpt-image-2 o parâmetro deve ser omitido (toda imagem de entrada, a logo, já é
  // processada em alta fidelidade) e enviá-lo dá 400.
  const opcoes = { size: "1536x1024", quality: "medium", n: 1, output_format: "jpeg" };
  let d: any;
  if (logo) {
    const f = new FormData();
    f.append("model", model);
    f.append("prompt", prompt);
    for (const [k, v] of Object.entries(opcoes)) f.append(k, String(v));
    // A cópia dá um Uint8Array sobre ArrayBuffer comum (BlobPart aceita só esse).
    const arquivo = new File([new Uint8Array(logo.bytes)], logo.tipo === "image/png" ? "logo.png" : "logo.jpg", { type: logo.tipo });
    f.append("image[]", arquivo);
    d = await chamar("/images/edits", f, PRAZO.imagem, total, "imagem");
  } else {
    d = await chamar("/images/generations", { model, prompt, ...opcoes }, PRAZO.imagem, total, "imagem");
  }
  const b64 = d?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI não devolveu a imagem.");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Bytes → base64 em pedaços (o spread de uma imagem inteira estoura a pilha). */
function paraBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Imagem (ou logo) como parte `image_url` da mensagem, em data URL e com detalhe alto (gente pequena ao fundo conta). */
function parteImagem(bytes: Uint8Array, tipoMime: string) {
  return { type: "image_url", image_url: { url: `data:${tipoMime};base64,${paraBase64(bytes)}`, detail: "high" } };
}

/**
 * O modelo de visão olha a imagem: tem pessoas? tem texto legível e em destaque? Com `logo`, ela vai como segunda
 * imagem e a escrita dela não conta como texto.
 */
export async function checarImagem(
  bytes: Uint8Array, tipoMime: string, total?: AbortSignal, logo?: Logo,
): Promise<{ tem_pessoas: boolean; tem_texto: boolean }> {
  const d = await chamar("/chat/completions", {
    model: modeloVisao(),
    messages: [{
      role: "user",
      content: [
        { type: "text", text: promptChecagemImagem(!!logo) },
        parteImagem(bytes, tipoMime),
        ...(logo ? [parteImagem(logo.bytes, logo.tipo)] : []),
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
