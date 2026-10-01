import test from "node:test";
import assert from "node:assert/strict";
import { semPlataforma, renomearChavePlataforma, comMetodoDasContas, MSG_ULTIMA_PLATAFORMA } from "./plataformasOperacao.ts";

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

// ---------- comMetodoDasContas ----------

const conta = (extra: Record<string, unknown> = {}) => ({
  operacao_id: "op-1",
  plataformas: ["Meta"],
  metodo_pagamento: "cartao",
  ativo: true,
  ...extra,
});

test("comMetodoDasContas: conta ativa com cartão vence a configuração pix da operação", () => {
  const config = { Meta: cfg(3000, "pix"), Google: cfg(1500, "boleto") };
  const novo = comMetodoDasContas(config, [conta()], "op-1");
  assert.deepEqual(novo.Meta, cfg(3000, "cartao"));
  // quem não tem conta continua como está
  assert.deepEqual(novo.Google, cfg(1500, "boleto"));
});

test("comMetodoDasContas: conta inativa não vence a configuração", () => {
  const config = { Meta: cfg(3000, "pix") };
  const novo = comMetodoDasContas(config, [conta({ ativo: false })], "op-1");
  assert.deepEqual(novo.Meta, cfg(3000, "pix"));
});

test("comMetodoDasContas: plataforma sem conta mantém a configuração", () => {
  const config = { Meta: cfg(3000, "pix"), TikTok: cfg(400, "boleto") };
  const novo = comMetodoDasContas(config, [conta()], "op-1");
  assert.deepEqual(novo.TikTok, cfg(400, "boleto"));
});

test("comMetodoDasContas: contas de outra operação não interferem", () => {
  const config = { Meta: cfg(3000, "pix") };
  const novo = comMetodoDasContas(config, [conta({ operacao_id: "op-2" })], "op-1");
  assert.deepEqual(novo.Meta, cfg(3000, "pix"));
});

test("comMetodoDasContas: conta antiga com várias plataformas vale para cada uma delas", () => {
  const config = { Meta: cfg(3000, "pix"), Google: cfg(1500, "pix"), TikTok: cfg(400, "pix") };
  const novo = comMetodoDasContas(config, [conta({ plataformas: ["Meta", "Google"], metodo_pagamento: "boleto" })], "op-1");
  assert.equal(novo.Meta.metodo_pagamento, "boleto");
  assert.equal(novo.Google.metodo_pagamento, "boleto");
  assert.equal(novo.TikTok.metodo_pagamento, "pix");
});

test("comMetodoDasContas: só troca o método, a verba da configuração fica", () => {
  const novo = comMetodoDasContas({ Meta: cfg(3000, "pix") }, [conta()], "op-1");
  assert.equal(novo.Meta.verba, 3000);
});

test("comMetodoDasContas: ignora método vazio ou desconhecido e conta sem lista de plataformas", () => {
  const config = { Meta: cfg(3000, "pix") };
  assert.deepEqual(comMetodoDasContas(config, [conta({ metodo_pagamento: null })], "op-1").Meta, cfg(3000, "pix"));
  assert.deepEqual(comMetodoDasContas(config, [conta({ metodo_pagamento: "cheque" })], "op-1").Meta, cfg(3000, "pix"));
  assert.deepEqual(comMetodoDasContas(config, [conta({ plataformas: null })], "op-1").Meta, cfg(3000, "pix"));
});

test("comMetodoDasContas: com duas contas ativas na mesma plataforma vale a primeira da lista", () => {
  const config = { Meta: cfg(3000, "pix") };
  const novo = comMetodoDasContas(config, [conta({ metodo_pagamento: "boleto" }), conta({ metodo_pagamento: "cartao" })], "op-1");
  assert.equal(novo.Meta.metodo_pagamento, "boleto");
});

test("comMetodoDasContas: não altera o objeto recebido", () => {
  const config = { Meta: cfg(3000, "pix") };
  const copia = structuredClone(config);
  comMetodoDasContas(config, [conta()], "op-1");
  assert.deepEqual(config, copia);
});
