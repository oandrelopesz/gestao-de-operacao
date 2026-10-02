import test from "node:test";
import assert from "node:assert/strict";
import { intervaloDoPeriodo, agregar, dataLocalBrasilia, chaveDaConclusao, agregarPorAgencia, entreguesComAtraso } from "./dashboard.ts";
import type { Conclusao } from "./dashboard.ts";

test("intervaloDoPeriodo com N dias", () => {
  assert.deepEqual(intervaloDoPeriodo("7", "2026-09-23"), { de: "2026-09-17", ate: "2026-09-23" });
  assert.deepEqual(intervaloDoPeriodo("14", "2026-09-23"), { de: "2026-09-10", ate: "2026-09-23" });
  assert.deepEqual(intervaloDoPeriodo("30", "2026-09-23"), { de: "2026-08-25", ate: "2026-09-23" });
});

test("intervaloDoPeriodo tudo", () => {
  assert.deepEqual(intervaloDoPeriodo("tudo", "2026-09-23"), { de: null, ate: null });
});

test("intervaloDoPeriodo personalizado vazio", () => {
  assert.deepEqual(intervaloDoPeriodo("personalizado", "2026-09-23"), { de: null, ate: null });
});

test("intervaloDoPeriodo personalizado com de e ate", () => {
  assert.deepEqual(intervaloDoPeriodo("personalizado", "2026-09-23", "2026-09-01", "2026-09-10"), {
    de: "2026-09-01",
    ate: "2026-09-10",
  });
});

test("intervaloDoPeriodo personalizado só com de", () => {
  assert.deepEqual(intervaloDoPeriodo("personalizado", "2026-09-23", "2026-09-01"), {
    de: "2026-09-01",
    ate: null,
  });
});

test("agregar com clientes, pessoal e sem cliente", () => {
  const clientes = [
    { id: "A", nome: "Cliente A" },
    { id: "B", nome: "Cliente B" },
  ];
  const conclusoes: Conclusao[] = [
    { cliente_id: "A", pessoal: false, concluida_em: "2026-09-20T12:00:00Z" },
    { cliente_id: "A", pessoal: false, concluida_em: "2026-09-21T12:00:00Z" },
    { cliente_id: "A", pessoal: false, concluida_em: "2026-09-22T12:00:00Z" },
    { cliente_id: null, pessoal: true, concluida_em: "2026-09-20T12:00:00Z" },
    { cliente_id: null, pessoal: false, concluida_em: "2026-09-20T12:00:00Z" },
  ];

  const resultado = agregar(conclusoes, clientes);

  assert.equal(resultado.total, 5);
  assert.deepEqual(resultado.linhas, [
    { chave: "A", nome: "Cliente A", total: 3, percentual: 60 },
    { chave: "pessoal", nome: "Pessoal", total: 1, percentual: 20 },
    { chave: "sem_cliente", nome: "Sem cliente", total: 1, percentual: 20 },
    { chave: "B", nome: "Cliente B", total: 0, percentual: 0 },
  ]);
});

test("agregar com total 0 -> percentuais 0", () => {
  const clientes = [{ id: "A", nome: "Cliente A" }];
  const resultado = agregar([], clientes);

  assert.equal(resultado.total, 0);
  assert.deepEqual(resultado.linhas, [{ chave: "A", nome: "Cliente A", total: 0, percentual: 0 }]);
});

test("agregar não inclui Pessoal/Sem cliente quando zero", () => {
  const clientes = [{ id: "A", nome: "Cliente A" }];
  const conclusoes: Conclusao[] = [{ cliente_id: "A", pessoal: false, concluida_em: "2026-09-20T12:00:00Z" }];

  const resultado = agregar(conclusoes, clientes);

  assert.equal(resultado.linhas.some((l) => l.chave === "pessoal"), false);
  assert.equal(resultado.linhas.some((l) => l.chave === "sem_cliente"), false);
});

test("dataLocalBrasilia na virada de UTC", () => {
  assert.equal(dataLocalBrasilia("2026-09-24T02:00:00Z"), "2026-09-23");
  assert.equal(dataLocalBrasilia("2026-09-24T03:30:00Z"), "2026-09-24");
});

