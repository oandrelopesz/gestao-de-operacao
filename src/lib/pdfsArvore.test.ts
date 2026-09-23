import { test } from "node:test";
import assert from "node:assert/strict";
import {
  montarArvore, caminhoDaPasta, idsDescendentes, contarPdfsPorPasta, podeMoverPasta, opcoesDePasta,
  ehPdf, nomeSemExtensao, nomeParaDownload, formatarTamanho, filtrarPdfs, proximaOrdem, corDaPasta, PASTA_CORES,
  type PdfPasta,
} from "./pdfsArvore.ts";

const p = (id: string, nome: string, parent_id: string | null, ordem = 0): PdfPasta =>
  ({ id, nome, parent_id, cor: null, ordem });

const PASTAS: PdfPasta[] = [
  p("ia", "IA", null, 1),
  p("tr", "Tráfego", null, 0),
  p("meta", "Meta Ads", "tr", 0),
  p("google", "Google Ads", "tr", 1),
  p("meta-cbo", "CBO", "meta", 0),
  p("claude", "Claude", "ia", 0),
];

test("montarArvore: raízes e filhos ordenados por ordem e depois por nome", () => {
  const arvore = montarArvore(PASTAS);
  assert.deepEqual(arvore.map((n) => n.id), ["tr", "ia"]);
  assert.deepEqual(arvore[0].filhos.map((n) => n.id), ["meta", "google"]);
  assert.deepEqual(arvore[0].filhos[0].filhos.map((n) => n.id), ["meta-cbo"]);
});

test("montarArvore: pasta com pai inexistente vira raiz (não some)", () => {
  const arvore = montarArvore([p("orfa", "Órfã", "sumiu")]);
  assert.deepEqual(arvore.map((n) => n.id), ["orfa"]);
});

test("caminhoDaPasta: da raiz até a pasta; id desconhecido dá lista vazia", () => {
  assert.deepEqual(caminhoDaPasta(PASTAS, "meta-cbo").map((x) => x.nome), ["Tráfego", "Meta Ads", "CBO"]);
  assert.deepEqual(caminhoDaPasta(PASTAS, "nada"), []);
});

test("idsDescendentes: inclui a própria pasta e todos os níveis abaixo", () => {
  assert.deepEqual([...idsDescendentes(PASTAS, "tr")].sort(), ["google", "meta", "meta-cbo", "tr"]);
  assert.deepEqual([...idsDescendentes(PASTAS, "claude")], ["claude"]);
});

test("contarPdfsPorPasta: total soma as subpastas; direto conta só a própria", () => {
  const pdfs = [{ pasta_id: "meta-cbo" }, { pasta_id: "meta" }, { pasta_id: "tr" }, { pasta_id: "claude" }];
  const c = contarPdfsPorPasta(PASTAS, pdfs);
  assert.equal(c.get("tr")?.total, 3);
  assert.equal(c.get("tr")?.direto, 1);
  assert.equal(c.get("meta")?.total, 2);
  assert.equal(c.get("google")?.total, 0);
  assert.equal(c.get("ia")?.total, 1);
});

test("podeMoverPasta: não pode ir para dentro de si mesma nem de uma descendente", () => {
  assert.equal(podeMoverPasta(PASTAS, "tr", "meta-cbo"), false);
  assert.equal(podeMoverPasta(PASTAS, "tr", "tr"), false);
  assert.equal(podeMoverPasta(PASTAS, "meta", "ia"), true);
  assert.equal(podeMoverPasta(PASTAS, "meta", null), true);
});

test("opcoesDePasta: lista achatada em ordem de árvore com profundidade, podendo excluir uma subárvore", () => {
  const todas = opcoesDePasta(PASTAS);
  assert.deepEqual(todas.map((o) => [o.id, o.nivel]), [
    ["tr", 0], ["meta", 1], ["meta-cbo", 2], ["google", 1], ["ia", 0], ["claude", 1],
  ]);
  assert.equal(todas[2].caminho, "Tráfego / Meta Ads / CBO");
  const semMeta = opcoesDePasta(PASTAS, "meta");
  assert.deepEqual(semMeta.map((o) => o.id), ["tr", "google", "ia", "claude"]);
});

test("ehPdf: aceita pelo tipo ou pela extensão (arrastar do Windows às vezes vem sem tipo)", () => {
  assert.equal(ehPdf({ name: "a.pdf", type: "application/pdf" }), true);
  assert.equal(ehPdf({ name: "RELATORIO.PDF", type: "" }), true);
  assert.equal(ehPdf({ name: "foto.png", type: "image/png" }), false);
  assert.equal(ehPdf({ name: "planilha.xlsx", type: "" }), false);
});

test("nomeSemExtensao e nomeParaDownload", () => {
  assert.equal(nomeSemExtensao("Guia Meta Ads.pdf"), "Guia Meta Ads");
  assert.equal(nomeSemExtensao("sem-extensao"), "sem-extensao");
  assert.equal(nomeParaDownload("Guia: Meta/Ads?"), "Guia- Meta-Ads-.pdf");
  assert.equal(nomeParaDownload("ja.pdf"), "ja.pdf");
  assert.equal(nomeParaDownload("   "), "arquivo.pdf");
});

test("formatarTamanho", () => {
  assert.equal(formatarTamanho(500), "500 B");
  assert.equal(formatarTamanho(1536), "1,5 KB");
  assert.equal(formatarTamanho(5 * 1024 * 1024), "5,0 MB");
});

test("filtrarPdfs: busca sem acento e sem diferenciar maiúsculas, pelo nome ou arquivo", () => {
  const pdfs = [
    { nome: "Gestão de tráfego", arquivo_nome: "x.pdf" },
    { nome: "Prompts", arquivo_nome: "claude-prompts.pdf" },
  ];
  assert.equal(filtrarPdfs(pdfs, "TRAFEGO").length, 1);
  assert.equal(filtrarPdfs(pdfs, "claude")[0].nome, "Prompts");
  assert.equal(filtrarPdfs(pdfs, "  ").length, 2);
});

test("proximaOrdem: depois da maior ordem entre as irmãs", () => {
  assert.equal(proximaOrdem(PASTAS, null), 2);
  assert.equal(proximaOrdem(PASTAS, "tr"), 2);
  assert.equal(proximaOrdem(PASTAS, "google"), 0);
});

test("corDaPasta: usa a própria cor ou herda do ancestral mais próximo; sem nenhuma, a padrão", () => {
  const pastas = [{ ...p("tr", "Tráfego", null), cor: "#3b82f6" }, p("meta", "Meta Ads", "tr"), p("solta", "Solta", null)];
  assert.equal(corDaPasta(pastas, "meta"), "#3b82f6");
  assert.equal(corDaPasta(pastas, "tr"), "#3b82f6");
  assert.equal(corDaPasta(pastas, "solta"), PASTA_CORES[3]);
});
