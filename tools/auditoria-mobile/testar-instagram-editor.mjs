// Tela de postagem no servidor local (porta 5188): recortar todas, editor de foto (filtro e texto), editor de vídeo
// (9:16, trecho, P&B) com o MP4 exportado salvo para conferir no ffprobe, Story, lista (Excluir com confirmação) e
// calendário. O envio ao R2 falha no localhost (CORS): esperado; o teste confere os arquivos gerados no navegador.
// Uso: node testar-instagram-editor.mjs <pasta-com-teste.mp4-e-alta.png> <pasta-dos-prints>
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
import { CHROME, abrirEstavel } from "./rotas.mjs";
const [pasta, SP] = process.argv.slice(2);
const navegador = await chromium.launch({ executablePath: CHROME });
const p = await navegador.newPage({ viewport: { width: 1366, height: 900 } });
const erros = [];
p.on("pageerror", (e) => erros.push(e.message));
const ok = (nome, cond) => console.log(cond ? "OK " : "FALHOU ", nome);

await abrirEstavel(p, "http://localhost:5188/instagram");
await p.getByRole("button", { name: "Postar" }).first().waitFor({ timeout: 30000 });
await p.getByLabel("Buscar conta").fill("kobegrowth");
await p.waitForTimeout(600);
await p.getByRole("button", { name: "Postar" }).first().click();
const d = p.getByRole("dialog").first();
await d.getByText(/Postar em @/).waitFor();
const entrada = d.locator('input[type="file"][multiple]');

// 1) Imagem 9:16 no feed: erro de proporção e "Recortar em 4:5"
await entrada.setInputFiles(`${pasta}/alta.png`);
await d.getByText(/A imagem tem proporção 0,56:1/).waitFor({ timeout: 20000 });
ok("erro de proporção da imagem 9:16", true);
await d.getByRole("button", { name: "4:5", exact: true }).click();
await d.getByText(/A imagem tem proporção/).waitFor({ state: "detached", timeout: 20000 }).catch(() => {});
ok("recortar em 4:5 tira o erro", (await d.getByText(/A imagem tem proporção/).count()) === 0);

// 2) Editor de foto: filtro Vívido + texto
await d.getByRole("button", { name: "Editar a mídia 1" }).click();
const ed = p.getByRole("dialog").filter({ hasText: "Editar foto" });
await ed.waitFor();
await ed.getByRole("button", { name: "Filtros" }).click();
await ed.getByRole("button", { name: /Vívido/ }).click();
await ed.getByRole("button", { name: "Texto", exact: true }).click();
await ed.getByRole("button", { name: /Adicionar texto/ }).click();
await ed.getByLabel("Texto", { exact: true }).fill("Teste do editor");
await p.screenshot({ path: `${SP}/ig-editor-foto.png` });
await ed.getByRole("button", { name: "Aplicar" }).click();
await ed.waitFor({ state: "detached", timeout: 30000 });
ok("editor de foto aplica (filtro e texto)", true);
await d.getByRole("button", { name: "Remover" }).first().click();

// 3) Editor de vídeo: 9:16, trecho 1 s a 5 s, P&B
await entrada.setInputFiles(`${pasta}/teste.mp4`);
await d.getByRole("button", { name: "Editar a mídia 1" }).waitFor({ timeout: 30000 });
await p.waitForTimeout(1500);
await d.getByRole("button", { name: "Editar a mídia 1" }).click();
const ev = p.getByRole("dialog").filter({ hasText: "Editar vídeo" });
await ev.waitFor();
await ev.getByRole("button", { name: "9:16", exact: true }).click();
await ev.getByRole("button", { name: "Filtros" }).click();
await ev.getByRole("button", { name: /P&B/ }).click();
await ev.getByRole("button", { name: "Trecho e som" }).click();
const polegares = ev.getByRole("slider");
await polegares.nth(0).focus();
await p.keyboard.press("ArrowRight", { delay: 20 });
for (let i = 0; i < 9; i++) await p.keyboard.press("ArrowRight");
await polegares.nth(1).focus();
for (let i = 0; i < 10; i++) await p.keyboard.press("ArrowLeft");
ok("trecho 1 s a 5 s", (await ev.getByText(/Trecho: 0:01 até 0:05/).count()) === 1);
await p.screenshot({ path: `${SP}/ig-editor-video.png` });
const t0 = Date.now();
await ev.getByRole("button", { name: "Aplicar" }).click();
await ev.waitFor({ state: "detached", timeout: 180000 });
console.log(`vídeo exportado em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const base64 = await d.locator("video").first().evaluate(async (v) => {
  const b = await (await fetch(v.src)).blob();
  const bytes = new Uint8Array(await b.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
});
writeFileSync(`${SP}/ig-exportado.mp4`, Buffer.from(base64, "base64"));
ok("MP4 exportado salvo", base64.length > 1000);

// 4) Story: Facebook desligado e sem legenda
await d.getByRole("button", { name: "Story", exact: true }).click();
ok("story sem legenda", (await d.getByLabel("Legenda").count()) === 0);
ok("story com Facebook desligado", await d.getByRole("checkbox").nth(1).isDisabled());
await p.screenshot({ path: `${SP}/ig-story.png` });
await d.getByRole("button", { name: "Cancelar" }).click();

// 5) Posts: Excluir pede confirmação (Voltar, sem excluir); 6) Calendário
await p.getByRole("tab", { name: /Posts/ }).click();
const excluir = p.getByRole("button", { name: "Excluir" });
ok(`posts publicados com Excluir (${await excluir.count()})`, (await excluir.count()) >= 1);
await excluir.first().click();
await p.getByText(/Excluir do Instagram\?/).waitFor();
ok("confirmação de exclusão", true);
await p.getByRole("button", { name: "Voltar" }).click();
await p.getByRole("tab", { name: "Calendário" }).click();
await p.getByText(/outubro de 2026/i).waitFor();
ok("calendário de outubro com o dia 3", (await p.getByRole("button", { name: /3 de outubro: [1-9]/ }).count()) === 1);
await p.screenshot({ path: `${SP}/ig-calendario.png` });
console.log("erros:", erros.join(" | ") || "nenhum");
await navegador.close();
