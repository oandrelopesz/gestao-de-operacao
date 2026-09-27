import test from "node:test";
import assert from "node:assert/strict";
import {
  FORMULARIOS, ORDEM_BOTOES, abaInicial, caminhoUnico, contarPorFormulario, ehFormularioId, entradaDoZip,
  formatarDataHora, formatosDeDownload, idDeLinkDoGoogle, lerNomeBriefing, linkNoGoogle, modoDoItem, nomeDoDownload,
  nomeDoProduto, nomeSeguro, normalizarNome, novosNaLista, ordenarItens, rotuloDoItem, visivel,
  MIME_DOC, MIME_PASTA, MIME_PLANILHA, type AvisoFormulario, type ItemDrive,
} from "./dadosInternos.ts";

const item = (p: Partial<ItemDrive> & { id: string; name: string }): ItemDrive => ({
  mimeType: "text/plain", createdTime: "2026-09-27T12:00:00Z", modifiedTime: "2026-09-27T12:00:00Z", ...p,
});
const aviso = (p: Partial<AvisoFormulario> & { id: string }): AvisoFormulario => ({
  formulario: "negocios", chave: `negocios:${p.id}`, titulo: "", drive_id: null, recebido_em: "2026-09-27T12:00:00Z", visto_em: null, ...p,
});

test("formulários: ordem das sub-abas, dos botões e ids", () => {
  assert.deepEqual(FORMULARIOS.map((f) => f.aba), ["Dados para contrato", "Briefing – Negócios", "Briefing – Estratégia", "Catálogos – E-Commerce"]);
  assert.deepEqual(ORDEM_BOTOES, ["contrato", "estrategia", "negocios", "catalogo"]);
  assert.equal(FORMULARIOS.find((f) => f.id === "catalogo")?.pastaId, "1oLF5CdjoFhHotF9JYbykqiumUUy82fKm");
  assert.equal(ehFormularioId("negocios"), true);
  assert.equal(ehFormularioId("outro"), false);
});

test("pastas de controle do catálogo ficam escondidas", () => {
  assert.equal(visivel({ name: "_rascunhos", mimeType: MIME_PASTA }), false);
  assert.equal(visivel({ name: "_teste", mimeType: MIME_PASTA }), false);
  assert.equal(visivel({ name: "_teste", mimeType: "text/plain" }), true);
  assert.equal(visivel({ name: "Loja - Ana", mimeType: MIME_PASTA }), true);
});

test("ordem: planilhas, pastas (modificação mais recente) e arquivos (mais novo primeiro)", () => {
  const r = ordenarItens([
    item({ id: "a1", name: "velho.txt", createdTime: "2026-07-01T00:00:00Z" }),
    item({ id: "p1", name: "Loja A", mimeType: MIME_PASTA, modifiedTime: "2026-08-01T00:00:00Z" }),
    item({ id: "s1", name: "Respostas", mimeType: MIME_PLANILHA }),
    item({ id: "a2", name: "novo.txt", createdTime: "2026-09-01T00:00:00Z" }),
    item({ id: "p2", name: "Loja B", mimeType: MIME_PASTA, modifiedTime: "2026-09-10T00:00:00Z" }),
  ]);
  assert.deepEqual(r.map((i) => i.id), ["s1", "p2", "p1", "a2", "a1"]);
});

test("nome do briefing: título e horário de Brasília; fora do padrão usa o nome inteiro", () => {
  const b = lerNomeBriefing("JAO BOEIRA - 2026-08-25 15-26-20.txt");
  assert.equal(b.titulo, "JAO BOEIRA");
  assert.equal(b.data?.toISOString(), "2026-08-25T18:26:20.000Z");
  assert.equal(formatarDataHora(b.data!), "25/08/2026 15:26");
  const nea = lerNomeBriefing("NEA - Cardio - 2026-07-19 17-22-47.txt");
  assert.equal(nea.titulo, "NEA - Cardio");
  assert.deepEqual(lerNomeBriefing("Instituto Hoeckele (1).txt"), { titulo: "Instituto Hoeckele (1)", data: null });
});