test("agregar: demanda da própria agência vira linha da agência, não Sem cliente", () => {
  const clientes = [{ id: "A", nome: "Cliente A" }];
  const agencias = [{ id: "effect", label: "Effect" }];
  const conclusoes: Conclusao[] = [
    { cliente_id: null, pessoal: false, agencia_id: "effect", concluida_em: "2026-09-20T12:00:00Z" },
    { cliente_id: null, pessoal: false, agencia_id: "effect", concluida_em: "2026-09-21T12:00:00Z" },
    { cliente_id: null, pessoal: false, agencia_id: "sumida", concluida_em: "2026-09-21T12:00:00Z" },
    { cliente_id: "A", pessoal: false, concluida_em: "2026-09-22T12:00:00Z" },
  ];
  const { total, linhas } = agregar(conclusoes, clientes, agencias);
  assert.equal(total, 4);
  assert.deepEqual(linhas, [
    { chave: "agencia:effect", nome: "Effect (agência)", total: 2, percentual: 50 },
    { chave: "A", nome: "Cliente A", total: 1, percentual: 25 },
    { chave: "agencia:sumida", nome: "sumida (agência)", total: 1, percentual: 25 },
  ]);
});

test("chaveDaConclusao: Pessoal, agência, cliente e Sem cliente", () => {
  assert.equal(chaveDaConclusao({ cliente_id: null, pessoal: true, concluida_em: "" }), "pessoal");
  assert.equal(chaveDaConclusao({ cliente_id: null, pessoal: false, agencia_id: "alt", concluida_em: "" }), "agencia:alt");
  assert.equal(chaveDaConclusao({ cliente_id: "A", pessoal: false, concluida_em: "" }), "A");
  assert.equal(chaveDaConclusao({ cliente_id: null, pessoal: false, concluida_em: "" }), "sem_cliente");
});

test("agregarPorAgencia: demandas da agência + dos clientes dela; Sem agência por último", () => {
  const agenciaDoCliente = new Map([["A", "effect"], ["B", "alt"], ["C", null]]);
  const agencias = [
    { id: "effect", label: "Effect" },
    { id: "alt", label: "Alt" },
    { id: "spike", label: "Spike" },
  ];
  const conclusoes: Conclusao[] = [
    { cliente_id: "A", pessoal: false, concluida_em: "2026-09-20T12:00:00Z" },
    { cliente_id: "A", pessoal: false, concluida_em: "2026-09-20T12:00:00Z" },
    { cliente_id: null, pessoal: false, agencia_id: "effect", concluida_em: "2026-09-20T12:00:00Z" },
    { cliente_id: "B", pessoal: false, concluida_em: "2026-09-20T12:00:00Z" },
    { cliente_id: "C", pessoal: false, concluida_em: "2026-09-20T12:00:00Z" },
    { cliente_id: null, pessoal: true, concluida_em: "2026-09-20T12:00:00Z" },
    { cliente_id: null, pessoal: false, concluida_em: "2026-09-20T12:00:00Z" },
    { cliente_id: null, pessoal: false, agencia_id: "inativa", concluida_em: "2026-09-20T12:00:00Z" },
  ];
  assert.deepEqual(agregarPorAgencia(conclusoes, agenciaDoCliente, agencias), [
    { chave: "effect", nome: "Effect", total: 3, diretas: 1, percentual: 37.5 },
    { chave: "alt", nome: "Alt", total: 1, diretas: 0, percentual: 12.5 },
    { chave: "inativa", nome: "inativa", total: 1, diretas: 1, percentual: 12.5 },
    { chave: "spike", nome: "Spike", total: 0, diretas: 0, percentual: 0 },
    { chave: "sem_agencia", nome: "Sem agência", total: 3, diretas: 0, percentual: 37.5 },
  ]);
});

test("entreguesComAtraso: conta pela data de Brasília, ignora sem entrega, maior atraso primeiro", () => {
  const conclusoes: (Conclusao & { id: string })[] = [
    // 01/10 23h30 em Brasília (02/10 em UTC): entrega 01/10 -> no prazo
    { id: "noPrazo", cliente_id: null, pessoal: false, prazo: "2026-10-01", concluida_em: "2026-10-02T02:30:00Z" },
    // 02/10 10h em Brasília, entrega 01/10 -> 1 dia
    { id: "um", cliente_id: null, pessoal: false, prazo: "2026-10-01", concluida_em: "2026-10-02T13:00:00Z" },
    // 05/10, entrega 28/09 -> 7 dias (atravessa o mês)
    { id: "sete", cliente_id: "A", pessoal: false, prazo: "2026-09-28", concluida_em: "2026-10-05T15:00:00Z" },
    // concluída antes da entrega
    { id: "adiantada", cliente_id: null, pessoal: true, prazo: "2026-10-10", concluida_em: "2026-10-02T15:00:00Z" },
    { id: "semEntrega", cliente_id: null, pessoal: false, prazo: null, concluida_em: "2026-10-02T15:00:00Z" },
  ];
  const r = entreguesComAtraso(conclusoes);
  assert.deepEqual(r.atrasadas.map((c) => [c.id, c.diasAtraso]), [["sete", 7], ["um", 1]]);
  assert.equal(r.percentual, 40);
  assert.equal(r.semEntrega, 1);
  assert.equal(entreguesComAtraso([]).percentual, 0);
});
