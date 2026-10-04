// Bateria REAL no site no ar (conta @kobegrowth; autorização do André, 04/10/2026). Publica de verdade e apaga no fim:
//   1. foto agendada para daqui a 3 min, com legenda e hashtags, localização (página GitGuard da BM) e texto alternativo
//   2. carrossel com 2 fotos e 1 vídeo (4:5)
//   3. reels passando pelo editor (filtro Vívido + início do trecho em 0,5 s, exportado no navegador)
//   4. story em vídeo
// Confere no banco, fotografa o calendário (computador e celular) e exclui tudo pela função.
// Uso: node testar-instagram-completo.mjs <pasta com post-1.png, carrossel-1/2.png, video-45.mp4, video-916.mp4> <pasta dos prints>
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { CHROME, abrirEstavel } from "./rotas.mjs";

const [pasta, SP] = process.argv.slice(2);
const env = readFileSync(new URL("../../.env", import.meta.url), "utf8");
const URL_SB = /VITE_SUPABASE_URL="([^"]+)"/.exec(env)[1];
const CHAVE = /VITE_SUPABASE_PUBLISHABLE_KEY="([^"]+)"/.exec(env)[1];
const MARCA = `[T${String(Date.now()).slice(-5)}]`;
const inicio = new Date().toISOString();
const ok = (nome, cond) => console.log(cond ? "OK " : "FALHOU ", nome);
const rest = (q) => fetch(`${URL_SB}/rest/v1/${q}`, { headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}` } }).then((r) => r.json());
const funcao = (corpo) => fetch(`${URL_SB}/functions/v1/instagram`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }).then((r) => r.json());

const navegador = await chromium.launch({ executablePath: CHROME });
const p = await navegador.newPage({ viewport: { width: 1366, height: 900 } });
const erros = [];
p.on("pageerror", (e) => erros.push(e.message));
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
const esperarBotao = (rotulo) => p.waitForFunction((r) => {
  const b = [...document.querySelectorAll('[role="dialog"] button')].find((x) => x.textContent?.trim() === r);
  return b && !b.disabled;
}, rotulo, { timeout: 240000 });
async function publicar(d, rotulo) {
  await esperarBotao(rotulo);
  await d.getByRole("button", { name: rotulo, exact: true }).click();
  await d.waitFor({ state: "detached", timeout: 60000 });
}

// 1) Foto agendada: legenda com hashtags, localização e texto alternativo
{
  const d = await abrirPostar();
  await d.locator('input[type="file"][multiple]').setInputFiles(`${pasta}/post-1.png`);
  await esperarBotao("Publicar agora");
  await d.getByRole("button", { name: "Editar a mídia 1" }).click();
  const ed = p.getByRole("dialog").filter({ hasText: "Editar foto" });
  await ed.getByRole("button", { name: "Texto alternativo" }).click();
  await ed.getByLabel(/Texto alternativo/).fill("Arte da Kobe Growth com o título sobre métricas de salão de festas");
  await ed.getByRole("button", { name: "Aplicar" }).click();
  await ed.waitFor({ state: "detached", timeout: 30000 });
  await d.getByLabel("Legenda").fill(`${MARCA} Teste do sistema de agendamento (será apagado). #kobegrowth #teste #marketingdigital`);
  await d.getByRole("button", { name: /Adicionar localização/ }).click();
  await p.getByRole("button", { name: /GitGuard/ }).first().click();
  await d.getByRole("button", { name: "Agendar", exact: true }).click();
  const quando = await p.evaluate(() => {
    const t = new Date(Date.now() + 3 * 60 * 1000); const z = (n) => String(n).padStart(2, "0");
    return `${t.getFullYear()}-${z(t.getMonth() + 1)}-${z(t.getDate())}T${z(t.getHours())}:${z(t.getMinutes())}`;
  });
  await d.getByLabel("Data e hora (Brasília)").fill(quando);
  await p.screenshot({ path: `${SP}/completo-1-foto.png` });
  await publicar(d, "Agendar post");
  ok(`foto agendada para ${quando}`, true);
}

