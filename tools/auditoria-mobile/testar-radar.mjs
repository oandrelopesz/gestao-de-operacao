// Testa a aba Radar IA (/radar) com os dias de teste do ano 2000 que tools/radar/testar-api.mjs grava:
// menu, visão Dia, filtro na URL, status (e volta), as outras visões e o celular. Tira prints em ./prints/radar/.
// Uso (de dentro de tools/auditoria-mobile, com o vite local na 5178): npm run teste -- testar-radar.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { CHROME } from "./rotas.mjs";

const SITE = process.env.SITE || "http://localhost:5178";
const DIA = "2000-01-01";
mkdirSync("prints/radar", { recursive: true });
let falhas = 0;
const ok = (n) => console.log("OK " + n);
const falhou = (n, d) => { falhas++; console.log("FALHOU " + n + ": " + d); };
async function teste(nome, fn) { try { await fn(); ok(nome); } catch (e) { falhou(nome, e.message.split("\n")[0]); } }

const nav = await chromium.launch({ executablePath: CHROME });
const pag = await nav.newPage({ viewport: { width: 1366, height: 900 } });
const erros = [];
pag.on("pageerror", (e) => erros.push(e.message));

await teste("menu Pessoal tem Radar IA", async () => {
  await pag.goto(SITE + "/radar?dia=" + DIA, { waitUntil: "networkidle" });
  await pag.getByRole("link", { name: "Radar IA" }).first().waitFor({ timeout: 15000 });
});
await teste("visão Dia mostra cabeçalho e os 3 achados", async () => {
  await pag.getByText("DIA-20000101").first().waitFor({ timeout: 15000 });
  for (const id of ["RAD-20000101-001", "RAD-20000101-002", "RAD-20000101-003"]) await pag.getByText(id).first().waitFor({ timeout: 5000 });
  await pag.screenshot({ path: "prints/radar/dia.png", fullPage: true });
});
await teste("filtro de classe vai para a URL e esconde os outros", async () => {
  await pag.goto(SITE + "/radar?dia=" + DIA + "&classe=excelente", { waitUntil: "networkidle" });
  await pag.getByText(/ocultos pelo filtro/).first().waitFor({ timeout: 15000 });
});
await teste("status muda e persiste ao recarregar (e volta)", async () => {
  await pag.goto(SITE + "/radar?dia=" + DIA + "&view=kanban", { waitUntil: "networkidle" });
  const menu = pag.getByRole("button", { name: /Mover RAD-20000101-002/ });
  await menu.waitFor({ timeout: 15000 });
  await menu.click();
  await pag.getByRole("menuitem", { name: /Testando/ }).click();
  await pag.getByText("Status atualizado").first().waitFor({ timeout: 10000 });
  await pag.goto(SITE + "/radar?dia=" + DIA + "&status=testando&view=tabela", { waitUntil: "networkidle" });
  await pag.getByText("RAD-20000101-002").first().waitFor({ timeout: 15000 });
  await pag.screenshot({ path: "prints/radar/tabela-testando.png" });
  await pag.goto(SITE + "/radar?dia=" + DIA + "&view=kanban", { waitUntil: "networkidle" });
  await pag.getByRole("button", { name: /Mover RAD-20000101-002/ }).click();
  await pag.getByRole("menuitem", { name: /Novo/ }).click();
  await pag.getByText("Status atualizado").first().waitFor({ timeout: 10000 });
});
await teste("cards e calendário abrem", async () => {
  await pag.goto(SITE + "/radar?de=" + DIA + "&ate=2000-01-02&view=cards", { waitUntil: "networkidle" });
  await pag.getByText("RAD-20000102-001").first().waitFor({ timeout: 15000 });
  await pag.screenshot({ path: "prints/radar/cards.png", fullPage: true });
  await pag.goto(SITE + "/radar?dia=" + DIA + "&view=calendario", { waitUntil: "networkidle" });
  await pag.screenshot({ path: "prints/radar/calendario.png", fullPage: true });
});
await teste("celular 375 px sem rolagem lateral", async () => {
  await pag.setViewportSize({ width: 375, height: 812 });
  await pag.goto(SITE + "/radar?dia=" + DIA, { waitUntil: "networkidle" });
  await pag.getByText("RAD-20000101-001").first().waitFor({ timeout: 15000 });
  const largo = await pag.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await pag.screenshot({ path: "prints/radar/celular.png", fullPage: true });
  if (largo > 1) throw new Error("rolagem lateral de " + largo + " px");
});
if (erros.length) falhou("sem erro de JavaScript", erros.join(" | "));
await nav.close();
console.log(falhas ? falhas + " teste(s) falharam" : "TUDO CERTO");
process.exit(falhas ? 1 : 0);
