import test from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import {
  blocosDeFala, gerarDocx, gerarPdf, htmlResumo, htmlTranscricao, linhasDoTexto, metaDaReuniao, nomeDaReuniao,
  participantesDa, secoesDoResumo, tempoFala,
} from "../src/fireflies/documentos.js";

// 25/09/2026 17:00 UTC = 14:00 em Brasília
const REUNIAO = {
  id: "ABC123",
  title: "Alinhamento <Cliente> & time",
  date: Date.UTC(2026, 8, 25, 17, 0),
  duration: 45.4,
  organizer_email: "contato@andrelopes.digital",
  participants: ["Maria@Cliente.com, joao@cliente.com", "maria@cliente.com"],
  meeting_attendees: [{ displayName: "Ana", email: "ana@x.com" }, { displayName: "Sem e-mail", email: null }],
  meeting_link: "https://meet.google.com/abc-defg-hij",
  summary: {
    short_summary: "Definimos a campanha de outubro.",
    overview: "- Orçamento aprovado\n- Criativos novos",
    shorthand_bullet: "🚀 **Campanha** (00:00 - 10:00)\n  - Verba de R$ 5 mil\n\n📊 **Métricas**\n- ROAS acima de 3",
    outline: "Abertura (00:00)\nCriativos (05:10)",
    action_items: "**André Lopes**\nEnviar a proposta (12:30)\nMontar o painel (20:00)\n\n**Maria**\nAprovar os criativos (30:00)",
    keywords: ["ROAS", "CTR", "ROAS"],
  },
  sentences: [
    { speaker_name: "André Lopes", text: "Bom dia a todos.", start_time: "5.2", end_time: "6.1" },
    { speaker_name: "André Lopes", text: "Vamos começar?", start_time: 7, end_time: 8 },
    { speaker_name: "Maria", text: "Vamos <sim>.", start_time: 65, end_time: 66 },
    { speaker_name: "André Lopes", text: "Perfeito.", start_time: 3725, end_time: 3726 },
  ],
};

/** Lê um arquivo de dentro de um .zip (o .docx é um zip) sem dependência: diretório central + inflate. */
function arquivoDoZip(buf, nome) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  assert.ok(eocd >= 0, "não é zip");
  let p = buf.readUInt32LE(eocd + 16);
  const total = buf.readUInt16LE(eocd + 10);
  for (let i = 0; i < total; i++) {
    const metodo = buf.readUInt16LE(p + 10);
    const tamanho = buf.readUInt32LE(p + 20);
    const n = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comentario = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const atual = buf.toString("utf8", p + 46, p + 46 + n);
    if (atual === nome) {
      const inicio = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const dados = buf.subarray(inicio, inicio + tamanho);
      return (metodo === 8 ? inflateRawSync(dados) : dados).toString("utf8");
    }
    p += 46 + n + extra + comentario;
  }
  throw new Error(`${nome} não está no zip`);
}

