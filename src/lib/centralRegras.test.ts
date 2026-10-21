import test from "node:test";
import assert from "node:assert/strict";
import {
  EXT_IMAGEM,
  EXT_LOGO,
  TAMANHO_MAX,
  arquivosDaPasta,
  caminhoCentral,
  conteudoDaPasta,
  ehLixo,
  entradasDoZip,
  pastaDoCaminho,
  pastaLimpa,
  renomeado,
  separarExtensao,
  carimbo,
  contarPorCliente,
  dataDoCaminho,
  extensao,
  motivoRecusa,
  nomeLimpo,
  nomeOriginal,
  tipoArquivo,
} from "./centralRegras.ts";

test("listas de formatos e limite de tamanho", () => {
  assert.deepEqual([...EXT_IMAGEM], ["jpg", "jpeg", "png", "webp", "gif", "svg", "avif", "heic", "heif"]);
  assert.deepEqual([...EXT_LOGO], ["ai", "eps", "pdf", "psd", "cdr"]);
  assert.equal(TAMANHO_MAX, 100 * 1024 * 1024);
});

test("extensao pega o que vem depois do último ponto, minúsculo", () => {
  assert.equal(extensao("Foto.PNG"), "png");
  assert.equal(extensao("a.b.Jpeg"), "jpeg");
  assert.equal(extensao("semponto"), "");
});

test("tipoArquivo classifica imagem, logo e outro", () => {
  assert.equal(tipoArquivo("foto.PNG"), "imagem");
  assert.equal(tipoArquivo("logo.ai"), "logo");
  assert.equal(tipoArquivo("logo.PSD"), "logo");
  assert.equal(tipoArquivo("doc.docx"), "outro");
  assert.equal(tipoArquivo("semextensao"), "outro");
});

test("motivoRecusa: qualquer formato entra, só o tamanho recusa", () => {
  assert.equal(motivoRecusa("a.docx", 10), null);
  assert.equal(motivoRecusa("semextensao", 10), null);
  assert.equal(motivoRecusa("grande.png", TAMANHO_MAX + 1), "grande.png: passa de 100 MB.");
  assert.equal(motivoRecusa("limite.png", TAMANHO_MAX), null);
  assert.equal(motivoRecusa("ok.svg", 1234), null);
});

test("carimbo usa o horário de Brasília", () => {
  assert.equal(carimbo(new Date("2026-10-12T13:05:09Z")), "20261012-100509");
  assert.equal(carimbo(new Date("2026-01-01T02:30:00Z")), "20251231-233000");
});

test("nomeLimpo troca barra e controle, tira as pontas e corta nome longo", () => {
  assert.equal(nomeLimpo("a/b\\c.png"), "a-b-c.png");
  assert.equal(nomeLimpo("a\u0001b\u007fc.png"), "a-b-c.png");
  assert.equal(nomeLimpo("  Logo Final.png  "), "Logo Final.png");
  assert.equal(nomeLimpo("   "), "arquivo");
  assert.equal(nomeLimpo(""), "arquivo");
  const longo = "x".repeat(200) + ".png";
  const limpo = nomeLimpo(longo);
  assert.equal(limpo.length, 150);
  assert.ok(limpo.endsWith(".png"));
});

test("caminhoCentral e nomeOriginal: ida e volta", () => {
  const caminho = caminhoCentral("c1", "Logo Final.png", new Date("2026-10-12T13:05:09Z"));
  assert.equal(caminho, "c1/20261012-100509-Logo Final.png");
  assert.equal(nomeOriginal(caminho), "Logo Final.png");
});

test("nomeOriginal sem prefixo de data devolve a parte depois da barra", () => {
  assert.equal(nomeOriginal("c1/Sem data.png"), "Sem data.png");
  assert.equal(nomeOriginal("c1/20261012-100509-Logo.png"), "Logo.png");
});

test("dataDoCaminho lê o carimbo em horário de Brasília ou devolve null", () => {
  const d = dataDoCaminho("c1/20261012-100509-Logo.png");
  assert.ok(d instanceof Date);
  assert.equal(d.toISOString(), "2026-10-12T13:05:09.000Z");
  assert.equal(dataDoCaminho("c1/Sem data.png"), null);
  assert.equal(dataDoCaminho("semBarra.png"), null);
  assert.equal(dataDoCaminho("c1/20261399-999999-x.png"), null);
});

test("contarPorCliente conta pela pasta e ignora caminho sem barra", () => {
  assert.deepEqual(
    contarPorCliente(["c1/a.png", "c1/b.png", "c2/c.pdf", "solto.png"]),
    { c1: 2, c2: 1 },
  );
  assert.deepEqual(contarPorCliente([]), {});
});

