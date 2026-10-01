import test from "node:test";
import assert from "node:assert/strict";
import { aplicarVerbaPrincipal, MSG_VERBA_TOTAL_PERIODO } from "./verbaPrincipal.ts";

const cfg = (verba: number, metodo_pagamento = "pix") => ({ verba, metodo_pagamento });

function cliente() {
  return {
    id: "c1",
    nome: "Cliente Teste",
    trafego_ativo: false,
    em_onboarding: true,
    operacoes: [
      {
        id: "op-1",
        nome: "Principal",
        objetivo: "Vendas",
        moeda: "USD",
        tipo_verba: "mensal",
        data_inicio_verba: "",
        data_limite_verba: "",
        plataformas: ["Meta", "Google"],
        plataformas_config: { Meta: cfg(3000, "boleto"), Google: cfg(1500, "cartao") },
        verba_diaria: 120,
      },
      {
        id: "op-2",
        nome: "E-commerce",
        moeda: "BRL",
        tipo_verba: "mensal",
        plataformas: ["TikTok"],
        plataformas_config: { TikTok: cfg(400) },
        verba_diaria: null,
      },
    ],
  };
}

test("plataforma existente: só troca a verba e mantém a forma de pagamento", () => {
  const novo = aplicarVerbaPrincipal(cliente(), "Meta", 4500);
  assert.deepEqual(novo.operacoes[0].plataformas_config.Meta, cfg(4500, "boleto"));
  assert.deepEqual(novo.operacoes[0].plataformas, ["Meta", "Google"]);
});

test("plataforma nova: entra em plataformas e em plataformas_config com Pix", () => {
  const novo = aplicarVerbaPrincipal(cliente(), "TikTok", 900);
  assert.deepEqual(novo.operacoes[0].plataformas, ["Meta", "Google", "TikTok"]);
  assert.deepEqual(novo.operacoes[0].plataformas_config.TikTok, cfg(900, "pix"));
});

test("as outras plataformas da operação ficam intactas", () => {
  const novo = aplicarVerbaPrincipal(cliente(), "Meta", 4500);
  assert.deepEqual(novo.operacoes[0].plataformas_config.Google, cfg(1500, "cartao"));
});

test("não muda tipo_verba, moeda, verba diária manual nem os demais campos da operação", () => {
  const novo = aplicarVerbaPrincipal(cliente(), "Meta", 4500);
  const op = novo.operacoes[0];
  assert.equal(op.tipo_verba, "mensal");
  assert.equal(op.moeda, "USD");
  assert.equal(op.verba_diaria, 120);
  assert.equal(op.id, "op-1");
  assert.equal(op.nome, "Principal");
  assert.equal(op.objetivo, "Vendas");
});

test("não mexe nas outras operações nem nos campos do cliente", () => {
  const original = cliente();
  const novo = aplicarVerbaPrincipal(original, "Meta", 4500);
  assert.equal(novo.operacoes[1], original.operacoes[1]);
  assert.equal(novo.nome, "Cliente Teste");
  assert.equal(novo.trafego_ativo, false);
  assert.equal(novo.em_onboarding, true);
  assert.equal(novo.id, "c1");
});

test("não altera o objeto recebido", () => {
  const original = cliente();
  const antes = JSON.stringify(original);
  aplicarVerbaPrincipal(original, "TikTok", 900);
  assert.equal(JSON.stringify(original), antes);
});

test("sem nenhuma operação: cria a Principal com os padrões do formulário (BRL, mensal)", () => {
  const novo = aplicarVerbaPrincipal({ nome: "Novo", operacoes: [] as any[] }, "Meta", 2000);
  assert.equal(novo.operacoes.length, 1);
  assert.deepEqual(novo.operacoes[0], {
    nome: "Principal",
    objetivo: "",
    moeda: "BRL",
    tipo_verba: "mensal",
    data_inicio_verba: "",
    data_limite_verba: "",
    plataformas: ["Meta"],
    plataformas_config: { Meta: cfg(2000, "pix") },
    verba_diaria: null,
  });
});

test("operação por período total é recusada, com a mensagem combinada", () => {
  const c = cliente();
  c.operacoes[0].tipo_verba = "total_periodo";
  assert.throws(() => aplicarVerbaPrincipal(c, "Meta", 4500), { message: MSG_VERBA_TOTAL_PERIODO });
  assert.equal(MSG_VERBA_TOTAL_PERIODO, "Esta operação é por período total. Ajuste a verba no cadastro do cliente.");
  // nada foi alterado
  assert.deepEqual(c.operacoes[0].plataformas_config.Meta, cfg(3000, "boleto"));
});

test("só a primeira operação conta: período total na segunda não impede", () => {
  const c = cliente();
  c.operacoes[1].tipo_verba = "total_periodo";
  const novo = aplicarVerbaPrincipal(c, "Meta", 4500);
  assert.equal(novo.operacoes[0].plataformas_config.Meta?.verba, 4500);
  assert.equal(novo.operacoes[1].tipo_verba, "total_periodo");
});