/** Texto corrido do document.xml (junta os <w:t>). */
const textoDoDocx = (xml) => [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");

test("nomeDaReuniao usa o horário de Brasília", () => {
  assert.equal(nomeDaReuniao(REUNIAO), "Alinhamento <Cliente> & time — 25/09/2026 14:00");
  assert.equal(nomeDaReuniao({ title: "Madrugada", date: Date.UTC(2026, 0, 1, 2, 5) }), "Madrugada — 31/12/2025 23:05");
  assert.equal(nomeDaReuniao({ title: "  " }), "Reunião sem título");
  assert.equal(nomeDaReuniao({ title: "Pelo texto", dateString: "2026-09-25T17:00:00.000Z" }), "Pelo texto — 25/09/2026 14:00");
});

test("participantesDa junta participants e attendees sem repetir", () => {
  assert.deepEqual(participantesDa(REUNIAO), ["maria@cliente.com", "joao@cliente.com", "ana@x.com"]);
  assert.deepEqual(participantesDa({}), []);
});

test("metaDaReuniao: data, início–fim, duração e link; sem e-mails mostra os falantes", () => {
  const m = metaDaReuniao(REUNIAO);
  assert.equal(m.data, "25/09/2026");
  assert.equal(m.horario, "14:00–14:45");
  assert.equal(m.duracao, "45 min");
  assert.equal(m.link, "https://app.fireflies.ai/view/ABC123");
  assert.equal(m.rotuloPessoas, "Participantes");
  const semEmail = metaDaReuniao({ ...REUNIAO, participants: [], meeting_attendees: [], duration: 80 });
  assert.equal(semEmail.rotuloPessoas, "Falantes");
  assert.deepEqual(semEmail.pessoas, ["André Lopes", "Maria"]);
  assert.equal(semEmail.duracao, "1 h 20 min");
});

test("tempoFala: mm:ss e h:mm:ss", () => {
  assert.equal(tempoFala("5.9"), "00:05");
  assert.equal(tempoFala(65), "01:05");
  assert.equal(tempoFala(3725), "1:02:05");
  assert.equal(tempoFala(undefined), "00:00");
});

test("blocosDeFala junta frases seguidas do mesmo falante com o tempo da primeira", () => {
  assert.deepEqual(blocosDeFala(REUNIAO), [
    { tempo: "00:05", falante: "André Lopes", texto: "Bom dia a todos. Vamos começar?" },
    { tempo: "01:05", falante: "Maria", texto: "Vamos <sim>." },
    { tempo: "1:02:05", falante: "André Lopes", texto: "Perfeito." },
  ]);
});

test("linhasDoTexto: tópicos, recuo, negrito e linha em branco", () => {
  const linhas = linhasDoTexto("**Título**\n- item um\n  - sub\n\n# Seção\ntexto **forte** fim");
  assert.deepEqual(linhas, [
    { item: false, nivel: 0, partes: [{ texto: "Título", negrito: true }] },
    { item: true, nivel: 0, partes: [{ texto: "item um", negrito: false }] },
    { item: true, nivel: 1, partes: [{ texto: "sub", negrito: false }] },
    { vazio: true },
    { item: false, nivel: 0, partes: [{ texto: "Seção", negrito: true }] },
    { item: false, nivel: 0, partes: [{ texto: "texto ", negrito: false }, { texto: "forte", negrito: true }, { texto: " fim", negrito: false }] },
  ]);
});

test("secoesDoResumo: seções com conteúdo, na ordem, e aviso quando não há resumo", () => {
  assert.deepEqual(secoesDoResumo(REUNIAO).map((s) => s.titulo), ["Resumo", "Visão geral", "Tópicos", "Linha do tempo", "Itens de ação", "Palavras-chave"]);
  const chaves = secoesDoResumo(REUNIAO).at(-1).linhas[0].partes[0].texto;
  assert.equal(chaves, "ROAS, CTR");
  const vazio = secoesDoResumo({ summary: null });
  assert.equal(vazio.length, 1);
  assert.match(vazio[0].linhas[0].partes[0].texto, /não gerou resumo/);
  assert.equal(secoesDoResumo({ summary: { keywords: "a, b\nc" } })[0].linhas[0].partes[0].texto, "a, b, c");
});

test("htmlTranscricao: cabeçalho completo, falas agrupadas e texto escapado", () => {
  const html = htmlTranscricao(REUNIAO);
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<style>/);
  assert.match(html, /<h1>Alinhamento &lt;Cliente&gt; &amp; time<\/h1>/);
  assert.match(html, /<title>Alinhamento &lt;Cliente&gt; &amp; time — 25\/09\/2026 14:00 — Transcrição<\/title>/);
  assert.match(html, /<dt>Horário<\/dt><dd>14:00–14:45<\/dd>/);
  assert.match(html, /<dt>Participantes<\/dt><dd>maria@cliente\.com, joao@cliente\.com, ana@x\.com<\/dd>/);
  assert.match(html, /href="https:\/\/app\.fireflies\.ai\/view\/ABC123"/);
  assert.match(html, /\[00:05\]<\/span> <span class="falante">André Lopes:<\/span> Bom dia a todos\. Vamos começar\?/);
  assert.match(html, /Vamos &lt;sim&gt;\./);
  assert.ok(!html.includes("<sim>"));
  assert.match(htmlTranscricao({ id: "x", title: "Vazia" }), /não registrou falas/);
});

test("htmlResumo: seções, negrito, tópicos e itens de ação por pessoa", () => {
  const html = htmlResumo(REUNIAO);
  assert.match(html, /<p class="tipo">Resumo<\/p>/);
  assert.match(html, /<h2>Tópicos<\/h2>\n<p>🚀 <strong>Campanha<\/strong> \(00:00 - 10:00\)<\/p>\n<ul>\n<li class="n1">Verba de R\$ 5 mil<\/li>/);
  assert.match(html, /<h2>Itens de ação<\/h2>\n<p><strong>André Lopes<\/strong><\/p>\n<p>Enviar a proposta \(12:30\)<\/p>/);
  assert.match(html, /<h2>Palavras-chave<\/h2>\n<p>ROAS, CTR<\/p>/);
});

