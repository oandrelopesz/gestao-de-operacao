import test from "node:test";
import assert from "node:assert/strict";
import { chaveConvite, criarBanco } from "../src/fireflies/supabase.js";

function fakeFetch(respostas) {
  const chamadas = [];
  const fn = async (url, init = {}) => {
    chamadas.push({ url: String(url), init });
    const proxima = respostas.shift() || { status: 200, body: "" };
    const texto = typeof proxima.body === "string" ? proxima.body : JSON.stringify(proxima.body);
    return { ok: proxima.status < 400, status: proxima.status, text: async () => texto };
  };
  fn.chamadas = chamadas;
  return fn;
}

const novo = (f) => criarBanco({ supabaseUrl: "https://sb.test", anonKey: "anon", fetch: f });

test("upsertReuniao faz POST com merge-duplicates e a chave pública", async () => {
  const f = fakeFetch([{ status: 201, body: "" }]);
  await novo(f).upsertReuniao({ id: "a", titulo: "X", status: "pronto" });
  const c = f.chamadas[0];
  assert.equal(c.url, "https://sb.test/rest/v1/fireflies_reunioes?on_conflict=id");
  assert.equal(c.init.method, "POST");
  assert.equal(c.init.headers.apikey, "anon");
  assert.equal(c.init.headers.Authorization, "Bearer anon");
  assert.equal(c.init.headers.Prefer, "resolution=merge-duplicates,return=minimal");
  assert.deepEqual(JSON.parse(c.init.body), { id: "a", titulo: "X", status: "pronto" });
});

test("reunioesIds pagina de 1000 em 1000 e devolve id → status", async () => {
  const pagina1 = Array.from({ length: 1000 }, (_, i) => ({ id: `r${i}`, status: "pronto" }));
  const f = fakeFetch([{ status: 200, body: pagina1 }, { status: 200, body: [{ id: "z", status: "erro" }] }]);
  const mapa = await novo(f).reunioesIds();
  assert.equal(mapa.size, 1001);
  assert.equal(mapa.get("z"), "erro");
  assert.match(f.chamadas[0].url, /select=id,status&order=id\.asc&limit=1000&offset=0$/);
  assert.match(f.chamadas[1].url, /offset=1000$/);
});

test("pendencias filtra excluir ou titulo_pendente preenchido", async () => {
  const f = fakeFetch([{ status: 200, body: [{ id: "a", excluir: true }] }]);
  const linhas = await novo(f).pendencias();
  assert.equal(linhas.length, 1);
  assert.match(decodeURIComponent(f.chamadas[0].url), /or=\(excluir\.is\.true,titulo_pendente\.not\.is\.null\)/);
});

test("atualizar diz se a linha existia", async () => {
  const f = fakeFetch([{ status: 200, body: [{ id: "a" }] }, { status: 200, body: [] }]);
  const banco = novo(f);
  assert.equal(await banco.atualizar("a", { status: "importando" }), true);
  assert.equal(await banco.atualizar("b", { status: "importando" }), false);
  assert.equal(f.chamadas[0].init.method, "PATCH");
  assert.match(f.chamadas[0].url, /fireflies_reunioes\?id=eq\.a&select=id$/);
  assert.equal(f.chamadas[0].init.headers.Prefer, "return=representation");
});

test("apagarLinha faz DELETE pelo id", async () => {
  const f = fakeFetch([{ status: 204, body: "" }]);
  await novo(f).apagarLinha("a b");
  assert.equal(f.chamadas[0].init.method, "DELETE");
  assert.match(f.chamadas[0].url, /fireflies_reunioes\?id=eq\.a%20b$/);
});

