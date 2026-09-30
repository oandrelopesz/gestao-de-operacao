// OpenAI: resposta em JSON (Chat Completions + JSON Schema estrito) e geração de imagem.

const BASE = "https://api.openai.com/v1";

export function openaiConfigurada(): boolean {
  return !!Deno.env.get("OPENAI_API_KEY");
}

function cabecalhos(): HeadersInit {
  const chave = Deno.env.get("OPENAI_API_KEY");
  if (!chave) throw new Error("Falta o secret OPENAI_API_KEY.");
  return { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" };
}

async function erroOpenai(r: Response): Promise<Error> {
  const d = await r.json().catch(() => ({}));
  return new Error(`OpenAI respondeu ${r.status}: ${d?.error?.message || "sem detalhe"}`);
}

export async function gerarJson<T>(system: string, user: string, nome: string, schema: object): Promise<T> {
  const r = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: cabecalhos(),
    body: JSON.stringify({
      model: Deno.env.get("OPENAI_MODELO_TEXTO") || "gpt-5-mini",
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_schema", json_schema: { name: nome, strict: true, schema } },
    }),
  });
  if (!r.ok) throw await erroOpenai(r);
  const d = await r.json();
  const conteudo = d?.choices?.[0]?.message?.content;
  if (!conteudo) throw new Error("OpenAI devolveu resposta vazia.");
  return JSON.parse(conteudo) as T;
}

/** PNG gerado pela OpenAI (paisagem). */
export async function gerarImagem(prompt: string): Promise<Uint8Array> {
  const r = await fetch(`${BASE}/images/generations`, {
    method: "POST",
    headers: cabecalhos(),
    body: JSON.stringify({ model: Deno.env.get("OPENAI_MODELO_IMAGEM") || "gpt-image-1", prompt, size: "1536x1024", n: 1 }),
  });
  if (!r.ok) throw await erroOpenai(r);
  const d = await r.json();
  const b64 = d?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI não devolveu a imagem.");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
