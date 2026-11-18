// Confere o botão Agendar e o painel Agendadas das Demandas. Cria "[TESTE] agendada ..." para daqui a 60 dias,
// confere que ela aparece no painel e não no quadro, e apaga pelo próprio painel (não deixa rastro).
// Uso: SITE=http://127.0.0.1:5199 node --import ./sessao-teste.mjs testar-agendadas.mjs
import { chromium } from "playwright-core";
import { CHROME, abrirEstavel } from "./rotas.mjs";

const SITE = process.env.SITE || "https://gestao.andrelopes.digital";
const TITULO = `[TESTE] agendada ${Date.now()}`;
const daqui = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const nav = await chromium.launch({ executablePath: CHROME });
let falhou = false;
const ok = (c, m) => { console.log(c ? "ok  " : "FALHA", m); if (!c) falhou = true; };
try {
  const p = await (await nav.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  p.on("pageerror", (e) => { console.log("  pageerror:", e.message.slice(0, 200)); falhou = true; });

  await abrirEstavel(p, `${SITE}/`, 3000);
  await p.getByRole("button", { name: /^Agendar$/ }).click();
  const dialogo = p.getByRole("dialog");
  await dialogo.getByText("Agendar tarefa").first().waitFor({ timeout: 15000 });
  ok(await dialogo.getByText("Coluna", { exact: true }).count() === 0, "formulário de agendar não pede coluna");
  await dialogo.getByPlaceholder("O que precisa ser feito?").fill(TITULO);
  await dialogo.locator('input[type="date"]').fill(daqui(60));
  await dialogo.getByRole("button", { name: /^Agendar$/ }).click();
  await p.getByText(/Agendada para/).first().waitFor({ timeout: 15000 });
  await p.waitForTimeout(1500);
  ok(await p.getByText(TITULO).count() === 0, "agendada não aparece no quadro");

  await p.getByRole("button", { name: /^Agendadas/ }).click();
  const linha = p.locator("li", { hasText: TITULO });
  await linha.waitFor({ timeout: 15000 });
  ok(/desce para o quadro em/.test(await linha.innerText()), "painel mostra quando a tarefa desce");
  await p.screenshot({ path: process.env.TEMP + "/agendadas-painel.png" });

  await linha.getByRole("button", { name: "Excluir" }).click();
  await p.getByRole("alertdialog").getByRole("button", { name: "Remover" }).click();
  await linha.waitFor({ state: "detached", timeout: 15000 });
  ok(true, "excluir pelo painel apaga a agendada");
} finally {
  await nav.close();
}
process.exit(falhou ? 1 : 0);
