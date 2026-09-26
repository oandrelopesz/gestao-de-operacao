import test from "node:test";
import assert from "node:assert/strict";
import { criarFireflies, ErroFireflies, naoEncontrada } from "../src/fireflies/api.js";

/** fetch de mentira: devolve as respostas da fila e guarda as chamadas (corpo já em JSON) */
function fakeFetch(respostas) {
  const chamadas = [];
  const fn = async (url, init = {}) => {
    chamadas.push({ url: String(url), init, corpo: JSON.parse(init.body) });
    const proxima = respostas.shift();
    if (!proxima) throw new Error(`fetch inesperado: ${url}`);
    if (proxima.falha) throw new Error(proxima.falha);
    return { ok: proxima.status < 400, status: proxima.status, text: async () => (typeof proxima.body === "string" ? proxima.body : JSON.stringify(proxima.body ?? {})) };
  };
  fn.chamadas = chamadas;
  return fn;
}

test("listar manda limit/skip com o Bearer e devolve id, título, data e duração", async () => {
  const f = fakeFetch([{ status: 200, body: { data: { transcripts: [{ id: "a", title: "Reunião A", date: 1758819600000, duration: 32.5, extra: 1 }] } } }]);
  const ff = criarFireflies({ apiKey: "chave", fetch: f });
  const lista = await ff.listar({ limit: 50, skip: 100 });
  assert.deepEqual(lista, [{ id: "a", title: "Reunião A", date: 1758819600000, duration: 32.5 }]);
  const c = f.chamadas[0];
  assert.equal(c.url, "https://api.fireflies.ai/graphql");
  assert.equal(c.init.method, "POST");
  assert.equal(c.init.headers.Authorization, "Bearer chave");
  assert.equal(c.init.headers["Content-Type"], "application/json");
  assert.match(c.corpo.query, /transcripts\(limit: \$limit, skip: \$skip\)/);
  assert.deepEqual(c.corpo.variables, { limit: 50, skip: 100 });
});

test("buscar pede a transcrição completa pelo id", async () => {
  const f = fakeFetch([{ status: 200, body: { data: { transcript: { id: "a", title: "X", sentences: [] } } } }]);
  const t = await criarFireflies({ apiKey: "k", fetch: f }).buscar("a");
  assert.equal(t.title, "X");
  const q = f.chamadas[0].corpo.query;
  assert.match(q, /transcript\(id: \$id\)/);
  for (const campo of ["organizer_email", "participants", "meeting_link", "short_summary", "action_items", "shorthand_bullet", "speaker_name", "start_time", "meeting_attendees { displayName email }"]) {
    assert.ok(q.includes(campo), `faltou ${campo}`);
  }
  assert.deepEqual(f.chamadas[0].corpo.variables, { id: "a" });
});

test("buscar sem transcrição (null) é 'não encontrada'", async () => {
  const f = fakeFetch([{ status: 200, body: { data: { transcript: null } } }]);
  await assert.rejects(() => criarFireflies({ apiKey: "k", fetch: f }).buscar("sumiu"), (e) => e instanceof ErroFireflies && naoEncontrada(e));
});

test("errors do GraphQL viram ErroFireflies com a mensagem e o código", async () => {
  const f = fakeFetch([{ status: 200, body: { errors: [{ message: "Only admins can update", code: "require_elevated_privilege" }], data: null } }]);
  await assert.rejects(() => criarFireflies({ apiKey: "k", fetch: f }).renomear("a", "Novo"), (e) => {
    assert.ok(e instanceof ErroFireflies);
    assert.match(e.message, /Only admins can update/);
    assert.equal(e.codigo, "require_elevated_privilege");
    assert.equal(e.temporario, false);
    return true;
  });
});