test("rótulo do item: briefing usa o nome do arquivo; outros, nome e data do Drive", () => {
  const txt = item({ id: "t", name: "SEDALLE - 2026-07-06 20-02-43.txt" });
  assert.equal(rotuloDoItem(txt, "negocios").titulo, "SEDALLE");
  assert.equal(formatarDataHora(rotuloDoItem(txt, "negocios").data), "06/07/2026 20:02");
  const doc = item({ id: "d", name: "2026-09-27 — Clínica — Maria", mimeType: MIME_DOC, createdTime: "2026-09-27T15:00:00Z" });
  assert.deepEqual(rotuloDoItem(doc, "contrato"), { titulo: "2026-09-27 — Clínica — Maria", data: new Date("2026-09-27T15:00:00Z") });
});

test("normalizarNome ignora acento, caixa e símbolos", () => {
  assert.equal(normalizarNome("  Clínica Garoñe / Ltda. "), "clinica garone ltda");
});

test("selo Novo: contrato e catálogo pelo id do Drive", () => {
  const itens = [item({ id: "doc1", name: "x", mimeType: MIME_DOC }), item({ id: "doc2", name: "y", mimeType: MIME_DOC })];
  const r = novosNaLista(itens, [
    aviso({ id: "a1", formulario: "contrato", drive_id: "doc2" }),
    aviso({ id: "a2", formulario: "contrato", drive_id: "fora-da-lista" }),
    aviso({ id: "a3", formulario: "contrato", drive_id: "doc1", visto_em: "2026-09-27T13:00:00Z" }),
  ]);
  assert.deepEqual([...r.entries()], [["doc2", ["a1"]]]);
});

test("selo Novo: briefing pelo nome (acento/símbolo) dentro da janela; senão o mais recente da janela", () => {
  const itens = [
    item({ id: "t1", name: "Clínica Garone - 2026-09-27 08-58-00.txt", createdTime: "2026-09-27T11:58:00Z" }),
    item({ id: "t2", name: "Outra - 2026-09-27 08-59-00.txt", createdTime: "2026-09-27T11:59:00Z" }),
    item({ id: "t3", name: "Antiga - 2026-07-01 10-00-00.txt", createdTime: "2026-07-01T13:00:00Z" }),
  ];
  assert.deepEqual([...novosNaLista(itens, [aviso({ id: "a1", titulo: "Clinica Garone" })])], [["t1", ["a1"]]]);
  assert.deepEqual([...novosNaLista(itens, [aviso({ id: "a2", titulo: "Nome que mudou" })])], [["t2", ["a2"]]]);
  assert.deepEqual([...novosNaLista(itens, [aviso({ id: "a3", titulo: "X", recebido_em: "2026-09-20T12:00:00Z" })])], []);
  // 2 min depois do aviso ainda vale; 16 min antes, não
  assert.deepEqual([...novosNaLista([item({ id: "t4", name: "A - 2026-09-27 09-01-00.txt", createdTime: "2026-09-27T12:01:30Z" })], [aviso({ id: "a4", titulo: "A" })])], [["t4", ["a4"]]]);
  assert.deepEqual([...novosNaLista([item({ id: "t5", name: "A - 2026-09-27 08-44-00.txt", createdTime: "2026-09-27T11:44:00Z" })], [aviso({ id: "a5", titulo: "A" })])], []);
});

test("selo Novo: aviso sem drive_id fora do briefing não marca nada (ex.: contrato:teste-autorizacao)", () => {
  const itens = [item({ id: "d1", name: "Cliente - Contrato.pdf", mimeType: "application/pdf" })];
  const avisos = [aviso({ id: "a1", formulario: "contrato", chave: "contrato:teste-autorizacao", titulo: "Cliente" })];
  assert.deepEqual([...novosNaLista(itens, avisos)], []);
});

test("selo Novo: briefing ignora arquivo sem extensão .txt dentro da janela", () => {
  const itens = [item({ id: "d1", name: "Foto.png", mimeType: "image/png" })];
  const avisos = [aviso({ id: "a1", titulo: "Foto" })];
  assert.deepEqual([...novosNaLista(itens, avisos)], []);
});

test("aba inicial: primeira com novidade (ordem das sub-abas), senão a última usada, senão a primeira", () => {
  assert.equal(abaInicial([aviso({ id: "1", formulario: "catalogo" }), aviso({ id: "2", formulario: "negocios" })], "contrato"), "negocios");
  assert.equal(abaInicial([], "estrategia"), "estrategia");
  assert.equal(abaInicial([], null), "contrato");
  assert.deepEqual(contarPorFormulario([aviso({ id: "1" }), aviso({ id: "2" }), aviso({ id: "3", formulario: "catalogo" })]), { contrato: 0, negocios: 2, estrategia: 0, catalogo: 1 });
});

