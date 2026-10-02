import { test } from "node:test";
import assert from "node:assert/strict";
import {
  montarArvore, caminhoDaPasta, idsDescendentes, contarPdfsPorPasta, podeMoverPasta, planoMoverPasta, opcoesDePasta,
  ehPdf, arquivoAceito, tipoDoArquivo, extensaoDe, contentTypeDe, nomeSemExtensao, nomeParaDownload, formatarTamanho, filtrarPdfs, proximaOrdem, corDaPasta, PASTA_CORES,
  type PdfPasta,
} from "./pdfsArvore.ts";
import { MENSAGEM_NENHUM, MENSAGEM_PARECIDOS } from "./search.ts";

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

test("arquivoAceito: documentos sim, imagem e vídeo não (pelo tipo ou pela extensão)", () => {
  for (const nome of ["a.pdf", "notas.txt", "LEIAME.md", "deck.pptx", "velho.ppt", "contrato.docx", "planilha.xlsx", "dados.csv", "livro.epub", "pacote.zip", "sem-extensao"]) {
    assert.equal(arquivoAceito({ name: nome, type: "" }).ok, true, nome);
  }
  assert.deepEqual(arquivoAceito({ name: "foto.png", type: "image/png" }), { ok: false, motivo: "imagem" });
  assert.deepEqual(arquivoAceito({ name: "print.JPG", type: "" }), { ok: false, motivo: "imagem" });
  assert.deepEqual(arquivoAceito({ name: "aula.mp4", type: "video/mp4" }), { ok: false, motivo: "video" });
  assert.deepEqual(arquivoAceito({ name: "clip.mov", type: "" }), { ok: false, motivo: "video" });
});

test("tipoDoArquivo decide ícone e visualização", () => {
  assert.equal(tipoDoArquivo("a.pdf"), "pdf");
  assert.equal(tipoDoArquivo("x.md"), "texto");
  assert.equal(tipoDoArquivo("x.TXT"), "texto");
  assert.equal(tipoDoArquivo("x.csv"), "planilha");
  assert.equal(tipoDoArquivo("x.xlsx"), "planilha");
  assert.equal(tipoDoArquivo("x.pptx"), "apresentacao");
  assert.equal(tipoDoArquivo("x.docx"), "documento");
  assert.equal(tipoDoArquivo("x.zip"), "compactado");
  assert.equal(tipoDoArquivo("x.bin"), "outro");
  assert.equal(extensaoDe("Relatório Final.PDF"), "pdf");
  assert.equal(extensaoDe("sem-extensao"), "");
});

