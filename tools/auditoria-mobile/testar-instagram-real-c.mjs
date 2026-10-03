// Testes REAIS no site no ar (autorização do André, 03/10/2026, conta @kobegrowth):
//   story  : publica agora um story com a imagem recortada em 9:16 pelo sistema
//   editar : agenda um post para daqui a 30 min, edita a legenda, cancela e remove (nada é publicado)
//   excluir: exclui da rede o post publicado cujo link contém <trecho do permalink>
// Uso: node testar-instagram-real-c.mjs <pasta-dos-arquivos> <pasta-dos-prints> <story|editar|excluir> [trecho do permalink]
import { chromium } from "playwright-core";
import { CHROME, abrirEstavel } from "./rotas.mjs";
const [pasta, SP, modo, link] = process.argv.slice(2);
const navegador = await chromium.launch({ executablePath: CHROME });
const p = await navegador.newPage({ viewport: { width: 1366, height: 900 } });
const erros = [];
p.on("pageerror", (e) => erros.push(e.message));
const ok = (nome, cond) => console.log(cond ? "OK " : "FALHOU ", nome);
const avisos = async () => (await p.locator("[data-sonner-toast]").allInnerTexts()).map((t) => t.replace(/\s+/g, " ")).join(" | ");
await abrirEstavel(p, "https://gestao.andrelopes.digital/instagram");
await p.getByRole("button", { name: "Contas visíveis" }).waitFor({ timeout: 60000 });

async function abrirPostar() {
  await p.getByRole("tab", { name: /Contas/ }).click();
  await p.getByLabel("Buscar conta").fill("kobegrowth");
  await p.waitForTimeout(600);
  await p.getByRole("button", { name: "Postar" }).first().click();
  const d = p.getByRole("dialog").first();
  await d.getByText("Postar em @kobegrowth").waitFor();
  return d;
}
const esperarBotao = (d, rotulo) => p.waitForFunction((r) => {
  const b = [...document.querySelectorAll('[role="dialog"] button')].find((x) => x.textContent?.trim() === r);
  return b && !b.disabled;
}, rotulo, { timeout: 180000 });

if (modo === "story") {
  const d = await abrirPostar();
  await d.getByRole("button", { name: "Story", exact: true }).click();
  await d.locator('input[type="file"][multiple]').setInputFiles(`${pasta}/carrossel-2.png`);
  await esperarBotao(d, "Publicar agora");
  await d.getByRole("button", { name: "9:16", exact: true }).click();
  await p.waitForTimeout(1500);
  await esperarBotao(d, "Publicar agora");
  await p.screenshot({ path: `${SP}/ig-real-story-antes.png` });
  await d.getByRole("button", { name: "Publicar agora", exact: true }).click();
  await d.waitFor({ state: "detached", timeout: 30000 });
  await p.getByRole("tab", { name: /Posts/ }).click();
  const limite = Date.now() + 4 * 60 * 1000;
  let linha = "";
  while (Date.now() < limite) {
    linha = (await p.locator("div.divide-y > div").filter({ hasText: "Story" }).first().innerText().catch(() => "")).replace(/\s+/g, " ");
    if (/Publicado|Erro/.test(linha)) break;
    await p.waitForTimeout(8000);
  }
  console.log("story:", linha);
  ok("story publicado", /Publicado/.test(linha));
}

