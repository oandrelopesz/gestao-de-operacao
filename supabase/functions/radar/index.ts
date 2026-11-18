// Edge function "radar" (Radar IA, 18/11/2026): ingestão do bot de pesquisa. O navegador não chama esta função
// (a aba lê as tabelas com a sessão do André), por isso não há CORS.
//   GET  /radar/saude                         confere a chave antes de enviar
//   POST /radar/eventos[?dry_run=1]           envelope da seção 5.3 da especificação (docs/radar-ia/prompt-aba-radar-ia.md)
// Chave no header x-radar-key (secrets RADAR_INGEST_KEY e, durante a troca, RADAR_INGEST_KEY_ANTERIOR).
// A gravação é toda feita pela função SQL radar_ingerir (uma transação, idempotência e log do envio aceito);
// aqui ficam a chave, o tamanho, o JSON, o limite por minuto, a validação e o log do resto.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import { iguais } from "../_comum/acesso.ts";
import { validarEnvelope } from "./validar.ts";

const MAX_BYTES = 512 * 1024;
const LIMITE_POR_MINUTO = 60;
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

type Log = { rota: string; chave_digest?: string | null; idempotency_key?: string | null; dry_run?: boolean; codigo?: string; resumo?: unknown; payload_sha256?: string | null };

function json(status: number, corpo: unknown, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...extra } });
}
const erro = (status: number, codigo: string, mensagem: string, campos?: unknown, extra?: Record<string, string>) =>
  json(status, campos ? { ok: false, codigo, mensagem, campos } : { ok: false, codigo, mensagem }, extra);

async function sha256(dados: string | ArrayBuffer) {
  const bytes = typeof dados === "string" ? new TextEncoder().encode(dados) : dados;
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ponytail: Brasil sem horário de verão desde 2019; se voltar, trocar por Intl com America/Sao_Paulo
function agoraSP() {
  const iso = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 19) + "-03:00";
  return { agora_sp: iso, data_sp: iso.slice(0, 10) };
}

async function registrar(log: Log, status: number, inicio: number, resposta?: unknown) {
  try {
    await sb.from("radar_ingestao_log").insert({ ...log, dry_run: log.dry_run ?? false, status_http: status, resposta: resposta ?? null, duracao_ms: Date.now() - inicio });
  } catch (e) {
    console.error("radar: log falhou", e instanceof Error ? e.message : e);
  }
}

// devolve "atual" | "anterior" | null; null com secret ausente vira 503 antes
function qualChave(enviada: string): "atual" | "anterior" | null {
  const atual = Deno.env.get("RADAR_INGEST_KEY") || "";
  const anterior = Deno.env.get("RADAR_INGEST_KEY_ANTERIOR") || "";
  if (iguais(enviada, atual)) return "atual";
  if (anterior.length >= 32 && iguais(enviada, anterior)) return "anterior";
  return null;
}

async function segundosAteLiberar(digest: string): Promise<number> {
  const desde = new Date(Date.now() - 60_000).toISOString();
  const { count } = await sb.from("radar_ingestao_log").select("id", { count: "exact", head: true }).eq("chave_digest", digest).gte("recebido_em", desde);
  if ((count ?? 0) < LIMITE_POR_MINUTO) return 0;
  const { data } = await sb.from("radar_ingestao_log").select("recebido_em").eq("chave_digest", digest).gte("recebido_em", desde)
    .order("recebido_em", { ascending: true }).limit(1);
  const maisAntigo = data?.[0] ? new Date(data[0].recebido_em).getTime() : Date.now();
  return Math.max(1, Math.ceil((maisAntigo + 60_000 - Date.now()) / 1000));
}