test("contentTypeDe usa o tipo do arquivo ou deduz pela extensão", () => {
  assert.equal(contentTypeDe({ name: "a.pdf", type: "application/pdf" }), "application/pdf");
  assert.equal(contentTypeDe({ name: "b.md", type: "" }), "text/markdown");
  assert.equal(contentTypeDe({ name: "c.pptx", type: "" }), "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  assert.equal(contentTypeDe({ name: "d.qualquer", type: "" }), "application/octet-stream");
});

test("nomeSemExtensao e nomeParaDownload (mantém a extensão do arquivo original)", () => {
  assert.equal(nomeSemExtensao("Guia Meta Ads.pdf"), "Guia Meta Ads");
  assert.equal(nomeSemExtensao("deck final.pptx"), "deck final");
  assert.equal(nomeSemExtensao("sem-extensao"), "sem-extensao");
  assert.equal(nomeSemExtensao("v1.2 relatório"), "v1.2 relatório");
  assert.equal(nomeParaDownload("Guia: Meta/Ads?"), "Guia- Meta-Ads-.pdf");
  assert.equal(nomeParaDownload("ja.pdf"), "ja.pdf");
  assert.equal(nomeParaDownload("   "), "arquivo.pdf");
  assert.equal(nomeParaDownload("Apresentação", "deck.pptx"), "Apresentação.pptx");
  assert.equal(nomeParaDownload("Notas.md", "notas.md"), "Notas.md");
  assert.equal(nomeParaDownload("Sem ext", "arquivo"), "Sem ext");
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
  assert.equal(filtrarPdfs(pdfs, "TRAFEGO").itens.length, 1);
  assert.equal(filtrarPdfs(pdfs, "claude").itens[0].nome, "Prompts");
  const semBusca = filtrarPdfs(pdfs, "  ");
  assert.equal(semBusca.itens.length, 2);
  assert.equal(semBusca.modo, "todos");
});

test("filtrarPdfs: acha com erro de digitação e sem acento", () => {
  const pdfs = [
    { nome: "Gestão de tráfego", arquivo_nome: "x.pdf" },
    { nome: "Prompts", arquivo_nome: "claude-prompts.pdf" },
  ];
  assert.deepEqual(filtrarPdfs(pdfs, "gestao trafego").itens.map((f) => f.nome), ["Gestão de tráfego"]);
  assert.deepEqual(filtrarPdfs(pdfs, "prompst").itens.map((f) => f.nome), ["Prompts"]); // letras vizinhas trocadas
  assert.deepEqual(filtrarPdfs(pdfs, "trafgo").itens.map((f) => f.nome), ["Gestão de tráfego"]); // letra a menos
  assert.equal(filtrarPdfs(pdfs, "prompst").modo, "exato");
});

test("filtrarPdfs: busca só com pontuação não tem palavras: modo \"todos\" (a tela decide o que mostrar)", () => {
  const pdfs = [
    { nome: "Gestão de tráfego", arquivo_nome: "x.pdf" },
    { nome: "Prompts", arquivo_nome: "claude-prompts.pdf" },
  ];
  for (const busca of ["...", "-", "( )", " . "]) {
    const r = filtrarPdfs(pdfs, busca);
    assert.equal(r.modo, "todos", busca);
    assert.equal(r.mensagem, null, busca);
    assert.equal(r.itens.length, 2, busca);
  }
});

test("filtrarPdfs: parecidos e nenhum trazem a mensagem; o nome vem antes do nome do arquivo", () => {
  const pdfs = [
    { nome: "Guia", arquivo_nome: "meta-ads.pdf" },
    { nome: "Meta Ads", arquivo_nome: "guia2.pdf" },
  ];
  // "meta" está no nome do 2º (campo principal) e no arquivo do 1º: o 2º vem primeiro
  assert.deepEqual(filtrarPdfs(pdfs, "meta").itens.map((f) => f.nome), ["Meta Ads", "Guia"]);
  const parecidos = filtrarPdfs(pdfs, "guia zebra");
  assert.equal(parecidos.modo, "parecidos");
  assert.equal(parecidos.mensagem, MENSAGEM_PARECIDOS);
  const nenhum = filtrarPdfs(pdfs, "zebra");
  assert.equal(nenhum.modo, "nenhum");
  assert.equal(nenhum.mensagem, MENSAGEM_NENHUM);
  assert.deepEqual(nenhum.itens, []);
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

test("filtrarPdfs: também encontra pelo player", () => {
  const pdfs = [
    { nome: "Guia", arquivo_nome: "guia.pdf", player: "Pedro Sobral" },
    { nome: "Outro", arquivo_nome: "o.pdf", player: null },
  ];
  assert.deepEqual(filtrarPdfs(pdfs, "sobral").itens.map((f) => f.nome), ["Guia"]);
  assert.deepEqual(filtrarPdfs(pdfs, "sobrla").itens.map((f) => f.nome), ["Guia"]);
});

test("planoMoverPasta: subpasta para outro tema perde a cor e entra no fim das irmãs", () => {
  const pastas = PASTAS.map((x) => (x.id === "tr" ? { ...x, cor: "#3b82f6" } : x));
  const r = planoMoverPasta(pastas, "meta", "ia");
  assert.deepEqual(r, { ok: true, patch: { parent_id: "ia", cor: null, ordem: 1 } });
});

test("planoMoverPasta: subpasta para a raiz vira tema com cor; tema mantém a cor que tinha", () => {
  const r = planoMoverPasta(PASTAS, "claude", null);
  assert.ok(r && r.ok && r.patch.parent_id === null && r.patch.cor?.startsWith("#") && r.patch.ordem === 2);
  const comCor = PASTAS.map((x) => (x.id === "meta-cbo" ? { ...x, cor: "#10b981" } : x));
  const r2 = planoMoverPasta(comCor, "meta-cbo", null);
  assert.ok(r2 && r2.ok && r2.patch.cor === "#10b981");
});

test("planoMoverPasta: recusa para dentro dela mesma, de uma subpasta sua ou com nome repetido; mesmo lugar não faz nada", () => {
  assert.deepEqual(planoMoverPasta(PASTAS, "tr", "meta-cbo"), { ok: false, motivo: "Não dá para colocar uma pasta dentro dela mesma" });
  assert.deepEqual(planoMoverPasta(PASTAS, "tr", "tr"), { ok: false, motivo: "Não dá para colocar uma pasta dentro dela mesma" });
  const repetida = [...PASTAS, p("x", "Claude", "tr")];
  assert.deepEqual(planoMoverPasta(repetida, "x", "ia"), { ok: false, motivo: 'Já existe uma pasta "Claude" ali' });
  assert.equal(planoMoverPasta(PASTAS, "meta", "tr"), null);
});

test("contarPdfsPorPasta: arquivo fora das pastas não conta em nenhuma", () => {
  const c = contarPdfsPorPasta(PASTAS, [{ pasta_id: null }, { pasta_id: "meta" }]);
  assert.equal(c.get("tr")?.total, 1);
  assert.equal(c.get("meta")?.direto, 1);
});
