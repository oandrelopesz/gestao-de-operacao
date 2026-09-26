import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { ErroFireflies } from "../src/fireflies/api.js";
import { chaveConvite, conviteParaRepetir } from "../src/fireflies/supabase.js";
import {
  MAX_EXCLUSOES_POR_VEZ, aplicarPendencias, caminhosDa, criarRotinasFireflies, enviarRoboAgenda, eventosParaRobo,
  importarReuniao, interpretarWebhook, linkDoMeet, sincronizar, verificarAssinatura,
} from "../src/fireflies/servico.js";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Banco em memória com a mesma cara de criarBanco */
function fakeBanco(inicial = []) {
  const linhas = new Map(inicial.map((l) => [l.id, { ...l }]));
  const b = {
    linhas,
    chamadas: [],
    arquivos: new Map(),
    apagados: [],
    convites: [],
    async reunioesIds() { return new Map([...linhas.values()].map((l) => [l.id, l.status])); },
    async upsertReuniao(l) { b.chamadas.push(["upsert", l]); linhas.set(l.id, { ...(linhas.get(l.id) || {}), ...l }); },
    async pendencias() { return [...linhas.values()].filter((l) => l.excluir || l.titulo_pendente != null); },
    async atualizar(id, campos) {
      b.chamadas.push(["atualizar", id, campos]);
      if (!linhas.has(id)) return false;
      linhas.set(id, { ...linhas.get(id), ...campos });
      return true;
    },
    async apagarLinha(id) { linhas.delete(id); },
    async subirArquivo(caminho, buffer, tipo) { b.arquivos.set(caminho, { conteudo: buffer.toString(), tipo }); },
    async apagarArquivos(caminhos) { b.apagados.push(...caminhos); },
    async convitesJaEnviados() {
      return new Set(b.convites.filter((c) => !conviteParaRepetir(c)).map((c) => chaveConvite(c.evento_id, c.inicio)));
    },
    async registrarConvite(l) {
      const i = b.convites.findIndex((c) => chaveConvite(c.evento_id, c.inicio) === chaveConvite(l.evento_id, l.inicio));
      if (i >= 0) b.convites[i] = l; else b.convites.push(l);
    },
  };
  return b;
}

/** Fireflies de mentira: `lista` para listar, `transcricoes` para buscar, `falhas` por operação */
function fakeFireflies({ lista = [], transcricoes = {}, falhas = {} } = {}) {
  const f = {
    chamadas: [],
    async listar({ limit, skip }) { f.chamadas.push(["listar", skip]); return lista.slice(skip, skip + limit); },
    async buscar(id) {
      f.chamadas.push(["buscar", id]);
      if (falhas.buscar) throw falhas.buscar;
      if (!transcricoes[id]) throw new ErroFireflies(`Reunião ${id} não encontrada no Fireflies`, { codigo: "object_not_found" });
      return transcricoes[id];
    },
    async renomear(id, titulo) { f.chamadas.push(["renomear", id, titulo]); if (falhas.renomear) throw falhas.renomear; return { title: titulo }; },
    async excluir(id) { f.chamadas.push(["excluir", id]); if (falhas.excluir) throw falhas.excluir; return { title: "x" }; },
    async adicionarAoVivo(p) {
      f.chamadas.push(["aoVivo", p]);
      if (falhas.aoVivo?.(p)) throw new ErroFireflies("Fireflies: Too many requests", { codigo: "too_many_requests", temporario: true });
      return { success: true };
    },
  };
  return f;
}

const documentos = {
  htmlTranscricao: (r) => `T:${r.title}`,
  htmlResumo: (r) => `R:${r.title}`,
  gerarPdf: async (html) => Buffer.from(`pdf:${html}`),
  gerarDocx: async (r, tipo) => Buffer.from(`docx:${tipo}:${r.title}`),
};

