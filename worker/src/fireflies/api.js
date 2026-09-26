// Cliente mínimo da API GraphQL do Fireflies (https://api.fireflies.ai/graphql, `Authorization: Bearer`).
// Plano Pro: 500 chamadas por dia na conta inteira, `addToLiveMeeting` 3 a cada 20 min e `deleteTranscript`
// 10 por minuto — quem chama aqui precisa economizar (cada função = 1 chamada).
// Nomes e tipos conferidos na documentação oficial em 26/09/2026 (URL de cada operação no comentário dela).

const ENDPOINT = "https://api.fireflies.ai/graphql";
const LIMITE_MS = 60_000;

// https://docs.fireflies.ai/graphql-api/query/transcripts — `limit` no máximo 50 por consulta; `skip` pagina.
// `date` é Float (ms desde a época, UTC) e `duration` é Number em minutos (docs.fireflies.ai/schema/transcript).
export const CONSULTA_LISTAR =
  "query Transcripts($limit: Int, $skip: Int) { transcripts(limit: $limit, skip: $skip) { id title date duration } }";

// https://docs.fireflies.ai/graphql-api/query/transcript — o argumento chama `id` (String!) e as frases vêm em
// `sentences` (start_time/end_time são String no schema, em segundos). `summary.*` são String (keywords às vezes
// chega como lista; os documentos aceitam os dois). `participants` é [String] de e-mails.
export const CONSULTA_BUSCAR =
  "query Transcript($id: String!) { transcript(id: $id) { id title date duration organizer_email participants " +
  "meeting_link transcript_url summary { overview short_summary action_items keywords outline shorthand_bullet " +
  "bullet_gist gist } sentences { speaker_name text start_time end_time } meeting_attendees { displayName email } } }";

// https://docs.fireflies.ai/graphql-api/mutation/update-meeting-title — input UpdateMeetingTitleInput { id, title }
export const MUTACAO_RENOMEAR =
  "mutation UpdateMeetingTitle($input: UpdateMeetingTitleInput!) { updateMeetingTitle(input: $input) { title } }";

// https://docs.fireflies.ai/graphql-api/mutation/delete-transcript — devolve o Transcript apagado
export const MUTACAO_EXCLUIR = "mutation DeleteTranscript($id: String!) { deleteTranscript(id: $id) { title } }";

// https://docs.fireflies.ai/graphql-api/mutation/add-to-live — a resposta documentada só tem `success`
// (pedir um campo que não existe, como `message`, derrubaria a chamada inteira). `title` até 256 caracteres.
// Sem `language` o Fireflies transcreve em inglês; sem `duration` o robô sai aos 60 min (aceita 15 a 120).
export const MUTACAO_AO_VIVO =
  "mutation AddToLiveMeeting($link: String!, $title: String, $duration: Int, $language: String) { addToLiveMeeting(meeting_link: $link, title: $title, duration: $duration, language: $language) { success } }";
const IDIOMA_PADRAO = "pt"; // docs.fireflies.ai/miscellaneous/language-codes
const DURACAO_MIN = 15;
const DURACAO_MAX = 120;
const DURACAO_PADRAO = 60;

/** Erro da API. `temporario`: rede, 429/5xx ou `too_many_requests` (vale tentar depois); o resto é definitivo. */
export class ErroFireflies extends Error {
  constructor(mensagem, { codigo = null, status = null, temporario = false } = {}) {
    super(mensagem);
    this.name = "ErroFireflies";
    this.codigo = codigo;
    this.status = status;
    this.temporario = temporario;
  }
}

/** A reunião não existe (mais) no Fireflies. */
export function naoEncontrada(e) {
  const codigo = String(e?.codigo || "").toLowerCase();
  if (codigo.includes("not_found")) return true;
  return /not\s*found|não encontrad|does not exist|doesn't exist/i.test(String(e?.message || ""));
}

function erroDaResposta(status, erros) {
  const primeiro = erros[0] || {};
  const codigo = primeiro.code || primeiro.extensions?.code || null;
  const mensagem = erros.map((x) => x?.message).filter(Boolean).join("; ") || `Fireflies respondeu ${status}`;
  const temporario = status === 429 || status >= 500 || String(codigo || "").toLowerCase() === "too_many_requests";
  return new ErroFireflies(`Fireflies: ${mensagem}`.slice(0, 500), { codigo, status, temporario });
}

export function criarFireflies({ apiKey, fetch: _fetch = fetch }) {
  async function graphql(query, variables) {
    let r;
    try {
      r = await _fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(LIMITE_MS),
      });
    } catch (e) {
      throw new ErroFireflies(`Não consegui falar com o Fireflies (${e?.message || e})`, { temporario: true });
    }
    const texto = await r.text().catch(() => "");
    let corpo = null;
    try { corpo = texto ? JSON.parse(texto) : null; } catch { /* resposta que não é JSON */ }
    if (Array.isArray(corpo?.errors) && corpo.errors.length) throw erroDaResposta(r.status, corpo.errors);
    if (!r.ok || !corpo?.data) {
      throw new ErroFireflies(`Fireflies respondeu ${r.status}: ${texto.slice(0, 200)}`, {
        status: r.status,
        temporario: r.status === 429 || r.status >= 500,
      });
    }
    return corpo.data;
  }

  return {
    /** Uma página da lista (mais recentes primeiro, pelo que a API devolve): [{ id, title, date, duration }]. */
    async listar({ limit = 50, skip = 0 } = {}) {
      const data = await graphql(CONSULTA_LISTAR, { limit, skip });
      return (data.transcripts || []).map((t) => ({ id: t.id, title: t.title, date: t.date, duration: t.duration }));
    },
    /** A transcrição inteira (metadados, resumo, frases e participantes). */
    async buscar(id) {
      const data = await graphql(CONSULTA_BUSCAR, { id });
      if (!data.transcript) throw new ErroFireflies(`Reunião ${id} não encontrada no Fireflies`, { codigo: "object_not_found" });
      return data.transcript;
    },
    async renomear(id, titulo) {
      const data = await graphql(MUTACAO_RENOMEAR, { input: { id, title: titulo } });
      return data.updateMeetingTitle;
    },
    async excluir(id) {
      const data = await graphql(MUTACAO_EXCLUIR, { id });
      return data.deleteTranscript;
    },
    /** Manda o robô (Fred) entrar na reunião agora, em português, por `duracao` minutos. Devolve { success }. */
    async adicionarAoVivo({ link, titulo, duracao, idioma = IDIOMA_PADRAO }) {
      const title = titulo ? String(titulo).slice(0, 256) : null;
      const minutos = Number.isFinite(duracao) ? Math.round(duracao) : DURACAO_PADRAO;
      const duration = Math.min(DURACAO_MAX, Math.max(DURACAO_MIN, minutos));
      const data = await graphql(MUTACAO_AO_VIVO, { link, title, duration, language: idioma });
      return { success: data.addToLiveMeeting?.success === true };
    },
  };
}