// 2) Carrossel com 2 fotos e 1 vídeo
{
  const d = await abrirPostar();
  await d.locator('input[type="file"][multiple]').setInputFiles([`${pasta}/carrossel-1.png`, `${pasta}/carrossel-2.png`, `${pasta}/video-45.mp4`]);
  await d.getByLabel("Legenda").fill(`${MARCA} Carrossel de teste com vídeo (será apagado). #teste`);
  await publicar(d, "Publicar agora");
  ok("carrossel com vídeo enviado", true);
}

// 3) Reels pelo editor: filtro e trecho
{
  const d = await abrirPostar();
  await d.locator('input[type="file"][multiple]').setInputFiles(`${pasta}/video-916.mp4`);
  await esperarBotao("Publicar agora");
  await d.getByRole("button", { name: "Editar a mídia 1" }).click();
  const ev = p.getByRole("dialog").filter({ hasText: "Editar vídeo" });
  await ev.getByRole("button", { name: "Filtros" }).click();
  await ev.getByRole("button", { name: /Vívido/ }).click();
  await ev.getByRole("button", { name: "Trecho e som" }).click();
  await ev.getByRole("slider").nth(0).focus();
  for (let i = 0; i < 5; i++) await p.keyboard.press("ArrowRight");
  await ev.getByRole("button", { name: "Aplicar" }).click();
  await ev.waitFor({ state: "detached", timeout: 180000 });
  await d.getByLabel("Legenda").fill(`${MARCA} Reels de teste editado no sistema (será apagado). #teste #reels`);
  await p.screenshot({ path: `${SP}/completo-3-reels.png` });
  await publicar(d, "Publicar agora");
  ok("reels editado enviado", true);
}

// 4) Story em vídeo
{
  const d = await abrirPostar();
  await d.getByRole("button", { name: "Story", exact: true }).click();
  await d.locator('input[type="file"][multiple]').setInputFiles(`${pasta}/video-916.mp4`);
  await publicar(d, "Publicar agora");
  ok("story em vídeo enviado", true);
}

// Espera tudo publicar (a foto agendada sai pelo relógio)
const limite = Date.now() + 10 * 60 * 1000;
let linhas = [];
while (Date.now() < limite) {
  linhas = await rest(`ig_posts?select=id,tipo,rede,status,erro,aviso,permalink,local_nome,legenda,midias&created_at=gte.${encodeURIComponent(inicio)}&order=created_at`);
  if (linhas.length >= 4 && linhas.every((l) => ["publicado", "erro"].includes(l.status))) break;
  await new Promise((r) => setTimeout(r, 15000));
}
for (const l of linhas) {
  const extra = [l.local_nome && `local: ${l.local_nome}`, l.midias?.[0]?.alt_text && "com texto alternativo", l.erro, l.aviso].filter(Boolean).join(" · ");
  ok(`${l.tipo} ${l.status} ${l.permalink ?? ""} ${extra}`, l.status === "publicado");
}

// Calendário: computador e celular
await p.reload();
await p.getByRole("tab", { name: "Calendário" }).click();
const hoje = await p.evaluate(() => new Date().getDate());
const celula = p.getByRole("button", { name: new RegExp(`^${hoje} de `) });
ok(`calendário mostra os posts de hoje (${await celula.getAttribute("aria-label")})`, /[4-9]\d* posts|\d{2} posts/.test((await celula.getAttribute("aria-label")) ?? ""));
await p.screenshot({ path: `${SP}/completo-calendario.png` });
await p.setViewportSize({ width: 390, height: 844 });
await p.waitForTimeout(800);
await p.screenshot({ path: `${SP}/completo-calendario-celular.png` });
const largo = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
ok("calendário no celular sem rolar para o lado", !largo);

// Limpeza: exclui tudo o que foi publicado neste teste
for (const l of linhas.filter((x) => x.status === "publicado")) {
  const r = await funcao({ acao: "excluir", id: l.id });
  ok(`excluído ${l.tipo}`, r.ok === true);
}
console.log("erros:", erros.join(" | ") || "nenhum");
await navegador.close();