const TRANSCRICAO = {
  id: "m1",
  title: "Reunião com cliente",
  date: Date.UTC(2026, 8, 25, 17, 0),
  duration: 30,
  organizer_email: "contato@andrelopes.digital",
  participants: ["a@x.com", "B@x.com"],
  meeting_attendees: [{ displayName: "B", email: "b@x.com" }, { displayName: "C", email: "c@x.com" }],
  meeting_link: "https://meet.google.com/abc-defg-hij",
  sentences: [],
};

const semLog = () => {};

test("importarReuniao: linha nova nasce 'importando', ganha os 4 arquivos e fica 'pronto'", async () => {
  const banco = fakeBanco();
  const fireflies = fakeFireflies({ transcricoes: { m1: TRANSCRICAO } });
  const r = await importarReuniao("m1", { fireflies, banco, documentos }, { titulo: "Da lista" });
  assert.deepEqual(r, { ok: true, id: "m1", titulo: "Reunião com cliente" });

  const primeiro = banco.chamadas.find((c) => c[0] === "upsert")[1];
  assert.equal(primeiro.status, "importando");
  assert.equal(primeiro.titulo, "Da lista", "titulo é NOT NULL: a linha nova nasce com o nome da lista");

  const linha = banco.linhas.get("m1");
  assert.equal(linha.status, "pronto");
  assert.equal(linha.erro, null);
  assert.equal(linha.titulo, "Reunião com cliente");
  assert.equal(linha.data_hora, "2026-09-25T17:00:00.000Z");
  assert.equal(linha.duracao_min, 30);
  assert.deepEqual(linha.participantes, ["a@x.com", "b@x.com", "c@x.com"]);
  assert.equal(linha.organizador, "contato@andrelopes.digital");
  assert.equal(linha.link_meet, "https://meet.google.com/abc-defg-hij");
  assert.equal(linha.link_fireflies, "https://app.fireflies.ai/view/m1");
  assert.deepEqual(linha.arquivos, caminhosDa("m1"));
  assert.deepEqual(linha.arquivos, {
    transcricao_pdf: "m1/transcricao.pdf", transcricao_docx: "m1/transcricao.docx", resumo_pdf: "m1/resumo.pdf", resumo_docx: "m1/resumo.docx",
  });

  assert.deepEqual(banco.arquivos.get("m1/transcricao.pdf"), { conteudo: "pdf:T:Reunião com cliente", tipo: "application/pdf" });
  assert.deepEqual(banco.arquivos.get("m1/resumo.pdf"), { conteudo: "pdf:R:Reunião com cliente", tipo: "application/pdf" });
  assert.deepEqual(banco.arquivos.get("m1/transcricao.docx"), { conteudo: "docx:transcricao:Reunião com cliente", tipo: DOCX });
  assert.deepEqual(banco.arquivos.get("m1/resumo.docx"), { conteudo: "docx:resumo:Reunião com cliente", tipo: DOCX });
  assert.equal(fireflies.chamadas.filter((c) => c[0] === "buscar").length, 1, "1 chamada ao Fireflies por importação");
});

test("importarReuniao de linha que já existe não troca o título por um provisório", async () => {
  const banco = fakeBanco([{ id: "m1", titulo: "Nome certo", status: "pronto" }]);
  await importarReuniao("m1", { fireflies: fakeFireflies({ transcricoes: { m1: TRANSCRICAO } }), banco, documentos });
  const upserts = banco.chamadas.filter((c) => c[0] === "upsert").map((c) => c[1]);
  assert.ok(upserts.every((u) => u.titulo === "Reunião com cliente"));
  assert.deepEqual(banco.chamadas[0], ["atualizar", "m1", { status: "importando", erro: null }]);
});