test("subirArquivo manda o binário ao bucket fireflies com x-upsert", async () => {
  const f = fakeFetch([{ status: 200, body: { Key: "fireflies/a/resumo.pdf" } }]);
  const buf = Buffer.from("%PDF-1.7");
  await novo(f).subirArquivo("a/resumo.pdf", buf, "application/pdf");
  const c = f.chamadas[0];
  assert.equal(c.url, "https://sb.test/storage/v1/object/fireflies/a/resumo.pdf");
  assert.equal(c.init.method, "POST");
  assert.equal(c.init.headers["x-upsert"], "true");
  assert.equal(c.init.headers["Content-Type"], "application/pdf");
  assert.equal(c.init.headers.apikey, "anon");
  assert.equal(c.init.body, buf);
});

test("apagarArquivos manda os caminhos em prefixes", async () => {
  const f = fakeFetch([{ status: 200, body: [] }]);
  await novo(f).apagarArquivos(["a/transcricao.pdf", "a/resumo.pdf"]);
  assert.equal(f.chamadas[0].url, "https://sb.test/storage/v1/object/fireflies");
  assert.equal(f.chamadas[0].init.method, "DELETE");
  assert.deepEqual(JSON.parse(f.chamadas[0].init.body), { prefixes: ["a/transcricao.pdf", "a/resumo.pdf"] });
});

test("convitesJaEnviados normaliza o fuso do início (Google -03:00 x Postgres +00:00)", async () => {
  const f = fakeFetch([{ status: 200, body: [{ evento_id: "ev1", inicio: "2026-09-26T13:00:00+00:00" }] }]);
  const ja = await novo(f).convitesJaEnviados([{ evento_id: "ev1", inicio: "2026-09-26T10:00:00-03:00" }, { evento_id: "ev2", inicio: "2026-09-26T10:00:00-03:00" }]);
  assert.ok(ja.has(chaveConvite("ev1", "2026-09-26T10:00:00-03:00")));
  assert.ok(!ja.has(chaveConvite("ev2", "2026-09-26T10:00:00-03:00")));
  assert.match(decodeURIComponent(f.chamadas[0].url), /evento_id=in\.\("ev1","ev2"\)/);
});

test("convitesJaEnviados não conta falha passageira ([temporário]): o robô tenta de novo no minuto seguinte", async () => {
  const f = fakeFetch([{ status: 200, body: [
    { evento_id: "ok", inicio: "2026-09-26T13:00:00+00:00", ok: true, erro: null },
    { evento_id: "tmp", inicio: "2026-09-26T13:00:00+00:00", ok: false, erro: "[temporário] Fireflies: Too many requests" },
    { evento_id: "def", inicio: "2026-09-26T13:00:00+00:00", ok: false, erro: "Fireflies: invalid meeting link" },
  ] }]);
  const ja = await novo(f).convitesJaEnviados(["ok", "tmp", "def"].map((evento_id) => ({ evento_id, inicio: "2026-09-26T13:00:00Z" })));
  assert.deepEqual([...ja].sort(), [chaveConvite("def", "2026-09-26T13:00:00Z"), chaveConvite("ok", "2026-09-26T13:00:00Z")].sort());
  assert.match(decodeURIComponent(f.chamadas[0].url), /select=evento_id,inicio,ok,erro/);
});

test("convitesJaEnviados sem chaves não consulta o banco", async () => {
  const f = fakeFetch([]);
  assert.equal((await novo(f).convitesJaEnviados([])).size, 0);
  assert.equal(f.chamadas.length, 0);
});

test("registrarConvite faz upsert pela chave evento + início", async () => {
  const f = fakeFetch([{ status: 201, body: "" }]);
  await novo(f).registrarConvite({ evento_id: "ev1", inicio: "2026-09-26T13:00:00.000Z", ok: true, erro: null });
  assert.equal(f.chamadas[0].url, "https://sb.test/rest/v1/fireflies_convites?on_conflict=evento_id,inicio");
  assert.equal(f.chamadas[0].init.headers.Prefer, "resolution=merge-duplicates,return=minimal");
});

test("erro do Supabase vira Error com o status", async () => {
  const f = fakeFetch([{ status: 400, body: { message: "null value in column titulo" } }]);
  await assert.rejects(() => novo(f).upsertReuniao({ id: "a" }), /Supabase 400: .*titulo/);
});
