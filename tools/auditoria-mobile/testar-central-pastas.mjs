// Testa no site a Central de arquivos com pastas: envia uma pasta [TESTE] com subpastas, navega, renomeia,
// baixa a pasta em .zip e apaga tudo pela própria tela. (O R2 só aceita envio vindo do site, não do localhost.)
import { chromium } from "playwright-core";
import { readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { CHROME, abrirEstavel } from "./rotas.mjs";

const SITE = process.env.SITE || "https://gestao.andrelopes.digital";
const env = Object.fromEntries(readFileSync("../../.env", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const H = { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + env.VITE_SUPABASE_PUBLISHABLE_KEY };
const [cliente] = await fetch(env.VITE_SUPABASE_URL + "/rest/v1/clientes?select=id,nome&arquivado=eq.false&order=nome&limit=1", { headers: H }).then((r) => r.json());
console.log("cliente:", cliente.nome);

const dir = process.env.TEMP + "/central-teste/pasta-teste";
rmSync(process.env.TEMP + "/central-teste", { recursive: true, force: true });
mkdirSync(dir + "/sub/fundo", { recursive: true });
writeFileSync(dir + "/a.txt", "texto A");
writeFileSync(dir + "/sub/b.docx", "falso docx");
writeFileSync(dir + "/sub/fundo/c.pdf", "falso pdf");
writeFileSync(dir + "/.DS_Store", "lixo");

const nav = await chromium.launch({ executablePath: CHROME });
let falhou = false;
const ok = (c, m) => { console.log(c ? "ok  " : "FALHA", m); if (!c) falhou = true; };
try {
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on("console", (m) => { if (m.type() === "error" && !/GSI|403|FedCM|identity|accounts list/.test(m.text())) console.log("  console:", m.text().slice(0, 200)); });
  const url = `${SITE}/central?cliente=${cliente.id}`;
  await abrirEstavel(p, url, 4000);
  for (let i = 0; i < 24 && !(await p.getByRole("button", { name: "Enviar pasta inteira" }).count()); i++) {
    await p.waitForTimeout(10000);
    await p.goto(url);
    await p.waitForTimeout(3000);
  }
  ok(await p.getByRole("button", { name: "Enviar pasta inteira" }).count() > 0, "botão Enviar pasta no ar");

  await p.locator('input[type=file]').nth(1).setInputFiles(dir);
  await p.getByText("3 arquivos").first().waitFor({ timeout: 60000 });
  ok(true, "pasta enviada: card 'pasta-teste' com 3 arquivos (.DS_Store ignorado)");
  await p.getByText("pasta-teste", { exact: true }).first().click();
  await p.getByText("a.txt", { exact: true }).waitFor();
  ok(await p.getByText("sub", { exact: true }).count() > 0, "dentro: subpasta 'sub' e arquivo a.txt");

  // renomear
  await p.locator("div.group, div").filter({ hasText: /^a\.txt/ }).first().getByLabel("Renomear").first().click();
  await p.getByRole("dialog").getByRole("textbox").fill("renomeado");
  await p.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
  await p.getByText("renomeado.txt", { exact: true }).waitFor({ timeout: 20000 });
  ok(true, "renomeado para renomeado.txt (extensão mantida)");

  // baixar um arquivo no formato original
  const [dl1] = await Promise.all([p.waitForEvent("download"), p.getByRole("button", { name: "Baixar", exact: true }).first().click()]);
  ok(dl1.suggestedFilename() === "renomeado.txt", "download do arquivo: " + dl1.suggestedFilename());

  // zip da pasta
  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("button", { name: "Baixar pasta (.zip)" }).click()]);
  const zipPath = process.env.TEMP + "/central-teste/" + dl.suggestedFilename();
  await dl.saveAs(zipPath);
  console.log("zip:", dl.suggestedFilename());
  ok(dl.suggestedFilename() === "pasta-teste.zip", "zip com o nome da pasta");

  // navegar até a subpasta funda e voltar pelo caminho
  await p.getByText("sub", { exact: true }).first().click();
  await p.getByText("fundo", { exact: true }).first().waitFor();
  await p.getByText("fundo", { exact: true }).first().click();
  await p.getByText("c.pdf", { exact: true }).waitFor();
  ok(true, "subpasta de subpasta abre e mostra c.pdf");
  await p.screenshot({ path: process.env.TEMP + "/central-teste/funda.png" });

  // apagar a pasta toda pela tela
  await p.getByRole("button", { name: cliente.nome }).click();
  await p.getByText("pasta-teste", { exact: true }).first().waitFor();
  await p.getByLabel("Apagar a pasta pasta-teste").click();
  await p.getByRole("alertdialog").getByRole("button", { name: "Apagar" }).click();
  await p.getByText("pasta-teste", { exact: true }).first().waitFor({ state: "detached", timeout: 20000 });
  ok(true, "pasta apagada pela tela");
  console.log("ZIP:", zipPath);
} finally {
  await nav.close();
}
process.exit(falhou ? 1 : 0);