test("modo de visualização", () => {
  assert.equal(modoDoItem({ name: "A - 2026-09-27 08-58-00.txt", mimeType: "text/plain" }, "estrategia"), "briefing");
  assert.equal(modoDoItem({ name: "notas.txt", mimeType: "text/plain" }, "catalogo"), "texto");
  assert.equal(modoDoItem({ name: "grande.txt", mimeType: "text/plain", size: String(3 * 1024 * 1024) }, "negocios"), "nenhum");
  assert.equal(modoDoItem({ name: "Contrato", mimeType: MIME_DOC }, "contrato"), "doc");
  assert.equal(modoDoItem({ name: "Catálogo - Loja", mimeType: MIME_PLANILHA }, "catalogo"), "planilha");
  assert.equal(modoDoItem({ name: "Caneca.png", mimeType: "image/png" }, "catalogo"), "imagem");
  assert.equal(modoDoItem({ name: "rg.pdf", mimeType: "application/pdf" }, "contrato"), "pdf");
  assert.equal(modoDoItem({ name: "proposta.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }, "contrato"), "nenhum");
});

test("formatos de download e nomes", () => {
  assert.deepEqual(formatosDeDownload("image/jpeg").map((f) => f.rotulo), ["Original"]);
  assert.deepEqual(formatosDeDownload(MIME_DOC).map((f) => f.extensao), ["docx", "pdf"]);
  assert.deepEqual(formatosDeDownload(MIME_PLANILHA).map((f) => f.extensao), ["xlsx", "csv"]);
  assert.deepEqual(formatosDeDownload("application/vnd.google-apps.form"), []);
  assert.equal(nomeDoDownload("2026-09-27 — Clínica / Filial — Maria", formatosDeDownload(MIME_DOC)[0]), "2026-09-27 — Clínica - Filial — Maria.docx");
  assert.equal(nomeDoDownload("Caneca.png", formatosDeDownload("image/png")[0]), "Caneca.png");
  assert.equal(nomeSeguro('a:b*c?"d<e>f|g.'), "a-b-c--d-e-f-g");
  assert.equal(nomeSeguro("   "), "sem nome");
});

test("links do Google na conta contato@ e id a partir de link", () => {
  assert.equal(linkNoGoogle({ id: "abc", mimeType: MIME_PASTA }), "https://drive.google.com/drive/folders/abc?authuser=contato%40andrelopes.digital");
  assert.equal(linkNoGoogle({ id: "abc", mimeType: MIME_DOC }), "https://docs.google.com/document/d/abc/edit?authuser=contato%40andrelopes.digital");
  assert.equal(linkNoGoogle({ id: "abc", mimeType: MIME_PLANILHA }), "https://docs.google.com/spreadsheets/d/abc/edit?authuser=contato%40andrelopes.digital");
  assert.equal(linkNoGoogle({ id: "abc", mimeType: "image/png" }), "https://drive.google.com/file/d/abc/view?authuser=contato%40andrelopes.digital");
  assert.equal(idDeLinkDoGoogle("https://docs.google.com/document/d/1AbCdEfGhIjK_lm-no/edit"), "1AbCdEfGhIjK_lm-no");
  assert.equal(idDeLinkDoGoogle("https://exemplo.com/document/d/1AbCdEfGhIjK/edit"), null);
});

test("caminhos do .zip: pastas, repetidos, Doc/Planilha convertidos e tipos sem conversão fora", () => {
  const usados = new Set<string>();
  assert.equal(caminhoUnico("Loja/Fotos/a.jpg", usados), "Loja/Fotos/a.jpg");
  assert.equal(caminhoUnico("Loja/Fotos/A.jpg", usados), "Loja/Fotos/A (2).jpg");
  assert.equal(caminhoUnico("Loja/Fotos/a.jpg", usados), "Loja/Fotos/a (3).jpg");
  assert.deepEqual(entradaDoZip("Loja/", { name: "Catálogo - Loja", mimeType: MIME_PLANILHA }, usados)?.caminho, "Loja/Catálogo - Loja.xlsx");
  assert.equal(entradaDoZip("Loja/", { name: "Formulário", mimeType: "application/vnd.google-apps.form" }, usados), null);
  assert.equal(nomeDoProduto("Camiseta - 01.jpg"), "Camiseta");
  assert.equal(nomeDoProduto("Caneca.png"), "Caneca");
  assert.equal(nomeDoProduto("Kit - Verão - 12.webp"), "Kit - Verão");
});
