import test from "node:test";
import assert from "node:assert/strict";
import {
  ACEITA,
  EXT_IMAGEM,
  EXT_LOGO,
  TAMANHO_MAX,
  arquivosDoCliente,
  caminhoCentral,
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
  assert.equal(ACEITA, ".jpg,.jpeg,.png,.webp,.gif,.svg,.avif,.heic,.heif,.ai,.eps,.pdf,.psd,.cdr");
  assert.equal(TAMANHO_MAX, 100 * 1024 * 1024);
});

test("extensao pega o que vem depois do último ponto, minúsculo", () => {
  assert.equal(extensao("Foto.PNG"), "png");
  assert.equal(extensao("a.b.Jpeg"), "jpeg");
  assert.equal(extensao("semponto"), "");
});

test("tipoArquivo classifica imagem, logo e recusa o resto", () => {
  assert.equal(tipoArquivo("foto.PNG"), "imagem");
  assert.equal(tipoArquivo("logo.ai"), "logo");
  assert.equal(tipoArquivo("logo.PSD"), "logo");
  assert.equal(tipoArquivo("doc.docx"), null);
  assert.equal(tipoArquivo("semextensao"), null);
});

test("motivoRecusa: formato, tamanho e aceito", () => {
  assert.equal(motivoRecusa("a.docx", 10), "a.docx: formato não aceito (imagens e AI, EPS, PDF, PSD, CDR).");
  assert.equal(motivoRecusa("semextensao", 10), "semextensao: formato não aceito (imagens e AI, EPS, PDF, PSD, CDR).");
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

test("arquivosDoCliente filtra a pasta e ordena do mais novo para o mais antigo", () => {
  const lista = [
    "c1/20261010-100000-a.png",
    "c2/20261012-100000-z.png",
    "c1/20261012-100000-b.png",
    "c10/20261011-100000-x.png",
  ];
  assert.deepEqual(arquivosDoCliente(lista, "c1"), [
    "c1/20261012-100000-b.png",
    "c1/20261010-100000-a.png",
  ]);
  assert.deepEqual(arquivosDoCliente(lista, "naoexiste"), []);
});