test("importarReuniao com falha marca 'erro' (até 300 caracteres) e não lança", async () => {
  const banco = fakeBanco();
  const quebrado = { ...documentos, gerarPdf: async () => { throw new Error(`Chromium caiu ${"x".repeat(400)}`); } };
  const r = await importarReuniao("m1", { fireflies: fakeFireflies({ transcricoes: { m1: TRANSCRICAO } }), banco, documentos: quebrado });
  assert.equal(r.ok, false);
  assert.match(r.erro, /^Chromium caiu/);
  const linha = banco.linhas.get("m1");
  assert.equal(linha.status, "erro");
  assert.equal(linha.erro.length, 300);
});

/** 120 reuniões, t0 a mais recente */
function listaDe(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `t${i}`, title: `Reunião ${i}`, date: Date.UTC(2026, 8, 25) - i * 3600e3, duration: 30 }));
}

test("sincronizar: varre todas as páginas, importa as ausentes e as com erro, mais recentes primeiro, até o limite", async () => {
  const lista = listaDe(120);
  const transcricoes = Object.fromEntries(lista.map((t) => [t.id, { ...TRANSCRICAO, id: t.id, title: t.title }]));
  const banco = fakeBanco(lista.filter((t) => !["t5", "t100"].includes(t.id)).map((t) => ({ id: t.id, titulo: t.title, status: t.id === "t7" ? "erro" : "pronto" })));
  const fireflies = fakeFireflies({ lista, transcricoes });
  const estado = { historicoCompleto: false };
  const deps = { fireflies, banco, documentos, estado, log: semLog };

  const r1 = await sincronizar({ limite: 2 }, deps);
  assert.deepEqual(fireflies.chamadas.filter((c) => c[0] === "listar").map((c) => c[1]), [0, 50, 100]);
  assert.deepEqual(fireflies.chamadas.filter((c) => c[0] === "buscar").map((c) => c[1]), ["t5", "t7"]);
  assert.deepEqual(r1, { ok: true, importados: 2, falhas: [], restantes: 1, paginasLidas: 3, historicoCompleto: false });

  const r2 = await sincronizar({}, deps);
  assert.equal(r2.importados, 1, "t100 (a que faltava)");
  assert.equal(r2.historicoCompleto, false, "a varredura ainda achou uma ausente");

  const r3 = await sincronizar({}, deps);
  assert.deepEqual(r3, { ok: true, importados: 0, falhas: [], restantes: 0, paginasLidas: 3, historicoCompleto: true });

  fireflies.chamadas.length = 0;
  const r4 = await sincronizar({}, deps);
  assert.equal(r4.paginasLidas, 1, "histórico completo: só a 1ª página");
  assert.deepEqual(fireflies.chamadas, [["listar", 0]]);

  const r5 = await sincronizar({ completo: true }, deps);
  assert.equal(r5.paginasLidas, 3, "completo: true força a varredura inteira");
  assert.equal(r5.historicoCompleto, true);
});

test("sincronizar só na 1ª página: reunião nova é importada; página inteira ausente volta a varrer tudo", async () => {
  const lista = listaDe(60);
  const transcricoes = Object.fromEntries(lista.map((t) => [t.id, { ...TRANSCRICAO, id: t.id, title: t.title }]));
  const estado = { historicoCompleto: true };
  const banco = fakeBanco(lista.slice(1).map((t) => ({ id: t.id, titulo: t.title, status: "pronto" })));
  const r = await sincronizar({}, { fireflies: fakeFireflies({ lista, transcricoes }), banco, documentos, estado, log: semLog });
  assert.equal(r.paginasLidas, 1);
  assert.equal(r.importados, 1);
  assert.equal(banco.linhas.get("t0").status, "pronto");
  assert.equal(estado.historicoCompleto, true);

  const vazio = fakeBanco();
  const r2 = await sincronizar({ limite: 0 }, { fireflies: fakeFireflies({ lista, transcricoes }), banco: vazio, documentos, estado, log: semLog });
  assert.equal(r2.paginasLidas, 1);
  assert.equal(r2.restantes, 50);
  assert.equal(estado.historicoCompleto, false, "50 ausentes na 1ª página: pode ter mais atrás");
});