test("too_many_requests, 5xx e falha de rede são temporários", async () => {
  const limite = fakeFetch([{ status: 200, body: { errors: [{ message: "Too many requests", extensions: { code: "too_many_requests" } }] } }]);
  await assert.rejects(() => criarFireflies({ apiKey: "k", fetch: limite }).excluir("a"), (e) => e.temporario === true && e.codigo === "too_many_requests");
  const fora = fakeFetch([{ status: 502, body: "<html>Bad gateway</html>" }]);
  await assert.rejects(() => criarFireflies({ apiKey: "k", fetch: fora }).listar(), (e) => e.temporario === true && e.status === 502);
  const rede = fakeFetch([{ falha: "ECONNRESET" }]);
  await assert.rejects(() => criarFireflies({ apiKey: "k", fetch: rede }).listar(), (e) => e.temporario === true && /ECONNRESET/.test(e.message));
});

test("renomear usa o input UpdateMeetingTitleInput { id, title }", async () => {
  const f = fakeFetch([{ status: 200, body: { data: { updateMeetingTitle: { title: "Novo" } } } }]);
  await criarFireflies({ apiKey: "k", fetch: f }).renomear("a", "Novo");
  assert.match(f.chamadas[0].corpo.query, /updateMeetingTitle\(input: \$input\)/);
  assert.deepEqual(f.chamadas[0].corpo.variables, { input: { id: "a", title: "Novo" } });
});

test("excluir chama deleteTranscript(id)", async () => {
  const f = fakeFetch([{ status: 200, body: { data: { deleteTranscript: { title: "X" } } } }]);
  await criarFireflies({ apiKey: "k", fetch: f }).excluir("a");
  assert.match(f.chamadas[0].corpo.query, /deleteTranscript\(id: \$id\)/);
  assert.deepEqual(f.chamadas[0].corpo.variables, { id: "a" });
});

test("adicionarAoVivo manda link e título (até 256) e devolve success", async () => {
  const f = fakeFetch([
    { status: 200, body: { data: { addToLiveMeeting: { success: true } } } },
    { status: 200, body: { data: { addToLiveMeeting: { success: false } } } },
  ]);
  const ff = criarFireflies({ apiKey: "k", fetch: f });
  assert.deepEqual(await ff.adicionarAoVivo({ link: "https://meet.google.com/abc-defg-hij", titulo: "x".repeat(300) }), { success: true });
  assert.match(f.chamadas[0].corpo.query, /addToLiveMeeting\(meeting_link: \$link, title: \$title, duration: \$duration, language: \$language\) \{ success \}/);
  assert.equal(f.chamadas[0].corpo.variables.link, "https://meet.google.com/abc-defg-hij");
  assert.equal(f.chamadas[0].corpo.variables.title.length, 256);
  assert.deepEqual(await ff.adicionarAoVivo({ link: "https://meet.google.com/x", titulo: "Y" }), { success: false });
});

test("adicionarAoVivo: português por padrão (o Fireflies usa inglês) e duração entre 15 e 120 min (padrão 60)", async () => {
  const ok = { status: 200, body: { data: { addToLiveMeeting: { success: true } } } };
  const f = fakeFetch([ok, ok, ok, ok]);
  const ff = criarFireflies({ apiKey: "k", fetch: f });
  await ff.adicionarAoVivo({ link: "https://meet.google.com/a", titulo: "A", duracao: 50 });
  await ff.adicionarAoVivo({ link: "https://meet.google.com/a", titulo: "A", duracao: 5 });
  await ff.adicionarAoVivo({ link: "https://meet.google.com/a", titulo: "A", duracao: 400 });
  await ff.adicionarAoVivo({ link: "https://meet.google.com/a", titulo: "A" });
  assert.match(f.chamadas[0].corpo.query, /duration: \$duration, language: \$language/);
  assert.deepEqual(f.chamadas.map((c) => c.corpo.variables.duration), [50, 15, 120, 60]);
  assert.deepEqual(f.chamadas.map((c) => c.corpo.variables.language), ["pt", "pt", "pt", "pt"]);
});

test("naoEncontrada reconhece código e mensagem", () => {
  assert.equal(naoEncontrada(new ErroFireflies("x", { codigo: "object_not_found" })), true);
  assert.equal(naoEncontrada(new Error("Fireflies: Transcript not found")), true);
  assert.equal(naoEncontrada(new Error("Fireflies: Only admins")), false);
});
