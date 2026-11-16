// Testa a Calculadora de taxas (/taxas): contas nos dois sentidos e métodos, máscara dos campos, copiar,
// templates (salvar, atualizar pelo mesmo nome, aplicar, sobreviver ao recarregar, excluir e desfazer),
// menu lateral e celular. Templates de teste têm "[TESTE]" no nome e são apagados no início e no fim.
// Uso (de dentro de tools/auditoria-mobile, com o vite local na 5178): node testar-taxas.mjs
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { CHROME, abrirEstavel } from "./rotas.mjs";

const SITE = process.env.SITE || "http://localhost:5178";
const env = Object.fromEntries(readFileSync("../../.env", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const REST = env.VITE_SUPABASE_URL + "/rest/v1/taxas_templates";
const H = { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + env.VITE_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" };
const limpar = () => fetch(`${REST}?nome=like.*TESTE*`, { method: "DELETE", headers: H });
const noBanco = async () => (await (await fetch(`${REST}?nome=like.*TESTE*&select=nome,taxa,metodo&order=nome`, { headers: H })).json());

let falhou = false;
const ok = (c, m, extra) => { console.log(c ? "ok  " : "FALHA", m, c ? "" : JSON.stringify(extra ?? "")); if (!c) falhou = true; };
const norm = (s) => (s ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();

await limpar();
const nav = await chromium.launch({ executablePath: CHROME });
try {
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"] });
  const p = await ctx.newPage();
  const erros = [];
  p.on("console", (m) => { if (m.type() === "error" && !/GSI|403|FedCM|identity|accounts list/.test(m.text())) erros.push(m.text().slice(0, 200)); });
  p.on("pageerror", (e) => erros.push("pageerror: " + e.message));

  await abrirEstavel(p, `${SITE}/taxas`, Number(process.env.ESPERA_MS || 8000));
  const valor = p.locator("#taxa-valor"), taxa = p.locator("#taxa-pct");
  const resultado = () => p.getByTestId("resultado").innerText().then(norm);
  const taxaReais = () => p.getByTestId("taxa-reais").innerText().then(norm);
  const digitar = async (loc, txt) => { await loc.fill(""); await loc.pressSequentially(txt, { delay: 15 }); };
  const aba = (nome) => p.getByRole("tab", { name: nome });

  // 1. Estado vazio
  ok(await resultado() === "R$ 0,00", "estado vazio mostra R$ 0,00", await resultado());
  ok(await p.getByRole("button", { name: /Copiar valor/ }).isDisabled(), "copiar fica desligado sem conta");
  ok(await p.getByText("Digite o valor e a taxa").isVisible(), "dica de preenchimento no estado vazio");

  // 2. Máscara de centavos e conta: acrescentar por fora
  await digitar(valor, "100000");
  ok(await valor.inputValue() === "1.000,00", "máscara do valor: 100000 vira 1.000,00", await valor.inputValue());
  await digitar(taxa, "13.15");
  ok(await taxa.inputValue() === "13,15", "ponto da taxa vira vírgula", await taxa.inputValue());
  ok(await resultado() === "R$ 1.131,50", "1.000 + 13,15% por fora = 1.131,50", await resultado());
  ok(await taxaReais() === "+ R$ 131,50", "taxa em reais (+)", await taxaReais());
  ok(norm(await p.locator("dl").innerText()).includes("R$ 1.000,00 × (1 + 13,15%) = R$ 1.131,50"), "fórmula visível para conferir");

  // 3. Copiar
  await p.getByRole("button", { name: /Copiar 1131,50/ }).click();
  ok(await p.evaluate(() => navigator.clipboard.readText()) === "1131,50", "copiar manda 1131,50 (sem R$ nem ponto)");

  // 4. Por dentro
  await aba("Taxa por dentro").click();
  await digitar(taxa, "10");
  ok(await resultado() === "R$ 1.111,11", "1.000 por dentro 10% = 1.111,11", await resultado());

  // 5. Descontar, nos dois métodos
  await aba("Descontar taxa").click();
  ok(await resultado() === "R$ 900,00", "descontar por dentro: 1.000 − 10% = 900,00", await resultado());
  ok(await taxaReais() === "− R$ 100,00", "taxa em reais (−)", await taxaReais());
  await aba("Taxa por fora").click();
  ok(await resultado() === "R$ 909,09", "descontar por fora: 1.000 ÷ 1,10 = 909,09", await resultado());

  // 6. Taxa zero e apagar valor
  await digitar(taxa, "0");
  ok(await resultado() === "R$ 1.000,00", "taxa 0 devolve o mesmo valor", await resultado());
  await valor.fill("");
  ok(await resultado() === "R$ 0,00", "valor apagado volta ao vazio");
  await aba("Acrescentar taxa").click();

  // 7. Templates: salvar
  await digitar(taxa, "13,15");
  await p.getByLabel("Nome do template").fill("[TESTE] Taxa do Meta");
  await p.getByRole("button", { name: /Salvar template/ }).click();
  await p.getByRole("button", { name: /^\[TESTE\] Taxa do Meta/ }).waitFor({ timeout: 15_000 });
  ok(true, "template aparece como botão depois de salvar");
  let banco = await noBanco();
  ok(banco.length === 1 && banco[0].nome === "[TESTE] Taxa do Meta" && Number(banco[0].taxa) === 13.15 && banco[0].metodo === "fora", "template gravado no banco", banco);
  ok(await p.getByLabel("Nome do template").inputValue() === "", "campo do nome limpa depois de salvar");
  ok(await p.getByRole("button", { name: /^\[TESTE\] Taxa do Meta/ }).getAttribute("aria-pressed") === "true", "template fica marcado quando taxa e método batem");

  // 8. Atualizar pelo mesmo nome (outra capitalização) não duplica
  await aba("Taxa por dentro").click();
  await digitar(taxa, "8,5");
  await p.getByLabel("Nome do template").fill("[teste] taxa do meta");
  await p.getByRole("button", { name: /Salvar template/ }).click();
  await p.waitForFunction(() => /8,5%/.test(document.body.innerText), null, { timeout: 15_000 });
  banco = await noBanco();
  ok(banco.length === 1 && Number(banco[0].taxa) === 8.5 && banco[0].metodo === "dentro", "mesmo nome atualiza sem duplicar", banco);

  // 9. Aplicar template: preenche taxa e método
  await digitar(taxa, "1");
  await aba("Taxa por fora").click();
  await p.getByRole("button", { name: /^\[TESTE\] Taxa do Meta/ }).click();
  ok(await taxa.inputValue() === "8,5", "aplicar template preenche a taxa", await taxa.inputValue());
  ok(await aba("Taxa por dentro").getAttribute("aria-selected") === "true", "aplicar template troca o método");
  await digitar(valor, "100000");
  ok(await resultado() === "R$ 1.092,90", "1.000 por dentro 8,5% = 1.092,90", await resultado());

  // 10. Template sobrevive ao recarregar
  await abrirEstavel(p, `${SITE}/taxas`, 6000);
  await p.getByRole("button", { name: /^\[TESTE\] Taxa do Meta/ }).waitFor({ timeout: 15_000 });
  ok(true, "template continua depois de recarregar a página");

  // 11. Excluir e desfazer
  await p.getByRole("button", { name: "Excluir template [TESTE] Taxa do Meta" }).click();
  await p.getByRole("button", { name: /^\[TESTE\] Taxa do Meta/ }).waitFor({ state: "detached", timeout: 15_000 });
  ok((await noBanco()).length === 0, "excluir apaga do banco");
  await p.getByRole("button", { name: "Desfazer" }).click();
  await p.getByRole("button", { name: /^\[TESTE\] Taxa do Meta/ }).waitFor({ timeout: 15_000 });
  banco = await noBanco();
  ok(banco.length === 1 && Number(banco[0].taxa) === 8.5 && banco[0].metodo === "dentro", "desfazer devolve o template igual", banco);
  await p.getByRole("button", { name: "Excluir template [TESTE] Taxa do Meta" }).click();
  await p.getByRole("button", { name: /^\[TESTE\] Taxa do Meta/ }).waitFor({ state: "detached", timeout: 15_000 });
  ok(await p.getByText("Nenhum template ainda").isVisible(), "lista vazia mostra a dica");

  // 12. Salvar fica desligado sem nome ou sem taxa
  await taxa.fill("");
  await p.getByLabel("Nome do template").fill("x");
  ok(await p.getByRole("button", { name: /Salvar template/ }).isDisabled(), "salvar desligado sem taxa");

  // 13. Visual no computador
  await digitar(valor, "250000"); await digitar(taxa, "13,15"); await aba("Taxa por fora").click();
  await p.getByLabel("Nome do template").fill("");
  await p.screenshot({ path: process.env.TEMP + "/taxas-desktop.png" });
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "sem rolagem horizontal no computador");

  // 14. Menu lateral leva à calculadora
  await abrirEstavel(p, `${SITE}/notas`, 5000);
  await p.getByRole("link", { name: "Calculadora de taxas" }).first().click();
  await p.waitForURL(/\/taxas$/, { timeout: 15_000 });
  ok(true, "item 'Calculadora de taxas' do menu abre /taxas");

  // 15. Celular
  const cel = await (await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  cel.on("pageerror", (e) => erros.push("pageerror(cel): " + e.message));
  await abrirEstavel(cel, `${SITE}/taxas`, 6000);
  await cel.locator("#taxa-valor").pressSequentially("100000", { delay: 15 });
  await cel.locator("#taxa-pct").pressSequentially("13,15", { delay: 15 });
  ok(norm(await cel.getByTestId("resultado").innerText()) === "R$ 1.131,50", "celular calcula igual");
  ok(await cel.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "sem rolagem horizontal no celular", await cel.evaluate(() => document.documentElement.scrollWidth));
  const [yr, yv] = await cel.evaluate(() => [document.querySelector('[data-testid=resultado]').getBoundingClientRect().top, document.querySelector("#taxa-valor").getBoundingClientRect().top]);
  ok(yr < yv, "no celular o resultado fica acima dos campos", { yr, yv });
  await cel.screenshot({ path: process.env.TEMP + "/taxas-celular.png" });

  ok(erros.length === 0, "sem erro no console", erros);
} finally {
  await limpar();
  await nav.close();
}
console.log(falhou ? "\nTESTE FALHOU" : "\nTUDO CERTO");
process.exit(falhou ? 1 : 0);