test("sincronizar conta falhas sem parar o lote", async () => {
  const lista = listaDe(3);
  const banco = fakeBanco();
  const fireflies = fakeFireflies({ lista, transcricoes: { t0: { ...TRANSCRICAO, id: "t0" }, t2: { ...TRANSCRICAO, id: "t2" } } });
  const r = await sincronizar({}, { fireflies, banco, documentos, estado: { historicoCompleto: false }, log: semLog });
  assert.equal(r.importados, 2);
  assert.equal(r.falhas.length, 1);
  assert.equal(r.falhas[0].id, "t1");
  assert.equal(banco.linhas.get("t1").status, "erro");
  assert.equal(r.historicoCompleto, false, "havia ausentes nesta varredura");
});

test("aplicarPendencias: exclui (mesmo se o Fireflies já não tem) e renomeia gerando os arquivos de novo", async () => {
  const banco = fakeBanco([
    { id: "a", titulo: "Velha", status: "pronto", excluir: true, arquivos: caminhosDa("a") },
    { id: "b", titulo: "Antigo", status: "pronto", excluir: false, titulo_pendente: "  Nome novo  " },
    { id: "c", titulo: "Fica", status: "pronto", excluir: false, titulo_pendente: null },
  ]);
  const fireflies = fakeFireflies({ transcricoes: { b: { ...TRANSCRICAO, id: "b", title: "Antigo" } } });
  fireflies.excluir = async (id) => { fireflies.chamadas.push(["excluir", id]); throw new ErroFireflies("Fireflies: Transcript not found", { codigo: "object_not_found" }); };

  const r = await aplicarPendencias({ fireflies, banco, documentos });
  assert.deepEqual(r, { ok: true, renomeados: 1, excluidos: 1, erros: [] });

  assert.equal(banco.linhas.has("a"), false);
  assert.deepEqual(banco.apagados.sort(), Object.values(caminhosDa("a")).sort());

  assert.deepEqual(fireflies.chamadas.find((c) => c[0] === "renomear"), ["renomear", "b", "Nome novo"]);
  const b = banco.linhas.get("b");
  assert.equal(b.titulo, "Nome novo");
  assert.equal(b.titulo_pendente, null);
  assert.equal(banco.arquivos.get("b/resumo.docx").conteudo, "docx:resumo:Nome novo", "arquivos com o nome novo");
  assert.equal(banco.arquivos.get("b/transcricao.pdf").conteudo, "pdf:T:Nome novo");
  assert.deepEqual(b.arquivos, caminhosDa("b"));
  assert.equal(banco.linhas.get("c").titulo, "Fica");
});

test("aplicarPendencias: recusa definitiva desfaz o pedido; erro temporário deixa para o próximo minuto", async () => {
  const banco = fakeBanco([
    { id: "r", titulo: "X", status: "pronto", excluir: false, titulo_pendente: "Y" },
    { id: "e", titulo: "Z", status: "pronto", excluir: true },
  ]);
  const fireflies = fakeFireflies({
    falhas: {
      renomear: new ErroFireflies("Fireflies: Only admins can update meeting titles", { codigo: "require_elevated_privilege" }),
      excluir: new ErroFireflies("Não consegui falar com o Fireflies (ECONNRESET)", { temporario: true }),
    },
  });
  const r = await aplicarPendencias({ fireflies, banco, documentos });
  assert.equal(r.renomeados, 0);
  assert.equal(r.excluidos, 0);
  assert.deepEqual(r.erros.map((e) => [e.id, e.acao]).sort(), [["e", "excluir"], ["r", "renomear"]]);

  const renomear = banco.linhas.get("r");
  assert.equal(renomear.titulo_pendente, null);
  assert.equal(renomear.titulo, "X");
  assert.match(renomear.erro, /Não foi possível renomear no Fireflies: .*Only admins/);

  const excluir = banco.linhas.get("e");
  assert.equal(excluir.excluir, true, "rede caiu: tenta de novo no próximo minuto");
  assert.equal(banco.apagados.length, 0);
});