test("gerarPdf: A4 no /usr/bin/chromium sem sandbox, e fecha o navegador", async () => {
  const chamadas = {};
  const chromium = {
    launch: async (op) => {
      chamadas.launch = op;
      return {
        newPage: async () => ({
          setContent: async (html) => { chamadas.html = html; },
          pdf: async (op2) => { chamadas.pdf = op2; return new Uint8Array([37, 80, 68, 70]); },
        }),
        close: async () => { chamadas.fechou = true; },
      };
    },
  };
  const buf = await gerarPdf("<p>oi</p>", { chromium });
  assert.ok(Buffer.isBuffer(buf));
  assert.equal(buf.toString(), "%PDF");
  assert.equal(chamadas.launch.executablePath, "/usr/bin/chromium");
  assert.ok(chamadas.launch.args.includes("--no-sandbox"));
  assert.equal(chamadas.html, "<p>oi</p>");
  assert.equal(chamadas.pdf.format, "A4");
  assert.equal(chamadas.pdf.printBackground, true);
  assert.ok(chamadas.pdf.margin.top);
  assert.equal(chamadas.fechou, true);
});

test("gerarPdf fecha o navegador mesmo quando falha", async () => {
  let fechou = false;
  const chromium = {
    launch: async () => ({
      newPage: async () => ({ setContent: async () => { throw new Error("travou"); }, pdf: async () => null }),
      close: async () => { fechou = true; },
    }),
  };
  await assert.rejects(() => gerarPdf("<p>x</p>", { chromium }), /travou/);
  assert.equal(fechou, true);
});

test("gerarDocx da transcrição: título, cabeçalho e falas", async () => {
  const buf = await gerarDocx(REUNIAO, "transcricao");
  assert.equal(buf.subarray(0, 2).toString(), "PK");
  const xml = arquivoDoZip(buf, "word/document.xml");
  assert.match(xml, /w:val="Heading1"/);
  const texto = textoDoDocx(xml);
  assert.match(texto, /TRANSCRIÇÃO/);
  assert.match(texto, /Alinhamento &lt;Cliente&gt; &amp; time/);
  assert.match(texto, /Data: 25\/09\/2026/);
  assert.match(texto, /Horário: 14:00–14:45/);
  assert.match(texto, /\[00:05\] André Lopes: Bom dia a todos\. Vamos começar\?/);
  assert.match(texto, /\[1:02:05\] André Lopes: Perfeito\./);
  const rels = arquivoDoZip(buf, "word/_rels/document.xml.rels");
  assert.match(rels, /https:\/\/app\.fireflies\.ai\/view\/ABC123/);
  const core = arquivoDoZip(buf, "docProps/core.xml");
  assert.match(core, /25\/09\/2026 14:00 — Transcrição/);
});

test("gerarDocx do resumo: seções como Heading2, tópicos com marcador e negrito", async () => {
  const buf = await gerarDocx(REUNIAO, "resumo");
  const xml = arquivoDoZip(buf, "word/document.xml");
  assert.match(xml, /w:val="Heading2"/);
  assert.match(xml, /<w:numPr>/, "tópicos viram lista com marcador");
  assert.match(xml, /<w:b\/>|<w:b w:val="true"\/>|<w:b w:val="1"\/>/);
  const texto = textoDoDocx(xml);
  for (const trecho of ["Resumo", "Definimos a campanha de outubro.", "Itens de ação", "André Lopes", "Enviar a proposta (12:30)", "Palavras-chave", "ROAS, CTR", "Verba de R$ 5 mil"]) {
    assert.ok(texto.includes(trecho), `faltou "${trecho}"`);
  }
});

test("gerarDocx recusa tipo desconhecido e aguenta caractere de controle", async () => {
  await assert.rejects(() => gerarDocx(REUNIAO, "ata"), /Tipo de documento desconhecido/);
  const buf = await gerarDocx({ id: "x", title: "Com\u0001controle", sentences: [{ speaker_name: "A", text: "oi\u0007", start_time: 1 }] }, "transcricao");
  const xml = arquivoDoZip(buf, "word/document.xml");
  assert.ok(!/[\u0001\u0007]/.test(xml));
});
