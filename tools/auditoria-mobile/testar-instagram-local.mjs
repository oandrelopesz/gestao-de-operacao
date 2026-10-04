// Teste REAL (@kobegrowth, autorizado): edita o post com erro de localização, troca o lugar por uma página com ponto no
// mapa, reenvia, espera publicar, confere e exclui. Uso: node testar-instagram-local.mjs <pasta-dos-prints> <nome do lugar>
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { CHROME, abrirEstavel } from "./rotas.mjs";

const [SP, lugar] = process.argv.slice(2);
const env = readFileSync(new URL("../../.env", import.meta.url), "utf8");
const URL_SB = /VITE_SUPABASE_URL="([^"]+)"/.exec(env)[1];
const CHAVE = /VITE_SUPABASE_PUBLISHABLE_KEY="([^"]+)"/.exec(env)[1];
const rest = (q) => fetch(`${URL_SB}/rest/v1/${q}`, { headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}` } }).then((r) => r.json());
const ok = (nome, cond) => console.log(cond ? "OK " : "FALHOU ", nome);

const navegador = await chromium.launch({ executablePath: CHROME });
const p = await navegador.newPage({ viewport: { width: 1366, height: 900 } });
await abrirEstavel(p, "https://gestao.andrelopes.digital/instagram");
await p.getByRole("tab", { name: /Posts/ }).click();
const linha = p.locator("div.divide-y > div").filter({ hasText: "Teste do sistema de agendamento" }).filter({ hasText: "Erro" }).first();
await linha.waitFor({ timeout: 30000 });
const [alvo] = await rest("ig_posts?select=id&status=eq.erro&legenda=like.*agendamento*&order=created_at.desc&limit=1");
await linha.getByRole("button", { name: "Editar" }).click();
const d = p.getByRole("dialog").first();
await d.getByText("Editar post de @kobegrowth").waitFor();
await d.getByRole("button", { name: /GitGuard|Adicionar localização/ }).click();
await p.getByRole("button", { name: new RegExp(lugar) }).first().click();
ok("modo Agora (horário já passou)", (await d.getByRole("button", { name: "Agora", exact: true }).getAttribute("aria-pressed")) === "true");
await p.screenshot({ path: `${SP}/local-editar.png` });
await d.getByRole("button", { name: "Salvar alterações" }).click();
await d.waitFor({ state: "detached", timeout: 30000 });

let post;
for (const fim = Date.now() + 5 * 60 * 1000; Date.now() < fim;) {
  [post] = await rest(`ig_posts?select=id,status,erro,permalink,local_nome,legenda&id=eq.${alvo.id}`);
  if (["publicado", "erro"].includes(post.status)) break;
  await new Promise((r) => setTimeout(r, 10000));
}
ok(`foto com localização "${post.local_nome}": ${post.status} ${post.permalink ?? post.erro ?? ""}`, post.status === "publicado");
if (post.status === "publicado") {
  const r = await fetch(`${URL_SB}/functions/v1/instagram`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "excluir", id: post.id }) }).then((x) => x.json());
  ok("excluído", r.ok === true);
}
await navegador.close();
