import test from "node:test";
import assert from "node:assert/strict";
import { publicarDownload, publicarLp } from "../src/publicar.js";

function driveFake() {
  const acoes = [];
  return {
    acoes,
    garantirPasta: async (nome, paiId) => { acoes.push({ tipo: "pasta", nome, paiId }); return { id: `pasta:${nome}`, webViewLink: `https://drive/${nome}` }; },
    nomesEm: async () => [],
    subirArquivo: async (caminho, o) => {
      acoes.push({ tipo: "upload", caminho, nome: o.nome, paiId: o.paiId, mime: o.mime });
      return { id: `file:${o.nome}`, name: o.nome, mimeType: o.mime, webViewLink: `https://drive/${o.nome}`, thumbnailLink: "https://thumb", size: "2048" };
    },
    criarDoc: async () => ({ id: "doc", webViewLink: "https://docs" }),
  };
}

test("vídeo único vai direto na pasta da categoria", async () => {
  const d = driveFake();
  const r = await publicarDownload(d, { arquivos: ["/tmp/j/x.mp4"], modo: "unico", base: "Vídeo de anúncio - Médico - Dr X", paiId: "cat1" });
  assert.equal(d.acoes.length, 1);
  assert.deepEqual(d.acoes[0], { tipo: "upload", caminho: "/tmp/j/x.mp4", nome: "Vídeo de anúncio - Médico - Dr X.mp4", paiId: "cat1", mime: "video/mp4" });
  assert.equal(r.drive_file_id, "file:Vídeo de anúncio - Médico - Dr X.mp4");
  assert.equal(r.drive_folder_id, "cat1");
  assert.equal(r.mime, "video/mp4");
  assert.equal(r.tamanho, 2048);
});

test("carrossel cria pasta com o nome base e numera os cards como Card 01, Card 02", async () => {
  const d = driveFake();
  const r = await publicarDownload(d, { arquivos: ["/tmp/j/a.jpg", "/tmp/j/b.jpg"], modo: "carrossel", base: "Carrossel - Médico - Dr X", paiId: "cat1" });
  assert.equal(d.acoes[0].tipo, "pasta");
  assert.equal(d.acoes[0].nome, "Carrossel - Médico - Dr X");
  assert.deepEqual(d.acoes.slice(1).map((a) => a.nome), ["Card 01.jpg", "Card 02.jpg"]);
  assert.ok(d.acoes.slice(1).every((a) => a.paiId === "pasta:Carrossel - Médico - Dr X"));
  assert.equal(r.drive_file_id, "pasta:Carrossel - Médico - Dr X");
  assert.equal(r.mime, "application/vnd.google-apps.folder");
  assert.equal(r.tamanho, 4096);
});

test("LP cria pasta e sobe html, zip, print e VSL juntos", async () => {
  const d = driveFake();
  const arquivos = [
    { caminho: "/tmp/j/pagina.html", nome: "LP - N - P.html", mime: "text/html" },
    { caminho: "/tmp/j/mirror.zip", nome: "LP - N - P - mirror.zip", mime: "application/zip" },
    { caminho: "/tmp/j/print.png", nome: "LP - N - P - print.png", mime: "image/png" },
    { caminho: "/tmp/j/vsl-1.mp4", nome: "LP - N - P - VSL 01.mp4", mime: "video/mp4" },
  ];
  const r = await publicarLp(d, { arquivos, base: "LP - N - P", paiId: "cat1" });
  assert.equal(d.acoes[0].nome, "LP - N - P");
  assert.equal(d.acoes.length, 5);
  assert.ok(d.acoes.slice(1).every((a) => a.paiId === "pasta:LP - N - P"));
  assert.equal(r.drive_file_id, "pasta:LP - N - P");
  assert.equal(r.tamanho, 8192);
});

test("nome repetido na pasta ganha sufixo", async () => {
  const d = driveFake();
  d.nomesEm = async () => ["Vídeo - N - P.mp4"];
  await publicarDownload(d, { arquivos: ["/tmp/j/x.mp4"], modo: "unico", base: "Vídeo - N - P", paiId: "cat1" });
  assert.equal(d.acoes[0].nome, "Vídeo - N - P (2).mp4");
});

test("retry não duplica: card que já está na pasta é pulado", async () => {
  const d = driveFake();
  d.nomesEm = async (paiId) => (paiId === "pasta:Carrossel - N - P" ? ["Card 01.jpg"] : []);
  const r = await publicarDownload(d, {
    arquivos: ["/tmp/j/a.jpg", "/tmp/j/b.jpg"], modo: "carrossel", base: "Carrossel - N - P", paiId: "cat1",
  });
  const enviados = d.acoes.filter((a) => a.tipo === "upload").map((a) => a.nome);
  assert.deepEqual(enviados, ["Card 02.jpg"], "só o card que faltava devia subir");
  assert.equal(r.drive_file_id, "pasta:Carrossel - N - P");
});

test("carrossel respeita a extensão de cada card, misturando imagem e vídeo", async () => {
  const d = driveFake();
  await publicarDownload(d, {
    arquivos: ["/tmp/j/a.jpg", "/tmp/j/b.mp4", "/tmp/j/c.png", "/tmp/j/d.mov"], modo: "carrossel", base: "C - N - P", paiId: "cat1",
  });
  const enviados = d.acoes.filter((a) => a.tipo === "upload");
  assert.deepEqual(enviados.map((a) => a.nome), ["Card 01.jpg", "Card 02.mp4", "Card 03.png", "Card 04.mov"]);
  assert.deepEqual(enviados.map((a) => a.mime), ["image/jpeg", "video/mp4", "image/png", "video/quicktime"]);
});