test("aplicarPendencias: renomeado mas sem arquivos novos grava o aviso e segue", async () => {
  const banco = fakeBanco([{ id: "b", titulo: "Antigo", status: "pronto", excluir: false, titulo_pendente: "Novo" }]);
  const fireflies = fakeFireflies({ transcricoes: { b: { ...TRANSCRICAO, id: "b" } } });
  const quebrado = { ...documentos, gerarDocx: async () => { throw new Error("docx falhou"); } };
  const r = await aplicarPendencias({ fireflies, banco, documentos: quebrado });
  assert.equal(r.renomeados, 1);
  assert.deepEqual(r.erros.map((e) => e.acao), ["arquivos"]);
  assert.equal(banco.linhas.get("b").titulo, "Novo");
  assert.equal(banco.linhas.get("b").titulo_pendente, null);
  assert.match(banco.linhas.get("b").erro, /Renomeada, mas os arquivos não foram gerados de novo: docx falhou/);
});

test("aplicarPendencias exclui no máximo 8 por vez (limite de 10/min do Fireflies)", async () => {
  const banco = fakeBanco(Array.from({ length: 12 }, (_, i) => ({ id: `x${i}`, titulo: "X", status: "pronto", excluir: true })));
  const fireflies = fakeFireflies();
  const r = await aplicarPendencias({ fireflies, banco, documentos });
  assert.equal(r.excluidos, MAX_EXCLUSOES_POR_VEZ);
  assert.equal(fireflies.chamadas.filter((c) => c[0] === "excluir").length, MAX_EXCLUSOES_POR_VEZ);
  assert.equal(banco.linhas.size, 12 - MAX_EXCLUSOES_POR_VEZ);
});

// ---------------------------------------------------------------- Agenda

const AGORA = new Date("2026-09-26T13:00:00.000Z"); // 10:00 em Brasília
const ev = (id, inicio, extra = {}) => ({
  id,
  status: "confirmed",
  summary: `Evento ${id}`,
  start: { dateTime: inicio, timeZone: "America/Sao_Paulo" },
  hangoutLink: `https://meet.google.com/${id}-aaaa-bbb`,
  ...extra,
});

test("linkDoMeet: hangoutLink ou conferenceData de vídeo do Meet", () => {
  assert.equal(linkDoMeet({ hangoutLink: "https://meet.google.com/abc-defg-hij" }), "https://meet.google.com/abc-defg-hij");
  assert.equal(linkDoMeet({ conferenceData: { entryPoints: [{ entryPointType: "phone", uri: "tel:+55" }, { entryPointType: "video", uri: "https://meet.google.com/xyz-abcd-efg" }] } }), "https://meet.google.com/xyz-abcd-efg");
  assert.equal(linkDoMeet({ conferenceData: { entryPoints: [{ entryPointType: "video", uri: "https://zoom.us/j/123" }] } }), null);
  assert.equal(linkDoMeet({}), null);
});

