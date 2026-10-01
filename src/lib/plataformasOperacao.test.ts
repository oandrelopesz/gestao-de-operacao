import test from "node:test";
import assert from "node:assert/strict";
import { semPlataforma, renomearChavePlataforma, MSG_ULTIMA_PLATAFORMA } from "./plataformasOperacao.ts";

const cfg = (verba: number, metodo_pagamento = "pix") => ({ verba, metodo_pagamento });

function cliente() {
  return {
    nome: "Cliente Teste",
    trafego_ativo: true,
    operacoes: [
      {
        id: "op-1",
        nome: "Canal YouTube",
        plataformas: ["Meta", "Google"],
        plataformas_config: { Meta: cfg(3000), Google: cfg(1500, "boleto") },
      },
      {
        id: "op-2",
        nome: "E-commerce",
        plataformas: ["Meta", "TikTok"],
        plataformas_config: { Meta: cfg(800), TikTok: cfg(400) },
      },
    ],
  };
}

test("semPlataforma tira a plataforma de plataformas e de plataformas_config da operação certa", () => {
  const novo = semPlataforma(cliente(), "op-1", "Google");
  assert.deepEqual(novo.operacoes[0].plataformas, ["Meta"]);
  assert.deepEqual(novo.operacoes[0].plataformas_config, { Meta: cfg(3000) });
});

test("semPlataforma não mexe nas outras operações, mesmo com a mesma plataforma", () => {
  const original = cliente();
  const novo = semPlataforma(original, "op-1", "Meta");
  assert.deepEqual(novo.operacoes[0].plataformas, ["Google"]);
  assert.deepEqual(novo.operacoes[0].plataformas_config, { Google: cfg(1500, "boleto") });
  // a operação 2 continua com a Meta e a mesma verba
  assert.deepEqual(novo.operacoes[1], original.operacoes[1]);
  assert.equal(novo.operacoes[1], original.operacoes[1]);
});

test("semPlataforma não mexe nas outras plataformas nem nos demais campos", () => {
  const novo = semPlataforma(cliente(), "op-2", "TikTok");
  assert.equal(novo.nome, "Cliente Teste");
  assert.equal(novo.trafego_ativo, true);
  assert.equal(novo.operacoes[1].nome, "E-commerce");
  assert.equal(novo.operacoes[1].id, "op-2");
  assert.deepEqual(novo.operacoes[1].plataformas, ["Meta"]);
  assert.deepEqual(novo.operacoes[1].plataformas_config, { Meta: cfg(800) });
});

test("semPlataforma não altera o objeto recebido", () => {
  const original = cliente();
  semPlataforma(original, "op-1", "Google");
  assert.deepEqual(original, cliente());
});

test("semPlataforma sem id de operação usa a primeira operação", () => {
  const novo = semPlataforma(cliente(), null, "Google");
  assert.deepEqual(novo.operacoes[0].plataformas, ["Meta"]);
  assert.deepEqual(novo.operacoes[1].plataformas, ["Meta", "TikTok"]);
  const semId = semPlataforma(cliente(), undefined, "Meta");
  assert.deepEqual(semId.operacoes[0].plataformas, ["Google"]);
});

test("semPlataforma recusa a última plataforma da operação, sem devolver valores", () => {
  const unica = {
    operacoes: [{ id: "op-1", plataformas: ["Meta"], plataformas_config: { Meta: cfg(100) } }],
  };
  assert.throws(() => semPlataforma(unica, "op-1", "Meta"), { message: MSG_ULTIMA_PLATAFORMA });
  assert.equal(
    MSG_ULTIMA_PLATAFORMA,
    "Esta é a única plataforma da operação. Para parar, desligue o tráfego no cadastro do cliente.",
  );
  // só vale para a operação escolhida: na outra operação a mesma plataforma pode sair
  const duas = {
    operacoes: [
      { id: "a", plataformas: ["Meta"], plataformas_config: { Meta: cfg(1) } },
      { id: "b", plataformas: ["Meta", "Google"], plataformas_config: { Meta: cfg(2), Google: cfg(3) } },
    ],
  };
  assert.throws(() => semPlataforma(duas, "a", "Meta"), { message: MSG_ULTIMA_PLATAFORMA });
  assert.deepEqual(semPlataforma(duas, "b", "Meta").operacoes[1].plataformas, ["Google"]);
});

