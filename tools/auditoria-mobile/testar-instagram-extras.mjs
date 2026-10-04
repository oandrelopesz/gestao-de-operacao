// Testes REAIS que faltavam (@kobegrowth e a página dela no Facebook; autorização do André): publica e apaga no fim.
//   1. Facebook com várias fotos (álbum), só no Facebook
//   2. Facebook com vídeo, só no Facebook
//   3. Reels no Instagram com capa por imagem, nome do áudio e sem aparecer no feed
// Uso: node testar-instagram-extras.mjs <pasta com carrossel-1/2/3.png, video-45.mp4, video-916.mp4> <pasta dos prints>
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { CHROME, abrirEstavel } from "./rotas.mjs";

const [pasta, SP] = process.argv.slice(2);
const env = readFileSync(new URL("../../.env", import.meta.url), "utf8");
const URL_SB = /VITE_SUPABASE_URL="([^"]+)"/.exec(env)[1];
const CHAVE = /VITE_SUPABASE_PUBLISHABLE_KEY="([^"]+)"/.exec(env)[1];
const MARCA = `[X${String(Date.now()).slice(-5)}]`;
const inicio = new Date().toISOString();
const ok = (nome, cond) => console.log(cond ? "OK " : "FALHOU ", nome);
const rest = (q, init = {}) => fetch(`${URL_SB}/rest/v1/${q}`, { ...init, headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, ...(init.headers ?? {}) } }).then((r) => r.json());
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
async function publicar(d) {
  await esperarBotao("Publicar agora");
  await d.getByRole("button", { name: "Publicar agora", exact: true }).click();
  await d.waitFor({ state: "detached", timeout: 60000 });
}
async function soFacebook(d) {
  await d.getByRole("checkbox").nth(1).click(); // liga o Facebook
  await d.getByRole("checkbox").nth(0).click(); // tira o Instagram
}

const SO_REELS = !!process.env.SO_REELS; // SO_REELS=1: só o teste 3
// 1) Álbum no Facebook
if (!SO_REELS) {
  const d = await abrirPostar();
  await soFacebook(d);
  await d.locator('input[type="file"][multiple]').setInputFiles([`${pasta}/carrossel-1.png`, `${pasta}/carrossel-2.png`]);
  await d.getByLabel("Legenda").fill(`${MARCA} Álbum de teste no Facebook (será apagado).`);
  await publicar(d);
  ok("álbum do Facebook enviado", true);
}
// 2) Vídeo no Facebook
if (!SO_REELS) {
  const d = await abrirPostar();
  await soFacebook(d);
  await d.locator('input[type="file"][multiple]').setInputFiles(`${pasta}/video-45.mp4`);
  await d.getByLabel("Legenda").fill(`${MARCA} Vídeo de teste no Facebook (será apagado).`);
  await publicar(d);
  ok("vídeo do Facebook enviado", true);
}
// 3) Reels com capa por imagem, nome do áudio e fora do feed
{
  const d = await abrirPostar();
  await d.locator('input[type="file"][multiple]').setInputFiles(`${pasta}/video-916.mp4`);
  await esperarBotao("Publicar agora");
  await d.getByRole("switch", { name: /Mostrar o reels também no feed/ }).click();
  await d.getByRole("button", { name: /Opções avançadas/ }).click();
  await d.locator('input[type="file"]:not([multiple])').setInputFiles(`${pasta}/carrossel-3.png`);
  await d.getByLabel("Nome do áudio original").fill("Áudio de teste Kobe");
  await d.getByLabel("Legenda").fill(`${MARCA} Reels de teste com capa e áudio (será apagado).`);
  await d.locator("img[src*='functions/v1/r2']").first().waitFor({ timeout: 60000 }); // capa enviada
  await p.screenshot({ path: `${SP}/extras-reels.png` });
  await publicar(d);
  ok("reels com capa e áudio enviado", true);
}

let linhas = [];
for (const fim = Date.now() + 8 * 60 * 1000; Date.now() < fim;) {
  linhas = await rest(`ig_posts?select=id,rede,tipo,status,erro,aviso,permalink,reels_no_feed,opcoes,midias&created_at=gte.${encodeURIComponent(inicio)}&order=created_at`);
  if (linhas.length >= (SO_REELS ? 1 : 3) && linhas.every((l) => ["publicado", "erro"].includes(l.status))) break;
  await new Promise((r) => setTimeout(r, 15000));
}
for (const l of linhas) {
  const extra = l.tipo === "reels" && l.rede === "instagram"
    ? `capa: ${l.opcoes?.capa_chave ? "sim" : "não"} · áudio: ${l.opcoes?.audio_nome ?? "-"} · no feed: ${l.reels_no_feed}` : `${l.midias.length} mídia(s)`;
  ok(`${l.rede} ${l.tipo} ${l.status} ${l.permalink ?? ""} · ${extra} ${l.erro ?? ""} ${l.aviso ?? ""}`, l.status === "publicado" && (l.tipo !== "reels" || l.rede !== "instagram" || (!!l.opcoes?.capa_chave && !!l.opcoes?.audio_nome)));
}
for (const l of linhas.filter((x) => x.status === "publicado")) {
  const r = await funcao({ acao: "excluir", id: l.id });
  ok(`excluído ${l.rede} ${l.tipo}`, r.ok === true);
}
// Tira da lista os registros deste teste
await fetch(`${URL_SB}/rest/v1/ig_posts?created_at=gte.${encodeURIComponent(inicio)}&status=in.(excluido,erro,cancelado)`, { method: "DELETE", headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}` } });
console.log("erros:", erros.join(" | ") || "nenhum");
await navegador.close();
