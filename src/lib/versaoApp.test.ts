import test from "node:test";
import assert from "node:assert/strict";
import { versaoDoHtml, decidirAoVoltar, AUSENCIA_MINIMA_MS } from "./versaoApp.ts";

test("versaoDoHtml: pega o nome do bundle principal publicado", () => {
  assert.equal(versaoDoHtml('<link rel="modulepreload" href="/assets/main-CG8qXbvs.js"/>'), "main-CG8qXbvs.js");
  assert.equal(versaoDoHtml('<script>import("/assets/main-Ab_9-x.js")</script>'), "main-Ab_9-x.js");
  // servidor de desenvolvimento não tem bundle com hash: sem versão, sem checagem
  assert.equal(versaoDoHtml('<script type="module" src="/@vite/client"></script>'), null);
});

const base = { ausenteMs: AUSENCIA_MINIMA_MS + 1, versaoAtual: "main-A.js", versaoNova: "main-A.js", celular: true, janelaAberta: false };

test("decidirAoVoltar: ausência curta não faz nada", () => {
  assert.equal(decidirAoVoltar({ ...base, ausenteMs: 5_000 }), "nada");
});

test("decidirAoVoltar: versão nova recarrega o app no celular e só avisa no computador", () => {
  assert.equal(decidirAoVoltar({ ...base, versaoNova: "main-B.js" }), "recarregar-app");
  assert.equal(decidirAoVoltar({ ...base, versaoNova: "main-B.js", celular: false }), "avisar-versao");
});

test("decidirAoVoltar: com janela aberta nunca recarrega (só avisa), para não perder o que está sendo digitado", () => {
  assert.equal(decidirAoVoltar({ ...base, versaoNova: "main-B.js", janelaAberta: true }), "avisar-versao");
  assert.equal(decidirAoVoltar({ ...base, janelaAberta: true }), "nada");
});

test("decidirAoVoltar: mesma versão atualiza os dados da tela no celular; no computador fica como está", () => {
  assert.equal(decidirAoVoltar(base), "recarregar-pagina");
  assert.equal(decidirAoVoltar({ ...base, celular: false }), "nada");
});

test("decidirAoVoltar: sem versão conhecida (dev ou falha de rede) só atualiza os dados no celular", () => {
  assert.equal(decidirAoVoltar({ ...base, versaoAtual: null }), "recarregar-pagina");
  assert.equal(decidirAoVoltar({ ...base, versaoNova: null }), "recarregar-pagina");
});