test("semPlataforma recusa plataforma que não está na operação", () => {
  assert.throws(() => semPlataforma(cliente(), "op-1", "TikTok"), /TikTok/);
});

test("semPlataforma recusa operação que não está no cadastro", () => {
  assert.throws(() => semPlataforma(cliente(), "op-9", "Meta"), /operação/i);
  assert.throws(() => semPlataforma({ operacoes: [] }, null, "Meta"), /operação/i);
});

test("semPlataforma aceita a lista de plataformas de uma conta antiga combinada", () => {
  const original = {
    operacoes: [
      { id: "op-1", plataformas: ["Meta", "Google", "TikTok"], plataformas_config: { Meta: cfg(1), Google: cfg(2), TikTok: cfg(3) } },
    ],
  };
  const novo = semPlataforma(original, "op-1", ["Meta", "Google"]);
  assert.deepEqual(novo.operacoes[0].plataformas, ["TikTok"]);
  assert.deepEqual(novo.operacoes[0].plataformas_config, { TikTok: cfg(3) });
  // tirar todas as plataformas da operação é tirar a última
  assert.throws(() => semPlataforma(original, "op-1", ["Meta", "Google", "TikTok"]), { message: MSG_ULTIMA_PLATAFORMA });
});

test("renomearChavePlataforma renomeia a chave mantendo o valor e a posição", () => {
  const config = { Meta: cfg(3000), Google: cfg(1500, "boleto"), TikTok: cfg(400) };
  const novo = renomearChavePlataforma(config, "Google", "Google Ads");
  assert.deepEqual(novo, { Meta: cfg(3000), "Google Ads": cfg(1500, "boleto"), TikTok: cfg(400) });
  assert.deepEqual(Object.keys(novo), ["Meta", "Google Ads", "TikTok"]);
  // o original fica como estava
  assert.deepEqual(Object.keys(config), ["Meta", "Google", "TikTok"]);
});

test("renomearChavePlataforma devolve o mesmo objeto quando não há a chave antiga", () => {
  const config = { Meta: cfg(3000) };
  assert.equal(renomearChavePlataforma(config, "Google", "Google Ads"), config);
  assert.deepEqual(config, { Meta: cfg(3000) });
});

test("renomearChavePlataforma não sobrescreve quando o nome novo já existe", () => {
  const config = { Meta: cfg(3000), "Meta Ads": cfg(10) };
  const novo = renomearChavePlataforma(config, "Meta", "Meta Ads");
  assert.equal(novo, config);
  assert.deepEqual(novo, { Meta: cfg(3000), "Meta Ads": cfg(10) });
});

test("renomearChavePlataforma com o mesmo nome não muda nada", () => {
  const config = { Meta: cfg(3000) };
  assert.equal(renomearChavePlataforma(config, "Meta", "Meta"), config);
});

test("renomearChavePlataforma tolera config vazia, nula ou de formato estranho", () => {
  assert.equal(renomearChavePlataforma(null, "Meta", "Meta Ads"), null);
  assert.equal(renomearChavePlataforma(undefined, "Meta", "Meta Ads"), undefined);
  const lista: unknown[] = [];
  assert.equal(renomearChavePlataforma(lista, "Meta", "Meta Ads"), lista);
  const vazio = {};
  assert.equal(renomearChavePlataforma(vazio, "Meta", "Meta Ads"), vazio);
  assert.equal(renomearChavePlataforma("texto", "Meta", "Meta Ads"), "texto");
});
