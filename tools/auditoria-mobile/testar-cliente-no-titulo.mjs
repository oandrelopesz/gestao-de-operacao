// Demandas com o nome do cliente no título: confere a atribuição automática no adicionar rápido (banco e selo no card)
// e no formulário "Nova" (campo preenchido ao digitar, gravado ao salvar, e escolha à mão que o título não desfaz).
// Uso: node testar-cliente-no-titulo.mjs [http://localhost:5178/]. Cria demandas [TESTE] e apaga todas no fim.
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { CHROME, abrirEstavel } from "./rotas.mjs";
import { clientesNoTitulo } from "../../src/lib/clienteNoTitulo.ts";
const env = Object.fromEntries(readFileSync("../../.env", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const H = { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + env.VITE_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" };
const api = (path, init) => fetch(env.VITE_SUPABASE_URL + "/rest/v1/" + path, { headers: H, ...init }).then((r) => (r.status === 204 ? null : r.json()));
const URL_APP = process.argv[2] || "http://localhost:5178/";

const clientes = await api("clientes?select=id,nome");
// Um cliente que o próprio nome reconhece sozinho, sem ambiguidade com outro cliente
const alvo = clientes.find((c) => { const r = clientesNoTitulo(c.nome, clientes); return r.length === 1 && r[0] === c.id; });
console.log("cliente do teste:", alvo.nome);
const T_RAPIDO = `[TESTE] rapido ${alvo.nome}`;
const T_SEM = "[TESTE] rapido sem cliente qwzx";
const T_FORM = `[TESTE] form ${alvo.nome}`;
const falhas = [];
const confere = (ok, msg) => { console.log(`${ok ? "OK   " : "FALHA"} ${msg}`); if (!ok) falhas.push(msg); };
const buscar = async (titulo) => (await api(`demandas?select=id,cliente_id,clientes_extras,pessoal&titulo=eq.${encodeURIComponent(titulo)}`))[0];

const nav = await chromium.launch({ executablePath: CHROME });
try {
  const p = await (await nav.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await abrirEstavel(p, URL_APP, 6000);

  // 1) Adicionar rápido no Standby (coluna sem regra de data)
  const coluna = p.locator("div", { has: p.getByText("Standby", { exact: true }) }).filter({ has: p.getByRole("button", { name: "Novo" }) }).last();
  await coluna.getByRole("button", { name: "Novo" }).click();
  const entrada = coluna.getByPlaceholder("Nova tarefa...");
  for (const t of [T_RAPIDO, T_SEM]) { await entrada.fill(t); await entrada.press("Enter"); await p.waitForTimeout(1500); }
  const d1 = await buscar(T_RAPIDO);
  const d2 = await buscar(T_SEM);
  confere(d1?.cliente_id === alvo.id, `adicionar rápido "${T_RAPIDO}" grava o cliente (veio ${d1?.cliente_id})`);
  confere(!!d2 && d2.cliente_id === null, `adicionar rápido "${T_SEM}" fica sem cliente`);
  const selo = p.locator(`[title=${JSON.stringify("Cliente: " + alvo.nome)}]`);
  const card = p.locator("div", { hasText: T_RAPIDO }).filter({ has: selo }).last();
  confere(await card.waitFor({ timeout: 5000 }).then(() => true, () => false), "selo do cliente aparece no card do adicionar rápido");

  // 2) Formulário "Nova": preenche ao digitar, limpa quando o nome sai, grava ao salvar
  const dialogo = p.getByRole("dialog");
  const campoTitulo = dialogo.getByPlaceholder("O que precisa ser feito?");
  const campoCliente = dialogo.locator("div", { has: p.getByText("Cliente(s)", { exact: true }) }).last().locator("button").first();
  await p.getByRole("button", { name: "Nova", exact: true }).click();
  await campoTitulo.pressSequentially(T_FORM, { delay: 10 });
  confere((await campoCliente.innerText()).trim() === alvo.nome, `formulário: digitar o título preenche Cliente(s) com ${alvo.nome} (mostra "${(await campoCliente.innerText()).trim()}")`);
  await campoTitulo.fill("[TESTE] form nada");
  confere((await campoCliente.innerText()).trim() === "Sem cliente (opcional)", "formulário: tirar o nome do título limpa o cliente");
  await campoTitulo.fill(T_FORM);
  await dialogo.getByRole("button", { name: "Criar Demanda" }).click();
  await p.waitForTimeout(1500);
  confere((await buscar(T_FORM))?.cliente_id === alvo.id, "formulário: salvar grava o cliente reconhecido");

  // 3) Escolha à mão vence: depois de Pessoal, o título não mexe mais no campo (fecha sem salvar)
  await p.getByRole("button", { name: "Nova", exact: true }).click();
  await campoTitulo.fill(`${T_FORM} manual`);
  await campoCliente.click();
  await p.getByRole("option", { name: "Pessoal" }).click();
  await campoTitulo.fill(`${T_FORM} manual de novo`);
  confere((await campoCliente.innerText()).trim() === "Pessoal", "formulário: depois da escolha à mão, o título não troca o cliente");
  await p.keyboard.press("Escape");
} finally {
  for (const prefixo of ["[TESTE] rapido", "[TESTE] form"]) {
    await api(`demandas?titulo=like.${encodeURIComponent(prefixo + "*")}`, { method: "DELETE" }).catch(() => {});
  }
  await nav.close();
  console.log("demandas de teste apagadas");
}
console.log(falhas.length ? `${falhas.length} falha(s)` : "tudo certo");
process.exitCode = falhas.length ? 1 : 0;
