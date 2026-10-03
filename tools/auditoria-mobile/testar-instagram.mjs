// Aba Instagram no servidor local (porta 5188): lista com Postar, busca, tela de postagem (conferências e prévia),
// contas visíveis (liga e desliga de volta) e Admin → Instagram. O envio ao R2 falha no localhost (CORS): esperado.
// Uso: node testar-instagram.mjs <pasta-dos-prints>
import { chromium } from "playwright-core";
import { CHROME, abrirEstavel } from "./rotas.mjs";
const SP = process.argv[2];
const navegador = await chromium.launch({ executablePath: CHROME });
const p = await navegador.newPage({ viewport: { width: 1366, height: 900 } });
const erros = [];
p.on("pageerror", (e) => erros.push(e.message));
const ok = (nome, cond) => console.log(cond ? "OK " : "FALHOU ", nome);

await abrirEstavel(p, "http://localhost:5188/instagram");
await p.getByRole("button", { name: "Postar" }).first().waitFor({ timeout: 30000 });
const total = await p.getByRole("button", { name: "Postar" }).count();
ok(`lista com Postar (${total} contas)`, total > 10);

await p.getByLabel("Buscar conta").fill("kobegrowth");
await p.waitForTimeout(500);
ok("busca acha @kobegrowth", (await p.getByRole("button", { name: "Postar" }).count()) >= 1 && (await p.getByText("@kobegrowth").count()) === 1);
await p.getByRole("button", { name: "Postar" }).first().click();
await p.getByText("Postar em @kobegrowth").waitFor();
ok("tela de postagem abre na conta", true);

// Imagens de teste geradas no navegador: 1080x1350 (ok) e 1080x1920 (fora do feed)
const png = async (w, h) => Buffer.from(await p.evaluate(([w, h]) => {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"); g.fillStyle = "#0ea5e9"; g.fillRect(0, 0, w, h); g.fillStyle = "#fff"; g.font = "120px sans-serif"; g.fillText(`${w}x${h}`, 80, 300);
  return c.toDataURL("image/png").split(",")[1];
}, [w, h]), "base64");
const entrada = p.locator('input[type="file"]');
await entrada.setInputFiles([{ name: "a.png", mimeType: "image/png", buffer: await png(1080, 1350) }]);
await p.waitForTimeout(1500);
ok("1 imagem vira prévia de foto", (await p.locator("img[src^='blob:']").count()) >= 2);
await entrada.setInputFiles([{ name: "b.png", mimeType: "image/png", buffer: await png(1080, 1920) }]);
await p.waitForTimeout(1500);
ok("aviso de proporção da imagem 2", (await p.getByText(/A imagem 2 tem proporção 0,56:1/).count()) === 1);
ok("carrossel com contador 1/2", (await p.getByText("1/2").count()) === 1);
await p.getByLabel("Legenda").fill("Teste #um #dois");
ok("contadores da legenda", (await p.getByText(/15\/2200 caracteres · 2\/30 hashtags/).count()) === 1);
await p.getByRole("button", { name: "Agendar" }).first().click();
ok("campo de data e hora", (await p.getByLabel("Data e hora (Brasília)").count()) === 1);
const salvar = p.getByRole("dialog").getByRole("button", { name: /Agendar|Enviando mídias/ }).last();
ok("botão travado com erro", await salvar.isDisabled());
await p.screenshot({ path: `${SP}/ig-postar.png` });
await p.getByRole("button", { name: "Cancelar" }).click();

// Contas visíveis: desliga uma e liga de volta
await p.getByLabel("Buscar conta").fill("");
await p.getByRole("button", { name: "Contas visíveis" }).click();
const chave = p.getByRole("switch", { name: /Mostrar Moopi/ });
await chave.click();
await p.waitForTimeout(800);
await p.keyboard.press("Escape");
await p.waitForTimeout(500);
ok("conta desligada some da lista", (await p.getByText("@kobegrowth").count()) === 0);
await p.getByRole("button", { name: "Contas visíveis" }).click();
await p.getByRole("switch", { name: /Mostrar Moopi/ }).click();
await p.waitForTimeout(800);
await p.keyboard.press("Escape");
await p.waitForTimeout(500);
ok("religada volta para a lista", (await p.getByText("@kobegrowth").count()) === 1);

await p.getByRole("tab", { name: /Posts/ }).click();
ok("aba Posts", (await p.getByText(/Nenhum post ainda|@/).count()) > 0);
await p.screenshot({ path: `${SP}/ig-contas.png` });

await abrirEstavel(p, "http://localhost:5188/admin?secao=instagram");
await p.getByText("Contas visíveis").first().waitFor({ timeout: 20000 });
ok("Admin → Instagram com chaves", (await p.getByRole("switch").count()) > 10);
await p.screenshot({ path: `${SP}/ig-admin.png` });
console.log("erros:", erros.join(" | ") || "nenhum");
await navegador.close();