test("arquivosDaPasta filtra a pasta e ordena do mais novo para o mais antigo", () => {
  const lista = [
    "c1/20261010-100000-a.png",
    "c2/20261012-100000-z.png",
    "c1/20261012-100000-b.png",
    "c10/20261011-100000-x.png",
  ];
  assert.deepEqual(arquivosDaPasta(lista, "c1"), [
    "c1/20261012-100000-b.png",
    "c1/20261010-100000-a.png",
  ]);
  assert.deepEqual(arquivosDaPasta(lista, "naoexiste"), []);
});

const AGORA = new Date("2026-10-12T13:05:09Z");

test("caminho com pasta: ida e volta, pasta limpa e nome só do último trecho", () => {
  const c = caminhoCentral("c1", "Logo.png", AGORA, "Marca/azul");
  assert.equal(c, "c1/Marca/azul/20261012-100509-Logo.png");
  assert.equal(nomeOriginal(c), "Logo.png");
  assert.equal(pastaDoCaminho(c), "Marca/azul");
  assert.equal(pastaDoCaminho("c1/20261012-100509-Logo.png"), "");
  assert.equal(dataDoCaminho(c)?.toISOString(), "2026-10-12T13:05:09.000Z");
  assert.equal(pastaLimpa("a/../b\\c"), "a/-/b-c");
  assert.equal(pastaLimpa("x".repeat(150)).length, 100);
});

test("conteudoDaPasta mostra um nível: subpastas (com total em qualquer nível) e arquivos soltos", () => {
  const lista = [
    "c1/20261012-100000-solto.png",
    "c1/Marca/20261012-100000-a.png",
    "c1/Marca/azul/20261012-100000-b.png",
    "c1/Marca/azul/fundo/20261012-100000-c.png",
    "c1/Fotos/20261012-100000-d.png",
    "c2/Marca/20261012-100000-e.png",
  ];
  const raiz = conteudoDaPasta(lista, "c1");
  assert.deepEqual(raiz.arquivos, ["c1/20261012-100000-solto.png"]);
  assert.deepEqual(raiz.pastas, [
    { nome: "Fotos", caminho: "Fotos", total: 1 },
    { nome: "Marca", caminho: "Marca", total: 3 },
  ]);
  const marca = conteudoDaPasta(lista, "c1", "Marca");
  assert.deepEqual(marca.arquivos, ["c1/Marca/20261012-100000-a.png"]);
  assert.deepEqual(marca.pastas, [{ nome: "azul", caminho: "Marca/azul", total: 2 }]);
  assert.deepEqual(arquivosDaPasta(lista, "c1", "Marca/azul").length, 2);
  // "Marca" não pega "MarcaNova"
  assert.deepEqual(arquivosDaPasta(["c1/MarcaNova/x", "c1/Marca/y"], "c1", "Marca"), ["c1/Marca/y"]);
});

test("renomeado troca só o nome: extensão, carimbo e pasta ficam", () => {
  assert.equal(renomeado("c1/Marca/20261012-100509-Logo.PNG", "Logo azul"), "c1/Marca/20261012-100509-Logo azul.PNG");
  assert.equal(renomeado("c1/20261012-100509-Logo.png", "  Novo  "), "c1/20261012-100509-Novo.png");
  assert.equal(renomeado("c1/20261012-100509-LEIAME", "Notas"), "c1/20261012-100509-Notas");
  assert.equal(renomeado("c1/20261012-100509-a.png", "x/y"), "c1/20261012-100509-x-y.png");
  assert.equal(renomeado("c1/20261012-100509-Logo.png", "Logo"), "c1/20261012-100509-Logo.png");
  assert.deepEqual(separarExtensao("a.b.png"), ["a.b", ".png"]);
  assert.deepEqual(separarExtensao(".env"), [".env", ""]);
});

test("ehLixo pega os arquivos que o sistema cria sozinho", () => {
  assert.ok(ehLixo(".DS_Store") && ehLixo("Thumbs.db") && ehLixo("desktop.ini"));
  assert.ok(!ehLixo("logo.png"));
});

test("entradasDoZip: estrutura relativa, nome original e repetido ganha número", () => {
  const lista = [
    "c1/Marca/20261012-100000-a.png",
    "c1/Marca/20261013-100000-a.png",
    "c1/Marca/azul/20261012-100000-b.pdf",
  ];
  assert.deepEqual(
    entradasDoZip(lista, "c1", "Marca", "Marca").map((e) => e.entrada),
    ["Marca/a.png", "Marca/a (2).png", "Marca/azul/b.pdf"],
  );
});
