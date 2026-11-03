// Testa na aba Arquivos as várias descrições por arquivo (nome + texto + copiar).
// Local (padrão): cria linhas [TESTE-DESC] pela API e testa card, copiar, editar, arquivo antigo, busca e o popup de envio.
// No site (SITE=https://gestao.andrelopes.digital UPLOAD=1): também envia um arquivo de verdade com duas descrições e apaga pela tela.
import { chromium } from "playwright-core";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { CHROME, abrirEstavel } from "./rotas.mjs";

const SITE = process.env.SITE || "http://localhost:5178";
const UPLOAD = process.env.UPLOAD === "1";
const env = Object.fromEntries(readFileSync("../../.env", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const REST = env.VITE_SUPABASE_URL + "/rest/v1/pdfs";
const H = { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + env.VITE_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" };
const api = {
  inserir: (linha) => fetch(REST, { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(linha) }).then((r) => r.json()).then((j) => { if (!Array.isArray(j)) throw new Error(JSON.stringify(j)); return j[0]; }),
  ler: (id) => fetch(`${REST}?id=eq.${id}&select=nome,observacoes,descricoes`, { headers: H }).then((r) => r.json()).then((j) => j[0]),
  limpar: () => fetch(`${REST}?nome=like.*TESTE-DESC*`, { method: "DELETE", headers: H }),
};

const base = (k) => ({ arquivo_nome: "teste.txt", storage_path: `arquivos/teste-desc-falso-${k}.txt`, tamanho: 10, pasta_id: null });
const D1 = { id: "d1", titulo: "Legenda", texto: "linha 1\nlinha 2" };
const D2 = { id: "d2", titulo: "Link", texto: "https://exemplo.com/abc" };

let falhou = false;
const ok = (c, m) => { console.log(c ? "ok  " : "FALHA", m); if (!c) falhou = true; };

mkdirSync(process.env.TEMP + "/desc-teste", { recursive: true });
await api.limpar();
const A = await api.inserir({ ...base("A"), nome: "[TESTE-DESC] A", descricoes: [D1, D2], observacoes: "Legenda\nlinha 1\nlinha 2\n\nLink\nhttps://exemplo.com/abc" });
const B = await api.inserir({ ...base("B"), nome: "[TESTE-DESC] B", observacoes: "obs antiga" });
const C = await api.inserir({ ...base("C"), nome: "[TESTE-DESC] C" });

const nav = await chromium.launch({ executablePath: CHROME });
try {
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(SITE).origin });
  const p = await ctx.newPage();
  const clip = async (esperado) => { let v = ""; for (let i = 0; i < 30; i++) { v = await p.evaluate(() => navigator.clipboard.readText()); if (v.split(String.fromCharCode(13)).join("") === esperado) { if (v !== esperado) console.log("  (clipboard do Windows devolveu CRLF; texto igual)"); return true; } await p.waitForTimeout(100); } console.log("  clipboard veio:", JSON.stringify(v), "esperado:", JSON.stringify(esperado)); return false; };
  p.on("console", (m) => { if (m.type() === "error" && !/GSI|403|FedCM|identity|accounts list|R2|r2/.test(m.text())) console.log("  console:", m.text().slice(0, 200)); });
  await abrirEstavel(p, `${SITE}/arquivos`, 4000);
  const busca = p.getByPlaceholder("Buscar arquivo em todas as pastas...");
  for (let i = 0; i < 20 && !(await busca.count()); i++) { await p.waitForTimeout(5000); await p.goto(`${SITE}/arquivos`); }
  await busca.fill("TESTE-DESC");
  const linha = (nome) => p.getByText(nome, { exact: true }).first().locator("xpath=ancestor::div[.//button[@title='Mais opções']][1]");
  await linha("[TESTE-DESC] A").waitFor({ timeout: 60000 });

  // --- card com duas descrições
  const a = linha("[TESTE-DESC] A");
  ok((await a.getByTitle("Ver a descrição").innerText()).includes("Legenda: linha 1 (+1)"), "prévia fechada: nome, 1ª linha e (+1)");
  await a.getByTitle("Ver a descrição").click();
  ok(await a.getByTestId("descricao-card-item").count() === 2, "gaveta aberta mostra as 2 descrições");
  const textos = await a.getByTestId("descricao-card-item").allInnerTexts();
  ok(textos[0].includes("Legenda") && textos[0].includes("linha 1") && textos[1].includes("Link") && textos[1].includes("https://exemplo.com/abc"), "cada descrição com seu nome e texto");
  await a.screenshot({ path: process.env.TEMP + "/desc-teste/card-aberto.png" });
  await a.getByTestId("copiar-descricao").nth(1).click();
  ok(await clip(D2.texto), "copiar da 2ª descrição copia só o texto dela");
  ok((await a.getByTestId("copiar-descricao").nth(1).innerText()).includes("Copiado"), "botão mostra 'Copiado'");
  await a.getByTestId("copiar-descricao").nth(0).click();
  ok(await clip(D1.texto), "copiar da 1ª preserva a quebra de linha");

  // --- arquivo antigo (só observações)
  const b = linha("[TESTE-DESC] B");
  ok((await b.getByTitle("Ver a descrição").innerText()).includes("Observações: obs antiga"), "arquivo antigo aparece como descrição 'Observações'");
  // --- arquivo sem descrição
  ok(await linha("[TESTE-DESC] C").getByTitle("Ver a descrição").count() === 0, "sem descrição: sem gaveta");

  // --- editar A: remove a 1ª, altera a 2ª, acrescenta uma 3ª
  const editar = async (nome) => {
    await linha(nome).getByTitle("Mais opções").click();
    await p.getByRole("menuitem", { name: /^Editar/ }).click();
    await p.getByRole("dialog").waitFor();
    return p.getByRole("dialog");
  };
  let dlg = await editar("[TESTE-DESC] A");
  const itens = () => dlg.getByTestId("descricao-item");
  ok(await itens().count() === 2, "editar abre com as 2 descrições");
  ok(await itens().nth(0).getByLabel("Nome da descrição").inputValue() === "Legenda" && await itens().nth(1).getByLabel("Texto da descrição").inputValue() === D2.texto, "campos vêm preenchidos");
  await dlg.screenshot({ path: process.env.TEMP + "/desc-teste/editar.png" });
  await itens().nth(1).getByTestId("copiar-descricao").click();
  ok(await clip(D2.texto), "copiar também funciona dentro do editar");
  await itens().nth(0).getByLabel("Remover esta descrição").click();
  ok(await itens().count() === 1, "remover tira a descrição da lista");
  await itens().nth(0).getByLabel("Texto da descrição").fill("https://novo.com");
  await dlg.getByTestId("adicionar-descricao").click();
  await itens().nth(1).getByLabel("Nome da descrição").fill("Roteiro");
  await itens().nth(1).getByLabel("Texto da descrição").fill("Cena 1\nCena 2");
  await dlg.getByTestId("adicionar-descricao").click(); // 3ª vazia: deve ser descartada ao salvar
  ok(await itens().count() === 3, "adicionar cria uma descrição nova");
  await dlg.getByRole("button", { name: "Salvar" }).click();
  await p.getByRole("dialog").waitFor({ state: "detached", timeout: 20000 });
  let r = await api.ler(A.id);
  ok(r.descricoes.length === 2 && r.descricoes[0].titulo === "Link" && r.descricoes[0].texto === "https://novo.com" && r.descricoes[1].titulo === "Roteiro", "banco guardou 2 (a vazia foi descartada), na ordem");
  ok(r.observacoes === "Link\nhttps://novo.com\n\nRoteiro\nCena 1\nCena 2", "observacoes guarda o resumo de todas");
  { const t = await linha("[TESTE-DESC] A").getByTestId("descricao-card-item").allInnerTexts(); ok(t.length === 2 && t[0].includes("https://novo.com") && t[1].includes("Roteiro") && t[1].includes("Cena 2"), "card atualizou sem recarregar"); }

  // --- busca acha pelo nome e pelo texto de uma descrição
  await busca.fill("Roteiro");
  await linha("[TESTE-DESC] A").waitFor({ timeout: 20000 });
  ok(await p.getByText("[TESTE-DESC] B", { exact: true }).count() === 0, "busca pelo nome da descrição acha o arquivo certo");
  await busca.fill("Cena 2");
  await linha("[TESTE-DESC] A").waitFor({ timeout: 20000 });
  ok(true, "busca pelo texto da descrição acha o arquivo");
  await busca.fill("TESTE-DESC");

  // --- recarrega: persistiu
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.getByPlaceholder("Buscar arquivo em todas as pastas...").fill("TESTE-DESC");
  await linha("[TESTE-DESC] A").waitFor({ timeout: 60000 });
  await linha("[TESTE-DESC] A").getByTitle("Ver a descrição").click();
  ok(await linha("[TESTE-DESC] A").getByTestId("descricao-card-item").count() === 2, "depois de recarregar continuam as 2 descrições");

  // --- editar B (antigo): vira lista com 1 item, que dá para editar
  dlg = await editar("[TESTE-DESC] B");
  ok(await itens().count() === 1 && await itens().nth(0).getByLabel("Nome da descrição").inputValue() === "Observações" && await itens().nth(0).getByLabel("Texto da descrição").inputValue() === "obs antiga", "arquivo antigo abre com 1 descrição 'Observações'");
  await itens().nth(0).getByLabel("Nome da descrição").fill("Nota");
  await dlg.getByRole("button", { name: "Salvar" }).click();
  await p.getByRole("dialog").waitFor({ state: "detached", timeout: 20000 });
  r = await api.ler(B.id);
  ok(r.descricoes.length === 1 && r.descricoes[0].titulo === "Nota" && r.descricoes[0].texto === "obs antiga" && r.observacoes === "Nota\nobs antiga", "arquivo antigo migrou para descricoes ao salvar");

  // --- editar C (sem nada): abre com 1 vazia; salvar sem digitar não grava lixo
  dlg = await editar("[TESTE-DESC] C");
  ok(await itens().count() === 1, "sem descrição: abre com 1 campo vazio pronto para digitar");
  await dlg.getByRole("button", { name: "Salvar" }).click();
  await p.getByRole("dialog").waitFor({ state: "detached", timeout: 20000 });
  r = await api.ler(C.id);
  ok(r.descricoes.length === 0 && r.observacoes === null, "salvar vazio não grava descrição");

  // --- apagar todas de A
  dlg = await editar("[TESTE-DESC] A");
  await itens().nth(1).getByLabel("Remover esta descrição").click();
  await itens().nth(0).getByLabel("Remover esta descrição").click();
  ok(await itens().count() === 0, "dá para remover todas");
  await dlg.getByRole("button", { name: "Salvar" }).click();
  await p.getByRole("dialog").waitFor({ state: "detached", timeout: 20000 });
  r = await api.ler(A.id);
  ok(r.descricoes.length === 0 && r.observacoes === null, "sem nenhuma, banco fica limpo");
  ok(await linha("[TESTE-DESC] A").getByTitle(/descrição/).count() === 0, "card some com a gaveta");

  // --- popup de adicionar: várias descrições por arquivo
  mkdirSync(process.env.TEMP + "/desc-teste", { recursive: true });
  const arq = process.env.TEMP + "/desc-teste/TESTE-DESC-envio.txt";
  writeFileSync(arq, "conteudo de teste");
  await p.locator("input[type=file][multiple]").first().setInputFiles(arq);
  dlg = p.getByRole("dialog");
  await dlg.getByTestId("descricao-item").first().waitFor();
  ok(await dlg.getByTestId("descricao-item").count() === 1, "popup de adicionar abre com 1 descrição pronta");
  await dlg.getByTestId("adicionar-descricao").click();
  ok(await dlg.getByTestId("descricao-item").count() === 2, "popup de adicionar permite mais de uma");
  await p.screenshot({ path: process.env.TEMP + "/desc-teste/popup-adicionar.png" });
  if (UPLOAD) {
    await dlg.getByTestId("descricao-item").nth(0).getByLabel("Nome da descrição").fill("Legenda");
    await dlg.getByTestId("descricao-item").nth(0).getByLabel("Texto da descrição").fill("Texto da legenda");
    await dlg.getByTestId("descricao-item").nth(1).getByLabel("Nome da descrição").fill("Roteiro");
    await dlg.getByTestId("descricao-item").nth(1).getByLabel("Texto da descrição").fill("Texto do roteiro");
    await dlg.getByLabel("Tema / pasta").click().catch(() => {});
    // escolhe a primeira pasta disponível
    await p.getByRole("option").first().click().catch(() => {});
    await dlg.getByRole("button", { name: "Guardar arquivo" }).click();
    await p.getByText("TESTE-DESC-envio", { exact: false }).first().waitFor({ timeout: 90000 });
    const [novo] = await fetch(`${REST}?nome=like.*TESTE-DESC-envio*&select=id,descricoes,observacoes,storage_path`, { headers: H }).then((x) => x.json());
    ok(novo && novo.descricoes.length === 2 && novo.descricoes[0].titulo === "Legenda" && novo.descricoes[1].texto === "Texto do roteiro", "envio real gravou as 2 descrições");
    console.log("  (arquivo de teste enviado; apague pela tela: Excluir)");
  } else {
    await dlg.getByRole("button", { name: "Cancelar" }).click();
  }
  await p.screenshot({ path: process.env.TEMP + "/desc-teste/final.png" });
} finally {
  await api.limpar();
  await nav.close();
}
process.exit(falhou ? 1 : 0);