if (modo === "editar") {
  const d = await abrirPostar();
  await d.locator('input[type="file"][multiple]').setInputFiles(`${pasta}/post-1.png`);
  await d.getByLabel("Legenda").fill("[TESTE] agendado para editar e cancelar");
  await d.getByRole("button", { name: "Agendar", exact: true }).click();
  const quando = await p.evaluate(() => {
    const t = new Date(Date.now() + 30 * 60 * 1000); const z = (n) => String(n).padStart(2, "0");
    return `${t.getFullYear()}-${z(t.getMonth() + 1)}-${z(t.getDate())}T${z(t.getHours())}:${z(t.getMinutes())}`;
  });
  await d.getByLabel("Data e hora (Brasília)").fill(quando);
  await esperarBotao(d, "Agendar post");
  await d.getByRole("button", { name: "Agendar post", exact: true }).click();
  await d.waitFor({ state: "detached", timeout: 30000 });
  await p.getByRole("tab", { name: /Posts/ }).click();
  const linha = p.locator("div.divide-y > div").filter({ hasText: "[TESTE] agendado" }).first();
  await linha.waitFor({ timeout: 30000 });
  ok("agendado aparece na lista", /Agendado/.test(await linha.innerText()));
  await linha.getByRole("button", { name: "Editar" }).click();
  const e = p.getByRole("dialog").first();
  await e.getByText("Editar post de @kobegrowth").waitFor();
  await e.getByLabel("Legenda").fill("[TESTE] agendado e editado");
  await e.getByRole("button", { name: "Salvar alterações" }).click();
  await e.waitFor({ state: "detached", timeout: 30000 });
  const editada = p.locator("div.divide-y > div").filter({ hasText: "[TESTE] agendado e editado" }).first();
  await editada.waitFor({ timeout: 30000 });
  ok("edição salva", true);
  await editada.getByRole("button", { name: "Cancelar" }).click();
  await editada.getByText("Cancelado").waitFor({ timeout: 30000 });
  ok("cancelado", true);
  await editada.getByRole("button", { name: "Remover" }).click();
  await editada.waitFor({ state: "detached", timeout: 30000 });
  ok("removido da lista", true);
}

if (modo === "facebook") {
  // Uma foto no Instagram e no Facebook ao mesmo tempo, com primeiro comentário e comentários desativados (Instagram)
  const d = await abrirPostar();
  await d.getByRole("checkbox").nth(1).click(); // Facebook
  await d.locator('input[type="file"][multiple]').setInputFiles(`${pasta}/carrossel-3.png`);
  await d.getByLabel("Primeiro comentário (opcional)").fill("Teste do sistema (será apagado)");
  await d.getByRole("button", { name: /Opções avançadas/ }).click();
  await d.getByRole("switch", { name: /Desativar comentários/ }).click();
  await esperarBotao(d, "Publicar agora");
  await p.screenshot({ path: `${SP}/ig-real-facebook-antes.png` });
  await d.getByRole("button", { name: "Publicar agora", exact: true }).click();
  await d.waitFor({ state: "detached", timeout: 30000 });
  await p.getByRole("tab", { name: /Posts/ }).click();
  const limite = Date.now() + 4 * 60 * 1000;
  let linhas = [];
  while (Date.now() < limite) {
    linhas = (await p.locator("div.divide-y > div").allInnerTexts()).slice(0, 2).map((t) => t.replace(/\s+/g, " "));
    if (linhas.length === 2 && linhas.every((l) => /Publicado|Erro/.test(l))) break;
    await p.waitForTimeout(8000);
  }
  linhas.forEach((l) => console.log("linha:", l));
}

if (modo === "excluir") {
  await p.getByRole("tab", { name: /Posts/ }).click();
  const linha = p.locator("div.divide-y > div").filter({ has: p.locator(`a[href*="${link}"]`) }).first();
  await linha.waitFor({ timeout: 30000 });
  await linha.getByRole("button", { name: "Excluir" }).click();
  await p.getByText(/Excluir do Instagram\?/).waitFor();
  await p.getByRole("alertdialog").getByRole("button", { name: "Excluir" }).click();
  await p.locator("[data-sonner-toast]").first().waitFor({ timeout: 60000 }).catch(() => {});
  console.log("avisos:", await avisos());
  await p.waitForTimeout(3000);
  console.log("linha:", (await linha.innerText().catch(() => "(saiu)")).replace(/\s+/g, " "));
}
await p.screenshot({ path: `${SP}/ig-real-${modo}.png` });
console.log("erros:", erros.join(" | ") || "nenhum");
await navegador.close();