test("eventosParaRobo: janela de −5/+2 min, com Meet, sem cancelado/recusado/dia inteiro/já enviado/link repetido", () => {
  const eventos = [
    ev("ok1", "2026-09-26T10:00:00-03:00"),
    ev("ok2", "2026-09-26T09:56:00-03:00", { attendees: [{ email: "contato@andrelopes.digital", self: true, responseStatus: "accepted" }] }),
    ev("limite", "2026-09-26T10:02:00-03:00"),
    ev("cedo", "2026-09-26T10:03:00-03:00"),
    ev("tarde", "2026-09-26T09:54:59-03:00"),
    ev("cancelado", "2026-09-26T10:00:00-03:00", { status: "cancelled" }),
    ev("recusado", "2026-09-26T10:00:00-03:00", { attendees: [{ email: "outro@x.com", responseStatus: "declined" }, { email: "eu@x.com", self: true, responseStatus: "declined" }] }),
    { id: "diainteiro", status: "confirmed", summary: "Feriado", start: { date: "2026-09-26" }, hangoutLink: "https://meet.google.com/dia-inte-iro" },
    ev("zoom", "2026-09-26T10:00:00-03:00", { hangoutLink: undefined, location: "https://zoom.us/j/1" }),
    ev("conf", "2026-09-26T10:01:00-03:00", { hangoutLink: undefined, conferenceData: { entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/con-fere-nce" }] } }),
    ev("jaenviado", "2026-09-26T10:00:00-03:00"),
    ev("repetido", "2026-09-26T10:00:00-03:00", { hangoutLink: "https://meet.google.com/ok1-aaaa-bbb?authuser=0" }),
    ev("semtitulo", "2026-09-26T10:00:00-03:00", { summary: "   " }),
  ];
  const jaEnviados = new Set([chaveConvite("jaenviado", "2026-09-26T13:00:00.000Z")]);
  const escolhidos = eventosParaRobo(eventos, AGORA, jaEnviados);
  assert.deepEqual(escolhidos.map((e) => e.evento_id), ["ok1", "ok2", "limite", "conf", "semtitulo"]);
  assert.deepEqual(escolhidos[0], { evento_id: "ok1", inicio: "2026-09-26T13:00:00.000Z", link_meet: "https://meet.google.com/ok1-aaaa-bbb", titulo: "Evento ok1", duracao: null });
  assert.equal(escolhidos[3].link_meet, "https://meet.google.com/con-fere-nce");
  assert.equal(escolhidos[4].titulo, "Reunião");
});

function fetchAgenda(itens, status = 200) {
  const chamadas = [];
  const fn = async (url, init) => {
    chamadas.push({ url: new URL(url), init });
    return { ok: status < 400, status, json: async () => (status < 400 ? { items: itens } : { error: { message: "Invalid Credentials" } }) };
  };
  fn.chamadas = chamadas;
  return fn;
}

test("enviarRoboAgenda: consulta a agenda primary, manda até 3 robôs e registra cada envio", async () => {
  const itens = ["e1", "e2", "e3", "e4"].map((id) => ev(id, "2026-09-26T10:00:00-03:00"));
  const f = fetchAgenda(itens);
  const banco = fakeBanco();
  const fireflies = fakeFireflies({ falhas: { aoVivo: (p) => p.titulo === "Evento e2" } });
  const r = await enviarRoboAgenda({ agora: AGORA }, { fireflies, banco, fetch: f, tokenGoogle: async () => "tok" });

  const { url, init } = f.chamadas[0];
  assert.equal(url.origin + url.pathname, "https://www.googleapis.com/calendar/v3/calendars/primary/events");
  assert.equal(url.searchParams.get("timeMin"), "2026-09-26T12:55:00.000Z");
  assert.equal(url.searchParams.get("timeMax"), "2026-09-26T13:02:00.000Z");
  assert.equal(url.searchParams.get("singleEvents"), "true");
  assert.equal(url.searchParams.get("orderBy"), "startTime");
  assert.equal(init.headers.Authorization, "Bearer tok");

  assert.equal(fireflies.chamadas.length, 3, "no máximo 3 por vez");
  assert.deepEqual(fireflies.chamadas[0], ["aoVivo", { link: "https://meet.google.com/e1-aaaa-bbb", titulo: "Evento e1", duracao: null }]);
  assert.deepEqual(r.enviados, ["Evento e1", "Evento e3"]);
  assert.equal(r.falhas.length, 1);
  assert.match(r.falhas[0].erro, /Too many requests/);
  assert.equal(r.ignorados, 1);
  assert.equal(banco.convites.length, 3);
  assert.deepEqual(banco.convites[0], { evento_id: "e1", inicio: "2026-09-26T13:00:00.000Z", link_meet: "https://meet.google.com/e1-aaaa-bbb", titulo: "Evento e1", ok: true, erro: null });
  assert.equal(banco.convites[1].ok, false);

  assert.match(banco.convites[1].erro, /^\[temporário\]/);

  // No minuto seguinte: o que ainda não foi (e4) e o que falhou por um motivo passageiro (e2); os ok não repetem
  const r2 = await enviarRoboAgenda({ agora: new Date(AGORA.getTime() + 60e3) }, { fireflies, banco, fetch: fetchAgenda(itens), tokenGoogle: async () => "tok" });
  assert.deepEqual(fireflies.chamadas.slice(3).map((c) => c[1].titulo), ["Evento e2", "Evento e4"]);
  assert.deepEqual(r2.enviados, ["Evento e4"]);
  assert.equal(banco.convites.length, 4, "a nova tentativa de e2 atualiza o mesmo registro");
});

test("eventosParaRobo: duração = fim − início + 10 min de folga", () => {
  const [a, b] = eventosParaRobo([
    ev("a", "2026-09-26T10:00:00-03:00", { end: { dateTime: "2026-09-26T10:45:00-03:00" } }),
    ev("b", "2026-09-26T10:00:00-03:00", { end: { dateTime: "2026-09-26T09:00:00-03:00" } }),
  ], AGORA);
  assert.equal(a.duracao, 55);
  assert.equal(b.duracao, null, "fim antes do início: deixa o padrão do Fireflies");
});

test("enviarRoboAgenda: recusa definitiva do Fireflies fica registrada e não repete", async () => {
  const itens = [ev("d1", "2026-09-26T10:00:00-03:00")];
  const banco = fakeBanco();
  const fireflies = fakeFireflies();
  fireflies.adicionarAoVivo = async (p) => { fireflies.chamadas.push(["aoVivo", p]); throw new ErroFireflies("Fireflies: invalid meeting link", { codigo: "invalid_arguments" }); };
  await enviarRoboAgenda({ agora: AGORA }, { fireflies, banco, fetch: fetchAgenda(itens), tokenGoogle: async () => "tok" });
  assert.equal(banco.convites[0].ok, false);
  assert.doesNotMatch(banco.convites[0].erro, /temporário/);
  await enviarRoboAgenda({ agora: new Date(AGORA.getTime() + 60e3) }, { fireflies, banco, fetch: fetchAgenda(itens), tokenGoogle: async () => "tok" });
  assert.equal(fireflies.chamadas.length, 1);
});

test("enviarRoboAgenda sem eventos não consulta o banco nem o Fireflies", async () => {
  const banco = fakeBanco();
  banco.convitesJaEnviados = async () => { throw new Error("não devia consultar"); };
  const fireflies = fakeFireflies();
  const r = await enviarRoboAgenda({ agora: AGORA }, { fireflies, banco, fetch: fetchAgenda([]), tokenGoogle: async () => "tok" });
  assert.deepEqual(r, { ok: true, enviados: [], falhas: [], ignorados: 0 });
  assert.equal(fireflies.chamadas.length, 0);
});

test("enviarRoboAgenda: 401 do Google esquece o token e lança", async () => {
  let esqueceu = false;
  await assert.rejects(
    () => enviarRoboAgenda({ agora: AGORA }, { fireflies: fakeFireflies(), banco: fakeBanco(), fetch: fetchAgenda([], 401), tokenGoogle: async () => "velho", esquecerTokenGoogle: () => { esqueceu = true; } }),
    /Google Agenda respondeu 401: Invalid Credentials/,
  );
  assert.equal(esqueceu, true);
});

// ---------------------------------------------------------------- Webhook

const assinar = (corpo, segredo) => createHmac("sha256", segredo).update(corpo, "utf8").digest("hex");

test("verificarAssinatura: HMAC SHA-256 hex do corpo cru, com ou sem 'sha256='", () => {
  const corpo = '{"event":"meeting.transcribed","timestamp":1710876543210,"meeting_id":"ASxwZxCstx"}';
  const hex = assinar(corpo, "segredo");
  assert.equal(verificarAssinatura(corpo, hex, "segredo"), true);
  assert.equal(verificarAssinatura(corpo, `sha256=${hex}`, "segredo"), true);
  assert.equal(verificarAssinatura(corpo, `sha256=${hex.toUpperCase()}`, "segredo"), true);
  assert.equal(verificarAssinatura(corpo, `sha256=${hex}`, "outro"), false);
  assert.equal(verificarAssinatura(`${corpo} `, `sha256=${hex}`, "segredo"), false, "corpo reserializado não confere");
  assert.equal(verificarAssinatura(corpo, hex.slice(0, 20), "segredo"), false);
  assert.equal(verificarAssinatura(corpo, "sha256=zz", "segredo"), false);
  assert.equal(verificarAssinatura(corpo, undefined, "segredo"), false);
  assert.equal(verificarAssinatura(corpo, hex, null), false);
  assert.equal(verificarAssinatura(undefined, hex, "segredo"), false);
});

test("interpretarWebhook: V2 transcribed/summarized importam, bot_joined é ignorado, legado importa", () => {
  assert.deepEqual(interpretarWebhook({ event: "meeting.transcribed", timestamp: 1, meeting_id: "A1" }), { id: "A1", evento: "meeting.transcribed" });
  assert.deepEqual(interpretarWebhook({ event: "meeting.summarized", timestamp: 1, meeting_id: "A1" }), { id: "A1", evento: "meeting.summarized" });
  assert.equal(interpretarWebhook({ event: "meeting.bot_joined", timestamp: 1, meeting_id: "A1" }).ignorar, true);
  assert.equal(interpretarWebhook({ event: "meeting.algo_novo", meeting_id: "A1" }).ignorar, true);
  // Corpo real do botão "Send Test Event" (capturado no n8n)
  assert.deepEqual(interpretarWebhook({ event: "test", timestamp: 1790393582337, meeting_id: "test_00000000" }), { ignorar: true, evento: "test", motivo: "evento test" });
  assert.deepEqual(interpretarWebhook({ meetingId: "L1", eventType: "Transcription completed", clientReferenceId: "x" }), { id: "L1", evento: "Transcription completed" });
  assert.equal(interpretarWebhook({ meetingId: "L1" }).ignorar, true, "legado só com eventType Transcription completed");
  assert.equal(interpretarWebhook({ meetingId: "L1", eventType: "Outro" }).ignorar, true);
  assert.equal(interpretarWebhook({ event: "meeting.transcribed" }).ignorar, true, "sem meeting_id");
  assert.equal(interpretarWebhook(null).ignorar, true);
});

test("verificarAssinatura com o corpo real do teste do Fireflies (sha256=<64 hex>)", () => {
  const cru = '{"event":"test","timestamp":1790393582337,"meeting_id":"test_00000000"}';
  const header = `sha256=${assinar(cru, "segredo-de-teste")}`;
  assert.match(header, /^sha256=[0-9a-f]{64}$/);
  assert.equal(verificarAssinatura(cru, header, "segredo-de-teste"), true);
  assert.equal(verificarAssinatura(JSON.stringify(JSON.parse(cru), null, 1), header, "segredo-de-teste"), false);
});

test("criarRotinasFireflies liga cada rotina às dependências", async () => {
  const banco = fakeBanco();
  const lista = listaDe(1);
  const deps = { fireflies: fakeFireflies({ lista, transcricoes: { t0: { ...TRANSCRICAO, id: "t0" } } }), banco, documentos, estado: { historicoCompleto: false }, log: semLog, fetch: fetchAgenda([]), tokenGoogle: async () => "tok" };
  const rotinas = criarRotinasFireflies(deps);
  assert.equal((await rotinas.sincronizar({ limite: 5 })).importados, 1);
  assert.equal((await rotinas.importar("t0")).ok, true);
  assert.equal((await rotinas.pendencias()).ok, true);
  assert.equal((await rotinas.agenda()).ok, true);
});