Deno.serve(async (req) => {
  const inicio = Date.now();
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  const url = new URL(req.url);
  const caminho = url.pathname.replace(/\/+$/, "");
  const rota = caminho.endsWith("/saude") ? "GET /saude" : caminho.endsWith("/eventos") ? "POST /eventos" : null;
  if (!rota || req.method !== rota.split(" ")[0]) return erro(404, "ROTA_INEXISTENTE", "Use GET /radar/saude ou POST /radar/eventos.");
  const log: Log = { rota, idempotency_key: req.headers.get("idempotency-key"), dry_run: url.searchParams.get("dry_run") === "1" || req.headers.get("x-radar-dry-run") === "1" };

  // 1) chave
  if ((Deno.env.get("RADAR_INGEST_KEY") || "").length < 32) {
    await registrar({ ...log, codigo: "INDISPONIVEL" }, 503, inicio);
    return erro(503, "INDISPONIVEL", "Ingestão não configurada no servidor.");
  }
  const enviada = req.headers.get("x-radar-key") || "";
  const chave = enviada ? qualChave(enviada) : null;
  if (!chave) {
    const codigo = enviada ? "CHAVE_INVALIDA" : "CHAVE_AUSENTE";
    await registrar({ ...log, codigo }, 401, inicio);
    return erro(401, codigo, enviada ? "Chave inválida." : "Envie a chave no header x-radar-key.");
  }
  log.chave_digest = (await sha256(enviada)).slice(0, 8);

  // 2) tamanho e JSON (só em /eventos)
  let corpo: unknown = null;
  let bruto: ArrayBuffer | null = null;
  if (rota === "POST /eventos") {
    if (Number(req.headers.get("content-length") || 0) > MAX_BYTES) {
      await registrar({ ...log, codigo: "PAYLOAD_GRANDE" }, 413, inicio);
      return erro(413, "PAYLOAD_GRANDE", "Envio acima de 512 KB; divida em partes.");
    }
    bruto = await req.arrayBuffer();
    if (bruto.byteLength > MAX_BYTES) {
      await registrar({ ...log, codigo: "PAYLOAD_GRANDE" }, 413, inicio);
      return erro(413, "PAYLOAD_GRANDE", "Envio acima de 512 KB; divida em partes.");
    }
    log.payload_sha256 = await sha256(bruto);
    try {
      corpo = JSON.parse(new TextDecoder().decode(bruto));
    } catch {
      await registrar({ ...log, codigo: "JSON_INVALIDO" }, 400, inicio);
      return erro(400, "JSON_INVALIDO", "O corpo não é um JSON válido.");
    }
  }

  // 3) limite por minuto (conta o log, inclusive esta chave em /saude)
  const espera = await segundosAteLiberar(log.chave_digest);
  if (espera > 0) {
    await registrar({ ...log, codigo: "LIMITE" }, 429, inicio);
    return erro(429, "LIMITE", `Limite de ${LIMITE_POR_MINUTO} requisições por minuto.`, undefined, { "Retry-After": String(espera) });
  }

  if (rota === "GET /saude") {
    const r = { ok: true, schema_versao: 1, ...agoraSP(), chave };
    await registrar({ ...log, codigo: "OK" }, 200, inicio);
    return json(200, r);
  }

  // 4) Idempotency-Key e validação
  const idem = (log.idempotency_key || "").trim();
  if (!idem || idem.length > 200) {
    await registrar({ ...log, codigo: "VALIDACAO" }, 422, inicio);
    return erro(422, "VALIDACAO", "Header Idempotency-Key obrigatório (até 200 caracteres).", [{ caminho: "Idempotency-Key", problema: "ausente ou longo demais" }]);
  }
  const v = validarEnvelope(corpo);
  if (!v.ok) {
    await registrar({ ...log, codigo: "VALIDACAO", resumo: { campos: v.campos } }, 422, inicio);
    return erro(422, "VALIDACAO", "Dados inválidos.", v.campos);
  }

  // 5) gravação (ou simulação) numa transação só
  const { data, error } = await sb.rpc("radar_ingerir", { p_payload: corpo, p_idem: idem, p_dry_run: !!log.dry_run, p_chave_digest: log.chave_digest });
  if (error) {
    const dado = /^2[23]/.test(error.code || ""); // 22xxx/23xxx = dado recusado pelo banco
    const status = dado ? 422 : 500;
    console.error("radar: rpc", error.code, error.message);
    await registrar({ ...log, codigo: dado ? "VALIDACAO" : "ERRO_INTERNO", resumo: { pg: error.code } }, status, inicio);
    return dado ? erro(422, "VALIDACAO", "O banco recusou um dado.", [{ caminho: "", problema: error.message }])
                : erro(500, "ERRO_INTERNO", "Erro interno; repita com a mesma Idempotency-Key.");
  }
  const r = data as Record<string, unknown> & { ok: boolean; status?: number; replay?: boolean };
  if (!r.ok) {
    const { status = 422, ...resto } = r;
    await registrar({ ...log, codigo: String(r.codigo), resumo: { campos: r.campos ?? null } }, status, inicio);
    return json(status, resto);
  }
  const resposta = { ...r, avisos: v.avisos };
  if (log.dry_run || r.replay) await registrar({ ...log, codigo: r.replay ? "REPLAY" : "OK" }, 200, inicio, log.dry_run ? resposta : undefined);
  // envio aceito de verdade: a própria radar_ingerir já gravou o log na transação
  return json(200, resposta);
});
